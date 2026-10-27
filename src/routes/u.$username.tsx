import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Swords, Trophy } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";
import { GameFormatBadge, GameFormatTabs } from "@/components/GameFormatPicker";
import { gameFormatLabel, type GameFormat } from "@/lib/gameFormat";
import { useGameFormat } from "@/hooks/use-game-format";

export const Route = createFileRoute("/u/$username")({
  component: PublicProfile,
});

type Stats = { user_id: string; username: string; game_format: GameFormat; total_duels: number; wins: number; losses: number; win_pct: number };
type RecentDuel = {
  id: string; date: string;
  player1_id: string; player2_id: string; winner_id: string | null;
  deck1_id: string | null; deck2_id: string | null;
  games_p1_wins: number; games_p2_wins: number;
  for_fun: boolean;
};

const RECENT_DUELS = 10;

function PublicProfile() {
  const { username } = Route.useParams();
  const { user, profile, loading: authLoading } = useAuth();
  // One row per game format: GOAT and EDISON stats are kept apart.
  const [statsByFormat, setStatsByFormat] = useState<Stats[]>([]);
  const [gameFormat, setGameFormat] = useGameFormat();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [trophies, setTrophies] = useState<{ id: string; name: string; max_players: number; start_date: string | null; game_format: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [elo, setElo] = useState<{ elo: number; duels: number } | null>(null);
  const [recent, setRecent] = useState<RecentDuel[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [decksMap, setDecksMap] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from("user_format_stats").select("*").eq("username", username);
      const list = (rows as Stats[] | null) ?? [];
      setStatsByFormat(list);
      const s = list[0];
      if (s) {
        const [{ data: t }, { data: p }, { data: names }, { data: dks }] = await Promise.all([
          supabase.from("tournaments").select("id, name, max_players, start_date, game_format").eq("winner_id", s.user_id as string),
          supabase.from("profiles").select("avatar_url").eq("id", s.user_id as string).maybeSingle(),
          supabase.from("profiles").select("id, username"),
          supabase.from("decks").select("id, name"),
        ]);
        setTrophies(t ?? []);
        setAvatarUrl(p?.avatar_url ?? null);
        setUsernames(Object.fromEntries((names ?? []).map((x) => [x.id, x.username])));
        setDecksMap(Object.fromEntries((dks ?? []).map((x) => [x.id, x.name])));
      }
      setLoading(false);
    })();
  // Profiles are readable only once signed in: reload when the session shows up.
  }, [username, user?.id]);

  const userId = statsByFormat[0]?.user_id;

  // Elo and latest duels of the format being shown.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      supabase.rpc("compute_elo_ratings", { _game_format: gameFormat }),
      supabase
        .from("duels")
        .select("id, date, player1_id, player2_id, winner_id, deck1_id, deck2_id, games_p1_wins, games_p2_wins, for_fun")
        .eq("game_format", gameFormat)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .order("date", { ascending: false })
        .limit(RECENT_DUELS),
    ]).then(([{ data: eloRows }, { data: duels }]) => {
      if (cancelled) return;
      const mine = (eloRows ?? []).find((r) => r.user_id === userId);
      setElo(mine ? { elo: mine.elo, duels: mine.duels_played } : null);
      setRecent((duels as RecentDuel[] | null) ?? []);
    });
    return () => { cancelled = true; };
  }, [userId, gameFormat]);

  if (!authLoading && !user) return <div className="py-10"><LoginRequired message="Sign in to see this duelist's profile." /></div>;
  if (loading) return <div className="py-20 text-center text-muted-foreground">Reading the cards…</div>;
  const stats = statsByFormat.find((r) => r.game_format === gameFormat) ?? statsByFormat[0];
  if (!stats) return <div className="py-20 text-center"><p className="text-muted-foreground">Duelist not found.</p><Link to="/" className="text-gold hover:underline">Back to leaderboard</Link></div>;
  const isMe = profile?.username === stats.username;

  return (
    <div className="space-y-8 py-6">
      <header className="text-center">
        <UserAvatar url={avatarUrl} name={stats.username} className="h-20 w-20 text-2xl mx-auto mb-3" />
        <h1 className="font-display text-4xl gold-text">{stats.username}</h1>
        <p className="text-muted-foreground mt-1">Duelist Profile</p>
        {!isMe && profile && (
          <Link to="/h2h" search={{ a: profile.username, b: stats.username }} className="inline-flex items-center gap-1.5 mt-3 text-sm text-gold hover:underline">
            <Swords className="h-4 w-4" /> Head to head with me
          </Link>
        )}
      </header>
      <div className="flex justify-center">
        <GameFormatTabs value={gameFormat} onChange={setGameFormat} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Duels" value={stats.total_duels} />
        <Stat label="Wins" value={stats.wins} className="text-success" />
        <Stat label="Losses" value={stats.losses} className="text-destructive" />
        <Stat label="Win %" value={`${stats.win_pct}%`} className="text-gold" />
        <Stat label="Elo" value={elo?.elo ?? 1500} className="text-gold" />
      </div>

      <section>
        <h2 className="font-display text-xl mb-3">Latest {gameFormatLabel(gameFormat)} duels</h2>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No {gameFormatLabel(gameFormat)} duels yet.</p>
        ) : (
          <div className="card-mystic rounded-lg overflow-hidden">
            <ul>
              {recent.map((d) => {
                const isP1 = d.player1_id === stats.user_id;
                const oppId = isP1 ? d.player2_id : d.player1_id;
                const opp = usernames[oppId] ?? "?";
                const myDeck = isP1 ? d.deck1_id : d.deck2_id;
                const oppDeck = isP1 ? d.deck2_id : d.deck1_id;
                const won = d.winner_id === stats.user_id;
                return (
                  <li key={d.id} className="border-b border-border last:border-0 px-4 py-3 grid grid-cols-12 items-center gap-2 text-sm">
                    <div className="col-span-1 font-display">
                      {!d.winner_id ? <span className="text-muted-foreground text-xs">…</span> : <span className={won ? "text-success" : "text-destructive"}>{won ? "W" : "L"}</span>}
                    </div>
                    <div className="col-span-6">
                      <div className="font-medium flex items-center gap-1.5 flex-wrap">
                        <span>vs {opp === "?" ? "?" : <Link to="/u/$username" params={{ username: opp }} className="text-gold hover:underline">{opp}</Link>}</span>
                        {d.for_fun && <span className="text-[9px] uppercase tracking-widest px-1 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-400/40">for fun</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{decksMap[myDeck ?? ""] ?? "—"} vs {decksMap[oppDeck ?? ""] ?? "—"}</div>
                    </div>
                    <div className="col-span-2 text-center text-muted-foreground">{isP1 ? d.games_p1_wins : d.games_p2_wins}-{isP1 ? d.games_p2_wins : d.games_p1_wins}</div>
                    <div className="col-span-3 text-right text-xs text-muted-foreground">{new Date(d.date).toLocaleDateString()}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl mb-3 flex items-center gap-2"><Trophy className="h-5 w-5 text-gold" /> Trophy Cabinet</h2>
        {trophies.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tournaments won yet.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {trophies.map((t) => (
              <li key={t.id} className="card-mystic rounded-lg p-4 flex items-center gap-3">
                <Trophy className="h-8 w-8 text-gold" />
                <div>
                  <div className="font-semibold flex items-center gap-1.5">{t.name} <GameFormatBadge format={t.game_format} /></div>
                  <div className="text-xs text-muted-foreground">{t.max_players} players{t.start_date ? ` • ${new Date(t.start_date).toLocaleDateString()}` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="card-mystic rounded-lg p-4 text-center">
      <div className={`font-display text-3xl ${className}`}>{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
