// 移动 / 分兵 / 进攻 / 登船与两栖登陆 / 空军转场 / 冲突裁决
import type { GameState, Order, ProvinceId, Unit } from "@terrawar/shared";
import {
  AIR_RANGE_BY_TYPE, LAND_CAPACITY_STRENGTH, MORALE, MORALE_LOSS, MORALE_WIN,
  NEUTRAL_GARRISON_STRENGTH, SPLIT_STEP, TRANSPORT_CAPACITY, UNIT_SPECS,
} from "@terrawar/shared";
import { pushLog, spawnUnit, unitsIn, type MapIndex } from "./state";
import { resolveBattle, resolveBattleVsGarrison, type BattleResult } from "./combat";
import { rangeOf, type AirReport } from "./air";

export function unitLabel(state: GameState, u: Unit): string {
  const nation = state.nations[u.owner]?.name ?? u.owner;
  const spec = UNIT_SPECS[u.type];
  return `${nation}${spec.name}(${u.id})`;
}

function clampMorale(v: number): number {
  return Math.max(MORALE.min, Math.min(MORALE.max, v));
}
function removeUnit(state: GameState, u: Unit): void {
  for (const u2 of Object.values(state.units)) {
    if (u2.cargo) u2.cargo = u2.cargo.filter((id) => id !== u.id);
  }
  delete state.units[u.id];
}
/** 在场单位（排除已登船的单位） */
export function activeUnitsIn(state: GameState, province: ProvinceId): Unit[] {
  return unitsIn(state, province).filter((u) => !u.embarkedOn);
}
function strengthUnits(units: Unit[], owner: string): number {
  return units.filter((u) => u.owner === owner).reduce((s, u) => s + u.strength, 0);
}
/** 陆地驻军兵力（不含空军/海军/已登船单位） */
function landStrength(units: Unit[], owner: string): number {
  return units.filter((u) => u.owner === owner && !isNaval(u) && !isAir(u)).reduce((s, u) => s + u.strength, 0);
}
function isNaval(u: Unit): boolean {
  return !!UNIT_SPECS[u.type]?.naval;
}
function isAir(u: Unit): boolean {
  return !!UNIT_SPECS[u.type]?.requiresAirbase;
}
function freeTransportIn(state: GameState, zone: ProvinceId, owner: string): Unit | null {
  return activeUnitsIn(state, zone).find(
    (u) => u.owner === owner && u.type === "transport" && (u.cargo?.length ?? 0) < TRANSPORT_CAPACITY,
  ) ?? null;
}

/** 远离本土港口：3 步海区内没有己方控制的沿海陆地省 */
function farFromPort(state: GameState, map: MapIndex, u: Unit): boolean {
  if (!isNaval(u)) return false;
  const near = rangeOf(map, u.province, 3);
  return !near.some((pid) =>
    map.byId[pid]?.kind === "sea" &&
    (map.byId[pid]?.adjacency ?? []).some(
      (nb) => map.byId[nb]?.kind === "land" && state.provinces[nb]?.owner === u.owner,
    ));
}

function landTargets(state: GameState, map: MapIndex, u: Unit): ProvinceId[] {
  const from = map.byId[u.province];
  const out: ProvinceId[] = [];
  for (const to of from.adjacency) {
    const target = map.byId[to];
    if (!target) continue;
    if (target.kind === "sea") {
      if (freeTransportIn(state, to, u.owner)) out.push(to);   // 登船
      continue;
    }
    const here = activeUnitsIn(state, to);
    const owner = state.provinces[to]?.owner ?? null;
    if (here.some((x) => x.owner !== u.owner) || (owner === null && here.length === 0)) { out.push(to); continue; }
    if (landStrength(here, u.owner) >= LAND_CAPACITY_STRENGTH) continue;
    out.push(to);
  }
  return out;
}

function navalTargets(state: GameState, map: MapIndex, u: Unit): ProvinceId[] {
  const start = map.byId[u.province];
  if (!start || start.kind !== "sea") return [];
  const out = new Set<ProvinceId>();
  const frontier: ProvinceId[] = [];
  for (const nb of start.adjacency) if (map.byId[nb]?.kind === "sea") { out.add(nb); frontier.push(nb); }
  for (const mid of frontier) {
    if (activeUnitsIn(state, mid).some((x) => x.owner !== u.owner)) continue;   // 不能借道敌舰所在海区
    for (const nb of map.byId[mid]?.adjacency ?? []) if (map.byId[nb]?.kind === "sea") out.add(nb);
  }
  if (u.type === "transport" && (u.cargo?.length ?? 0) > 0) {
    for (const nb of start.adjacency) if (map.byId[nb]?.kind === "land") out.add(nb);   // 登陆
  }
  out.delete(u.province);
  return [...out];
}

function airRebaseTargets(state: GameState, map: MapIndex, u: Unit): ProvinceId[] {
  const range = AIR_RANGE_BY_TYPE[u.type] ?? 0;
  return rangeOf(map, u.province, range).filter(
    (pid) => pid !== u.province && map.byId[pid]?.kind === "land" && state.provinces[pid]?.owner === u.owner,
  );
}

/** 可移动 / 可进攻的目标地块 */
export function reachableProvinces(state: GameState, map: MapIndex, unitId: string): ProvinceId[] {
  const u = state.units[unitId];
  if (!u || u.strength <= 0 || u.embarkedOn) return [];
  if (isAir(u)) return airRebaseTargets(state, map, u);
  if (isNaval(u)) return navalTargets(state, map, u);
  return landTargets(state, map, u);
}

export function canOrderMove(state: GameState, map: MapIndex, unitId: string, to: ProvinceId): boolean {
  return reachableProvinces(state, map, unitId).includes(to);
}

export interface ResolveContext {
  air: AirReport;
}

export function resolveMovements(state: GameState, map: MapIndex, orders: Order[], ctx: ResolveContext): void {
  const moves = orders.filter((o) => o.type === "move").slice().sort((a, b) => (a.unitId < b.unitId ? -1 : 1));
  const airOwnerAt = (pid: ProvinceId) => ctx.air.superiority.get(pid) ?? null;

  const landPlans: { unit: Unit; from: ProvinceId; to: ProvinceId }[] = [];

  for (const o of moves) {
    const src = state.units[o.unitId];
    if (!src || src.strength <= 0 || src.embarkedOn) continue;
    if (o.to === src.province) continue;
    const from = map.byId[src.province];
    const target = map.byId[o.to];
    if (!from || !target) continue;
    if (!reachableProvinces(state, map, src.id).includes(o.to)) {
      pushLog(state, "block", `${unitLabel(state, src)} 无法移动到 ${target.name}`);
      continue;
    }

    // 空军：转场
    if (isAir(src)) {
      src.province = o.to;
      pushLog(state, "air", `${unitLabel(state, src)} 转场至 ${target.name}`);
      continue;
    }

    // 海军：移动 / 海战 / 登陆
    if (isNaval(src)) {
      if (target.kind === "land") {
        resolveLanding(state, map, src, target.id, airOwnerAt);
        continue;
      }
      const hostiles = activeUnitsIn(state, o.to).filter((x) => x.owner !== src.owner);
      if (!hostiles.length) {
        src.province = o.to;
        pushLog(state, "move", `${unitLabel(state, src)} 航至 ${target.name}`);
        continue;
      }
      const defender = hostiles.slice().sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1))[0];
      const r = resolveBattle(state, target, src, defender, { airOwner: airOwnerAt(o.to), farFromPort: farFromPort(state, map, src) });
      src.strength = Math.round(r.attackerRemaining);
      defender.strength = Math.round(r.defenderRemaining);
      pushLog(state, "battle",
        `${unitLabel(state, src)} 在 ${target.name} 与 ${unitLabel(state, defender)} 交战：战力 ${Math.round(r.attackerPower)} vs ${Math.round(r.defenderPower)}，战后 ${src.strength} : ${defender.strength}`);
      if (defender.strength <= 0) removeUnit(state, defender);
      if (src.strength <= 0) { removeUnit(state, src); continue; }
      if (r.attackerWins) {
        let absorbed = 0;
        for (const h of hostiles) {
          const cur = state.units[h.id];
          if (!cur) continue;
          absorbed += Math.max(0, Math.round(cur.strength));
          if (cur.type === "transport" && cur.cargo) for (const cid of cur.cargo) { const c = state.units[cid]; if (c) removeUnit(state, c); }
          removeUnit(state, cur);
        }
        src.strength += absorbed;
        src.morale = clampMorale(src.morale + MORALE_WIN);
        src.province = o.to;
        pushLog(state, "battle", `${unitLabel(state, src)} 取得制海权，收编残部 ${absorbed}，现员 ${src.strength}`);
        pushLog(state, "occupy", `${unitLabel(state, src)} 控制 ${target.name}`);
      } else {
        src.morale = clampMorale(src.morale - MORALE_LOSS);
        pushLog(state, "block", `${unitLabel(state, src)} 海战失利，留在 ${map.byId[src.province].name}`);
      }
      continue;
    }

    // 陆军：登船
    if (target.kind === "sea") {
      const transport = freeTransportIn(state, o.to, src.owner);
      if (!transport) { pushLog(state, "block", `${unitLabel(state, src)} 无法登船：${target.name} 没有可用的运输舰队`); continue; }
      src.province = o.to;
      src.embarkedOn = transport.id;
      transport.cargo = [...(transport.cargo ?? []), src.id];
      pushLog(state, "move", `${unitLabel(state, src)} 登上运输舰队 ${transport.id}（${target.name}）`);
      continue;
    }

    // 陆军：陆地移动 / 进攻（含分兵）
    let mover = src;
    const want = o.strength ?? src.strength;
    if (want > 0 && want < src.strength) {
      const raw = Math.round(want / SPLIT_STEP) * SPLIT_STEP;
      const send = Math.max(SPLIT_STEP, Math.min(raw, src.strength - SPLIT_STEP));
      if (send > 0 && send < src.strength) {
        src.strength -= send;
        mover = spawnUnit(state, src.type, src.owner, src.province);
        mover.strength = send;
        mover.morale = src.morale;
        mover.supply = src.supply;
        if (src.general) mover.general = { ...src.general };
        pushLog(state, "move", `${unitLabel(state, src)} 分出 ${send} 兵力出击`);
      }
    }
    landPlans.push({ unit: mover, from: src.province, to: o.to });
  }

  // 陆军分批处理：按目标分组，战力降序 + id 升序
  const moving = new Set(landPlans.map((p) => p.unit.id));
  const groups = new Map<ProvinceId, typeof landPlans>();
  for (const p of landPlans) {
    const arr = groups.get(p.to) ?? [];
    arr.push(p);
    groups.set(p.to, arr);
  }

  for (const [to, list] of groups) {
    const province = map.byId[to];
    list.sort((a, b) => b.unit.strength - a.unit.strength || (a.unit.id < b.unit.id ? -1 : 1));

    for (const p of list) {
      if (!state.units[p.unit.id] || p.unit.strength <= 0) continue;
      moving.delete(p.unit.id);

      const here = unitsIn(state, to).filter((u) => !u.embarkedOn && !moving.has(u.id));
      const hostile = here.filter((u) => u.owner !== p.unit.owner);
      const owner = state.provinces[to]?.owner ?? null;
      const garrison = owner === null && hostile.length === 0 ? NEUTRAL_GARRISON_STRENGTH : 0;
      const airOwner = airOwnerAt(to);

      if (!hostile.length && garrison === 0) {
        if (landStrength(here, p.unit.owner) + p.unit.strength > LAND_CAPACITY_STRENGTH) {
          pushLog(state, "block", `${unitLabel(state, p.unit)} 无法进入 ${province.name}：驻军已达上限 ${LAND_CAPACITY_STRENGTH}`);
          continue;
        }
        p.unit.province = to;
        pushLog(state, "move", `${unitLabel(state, p.unit)} 从 ${map.byId[p.from].name} 进入 ${province.name}`);
        continue;
      }

      let r: BattleResult;
      let defenderDesc: string;
      let primaryDefender: Unit | null = null;
      if (hostile.length) {
        primaryDefender = hostile.slice().sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1))[0];
        r = resolveBattle(state, province, p.unit, primaryDefender, { airOwner });
        defenderDesc = unitLabel(state, primaryDefender);
      } else {
        r = resolveBattleVsGarrison(state, province, p.unit, garrison, { airOwner });
        defenderDesc = `${province.name} 空白区守军(${garrison})`;
      }
      p.unit.strength = Math.round(r.attackerRemaining);
      pushLog(state, "battle",
        `${unitLabel(state, p.unit)} 进攻 ${province.name}：攻方战力 ${Math.round(r.attackerPower)} vs 守方 ${Math.round(r.defenderPower)}，损失 ${Math.round(r.attackerLoss)} / ${Math.round(r.defenderLoss)}，战后兵力 ${p.unit.strength} : ${Math.round(r.defenderRemaining)}${airOwner ? "（制空权：" + (state.nations[airOwner]?.name ?? airOwner) + "）" : ""}`);

      if (primaryDefender) {
        primaryDefender.strength = Math.round(r.defenderRemaining);
        if (primaryDefender.strength <= 0) removeUnit(state, primaryDefender);
      }
      if (p.unit.strength <= 0) { removeUnit(state, p.unit); }

      if (r.attackerWins && p.unit.strength > 0) {
        let absorbed = Math.round(r.defenderRemaining);
        if (hostile.length) {
          absorbed = 0;
          for (const h of hostile) {
            const cur = state.units[h.id];
            if (!cur) continue;
            absorbed += Math.max(0, Math.round(cur.strength));
            removeUnit(state, cur);
          }
        }
        p.unit.strength += absorbed;
        p.unit.morale = clampMorale(p.unit.morale + MORALE_WIN);
        p.unit.province = to;
        pushLog(state, "battle", `${unitLabel(state, p.unit)} 击败 ${defenderDesc}，收编残部 ${absorbed} 兵力，现员 ${p.unit.strength}`);
        pushLog(state, "occupy", `${unitLabel(state, p.unit)} 攻占 ${province.name}`);
      } else if (p.unit.strength > 0) {
        p.unit.morale = clampMorale(p.unit.morale - MORALE_LOSS);
        pushLog(state, "block", `${unitLabel(state, p.unit)} 进攻 ${province.name} 失利，退回 ${map.byId[p.from].name}`);
      } else {
        pushLog(state, "battle", `${unitLabel(state, p.unit)} 全军覆没`);
      }
    }
  }
}

/** 两栖登陆：运输舰队放下搭载的陆军，登陆相邻沿海地块 */
function resolveLanding(
  state: GameState, map: MapIndex, transport: Unit, to: ProvinceId, airOwnerAt: (pid: ProvinceId) => string | null,
): void {
  const cargoId = transport.cargo?.[0];
  const cargo = cargoId ? state.units[cargoId] : null;
  const province = map.byId[to];
  if (!cargo) { pushLog(state, "block", `${unitLabel(state, transport)} 未搭载陆军，无法登陆`); return; }

  const here = activeUnitsIn(state, to);
  const hostile = here.filter((u) => u.owner !== cargo.owner);
  const owner = state.provinces[to]?.owner ?? null;
  const garrison = owner === null && hostile.length === 0 ? NEUTRAL_GARRISON_STRENGTH : 0;
  const airOwner = airOwnerAt(to);
  const navalGunfire = activeUnitsIn(state, transport.province).some((x) => x.owner === cargo.owner && x.type === "fleet");

  if (!hostile.length && garrison === 0) {
    cargo.province = to;
    cargo.embarkedOn = undefined;
    transport.cargo = [];
    pushLog(state, "move", `${unitLabel(state, cargo)} 从运输舰队 ${transport.id} 登陆 ${province.name}`);
    return;
  }

  const ctx = { airOwner, amphibious: true, navalGunfire, airSupport: airOwner === cargo.owner };
  let r: BattleResult;
  let desc: string;
  let primary: Unit | null = null;
  if (hostile.length) {
    primary = hostile.slice().sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1))[0];
    r = resolveBattle(state, province, cargo, primary, ctx);
    desc = unitLabel(state, primary);
  } else {
    r = resolveBattleVsGarrison(state, province, cargo, garrison, ctx);
    desc = `${province.name} 空白区守军(${garrison})`;
  }
  cargo.strength = Math.round(r.attackerRemaining);
  pushLog(state, "battle",
    `${unitLabel(state, cargo)} 两栖登陆 ${province.name}：战力 ${Math.round(r.attackerPower)} vs ${Math.round(r.defenderPower)}，战后 ${cargo.strength} : ${Math.round(r.defenderRemaining)}`);
  if (primary) {
    primary.strength = Math.round(r.defenderRemaining);
    if (primary.strength <= 0) removeUnit(state, primary);
  }
  if (cargo.strength <= 0) {
    pushLog(state, "battle", `${unitLabel(state, cargo)} 登陆失败，全军覆没`);
    removeUnit(state, cargo);
    transport.cargo = [];
    return;
  }
  if (r.attackerWins) {
    let absorbed = Math.round(r.defenderRemaining);
    if (hostile.length) {
      absorbed = 0;
      for (const h of hostile) {
        const cur = state.units[h.id];
        if (!cur) continue;
        absorbed += Math.max(0, Math.round(cur.strength));
        removeUnit(state, cur);
      }
    }
    cargo.strength += absorbed;
    cargo.morale = clampMorale(cargo.morale + MORALE_WIN);
    cargo.province = to;
    cargo.embarkedOn = undefined;
    transport.cargo = [];
    pushLog(state, "occupy", `${unitLabel(state, cargo)} 登陆成功，攻占 ${province.name}`);
  } else {
    cargo.morale = clampMorale(cargo.morale - MORALE_LOSS);
    pushLog(state, "block", `${unitLabel(state, cargo)} 登陆被击退，退回运输舰队`);
  }
}
