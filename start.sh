#!/usr/bin/env bash
# TerraWar 地缘战争 · 一键启动（Git Bash / WSL / macOS / Linux）
set -e
cd "$(dirname "$0")"
PORT="${PORT:-5175}"

echo "=============================================="
echo "   TerraWar 地缘战争 · 一键启动"
echo "=============================================="

command -v node >/dev/null 2>&1 || { echo "[错误] 未找到 Node.js，请先安装：https://nodejs.org/"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "[错误] 未找到 pnpm，可先执行：npm install -g pnpm"; exit 1; }

if [ ! -d node_modules ]; then
  echo "[1/3] 安装依赖（首次较慢）..."
  pnpm install
else
  echo "[1/3] 依赖已就绪"
fi

if [ ! -f packages/map-data/maps/maps.json ]; then
  echo "[2/3] 生成地图数据..."
  pnpm mapgen
else
  echo "[2/3] 地图数据已就绪"
fi

echo "[3/3] 启动本地服务器：http://localhost:$PORT"
echo "      Ctrl+C 停止"

open_url() {
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"
  elif command -v open >/dev/null 2>&1; then open "$1"
  elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$1"
  else echo "      请手动在浏览器打开：$1"
  fi
}
( sleep 4; open_url "http://localhost:$PORT" ) >/dev/null 2>&1 &

pnpm --filter @terrawar/web exec vite --port "$PORT" --strictPort