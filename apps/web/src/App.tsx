import { useEffect, useState } from "react";
import { SetupScreen } from "./screens/SetupScreen";
import { GameScreen } from "./screens/GameScreen";
import type { MapMeta } from "./map/types";
import type { MapData } from "@terrawar/shared";
import { loadMapIndex, loadTopology } from "./api/maps";
import { topologyToMapData } from "./game/mapData";

export default function App() {
  const [metas, setMetas] = useState<MapMeta[]>([]);
  const [status, setStatus] = useState("加载中…");
  const [game, setGame] = useState<{ topo: any; mapData: MapData; seed: number } | null>(null);

  useEffect(() => {
    loadMapIndex()
      .then((m) => { setMetas(m); setStatus(m.length ? "" : "尚未生成地图数据，请先运行 pnpm mapgen"); })
      .catch((e) => setStatus(String(e.message || e)));
  }, []);

  async function start(mapId: string, seed: number) {
    const meta = metas.find((m) => m.id === mapId);
    if (!meta) return;
    setStatus("加载地图…");
    try {
      const topo = await loadTopology(meta.file);
      setGame({ topo, mapData: topologyToMapData(topo, meta), seed });
      setStatus("");
    } catch (e) {
      setStatus(String((e as Error).message || e));
    }
  }

  if (status && !metas.length) {
    return <div className="setup"><div className="setup-card"><p className="hint">{status}</p></div></div>;
  }
  if (!game) return <SetupScreen metas={metas} onStart={start} />;
  return <GameScreen topo={game.topo} mapData={game.mapData} seed={game.seed} onExit={() => setGame(null)} />;
}