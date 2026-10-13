// 战斗结算（实现《战斗结算公式与数值规则》§2 / §3.1）
// 说明：制空权（需空军，M4）与包围（包围判定未实现）暂按 ×1.0 占位，接口已留。
import type { GameState, Province, Unit } from "@terrawar/shared";
import {
  AIR_SUPREMACY_LAND, BASE_ATTRITION, ENCIRCLE_MODIFIER, FORTRESS_DEFENSE,
  GENERAL_MODIFIER, MORALE, MORALE_ANCHORS, SUPPLY_MODIFIER, TERRAIN_DEFENSE,
} from "@terrawar/shared";
import { moraleModifier } from "./morale";

export { moraleModifier };

export type BattleRole = "attacker" | "defender";

function terrainMul(state: GameState, province: Province): number {
  const fort = (state.provinces[province.id]?.buildings.fortress ?? 0) as 0 | 1 | 2 | 3;
  return (TERRAIN_DEFENSE[province.terrain] ?? 1) * (FORTRESS_DEFENSE[fort] ?? 1);
}

/** 最终战力 = 基础(当前兵力) × 地形 × 设施 × 补给 × 制空 × 士气 × 包围 × 将领 */
export function finalPower(state: GameState, unit: Unit, province: Province, role: BattleRole): number {
  let mul = 1;
  mul *= SUPPLY_MODIFIER[unit.supply] ?? 1;
  mul *= AIR_SUPREMACY_LAND.neutral;                      // 制空权：M4 接入空军前按均势
  mul *= moraleModifier(unit.morale);
  mul *= unit.general ? GENERAL_MODIFIER[unit.general.level] : 1;
  if (role === "defender") mul *= terrainMul(state, province);
  else mul *= ENCIRCLE_MODIFIER.one;                      // 包围修正：未实现包围判定，按单侧
  return unit.strength * mul;
}

/** 空白区守军（民兵）的最终战力：按正常士气、享受地形/要塞加成 */
export function garrisonPower(state: GameState, province: Province, strength: number): number {
  let mul = SUPPLY_MODIFIER.ok * AIR_SUPREMACY_LAND.neutral * moraleModifier(MORALE.initial);
  mul *= terrainMul(state, province);
  return strength * mul;
}

export interface BattleResult {
  attackerPower: number;
  defenderPower: number;
  attackerLoss: number;
  defenderLoss: number;
  attackerRemaining: number;
  defenderRemaining: number;
  attackerWins: boolean;
}

/** 核心：按文档公式算战损，战后兵力多者获胜 */
function core(aStrength: number, aPower: number, dStrength: number, dPower: number): BattleResult {
  const total = aPower + dPower || 1;
  const attackerLoss = aStrength * (dPower / total) * BASE_ATTRITION;
  const defenderLoss = dStrength * (aPower / total) * BASE_ATTRITION;
  const attackerRemaining = Math.max(0, aStrength - attackerLoss);
  const defenderRemaining = Math.max(0, dStrength - defenderLoss);
  return {
    attackerPower: aPower, defenderPower: dPower,
    attackerLoss, defenderLoss, attackerRemaining, defenderRemaining,
    attackerWins: attackerRemaining > defenderRemaining && attackerRemaining > 0,
  };
}

/** 单位 vs 单位 */
export function resolveBattle(state: GameState, province: Province, attacker: Unit, defender: Unit): BattleResult {
  return core(
    attacker.strength, finalPower(state, attacker, province, "attacker"),
    defender.strength, finalPower(state, defender, province, "defender"),
  );
}

/** 单位 vs 空白区守军 */
export function resolveBattleVsGarrison(
  state: GameState, province: Province, attacker: Unit, garrisonStrength: number,
): BattleResult {
  return core(
    attacker.strength, finalPower(state, attacker, province, "attacker"),
    garrisonStrength, garrisonPower(state, province, garrisonStrength),
  );
}
