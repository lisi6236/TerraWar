import { useMemo, useState } from "react";
import { geoCentroid, geoMercator, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GameState, MapData, Order } from "@terrawar/shared";
import { NEUTRAL_FALLBACK, TERRAIN_TONE } from "../game/colors";

interface Props {
  topo: any;
  mapData: MapData;
  state: GameState;
  orders: Order[];
  width: number;
  height: number;
  selectedUnitId: string | null;
  selectedProvinceId: string | null;
  reachable: string[];
  onProvinceClick: (id: string, ctrlKey: boolean) => void;
  onUnitClick: (id: string) => void;
}

export function MapView({
  topo, mapData, state, orders, width, height,
  selectedUnitId, selectedProvinceId, reachable, onProvinceClick, onUnitClick,
}: Props) {
  const [hover, setHover] = useState<{ text: string; sub: string; x: number; y: number } | null>(null);

  const geo = useMemo(() => {
    const fc = feature(topo, topo.objects.provinces) as any;
    const projection = geoMercator().fitExtent(
      [[26, 26], [Math.max(50, width - 26), Math.max(50, height - 26)]],
      fc,
    );
    const centroidById = new Map<string, [number, number]>();
    for (const f of fc.features) {
      const c = projection(geoCentroid(f));
      if (c) centroidById.set(f.properties.id, [c[0], c[1]]);
    }
    return { features: fc.features as any[], path: geoPath(projection), centroidById };
  }, [topo, width, height]);

  const staticById = useMemo(() => {
    const m = new Map<string, MapData["provinces"][number]>();
    for (const p of mapData.provinces) m.set(p.id, p);
    return m;
  }, [mapData]);

  const ownerOf = (id: string) => state.provinces[id]?.owner ?? null;

  // 省界（只在省份之间）
  const borders = useMemo(() => mesh(topo, topo.objects.provinces, (a: any, b: any) => a !== b), [topo]);

  // 玩家领土轮廓（含海岸线）：玩家地块与非玩家地块之间的弧
  const playerOutline = useMemo(() => {
    const isMine = (g: any) => !!g && ownerOf(g.properties.id) === state.playerNation;
    return mesh(topo, topo.objects.provinces, (a: any, b: any) => isMine(a) !== isMine(b));
  }, [topo, state.provinces, state.playerNation]);

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
        <defs>
          <marker id="arrow-move" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 z" fill="#d9a441" />
          </marker>
          <marker id="arrow-attack" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 z" fill="#e0603f" />
          </marker>
        </defs>
        <rect width={width} height={height} className="sea" />

        {geo.features.map((f) => {
          const id: string = f.properties.id;
          const stat = staticById.get(id);
          const owner = ownerOf(id);
          const fill = owner
            ? state.nations[owner]?.color ?? NEUTRAL_FALLBACK
            : TERRAIN_TONE[(stat?.terrain ?? "plain") as keyof typeof TERRAIN_TONE] ?? NEUTRAL_FALLBACK;
          const cls = [
            "province",
            owner ? "" : "neutral",
            id === selectedProvinceId ? "selected" : "",
            reachSet.has(id) ? "reachable" : "",
          ].filter(Boolean).join(" ");
          return (
            <path
              key={id}
              d={geo.path(f) || undefined}
              className={cls}
              fill={fill}
              onClick={(e) => onProvinceClick(id, e.ctrlKey || e.metaKey)}
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

        <path d={geo.path(borders) || undefined} className="borders" fill="none" />
        <path d={geo.path(playerOutline) || undefined} className="player-outline" fill="none" />

        {geo.features
          .filter((f) => staticById.get(f.properties.id)?.isCapital)
          .map((f) => {
            const c = geo.centroidById.get(f.properties.id);
            if (!c) return null;
            return (
              <g key={"cap-" + f.properties.id} className="capital">
                <circle cx={c[0]} cy={c[1]} r={5} />
                <circle cx={c[0]} cy={c[1]} r={2} className="capital-core" />
              </g>
            );
          })}

        {[...unitsByProvince.entries()].map(([provinceId, list]) => {
          const c = geo.centroidById.get(provinceId);
          if (!c) return null;
          return list.map((u, i) => {
            const dx = (i - (list.length - 1) / 2) * 15;
            const isMine = state.nations[u.owner]?.isPlayer;
            return (
              <g
                key={u.id}
                className={"unit" + (u.id === selectedUnitId ? " selected" : "") + (isMine ? " mine" : "")}
                transform={`translate(${c[0] + dx}, ${c[1]})`}
                onClick={(e) => { e.stopPropagation(); onUnitClick(u.id); }}
              >
                <circle r={8} fill={state.nations[u.owner]?.color ?? "#888"} />
                <circle r={8} className="unit-ring" />
                <text y={3} className="unit-label">{Math.round(u.strength)}</text>
              </g>
            );
          });
        })}

        {orders.map((o) => {
          const u = state.units[o.unitId];
          if (!u) return null;
          const a = geo.centroidById.get(u.province);
          const b = geo.centroidById.get(o.to);
          if (!a || !b) return null;
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const x1 = a[0] + ux * 14, y1 = a[1] + uy * 14;
          const x2 = b[0] - ux * 14, y2 = b[1] - uy * 14;
          const isAttack = Object.values(state.units).some((x) => x.province === o.to && x.owner !== u.owner);
          return (
            <g key={"ord-" + o.unitId} className={"order-arrow" + (isAttack ? " attack" : "")}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                markerEnd={isAttack ? "url(#arrow-attack)" : "url(#arrow-move)"}
              />
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6}>
                {Math.round(o.strength ?? u.strength)}
              </text>
            </g>
          );
        })}
      </svg>

      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{hover.text}</strong>
          <div>{hover.sub}</div>
        </div>
      )}
    </div>
  );
}
