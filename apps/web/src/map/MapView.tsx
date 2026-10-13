import { useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { ProvinceProps } from "./types";

interface Props {
  topo: any;
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (p: ProvinceProps) => void;
}

export function MapView({ topo, width, height, selectedId, onSelect }: Props) {
  const [hover, setHover] = useState<{ p: ProvinceProps; x: number; y: number } | null>(null);

  const { features, borders, path } = useMemo(() => {
    if (!topo) return { features: [] as any[], borders: null as any, path: null as any };
    const fc = feature(topo, topo.objects.provinces) as any;
    const borders = mesh(topo, topo.objects.provinces, (a: any, b: any) => a !== b);
    const projection = geoMercator().fitExtent(
      [[26, 26], [Math.max(50, width - 26), Math.max(50, height - 26)]],
      fc,
    );
    return { features: fc.features as any[], borders, path: geoPath(projection) };
  }, [topo, width, height]);

  return (
    <div className="map-wrap">
      <svg width={width} height={height} className="map-svg">
        <rect width={width} height={height} className="sea" />
        {features.map((f) => {
          const p = f.properties as ProvinceProps;
          const cls = "province" + (p.id === selectedId ? " selected" : "") + (p.ownerAtStart ? "" : " neutral");
          return (
            <path
              key={p.id}
              d={path(f) || undefined}
              className={cls}
              fill={p.color}
              onClick={() => onSelect(p)}
              onMouseMove={(e) => setHover({ p, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        {borders && <path d={path(borders) || undefined} className="borders" fill="none" />}
      </svg>

      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{hover.p.name}</strong>
          <div>{hover.p.ownerAtStart ? hover.p.ownerAtStart : "空白未占领"}</div>
        </div>
      )}
    </div>
  );
}