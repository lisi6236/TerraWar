// 补给线判定（《玩法规则详细文档》§2.4）
// 规则：从本国首都出发，沿「己方控制的陆地省 / 拥有制海权的海区」扩张补给网；
//      脱离补给网的部队战力下降、士气受损，深层脱离 = 补给断绝。
import type { GameState, ProvinceId } from "@terrawar/shared";
import { MORALE } from "@terrawar/shared";
import { pushLog, type MapIndex } from "./state";

function clampMorale(v: number): number {
  return Math.max(MORALE.min, Math.min(MORALE.max, v));
}

/** 补给网：从首都经己方控制地块（含己方海区）连通到的所有地块 */
export function supplyNetwork(state: GameState, map: MapIndex, nationId: string): Set<ProvinceId> {
  const out = new Set<ProvinceId>();
  const capital = state.nations[nationId]?.capital;
  if (!capital || !map.byId[capital]) return out;
  const queue: ProvinceId[] = [capital];
  out.add(capital);
  while (queue.length) {
    const cur = queue.shift() as ProvinceId;
    for (const nb of map.byId[cur]?.adjacency ?? []) {
      if (out.has(nb)) continue;
      if (state.provinces[nb]?.owner !== nationId) continue;   // 只能通过己方控制的地块
      out.add(nb);
      queue.push(nb);
    }
  }
  return out;
}

export function resolveSupply(state: GameState, map: MapIndex): void {
  for (const nation of Object.values(state.nations)) {
    if (!nation.alive) continue;
    const net = supplyNetwork(state, map, nation.id);
    for (const u of Object.values(state.units)) {
      if (u.owner !== nation.id) continue;
      const prev = u.supply;
      if (net.has(u.province)) u.supply = "ok";
      else if ((map.byId[u.province]?.adjacency ?? []).some((n) => net.has(n))) u.supply = "low";
      else u.supply = "cut";

      if (u.supply !== prev) {
        pushLog(state, "supply",
          `${state.nations[nation.id]?.name ?? nation.id} ${u.id} 补给${u.supply === "ok" ? "恢复" : u.supply === "low" ? "不足" : "断绝"}`);
      }
      if (u.supply === "low") u.morale = clampMorale(u.morale - 5);
      else if (u.supply === "cut") u.morale = clampMorale(u.morale - 15);
    }
  }
}