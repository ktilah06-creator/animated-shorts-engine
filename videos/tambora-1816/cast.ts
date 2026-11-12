// Draft cast for "The Year Without a Summer" (1816 rural New England / Europe). Drafts until approved; approved
// designs move to the asset library as character/<name>@1 and are imported from there.
import type { Design } from "@engine/chars/toon";

export const FARMER_WOMAN: Design = {
  id: "farmer-woman", skin: "#f1c6a2", hair: { color: "#7a4a2c", style: "bun" },
  hat: { kind: "bonnet", color: "#efe2c4", band: "#b0583a" },
  top: { kind: "dress", color: "#5f82a6", collar: "#f4ead6" }, shawl: "#b0583a", apron: "#f1e6cc",
  bottom: { kind: "skirt", color: "#5f82a6" }, boots: "#4a3428", stockings: "#4a3a36", eyes: "#3b2a26",
};
export const FARMER_MAN: Design = {
  id: "farmer-man", skin: "#d9a47e", hair: { color: "#3e2a20", style: "short" }, beard: "#4a3226",
  hat: { kind: "brim", color: "#6a4b35", band: "#3a2a22" },
  top: { kind: "shirt", color: "#efe4cf", collar: "#efe4cf" }, vest: "#3f6a52",
  bottom: { kind: "trousers", color: "#7a5a43" }, boots: "#3a2a22", build: 1.12,
};
export const CHILD: Design = {
  id: "child", skin: "#f3cfae", hair: { color: "#c98a3c", style: "short" },
  hat: { kind: "cap", color: "#a8483a" },
  top: { kind: "shirt", color: "#d9a441", collar: "#f4ead6" },
  bottom: { kind: "trousers", color: "#4f6a8a" }, boots: "#4a3428", scale: 0.68,
};
