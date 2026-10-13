// 对局状态创建与索引
import type {
  GameState, MapData, Nation, NationId, Personality, Province, ProvinceId,
  ProvinceRuntime, Unit, UnitId, UnitType,
} from "@terrawar/shared";
import {
  INITIAL_RESOURCES, MORALE, REPUTATION_INITIAL, STATE_VERSION, UNIT_SPECS,
} from "@terrawar/shared";
import { mulberry32 } from "./rng";

/** 地图索引（加速查询） */
export interface MapIndex {
  byId: Record<ProvinceId, Province>;
  ids: ProvinceId[];
}

export function indexMap(map: MapData): MapIndex {
  const byId: Record<ProvinceId, Province> = {};
  for (const p of map.provinces) byId[p.id] = p;
  return { byId, ids: map.provinces.map((p) => p.id) };
}

function makePersonality(rand: () => number): Personality {
  const r = () => 0.2 + rand() * 0.6;
  return {
    aggression: r(), cooperativeness: r(), expansionism: r(),
    riskTolerance: r(), loyalty: r(),
  };
}

export interface CreateGameOptions {
  seed?: number;
  /** 指定玩家国家（默认按 seed 从可玩国家中随机分配） */
  playerNation?: NationId;
}

export function createGame(map: MapData, opts: CreateGameOptions = {}): GameState {
  const seed = opts.seed ?? 20261013;
  const rand = mulberry32(seed);

  const provinces: Record<ProvinceId, ProvinceRuntime> = {};
  for (const p of map.provinces) {
    provinces[p.id] = {
      id: p.id,
      owner: p.ownerAtStart,
      buildings: { road: 0, airbase: 0, port: 0, fortress: 0 },
      resistance: 0,
      disturbedTurns: 0,
    };
  }

  const idx = indexMap(map);
  const playable = map.playable.filter((id) => map.nations[id]);
  if (!playable.length) throw new Error("地图没有可玩国家");

  const playerNation =
    opts.playerNation && playable.includes(opts.playerNation)
      ? opts.playerNation
      : playable[Math.floor(rand() * playable.length)];

  const nations: Record<NationId, Nation> = {};
  for (const id of playable) {
    const own = map.provinces.filter((p) => p.ownerAtStart === id);
    const capital = own.find((p) => p.isCapital) ?? own[0];
    if (!capital) continue;
    const relations: Record<NationId, number> = {};
    for (const other of playable) relations[other] = 0;
    nations[id] = {
      id,
      name: map.nations[id].name,
      color: map.nations[id].color,
      capital: capital.id,
      personality: makePersonality(rand),
      isPlayer: id === playerNation,
      resources: { ...INITIAL_RESOURCES },
      reputation: REPUTATION_INITIAL,
      relations,
      techEra: "ww1",
      alive: true,
    };
  }

  const state: GameState = {
    version: STATE_VERSION,
    seed,
    turn: 1,
    phase: "orders",
    mapId: map.id,
    difficulty: map.difficulty,
    playerNation,
    nations,
    provinces,
    units: {},
    nextUnitSeq: 1,
    log: [],
  };

  // 开局军队：每国 2 个合成陆军军团（首都 + 人口最大省）
  for (const id of Object.keys(nations)) {
    const own = map.provinces.filter((p) => p.ownerAtStart === id);
    const capital = own.find((p) => p.isCapital) ?? own[0];
    const second = own
      .filter((p) => p.id !== capital.id)
      .sort((a, b) => b.population - a.population)[0] ?? capital;
    spawnUnit(state, "infantry", id, capital.id);
    spawnUnit(state, "infantry", id, second.id);

    // 空军：1 支战术航空队驻首都（简化：暂不强制机场）
    spawnUnit(state, "tactical_air", id, capital.id);

    // 海军：找到与该国沿海省份相邻的海区，部署 1 舰队 + 1 运输舰队
    const seaZoneId = own
      .flatMap((p) => p.adjacency)
      .map((pid) => map.provinces.find((x) => x.id === pid))
      .find((p) => p && p.kind === "sea");
    if (seaZoneId) {
      spawnUnit(state, "fleet", id, seaZoneId.id);
      spawnUnit(state, "transport", id, seaZoneId.id);
    }
  }
  void idx;

  pushLog(state, "system", `${nations[playerNation].name} 由你指挥，对局开始（难度 ${map.difficulty} 国）`);
  return state;
}

export function spawnUnit(
  state: GameState, type: UnitType, owner: NationId, province: ProvinceId,
): Unit {
  const spec = UNIT_SPECS[type];
  const id: UnitId = "u" + state.nextUnitSeq++;
  const unit: Unit = {
    id,
    type,
    owner,
    province,
    strength: spec.baseStrength,
    maxStrength: spec.baseStrength,
    morale: MORALE.initial,
    supply: "ok",
    movedThisTurn: 0,
    entrenchedTurns: 0,
  };
  state.units[id] = unit;
  return unit;
}

export function pushLog(state: GameState, kind: GameState["log"][number]["kind"], text: string): void {
  state.log.push({ turn: state.turn, kind, text });
}

export function unitsIn(state: GameState, province: ProvinceId): Unit[] {
  return Object.values(state.units).filter((u) => u.province === province);
}

export function provinceOwner(state: GameState, province: ProvinceId): NationId | null {
  return state.provinces[province]?.owner ?? null;
}