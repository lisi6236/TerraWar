// 回合结算总入口（顺序见 docs/开发计划与实现方案.md 附录 A.1 / C）
import type { GameState, Order, ProvinceId } from "@terrawar/shared";
import { UNIT_SPECS } from "@terrawar/shared";
import { activeUnitsIn, resolveMovements } from "./movement";
import { mergeStacks } from "./stack";
import { decayResistance, resolveOccupation } from "./occupation";
import { resolveEconomy } from "./economy";
import { resolveSupply } from "./supply";
import { computeAirSuperiority } from "./air";
import type { MapIndex } from "./state";

const LOG_LIMIT = 400;

/** 制海权：某海区只有一国的水面/潜艇部队时，该国控制该海区 */
function updateSeaControl(state: GameState, map: MapIndex): void {
  for (const id of map.ids) {
    const prov = map.byId[id];
    if (prov.kind !== "sea") continue;
    const owners = new Set(
      activeUnitsIn(state, id)
        .filter((u) => !UNIT_SPECS[u.type]?.requiresAirbase)
        .map((u) => u.owner),
    );
    if (owners.size === 1) state.provinces[id].owner = [...owners][0];
  }
}

export function endTurn(state: GameState, map: MapIndex, orders: Order[]): GameState {
  const s: GameState = structuredClone(state);
  s.phase = "resolve";

  resolveSupply(s, map);                       // 1. 补给线判定（影响后续战力）
  const air = computeAirSuperiority(s, map);   // 2. 制空权投射
  resolveMovements(s, map, orders, { air });   // 3. 移动 / 分兵 / 进攻 / 海战 / 登陆 / 转场
  mergeStacks(s, map);                         // 4. 同兵种合并
  updateSeaControl(s, map);                    // 5. 制海权
  resolveOccupation(s, map);                   // 6. 占领与抵抗
  decayResistance(s, map);                     // 7. 抵抗衰减
  resolveEconomy(s, map);                      // 8. 资源产出与维护

  for (const u of Object.values(s.units)) u.movedThisTurn = 0;
  s.turn += 1;
  s.phase = "orders";

  if (s.log.length > LOG_LIMIT) s.log = s.log.slice(s.log.length - LOG_LIMIT);
  return s;
}

/** 校验一组指令是否合法（UI 提交前调用） */
export function validateOrders(state: GameState, map: MapIndex, orders: Order[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (o.type !== "move") continue;
    if (seen.has(o.unitId)) { errors.push(`单位 ${o.unitId} 下达了多条指令`); continue; }
    seen.add(o.unitId);
    const u = state.units[o.unitId];
    if (!u) { errors.push(`单位 ${o.unitId} 不存在`); continue; }
    if (u.owner !== state.playerNation) { errors.push(`单位 ${o.unitId} 不属于你`); continue; }
    if (!map.byId[o.to]) { errors.push(`目标地块 ${o.to} 不存在`); continue; }
  }
  return errors;
}

export type { ProvinceId };
