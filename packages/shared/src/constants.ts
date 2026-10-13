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
  near_sea: 1.0, deep_sea: 1.0, strait: 1.25, canal: 1.2,
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
// ----------------------------------------------------------------------------
// 对局初始值与占领 / 经济规则（对应 docs 附录 A）
// ----------------------------------------------------------------------------
import type { Resources } from "./types";

/** 各国开局资源 */
export const INITIAL_RESOURCES: Resources = { steel: 300, oil: 200, food: 300, fund: 500 };

/** 单地块驻军容量（满编军团数） */
export const GARRISON_CAPACITY = 2;

/** 单地块驻军兵力上限（2 个满编合成军团 = 200 战力）；同兵种在驻军上限内自动合并为一支 */
export const LAND_CAPACITY_STRENGTH = 200;

/** 分兵档位（按住 Ctrl 下达命令时） */
export const SPLIT_STEP = 50;

/** 士气修正锚点（取自《战斗结算公式》§3.1，中间值线性插值） */
export const MORALE_ANCHORS: [number, number][] = [[20, 0.5], [40, 0.8], [70, 1.0], [100, 1.1]];

/** 占领后初始抵抗值 = 人口 × 该系数 + 关系惩罚 */
export const RESISTANCE_INITIAL_FACTOR = 0.5;

/** 每回合抵抗衰减 = 驻军总战力 × 该系数 */
export const RESISTANCE_DECAY_FACTOR = 0.2;

/** 抵抗值低于该值视为「正式吞并」 */
export const RESISTANCE_ANNEX_THRESHOLD = 10;

/** 关系值 ≤ 该阈值时，占领额外 +RELATION_HOSTILE_PENALTY 抵抗值 */
export const RELATION_HOSTILE_THRESHOLD = -60;
export const RELATION_HOSTILE_PENALTY = 30;

/** 首都资金产出加成 */
export const CAPITAL_FUND_BONUS = 1.5;

/** 对局状态版本号（存档迁移用） */
export const STATE_VERSION = 1;
/** 战斗胜负士气变化（《战斗结算公式》§4.2） */
export const MORALE_WIN = 10;
export const MORALE_LOSS = 15;
/** 空白未占领区的默认守军兵力（占领需先击败它；战胜后其残部并入攻方） */
export const NEUTRAL_GARRISON_STRENGTH = 50;
// ----------------------------------------------------------------------------
// 海战 / 空军（M4）
// ----------------------------------------------------------------------------
/** 海战修正：海峡守方 ×1.25；远洋攻方 ×1.1；远离本土港口 ×0.8 */
export const SEA_MODIFIERS = { straitDefender: 1.25, openSeaAttacker: 1.1, farFromPort: 0.8 };

/** 制空权修正（海战）：己方 ×1.15 / 敌方 ×0.85 */
export const AIR_SUPREMACY_SEA = { own: 1.15, enemy: 0.85 } as const;

/** 争夺制空权的战力比阈值：领先方需超过对方该倍数才算掌握制空权，否则均势 */
export const AIR_SUPREMACY_RATIO = 1.2;

/** 空军驻地：简化处理，不强制机场（机场建筑在 M6 加入） */
export const AIR_RANGE_BY_TYPE: Record<string, number> = { tactical_air: 3, strategic_air: 5 };

/** 两栖登陆：登陆方首轮 ×0.7；海军舰炮支援 +15%；空军支援 +10%；守方海岸要塞 +30% */
export const AMPHIBIOUS = { landingPenalty: 0.7, navalGunfire: 1.15, airSupport: 1.1, coastalFort: 1.3 };

/** 运输舰队搭载容量 */
export const TRANSPORT_CAPACITY = 1;