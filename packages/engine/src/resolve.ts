// 回合结算总入口（顺序见 docs/开发计划与实现方案.md 附录 A.1）
import type { GameState, Order } from "@terrawar/shared";
import { resolveMovements } from "./movement";
import { mergeStacks } from "./stack";
import { decayResistance, resolveOccupation } from "./occupation";
import { resolveEconomy } from "./economy";
import type { MapIndex } from "./state";

const LOG_LIMIT = 400;

export function endTurn(state: GameState, map: MapIndex, orders: Order[]): GameState {
  const s: GameState = structuredClone(state);
  s.phase = "resolve";

  resolveMovements(s, map, orders);   // 2. 移动 / 分兵 / 进攻与冲突裁决
  mergeStacks(s, map);                // 2.5 同兵种合并
  resolveOccupation(s, map);          // 3. 占领与抵抗
  decayResistance(s, map);            // 4. 抵抗衰减
  resolveEconomy(s, map);             // 5. 资源产出与维护

  for (const u of Object.values(s.units)) u.movedThisTurn = 0;
  s.turn += 1;
  s.phase = "orders";                 // 6. 进入下一回合

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
