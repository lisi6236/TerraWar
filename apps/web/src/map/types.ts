export interface MapMeta {
  id: string;
  name: string;
  difficulty: number;
  provinceCount: number;
  playable: string[];
  nations: Record<string, { name: string; color: string }>;
  file: string;
}

export interface ProvinceProps {
  id: string;
  name: string;
  kind: string;
  terrain: string;
  ownerAtStart: string | null;
  isCapital: boolean;
  isCore: boolean;
  isChoke: boolean;
  population: number;
  sourceUnits: string[];
  color: string;
  adjacency: string[];
  defenseBonus: number;
  base: { steel: number; oil: number; food: number; fund: number };
}

export const TERRAIN_LABEL: Record<string, string> = {
  plain: "平原",
  hills: "丘陵",
  mountain: "山地",
  forest: "森林",
  desert: "沙漠",
  urban: "城市核心区",
  coast: "海岸",
  island: "岛礁",
};