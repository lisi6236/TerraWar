import { describe, expect, it } from "vitest";
import type { MapData, Province } from "@terrawar/shared";
import {
  canOrderMove, createGame, endTurn, indexMap, reachableProvinces, unitsIn,
} from "../index";

/** 造一张 5 块地的测试地图： A - B - C - D - E */
function makeMap(): MapData {
  const mk = (id: string, name: string, adj: string[], owner: string | null, pop = 100): Province => ({
    id, name, kind: "land", terrain: "plain", ownerAtStart: owner,
    isCapital: false, isCore: false, isChoke: false,
    base: { steel: 2, oil: 1, food: 3, fund: 5 },
    population: pop, defenseBonus: 1, adjacency: adj, sourceUnits: [name],
  });
  const provinces: Province[] = [
    mk("A", "甲", ["B"], "FRA", 100),
    mk("B", "乙", ["A", "C"], "FRA", 100),
    mk("C", "丙", ["B", "D"], null, 100),
    mk("D", "丁", ["C", "E"], null, 100),
    mk("E", "戊", ["D"], "ITA", 100),
  ];
  provinces[0].isCapital = true;
  provinces[4].isCapital = true;
  return {
    id: "test", name: "测试地图", difficulty: 2, playable: ["FRA", "ITA"],
    nations: { FRA: { name: "法国", color: "#00f" }, ITA: { name: "意大利", color: "#0f0" } },
    provinces,
  };
}

describe("createGame", () => {
  it("同一 seed 结果确定", () => {
    const map = makeMap();
    const a = createGame(map, { seed: 42 });
    const b = createGame(map, { seed: 42 });
    expect(a.playerNation).toBe(b.playerNation);
    expect(a.nations.FRA.personality).toEqual(b.nations.FRA.personality);
  });

  it("每个国家开局 2 个军团，首都 1 个", () => {
    const map = makeMap();
    const s = createGame(map, { seed: 1 });
    const fra = Object.values(s.units).filter((u) => u.owner === "FRA");
    expect(fra).toHaveLength(2);
    expect(fra.some((u) => u.province === "A")).toBe(true);
  });

  it("可指定玩家国家", () => {
    const s = createGame(makeMap(), { playerNation: "ITA" });
    expect(s.playerNation).toBe("ITA");
    expect(s.nations.ITA.isPlayer).toBe(true);
  });
});

describe("移动与冲突裁决", () => {
  it("相邻可移动，不相邻不可移动", () => {
    const map = makeMap();
    const m = indexMap(map);
    const s = createGame(map, { seed: 7 });
    const u = Object.values(s.units).find((x) => x.province === "A")!;
    expect(canOrderMove(s, m, u.id, "B")).toBe(true);
    expect(canOrderMove(s, m, u.id, "C")).toBe(false);
    expect(reachableProvinces(s, m, u.id)).toEqual(["B"]);
  });

  it("进入空白省并占领，抵抗值 = 人口×0.5", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 3 });
    const u = Object.values(s.units).find((x) => x.province === "B")!;
    s = endTurn(s, m, [{ type: "move", unitId: u.id, to: "C" }]);
    expect(s.provinces.C.owner).toBe(u.owner);
    // 占领当回合即开始衰减：驻军 100 战力 × 0.2 = 20
    expect(s.provinces.C.resistance).toBeCloseTo(30, 5);
    expect(s.units[u.id].province).toBe("C");
  });

  it("两军争抢同一空白省：战力高者得，其余退回", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 5 });
    const fra = Object.values(s.units).find((x) => x.owner === "FRA" && x.province === "B")!;
    // 把意大利军队放到 C 的西侧前，先手动构造：意军从 E 出发太远，改为直接调兵
    const ita = Object.values(s.units).find((x) => x.owner === "ITA")!;
    ita.province = "D";
    fra.strength = 90;
    ita.strength = 120;
    s = endTurn(s, m, [
      { type: "move", unitId: fra.id, to: "C" },
      { type: "move", unitId: ita.id, to: "C" },
    ]);
    expect(s.units[ita.id].province).toBe("C");
    expect(s.units[fra.id].province).toBe("B"); // 被退回
    expect(s.provinces.C.owner).toBe("ITA");
  });

  it("目标地块有他国驻军时进攻被阻挡（M1 无战斗）", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 9 });
    const fra = Object.values(s.units).find((x) => x.owner === "FRA" && x.province === "B")!;
    const ita = Object.values(s.units).find((x) => x.owner === "ITA")!;
    ita.province = "C";
    s = endTurn(s, m, [{ type: "move", unitId: fra.id, to: "C" }]);
    expect(s.units[fra.id].province).toBe("B");
    // 驻守方仍据有该地并完成占领
    expect(s.provinces.C.owner).toBe("ITA");
  });

  it("互相交换地块（A:甲→乙, B:乙→甲）可同时完成", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 11 });
    const fra = Object.values(s.units).find((x) => x.owner === "FRA" && x.province === "A")!;
    const ita = Object.values(s.units).find((x) => x.owner === "ITA")!;
    ita.province = "B";
    s = endTurn(s, m, [
      { type: "move", unitId: fra.id, to: "B" },
      { type: "move", unitId: ita.id, to: "A" },
    ]);
    expect(s.units[fra.id].province).toBe("B");
    expect(s.units[ita.id].province).toBe("A");
  });
});

describe("经济", () => {
  it("产出资源并扣除维护费", () => {
    const map = makeMap();
    const m = indexMap(map);
    const s = createGame(map, { seed: 13 });
    const before = s.nations.FRA.resources.fund;
    const after = endTurn(s, m, []);
    // FRA 拥有 A、B 两块地：产出 5+5=10（B 非首都 5，A 首都 ×1.5 → 7.5 → 合计 12.5 → 12）
    // 维护 2 个军团 = 10
    expect(after.nations.FRA.resources.fund).toBe(before + 13 - 10);
    expect(after.turn).toBe(2);
  });

  it("占领后地块产出计入经济", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 17 });
    const u = Object.values(s.units).find((x) => x.province === "B")!;
    s = endTurn(s, m, [{ type: "move", unitId: u.id, to: "C" }]);
    expect(s.provinces.C.owner).toBe(u.owner);
    expect(unitsIn(s, "C")).toHaveLength(1);
  });
});