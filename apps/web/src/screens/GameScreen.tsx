import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { GameState, MapData, Order } from "@terrawar/shared";
import {
  computeEconomy, createGame, endTurn, indexMap, reachableProvinces, unitsIn, validateOrders,
} from "@terrawar/engine";
import { MapView } from "../map/MapView";
import { TERRAIN_LABEL } from "../map/types";
import { SPLIT_STEP } from "@terrawar/shared";

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
  move: "移动", block: "受阻", occupy: "占领", annex: "吞并",
  battle: "战斗", merge: "合兵", economy: "财政", system: "系统",
};

const LAND_CAP = 200;

export function GameScreen({ topo, mapData, seed, onExit }: Props) {
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const size = useSize(mapBoxRef);
  const mapIndex = useMemo(() => indexMap(mapData), [mapData]);
  const [state, setState] = useState<GameState>(() => createGame(mapData, { seed }));
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [split, setSplit] = useState<{ unitId: string; to: string; max: number; attack: boolean } | null>(null);
  const [splitAmount, setSplitAmount] = useState(SPLIT_STEP);

  const player = state.nations[state.playerNation];
  const reachable = useMemo(
    () => (selectedUnitId ? reachableProvinces(state, mapIndex, selectedUnitId) : []),
    [state, mapIndex, selectedUnitId],
  );
  const econ = useMemo(() => computeEconomy(state, mapIndex, state.playerNation), [state, mapIndex]);
  const ownedCount = Object.values(state.provinces).filter((p) => p.owner === state.playerNation).length;

  function strengthAt(provinceId: string, owner: string) {
    return unitsIn(state, provinceId).filter((u) => u.owner === owner).reduce((s, u) => s + u.strength, 0);
  }
  function hasEnemy(provinceId: string, owner: string) {
    return unitsIn(state, provinceId).some((u) => u.owner !== owner);
  }

  function addOrder(o: Order) {
    setOrders((prev) => [...prev.filter((x) => x.unitId !== o.unitId), o]);
  }

  function handleUnitClick(id: string) {
    const u = state.units[id];
    if (!u || u.owner !== state.playerNation) return;
    setOrders((prev) => prev.filter((o) => o.unitId !== id));
    setSelectedUnitId((prev) => (prev === id ? null : id));
    setSelectedProvinceId(u.province);
  }

  function openSplit(unitId: string, to: string, attack: boolean) {
    const u = state.units[unitId];
    if (!u) return;
    const room = attack ? u.strength : Math.max(0, LAND_CAP - strengthAt(to, u.owner));
    const max = Math.floor(Math.min(u.strength, room) / SPLIT_STEP) * SPLIT_STEP;
    if (max < SPLIT_STEP) {
      window.alert("该地块驻军空间不足（上限 200），无法派兵进入。");
      return;
    }
    setSplit({ unitId, to, max, attack });
    setSplitAmount(max);
  }

  function handleProvinceClick(id: string, ctrlKey: boolean) {
    if (selectedUnitId && reachable.includes(id)) {
      const u = state.units[selectedUnitId];
      const attack = hasEnemy(id, u.owner);
      if (ctrlKey) { openSplit(u.id, id, attack); return; }
      if (!attack && u.strength > LAND_CAP - strengthAt(id, u.owner)) {
        openSplit(u.id, id, attack);   // 整建制放不下 -> 自动进入分兵
        return;
      }
      addOrder({ type: "move", unitId: u.id, to: id });
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

  function confirmSplit() {
    if (!split) return;
    const u = state.units[split.unitId];
    addOrder(splitAmount >= u.strength
      ? { type: "move", unitId: split.unitId, to: split.to }
      : { type: "move", unitId: split.unitId, to: split.to, strength: splitAmount });
    setSplit(null);
    setSelectedUnitId(null);
    setSelectedProvinceId(split.to);
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
  const recentLogs = state.log.slice(-26).reverse();
  const others = Object.values(state.nations).filter((n) => n.id !== state.playerNation);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">TerraWar</div>
        <div className="you">
          你指挥
          <span className="swatch" style={{ background: player?.color }} />
          <b>{player?.name}</b>
        </div>
        <div className="meta">第 <b>{state.turn}</b> 回合 · 领土 {ownedCount} 省</div>
        <button className="ghost" onClick={onExit} style={{ marginLeft: "auto" }}>返回菜单</button>
      </header>

      <div className="body">
        <div className="map-area" ref={mapBoxRef}>
          <MapView
            topo={topo}
            mapData={mapData}
            state={state}
            orders={orders}
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
              军团 {selUnit.id}（兵力 <b>{Math.round(selUnit.strength)}</b>，士气 {Math.round(selUnit.morale)}）<br />
              位于 {mapIndex.byId[selUnit.province]?.name}<br />
              可移动/进攻 {reachable.length} 个相邻地块<br />
              <b>按住 Ctrl 点击</b>目标地块可选择派遣兵力（50 一档）
            </div>
          )}
          {!selUnit && selProv && selProvStatic && (
            <dl>
              <dt>地块</dt><dd>{selProvStatic.name}</dd>
              <dt>归属</dt><dd>{selProv.owner ? state.nations[selProv.owner]?.name : "空白未占领区"}</dd>
              <dt>地形</dt><dd>{TERRAIN_LABEL[selProvStatic.terrain]}（防御 ×{selProvStatic.defenseBonus}）</dd>
              <dt>抵抗值</dt><dd>{Math.round(selProv.resistance)}</dd>
              <dt>驻军</dt><dd>{Math.round(unitsIn(state, selProvStatic.id).reduce((s, u) => s + u.strength, 0))} / {LAND_CAP}</dd>
              <dt>产出</dt><dd>钢{selProvStatic.base.steel} 油{selProvStatic.base.oil} 粮{selProvStatic.base.food} 资{selProvStatic.base.fund}</dd>
            </dl>
          )}
          {!selUnit && !selProv && <p className="hint">点击你的军团选择，再点相邻地块下达命令。</p>}

          <h3>待执行指令（{orders.length}）</h3>
          <ul className="orders">
            {orders.map((o) => (
              <li key={o.unitId}>
                {o.unitId} → {mapIndex.byId[o.to]?.name}
                {o.strength ? `（${o.strength} 兵力）` : "（全部）"}
                <button className="mini" onClick={() => setOrders((p) => p.filter((x) => x.unitId !== o.unitId))}>取消</button>
              </li>
            ))}
            {!orders.length && <li className="hint">暂无指令</li>}
          </ul>

          <button className="primary" onClick={handleEndTurn}>结束回合 ▶</button>

          <h3>其他国家</h3>
          <ul className="legend">
            {others.map((n) => (
              <li key={n.id}><span className="swatch" style={{ background: n.color }} />{n.name}</li>
            ))}
            <li><span className="swatch" style={{ background: "#cdc7b6" }} />空白未占领区</li>
          </ul>

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

      {showIntro && (
        <div className="modal-mask">
          <div className="modal">
            <h2>你被随机分配为</h2>
            <div className="intro-nation">
              <span className="swatch big" style={{ background: player?.color }} />
              <span>{player?.name}</span>
            </div>
            <p className="hint">
              地图上带<b>白色轮廓</b>的区域就是你的领土（{ownedCount} 省）。
              先点击你的军团（带数字的圆点），再点击虚线高亮的地块下达命令；
              <b>按住 Ctrl 点击</b>可只派遣部分兵力。
            </p>
            <button className="primary" onClick={() => setShowIntro(false)}>开始</button>
          </div>
        </div>
      )}

      {split && (
        <div className="modal-mask">
          <div className="modal">
            <h2>派遣兵力</h2>
            <p className="hint">
              目标：<b>{mapIndex.byId[split.to]?.name}</b>
              {split.attack ? "（有敌军驻守，将发生战斗）" : "（我方地块，注意驻军上限 200）"}
            </p>
            <div className="split-amount">{splitAmount}</div>
            <input
              type="range"
              min={SPLIT_STEP}
              max={split.max}
              step={SPLIT_STEP}
              value={splitAmount}
              onChange={(e) => setSplitAmount(Number(e.target.value))}
            />
            <div className="chips">
              {Array.from({ length: Math.floor(split.max / SPLIT_STEP) }, (_, i) => (i + 1) * SPLIT_STEP).map((v) => (
                <button key={v} className={v === splitAmount ? "chip active" : "chip"} onClick={() => setSplitAmount(v)}>{v}</button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setSplit(null)}>取消</button>
              <button className="primary" style={{ marginTop: 0 }} onClick={confirmSplit}>确定派遣</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
