import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { GameState, MapData, Order } from "@terrawar/shared";
import { SPLIT_STEP } from "@terrawar/shared";
import {
  computeEconomy, createGame, endTurn, indexMap, reachableProvinces, unitsIn, validateOrders,
} from "@terrawar/engine";
import { generateAiOrders } from "@terrawar/engine";
import { MapView } from "../map/MapView";
import { hasSave, loadGame, saveGame } from "../game/save";
import { TERRAIN_LABEL } from "../map/types";
import { SUPPLY_LABEL, unitTypeName } from "../game/unitInfo";

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
  battle: "战斗", merge: "合兵", economy: "财政", supply: "补给", air: "空军", system: "系统",
};

const LAND_CAP = 200;

/** 向下取整到 50 的整数倍 */
function floorToStep(v: number): number {
  return Math.floor(v / SPLIT_STEP) * SPLIT_STEP;
}

export function GameScreen({ topo, mapData, seed, onExit }: Props) {
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const size = useSize(mapBoxRef);
  const mapIndex = useMemo(() => indexMap(mapData), [mapData]);
  const [state, setState] = useState<GameState>(() => createGame(mapData, { seed }));
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedProvinceId, setSelectedProvinceId] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [sendAmount, setSendAmount] = useState(SPLIT_STEP);
  const [notice, setNotice] = useState("");

  // 跟踪 Ctrl 键（按住才显示分兵框，松开即隐藏，不阻塞任何操作）
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Control") setCtrlHeld(true); };
    const up = (e: KeyboardEvent) => { if (e.key === "Control") setCtrlHeld(false); };
    const blur = () => setCtrlHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const player = state.nations[state.playerNation];
  const selUnit = selectedUnitId ? state.units[selectedUnitId] : null;
  const maxSend = selUnit ? Math.max(SPLIT_STEP, floorToStep(selUnit.strength)) : SPLIT_STEP;

  useEffect(() => {
    setSendAmount(selUnit ? Math.max(SPLIT_STEP, floorToStep(selUnit.strength)) : SPLIT_STEP);
  }, [selectedUnitId, selUnit?.strength]);

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
    setNotice("");
    setOrders((prev) => prev.filter((o) => o.unitId !== id));
    setSelectedUnitId((prev) => (prev === id ? null : id));
    setSelectedProvinceId(u.province);
  }

  function handleProvinceClick(id: string, ctrlKey: boolean) {
    if (!selectedUnitId || !reachable.includes(id)) {
      const mine = unitsIn(state, id).filter((u) => u.owner === state.playerNation);
      if (mine.length) { setSelectedUnitId(mine[0].id); setSelectedProvinceId(id); return; }
      setSelectedUnitId(null);
      setSelectedProvinceId(id);
      return;
    }

    const u = state.units[selectedUnitId];
    const attack = hasEnemy(id, u.owner);
    const room = attack ? u.strength : Math.max(0, LAND_CAP - strengthAt(id, u.owner));
    const split = ctrlKey || ctrlHeld;

    if (split) {
      const want = Math.min(sendAmount, u.strength, room);
      const send = floorToStep(want);
      if (send < SPLIT_STEP) {
        setNotice("目标地块驻军空间不足（上限 200），无法派兵进入");
        return;
      }
      setNotice(send < sendAmount ? `驻军空间不足，本次派出 ${send}（地块上限 200）` : "");
      addOrder(send >= u.strength
        ? { type: "move", unitId: u.id, to: id }
        : { type: "move", unitId: u.id, to: id, strength: send });
    } else if (!attack && u.strength > room) {
      const send = floorToStep(room);
      if (send < SPLIT_STEP) { setNotice("目标地块驻军已达上限（200），无法进入"); return; }
      setNotice(`驻军空间不足，已自动派出 ${send}（按住 Ctrl 可自选派遣数量）`);
      addOrder({ type: "move", unitId: u.id, to: id, strength: send });
    } else {
      setNotice("");
      addOrder({ type: "move", unitId: u.id, to: id });
    }

    setSelectedUnitId(null);
    setSelectedProvinceId(id);
  }

  function handleEndTurn() {
    const errs = validateOrders(state, mapIndex, orders);
    if (errs.length) { window.alert(errs.join("\n")); return; }
    setState(endTurn(state, mapIndex, [...orders, ...generateAiOrders(state, mapIndex)]));
    setOrders([]);
    setSelectedUnitId(null);
    setNotice("");
  }

  const selProv = selectedProvinceId ? state.provinces[selectedProvinceId] : null;
  const selProvStatic = selectedProvinceId ? mapIndex.byId[selectedProvinceId] : null;
  const slot = mapData.id;
  const canLoad = hasSave(slot);
  const [flash, setFlash] = useState("");
  function doSave() { saveGame(slot, state); setFlash("已保存进度"); }
  function doLoad() {
    const s = loadGame(slot);
    if (!s) { setFlash("没有找到存档"); return; }
    setState(s); setOrders([]); setSelectedUnitId(null); setSelectedProvinceId(null); setNotice(""); setFlash("已读取存档");
  }
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
        <div className="topbar-actions">
          {flash && <span className="flash">{flash}</span>}
          <button className="ghost" onClick={doSave}>保存</button>
          <button className="ghost" onClick={doLoad} disabled={!canLoad}>读取</button>
          <button className="ghost" onClick={onExit}>返回菜单</button>
        </div>
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
            split={ctrlHeld && selUnit ? { unitId: selUnit.id, amount: sendAmount, max: maxSend } : null}
            onSplitDelta={(d) => setSendAmount((v) => Math.max(SPLIT_STEP, Math.min(maxSend, v + d)))}
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
              {unitTypeName(selUnit.type)} {selUnit.id}（兵力 <b>{Math.round(selUnit.strength)}</b>，士气 {Math.round(selUnit.morale)}，
              补给 {SUPPLY_LABEL[selUnit.supply] ?? selUnit.supply}
              {selUnit.embarkedOn ? "，已登船" : ""}）<br />
              位于 {mapIndex.byId[selUnit.province]?.name}，可行动 {reachable.length} 个目标<br />
              <b>按住 Ctrl</b>：兵团旁出现分兵框（▲▼ 或滚轮调整，50 一档），
              {ctrlHeld ? <>当前将派出 <b>{sendAmount}</b></> : "再点击目标地块执行"}
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
          {!selUnit && !selProv && <p className="hint">点击你的军团选择，再点相邻地块下达命令。按住 Ctrl 可只派出部分兵力。</p>}
          {notice && <div className="notice">{notice}</div>}

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
              点击你的军团（带数字的圆点）选中，再点虚线高亮的地块下达命令；
              <b>按住 Ctrl</b> 会在军团旁出现分兵框（▲▼ 或滚轮调整，50 一档）。
            </p>
            <button className="primary" onClick={() => setShowIntro(false)}>开始</button>
          </div>
        </div>
      )}
    </div>
  );
}
