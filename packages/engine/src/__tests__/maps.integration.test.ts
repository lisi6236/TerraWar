// 集成测试：直接使用 mapgen 产出的真实地图，验证数据与引擎可用性
// （历史上曾出现 adjacency 存下标而非 id 的 bug，此测试用于防回归）
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";
import type { MapData, Province } from "@terrawar/shared";
import { createGame, endTurn, generateAiOrders, indexMap, reachableProvinces, unitsIn } from "../index";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAPS_DIR = path.resolve(here, "../../../../packages/map-data/maps");

function loadMap(file: string): MapData {
  const topo = JSON.parse(readFileSync(path.join(MAPS_DIR, file), "utf8"));
  const fc = feature(topo, topo.objects.provinces) as any;
  const provinces: Province[] = fc.features.map((f: any) => ({
    id: f.properties.id,
    name: f.properties.name,
    kind: f.properties.kind,
    terrain: f.properties.terrain,
    ownerAtStart: f.properties.ownerAtStart ?? null,
    isCapital: !!f.properties.isCapital,
    isCore: !!f.properties.isCore,
    isChoke: !!f.properties.isChoke,
    base: f.properties.base,
    population: f.properties.population,
    defenseBonus: f.properties.defenseBonus,
    adjacency: f.properties.adjacency ?? [],
    sourceUnits: f.properties.sourceUnits ?? [],
  }));
  const index = JSON.parse(readFileSync(path.join(MAPS_DIR, "maps.json"), "utf8"));
  const meta = index.maps.find((m: any) => m.file === file);
  return {
    id: meta.id, name: meta.name, difficulty: meta.difficulty,
    playable: meta.playable, nations: meta.nations, provinces,
  };
}

const files = readdirSync(MAPS_DIR).filter((f) => f.endsWith(".topojson.json"));

describe("真实地图数据", () => {
  it("至少存在一张地图", () => expect(files.length).toBeGreaterThan(0));

  for (const file of files) {
    describe(file, () => {
      const map = loadMap(file);

      it("陆地省份数量符合难度设定（30 / 50 / 70）", () => {
        const expected: Record<number, number> = { 3: 30, 5: 50, 7: 70 };
        const land = map.provinces.filter((p) => p.kind === "land");
        expect(land.length).toBe(expected[map.difficulty]);
        expect(map.provinces.some((p) => p.kind === "sea")).toBe(true);
      });

      it("邻接表全部指向真实省份 id", () => {
        const ids = new Set(map.provinces.map((p) => p.id));
        const bad: string[] = [];
        for (const p of map.provinces) {
          for (const a of p.adjacency) if (!ids.has(a)) bad.push(p.id + "->" + a);
        }
        expect(bad).toEqual([]);
      });

      it("每块地至少有 1 个相邻地块", () => {
        const isolated = map.provinces.filter((p) => p.adjacency.length === 0).map((p) => p.id);
        expect(isolated).toEqual([]);
      });

      it("每个可玩国家开局 6 省、2 个军团，且首都军团至少能移动 1 格", () => {
        for (const nation of map.playable) {
          const owned = map.provinces.filter((p) => p.ownerAtStart === nation && p.kind === "land");
          expect(owned.length).toBe(6);

          const state = createGame(map, { seed: 20261013, playerNation: nation });
          const idx = indexMap(map);
          const mine = Object.values(state.units).filter((u) => u.owner === nation && u.type === "infantry");
          expect(mine.length).toBe(2);

          const capital = owned.find((p) => p.isCapital)!;
          const guard = mine.find((u) => u.province === capital.id)!;
          expect(guard).toBeTruthy();
          expect(reachableProvinces(state, idx, guard.id).length).toBeGreaterThan(0);
          expect(unitsIn(state, capital.id).length).toBeGreaterThan(0);
        }
      });
    });
  }
});
describe("真实地图上的进攻（战斗结算）", () => {
  const map = loadMap("europe-5.topojson.json");
  const me = map.playable[0];

  it("存在跨国的相邻省份（可用于进攻）", () => {
    let found = false;
    for (const p of map.provinces) {
      if (p.ownerAtStart !== me) continue;
      for (const nb of p.adjacency) {
        const q = map.provinces.find((x) => x.id === nb);
        if (q && q.ownerAtStart && q.ownerAtStart !== me) { found = true; break; }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it("优势兵力进攻相邻敌国省份可以夺取该地块", () => {
    let pair: { from: string; to: string } | null = null;
    for (const p of map.provinces) {
      if (p.ownerAtStart !== me) continue;
      for (const nb of p.adjacency) {
        const q = map.provinces.find((x) => x.id === nb);
        if (q && q.ownerAtStart && q.ownerAtStart !== me) { pair = { from: p.id, to: q.id }; break; }
      }
      if (pair) break;
    }
    expect(pair).toBeTruthy();
    const enemy = map.provinces.find((x) => x.id === pair!.to)!.ownerAtStart!;

    const state = createGame(map, { seed: 20261013, playerNation: me });
    const idx = indexMap(map);
    const attacker = Object.values(state.units).find((u) => u.owner === me && u.type === "infantry")!;
    const defender = Object.values(state.units).find((u) => u.owner === enemy && u.type === "infantry")!;

    attacker.province = pair!.from;
    attacker.strength = 200;
    defender.province = pair!.to;
    defender.strength = 100;

    const after = endTurn(state, idx, [{ type: "move", unitId: attacker.id, to: pair!.to }]);
    expect(after.provinces[pair!.to].owner).toBe(me);
    expect(after.units[attacker.id]?.province).toBe(pair!.to);
    expect(after.log.some((l) => l.kind === "battle")).toBe(true);
  });
});
describe("AI 在真实地图上的扩张", () => {
  it("连续数回合后 AI 国家会占领空白省份", () => {
    const map = loadMap("europe-5.topojson.json");
    const idx = indexMap(map);
    let s = createGame(map, { seed: 20261013 });
    const owned = (st: any, n: string) => Object.values(st.provinces).filter((p: any) => p.owner === n).length;
    const before: Record<string, number> = {};
    for (const n of map.playable) before[n] = owned(s, n);

    for (let i = 0; i < 6; i++) s = endTurn(s, idx, generateAiOrders(s, idx));

    const gained = map.playable.some((n) => owned(s, n) > before[n]);
    expect(gained).toBe(true);
    expect(s.turn).toBe(7);
  });
});