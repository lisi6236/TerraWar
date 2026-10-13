// 战斗结算（实现《战斗结算公式与数值规则》§2 / §3.1）
// 说明：制空权（需空军，M4）与包围（包围判定未实现）暂按 ×1.0 占位，接口已留。
import type { GameState, Province, Unit } from "@terrawar/shared";
import {
  AIR_SUPREMACY_LAND, BASE_ATTRITION, ENCIRCLE_MODIFIER, FORTRESS_DEFENSE,
  GENERAL_MODIFIER, MORALE_ANCHORS, SUPPLY_MODIFIER, TERRAIN_DEFENSE,
} from "@terrawar/shared";

/** 士气修正：按文档 4 个锚点线性插值（士气 100→1.1 / 70→1.0 / 40→0.8 / 20→0.5） */
export function moraleModifier(morale: number): number {
  const a = MORALE_ANCHORS;
  const first = a[0], last = a[a.length - 1];
  if (morale <= first[0]) return first[1];
  if (morale >= last[0]) return last[1];
  for (let i = 1; i < a.length; i++) {
    const [m0, v0] = a[i - 1];
    const [m1, v1] = a[i];
    if (morale <= m1) return v0 + ((v1 - v0) * (morale - m0)) / (m1 - m0);
  }
  return last[1];
}

export type BattleRole = "attacker" | "defender";

/** 最终战力 = 基础(当前兵力) × 地形 × 设施 × 补给 × 制空 × 士气 × 包围 × 将领 */
export function finalPower(state: GameState, unit: Unit, province: Province, role: BattleRole): number {
  let mul = 1;
  mul *= SUPPLY_MODIFIER[unit.supply] ?? 1;
  mul *= AIR_SUPREMACY_LAND.neutral;                      // 制空权：M4 接入空军前按均势
  mul *= moraleModifier(unit.morale);
  mul *= unit.general ? GENERAL_MODIFIER[unit.general.level] : 1;
  if (role === "defender") {
    mul *= TERRAIN_DEFENSE[province.terrain] ?? 1;
    const fort = (state.provinces[province.id]?.buildings.fortress ?? 0) as 0 | 1 | 2 | 3;
    mul *= FORTRESS_DEFENSE[fort] ?? 1;
  } else {
    mul *= ENCIRCLE_MODIFIER.one;                          // 包围修正：未实现包围判定，按单侧
  }
  return unit.strength * mul;
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

/** 单次交战：战损率按文档公式，胜负按战后剩余兵力比较 */
export function resolveBattle(
  state: GameState, province: Province, attacker: Unit, defender: Unit,
): BattleResult {
  const attackerPower = finalPower(state, attacker, province, "attacker");
  const defenderPower = finalPower(state, defender, province, "defender");
  const total = attackerPower + defenderPower || 1;

  const attackerLossRate = (defenderPower / total) * BASE_ATTRITION;
  const defenderLossRate = (attackerPower / total) * BASE_ATTRITION;

  const attackerLoss = attacker.strength * attackerLossRate;
  const defenderLoss = defender.strength * defenderLossRate;
  const attackerRemaining = Math.max(0, attacker.strength - attackerLoss);
  const defenderRemaining = Math.max(0, defender.strength - defenderLoss);

  return {
    attackerPower, defenderPower, attackerLoss, defenderLoss,
    attackerRemaining, defenderRemaining,
    attackerWins: attackerRemaining > defenderRemaining && attackerRemaining > 0,
  };
}