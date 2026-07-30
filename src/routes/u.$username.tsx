import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/u/$username")({
  component: PublicProfile,
});

type Stats = {
  user_id: string;
  username: string;
  total_duels: number;
  wins: number;
  losses: number;
  win_pct: number;
};

function PublicProfile() {
  const { username } = Route.useParams();
  const [stats, setStats] = useState<Stats | null>(null);
  const [trophies, setTrophies] = useState<
    { id: string; name: string; max_players: number; start_date: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase
        .from("user_stats")
        .select("*")
        .eq("username", username)
        .maybeSingle();
      setStats(s as Stats | null);
      if (s) {
        const { data: t } = await supabase
          .from("tournaments")
          .select("id, name, max_players, start_date")
          .eq("winner_id", s.user_id as string);
        setTrophies(t ?? []);
      }
      setLoading(false);
    })();
  }, [username]);

  if (loading)
    return <div className="py-20 text-center text-muted-foreground">Reading the cards…</div>;
  if (!stats)
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Duelist not found.</p>
        <Link to="/" className="text-gold hover:underline">
          Back to leaderboard
        </Link>
      </div>
    );

  return (
    <div className="space-y-8 py-6">
      <header className="text-center">
        <h1 className="font-display text-4xl gold-text">{stats.username}</h1>
        <p className="text-muted-foreground mt-1">Duelist Profile</p>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Duels" value={stats.total_duels} />
        <Stat label="Wins" value={stats.wins} className="text-success" />
        <Stat label="Losses" value={stats.losses} className="text-destructive" />
        <Stat label="Win %" value={`${stats.win_pct}%`} className="text-gold" />
      </div>
      <section>
        <h2 className="font-display text-xl mb-3 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-gold" /> Trophy Cabinet
        </h2>
        {trophies.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tournaments won yet.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {trophies.map((t) => (
              <li key={t.id} className="card-mystic rounded-lg p-4 flex items-center gap-3">
                <Trophy className="h-8 w-8 text-gold" />
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.max_players} players
                    {t.start_date ? ` • ${new Date(t.start_date).toLocaleDateString()}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className="card-mystic rounded-lg p-4 text-center">
      <div className={`font-display text-3xl ${className}`}>{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
