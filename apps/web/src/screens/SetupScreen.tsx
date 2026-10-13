import { useState } from "react";
import type { MapMeta } from "../map/types";

interface Props {
  metas: MapMeta[];
  onStart: (mapId: string, seed: number) => void;
}

export function SetupScreen({ metas, onStart }: Props) {
  const [mapId, setMapId] = useState(metas[0]?.id ?? "");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const meta = metas.find((m) => m.id === mapId);

  return (
    <div className="setup">
      <div className="setup-card">
        <h1>TerraWar <span>地缘战争</span></h1>
        <p className="hint">
          回合制、同时结算的地缘战争策略。选择难度后开局，你将<b>随机</b>被分配到一个国家。
        </p>

        <h3>难度（参战国数量）</h3>
        <div className="chips">
          {metas.map((m) => (
            <button key={m.id} className={m.id === mapId ? "chip active" : "chip"} onClick={() => setMapId(m.id)}>
              {m.name}
              <small>{m.provinceCount} 省</small>
            </button>
          ))}
        </div>

        <h3>随机种子</h3>
        <div className="seed-row">
          <input value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
          <button className="ghost" onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}>换一个</button>
        </div>

        <button className="primary" disabled={!meta} onClick={() => meta && onStart(meta.id, seed)}>
          开始对局
        </button>
      </div>
    </div>
  );
}