// TerraWar 游戏引擎（纯逻辑，无 DOM 依赖）
// M0：仅骨架 + 确定性随机数。回合结算 / 战斗 / 外交 / AI 从 M1 起在此实现。
export * from "./rng";

export const ENGINE_VERSION = "0.0.0-m0";