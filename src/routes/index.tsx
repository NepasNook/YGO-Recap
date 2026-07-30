import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Crown, Medal, Trophy } from "lucide-react";
export const Route = createFileRoute("/")({
  component: LeaderboardPage,
  head: () => ({
    meta: [
      { title: "Leaderboard — YGO Recap" },
      {
        name: "description",
        content: "Top duelists ranked by win rate. Track your climb to the top.",
      },
    ],
  }),
});

type Row = {
  user_id: string;
  username: string;
  total_duels: number;
  wins: number;
  losses: number;
  win_pct: number;
};
type EloRankRow = { user_id: string; username: string; elo: number; duels: number };

function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [eloRows, setEloRows] = useState<EloRankRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: statsData }, { data: eloData }] = await Promise.all([
        supabase
          .from("user_stats")
          .select("*")
          .order("win_pct", { ascending: false })
          .order("wins", { ascending: false })
          .limit(200),
        supabase.rpc("compute_elo_ratings"),
      ]);
      setRows((statsData as Row[] | null) ?? []);
      setEloRows(
        (
          (eloData as
            { user_id: string; username: string; elo: number; duels_played: number }[] | null) ?? []
        ).map((r) => ({
          user_id: r.user_id,
          username: r.username,
          elo: r.elo,
          duels: r.duels_played,
        })),
      );
      setLoading(false);
    })();
  }, []);

  const ranked = rows.filter((r) => r.total_duels > 0);
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  const eloTop3 = eloRows.slice(0, 3);
  const eloRest = eloRows.slice(3);

  return (
    <div className="space-y-10">
      <header className="text-center space-y-2 pt-4">
        <h1 className="font-display text-4xl md:text-5xl gold-text">Hall of Duelists</h1>
        <p className="text-muted-foreground">Champions ranked by win rate</p>
      </header>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Shuffling the leaderboard…</div>
      ) : ranked.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Podium
            top={top3.map((r) => ({
              user_id: r.user_id,
              username: r.username,
              badge: `${r.win_pct}% • ${r.wins}W`,
            }))}
          />
          <RankedList rows={rest} startRank={top3.length + 1} />
        </>
      )}

      <header className="text-center space-y-2 pt-4">
        <h2 className="font-display text-3xl md:text-4xl gold-text">Champions ranked by Elo</h2>
      </header>

      {loading
        ? null
        : eloRows.length > 0 && (
            <>
              <Podium
                top={eloTop3.map((r) => ({
                  user_id: r.user_id,
                  username: r.username,
                  badge: `${r.elo} Elo`,
                }))}
              />
              <EloRankedList rows={eloRest} startRank={eloTop3.length + 1} />
            </>
          )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card-mystic rounded-xl p-10 text-center space-y-4">
      <Trophy className="h-12 w-12 mx-auto text-gold" />
      <p className="text-muted-foreground">
        No duels recorded yet. Be the first to claim the throne.
      </p>
      <Link
        to="/signup"
        className="inline-block rounded-md gold-gradient px-5 py-2 font-medium text-background"
      >
        Join the duel
      </Link>
    </div>
  );
}

function Podium({ top }: { top: { user_id: string; username: string; badge: string }[] }) {
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = ["h-32", "h-44", "h-24"];
  const ranks = [2, 1, 3];
  return (
    <div className="flex items-end justify-center gap-3 md:gap-6 max-w-2xl mx-auto">
      {order.map((row, i) => (
        <PodiumPillar
          key={row.user_id}
          row={row}
          height={heights[i]}
          rank={ranks[i]}
          delay={i * 0.15}
        />
      ))}
    </div>
  );
}

function PodiumPillar({
  row,
  height,
  rank,
  delay,
}: {
  row: { user_id: string; username: string; badge: string };
  height: string;
  rank: number;
  delay: number;
}) {
  const Icon = rank === 1 ? Crown : Medal;
  const colors =
    rank === 1
      ? "from-yellow-300 to-amber-500"
      : rank === 2
        ? "from-slate-200 to-slate-400"
        : "from-amber-700 to-amber-900";
  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, type: "spring", stiffness: 100, damping: 14 }}
      className="flex flex-1 max-w-[150px] flex-col items-center"
    >
      <Link
        to="/u/$username"
        params={{ username: row.username }}
        className="flex flex-col items-center gap-2 group"
      >
        <div
          className={`h-12 w-12 rounded-full bg-gradient-to-br ${colors} grid place-items-center shadow-lg`}
        >
          <Icon className="h-6 w-6 text-background" />
        </div>
        <div className="text-sm font-semibold text-center group-hover:text-gold transition truncate max-w-full">
          {row.username}
        </div>
        <div className="text-xs text-muted-foreground">{row.badge}</div>
      </Link>
      <div className={`mt-2 w-full ${height} rounded-t-lg gold-gradient relative overflow-hidden`}>
        <div className="absolute inset-x-0 top-2 text-center font-display text-2xl text-background/80">
          #{rank}
        </div>
      </div>
    </motion.div>
  );
}

function RankedList({ rows, startRank }: { rows: Row[]; startRank: number }) {
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
          <li
            key={r.user_id}
            className="border-b border-border last:border-0 hover:bg-gold/5 transition"
          >
            <Link
              to="/u/$username"
              params={{ username: r.username }}
              className="grid grid-cols-12 gap-2 px-4 py-3 items-center"
            >
              <div className="col-span-1 text-muted-foreground">{startRank + i}</div>
              <div className="col-span-5 font-medium truncate">{r.username}</div>
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

function EloRankedList({ rows, startRank }: { rows: EloRankRow[]; startRank: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="card-mystic rounded-xl overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
        <div className="col-span-1">#</div>
        <div className="col-span-6">Duelist</div>
        <div className="col-span-2 text-right">Duelli</div>
        <div className="col-span-3 text-right">Elo</div>
      </div>
      <ul>
        {rows.map((r, i) => (
          <li
            key={r.user_id}
            className="border-b border-border last:border-0 hover:bg-gold/5 transition"
          >
            <Link
              to="/u/$username"
              params={{ username: r.username }}
              className="grid grid-cols-12 gap-2 px-4 py-3 items-center"
            >
              <div className="col-span-1 text-muted-foreground">{startRank + i}</div>
              <div className="col-span-6 font-medium truncate">{r.username}</div>
              <div className="col-span-2 text-right text-muted-foreground">{r.duels}</div>
              <div className="col-span-3 text-right text-gold font-semibold">{r.elo}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
