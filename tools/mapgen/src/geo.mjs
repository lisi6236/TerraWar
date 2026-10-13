// 平面几何工具（lon/lat 上用鞋带公式，足够用于相对面积与聚类的代价计算）

export function toMultiPolygon(geom) {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates];
  if (geom.type === "MultiPolygon") return geom.coordinates;
  return [];
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    a += p1[0] * p2[1] - p2[0] * p1[1];
  }
  return a / 2;
}

export function multiPolygonArea(coords) {
  let a = 0;
  for (const poly of coords) {
    a += Math.abs(ringArea(poly[0]));
    for (let i = 1; i < poly.length; i++) a -= Math.abs(ringArea(poly[i]));
  }
  return Math.max(a, 0);
}

function polygonCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    const cross = p1[0] * p2[1] - p2[0] * p1[1];
    a += cross;
    cx += (p1[0] + p2[0]) * cross;
    cy += (p1[1] + p2[1]) * cross;
  }
  if (a === 0) return null;
  return { x: cx / (3 * a), y: cy / (3 * a), area: Math.abs(a / 2) };
}

export function multiPolygonCentroid(coords) {
  let sx = 0, sy = 0, sa = 0;
  for (const poly of coords) {
    const c = polygonCentroid(poly[0]);
    if (!c) continue;
    sx += c.x * c.area; sy += c.y * c.area; sa += c.area;
  }
  if (sa === 0) return { x: 0, y: 0 };
  return { x: sx / sa, y: sy / sa };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function mergeMultiPolygons(list) {
  const out = [];
  for (const mp of list) for (const poly of mp) out.push(poly);
  return out;
}