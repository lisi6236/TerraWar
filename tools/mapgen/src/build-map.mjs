// 主流程：Natural Earth admin-1 -> 聚类成省份 -> 计算邻接 -> 输出 TopoJSON
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { topology } from "topojson-server";
import { neighbors } from "topojson-client";
import { loadCountryAdm1 } from "./fetch.mjs";
import { MAPS, PLAYABLE_PROVINCES, EUROPE_BBOX, NATION_META } from "./config.mjs";
import { toMultiPolygon, multiPolygonCentroid, multiPolygonArea, distance, mergeMultiPolygons } from "./geo.mjs";
import { clusterUnits } from "./cluster.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../../packages/map-data/maps");

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const inBbox = (c) =>
  c.x >= EUROPE_BBOX.minLon && c.x <= EUROPE_BBOX.maxLon &&
  c.y >= EUROPE_BBOX.minLat && c.y <= EUROPE_BBOX.maxLat;

const TERRAIN_WEIGHTS = [["plain", 0.42], ["hills", 0.22], ["forest", 0.20], ["mountain", 0.12], ["urban", 0.04]];
function pickTerrain(rand) {
  let r = rand(), acc = 0;
  for (const [t, w] of TERRAIN_WEIGHTS) { acc += w; if (r <= acc) return t; }
  return "plain";
}

function targetCounts(map) {
  const counts = {};
  for (const c of map.playable) counts[c] = PLAYABLE_PROVINCES;
  const remaining = Math.max(0, map.totalProvinces - map.playable.length * PLAYABLE_PROVINCES);
  const n = map.neutral.length;
  const base = Math.floor(remaining / n);
  let extra = remaining - base * n;
  for (const c of map.neutral) { counts[c] = base + (extra-- > 0 ? 1 : 0); }
  return counts;
}

async function loadUnits() {
  const wanted = [];
  const seen = new Set();
  for (const m of MAPS) for (const c of m.playable.concat(m.neutral)) if (!seen.has(c)) { seen.add(c); wanted.push(c); }

  const units = [];
  const byCountry = new Map();
  for (const iso3 of wanted) {
    let feats;
    try { feats = await loadCountryAdm1(iso3); }
    catch (e) { console.warn("[warn] " + iso3 + " 数据缺失: " + e.message); continue; }
    for (const f of feats) {
      const centroid = multiPolygonCentroid(f.coords);
      if (!inBbox(centroid)) continue; // 去海外属地
      const area = multiPolygonArea(f.coords);
      if (area <= 0) continue;
      const u = { index: units.length, iso: iso3, name: f.name, coords: f.coords, centroid, area };
      units.push(u);
      if (!byCountry.has(iso3)) byCountry.set(iso3, []);
      byCountry.get(iso3).push(u.index);
    }
  }
  return { units, byCountry };
}

function computeUnitAdjacency(units, byCountry) {
  // 1) 拓扑共享边界（跨所有单元）
  const fc = { type: "FeatureCollection", features: units.map((u) => ({ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: u.coords } })) };
  let nb = [];
  try {
    const topo = topology({ units: fc });
    nb = neighbors(topo.objects.units.geometries);
  } catch (e) {
    console.warn("[warn] topology neighbors failed:", e.message);
    nb = units.map(() => []);
  }
  const adj = units.map(() => new Set());
  for (let i = 0; i < nb.length; i++) for (const j of nb[i] || []) { adj[i].add(j); adj[j].add(i); }

  // 2) 同国距离兜底（处理岛屿：西西里/撒丁/科西嘉/不列颠等）
  for (const [, idxs] of byCountry) {
    for (const a of idxs) for (const b of idxs) {
      if (a >= b) continue;
      if (distance(units[a].centroid, units[b].centroid) < 3.0) { adj[a].add(b); adj[b].add(a); }
    }
  }
  return adj.map((s) => [...s]);
}

function buildMapProvinces(units, byCountry, map, unitAdj) {
  const counts = targetCounts(map);
  const provinces = [];

  for (const [iso, idxs] of byCountry) {
    if (!map.playable.includes(iso) && !map.neutral.includes(iso)) continue;
    const k = Math.max(1, Math.min(counts[iso] ?? 1, idxs.length));
    const sub = idxs.map((i) => units[i]);
    const local = new Map(idxs.map((gi, li) => [li, gi]));
    const subAdj = idxs.map((gi, li) => unitAdj[gi].filter((g) => idxs.includes(g)).map((g) => idxs.indexOf(g)));
    const groups = clusterUnits(sub, subAdj, k);

    let n = 0;
    for (const group of groups) {
      n += 1;
      const memberUnits = group.map((gi) => units[gi]);
      const coords = mergeMultiPolygons(memberUnits.map((u) => u.coords));
      const centroid = multiPolygonCentroid(coords);
      const area = multiPolygonArea(coords);
      const biggest = memberUnits.slice().sort((a, b) => b.area - a.area)[0];
      const id = iso + "-" + n;
      const rand = mulberry32(hashStr(id));
      const terrain = pickTerrain(rand);
      const isCore = rand() < 0.12;
      provinces.push({
        id,
        name: biggest.name,
        iso,
        centroid,
        area,
        coords,
        members: memberUnits.map((u) => u.index),
        properties: {
          id,
          name: biggest.name,
          kind: "land",
          terrain,
          ownerAtStart: map.playable.includes(iso) ? iso : null,
          isCapital: false,
          isCore,
          isChoke: false,
          population: Math.max(30, Math.round(area * 900)),
          sourceUnits: memberUnits.map((u) => u.name),
        },
      });
    }
  }
  return provinces;
}

function computeProvinceAdjacency(units, provinces, unitAdj) {
  const provOfUnit = new Map();
  provinces.forEach((p, pi) => p.members.forEach((u) => provOfUnit.set(u, pi)));
  const adj = provinces.map(() => new Set());
  for (let i = 0; i < units.length; i++) {
    for (const j of unitAdj[i]) {
      const a = provOfUnit.get(i), b = provOfUnit.get(j);
      if (a === undefined || b === undefined || a === b) continue;
      adj[a].add(b); adj[b].add(a);
    }
  }
  return adj.map((s) => [...s].sort((x, y) => x - y));
}

function finalize(provinces, adjacency, map) {
  // 空白未占领区用低调的地形色，已归属省份用国家色（政治填色）
  const TERRAIN_TONE = { plain: "#cdc7b6", hills: "#bcb29c", mountain: "#a89c8b", forest: "#a3b197", urban: "#b6ada0", desert: "#cfbc92", coast: "#cdc7b6", island: "#cdc7b6" };
  const features = provinces.map((p, i) => ({
    type: "Feature",
    properties: {
      ...p.properties,
      color: p.properties.ownerAtStart
        ? (NATION_META[p.properties.ownerAtStart]?.color || "#c9c3b4")
        : (TERRAIN_TONE[p.properties.terrain] || "#cdc7b6"),
      adjacency: adjacency[i],
      base: {
        steel: p.properties.isCore ? 6 : 2,
        oil: p.properties.isCore ? 3 : 1,
        food: p.properties.isCore ? 9 : 3,
        fund: 5,
      },
      defenseBonus: { plain: 1.0, hills: 1.15, mountain: 1.3, forest: 1.2, desert: 0.9, urban: 1.25 }[p.properties.terrain] ?? 1.0,
    },
    geometry: { type: "MultiPolygon", coordinates: p.coords },
  }));

  // 首都：可玩国家取最靠近该国质心的省份
  for (const iso of map.playable) {
    const own = provinces.filter((p) => p.iso === iso);
    if (!own.length) continue;
    const cx = own.reduce((s, p) => s + p.centroid.x * p.area, 0) / own.reduce((s, p) => s + p.area, 0);
    const cy = own.reduce((s, p) => s + p.centroid.y * p.area, 0) / own.reduce((s, p) => s + p.area, 0);
    let best = own[0], bd = Infinity;
    for (const p of own) { const d = distance(p.centroid, { x: cx, y: cy }); if (d < bd) { bd = d; best = p; } }
    best.properties.isCapital = true;
  }
  return features;
}

export async function buildAllMaps() {
  const { units, byCountry } = await loadUnits();
  console.log("[mapgen] units kept: " + units.length + " across " + byCountry.size + " countries");
  const unitAdj = computeUnitAdjacency(units, byCountry);
  await mkdir(OUT_DIR, { recursive: true });

  const index = [];
  for (const map of MAPS) {
    const provinces = buildMapProvinces(units, byCountry, map, unitAdj);
    const adjacency = computeProvinceAdjacency(units, provinces, unitAdj);
    const features = finalize(provinces, adjacency, map);
    const topo = topology({ provinces: { type: "FeatureCollection", features } }, 1e5);
    const outFile = path.join(OUT_DIR, map.id + ".topojson.json");
    await writeFile(outFile, JSON.stringify(topo));

    // 健康检查
    const isolated = features.filter((f, i) => adjacency[i].length === 0).map((f) => f.properties.id);
    const playableCounts = {};
    for (const f of features) if (f.properties.ownerAtStart) playableCounts[f.properties.ownerAtStart] = (playableCounts[f.properties.ownerAtStart] || 0) + 1;

    index.push({
      id: map.id, name: map.name, difficulty: map.difficulty,
      provinceCount: features.length,
      playable: map.playable,
      nations: Object.fromEntries(Object.entries(NATION_META).map(([k, v]) => [k, v])),
      file: map.id + ".topojson.json",
    });
    console.log("[mapgen] " + map.id + ": provinces=" + features.length +
      " playable=" + JSON.stringify(playableCounts) +
      (isolated.length ? " isolated=" + isolated.join(",") : " isolated=none"));
  }
  await writeFile(path.join(OUT_DIR, "maps.json"), JSON.stringify({ maps: index }, null, 2));
  console.log("[mapgen] wrote maps.json with " + index.length + " maps");
}