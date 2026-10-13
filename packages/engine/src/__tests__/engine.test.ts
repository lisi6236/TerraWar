import { describe, expect, it } from "vitest";
import type { MapData, Province } from "@terrawar/shared";
import { canOrderMove, createGame, endTurn, generateAiOrders, indexMap, reachableProvinces, unitsIn } from "../index";

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

const unitOf = (s: any, owner: string, province: string) =>
  Object.values(s.units).find((u: any) => u.owner === owner && u.province === province) as any;

describe("createGame", () => {
  it("同一 seed 结果确定", () => {
    const map = makeMap();
    const a = createGame(map, { seed: 42 });
    const b = createGame(map, { seed: 42 });
    expect(a.playerNation).toBe(b.playerNation);
    expect(a.nations.FRA.personality).toEqual(b.nations.FRA.personality);
  });

  it("每个国家开局 2 个军团，首都 1 个", () => {
    const s = createGame(makeMap(), { seed: 1 });
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

describe("移动 / 分兵 / 合并", () => {
  it("相邻可移动，不相邻不可移动", () => {
    const map = makeMap();
    const m = indexMap(map);
    const s = createGame(map, { seed: 7 });
    const u = unitOf(s, "FRA", "A");
    expect(canOrderMove(s, m, u.id, "B")).toBe(true);
    expect(canOrderMove(s, m, u.id, "C")).toBe(false);
    expect(reachableProvinces(s, m, u.id)).toEqual(["B"]);
  });

  it("空白区有 50 守军；击败后收编残部并占领", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 3 });
    const u = unitOf(s, "FRA", "B");
    s = endTurn(s, m, [{ type: "move", unitId: u.id, to: "C" }]);
    expect(s.provinces.C.owner).toBe("FRA");
    expect(s.units[u.id].province).toBe("C");
    // 100 打 50（平原）：战后 90 : 40 -> 收编 40 -> 130
    expect(s.units[u.id].strength).toBe(130);
    // 抵抗值 100×0.5=50，当回合衰减 130×0.2=26 -> 24
    expect(s.provinces.C.resistance).toBeCloseTo(24, 5);
  });

  it("同兵种在同一地块自动合并为一支（兵力相加）", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 29, playerNation: "FRA" });
    const b = unitOf(s, "FRA", "B");
    s = endTurn(s, m, [{ type: "move", unitId: b.id, to: "A" }]);
    const inA = unitsIn(s, "A");
    expect(inA).toHaveLength(1);
    expect(inA[0].strength).toBe(200);
  });

  it("分兵：只派出指定兵力，其余留守（派出部分照常战斗与收编）", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 23, playerNation: "FRA" });
    const u = unitOf(s, "FRA", "B");
    u.strength = 200;
    s = endTurn(s, m, [{ type: "move", unitId: u.id, to: "C", strength: 100 }]);
    expect(s.units[u.id].province).toBe("B");
    expect(s.units[u.id].strength).toBe(100);   // 留守
    const moved = unitsIn(s, "C")[0];
    expect(moved.strength).toBe(130);            // 100 打 50 -> 90 + 收编 40
    expect(s.provinces.C.owner).toBe("FRA");
  });

  it("超过地块驻军上限（200）时进入被拒绝", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 31, playerNation: "FRA" });
    const a = unitOf(s, "FRA", "A");
    a.strength = 200;
    s = endTurn(s, m, [{ type: "move", unitId: a.id, to: "B" }]);
    expect(s.units[a.id].province).toBe("A");
    expect(unitsIn(s, "B")).toHaveLength(1);
  });

  it("互相交换地块（甲->乙, 乙->甲）可同时完成，不算战斗", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 11 });
    const fra = unitOf(s, "FRA", "A");
    const ita = Object.values(s.units).find((u: any) => u.owner === "ITA") as any;
    ita.province = "B";
    s = endTurn(s, m, [
      { type: "move", unitId: fra.id, to: "B" },
      { type: "move", unitId: ita.id, to: "A" },
    ]);
    expect(s.units[fra.id].province).toBe("B");
    expect(s.units[ita.id].province).toBe("A");
  });
});

describe("进攻与战斗结算", () => {
  it("两军抢同一空白省：先到者占据，后到者进攻失利退回", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 5 });
    const fra = unitOf(s, "FRA", "B");
    const ita = Object.values(s.units).find((u: any) => u.owner === "ITA") as any;
    ita.province = "D";
    fra.strength = 90;
    ita.strength = 120;
    s = endTurn(s, m, [
      { type: "move", unitId: fra.id, to: "C" },
      { type: "move", unitId: ita.id, to: "C" },
    ]);
    expect(s.provinces.C.owner).toBe("ITA");
    expect(s.units[fra.id].province).toBe("B");
  });

  it("优势兵力可以攻克敌方驻守的地块", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 21, playerNation: "FRA" });
    const fra = unitOf(s, "FRA", "A");
    const ita = Object.values(s.units).find((u: any) => u.owner === "ITA") as any;
    ita.province = "B";
    ita.strength = 100;
    fra.strength = 200;
    s = endTurn(s, m, [{ type: "move", unitId: fra.id, to: "B" }]);
    expect(s.provinces.B.owner).toBe("FRA");
    expect(s.units[fra.id].province).toBe("B");
    expect(s.units[fra.id].strength).toBeGreaterThan(100);
  });

  it("对等兵力进攻无法攻克（守方据守）", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 9 });
    const fra = unitOf(s, "FRA", "B");
    const ita = Object.values(s.units).find((u: any) => u.owner === "ITA") as any;
    ita.province = "C";
    s = endTurn(s, m, [{ type: "move", unitId: fra.id, to: "C" }]);
    expect(s.units[fra.id].province).toBe("B");
    expect(s.provinces.C.owner).toBe("ITA");
  });

  it("战胜后收编对方残部，兵力上涨（不会越打越少）", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 33, playerNation: "FRA" });
    const fra = unitOf(s, "FRA", "A");
    const ita = Object.values(s.units).find((u: any) => u.owner === "ITA") as any;
    ita.province = "B";
    ita.strength = 100;
    fra.strength = 200;
    s = endTurn(s, m, [{ type: "move", unitId: fra.id, to: "B" }]);
    expect(s.units[ita.id]).toBeUndefined();               // 被击败收编
    // 战后 180 + 收编 80 = 260，再与 B 地原有己方 100 同兵种合并 = 360
    expect(s.units[fra.id].strength).toBe(360)
  });

  it("空白区守军：兵力不足时打不下（守军不会被打散）", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 37, playerNation: "FRA" });
    const u = unitOf(s, "FRA", "B");
    u.strength = 50;
    s = endTurn(s, m, [{ type: "move", unitId: u.id, to: "C" }]);
    expect(s.provinces.C.owner).toBeNull();
    expect(s.units[u.id].province).toBe("B");
  });
});

describe("经济", () => {
  it("产出资源并扣除维护费", () => {
    const map = makeMap();
    const m = indexMap(map);
    const s = createGame(map, { seed: 13 });
    const before = s.nations.FRA.resources.fund;
    const after = endTurn(s, m, []);
    // FRA 拥有 A（首都，资金 x1.5）与 B：产出 round(7.5 + 5) = 13；维护 2 个军团 = 10
    expect(after.nations.FRA.resources.fund).toBe(before + 13 - 10);
    expect(after.turn).toBe(2);
  });
});

describe("AI 决策", () => {
  it("不会为玩家国家生成指令", () => {
    const map = makeMap();
    const s = createGame(map, { seed: 41, playerNation: "FRA" });
    const orders = generateAiOrders(s, indexMap(map));
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => s.units[o.unitId].owner !== "FRA")).toBe(true);
  });

  it("AI 会向相邻空白省份扩张（并入结算后确实占领）", () => {
    const map = makeMap();
    const m = indexMap(map);
    let s = createGame(map, { seed: 43, playerNation: "FRA" });
    const ita = Object.values(s.units).find((u: any) => u.owner === "ITA") as any;
    ita.province = "D";
    const aiOrders = generateAiOrders(s, m);
    s = endTurn(s, m, aiOrders);
    expect(s.provinces.C.owner).toBe("ITA");
  });

  it("劣势时 AI 不会硬攻敌方重兵", () => {
    const map = makeMap();
    const m = indexMap(map);
    const s = createGame(map, { seed: 47, playerNation: "FRA" });
    const ita = Object.values(s.units).find((u: any) => u.owner === "ITA") as any;
    ita.province = "D";
    ita.strength = 50;
    const fra = Object.values(s.units).find((u: any) => u.owner === "FRA" && u.province === "B") as any;
    fra.province = "C";
    fra.strength = 200;
    const aiOrders = generateAiOrders(s, m);
    expect(aiOrders.some((o) => o.to === "C")).toBe(false);
  });
});