import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trophy, LogOut, Swords, Pencil, Check, X, Camera, ChevronDown, ChevronRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "sonner";
import { GameFormatBadge, GameFormatTabs } from "@/components/GameFormatPicker";
import { GAME_FORMATS, gameFormatLabel, type GameFormat } from "@/lib/gameFormat";
import { useGameFormat } from "@/hooks/use-game-format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultDeckFor, fetchDefaultDecks } from "@/lib/defaultDecks";

const TREND_PALETTE = [
  "oklch(0.7 0.15 200)",
  "oklch(0.75 0.15 300)",
  "oklch(0.7 0.18 60)",
  "oklch(0.65 0.2 340)",
  "oklch(0.68 0.14 140)",
  "oklch(0.62 0.15 250)",
  "oklch(0.6 0.02 90)",
];

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "My Profile — YGO Recap" }] }),
});

type Deck = { id: string; name: string; game_format: string };
type FormatStats = { game_format: string; total_duels: number; wins: number; losses: number; win_pct: number };
type DuelRow = {
  id: string; date: string;
  player1_id: string; player2_id: string; winner_id: string | null;
  deck1_id: string | null; deck2_id: string | null;
  games_p1_wins: number; games_p2_wins: number;
  for_fun: boolean;
  game_format: string;
};

function ProfilePage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [allDuels, setAllDuels] = useState<DuelRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [decksMap, setDecksMap] = useState<Record<string, string>>({});
  const [scoredDuels, setScoredDuels] = useState<DuelRow[]>([]);
  const [allUsernamesById, setAllUsernamesById] = useState<Record<string, string>>({});
  const [statsByFormat, setStatsByFormat] = useState<FormatStats[]>([]);
  const [trophies, setTrophies] = useState<{ id: string; name: string; max_players: number; start_date: string | null; game_format: string }[]>([]);
  // GOAT and EDISON are tracked separately: every stat, list and chart below shows one format.
  const [gameFormat, setGameFormat] = useGameFormat();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [trendMode, setTrendMode] = useState<"custom" | "all">("custom");
  const [customStartDate, setCustomStartDate] = useState("2026-07-08");
  const trendStartTime = trendMode === "all" ? -Infinity : new Date(`${customStartDate}T00:00:00`).getTime();
  const [includeForFun, setIncludeForFun] = useState(false);

  // Fetches every duel the user has ever played (no cap) by paging through
  // results — PostgREST caps each request, so a single .limit() call would
  // silently truncate for a user with a lot of history.
  const fetchAllOwnDuels = async (userId: string): Promise<DuelRow[]> => {
    const pageSize = 1000;
    let from = 0;
    let all: DuelRow[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("duels")
        .select("*")
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .order("date", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error || !data) break;
      all = all.concat(data as DuelRow[]);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  };

  // Every decided duel of every player, oldest first, for the trend chart —
  // paged for the same reason as above (a .limit() would keep only the oldest 1000).
  const fetchAllScoredDuels = async (): Promise<DuelRow[]> => {
    const pageSize = 1000;
    let from = 0;
    let all: DuelRow[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("duels")
        .select("id, date, player1_id, player2_id, winner_id, deck1_id, deck2_id, for_fun, game_format")
        .not("winner_id", "is", null)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error || !data) break;
      all = all.concat(data as DuelRow[]);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  };

  const load = async () => {
    if (!user) return;
    const [{ data: d }, dl, { data: s }, { data: tr }, scored, { data: allProfiles }] = await Promise.all([
      supabase.from("decks").select("id, name, game_format").order("name"),
      fetchAllOwnDuels(user.id),
      supabase.from("user_format_stats").select("game_format, total_duels, wins, losses, win_pct").eq("user_id", user.id),
      supabase.from("tournaments").select("id, name, max_players, start_date, game_format").eq("winner_id", user.id),
      fetchAllScoredDuels(),
      supabase.from("profiles").select("id, username"),
    ]);
    setDecks((d ?? []) as Deck[]);
    setDuels(dl ?? []);
    setStatsByFormat((s as FormatStats[] | null) ?? []);
    setTrophies(tr ?? []);
    setScoredDuels(scored);
    setAllUsernamesById(Object.fromEntries(((allProfiles as { id: string; username: string }[] | null) ?? []).map((p) => [p.id, p.username])));
    setDecksMap(Object.fromEntries(((d ?? []) as Deck[]).map((dk) => [dk.id, dk.name])));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [user?.id]);

  // Everyone's latest duels ("All" in the history tab), fetched per format so
  // the 200 most recent are all of the format being shown.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase.from("duels").select("*").eq("game_format", gameFormat).order("date", { ascending: false }).limit(200)
      .then(({ data }) => { if (!cancelled) setAllDuels((data as DuelRow[] | null) ?? []); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the signed-in user changes, not on every new `user` object
  }, [user?.id, gameFormat]);

  const stats = statsByFormat.find((r) => r.game_format === gameFormat) ?? null;
  const fmtDecks = useMemo(() => decks.filter((d) => d.game_format === gameFormat), [decks, gameFormat]);
  const fmtDuels = useMemo(() => duels.filter((d) => d.game_format === gameFormat), [duels, gameFormat]);
  const fmtScoredDuels = useMemo(() => scoredDuels.filter((d) => d.game_format === gameFormat), [scoredDuels, gameFormat]);


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
    const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", user.id);
    setSaving(false);
    if (error) {
      setNameError(error.message);
    } else {
      setEditingName(false);
      await refreshProfile();
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("Select an image"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image too large (max 5MB)"); return; }
    setUploadingAvatar(true);
    const path = `${user.id}/avatar`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { toast.error(upErr.message); setUploadingAvatar(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setUploadingAvatar(false);
    if (error) toast.error(error.message);
    else { toast.success("Profile picture updated"); await refreshProfile(); }
  };

  return (
    <div className="space-y-6 py-4">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="relative group cursor-pointer shrink-0">
            <UserAvatar url={profile?.avatar_url} name={profile?.username ?? "?"} className="h-16 w-16 text-xl" />
            <span className="absolute inset-0 rounded-full bg-background/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              <Camera className="h-5 w-5 text-gold" />
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingAvatar}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
            />
          </label>
          <div>
          {editingName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setNameError(""); }}
                  className="w-64"
                  placeholder="Enter nickname"
                  disabled={saving}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") cancelEdit(); }}
                />
                <Button size="sm" variant="ghost" onClick={saveNickname} disabled={saving}><Check className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}><X className="h-4 w-4" /></Button>
              </div>
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl gold-text">{profile?.username ?? "Duelist"}</h1>
              <Button size="sm" variant="ghost" onClick={startEdit}><Pencil className="h-4 w-4" /></Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" /> Sign out</Button>
      </header>

      <div className="flex justify-center">
        <GameFormatTabs value={gameFormat} onChange={setGameFormat} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Duels" value={stats?.total_duels ?? 0} />
        <Stat label="Wins" value={stats?.wins ?? 0} className="text-success" />
        <Stat label="Losses" value={stats?.losses ?? 0} className="text-destructive" />
        <Stat label="Win %" value={`${stats?.win_pct ?? 0}%`} className="text-gold" />
      </div>

      <DefaultDecksCard userId={user!.id} decks={decks} />

      <Tabs defaultValue="history">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="decks">Decks</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="elo">Elo</TabsTrigger>
          <TabsTrigger value="trophies">Trophies</TabsTrigger>
        </TabsList>

        <TabsContent value="decks" className="space-y-2">
          <p className="text-xs text-muted-foreground">Decks available in the {gameFormatLabel(gameFormat)} format.</p>
          <ul className="grid grid-cols-2 gap-2">
            {fmtDecks.map((d) => (
              <li key={d.id} className="card-mystic rounded-lg px-3 py-2 text-sm font-medium">{d.name}</li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="history">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <Link to="/duel/new" className="inline-flex items-center gap-2 text-sm text-gold hover:underline"><Swords className="h-4 w-4" /> Start new duel</Link>
            <div className="flex items-center gap-2">
              <Label htmlFor="show-all" className={`text-xs ${!showAll ? "text-gold" : "text-muted-foreground"}`}>Mine</Label>
              <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
              <Label htmlFor="show-all" className={`text-xs ${showAll ? "text-gold" : "text-muted-foreground"}`}>All</Label>
            </div>
          </div>
          {(() => {
            const list = showAll ? allDuels : fmtDuels;
            if (list.length === 0) return <p className="text-muted-foreground text-sm">No duels yet.</p>;
            return (
            <div className="card-mystic rounded-lg overflow-hidden">
              <ul>
                {list.map((d) => {
                  const involved = d.player1_id === user!.id || d.player2_id === user!.id;
                  const isP1 = d.player1_id === user!.id;
                  const won = d.winner_id === user!.id;
                  const p1Name = allUsernamesById[d.player1_id] ?? "?";
                  const p2Name = allUsernamesById[d.player2_id] ?? "?";
                  const p1Won = d.winner_id === d.player1_id;
                  const p2Won = d.winner_id === d.player2_id;
                  return (
                    <li key={d.id} className="border-b border-border last:border-0 px-4 py-3 grid grid-cols-12 items-center gap-2 text-sm">
                      <div className="col-span-1 font-display">
                        {involved && !d.winner_id ? (
                          <span className="text-muted-foreground text-xs" title="In progress">…</span>
                        ) : involved ? (
                          <span className={won ? "text-success" : "text-destructive"}>{won ? "W" : "L"}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>
                      <div className="col-span-5">
                        <div className="font-medium flex items-center gap-1.5 flex-wrap">
                          {showAll && !involved ? (
                            <span>
                              <Link to="/u/$username" params={{ username: p1Name }} className={`hover:underline ${p1Won ? "text-success" : "text-foreground"}`}>{p1Name}</Link>
                              <span className="text-muted-foreground"> vs </span>
                              <Link to="/u/$username" params={{ username: p2Name }} className={`hover:underline ${p2Won ? "text-success" : "text-foreground"}`}>{p2Name}</Link>
                            </span>
                          ) : (
                            <span>vs {(isP1 ? p2Name : p1Name) === "?" ? "?" : <Link to="/u/$username" params={{ username: (isP1 ? p2Name : p1Name) }} className="text-gold hover:underline">{isP1 ? p2Name : p1Name}</Link>}</span>
                          )}
                          {d.for_fun && <span className="text-[9px] uppercase tracking-widest px-1 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-400/40">for fun</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{decksMap[d.deck1_id ?? ""] ?? "—"} vs {decksMap[d.deck2_id ?? ""] ?? "—"}</div>
                      </div>
                      <div className="col-span-3 text-center text-muted-foreground">{d.games_p1_wins}-{d.games_p2_wins}</div>
                      <div className="col-span-3 text-right text-xs text-muted-foreground">{new Date(d.date).toLocaleDateString()}</div>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })()}
        </TabsContent>


        <TabsContent value="analytics" className="space-y-6">
          <div className="flex items-center justify-end gap-2">
            <Label htmlFor="include-for-fun" className={`text-xs ${includeForFun ? "text-gold" : "text-muted-foreground"}`}>Include "for fun" duels</Label>
            <Switch id="include-for-fun" checked={includeForFun} onCheckedChange={setIncludeForFun} />
          </div>
          <OpponentResultsTable userId={user!.id} duels={fmtDuels} usernamesById={allUsernamesById} decksMap={decksMap} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button onClick={() => setTrendMode("custom")} className={`px-3 py-1 rounded-md text-xs font-medium transition ${trendMode === "custom" ? "gold-gradient text-background" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}>From date</button>
            <button onClick={() => setTrendMode("all")} className={`px-3 py-1 rounded-md text-xs font-medium transition ${trendMode === "all" ? "gold-gradient text-background" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}>All time</button>
            {trendMode === "custom" && (
              <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-auto h-8 text-xs" />
            )}
          </div>
          <WinRateTrendChart duels={fmtScoredDuels} usernamesById={allUsernamesById} myUsername={profile?.username ?? ""} startTime={trendStartTime} includeForFun={includeForFun} />
        </TabsContent>

        <TabsContent value="elo">
          <EloTrendChart duels={fmtScoredDuels} usernamesById={allUsernamesById} myUserId={user!.id} myUsername={profile?.username ?? ""} />
        </TabsContent>

        <TabsContent value="trophies">
          {trophies.length === 0 ? <p className="text-muted-foreground text-sm">No tournament wins yet.</p> : (
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

// One dropdown per game format: the deck pre-selected for me when a new duel
// or tournament match starts (it can still be changed for that duel).
function DefaultDecksCard({ userId, decks }: { userId: string; decks: Deck[] }) {
  const [selected, setSelected] = useState<Partial<Record<GameFormat, string>>>({});
  const [saving, setSaving] = useState<GameFormat | null>(null);

  useEffect(() => {
    if (decks.length === 0) return;
    fetchDefaultDecks().then((map) => {
      setSelected(Object.fromEntries(GAME_FORMATS.map((f) => [
        f.value,
        defaultDeckFor(map, userId, f.value, decks.filter((d) => d.game_format === f.value)),
      ])));
    });
  }, [userId, decks]);

  const save = async (format: GameFormat, deckId: string) => {
    const prev = selected[format] ?? "";
    setSelected((s) => ({ ...s, [format]: deckId }));
    setSaving(format);
    const { error } = deckId
      ? await supabase.from("user_default_decks").upsert({ user_id: userId, game_format: format, deck_id: deckId })
      : await supabase.from("user_default_decks").delete().eq("user_id", userId).eq("game_format", format);
    setSaving(null);
    if (error) {
      setSelected((s) => ({ ...s, [format]: prev }));
      toast.error(error.message);
    } else {
      toast.success(deckId ? `Default ${gameFormatLabel(format)} deck saved` : `Default ${gameFormatLabel(format)} deck removed`);
    }
  };

  return (
    <div className="card-mystic rounded-lg p-4 space-y-3">
      <div>
        <h3 className="font-display text-lg text-gold">Default decks</h3>
        <p className="text-xs text-muted-foreground">Preselected when you start a duel: you can always change them for a single match.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GAME_FORMATS.map((f) => (
          <div key={f.value} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            <Select value={selected[f.value] || "none"} onValueChange={(v) => save(f.value, v === "none" ? "" : v)} disabled={saving === f.value}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {decks.filter((d) => d.game_format === f.value).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="card-mystic rounded-lg p-3 text-center">
      <div className={`font-display text-2xl ${className}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

// Keyed by the (my deck, their deck) pair — not just their deck — since I
// may have played different decks against the same opponent (e.g. Burn one
// game, Earth Aggro the next), and those are different matchups worth
// distinguishing rather than lumping together under "their deck".
type OpponentDeckStat = { key: string; myDeckName: string; oppDeckName: string; wins: number; losses: number };
type OpponentStat = { opponentId: string; opponentName: string; wins: number; losses: number; byDeck: OpponentDeckStat[] };

const UNKNOWN_DECK = "Unspecified deck";

// Results broken down per opponent faced, and — since either side may have
// used more than one deck across matches — per (my deck, their deck) pairing
// within that opponent. Always excludes "for fun" duels, independent of the
// tab's toggle above; tournament duels are included automatically since
// they're regular rows in the same `duels` table with no separate flag to
// exclude them.
function OpponentResultsTable({ userId, duels, usernamesById, decksMap }: {
  userId: string; duels: DuelRow[]; usernamesById: Record<string, string>; decksMap: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const scored = duels.filter((d) => d.winner_id !== null && !d.for_fun);
    const byOpponent: Record<string, OpponentStat> = {};
    scored.forEach((d) => {
      const isP1 = d.player1_id === userId;
      const oppId = isP1 ? d.player2_id : d.player1_id;
      if (!oppId || oppId === userId) return;
      const myDeckId = isP1 ? d.deck1_id : d.deck2_id;
      const oppDeckId = isP1 ? d.deck2_id : d.deck1_id;
      const won = d.winner_id === userId;

      const entry = (byOpponent[oppId] ??= { opponentId: oppId, opponentName: usernamesById[oppId] ?? "?", wins: 0, losses: 0, byDeck: [] });
      if (won) entry.wins++; else entry.losses++;

      const key = `${myDeckId ?? "null"}::${oppDeckId ?? "null"}`;
      let deckEntry = entry.byDeck.find((x) => x.key === key);
      if (!deckEntry) {
        deckEntry = {
          key,
          myDeckName: myDeckId ? (decksMap[myDeckId] ?? "Unknown") : UNKNOWN_DECK,
          oppDeckName: oppDeckId ? (decksMap[oppDeckId] ?? "Unknown") : UNKNOWN_DECK,
          wins: 0, losses: 0,
        };
        entry.byDeck.push(deckEntry);
      }
      if (won) deckEntry.wins++; else deckEntry.losses++;
    });
    return Object.values(byOpponent).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  }, [userId, duels, usernamesById, decksMap]);

  const toggle = (oppId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(oppId)) next.delete(oppId); else next.add(oppId);
      return next;
    });
  };

  return (
    <div className="card-mystic rounded-lg overflow-hidden">
      <div className="p-4 pb-0">
        <h3 className="font-display text-lg text-gold mb-1">Results by opponent</h3>
        <p className="text-xs text-muted-foreground mb-3">Tap an opponent to see the breakdown by deck used.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground px-4 pb-4">Play a few duels to see your stats.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Opponent</th>
              <th className="px-3 py-2 text-right">W</th>
              <th className="px-3 py-2 text-right">L</th>
              <th className="px-3 py-2 text-right">Win%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.wins + r.losses;
              const pct = total > 0 ? Math.round((r.wins / total) * 100) : 0;
              const isOpen = expanded.has(r.opponentId);
              return (
                <Fragment key={r.opponentId}>
                  <tr className="border-t border-border cursor-pointer hover:bg-gold/5" onClick={() => toggle(r.opponentId)}>
                    <td className="px-4 py-2 font-medium flex items-center gap-1.5">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      {r.opponentName}
                      {usernamesById[userId] && r.opponentName !== "?" && (
                        <Link
                          to="/h2h"
                          search={{ a: usernamesById[userId], b: r.opponentName }}
                          onClick={(e) => e.stopPropagation()}
                          className="ml-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/10 text-gold hover:bg-gold/20"
                        >
                          H2H
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-success">{r.wins}</td>
                    <td className="px-3 py-2 text-right text-destructive">{r.losses}</td>
                    <td className="px-3 py-2 text-right text-gold font-semibold">{pct}%</td>
                  </tr>
                  {isOpen && r.byDeck.map((dk) => (
                    <tr key={dk.key} className="border-t border-border/50 bg-muted/10 text-xs">
                      <td className="px-4 py-1.5 pl-10 text-muted-foreground">
                        <span className="text-foreground">{dk.myDeckName}</span> vs {dk.oppDeckName}
                      </td>
                      <td className="px-3 py-1.5 text-right text-success">{dk.wins}</td>
                      <td className="px-3 py-1.5 text-right text-destructive">{dk.losses}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {dk.wins + dk.losses > 0 ? Math.round((dk.wins / (dk.wins + dk.losses)) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

type TrendRow = { date: string } & Record<string, number>;

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

// Replays duels chronologically and samples a checkpoint every 14 days,
// starting from the first recorded duel — rather than one point per duel —
// so the chart reads as a readable trend instead of noisy per-match jitter.
// Users who start later simply have their line begin at a later checkpoint.
function buildTrendRows(duels: DuelRow[], usernamesById: Record<string, string>, mode: "winrate" | "elo"): TrendRow[] {
  const sorted = [...duels]
    .filter((d) => d.winner_id && d.player1_id && d.player2_id && d.player1_id !== d.player2_id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sorted.length === 0) return [];

  const wins: Record<string, number> = {};
  const games: Record<string, number> = {};
  const elo: Record<string, number> = {};
  const current: Record<string, number> = {};
  const rows: TrendRow[] = [];

  const firstTime = new Date(sorted[0].date).getTime();
  const lastTime = new Date(sorted[sorted.length - 1].date).getTime();
  let idx = 0;

  const applyDuel = (d: DuelRow) => {
    const a = d.player1_id;
    const b = d.player2_id;
    if (mode === "elo") {
      elo[a] ??= 1500;
      elo[b] ??= 1500;
      const ea = 1 / (1 + Math.pow(10, (elo[b] - elo[a]) / 400));
      const eb = 1 - ea;
      const sa = d.winner_id === a ? 1 : 0;
      const sb = 1 - sa;
      elo[a] = elo[a] + 32 * (sa - ea);
      elo[b] = elo[b] + 32 * (sb - eb);
      current[a] = Math.round(elo[a]);
      current[b] = Math.round(elo[b]);
    } else {
      games[a] = (games[a] ?? 0) + 1;
      games[b] = (games[b] ?? 0) + 1;
      if (d.winner_id === a) wins[a] = (wins[a] ?? 0) + 1; else wins[b] = (wins[b] ?? 0) + 1;
      current[a] = Math.round(((wins[a] ?? 0) / games[a]) * 100);
      current[b] = Math.round(((wins[b] ?? 0) / games[b]) * 100);
    }
  };

  for (let t = firstTime; t <= lastTime; t += TWO_WEEKS_MS) {
    while (idx < sorted.length && new Date(sorted[idx].date).getTime() <= t) {
      applyDuel(sorted[idx]);
      idx++;
    }
    const row = { date: new Date(t).toLocaleDateString() } as TrendRow;
    for (const [uid, val] of Object.entries(current)) {
      row[usernamesById[uid] ?? "?"] = val;
    }
    rows.push(row);
  }
  // Make sure the final state (including anything after the last checkpoint) is captured.
  while (idx < sorted.length) { applyDuel(sorted[idx]); idx++; }
  const finalRow = { date: new Date(lastTime).toLocaleDateString() } as TrendRow;
  for (const [uid, val] of Object.entries(current)) {
    finalRow[usernamesById[uid] ?? "?"] = val;
  }
  rows.push(finalRow);

  return rows;
}

function trendLineColor(name: string, i: number, myUsername: string) {
  return name === myUsername ? "oklch(0.82 0.16 88)" : TREND_PALETTE[i % TREND_PALETTE.length];
}

// Same rules as the Elo leaderboard (compute_elo_ratings): only decided duels
// that aren't "for fun", from the day Elo was introduced. That way the last
// point of each line matches the leaderboard.
const ELO_START = new Date("2026-07-17T00:00:00Z").getTime();

function EloTrendChart({ duels, usernamesById, myUserId, myUsername }: { duels: DuelRow[]; usernamesById: Record<string, string>; myUserId: string; myUsername: string }) {
  const counted = useMemo(
    () => duels.filter((d) => !d.for_fun && new Date(d.date).getTime() >= ELO_START),
    [duels]
  );
  const rows = useMemo(() => buildTrendRows(counted, usernamesById, "elo"), [counted, usernamesById]);
  const names = useMemo(() => Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== "date")))), [rows]);
  const played = counted.some((d) => d.player1_id === myUserId || d.player2_id === myUserId);
  const myElo = played ? rows[rows.length - 1]?.[myUsername] : undefined;

  return (
    <div className="card-mystic rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="font-display text-lg text-gold">Elo trend</h3>
        <span className="text-sm text-muted-foreground">Your Elo: <span className="text-gold font-semibold">{myElo ?? 1500}</span></span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Every duelist starts at 1500. A point every two weeks; "for fun" duels don't count.</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No finished duels yet.</p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.72 0.03 90)" }} />
              <YAxis domain={["dataMin - 20", "dataMax + 20"]} allowDecimals={false} tick={{ fontSize: 11, fill: "oklch(0.72 0.03 90)" }} />
              <Tooltip contentStyle={{ background: "oklch(0.21 0.045 265)", border: "1px solid oklch(0.82 0.16 88 / 0.3)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {names.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={trendLineColor(name, i, myUsername)} strokeWidth={name === myUsername ? 3 : 1.5} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function WinRateTrendChart({ duels, usernamesById, myUsername, startTime, includeForFun }: { duels: DuelRow[]; usernamesById: Record<string, string>; myUsername: string; startTime: number; includeForFun: boolean }) {
  const filtered = useMemo(
    () => duels.filter((d) => (includeForFun || !d.for_fun) && new Date(d.date).getTime() >= startTime),
    [duels, startTime, includeForFun]
  );
  const rows = useMemo(() => buildTrendRows(filtered, usernamesById, "winrate"), [filtered, usernamesById]);
  const names = useMemo(() => Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== "date")))), [rows]);

  return (
    <div className="card-mystic rounded-lg p-4">
      <h3 className="font-display text-lg text-gold mb-2">Win rate trend</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No finished duels yet.</p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.72 0.03 90)" }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "oklch(0.72 0.03 90)" }} />
              <Tooltip contentStyle={{ background: "oklch(0.21 0.045 265)", border: "1px solid oklch(0.82 0.16 88 / 0.3)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {names.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={trendLineColor(name, i, myUsername)} strokeWidth={name === myUsername ? 3 : 1.5} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

