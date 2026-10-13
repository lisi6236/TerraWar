// 生成「真实海区」：经纬网格 -> 剔除陆地 -> 聚类成海区 -> 与陆地边界裁切
import pc from "polygon-clipping";
import { multiPolygonArea, multiPolygonCentroid } from "./geo.mjs";
import { clusterUnits } from "./cluster.mjs";

/** 环的有向面积（正值 = 逆时针） */
function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}
/** 归一化环绕方向：外环顺时针、内环逆时针（d3-geo 约定） */
function normalizePolygon(poly) {
  return poly.map((ring, i) => {
    const r = ring.slice();
    const a = signedArea(r);
    if (i === 0 ? a > 0 : a < 0) r.reverse();
    return r;
  });
}

function bboxOf(coords) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const poly of coords) for (const ring of poly) for (const p of ring) {
    if (p[0] < minLon) minLon = p[0];
    if (p[0] > maxLon) maxLon = p[0];
    if (p[1] < minLat) minLat = p[1];
    if (p[1] > maxLat) maxLat = p[1];
  }
  return { minLon, maxLon, minLat, maxLat };
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInMultiPolygon(x, y, coords) {
  for (const poly of coords) {
    if (!pointInRing(x, y, poly[0])) continue;
    let hole = false;
    for (let i = 1; i < poly.length; i++) if (pointInRing(x, y, poly[i])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

/** 海区命名（按经纬度粗略对应真实海区） */
const SEA_NAMES = [
  { name: "挪威海", minLon: -6, maxLon: 16, minLat: 58, maxLat: 74 },
  { name: "波罗的海", minLon: 9, maxLon: 31, minLat: 53, maxLat: 67 },
  { name: "北海", minLon: -5, maxLon: 10, minLat: 51, maxLat: 62 },
  { name: "英吉利海峡", minLon: -6, maxLon: 3, minLat: 48, maxLat: 51.5 },
  { name: "比斯开湾", minLon: -13, maxLon: 0, minLat: 43, maxLat: 48.5 },
  { name: "亚得里亚海", minLon: 12, maxLon: 20, minLat: 38, maxLat: 46 },
  { name: "爱琴海", minLon: 20, maxLon: 28, minLat: 34, maxLat: 41 },
  { name: "黑海", minLon: 27, maxLon: 42, minLat: 40, maxLat: 48 },
  { name: "地中海西部", minLon: -6, maxLon: 9, minLat: 34, maxLat: 44 },
  { name: "地中海中部", minLon: 9, maxLon: 16, minLat: 30, maxLat: 44 },
  { name: "东地中海", minLon: 16, maxLon: 30, minLat: 30, maxLat: 40 },
  { name: "大西洋", minLon: -30, maxLon: 0, minLat: 32, maxLat: 58 },
];

/**
 * @param {Array<{index:number,coords:any}>} landUnits 陆地原始行政单元
 * @returns {{zones:Array, landAdjacency:Map<number,string[]>}}
 */
export function buildSeaZones(landUnits, opts = {}) {
  const step = opts.step ?? 1.2;
  const targetZones = opts.targetZones ?? 9;
  const empty = { zones: [], landAdjacency: new Map() };
  if (!landUnits.length) return empty;

  const index = landUnits.map((u) => ({ idx: u.index, coords: u.coords, bbox: bboxOf(u.coords) }));
  const all = bboxOf(index.flatMap((u) => u.coords));
  const minLon = all.minLon - step, maxLon = all.maxLon + step;
  const minLat = all.minLat - step, maxLat = all.maxLat + step;
  const cols = Math.max(1, Math.ceil((maxLon - minLon) / step));
  const rows = Math.max(1, Math.ceil((maxLat - minLat) / step));

  const inLand = (x, y) =>
    index.some((u) =>
      x >= u.bbox.minLon && x <= u.bbox.maxLon && y >= u.bbox.minLat && y <= u.bbox.maxLat &&
      pointInMultiPolygon(x, y, u.coords));

  const cells = [];
  const key = (r, c) => r + "," + c;
  const cellMap = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = minLon + c * step, y0 = minLat + r * step;
      const cx = x0 + step / 2, cy = y0 + step / 2;
      if (inLand(cx, cy)) continue;
      const cell = { r, c, x0, y0, cx, cy };
      cells.push(cell);
      cellMap.set(key(r, c), cell);
    }
  }
  if (!cells.length) return empty;

  const pos = new Map(cells.map((cell, i) => [cell, i]));
  const adj = cells.map(() => []);
  for (const cell of cells) {
    const i = pos.get(cell);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = cellMap.get(key(cell.r + dr, cell.c + dc));
      if (n) adj[i].push(pos.get(n));
    }
  }

  const clusterInput = cells.map((cell, i) => ({
    index: i, centroid: { x: cell.cx, y: cell.cy }, area: step * step,
  }));
  const groups = clusterUnits(clusterInput, adj, Math.min(targetZones, cells.length));

  // 每个海区相邻的陆地省
  const zones = [];
  const landAdjacency = new Map(); // landUnitIndex -> [zoneId]
  groups.forEach((group, gi) => {
    const zoneId = "SEA-" + (gi + 1);
    const zoneCells = group.map((i) => cells[i]);
    const touching = new Set();
    for (const cell of zoneCells) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cell.cx + dc * step, ny = cell.cy + dr * step;
        for (const u of index) {
          if (nx < u.bbox.minLon || nx > u.bbox.maxLon || ny < u.bbox.minLat || ny > u.bbox.maxLat) continue;
          if (pointInMultiPolygon(nx, ny, u.coords)) touching.add(u.idx);
        }
      }
    }
    touching.forEach((li) => {
      const arr = landAdjacency.get(li) ?? [];
      arr.push(zoneId);
      landAdjacency.set(li, arr);
    });

    // 几何：逐格减去陆地（避免大范围布尔并集带来的退化多边形）
    const polys = [];
    for (const cell of zoneCells) {
      const x0 = cell.x0, y0 = cell.y0;
      const sq = [[[[x0, y0], [x0 + step, y0], [x0 + step, y0 + step], [x0, y0 + step], [x0, y0]]]];
      const near = index.filter((u) =>
        u.bbox.maxLon >= x0 - 0.2 && u.bbox.minLon <= x0 + step + 0.2 &&
        u.bbox.maxLat >= y0 - 0.2 && u.bbox.minLat <= y0 + step + 0.2);
      let piece = sq;
      if (near.length) {
        try { piece = pc.difference(sq, ...near.map((u) => u.coords)); }
        catch { piece = sq; }
      }
      for (const poly of piece) {
        if (!poly.length || poly[0].length < 4) continue;
        const ok = poly.every((ring) => ring.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
        if (ok) polys.push(normalizePolygon(poly));
      }
    }
    const coords = polys;
    if (!coords.length) return;
    const centroid = multiPolygonCentroid(coords);
    const area = multiPolygonArea(coords);
    const named = SEA_NAMES.find((s) => centroid.x >= s.minLon && centroid.x <= s.maxLon && centroid.y >= s.minLat && centroid.y <= s.maxLat);
    const strait = touching.size >= 2 && zoneCells.length <= 8;
    zones.push({
      id: zoneId,
      name: named ? named.name : "海域 " + (gi + 1),
      kind: "sea",
      seaType: strait ? "strait" : touching.size ? "near_sea" : "deep_sea",
      coords, centroid, area, cells: zoneCells.length,
    });
  });

  // 海区之间的邻接（网格相邻）
  const zoneOfCell = new Map();
  groups.forEach((group, gi) => group.forEach((i) => zoneOfCell.set(i, groups[gi] && "SEA-" + (gi + 1))));
  const zoneAdj = new Map(zones.map((z) => [z.id, new Set()]));
  for (const cell of cells) {
    const i = pos.get(cell);
    const zi = zoneOfCell.get(i);
    for (const j of adj[i]) {
      const zj = zoneOfCell.get(j);
      if (zi && zj && zi !== zj) { zoneAdj.get(zi)?.add(zj); zoneAdj.get(zj)?.add(zi); }
    }
  }
  for (const z of zones) z.neighbors = [...(zoneAdj.get(z.id) ?? [])];

  return { zones, landAdjacency };
}