import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { MapView } from "./map/MapView";
import { TERRAIN_LABEL, type MapMeta, type ProvinceProps } from "./map/types";
import { loadMapIndex, loadTopology } from "./api/maps";

function useSize(ref: RefObject<HTMLDivElement>) {
  const [size, setSize] = useState({ width: 800, height: 600 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export default function App() {
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const size = useSize(mapBoxRef);
  const [metas, setMetas] = useState<MapMeta[]>([]);
  const [mapId, setMapId] = useState("");
  const [topo, setTopo] = useState<any>(null);
  const [selected, setSelected] = useState<ProvinceProps | null>(null);
  const [status, setStatus] = useState("加载中…");

  useEffect(() => {
    loadMapIndex()
      .then((m) => {
        setMetas(m);
        if (m.length) setMapId(m[0].id);
        if (!m.length) setStatus("尚未生成地图数据，请先运行 pnpm mapgen");
      })
      .catch((e) => setStatus(String(e.message || e)));
  }, []);

  useEffect(() => {
    const meta = metas.find((m) => m.id === mapId);
    if (!meta) return;
    setSelected(null);
    setStatus("加载地图 " + meta.name + " …");
    loadTopology(meta.file)
      .then((t) => { setTopo(t); setStatus(""); })
      .catch((e) => setStatus(String(e.message || e)));
  }, [mapId, metas]);

  const meta = metas.find((m) => m.id === mapId);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">TerraWar <span>地缘战争</span></div>
        <div className="maps">
          {metas.map((m) => (
            <button key={m.id} className={m.id === mapId ? "active" : ""} onClick={() => setMapId(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
        <div className="meta">{meta ? meta.provinceCount + " 个省" : ""}</div>
      </header>

      <div className="body">
        <div className="map-area" ref={mapBoxRef}>
          {status && <div className="status">{status}</div>}
          {topo && <MapView topo={topo} width={size.width} height={size.height} selectedId={selected?.id ?? null} onSelect={setSelected} />}
        </div>

        <aside className="panel">
          <h3>地块信息</h3>
          {!selected && <p className="hint">点击地图上的省份查看详情</p>}
          {selected && (
            <dl>
              <dt>名称</dt><dd>{selected.name}{selected.isCapital ? "（首都）" : ""}</dd>
              <dt>归属</dt><dd>{selected.ownerAtStart ?? "空白未占领区"}</dd>
              <dt>地形</dt><dd>{TERRAIN_LABEL[selected.terrain] ?? selected.terrain}（防御 ×{selected.defenseBonus}）</dd>
              <dt>人口</dt><dd>{selected.population}</dd>
              <dt>产出/回合</dt>
              <dd>钢 {selected.base.steel} · 油 {selected.base.oil} · 粮 {selected.base.food} · 资金 {selected.base.fund}{selected.isCore ? "（核心资源区 ×3）" : ""}</dd>
              <dt>相邻地块</dt><dd>{selected.adjacency.length} 个</dd>
              <dt>组成行政区</dt><dd className="small">{selected.sourceUnits.join("、")}</dd>
            </dl>
          )}

          {meta && (
            <>
              <h3>参战国</h3>
              <ul className="legend">
                {meta.playable.map((iso) => (
                  <li key={iso}>
                    <span className="swatch" style={{ background: meta.nations[iso]?.color }} />
                    {meta.nations[iso]?.name ?? iso}
                  </li>
                ))}
                <li><span className="swatch" style={{ background: "#c9c3b4" }} />空白未占领区</li>
              </ul>
            </>
          )}

          <h3>阶段</h3>
          <p className="hint">M0：静态地图渲染（数据集 + 省份划分 + 交互）。回合引擎从 M1 开始。</p>
        </aside>
      </div>
    </div>
  );
}