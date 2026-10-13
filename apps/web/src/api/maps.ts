import type { MapMeta } from "../map/types";

export async function loadMapIndex(): Promise<MapMeta[]> {
  const res = await fetch("maps.json");
  if (!res.ok) throw new Error("无法加载 maps.json（请先运行 pnpm mapgen 生成地图数据）");
  const json = await res.json();
  return json.maps as MapMeta[];
}

export async function loadTopology(file: string): Promise<any> {
  const res = await fetch(file);
  if (!res.ok) throw new Error("无法加载地图文件 " + file);
  return res.json();
}