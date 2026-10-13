// 资源产出与维护费（见 docs/开发计划与实现方案.md 附录 A.5）
import type { GameState, NationId, Resources } from "@terrawar/shared";
import { CAPITAL_FUND_BONUS, UNIT_SPECS } from "@terrawar/shared";
import { pushLog, type MapIndex } from "./state";

export interface EconomyBreakdown {
  yields: Resources;
  upkeep: { fund: number; oil: number; food: number };
  net: Resources;
}

export function computeEconomy(state: GameState, map: MapIndex, nationId: NationId): EconomyBreakdown {
  const yields: Resources = { steel: 0, oil: 0, food: 0, fund: 0 };
  for (const id of map.ids) {
    if (state.provinces[id].owner !== nationId) continue;
    const p = map.byId[id];
    yields.steel += p.base.steel;
    yields.oil += p.base.oil;
    yields.food += p.base.food;
    yields.fund += p.base.fund * (p.isCapital ? CAPITAL_FUND_BONUS : 1);
  }

  const upkeep = { fund: 0, oil: 0, food: 0 };
  for (const u of Object.values(state.units)) {
    if (u.owner !== nationId) continue;
    const spec = UNIT_SPECS[u.type];
    upkeep.fund += spec.upkeep.fund;
    upkeep.oil += spec.upkeep.oil;
    upkeep.food += spec.upkeep.food;
  }

  const net: Resources = {
    steel: Math.round(yields.steel),
    oil: Math.round(yields.oil) - upkeep.oil,
    food: Math.round(yields.food) - upkeep.food,
    fund: Math.round(yields.fund) - upkeep.fund,
  };
  return { yields, upkeep, net };
}

export function resolveEconomy(state: GameState, map: MapIndex): void {
  for (const nation of Object.values(state.nations)) {
    if (!nation.alive) continue;
    const { net, upkeep } = computeEconomy(state, map, nation.id);
    const r = nation.resources;
    r.steel = Math.max(0, r.steel + net.steel);
    r.oil = Math.max(0, r.oil + net.oil);
    r.food = Math.max(0, r.food + net.food);
    r.fund = Math.max(0, r.fund + net.fund);

    if (nation.id === state.playerNation) {
      const sign = net.fund >= 0 ? "+" : "";
      pushLog(
        state, "economy",
        `财政：资金 ${sign}${Math.round(net.fund)}（产出 ${Math.round(net.steel)}钢/${Math.round(net.oil + upkeep.oil)}油/${Math.round(net.food + upkeep.food)}粮，维护 资金${upkeep.fund}/油${upkeep.oil}/粮${upkeep.food}）`,
      );
    }
  }
}