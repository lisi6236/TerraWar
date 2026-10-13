// 将同一国家的若干原始行政单元聚类成 k 个连续省份
// 算法：自底向上凝聚聚类（只合并相邻组，取质心距离最小的组合并）

import { distance, multiPolygonCentroid, multiPolygonArea } from "./geo.mjs";

/**
 * @param {Array} units       每个元素：{ index, coords, centroid, area }
 * @param {Array<Array<number>>} adjacency  单元索引的邻接表
 * @param {number} k          目标分组数
 * @returns {Array<Array<number>>} 每个分组包含的单元索引
 */
export function clusterUnits(units, adjacency, k) {
  const n = units.length;
  if (k >= n) return units.map((u) => [u.index]);

  let groups = units.map((u, i) => ({
    members: [i],
    centroid: u.centroid,
    area: Math.max(u.area, 1e-6),
  }));

  // 组级邻接（用 Set 存索引对）
  const gAdj = groups.map(() => new Set());
  const link = (i, j) => { gAdj[i].add(j); gAdj[j].add(i); };
  for (let i = 0; i < n; i++) for (const j of adjacency[i]) if (j > i) link(i, j);

  let groupOf = groups.map((_, i) => i); // 单元 -> 组（含并查式重映射）
  let aliveCount = groups.length;

  while (aliveCount > k) {
    let best = null;
    const alive = [];
    for (let i = 0; i < groups.length; i++) if (groups[i]) alive.push(i);

    for (const i of alive) {
      for (const j of gAdj[i]) {
        if (j <= i || !groups[j]) continue;
        const c = distance(groups[i].centroid, groups[j].centroid);
        if (!best || c < best.cost) best = { i, j, cost: c };
      }
    }
    if (!best) {
      // 出现孤立组（理论上不应发生，岛国用距离邻接兜底）：取全局最近的活组
      for (const i of alive) for (const j of alive) {
        if (j <= i) continue;
        const c = distance(groups[i].centroid, groups[j].centroid);
        if (!best || c < best.cost) best = { i, j, cost: c };
      }
      if (!best) break;
    }

    const { i, j } = best;
    const a = groups[i], b = groups[j];
    const total = a.area + b.area;
    const ni = {
      members: a.members.concat(b.members),
      centroid: {
        x: (a.centroid.x * a.area + b.centroid.x * b.area) / total,
        y: (a.centroid.y * a.area + b.centroid.y * b.area) / total,
      },
      area: total,
    };
    groups[i] = ni;
    groups[j] = null;
    aliveCount -= 1;
    for (const m of b.members) groupOf[m] = i;
    for (const t of gAdj[j]) { if (t !== i) { gAdj[i].add(t); gAdj[t].add(i); } gAdj[t].delete(j); }
    gAdj[j] = new Set();
  }

  return groups.filter(Boolean).map((g) => g.members.map((m) => units[m].index));
}

export function recomputeCentroid(coordsList) {
  const merged = [];
  for (const c of coordsList) merged.push(...c);
  return { centroid: multiPolygonCentroid(merged), area: multiPolygonArea(merged) };
}