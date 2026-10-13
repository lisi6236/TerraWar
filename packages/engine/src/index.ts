// TerraWar 游戏引擎（纯逻辑，无 DOM 依赖）
// M1~M4：对局创建 / 回合推进 / 陆战海战 / 合兵分兵 / 占领 / 补给线 / 空军制空权 / AI
export * from "./rng";
export * from "./state";
export * from "./morale";
export * from "./combat";
export * from "./movement";
export * from "./stack";
export * from "./occupation";
export * from "./economy";
export * from "./supply";
export * from "./air";
export * from "./ai";
export * from "./resolve";

export const ENGINE_VERSION = "0.4.0-m4";
