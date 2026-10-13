// 移动与冲突裁决（M1 简化版，见 docs/开发计划与实现方案.md 附录 A.2）
import type { GameState, Order, ProvinceId, Unit } from "@terrawar/shared";
import { GARRISON_CAPACITY } from "@terrawar/shared";
import { pushLog, unitsIn, type MapIndex } from "./state";

/** 单位可移动到的地块（相邻 + 陆地 + 未被敌军占据 + 容量未满） */
export function reachableProvinces(state: GameState, map: MapIndex, unitId: string): ProvinceId[] {
  const u = state.units[unitId];
  if (!u) return [];
  const from = map.byId[u.province];
  if (!from) return [];
  const out: ProvinceId[] = [];
  for (const to of from.adjacency) {
    const target = map.byId[to];
    if (!target || target.kind !== "land") continue;
    const here = unitsIn(state, to);
    if (here.some((x) => x.owner !== u.owner)) continue;               // 有敌军 → M1 不可进入
    const friendly = here.filter((x) => x.owner === u.owner).length;
    if (friendly >= GARRISON_CAPACITY) continue;                        // 驻军容量已满
    out.push(to);
  }
  return out;
}

export function canOrderMove(state: GameState, map: MapIndex, unitId: string, to: ProvinceId): boolean {
  return reachableProvinces(state, map, unitId).includes(to);
}

/** 执行移动与冲突裁决（就地修改 state） */
export function resolveMovements(state: GameState, map: MapIndex, orders: Order[]): void {
  const movers = new Set<string>();
  const plans: { unit: Unit; from: ProvinceId; to: ProvinceId }[] = [];

  for (const o of orders) {
    if (o.type !== "move") continue;
    const u = state.units[o.unitId];
    if (!u) continue;
    if (o.to === u.province) continue;
    const from = map.byId[u.province];
    const target = map.byId[o.to];
    if (!from || !target) continue;
    if (!from.adjacency.includes(o.to)) {
      pushLog(state, "block", `${unitLabel(state, u)} 无法移动到不相邻的地块`);
      continue;
    }
    if (target.kind !== "land") {
      pushLog(state, "block", `${unitLabel(state, u)} 是陆军，无法进入海域（跨海需海军运输，M4 开放）`);
      continue;
    }
    movers.add(u.id);
    plans.push({ unit: u, from: u.province, to: o.to });
  }

  // 未下移动指令的单位 = 驻守者
  const stayersByProv = new Map<ProvinceId, Unit[]>();
  for (const u of Object.values(state.units)) {
    if (movers.has(u.id)) continue;
    const arr = stayersByProv.get(u.province) ?? [];
    arr.push(u);
    stayersByProv.set(u.province, arr);
  }

  // 按目标地块分组
  const groups = new Map<ProvinceId, { unit: Unit; from: ProvinceId; to: ProvinceId }[]>();
  for (const p of plans) {
    const arr = groups.get(p.to) ?? [];
    arr.push(p);
    groups.set(p.to, arr);
  }

  for (const [to, list] of groups) {
    // 确定性排序：战力降序，id 升序
    list.sort((a, b) =>
      b.unit.strength - a.unit.strength || (a.unit.id < b.unit.id ? -1 : 1));

    const stayers = stayersByProv.get(to) ?? [];
    const incomingOwner = list[0].unit.owner;
    const hostileStayers = stayers.filter((u) => u.owner !== incomingOwner);
    if (hostileStayers.length) {
      for (const p of list) {
        pushLog(state, "block", `${unitLabel(state, p.unit)} 进攻 ${map.byId[to].name} 被守军阻挡（M2 起进入战斗结算）`);
      }
      continue; // M1：无战斗，全部退回出发地
    }

    let occupied = stayers.filter((u) => u.owner === incomingOwner).length;
    const ownerOfProvince = state.provinces[to]?.owner ?? null;
    let firstArrived = false;
    for (const p of list) {
      const sameOwner = p.unit.owner === incomingOwner;
      if (!firstArrived || sameOwner) {
        if (occupied < GARRISON_CAPACITY) {
          p.unit.province = to;
          occupied += 1;
          firstArrived = true;
          pushLog(state, "move", `${unitLabel(state, p.unit)} 从 ${map.byId[p.from].name} 移动到 ${map.byId[to].name}`);
        } else {
          pushLog(state, "block", `${unitLabel(state, p.unit)} 无法进入 ${map.byId[to].name}：驻军容量已满`);
        }
      } else {
        pushLog(state, "block", `${unitLabel(state, p.unit)} 抵达 ${map.byId[to].name} 时已被他国军队占据`);
      }
    }
    void ownerOfProvince;
  }
}

export function unitLabel(state: GameState, u: Unit): string {
  const nation = state.nations[u.owner]?.name ?? u.owner;
  return `${nation}军团(${u.id})`;
}