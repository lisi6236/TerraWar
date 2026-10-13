import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { GameState, MapData, Order } from "@terrawar/shared";
import {
  computeEconomy, createGame, endTurn, indexMap, reachableProvinces, unitsIn, validateOrders,
} from "@terrawar/engine";
import { MapView } from "../map/MapView";
import { TERRAIN_LABEL } from "../map/types";

interface Props {
  topo: any;
  mapData: MapData;
  seed: number;
  onExit: () => void;
}

function useSize(ref: RefObject<HTMLDivElement>) {
  const [size, setSize] = useState({ width: 900, height: 700 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

const LOG_LABEL: Record<string, string> = {
  move: "移动", block: "受阻", occupy: "占领", annex: "吞并", economy: "财政", system: "系统",
};

export function GameScreen({ topo, mapData, seed, onExit }: Props) {
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const size = useSize(mapBoxRef);
  const mapIndex = useMemo(() => indexMap(mapData), [mapData]);
  const [state, setState] = useState<GameState>(() => createGame(mapData, { seed }));
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);

  const player = state.nations[state.playerNation];
  const reachable = useMemo(
    () => (selectedUnitId ? reachableProvinces(state, mapIndex, selectedUnitId) : []),
    [state, mapIndex, selectedUnitId],
  );
  const econ = useMemo(() => computeEconomy(state, mapIndex, state.playerNation), [state, mapIndex]);

  const ownedCount = useMemo(
    () => Object.values(state.provinces).filter((p) => p.owner === state.playerNation).length,
    [state, state.playerNation],
  );

  function handleUnitClick(id: string) {
    const u = state.units[id];
    if (!u || u.owner !== state.playerNation) return;
    // 再次点击同一单位 => 取消其待执行指令
    setOrders((prev) => prev.filter((o) => o.unitId !== id));
    setSelectedUnitId((prev) => (prev === id ? null : id));
    setSelectedProvinceId(u.province);
  }

  function handleProvinceClick(id: string) {
    if (selectedUnitId && reachable.includes(id)) {
      setOrders((prev) => [
        ...prev.filter((o) => o.unitId !== selectedUnitId),
        { type: "move", unitId: selectedUnitId, to: id },
      ]);
      setSelectedUnitId(null);
      setSelectedProvinceId(id);
      return;
    }
    const mine = unitsIn(state, id).filter((u) => u.owner === state.playerNation);
    if (mine.length) {
      setSelectedUnitId(mine[0].id);
      setSelectedProvinceId(id);
      return;
    }
    setSelectedUnitId(null);
    setSelectedProvinceId(id);
  }

  function handleEndTurn() {
    const errs = validateOrders(state, mapIndex, orders);
    if (errs.length) { window.alert(errs.join("\n")); return; }
    setState(endTurn(state, mapIndex, orders));
    setOrders([]);
    setSelectedUnitId(null);
  }

  const selUnit = selectedUnitId ? state.units[selectedUnitId] : null;
  const selProv = selectedProvinceId ? state.provinces[selectedProvinceId] : null;
  const selProvStatic = selectedProvinceId ? mapIndex.byId[selectedProvinceId] : null;
  const recentLogs = state.log.slice(-24).reverse();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">TerraWar <span>{mapData.name}</span></div>
        <div className="meta">
          第 <b>{state.turn}</b> 回合 · 你指挥 <b style={{ color: player?.color }}>{player?.name}</b>
          （{ownedCount} 省）
        </div>
        <button className="ghost" onClick={onExit} style={{ marginLeft: "auto" }}>返回菜单</button>
      </header>

      <div className="body">
        <div className="map-area" ref={mapBoxRef}>
          <MapView
            topo={topo}
            mapData={mapData}
            state={state}
            width={size.width}
            height={size.height}
            selectedUnitId={selectedUnitId}
            selectedProvinceId={selectedProvinceId}
            reachable={reachable}
            onProvinceClick={handleProvinceClick}
            onUnitClick={handleUnitClick}
          />
        </div>

        <aside className="panel">
          <h3>资源</h3>
          <div className="res">
            <span>钢铁 <b>{Math.round(player?.resources.steel ?? 0)}</b></span>
            <span>石油 <b>{Math.round(player?.resources.oil ?? 0)}</b></span>
            <span>粮食 <b>{Math.round(player?.resources.food ?? 0)}</b></span>
            <span>资金 <b>{Math.round(player?.resources.fund ?? 0)}</b></span>
          </div>
          <div className="hint small">
            每回合产出：钢 {Math.round(econ.yields.steel)} · 油 {Math.round(econ.yields.oil)} · 粮 {Math.round(econ.yields.food)} · 资金 {Math.round(econ.yields.fund)}；
            维护 资金 {econ.upkeep.fund} / 油 {econ.upkeep.oil} / 粮 {econ.upkeep.food}
          </div>

          <h3>选中</h3>
          {selUnit && (
            <div className="hint">
              军团 {selUnit.id}（{Math.round(selUnit.strength)} 战力，士气 {Math.round(selUnit.morale)}）<br />
              位于 {mapIndex.byId[selUnit.province]?.name}<br />
              可移动：{reachable.length} 个相邻地块（点击目标地块下达移动指令）
            </div>
          )}
          {!selUnit && selProv && selProvStatic && (
            <dl>
              <dt>地块</dt><dd>{selProvStatic.name}</dd>
              <dt>归属</dt><dd>{selProv.owner ? state.nations[selProv.owner]?.name : "空白未占领区"}</dd>
              <dt>地形</dt><dd>{TERRAIN_LABEL[selProvStatic.terrain]}（防御 ×{selProvStatic.defenseBonus}）</dd>
              <dt>抵抗值</dt><dd>{Math.round(selProv.resistance)}</dd>
              <dt>驻军</dt><dd>{unitsIn(state, selProvStatic.id).length} / 2</dd>
              <dt>产出</dt><dd>钢{selProvStatic.base.steel} 油{selProvStatic.base.oil} 粮{selProvStatic.base.food} 资{selProvStatic.base.fund}</dd>
            </dl>
          )}
          {!selUnit && !selProv && <p className="hint">点击你的军团选择，再点击相邻地块下达移动指令。</p>}

          <h3>待执行指令（{orders.length}）</h3>
          <ul className="orders">
            {orders.map((o) => (
              <li key={o.unitId}>
                {o.unitId} → {mapIndex.byId[o.to]?.name}
                <button className="mini" onClick={() => setOrders((p) => p.filter((x) => x.unitId !== o.unitId))}>取消</button>
              </li>
            ))}
            {!orders.length && <li className="hint">暂无指令</li>}
          </ul>

          <button className="primary" onClick={handleEndTurn}>结束回合 ▶</button>

          <h3>战报</h3>
          <ul className="log">
            {recentLogs.map((l, i) => (
              <li key={i}>
                <span className={"k k-" + l.kind}>{LOG_LABEL[l.kind] ?? l.kind}</span>
                <span className="t">T{l.turn}</span> {l.text}
              </li>
            ))}
            {!recentLogs.length && <li className="hint">暂无事件</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}