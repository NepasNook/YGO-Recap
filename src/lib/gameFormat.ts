// The two game formats. Each has its own deck pool, and duels of one format
// never count towards the other's stats, leaderboards or Elo.
export type GameFormat = "goat" | "edison";

export const GAME_FORMATS: { value: GameFormat; label: string }[] = [
  { value: "goat", label: "GOAT" },
  { value: "edison", label: "EDISON" },
];

export const DEFAULT_GAME_FORMAT: GameFormat = "goat";

export function gameFormatLabel(f: string | null | undefined): string {
  return GAME_FORMATS.find((x) => x.value === f)?.label ?? "GOAT";
}
