// 士气修正：按文档 4 个锚点线性插值（士气 100→1.1 / 70→1.0 / 40→0.8 / 20→0.5）
import { MORALE_ANCHORS } from "@terrawar/shared";

export function moraleModifier(morale: number): number {
  const a = MORALE_ANCHORS;
  const first = a[0], last = a[a.length - 1];
  if (morale <= first[0]) return first[1];
  if (morale >= last[0]) return last[1];
  for (let i = 1; i < a.length; i++) {
    const [m0, v0] = a[i - 1];
    const [m1, v1] = a[i];
    if (morale <= m1) return v0 + ((v1 - v0) * (morale - m0)) / (m1 - m0);
  }
  return last[1];
}
