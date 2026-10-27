import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";
import { UserAvatar } from "@/components/UserAvatar";
import { GameFormatTabs } from "@/components/GameFormatPicker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGameFormat } from "@/hooks/use-game-format";
import { gameFormatLabel } from "@/lib/gameFormat";

// Players are identified by username in the URL, so a head-to-head can be
// linked to and shared: /h2h?a=Armando&b=elPandito
type Search = { a?: string; b?: string };

export const Route = createFileRoute("/h2h")({
  component: HeadToHeadPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    a: typeof s.a === "string" ? s.a : undefined,
    b: typeof s.b === "string" ? s.b : undefined,
  }),
  head: () => ({ meta: [{ title: "Head to Head — YGO Recap" }] }),
});

type Profile = { id: string; username: string; avatar_url: string | null };
type Duel = {
  id: string; date: string;
  player1_id: string; player2_id: string; winner_id: string | null;
  deck1_id: string | null; deck2_id: string | null;
  games_p1_wins: number; games_p2_wins: number;
  for_fun: boolean;
};
type Matchup = { key: string; deckA: string; deckB: string; winsA: number; winsB: number };

const UNKNOWN_DECK = "Unspecified deck";

function HeadToHeadPage() {
  const { a, b } = Route.useSearch();
  const navigate = useNavigate({ from: "/h2h" });
  const { user, profile, loading: authLoading } = useAuth();
  const [gameFormat, setGameFormat] = useGameFormat();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [decksMap, setDecksMap] = useState<Record<string, string>>({});
  const [duels, setDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(false);

  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return;
    supabase.from("profiles").select("id, username, avatar_url").order("username").then(({ data }) => setProfiles((data as Profile[] | null) ?? []));
    supabase.from("decks").select("id, name").then(({ data }) => setDecksMap(Object.fromEntries((data ?? []).map((d) => [d.id, d.name]))));
  }, [signedIn]);

  // Player A defaults to me, so "head to head" from someone's page means me vs them.
  const playerA = profiles.find((p) => p.username === (a ?? profile?.username));
  const playerB = profiles.find((p) => p.username === b);

  const setPlayer = (side: "a" | "b", username: string) =>
    navigate({ search: (prev) => ({ ...prev, [side]: username }), replace: true });

  const aId = playerA?.id;
  const bId = playerB?.id;
  useEffect(() => {
    if (!aId || !bId || aId === bId) { setDuels([]); return; }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("duels")
      .select("id, date, player1_id, player2_id, winner_id, deck1_id, deck2_id, games_p1_wins, games_p2_wins, for_fun")
      .eq("game_format", gameFormat)
      .or(`and(player1_id.eq.${aId},player2_id.eq.${bId}),and(player1_id.eq.${bId},player2_id.eq.${aId})`)
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setDuels((data as Duel[] | null) ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [aId, bId, gameFormat]);

  // Like the leaderboards, only decided duels that aren't "for fun" count.
  const summary = useMemo(() => {
    if (!playerA || !playerB) return null;
    const scored = duels.filter((d) => d.winner_id && !d.for_fun);
    const matchups: Record<string, Matchup> = {};
    let winsA = 0, winsB = 0, gamesA = 0, gamesB = 0;
    for (const d of scored) {
      const aIsP1 = d.player1_id === playerA.id;
      const aWon = d.winner_id === playerA.id;
      if (aWon) winsA++; else winsB++;
      gamesA += aIsP1 ? d.games_p1_wins : d.games_p2_wins;
      gamesB += aIsP1 ? d.games_p2_wins : d.games_p1_wins;
      const deckA = (aIsP1 ? d.deck1_id : d.deck2_id) ?? "";
      const deckB = (aIsP1 ? d.deck2_id : d.deck1_id) ?? "";
      const key = `${deckA}::${deckB}`;
      const m = (matchups[key] ??= {
        key,
        deckA: deckA ? (decksMap[deckA] ?? UNKNOWN_DECK) : UNKNOWN_DECK,
        deckB: deckB ? (decksMap[deckB] ?? UNKNOWN_DECK) : UNKNOWN_DECK,
        winsA: 0, winsB: 0,
      });
      if (aWon) m.winsA++; else m.winsB++;
    }
    return {
      winsA, winsB, gamesA, gamesB,
      matchups: Object.values(matchups).sort((x, y) => (y.winsA + y.winsB) - (x.winsA + x.winsB)),
    };
  }, [duels, playerA, playerB, decksMap]);

  if (!authLoading && !user) return <div className="py-10"><LoginRequired message="Sign in to compare duelists." /></div>;

  const total = summary ? summary.winsA + summary.winsB : 0;
  const pctA = total > 0 ? Math.round((summary!.winsA / total) * 100) : 0;

  return (
    <div className="space-y-6 py-4">
      <header className="text-center space-y-2">
        <h1 className="font-display text-3xl gold-text">Head to Head</h1>
        <p className="text-sm text-muted-foreground">Every duel between two duelists, in one format.</p>
        <GameFormatTabs value={gameFormat} onChange={setGameFormat} />
      </header>

      <div className="card-mystic rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PlayerPicker label="Duelist A" value={playerA?.username} profiles={profiles} exclude={playerB?.username} onChange={(u) => setPlayer("a", u)} />
        <PlayerPicker label="Duelist B" value={playerB?.username} profiles={profiles} exclude={playerA?.username} onChange={(u) => setPlayer("b", u)} />
      </div>

      {!playerA || !playerB ? (
        <p className="text-center text-sm text-muted-foreground">Pick two duelists to compare.</p>
      ) : loading || !summary ? (
        <p className="text-center text-sm text-muted-foreground">Loading duels…</p>
      ) : (
        <>
          <div className="card-mystic rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Side profile={playerA} />
              <div className="text-center">
                <div className="font-display text-2xl sm:text-4xl gold-text whitespace-nowrap">{summary.winsA} – {summary.winsB}</div>
                <div className="text-xs text-muted-foreground">duels won</div>
              </div>
              <Side profile={playerB} />
            </div>
            {total > 0 ? (
              <>
                <div className="h-2 rounded-full bg-destructive/40 overflow-hidden">
                  <div className="h-full gold-gradient" style={{ width: `${pctA}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{pctA}% · {summary.gamesA} games won</span>
                  <span>{summary.gamesB} games won · {100 - pctA}%</span>
                </div>
              </>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                No {gameFormatLabel(gameFormat)} duels between them yet ("for fun" duels don't count).
              </p>
            )}
          </div>

          {summary.matchups.length > 0 && (
            <div className="card-mystic rounded-xl overflow-hidden">
              <h3 className="font-display text-lg text-gold px-4 pt-4 pb-2">Deck matchups</h3>
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">{playerA.username} vs {playerB.username}</th>
                    <th className="px-3 py-2 text-right">{playerA.username}</th>
                    <th className="px-3 py-2 text-right">{playerB.username}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.matchups.map((m) => (
                    <tr key={m.key} className="border-t border-border">
                      <td className="px-4 py-2"><span className="text-foreground">{m.deckA}</span> <span className="text-muted-foreground">vs</span> {m.deckB}</td>
                      <td className="px-3 py-2 text-right text-success">{m.winsA}</td>
                      <td className="px-3 py-2 text-right text-destructive">{m.winsB}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {duels.length > 0 && (
            <div className="card-mystic rounded-xl overflow-hidden">
              <h3 className="font-display text-lg text-gold px-4 pt-4 pb-2">All duels</h3>
              <ul>
                {duels.map((d) => {
                  const aIsP1 = d.player1_id === playerA.id;
                  const deckA = aIsP1 ? d.deck1_id : d.deck2_id;
                  const deckB = aIsP1 ? d.deck2_id : d.deck1_id;
                  const gA = aIsP1 ? d.games_p1_wins : d.games_p2_wins;
                  const gB = aIsP1 ? d.games_p2_wins : d.games_p1_wins;
                  const winner = d.winner_id === playerA.id ? playerA.username : d.winner_id === playerB.id ? playerB.username : null;
                  return (
                    <li key={d.id} className="border-t border-border px-4 py-3 grid grid-cols-12 gap-2 items-center text-sm">
                      <div className="col-span-5">
                        <div className="font-medium flex items-center gap-1.5 flex-wrap">
                          {winner ? <span className={winner === playerA.username ? "text-success" : "text-destructive"}>{winner} won</span> : <span className="text-muted-foreground">No winner</span>}
                          {d.for_fun && <span className="text-[9px] uppercase tracking-widest px-1 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-400/40">for fun</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {deckA ? (decksMap[deckA] ?? UNKNOWN_DECK) : "—"} vs {deckB ? (decksMap[deckB] ?? UNKNOWN_DECK) : "—"}
                        </div>
                      </div>
                      <div className="col-span-3 text-center font-mono text-muted-foreground">{gA}-{gB}</div>
                      <div className="col-span-4 text-right text-xs text-muted-foreground">{new Date(d.date).toLocaleDateString()}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlayerPicker({ label, value, profiles, exclude, onChange }: {
  label: string; value: string | undefined; profiles: Profile[]; exclude: string | undefined; onChange: (username: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Pick a duelist" /></SelectTrigger>
        <SelectContent>
          {profiles.filter((p) => p.username !== exclude).map((p) => <SelectItem key={p.id} value={p.username}>{p.username}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Side({ profile }: { profile: Profile }) {
  return (
    <Link to="/u/$username" params={{ username: profile.username }} className="flex flex-col items-center gap-1 group min-w-0">
      <UserAvatar url={profile.avatar_url} name={profile.username} className="h-12 w-12" />
      <span className="text-sm font-semibold truncate max-w-full group-hover:text-gold">{profile.username}</span>
    </Link>
  );
}
