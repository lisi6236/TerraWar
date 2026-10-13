import { feature } from "topojson-client";
import type { MapData, Province } from "@terrawar/shared";
import type { MapMeta } from "../map/types";

/** 把 mapgen 生成的 TopoJSON 转成引擎需要的静态地图数据 */
export function topologyToMapData(topo: any, meta: MapMeta): MapData {
  const fc = feature(topo, topo.objects.provinces) as any;
  const provinces: Province[] = (fc.features as any[]).map((f) => {
    const p = f.properties;
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      terrain: p.terrain,
      ownerAtStart: p.ownerAtStart ?? null,
      isCapital: !!p.isCapital,
      isCore: !!p.isCore,
      isChoke: !!p.isChoke,
      base: p.base,
      population: p.population,
      defenseBonus: p.defenseBonus,
      adjacency: p.adjacency ?? [],
      sourceUnits: p.sourceUnits ?? [],
    };
  });
  return {
    id: meta.id,
    name: meta.name,
    difficulty: meta.difficulty,
    playable: meta.playable,
    nations: meta.nations,
    provinces,
  };
}