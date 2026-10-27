import { useCallback, useEffect, useState } from "react";
import { DEFAULT_GAME_FORMAT, type GameFormat } from "@/lib/gameFormat";

const STORAGE_KEY = "ygo:game-format";

// The GOAT / EDISON choice, remembered on this device so leaderboards,
// profiles and the new-duel form open on the format last used. Read after
// mount: the server render (and a blocked storage) falls back to GOAT.
export function useGameFormat(): [GameFormat, (f: GameFormat) => void] {
  const [format, setFormatState] = useState<GameFormat>(DEFAULT_GAME_FORMAT);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "goat" || saved === "edison") setFormatState(saved);
    } catch {
      // Storage unavailable (private mode, blocked site data): keep the default.
    }
  }, []);

  const setFormat = useCallback((f: GameFormat) => {
    setFormatState(f);
    try {
      window.localStorage.setItem(STORAGE_KEY, f);
    } catch {
      // Not remembered, but the choice still applies to this page.
    }
  }, []);

  return [format, setFormat];
}
