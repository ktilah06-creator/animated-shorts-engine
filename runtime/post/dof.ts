// Half-resolution thin-lens depth of field (engine-owned; same CoC model and occlusion rules as post/lensblur.ts,
// which stays available as the full-resolution reference). Cost ~1/4 of the full-res gather, which matters on CPU
// WebGL (SwiftShader): full-res 112 taps took ~4.4 s per 1080x1920 frame.
//   1. prep  (half res): colour (bilinear 2x2 average) + view distance in alpha
//   2. blur  (half res): Vogel-disc gather; a sample counts only if its own CoC reaches this pixel, a farther sample
//            never spreads wider than this pixel's CoC (no background halos over sharp subjects); plus a near-field
//            gather so blurred foreground spreads over sharper pixels behind it. Output: colour + near coverage.
//   3. comp  (full res): sharp input where the CoC is under ~1 px, the blurred half-res result elsewhere, and the
//            near-field coverage on top. In-focus subjects keep full-resolution detail and ink lines.
// CoC radius (px at 1080x1920) = cInf * |1 - focus / depth| (x nearScale in front of focus), clamped to maxCoC,
// scaled by output height / 1920. Fixed sample pattern: no noise, no flicker, deterministic.
import * as THREE from "three";
import { Pass } from "postprocessing";

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }`;

const COMMON = /* glsl */ `
#include <packing>
uniform float focus; uniform float focusFar; uniform float cInf; uniform float nearScale; uniform float maxCoC; uniform float pxs;
uniform float cNear; uniform float cFar;
float cocAt(float d) {                       // signed CoC radius in OUTPUT px
  float fd = clamp(d, focus, max(focus, focusFar));   // inside [focus, focusFar] nothing blurs
  float c = cInf * pxs * (1.0 - fd / max(d, 1e-3));
  if (c < 0.0) c *= nearScale;
  return clamp(c, -maxCoC * pxs, maxCoC * pxs);
}
float distFrom(sampler2D t, vec2 uv) { return -perspectiveDepthToViewZ(texture2D(t, uv).x, cNear, cFar); }
#define GOLDEN 2.39996323
`;

const PREP = COMMON + /* glsl */ `
uniform sampler2D inputBuffer; uniform sampler2D tDepth; uniform vec2 fullTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(inputBuffer, vUv).rgb;    // bilinear at the half-res pixel centre = 2x2 average
  float d = min(min(distFrom(tDepth, vUv + vec2(-0.5, -0.5) * fullTexel), distFrom(tDepth, vUv + vec2(0.5, -0.5) * fullTexel)),
                min(distFrom(tDepth, vUv + vec2(-0.5, 0.5) * fullTexel), distFrom(tDepth, vUv + vec2(0.5, 0.5) * fullTexel)));
  gl_FragColor = vec4(c, d);
}`;

const BLUR = COMMON + /* glsl */ `
uniform sampler2D tPrep; uniform vec2 texel;   // half-res texel
varying vec2 vUv;
void main() {
  vec4 p0 = texture2D(tPrep, vUv);
  float d0 = p0.a;
  float R = abs(cocAt(d0)) * 0.5;               // half-res px
  vec3 acc = p0.rgb; float wsum = 1.0;
  if (R > 0.35) {
    for (int i = 0; i < TAPS; i++) {
      float rr = sqrt((float(i) + 0.5) / float(TAPS)) * R;
      float a = float(i) * GOLDEN;
      vec4 s = texture2D(tPrep, vUv + vec2(cos(a), sin(a)) * rr * texel);
      float rs = abs(cocAt(s.a)) * 0.5;
      if (s.a > d0) rs = min(rs, R);
      float w = clamp(rs - rr + 0.5, 0.0, 1.0);
      acc += s.rgb * w; wsum += w;
    }
  }
  vec3 col = acc / wsum;
  float M = maxCoC * pxs * 0.5;
  vec3 fg = vec3(0.0); float fw = 0.0, cov = 0.0;
  for (int i = 0; i < NEAR_TAPS; i++) {
    float rr = sqrt((float(i) + 0.5) / float(NEAR_TAPS)) * M;
    if (rr <= R) continue;
    float a = float(i) * GOLDEN + 1.0;
    vec4 s = texture2D(tPrep, vUv + vec2(cos(a), sin(a)) * rr * texel);
    if (s.a >= d0 * 0.97) continue;
    float rs = abs(cocAt(s.a)) * 0.5;
    float w = clamp(rs - rr + 0.5, 0.0, 1.0);
    fg += s.rgb * w; fw += w;
    cov += w * (M * M) / max(rs * rs, 1.0);
  }
  float k = 0.0;
  if (fw > 0.0) { k = clamp(cov / float(NEAR_TAPS), 0.0, 1.0); col = mix(col, fg / fw, k); }
  gl_FragColor = vec4(col, k);
}`;

const COMP = COMMON + /* glsl */ `
uniform sampler2D inputBuffer; uniform sampler2D tDepth; uniform sampler2D tBlur;
varying vec2 vUv;
void main() {
  vec4 sharp = texture2D(inputBuffer, vUv);
  vec4 b = texture2D(tBlur, vUv);
  float r = abs(cocAt(distFrom(tDepth, vUv)));
  float k = max(smoothstep(0.6, 1.8, r), b.a);
  gl_FragColor = vec4(mix(sharp.rgb, b.rgb, k), sharp.a);
}`;

export class HalfResDof extends Pass {
  private prepMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private prepRT: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  private uni: Record<string, THREE.IUniform>;
  private cam: THREE.PerspectiveCamera;

  constructor(cam: THREE.PerspectiveCamera, { maxCoC = 24, nearScale = 1.2, taps = 64, nearTaps = 32 } = {}) {
    super("HalfResDof");
    this.cam = cam;
    this.needsDepthTexture = true;
    this.needsSwap = true;
    this.uni = { focus: { value: 10 }, focusFar: { value: 0 }, cInf: { value: 0 }, nearScale: { value: nearScale }, maxCoC: { value: maxCoC }, pxs: { value: 1 },
      cNear: { value: cam.near }, cFar: { value: cam.far } };
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
    this.prepRT = rt(); this.blurRT = rt();
    this.prepRT.texture.minFilter = THREE.NearestFilter; this.prepRT.texture.magFilter = THREE.NearestFilter; // depth in alpha: no blending of depths
    const mat = (fs: string, extra: Record<string, THREE.IUniform>, defines: Record<string, string> = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: fs, uniforms: { ...this.uni, ...extra }, defines, depthTest: false, depthWrite: false });
    this.prepMat = mat(PREP, { inputBuffer: { value: null }, tDepth: { value: null }, fullTexel: { value: new THREE.Vector2() } });
    this.blurMat = mat(BLUR, { tPrep: { value: this.prepRT.texture }, texel: { value: new THREE.Vector2() } }, { TAPS: String(taps), NEAR_TAPS: String(nearTaps) });
    this.compMat = mat(COMP, { inputBuffer: { value: null }, tDepth: { value: null }, tBlur: { value: this.blurRT.texture } });
    this.fullscreenMaterial = this.prepMat;
  }

  set focus(v: number) { this.uni.focus.value = v; }
  /** far end of the in-focus range (0 = single focus plane) */
  set focusFar(v: number) { this.uni.focusFar.value = v; }
  set cInf(v: number) { this.uni.cInf.value = v; }

  override setDepthTexture(t: THREE.Texture) { this.prepMat.uniforms.tDepth.value = t; this.compMat.uniforms.tDepth.value = t; }

  override setSize(w: number, h: number) {
    const hw = Math.max(1, Math.ceil(w / 2)), hh = Math.max(1, Math.ceil(h / 2));
    this.prepRT.setSize(hw, hh); this.blurRT.setSize(hw, hh);
    (this.prepMat.uniforms.fullTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    (this.blurMat.uniforms.texel.value as THREE.Vector2).set(1 / hw, 1 / hh);
    this.uni.pxs.value = h / 1920;
  }

  override render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, outputBuffer: THREE.WebGLRenderTarget) {
    this.uni.cNear.value = this.cam.near; this.uni.cFar.value = this.cam.far;
    this.prepMat.uniforms.inputBuffer.value = inputBuffer.texture;
    this.compMat.uniforms.inputBuffer.value = inputBuffer.texture;
    this.fullscreenMaterial = this.prepMat;
    renderer.setRenderTarget(this.prepRT); renderer.render(this.scene, this.camera);
    this.fullscreenMaterial = this.blurMat;
    renderer.setRenderTarget(this.blurRT); renderer.render(this.scene, this.camera);
    this.fullscreenMaterial = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer); renderer.render(this.scene, this.camera);
  }

  override dispose() { super.dispose(); this.prepRT.dispose(); this.blurRT.dispose(); this.prepMat.dispose(); this.blurMat.dispose(); this.compMat.dispose(); }
}
