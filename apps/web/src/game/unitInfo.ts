import { UNIT_SPECS } from "@terrawar/shared";

export function unitTypeName(type: string): string {
  return UNIT_SPECS[type as keyof typeof UNIT_SPECS]?.name ?? type;
}

export function unitShape(type: string): "land" | "naval" | "air" {
  const spec = UNIT_SPECS[type as keyof typeof UNIT_SPECS];
  if (!spec) return "land";
  if (spec.naval) return "naval";
  if (spec.requiresAirbase) return "air";
  return "land";
}

export const SUPPLY_LABEL: Record<string, string> = { ok: "正常", low: "不足", cut: "断绝" };

export function supplyStroke(supply: string): string {
  return supply === "ok" ? "#ffffff" : supply === "low" ? "#e0a53f" : "#e0603f";
}