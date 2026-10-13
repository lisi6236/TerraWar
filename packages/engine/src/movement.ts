// 移动、分兵、进攻、合兵前处理与冲突裁决
// 规则见 docs/开发计划与实现方案.md 附录 A / B
import type { GameState, Order, ProvinceId, Unit } from "@terrawar/shared";
import {
  LAND_CAPACITY_STRENGTH, MORALE, MORALE_LOSS, MORALE_WIN,
  NEUTRAL_GARRISON_STRENGTH, SPLIT_STEP,
} from "@terrawar/shared";
import { pushLog, spawnUnit, unitsIn, type MapIndex } from "./state";
import { resolveBattle, resolveBattleVsGarrison, type BattleResult } from "./combat";

export function unitLabel(state: GameState, u: Unit): string {
  const nation = state.nations[u.owner]?.name ?? u.owner;
  return `${nation}部队(${u.id})`;
}

function clampMorale(v: number): number {
  return Math.max(MORALE.min, Math.min(MORALE.max, v));
}

function removeUnit(state: GameState, u: Unit): void {
  delete state.units[u.id];
}

/** 当前真正驻守在该地块的单位（排除尚未抵达的移动单位） */
function occupantsOf(state: GameState, province: ProvinceId, moving: Set<string>): Unit[] {
  return unitsIn(state, province).filter((u) => !moving.has(u.id));
}

function strengthUnits(units: Unit[], owner: string): number {
  return units.filter((u) => u.owner === owner).reduce((s, u) => s + u.strength, 0);
}

/** 可移动 / 可进攻的地块：相邻 + 陆地；敌占与空白区守军均可进攻 */
export function reachableProvinces(state: GameState, map: MapIndex, unitId: string): ProvinceId[] {
  const u = state.units[unitId];
  if (!u || u.strength <= 0) return [];
  const from = map.byId[u.province];
  if (!from) return [];
  const out: ProvinceId[] = [];
  for (const to of from.adjacency) {
    const target = map.byId[to];
    if (!target || target.kind !== "land") continue;
    const here = unitsIn(state, to);
    const owner = state.provinces[to]?.owner ?? null;
    const defended = here.some((x) => x.owner !== u.owner) || (owner === null && here.length === 0);
    if (defended) { out.push(to); continue; }                               // 需战斗
    if (strengthUnits(here, u.owner) >= LAND_CAPACITY_STRENGTH) continue;    // 己方驻军已满
    out.push(to);
  }
  return out;
}

export function canOrderMove(state: GameState, map: MapIndex, unitId: string, to: ProvinceId): boolean {
  return reachableProvinces(state, map, unitId).includes(to);
}

export function resolveMovements(state: GameState, map: MapIndex, orders: Order[]): void {
  const moves = orders
    .filter((o) => o.type === "move")
    .slice()
    .sort((a, b) => (a.unitId < b.unitId ? -1 : 1));

  const plans: { unit: Unit; from: ProvinceId; to: ProvinceId }[] = [];

  // 1) 展开指令（含按住 Ctrl 的分兵）
  for (const o of moves) {
    const src = state.units[o.unitId];
    if (!src || src.strength <= 0) continue;
    if (o.to === src.province) continue;
    const from = map.byId[src.province];
    const target = map.byId[o.to];
    if (!from || !target) continue;
    if (!from.adjacency.includes(o.to)) {
      pushLog(state, "block", `${unitLabel(state, src)} 无法移动到不相邻的地块`);
      continue;
    }
    if (target.kind !== "land") {
      pushLog(state, "block", `${unitLabel(state, src)} 是陆军，无法进入海域（跨海需海军运输，M4 开放）`);
      continue;
    }

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
    plans.push({ unit: mover, from: src.province, to: o.to });
  }

  // 2) 按目标地块分组，逐批处理（战力降序 + id 升序，保证确定性）
  const moving = new Set(plans.map((p) => p.unit.id));
  const groups = new Map<ProvinceId, typeof plans>();
  for (const p of plans) {
    const arr = groups.get(p.to) ?? [];
    arr.push(p);
    groups.set(p.to, arr);
  }

  for (const [to, list] of groups) {
    const province = map.byId[to];
    list.sort((a, b) => b.unit.strength - a.unit.strength || (a.unit.id < b.unit.id ? -1 : 1));

    for (const p of list) {
      if (!state.units[p.unit.id] || p.unit.strength <= 0) continue;
      moving.delete(p.unit.id);   // 该单位已抵达处理点：此后算作地块驻军

      const here = occupantsOf(state, to, moving);
      const hostile = here.filter((u) => u.owner !== p.unit.owner);
      const owner = state.provinces[to]?.owner ?? null;
      const garrison = owner === null && hostile.length === 0 ? NEUTRAL_GARRISON_STRENGTH : 0;

      // 2.1 无任何守军 -> 直接进入
      if (!hostile.length && garrison === 0) {
        if (strengthUnits(here, p.unit.owner) + p.unit.strength > LAND_CAPACITY_STRENGTH) {
          pushLog(state, "block", `${unitLabel(state, p.unit)} 无法进入 ${province.name}：驻军已达上限 ${LAND_CAPACITY_STRENGTH}`);
          continue;
        }
        p.unit.province = to;
        pushLog(state, "move", `${unitLabel(state, p.unit)} 从 ${map.byId[p.from].name} 进入 ${province.name}`);
        continue;
      }

      // 2.2 战斗
      let r: BattleResult;
      let defenderDesc: string;
      if (hostile.length) {
        const defender = hostile.slice().sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1))[0];
        r = resolveBattle(state, province, p.unit, defender);
        defenderDesc = unitLabel(state, defender);
      } else {
        r = resolveBattleVsGarrison(state, province, p.unit, garrison);
        defenderDesc = `${province.name} 空白区守军(${garrison})`;
      }

      p.unit.strength = Math.round(r.attackerRemaining);
      pushLog(state, "battle",
        `${unitLabel(state, p.unit)} 进攻 ${province.name}：攻方战力 ${Math.round(r.attackerPower)} vs 守方 ${Math.round(r.defenderPower)}，损失 ${Math.round(r.attackerLoss)} / ${Math.round(r.defenderLoss)}，战后兵力 ${p.unit.strength} : ${Math.round(r.defenderRemaining)}`);

      if (hostile.length) {
        const defender = hostile.slice().sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1))[0];
        defender.strength = Math.round(r.defenderRemaining);
        if (defender.strength <= 0) removeUnit(state, defender);
      }
      if (p.unit.strength <= 0) removeUnit(state, p.unit);

      if (r.attackerWins && p.unit.strength > 0) {
        // 战胜：收编被击败方的战后兵力（空白区守军残部同样并入）
        let absorbed = Math.round(r.defenderRemaining);   // 空白区守军残部
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
