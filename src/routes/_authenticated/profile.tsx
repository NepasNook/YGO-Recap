import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trophy, LogOut, Swords, Pencil, Check, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "My Profile — YGO Recap" }] }),
});

type Deck = { id: string; name: string };
type DuelRow = {
  id: string;
  date: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  deck1_id: string | null;
  deck2_id: string | null;
  games_p1_wins: number;
  games_p2_wins: number;
  for_fun: boolean;
};

function ProfilePage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [allDuels, setAllDuels] = useState<DuelRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [decksMap, setDecksMap] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<{
    total_duels: number;
    wins: number;
    losses: number;
    win_pct: number;
  } | null>(null);
  const [trophies, setTrophies] = useState<
    { id: string; name: string; max_players: number; start_date: string | null }[]
  >([]);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  const load = async () => {
    if (!user) return;
    const [{ data: d }, { data: dl }, { data: dlAll }, { data: s }, { data: tr }] =
      await Promise.all([
        supabase.from("decks").select("id, name").order("name"),
        supabase
          .from("duels")
          .select("*")
          .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
          .order("date", { ascending: false })
          .limit(100),
        supabase.from("duels").select("*").order("date", { ascending: false }).limit(200),
        supabase
          .from("user_stats")
          .select("total_duels, wins, losses, win_pct")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("tournaments")
          .select("id, name, max_players, start_date")
          .eq("winner_id", user.id),
      ]);
    setDecks((d ?? []) as Deck[]);
    setDuels((dl as DuelRow[] | null) ?? []);
    setAllDuels((dlAll as DuelRow[] | null) ?? []);
    setStats(s as any);
    setTrophies(tr ?? []);
    const userIds = new Set<string>();
    (dl ?? []).forEach((row: any) => {
      userIds.add(row.player1_id);
      userIds.add(row.player2_id);
    });
    (dlAll ?? []).forEach((row: any) => {
      userIds.add(row.player1_id);
      userIds.add(row.player2_id);
    });
    if (userIds.size) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", Array.from(userIds));
      setProfilesMap(Object.fromEntries((ps ?? []).map((p: any) => [p.id, p.username])));
    }
    setDecksMap(Object.fromEntries(((d ?? []) as Deck[]).map((dk) => [dk.id, dk.name])));
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user?.id]);

  const startEdit = () => {
    setNewName(profile?.username ?? "");
    setNameError("");
    setEditingName(true);
  };

  const cancelEdit = () => {
    setEditingName(false);
    setNameError("");
  };

  const saveNickname = async () => {
    if (!user || !newName.trim()) return;
    const trimmed = newName.trim();
    if (trimmed === profile?.username) {
      setEditingName(false);
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 30) {
      setNameError("Nickname must be 2–30 characters.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      setNameError(error.message);
    } else {
      setEditingName(false);
      await refreshProfile();
    }
  };

  return (
    <div className="space-y-6 py-4">
      <header className="flex items-center justify-between">
        <div>
          {editingName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNameError("");
                  }}
                  className="w-64"
                  placeholder="Enter nickname"
                  disabled={saving}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNickname();
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <Button size="sm" variant="ghost" onClick={saveNickname} disabled={saving}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl gold-text">{profile?.username ?? "Duelist"}</h1>
              <Button size="sm" variant="ghost" onClick={startEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-1" /> Sign out
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Duels" value={stats?.total_duels ?? 0} />
        <Stat label="Wins" value={stats?.wins ?? 0} className="text-success" />
        <Stat label="Losses" value={stats?.losses ?? 0} className="text-destructive" />
        <Stat label="Win %" value={`${stats?.win_pct ?? 0}%`} className="text-gold" />
      </div>

      <Tabs defaultValue="history">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="decks">Decks</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="trophies">Trophies</TabsTrigger>
        </TabsList>

        <TabsContent value="decks" className="space-y-2">
          <p className="text-xs text-muted-foreground">The available archetypes for all duels.</p>
          <ul className="grid grid-cols-2 gap-2">
            {decks.map((d) => (
              <li key={d.id} className="card-mystic rounded-lg px-3 py-2 text-sm font-medium">
                {d.name}
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="history">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <Link
              to="/duel/new"
              className="inline-flex items-center gap-2 text-sm text-gold hover:underline"
            >
              <Swords className="h-4 w-4" /> Start new duel
            </Link>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="show-all"
                className={`text-xs ${!showAll ? "text-gold" : "text-muted-foreground"}`}
              >
                Miei
              </Label>
              <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
              <Label
                htmlFor="show-all"
                className={`text-xs ${showAll ? "text-gold" : "text-muted-foreground"}`}
              >
                Tutti
              </Label>
            </div>
          </div>
          {(() => {
            const list = showAll ? allDuels : duels;
            if (list.length === 0)
              return <p className="text-muted-foreground text-sm">No duels yet.</p>;
            return (
              <div className="card-mystic rounded-lg overflow-hidden">
                <ul>
                  {list.map((d) => {
                    const involved = d.player1_id === user!.id || d.player2_id === user!.id;
                    const isP1 = d.player1_id === user!.id;
                    const won = d.winner_id === user!.id;
                    const p1Name = profilesMap[d.player1_id] ?? "?";
                    const p2Name = profilesMap[d.player2_id] ?? "?";
                    const p1Won = d.winner_id === d.player1_id;
                    const p2Won = d.winner_id === d.player2_id;
                    return (
                      <li
                        key={d.id}
                        className="border-b border-border last:border-0 px-4 py-3 grid grid-cols-12 items-center gap-2 text-sm"
                      >
                        <div className="col-span-1 font-display">
                          {involved ? (
                            <span className={won ? "text-success" : "text-destructive"}>
                              {won ? "W" : "L"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                        <div className="col-span-5">
                          <div className="font-medium flex items-center gap-1.5 flex-wrap">
                            {showAll && !involved ? (
                              <span>
                                <Link
                                  to="/u/$username"
                                  params={{ username: p1Name }}
                                  className={`hover:underline ${p1Won ? "text-success" : "text-foreground"}`}
                                >
                                  {p1Name}
                                </Link>
                                <span className="text-muted-foreground"> vs </span>
                                <Link
                                  to="/u/$username"
                                  params={{ username: p2Name }}
                                  className={`hover:underline ${p2Won ? "text-success" : "text-foreground"}`}
                                >
                                  {p2Name}
                                </Link>
                              </span>
                            ) : (
                              <span>
                                vs{" "}
                                <Link
                                  to="/u/$username"
                                  params={{ username: isP1 ? p2Name : p1Name }}
                                  className="text-gold hover:underline"
                                >
                                  {isP1 ? p2Name : p1Name}
                                </Link>
                              </span>
                            )}
                            {d.for_fun && (
                              <span className="text-[9px] uppercase tracking-widest px-1 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-400/40">
                                for fun
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {decksMap[d.deck1_id ?? ""] ?? "—"} vs{" "}
                            {decksMap[d.deck2_id ?? ""] ?? "—"}
                          </div>
                        </div>
                        <div className="col-span-3 text-center text-muted-foreground">
                          {d.games_p1_wins}-{d.games_p2_wins}
                        </div>
                        <div className="col-span-3 text-right text-xs text-muted-foreground">
                          {new Date(d.date).toLocaleDateString()}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="analytics">
          <DeckAnalytics userId={user!.id} decks={decks} duels={duels} decksMap={decksMap} />
        </TabsContent>

        <TabsContent value="trophies">
          {trophies.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tournament wins yet.</p>
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
        </TabsContent>
      </Tabs>
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
    <div className="card-mystic rounded-lg p-3 text-center">
      <div className={`font-display text-2xl ${className}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function DeckAnalytics({
  userId,
  decks,
  duels,
  decksMap,
}: {
  userId: string;
  decks: Deck[];
  duels: DuelRow[];
  decksMap: Record<string, string>;
}) {
  const playedDecks = decks.filter((deck) =>
    duels.some(
      (d) =>
        (d.player1_id === userId && d.deck1_id === deck.id) ||
        (d.player2_id === userId && d.deck2_id === deck.id),
    ),
  );
  if (playedDecks.length === 0)
    return <p className="text-muted-foreground text-sm">Play some duels to see analytics.</p>;
  return (
    <div className="space-y-6">
      {playedDecks.map((deck) => {
        const matches = duels.filter(
          (d) =>
            (d.player1_id === userId && d.deck1_id === deck.id) ||
            (d.player2_id === userId && d.deck2_id === deck.id),
        );
        const byOppDeck: Record<string, { name: string; wins: number; losses: number }> = {};
        matches.forEach((d) => {
          const isP1 = d.player1_id === userId;
          const oppDeckId = (isP1 ? d.deck2_id : d.deck1_id) ?? "unknown";
          const won = d.winner_id === userId;
          const key = oppDeckId;
          if (!byOppDeck[key])
            byOppDeck[key] = { name: decksMap[oppDeckId] ?? "Unknown", wins: 0, losses: 0 };
          if (won) byOppDeck[key].wins++;
          else byOppDeck[key].losses++;
        });
        const data = Object.values(byOppDeck);
        return (
          <div key={deck.id} className="card-mystic rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-display text-lg text-gold">{deck.name}</h3>
              <span className="text-xs text-muted-foreground">
                {matches.length} duel{matches.length === 1 ? "" : "s"}
              </span>
            </div>
            {data.length === 0 ? (
              <p className="text-xs text-muted-foreground">No duels with this deck yet.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.72 0.03 90)" }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "oklch(0.72 0.03 90)" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.21 0.045 265)",
                        border: "1px solid oklch(0.82 0.16 88 / 0.3)",
                        borderRadius: 8,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="wins"
                      fill="oklch(0.7 0.18 145)"
                      name="Wins"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="losses"
                      fill="oklch(0.62 0.22 25)"
                      name="Losses"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
