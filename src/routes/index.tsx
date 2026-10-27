import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Crown, Medal, Trophy } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";
import { GameFormatTabs } from "@/components/GameFormatPicker";
import { gameFormatLabel } from "@/lib/gameFormat";
import { useGameFormat } from "@/hooks/use-game-format";

export const Route = createFileRoute("/")({
  component: LeaderboardPage,
  head: () => ({ meta: [
    { title: "Leaderboard — YGO Recap" },
    { name: "description", content: "Top duelists ranked by win rate. Track your climb to the top." },
  ]}),
});

type Row = { user_id: string; username: string; total_duels: number; wins: number; losses: number; win_pct: number };
type EloRankRow = { user_id: string; username: string; elo: number; duels: number };

// Duelists need a minimum sample size before they're ranked — too few
// matches makes win rate / Elo unreliable and noisy.
const MIN_DUELS_FOR_RANKING = 10;

function LeaderboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [eloRows, setEloRows] = useState<EloRankRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Each format has its own leaderboards: only one is shown at a time.
  const [gameFormat, setGameFormat] = useGameFormat();

  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: statsData }, { data: eloData }, { data: profilesData }] = await Promise.all([
        // Filter before limiting, so players below the minimum can't crowd ranked ones out of the top 200.
        supabase.from("user_format_stats").select("*").eq("game_format", gameFormat).gte("total_duels", MIN_DUELS_FOR_RANKING).order("win_pct", { ascending: false }).order("wins", { ascending: false }).limit(200),
        supabase.rpc("compute_elo_ratings", { _game_format: gameFormat }),
        supabase.from("profiles").select("id, avatar_url"),
      ]);
      // A quick format switch must not let the older request overwrite the newer one.
      if (cancelled) return;
      setRows((statsData as Row[] | null) ?? []);
      setEloRows(((eloData as { user_id: string; username: string; elo: number; duels_played: number }[] | null) ?? []).map((r) => ({ user_id: r.user_id, username: r.username, elo: r.elo, duels: r.duels_played })));
      setAvatars(Object.fromEntries(((profilesData as { id: string; avatar_url: string | null }[] | null) ?? []).map((p) => [p.id, p.avatar_url])));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  // Win-rate stats and avatars are readable only once signed in: reload when the session shows up.
  }, [user?.id, gameFormat]);

  const ranked = rows.filter((r) => r.total_duels >= MIN_DUELS_FOR_RANKING);
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const eloRanked = eloRows.filter((r) => r.duels >= MIN_DUELS_FOR_RANKING);
  const eloTop3 = eloRanked.slice(0, 3);
  const eloRest = eloRanked.slice(3);

  return (
    <div className="space-y-10">
      <header className="text-center space-y-2 pt-4">
        <h1 className="font-display text-4xl md:text-5xl gold-text">Hall of Duelists</h1>
        <p className="text-muted-foreground">Champions ranked by win rate</p>
        <GameFormatTabs value={gameFormat} onChange={setGameFormat} className="mt-2" />
      </header>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Shuffling the leaderboard…</div>
      ) : !authLoading && !user ? (
        <LoginRequired message="Sign in to see the win-rate leaderboard." />
      ) : ranked.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Podium top={top3.map((r) => ({ user_id: r.user_id, username: r.username, badge: `${r.win_pct}% • ${r.wins}W`, avatarUrl: avatars[r.user_id] }))} />
          <RankedList rows={rest} startRank={top3.length + 1} avatars={avatars} />
        </>
      )}

      <header className="text-center space-y-2 pt-4">
        <h2 className="font-display text-3xl md:text-4xl gold-text">Champions ranked by Elo</h2>
        <p className="text-muted-foreground text-sm">{gameFormatLabel(gameFormat)} format</p>
      </header>

      {loading ? null : eloRanked.length === 0 ? (
        user && <EmptyState />
      ) : (
        <>
          <Podium top={eloTop3.map((r) => ({ user_id: r.user_id, username: r.username, badge: `${r.elo} Elo`, avatarUrl: avatars[r.user_id] }))} />
          <EloRankedList rows={eloRest} startRank={eloTop3.length + 1} avatars={avatars} />
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card-mystic rounded-xl p-10 text-center space-y-4">
      <Trophy className="h-12 w-12 mx-auto text-gold" />
      <p className="text-muted-foreground">The leaderboard is shown once a duelist reaches {MIN_DUELS_FOR_RANKING} duels.</p>
    </div>
  );
}

function Podium({ top }: { top: { user_id: string; username: string; badge: string; avatarUrl?: string | null }[] }) {
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = ["h-32", "h-44", "h-24"];
  const ranks = [2, 1, 3];
  return (
    <div className="flex items-end justify-center gap-3 md:gap-6 max-w-2xl mx-auto">
      {order.map((row, i) => (
        <PodiumPillar key={row.user_id} row={row} height={heights[i]} rank={ranks[i]} delay={i * 0.15} />
      ))}
    </div>
  );
}

function PodiumPillar({ row, height, rank, delay }: { row: { user_id: string; username: string; badge: string; avatarUrl?: string | null }; height: string; rank: number; delay: number }) {
  const Icon = rank === 1 ? Crown : Medal;
  const colors = rank === 1
    ? "from-yellow-300 to-amber-500"
    : rank === 2 ? "from-slate-200 to-slate-400" : "from-amber-700 to-amber-900";
  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, type: "spring", stiffness: 100, damping: 14 }}
      className="flex flex-1 max-w-[150px] flex-col items-center"
    >
      <Link to="/u/$username" params={{ username: row.username }} className="flex flex-col items-center gap-2 group">
        <div className="relative">
          <UserAvatar url={row.avatarUrl} name={row.username} className="h-14 w-14 shadow-lg" />
          <div className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-gradient-to-br ${colors} grid place-items-center shadow ring-2 ring-background`}>
            <Icon className="h-3.5 w-3.5 text-background" />
          </div>
        </div>
        <div className="text-sm font-semibold text-center group-hover:text-gold transition truncate max-w-full">{row.username}</div>
        <div className="text-xs text-muted-foreground">{row.badge}</div>
      </Link>
      <div className={`mt-2 w-full ${height} rounded-t-lg gold-gradient relative overflow-hidden`}>
        <div className="absolute inset-x-0 top-2 text-center font-display text-2xl text-background/80">#{rank}</div>
      </div>
    </motion.div>
  );
}

function RankedList({ rows, startRank, avatars }: { rows: Row[]; startRank: number; avatars: Record<string, string | null> }) {
  if (rows.length === 0) return null;
  return (
    <div className="card-mystic rounded-xl overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
        <div className="col-span-1">#</div>
        <div className="col-span-5">Duelist</div>
        <div className="col-span-2 text-right">W</div>
        <div className="col-span-2 text-right">L</div>
        <div className="col-span-2 text-right">Win%</div>
      </div>
      <ul>
        {rows.map((r, i) => (
          <li key={r.user_id} className="border-b border-border last:border-0 hover:bg-gold/5 transition">
            <Link to="/u/$username" params={{ username: r.username }} className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
              <div className="col-span-1 text-muted-foreground">{startRank + i}</div>
              <div className="col-span-5 font-medium truncate flex items-center gap-2">
                <UserAvatar url={avatars[r.user_id]} name={r.username} className="h-7 w-7 shrink-0" />
                <span className="truncate">{r.username}</span>
              </div>
              <div className="col-span-2 text-right text-success">{r.wins}</div>
              <div className="col-span-2 text-right text-destructive">{r.losses}</div>
              <div className="col-span-2 text-right text-gold font-semibold">{r.win_pct}%</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EloRankedList({ rows, startRank, avatars }: { rows: EloRankRow[]; startRank: number; avatars: Record<string, string | null> }) {
  if (rows.length === 0) return null;
  return (
    <div className="card-mystic rounded-xl overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
        <div className="col-span-1">#</div>
        <div className="col-span-6">Duelist</div>
        <div className="col-span-2 text-right">Duels</div>
        <div className="col-span-3 text-right">Elo</div>
      </div>
      <ul>
        {rows.map((r, i) => (
          <li key={r.user_id} className="border-b border-border last:border-0 hover:bg-gold/5 transition">
            <Link to="/u/$username" params={{ username: r.username }} className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
              <div className="col-span-1 text-muted-foreground">{startRank + i}</div>
              <div className="col-span-6 font-medium truncate flex items-center gap-2">
                <UserAvatar url={avatars[r.user_id]} name={r.username} className="h-7 w-7 shrink-0" />
                <span className="truncate">{r.username}</span>
              </div>
              <div className="col-span-2 text-right text-muted-foreground">{r.duels}</div>
              <div className="col-span-3 text-right text-gold font-semibold">{r.elo}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
