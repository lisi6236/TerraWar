// AI 决策（M3 简单 AI：规则 + 权重，不含搜索/学习）
// 每个 AI 国家按个性（野心/亲善/扩张/冒险）评估相邻地块，产出移动/进攻指令。
import type { GameState, Order, ProvinceId, Unit } from "@terrawar/shared";
import { LAND_CAPACITY_STRENGTH, SPLIT_STEP } from "@terrawar/shared";
import { unitsIn, type MapIndex } from "./state";
import { reachableProvinces } from "./movement";

function floorToStep(v: number): number {
  return Math.floor(v / SPLIT_STEP) * SPLIT_STEP;
}

function strengthAmong(units: Unit[], owner: string): number {
  return units.filter((u) => u.owner === owner).reduce((s, u) => s + u.strength, 0);
}

/** 为目标地块打分；返回 null 表示不打 */
function scoreTarget(
  state: GameState, map: MapIndex, unit: Unit, to: ProvinceId, owner: string,
): number | null {
  const prov = map.byId[to];
  const rt = state.provinces[to];
  if (!prov || !rt) return null;
  const here = unitsIn(state, to);
  const defenders = here.filter((u) => u.owner !== owner);
  const p = state.nations[owner].personality;

  if (defenders.length) {
    const defStr = defenders.reduce((s, u) => s + u.strength, 0);
    const odds = unit.strength / Math.max(1, defStr);
    // 冒险高的国家敢打更险的仗
    const need = 1.35 - p.riskTolerance * 0.35;
    if (odds < need) return null;
    let score = 12 + p.aggression * 22 + (odds - need) * 12;
    if (prov.isCapital) score += 10;
    if (rt.resistance > 40) score -= 4;
    return score;
  }

  if (rt.owner === null) {
    let score = 8 + p.expansionism * 16;
    if (prov.isCore) score += 7;
    if (prov.isCapital) score += 5;
    return score;
  }

  if (rt.owner === owner) {
    const own = here.filter((u) => u.owner === owner);
    const canMerge = own.some((u) => u.type === unit.type)
      && strengthAmong(here, owner) + unit.strength <= LAND_CAPACITY_STRENGTH;
    return canMerge ? 5 : null;
  }
  return null;
}

/** 生成所有 AI 国家的指令（玩家指令由 UI 另行合并） */
export function generateAiOrders(state: GameState, map: MapIndex): Order[] {
  const orders: Order[] = [];
  const claimed = new Set<ProvinceId>();

  const aiNations = Object.values(state.nations)
    .filter((n) => !n.isPlayer && n.alive)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const nation of aiNations) {
    const units = Object.values(state.units)
      .filter((u) => u.owner === nation.id)
      .sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1));

    for (const unit of units) {
      const targets = reachableProvinces(state, map, unit.id).filter((t) => !claimed.has(t));
      let best: { to: ProvinceId; score: number } | null = null;
      for (const to of targets) {
        const s = scoreTarget(state, map, unit, to, nation.id);
        if (s === null) continue;
        if (!best || s > best.score) best = { to, score: s };
      }
      if (!best || best.score < 8) continue;

      const room = strengthAmong(unitsIn(state, best.to), nation.id);
      const defenders = unitsIn(state, best.to).some((u) => u.owner !== nation.id);
      const capacity = defenders ? unit.strength : Math.max(0, LAND_CAPACITY_STRENGTH - room);
      const send = Math.min(unit.strength, floorToStep(capacity));
      if (send < SPLIT_STEP) continue;

      claimed.add(best.to);
      orders.push(send >= unit.strength
        ? { type: "move", unitId: unit.id, to: best.to }
        : { type: "move", unitId: unit.id, to: best.to, strength: send });
    }
  }
  return orders;
}
