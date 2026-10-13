import { useMemo, useState } from "react";
import { geoCentroid, geoMercator, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GameState, MapData } from "@terrawar/shared";
import { NEUTRAL_FALLBACK, TERRAIN_TONE } from "../game/colors";

interface Props {
  topo: any;
  mapData: MapData;
  state: GameState;
  width: number;
  height: number;
  selectedUnitId: string | null;
  selectedProvinceId: string | null;
  reachable: string[];
  onProvinceClick: (id: string) => void;
  onUnitClick: (id: string) => void;
}

export function MapView({
  topo, mapData, state, width, height,
  selectedUnitId, selectedProvinceId, reachable, onProvinceClick, onUnitClick,
}: Props) {
  const [hover, setHover] = useState<{ text: string; sub: string; x: number; y: number } | null>(null);

  const { features, borders, path, projection, centroidById } = useMemo(() => {
    const fc = feature(topo, topo.objects.provinces) as any;
    const borders = mesh(topo, topo.objects.provinces, (a: any, b: any) => a !== b);
    const projection = geoMercator().fitExtent(
      [[26, 26], [Math.max(50, width - 26), Math.max(50, height - 26)]],
      fc,
    );
    const centroidById = new Map<string, [number, number]>();
    for (const f of fc.features) {
      const c = projection(geoCentroid(f));
      if (c) centroidById.set(f.properties.id, [c[0], c[1]]);
    }
    return { features: fc.features as any[], borders, path: geoPath(projection), projection, centroidById };
  }, [topo, width, height]);

  const staticById = useMemo(() => {
    const m = new Map<string, MapData["provinces"][number]>();
    for (const p of mapData.provinces) m.set(p.id, p);
    return m;
  }, [mapData]);

  const unitsByProvince = useMemo(() => {
    const m = new Map<string, { id: string; owner: string; strength: number }[]>();
    for (const u of Object.values(state.units)) {
      const arr = m.get(u.province) ?? [];
      arr.push({ id: u.id, owner: u.owner, strength: u.strength });
      m.set(u.province, arr);
    }
    return m;
  }, [state.units]);

  const reachSet = new Set(reachable);

  return (
    <div className="map-wrap">
      <svg width={width} height={height} className="map-svg">
        <rect width={width} height={height} className="sea" />

        {features.map((f) => {
          const id: string = f.properties.id;
          const stat = staticById.get(id);
          const rt = state.provinces[id];
          const owner = rt?.owner ?? null;
          const fill = owner
            ? state.nations[owner]?.color ?? NEUTRAL_FALLBACK
            : TERRAIN_TONE[stat?.terrain ?? "plain"] ?? NEUTRAL_FALLBACK;
          const cls = [
            "province",
            owner ? "" : "neutral",
            id === selectedProvinceId ? "selected" : "",
            reachSet.has(id) ? "reachable" : "",
          ].filter(Boolean).join(" ");
          return (
            <path
              key={id}
              d={path(f) || undefined}
              className={cls}
              fill={fill}
              onClick={() => onProvinceClick(id)}
              onMouseMove={(e) =>
                setHover({
                  text: stat?.name ?? id,
                  sub: owner ? state.nations[owner]?.name ?? owner : "空白未占领区",
                  x: e.clientX, y: e.clientY,
                })
              }
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {borders && <path d={path(borders) || undefined} className="borders" fill="none" />}

        {features
          .filter((f) => staticById.get(f.properties.id)?.isCapital)
          .map((f) => {
            const c = centroidById.get(f.properties.id);
            if (!c) return null;
            return (
              <g key={"cap-" + f.properties.id} className="capital">
                <circle cx={c[0]} cy={c[1]} r={5} />
                <circle cx={c[0]} cy={c[1]} r={2} className="capital-core" />
              </g>
            );
          })}

        {[...unitsByProvince.entries()].map(([provinceId, list]) => {
          const c = centroidById.get(provinceId);
          if (!c) return null;
          return list.map((u, i) => {
            const dx = (i - (list.length - 1) / 2) * 13;
            const isPlayer = state.nations[u.owner]?.isPlayer;
            return (
              <g
                key={u.id}
                className={"unit" + (u.id === selectedUnitId ? " selected" : "") + (isPlayer ? " mine" : "")}
                transform={`translate(${c[0] + dx}, ${c[1]})`}
                onClick={(e) => { e.stopPropagation(); onUnitClick(u.id); }}
              >
                <circle r={7} fill={state.nations[u.owner]?.color ?? "#888"} />
                <circle r={7} className="unit-ring" />
                <text y={3} className="unit-label">{Math.round(u.strength)}</text>
              </g>
            );
          });
        })}
      </svg>

      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{hover.text}</strong>
          <div>{hover.sub}</div>
        </div>
      )}
      {void projection}
    </div>
  );
}