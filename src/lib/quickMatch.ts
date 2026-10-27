import type { LpLogEntry } from "@/components/DuelBoard";

// A quick match never touches the database: no players, no decks, nothing in
// the history or the stats. It lives only on this phone, kept in localStorage
// so leaving or reloading the page doesn't lose it, until the Best of 3 ends.
export type QuickMatchState = { p1_lp: number; p2_lp: number; p1_wins: number; p2_wins: number; draws: number; logs: LpLogEntry[] };

export const FRESH_QUICK_MATCH: QuickMatchState = { p1_lp: 8000, p2_lp: 8000, p1_wins: 0, p2_wins: 0, draws: 0, logs: [] };
export const QUICK_WINS_NEEDED = 2;

export const quickMatchKey = (userId: string) => `ygo-quick-match:${userId}`;

export function loadQuickMatch(userId: string): QuickMatchState | null {
  try {
    const raw = localStorage.getItem(quickMatchKey(userId));
    return raw ? { ...FRESH_QUICK_MATCH, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function saveQuickMatch(userId: string, s: QuickMatchState) {
  try { localStorage.setItem(quickMatchKey(userId), JSON.stringify(s)); } catch { /* storage unavailable: the match still works, it just won't survive a reload */ }
}

export function clearQuickMatch(userId: string) {
  try { localStorage.removeItem(quickMatchKey(userId)); } catch { /* ignore */ }
}
