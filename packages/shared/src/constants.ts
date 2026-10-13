// ============================================================================
// 数值常量：直接落地《战斗结算公式与数值规则.md》与《外交条约具体数值规则.md》
// 以及 docs/开发计划与实现方案.md §7 补齐的默认值（后续集中在此处调参）
// ============================================================================
import type { Era, Terrain, UnitType } from "./types";

/** 基础战损系数（对等战力下每回合各损约 15%） */
export const BASE_ATTRITION = 0.3;

/** 单位基础数值：满编战力 / 移动力 / 造价 / 维护 / 建造回合 */
export interface UnitSpec {
  name: string;
  baseStrength: number;
  move: number;              // 每回合移动格数（空军 = 0，表示不占陆军移动规则）
  cost: { fund: number; steel: number; oil: number; food: number };
  upkeep: { fund: number; oil: number; food: number };
  buildTurns: number;
  /** 是否必须驻扎机场（空军） */
  requiresAirbase?: boolean;
  /** 是否只能在海域移动（海军） */
  naval?: boolean;
}

export const UNIT_SPECS: Record<UnitType, UnitSpec> = {
  infantry:      { name: "合成陆军军团", baseStrength: 100, move: 1, cost: { fund: 100, steel: 50, oil: 0,  food: 20 }, upkeep: { fund: 5,  oil: 0, food: 3 }, buildTurns: 2 },
  mountain:      { name: "山地特种军团", baseStrength: 110, move: 1, cost: { fund: 120, steel: 50, oil: 0,  food: 20 }, upkeep: { fund: 6,  oil: 0, food: 3 }, buildTurns: 3 },
  armor:         { name: "装甲突击军团", baseStrength: 115, move: 1, cost: { fund: 150, steel: 80, oil: 40, food: 10 }, upkeep: { fund: 8,  oil: 4, food: 3 }, buildTurns: 3 },
  fleet:         { name: "水面主力舰队", baseStrength: 100, move: 2, cost: { fund: 200, steel: 120, oil: 40, food: 0 }, upkeep: { fund: 10, oil: 5, food: 2 }, buildTurns: 4, naval: true },
  submarine:     { name: "潜艇舰队",     baseStrength: 70,  move: 2, cost: { fund: 150, steel: 80, oil: 30, food: 0 }, upkeep: { fund: 8,  oil: 4, food: 0 }, buildTurns: 3, naval: true },
  transport:     { name: "运输舰队",     baseStrength: 20,  move: 2, cost: { fund: 80,  steel: 40, oil: 20, food: 0 }, upkeep: { fund: 4,  oil: 2, food: 0 }, buildTurns: 2, naval: true },
  tactical_air:  { name: "战术航空队",   baseStrength: 80,  move: 0, cost: { fund: 180, steel: 60, oil: 50, food: 0 }, upkeep: { fund: 9,  oil: 6, food: 0 }, buildTurns: 3, requiresAirbase: true },
  strategic_air: { name: "战略航空队",   baseStrength: 60,  move: 0, cost: { fund: 250, steel: 80, oil: 70, food: 0 }, upkeep: { fund: 12, oil: 8, food: 0 }, buildTurns: 5, requiresAirbase: true },
};

/** 空军作战半径（格） */
export const AIR_RANGE: Record<string, number> = { tactical_air: 3, strategic_air: 5 };

/** 地形防御修正（仅守方，见《战斗结算公式》§3.1） */
export const TERRAIN_DEFENSE: Record<Terrain, number> = {
  plain: 1.0, hills: 1.15, mountain: 1.3, forest: 1.2, desert: 0.9, urban: 1.25, coast: 1.0, island: 1.1,
};

/** 要塞防御修正（仅守方） */
export const FORTRESS_DEFENSE: Record<0 | 1 | 2 | 3, number> = { 0: 1.0, 1: 1.2, 2: 1.4, 3: 1.6 };

/** 补给修正（双方） */
export const SUPPLY_MODIFIER = { ok: 1.0, low: 0.7, cut: 0.4 } as const;

/** 制空权修正（双方，陆战） */
export const AIR_SUPREMACY_LAND = { own: 1.2, enemy: 0.8, neutral: 1.0 } as const;

/** 包围修正（仅攻方） */
export const ENCIRCLE_MODIFIER = { one: 1.0, two: 1.15, three: 1.3, four: 1.5 } as const;

/** 将领修正（双方） */
export const GENERAL_MODIFIER = { mediocre: 1.0, excellent: 1.1, legendary: 1.2 } as const;

/** 士气默认值 */
export const MORALE = { initial: 70, min: 0, max: 100 } as const;

/** 时代解锁 / 研发 */
export const ERA_SPECS: Record<Era, { name: string; cost: number; turns: number }> = {
  ww1:     { name: "一战", cost: 500,  turns: 5 },
  ww2:     { name: "二战", cost: 1000, turns: 6 },
  coldwar: { name: "冷战", cost: 2000, turns: 8 },
  modern:  { name: "现代", cost: 4000, turns: 10 },
};

/** 地块基础产出（普通省；核心资源区 ×3；首都资金 +50%） */
export const PROVINCE_BASE_YIELD = { steel: 2, oil: 1, food: 3, fund: 5 } as const;

/** 外交信誉初始值 */
export const REPUTATION_INITIAL = 50;