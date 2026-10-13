// 战斗结算（陆战《战斗结算公式》§3.1 + 海战 §3.2）
import type { GameState, Province, Unit } from "@terrawar/shared";
import {
  AIR_SUPREMACY_LAND, AIR_SUPREMACY_SEA, BASE_ATTRITION, ENCIRCLE_MODIFIER,
  FORTRESS_DEFENSE, GENERAL_MODIFIER, MORALE, SEA_MODIFIERS, SUPPLY_MODIFIER, TERRAIN_DEFENSE,
} from "@terrawar/shared";
import { moraleModifier } from "./morale";

export { moraleModifier };

export type BattleRole = "attacker" | "defender";

export interface PowerContext {
  /** 该地块掌握制空权的国家（null = 均势或无空军参与） */
  airOwner?: string | null;
  /** 海战：是否远离本土港口 */
  farFromPort?: boolean;
  /** 两栖登陆（攻方） */
  amphibious?: boolean;
  /** 登陆时海军舰炮支援 / 空军支援 */
  navalGunfire?: boolean;
  airSupport?: boolean;
}

function terrainMul(state: GameState, province: Province): number {
  const fort = (state.provinces[province.id]?.buildings.fortress ?? 0) as 0 | 1 | 2 | 3;
  return (TERRAIN_DEFENSE[province.terrain] ?? 1) * (FORTRESS_DEFENSE[fort] ?? 1);
}

/** 最终战力（陆战 / 海战；含制空权与两栖修正） */
export function finalPower(
  state: GameState, unit: Unit, province: Province, role: BattleRole, ctx: PowerContext = {},
): number {
  const isSea = province.kind === "sea";
  let mul = 1;
  mul *= SUPPLY_MODIFIER[unit.supply] ?? 1;
  mul *= moraleModifier(unit.morale);
  mul *= unit.general ? GENERAL_MODIFIER[unit.general.level] : 1;

  const airTable = isSea ? AIR_SUPREMACY_SEA : AIR_SUPREMACY_LAND;
  if (ctx.airOwner) mul *= ctx.airOwner === unit.owner ? airTable.own : airTable.enemy;
  else mul *= AIR_SUPREMACY_LAND.neutral;      // 均势 ×1.0

  if (isSea) {
    if (role === "defender" && province.terrain === "strait") mul *= SEA_MODIFIERS.straitDefender;
    if (role === "attacker" && province.terrain === "deep_sea") mul *= SEA_MODIFIERS.openSeaAttacker;
    if (ctx.farFromPort) mul *= SEA_MODIFIERS.farFromPort;
  } else if (role === "defender") {
    mul *= terrainMul(state, province);
  } else {
    mul *= ENCIRCLE_MODIFIER.one;              // 包围判定未实现，按单侧
  }

  if (role === "attacker" && ctx.amphibious) {
    mul *= 0.7;                                // 登陆场劣势
    if (ctx.navalGunfire) mul *= 1.15;         // 海军舰炮支援
    if (ctx.airSupport) mul *= 1.1;            // 空军支援
  }
  return unit.strength * mul;
}

/** 空白区守军（民兵）战力：正常士气 + 地形 / 要塞加成 */
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

export function resolveBattle(
  state: GameState, province: Province, attacker: Unit, defender: Unit, ctx: PowerContext = {},
): BattleResult {
  return core(
    attacker.strength, finalPower(state, attacker, province, "attacker", ctx),
    defender.strength, finalPower(state, defender, province, "defender", ctx),
  );
}

export function resolveBattleVsGarrison(
  state: GameState, province: Province, attacker: Unit, garrisonStrength: number, ctx: PowerContext = {},
): BattleResult {
  return core(
    attacker.strength, finalPower(state, attacker, province, "attacker", ctx),
    garrisonStrength, garrisonPower(state, province, garrisonStrength),
  );
}
