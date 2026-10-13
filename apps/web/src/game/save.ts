// 本地存档（localStorage，按地图分槽；带版本校验，便于后续迁移）
import type { GameState } from "@terrawar/shared";

const PREFIX = "terrawar.save.";

export function saveGame(slot: string, state: GameState): void {
  const payload = JSON.stringify({ savedAt: new Date().toISOString(), state });
  localStorage.setItem(PREFIX + slot, payload);
}

export function loadGame(slot: string): GameState | null {
  const raw = localStorage.getItem(PREFIX + slot);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: GameState };
    const s = parsed.state;
    if (!s || typeof s.turn !== "number" || !s.nations || !s.provinces) return null;
    return s;
  } catch {
    return null;
  }
}

export function hasSave(slot: string): boolean {
  return localStorage.getItem(PREFIX + slot) !== null;
}

export function savedAt(slot: string): string | null {
  const raw = localStorage.getItem(PREFIX + slot);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { savedAt?: string }).savedAt ?? null;
  } catch {
    return null;
  }
}