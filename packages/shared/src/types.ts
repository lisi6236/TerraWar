// ============================================================================
// TerraWar 核心数据模型（前后端 / 引擎共用）
// 命名约定：实体用 string id；数值单位见 docs/开发计划与实现方案.md §7
// ============================================================================

export type ProvinceId = string;
export type NationId = string;
export type UnitId = string;

/** 地块大类 */
export type ProvinceKind = "land" | "sea" | "strait" | "canal";

/** 陆地块地形（对应《战斗结算公式》地形修正表） */
export type Terrain =
  | "plain"    // 平原
  | "hills"    // 丘陵
  | "mountain" // 山地
  | "forest"   // 森林
  | "desert"   // 沙漠
  | "urban"    // 城市核心区
  | "coast"    // 海岸（过渡）
  | "island"   // 岛礁
  | "near_sea" // 近海
  | "deep_sea" // 远洋
  | "strait"   // 海峡
  | "canal";   // 运河

/** 补给状态 */
export type SupplyState = "ok" | "low" | "cut";

/** 将领等级 */
export type GeneralLevel = "mediocre" | "excellent" | "legendary";

/** 历史时代 */
export type Era = "ww1" | "ww2" | "coldwar" | "modern";

/** 资源 */
export interface Resources {
  steel: number;
  oil: number;
  food: number;
  fund: number;
}

/** 建筑等级（0 = 未建造） */
export interface Buildings {
  road: 0 | 1 | 2 | 3;
  airbase: 0 | 1 | 2 | 3;
  port: 0 | 1 | 2 | 3;
  fortress: 0 | 1 | 2 | 3;
}

/** 地图静态数据：一个地块（省 / 海域） */
export interface Province {
  id: ProvinceId;
  name: string;
  kind: ProvinceKind;
  terrain: Terrain;
  /** 所属国家（地图静态归属，null = 空白未占领区） */
  ownerAtStart: NationId | null;
  /** 地图静态标记（首都 / 核心资源区 / 山口要道） */
  isCapital: boolean;
  isCore: boolean;
  isChoke: boolean;
  /** 每回合基础产出 */
  base: Resources;
  /** 人口基数（影响动员与占领抵抗） */
  population: number;
  /** 守方天然防御加成（来自地形） */
  defenseBonus: number;
  /** 相邻地块 id（由 mapgen 预计算，保证确定性） */
  adjacency: ProvinceId[];
  /** 包含的原始行政区划（Natural Earth admin-1）名称，用于调试 */
  sourceUnits: string[];
}

/** 地块运行时状态（每局变化的部分，与静态地图分离，便于存档与匹配） */
export interface ProvinceRuntime {
  id: ProvinceId;
  owner: NationId | null;
  buildings: Buildings;
  /** 被占领后的抵抗值；< 10 视为正式吞并 */
  resistance: number;
  /** 战略轰炸造成的临时减产剩余回合 */
  disturbedTurns: number;
}

/** AI 个性（0~1），决定外交与扩张行为 */
export interface Personality {
  aggression: number;      // 野心 / 好战（越高越易主动宣战、进攻）
  cooperativeness: number; // 亲善（越高越愿签约、调停）
  expansionism: number;    // 扩张倾向（越高越抢空白区）
  riskTolerance: number;   // 冒险（越高越接受劣势战斗）
  loyalty: number;         // 守约（越高越不撕毁条约）
}

/** 国家 */
export interface Nation {
  id: NationId;
  name: string;
  color: string;
  capital: ProvinceId;
  personality: Personality;
  isPlayer: boolean;
  resources: Resources;
  reputation: number;                     // 外交信誉 0~100
  relations: Record<NationId, number>;    // 关系值 -100~100
  techEra: Era;
  alive: boolean;
}

/** 单位类型（对应《战斗结算公式》基础战力表） */
export type UnitType =
  | "infantry"    // 合成陆军军团
  | "mountain"    // 山地特种军团
  | "armor"       // 装甲突击军团
  | "fleet"       // 水面主力舰队
  | "submarine"   // 潜艇舰队
  | "transport"   // 运输舰队
  | "tactical_air"// 战术航空队
  | "strategic_air"; // 战略航空队

/** 作战单位 */
export interface Unit {
  id: UnitId;
  type: UnitType;
  owner: NationId;
  province: ProvinceId;
  strength: number;      // 当前战力（满编 = 基础战力）
  maxStrength: number;
  morale: number;        // 0~100
  supply: SupplyState;
  general?: { name: string; level: GeneralLevel };
  cargo?: UnitId[];      // 运输舰队搭载的陆军单位（最多 1 个）
  embarkedOn?: UnitId;   // 若本单位正在运输舰上，记录运输舰 id
  movedThisTurn: number;
  entrenchedTurns: number;
}

/** 存档 */
export interface SaveGame {
  version: number;
  seed: number;
  mapId: string;
  mapHash: string;
  turn: number;
  phase: "orders" | "resolve";
  nations: Nation[];
  provinces: ProvinceRuntime[];
  units: Unit[];
  createdAt: string;
  updatedAt: string;
}
// ============================================================================
// 地图静态数据（由 mapgen 产出，交给引擎使用）
// ============================================================================

export interface NationMeta {
  name: string;
  color: string;
}

export interface MapData {
  id: string;
  name: string;
  difficulty: number;
  /** 可玩国家（开局占据省份的国家）；玩家从中随机分配一个 */
  playable: NationId[];
  nations: Record<NationId, NationMeta>;
  provinces: Province[];
}

// ============================================================================
// 对局状态（可序列化，用于存档 / 回放）
// ============================================================================

/** 事件日志 */
export interface LogEntry {
  turn: number;
  kind: "move" | "block" | "occupy" | "annex" | "economy" | "battle" | "merge" | "supply" | "air" | "system";
  text: string;
}

/** 玩家指令（每回合提交，一次性结算） */
export type Order = {
  type: "move";
  unitId: UnitId;
  to: ProvinceId;
  /** 派遣兵力（50 的整数倍）。省略或等于当前兵力时表示整建制移动 */
  strength?: number;
};

export type GamePhase = "orders" | "resolve" | "gameover";

export interface GameState {
  version: number;
  seed: number;
  turn: number;
  phase: GamePhase;
  mapId: string;
  difficulty: number;
  /** 玩家所控制的国家（随机分配） */
  playerNation: NationId;
  nations: Record<NationId, Nation>;
  provinces: Record<ProvinceId, ProvinceRuntime>;
  units: Record<UnitId, Unit>;
  nextUnitSeq: number;
  log: LogEntry[];
}