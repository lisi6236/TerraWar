// 占领与抵抗值（见 docs/开发计划与实现方案.md 附录 A.3 / A.4）
import type { GameState } from "@terrawar/shared";
import {
  RELATION_HOSTILE_PENALTY, RELATION_HOSTILE_THRESHOLD,
  RESISTANCE_ANNEX_THRESHOLD, RESISTANCE_DECAY_FACTOR, RESISTANCE_INITIAL_FACTOR,
} from "@terrawar/shared";
import { pushLog, unitsIn, type MapIndex } from "./state";

/** 只有单一国家的军队存在、且地块不属该国时，触发占领 */
export function resolveOccupation(state: GameState, map: MapIndex): void {
  for (const id of map.ids) {
    const prov = map.byId[id];
    if (prov.kind !== "land") continue;
    const here = unitsIn(state, id);
    if (!here.length) continue;
    const owners = new Set(here.map((u) => u.owner));
    if (owners.size !== 1) continue;
    const owner = [...owners][0];
    const rt = state.provinces[id];
    if (rt.owner === owner) continue;

    let penalty = 0;
    if (rt.owner) {
      const rel = state.nations[owner]?.relations[rt.owner] ?? 0;
      if (rel <= RELATION_HOSTILE_THRESHOLD) penalty = RELATION_HOSTILE_PENALTY;
      pushLog(state, "occupy", `${state.nations[owner]?.name ?? owner} 攻占了 ${prov.name}（原属 ${state.nations[rt.owner]?.name ?? rt.owner}）`);
    } else {
      pushLog(state, "occupy", `${state.nations[owner]?.name ?? owner} 占领了空白区 ${prov.name}`);
    }
    rt.owner = owner;
    rt.resistance = prov.population * RESISTANCE_INITIAL_FACTOR + penalty;
  }
}

/** 每回合抵抗值衰减 = 驻军总战力 × 0.2 */
export function decayResistance(state: GameState, map: MapIndex): void {
  for (const id of map.ids) {
    const rt = state.provinces[id];
    if (!rt.owner || rt.resistance <= 0) continue;
    const garrison = unitsIn(state, id).filter((u) => u.owner === rt.owner);
    const decay = garrison.reduce((s, u) => s + u.strength, 0) * RESISTANCE_DECAY_FACTOR;
    if (decay <= 0) continue;
    const before = rt.resistance;
    rt.resistance = Math.max(0, rt.resistance - decay);
    if (before >= RESISTANCE_ANNEX_THRESHOLD && rt.resistance < RESISTANCE_ANNEX_THRESHOLD) {
      pushLog(state, "annex", `${map.byId[id].name} 抵抗清零，完成正式吞并`);
    }
  }
}