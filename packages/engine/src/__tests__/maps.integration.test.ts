// 集成测试：直接使用 mapgen 产出的真实地图，验证数据与引擎可用性
// （历史上曾出现 adjacency 存下标而非 id 的 bug，此测试用于防回归）
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";
import type { MapData, Province } from "@terrawar/shared";
import { createGame, indexMap, reachableProvinces, unitsIn } from "../index";

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

      it("省份数量符合难度设定（30 / 50 / 70）", () => {
        const expected: Record<number, number> = { 3: 30, 5: 50, 7: 70 };
        expect(map.provinces.length).toBe(expected[map.difficulty]);
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
          const owned = map.provinces.filter((p) => p.ownerAtStart === nation);
          expect(owned.length).toBe(6);

          const state = createGame(map, { seed: 20261013, playerNation: nation });
          const idx = indexMap(map);
          const mine = Object.values(state.units).filter((u) => u.owner === nation);
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