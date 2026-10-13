import type { Terrain } from "@terrawar/shared";

/** 空白未占领区的地形色调（与 mapgen 保持一致） */
export const TERRAIN_TONE: Record<Terrain, string> = {
  plain: "#cdc7b6",
  hills: "#bcb29c",
  mountain: "#a89c8b",
  forest: "#a3b197",
  urban: "#b6ada0",
  desert: "#cfbc92",
  coast: "#cdc7b6",
  island: "#cdc7b6",
  near_sea: "#1f4257",
  deep_sea: "#1b3b4f",
  strait: "#2a5b7a",
  canal: "#2a5b7a",
};

export const NEUTRAL_FALLBACK = "#cdc7b6";