// 同兵种合并：同一地块内、同一国家、同一兵种的单位合并为一支（兵力相加）
import type { GameState } from "@terrawar/shared";
import { pushLog, type MapIndex } from "./state";

export function mergeStacks(state: GameState, map: MapIndex): void {
  const groups = new Map<string, string[]>();
  for (const u of Object.values(state.units)) {
    if (u.embarkedOn) continue;   // 已登船的单位不参与合兵
    const key = u.province + "|" + u.owner + "|" + u.type;
    const arr = groups.get(key) ?? [];
    arr.push(u.id);
    groups.set(key, arr);
  }

  for (const [, ids] of groups) {
    if (ids.length < 2) continue;
    ids.sort();
    const keep = state.units[ids[0]];
    if (!keep) continue;

    let total = 0;
    let moraleWeighted = 0;
    for (const id of ids) {
      const u = state.units[id];
      total += u.strength;
      moraleWeighted += u.morale * u.strength;
    }
    const mergedMorale = total > 0 ? moraleWeighted / total : keep.morale;

    keep.strength = total;
    keep.morale = mergedMorale;
    for (let i = 1; i < ids.length; i++) delete state.units[ids[i]];

    pushLog(
      state, "merge",
      `${state.nations[keep.owner]?.name ?? keep.owner} 在 ${map.byId[keep.province]?.name ?? keep.province} 合并 ${ids.length} 支同兵种部队，总兵力 ${Math.round(total)}`,
    );
  }
}