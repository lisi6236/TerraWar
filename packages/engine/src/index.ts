// TerraWar 游戏引擎（纯逻辑，无 DOM 依赖）
// M1/M2：对局状态创建、回合推进、陆军移动/分兵/进攻与战斗结算、合兵、占领与抵抗、资源产出与维护
export * from "./rng";
export * from "./state";
export * from "./combat";
export * from "./movement";
export * from "./stack";
export * from "./occupation";
export * from "./economy";
export * from "./resolve";

export const ENGINE_VERSION = "0.2.0-m2";
