// Shared match-generation logic for tournaments (bracket / round-robin league).

export type MatchInsert = {
  round: number;
  bracket_position: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
};

// Round-robin (circle method with rotation). Returns one round per matchday,
// covering the full schedule (n-1 rounds for even n, n rounds for odd n
// including byes).
// A pair `[a, null]` means player `a` has BYE that round (auto-win).
export function buildRoundRobinRounds(ids: string[]): [string, string | null][][] {
  const players: (string | null)[] = [...ids];
  if (players.length < 2) return [];
  if (players.length % 2 !== 0) players.push(null); // BYE
  const n = players.length;
  const totalRounds = n - 1;
  const rounds: [string, string | null][][] = [];
  let arr = [...players];
  for (let r = 0; r < totalRounds; r++) {
    const roundPairs: [string, string | null][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === null && b !== null) roundPairs.push([b, null]);
      else if (b === null && a !== null) roundPairs.push([a, null]);
      else if (a !== null && b !== null) roundPairs.push([a, b]);
    }
    rounds.push(roundPairs);
    // Rotate: keep index 0 fixed, move last to index 1, shift the rest right.
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return rounds;
}

export function buildLeagueMatches(playerIds: string[]): MatchInsert[] {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const rounds = buildRoundRobinRounds(shuffled);
  const inserts: MatchInsert[] = [];
  rounds.forEach((round, ri) => {
    round.forEach((pair, pi) => {
      const [p1, p2] = pair;
      inserts.push({
        round: ri + 1,
        bracket_position: pi + 1,
        player1_id: p1,
        player2_id: p2,
        winner_id: p2 === null ? p1 : null, // BYE = auto win
      });
    });
  });
  return inserts;
}

export function buildBracketMatches(playerIds: string[]): MatchInsert[] {
  const size = [2, 4, 8, 16, 32, 64, 128].find((n) => n >= playerIds.length) ?? 128;
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  while (shuffled.length < size) shuffled.push("");
  const rounds = Math.log2(size);
  const inserts: MatchInsert[] = [];
  for (let i = 0; i < size / 2; i++) {
    const p1 = shuffled[i * 2] || null;
    const p2 = shuffled[i * 2 + 1] || null;
    inserts.push({
      round: 1,
      bracket_position: i + 1,
      player1_id: p1,
      player2_id: p2,
      winner_id: !p1 ? p2 : !p2 ? p1 : null,
    });
  }
  for (let r = 2; r <= rounds; r++) {
    const count = size / Math.pow(2, r);
    for (let i = 0; i < count; i++)
      inserts.push({
        round: r,
        bracket_position: i + 1,
        player1_id: null,
        player2_id: null,
        winner_id: null,
      });
  }
  return inserts;
}

export function buildTournamentMatches(
  format: "bracket" | "league",
  playerIds: string[],
): MatchInsert[] {
  return format === "league" ? buildLeagueMatches(playerIds) : buildBracketMatches(playerIds);
}
