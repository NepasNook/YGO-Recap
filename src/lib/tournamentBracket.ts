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

// `maxRounds`, if given, caps the schedule to the first N rounds instead of
// the full round-robin (everyone-plays-everyone) — with fewer rounds than
// players allow, not every pair of players ends up facing each other.
export function buildLeagueMatches(playerIds: string[], maxRounds?: number): MatchInsert[] {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  let rounds = buildRoundRobinRounds(shuffled);
  if (maxRounds && maxRounds > 0 && maxRounds < rounds.length) {
    rounds = rounds.slice(0, maxRounds);
  }
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

// Reverses the lowest `bits` bits of `n`: walking positions in this order
// spreads them evenly across the bracket (0, 2, 1, 3 for 4 slots).
function bitReverse(n: number, bits: number): number {
  let r = 0;
  for (let i = 0; i < bits; i++) r = (r << 1) | ((n >> i) & 1);
  return r;
}

export function buildBracketMatches(playerIds: string[]): MatchInsert[] {
  const size = [2, 4, 8, 16, 32, 64, 128].find((n) => n >= playerIds.length) ?? 128;
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const rounds = Math.log2(size);
  const firstRoundCount = size / 2;
  // Every first-round match gets at least one player: the missing players
  // become BYEs spread across the bracket, never an empty (TBD vs TBD) match.
  const byeCount = Math.max(0, size - shuffled.length);
  const byePositions = new Set<number>();
  for (let i = 0; byePositions.size < byeCount && i < firstRoundCount; i++) {
    byePositions.add(bitReverse(i, Math.log2(firstRoundCount)));
  }
  const inserts: MatchInsert[] = [];
  let next = 0;
  for (let i = 0; i < firstRoundCount; i++) {
    const p1 = shuffled[next++] ?? null;
    const p2 = byePositions.has(i) ? null : shuffled[next++] ?? null;
    inserts.push({ round: 1, bracket_position: i + 1, player1_id: p1, player2_id: p2, winner_id: p2 === null ? p1 : null });
  }
  for (let r = 2; r <= rounds; r++) {
    const count = size / Math.pow(2, r);
    for (let i = 0; i < count; i++) inserts.push({ round: r, bracket_position: i + 1, player1_id: null, player2_id: null, winner_id: null });
  }
  // The DB only advances winners when a result is *updated*, so a BYE decided
  // at insert time would never move on: place those players in round 2 now.
  if (rounds >= 2) {
    inserts.filter((m) => m.round === 1 && m.winner_id).forEach((m) => {
      const target = inserts.find((x) => x.round === 2 && x.bracket_position === Math.ceil(m.bracket_position / 2));
      if (!target) return;
      if (m.bracket_position % 2 === 1) target.player1_id = m.winner_id;
      else target.player2_id = m.winner_id;
    });
  }
  return inserts;
}

export function buildTournamentMatches(format: "bracket" | "league", playerIds: string[], maxRounds?: number): MatchInsert[] {
  return format === "league" ? buildLeagueMatches(playerIds, maxRounds) : buildBracketMatches(playerIds);
}
