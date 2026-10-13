# TerraWar（地缘战争）

宏观地块制、回合制、**同时结算**的地缘战争策略游戏（Web，单机 vs AI，参考《文明6》简化版）。

## 文档
- 开发计划与实现方案：`docs/开发计划与实现方案.md`
- 玩法规则详细文档：`docs/玩法规则详细文档.md`
- 战斗结算公式与数值规则：`docs/战斗结算公式与数值规则.md`
- 外交条约具体数值规则：`docs/外交条约具体数值规则.md`

## 目录结构
```
apps/web           前端（React + TS + Vite，SVG 地图）
packages/engine    纯逻辑游戏引擎（无 DOM 依赖，将来可复用于联机权威模拟）
packages/shared    共享类型与数值常量
packages/map-data  生成好的地图数据（TopoJSON）
tools/mapgen       地图生成工具（行政区划 -> 省份聚类 -> 邻接 -> TopoJSON）
```

## 快速开始
```bash
pnpm install        # 安装依赖
pnpm mapgen         # 生成地图数据（输出到 packages/map-data/maps）
pnpm dev            # 启动前端开发服务器
pnpm build          # 构建前端
pnpm typecheck      # 全量类型检查
```

## 当前进度
- ✅ **M0 脚手架 + 地图生成管线**：欧洲地图（3/5/7 国 → 30/50/70 省），省份聚类、邻接计算、SVG 渲染与地块信息面板
- ✅ **M1 核心回合引擎**：对局状态、回合结算、陆军移动与冲突裁决、占领与抵抗、资源产出与维护；前端可选兵移动、结束回合、资源面板与战报
- ⏭ 下一步 M2：陆战结算（战斗公式）、补给线、士气

## 说明
- 地图行政区划数据来自 npm 包 `@geo-insight/data`（ADM1），经 `tools/mapgen` 聚类生成省份。
- `tools/mapgen/data/` 为原始数据与缓存目录，已在 `.gitignore` 中排除。