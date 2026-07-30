import { describe, expect, it } from "vitest";
import {
  buildBracketMatches,
  buildLeagueMatches,
  buildRoundRobinRounds,
  buildTournamentMatches,
} from "./tournamentBracket";

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

// Pair key that ignores who is listed first, so we can assert "these two met"
// without depending on the shuffle.
const pairKey = (a: string, b: string) => [a, b].sort().join("|");

describe("buildRoundRobinRounds", () => {
  it("returns nothing for fewer than two players", () => {
    expect(buildRoundRobinRounds([])).toEqual([]);
    expect(buildRoundRobinRounds(["p1"])).toEqual([]);
  });

  it("schedules n-1 rounds for an even player count", () => {
    const rounds = buildRoundRobinRounds(players(4));
    expect(rounds).toHaveLength(3);
    rounds.forEach((round) => expect(round).toHaveLength(2));
  });

  it("pairs every player with every other exactly once", () => {
    const ids = players(6);
    const seen = new Map<string, number>();
    for (const round of buildRoundRobinRounds(ids)) {
      for (const [a, b] of round) {
        if (b === null) continue;
        const key = pairKey(a, b);
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe((ids.length * (ids.length - 1)) / 2);
    for (const count of seen.values()) expect(count).toBe(1);
  });

  it("never schedules a player twice in the same round", () => {
    for (const round of buildRoundRobinRounds(players(8))) {
      const appearances = round.flatMap(([a, b]) => (b === null ? [a] : [a, b]));
      expect(new Set(appearances).size).toBe(appearances.length);
    }
  });

  it("gives each player exactly one bye when the count is odd", () => {
    const ids = players(5);
    const byes = buildRoundRobinRounds(ids)
      .flat()
      .filter(([, b]) => b === null)
      .map(([a]) => a);
    expect(byes).toHaveLength(ids.length);
    expect(new Set(byes).size).toBe(ids.length);
  });
});

describe("buildLeagueMatches", () => {
  it("numbers rounds and bracket positions from one", () => {
    const matches = buildLeagueMatches(players(4));
    expect(Math.min(...matches.map((m) => m.round))).toBe(1);
    expect(Math.min(...matches.map((m) => m.bracket_position))).toBe(1);
  });

  it("auto-wins byes and leaves real matches undecided", () => {
    for (const match of buildLeagueMatches(players(5))) {
      if (match.player2_id === null) expect(match.winner_id).toBe(match.player1_id);
      else expect(match.winner_id).toBeNull();
    }
  });

  it("keeps every player in the schedule", () => {
    const ids = players(7);
    const scheduled = new Set(buildLeagueMatches(ids).flatMap((m) => [m.player1_id, m.player2_id]));
    for (const id of ids) expect(scheduled.has(id)).toBe(true);
  });
});

describe("buildBracketMatches", () => {
  it("pads to the next power of two and emits size-1 matches", () => {
    // 5 players -> a bracket of 8 -> 4 + 2 + 1 matches
    const matches = buildBracketMatches(players(5));
    expect(matches).toHaveLength(7);
    expect(Math.max(...matches.map((m) => m.round))).toBe(3);
  });

  it("halves the match count each round", () => {
    const perRound = new Map<number, number>();
    for (const m of buildBracketMatches(players(8))) {
      perRound.set(m.round, (perRound.get(m.round) ?? 0) + 1);
    }
    expect([...perRound.entries()].sort()).toEqual([
      [1, 4],
      [2, 2],
      [3, 1],
    ]);
  });

  it("advances a player who is paired against an empty slot", () => {
    // 3 players in a bracket of 4: exactly one first-round slot is empty.
    const firstRound = buildBracketMatches(players(3)).filter((m) => m.round === 1);
    const walkovers = firstRound.filter((m) => m.player1_id === null || m.player2_id === null);
    expect(walkovers).toHaveLength(1);
    expect(walkovers[0].winner_id).toBe(walkovers[0].player1_id ?? walkovers[0].player2_id);
  });

  it("enters every player exactly once in the first round", () => {
    const ids = players(6);
    const entered = buildBracketMatches(ids)
      .filter((m) => m.round === 1)
      .flatMap((m) => [m.player1_id, m.player2_id])
      .filter((id): id is string => id !== null);
    expect(entered.sort()).toEqual([...ids].sort());
  });

  it("leaves later rounds empty until they are played", () => {
    for (const m of buildBracketMatches(players(8)).filter((m) => m.round > 1)) {
      expect(m.player1_id).toBeNull();
      expect(m.player2_id).toBeNull();
      expect(m.winner_id).toBeNull();
    }
  });
});

describe("buildTournamentMatches", () => {
  it("dispatches on format", () => {
    expect(buildTournamentMatches("bracket", players(4))).toHaveLength(3);
    // Round robin for 4 players: 3 rounds x 2 matches.
    expect(buildTournamentMatches("league", players(4))).toHaveLength(6);
  });
});
