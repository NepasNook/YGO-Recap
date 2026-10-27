import { supabase } from "@/integrations/supabase/client";
import type { GameFormat } from "@/lib/gameFormat";

// Each player's default deck per game format, keyed by user id.
export type DefaultDecks = Record<string, Partial<Record<GameFormat, string>>>;

export async function fetchDefaultDecks(): Promise<DefaultDecks> {
  const { data } = await supabase.from("user_default_decks").select("user_id, game_format, deck_id");
  const map: DefaultDecks = {};
  (data ?? []).forEach((r) => {
    (map[r.user_id] ??= {})[r.game_format as GameFormat] = r.deck_id;
  });
  return map;
}

// The player's default deck for that format, or "" when they have none (or it
// is no longer among the format's decks, e.g. moved to the other format).
export function defaultDeckFor(
  defaults: DefaultDecks,
  userId: string | null | undefined,
  format: GameFormat,
  formatDecks: { id: string }[],
): string {
  const id = userId ? defaults[userId]?.[format] : undefined;
  return id && formatDecks.some((d) => d.id === id) ? id : "";
}
