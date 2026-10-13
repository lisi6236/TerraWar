// 空军：以「制空权投射」实现（简化——空军驻于己方陆地，自动对射程内所有地块投射制空权）
// 完整的任务系统（战略轰炸 / 空降 / 领空通行权）待外交系统（M5）与建筑系统（M6）后接入。
import type { GameState, ProvinceId } from "@terrawar/shared";
import { AIR_RANGE_BY_TYPE, AIR_SUPREMACY_RATIO } from "@terrawar/shared";
import type { MapIndex } from "./state";

/** 从某地块出发、步数不超过 range 的所有地块 */
export function rangeOf(map: MapIndex, from: ProvinceId, range: number): ProvinceId[] {
  const seen = new Set<ProvinceId>([from]);
  let frontier = [from];
  const out: ProvinceId[] = [from];
  for (let step = 0; step < range; step++) {
    const next: ProvinceId[] = [];
    for (const id of frontier) {
      for (const nb of map.byId[id]?.adjacency ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        out.push(nb);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return out;
}

export interface AirReport {
  /** 地块 -> 掌握制空权的国家（null = 均势；未出现则无空军参与） */
  superiority: Map<ProvinceId, string | null>;
  /** 地块 -> 各国投射的空军战力 */
  power: Map<ProvinceId, Map<string, number>>;
}

export function computeAirSuperiority(state: GameState, map: MapIndex): AirReport {
  const power = new Map<ProvinceId, Map<string, number>>();
  for (const u of Object.values(state.units)) {
    const range = AIR_RANGE_BY_TYPE[u.type];
    if (!range) continue;
    for (const pid of rangeOf(map, u.province, range)) {
      const m = power.get(pid) ?? new Map<string, number>();
      m.set(u.owner, (m.get(u.owner) ?? 0) + u.strength);
      power.set(pid, m);
    }
  }
  const superiority = new Map<ProvinceId, string | null>();
  for (const [pid, m] of power) {
    const list = [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    if (!list.length) continue;
    const [topNation, topPower] = list[0];
    const second = list[1]?.[1] ?? 0;
    superiority.set(pid, second > 0 && topPower < second * AIR_SUPREMACY_RATIO ? null : topNation);
  }
  return { superiority, power };
}