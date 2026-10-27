import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Shield, Plus, Save, Trophy } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { defaultDeckFor, fetchDefaultDecks, type DefaultDecks } from "@/lib/defaultDecks";
import { GameFormatBadge } from "@/components/GameFormatPicker";
import { DEFAULT_GAME_FORMAT, GAME_FORMATS, type GameFormat } from "@/lib/gameFormat";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — YGO Recap" }] }),
});

type DuelRow = {
  id: string; date: string;
  player1_id: string; player2_id: string; winner_id: string | null;
  deck1_id: string | null; deck2_id: string | null;
  games_p1_wins: number; games_p2_wins: number;
  game_format: string;
};

type Tournament = Tables<"tournaments">;
type Deck = Tables<"decks">;
type Match = Tables<"tournament_matches">;
type AdminUser = { id: string; username: string; email: string };

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [decksMap, setDecksMap] = useState<Record<string, string>>({});

  const load = async () => {
    const [{ data: d }, { data: t }, { data: u }, { data: dk }] = await Promise.all([
      supabase.from("duels").select("*").order("date", { ascending: false }).limit(500),
      supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, username").order("username"),
      supabase.from("decks").select("id, name, user_id, created_at, game_format").order("game_format").order("name"),
    ]);
    // Admin-only email lookup (server-enforced via SECURITY DEFINER + has_role)
    const { data: emails } = await supabase.rpc("admin_list_user_emails");
    const emailMap: Record<string, string> = Object.fromEntries(
      (emails ?? []).map((e) => [e.id, e.email ?? ""]),
    );
    const usersWithEmail: AdminUser[] = (u ?? []).map((p) => ({ ...p, email: emailMap[p.id] ?? "" }));
    setDuels((d as DuelRow[]) ?? []);
    setTournaments(t ?? []);
    setUsers(usersWithEmail);
    setDecks(dk ?? []);
    setProfilesMap(Object.fromEntries((u ?? []).map((p) => [p.id, p.username])));
    setDecksMap(Object.fromEntries((dk ?? []).map((x) => [x.id, x.name])));
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (loading) return <p className="py-10 text-center text-muted-foreground">Loading…</p>;
  if (!isAdmin) return <Navigate to="/" />;

  const deleteDuel = async (id: string) => {
    if (!confirm("Delete this duel and all its games?")) return;
    await supabase.from("duel_games").delete().eq("duel_id", id);
    const { error } = await supabase.from("duels").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Duel deleted"); load(); }
  };

  const deleteTournament = async (id: string) => {
    if (!confirm("Delete this tournament and its matches/participants?")) return;
    await supabase.from("tournament_matches").delete().eq("tournament_id", id);
    await supabase.from("tournament_participants").delete().eq("tournament_id", id);
    const { error } = await supabase.from("tournaments").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Tournament deleted"); load(); }
  };

  const deleteDeck = async (id: string) => {
    if (!confirm("Delete this deck?")) return;
    const { error } = await supabase.from("decks").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deck deleted"); load(); }
  };

  return (
    <div className="space-y-6 py-4">
      <header className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-gold" />
        <h1 className="font-display text-3xl gold-text">Admin Panel</h1>
      </header>

      <Tabs defaultValue="duels">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="duels">Duels ({duels.length})</TabsTrigger>
          <TabsTrigger value="tournaments">Cups ({tournaments.length})</TabsTrigger>
          <TabsTrigger value="decks">Decks ({decks.length})</TabsTrigger>
          <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="duels" className="space-y-4">
          <AddDuelForm users={users} decks={decks} onDone={load} />
          <div className="card-mystic rounded-lg overflow-hidden">
            <ul>
              {duels.map((d) => (
                <DuelEditRow
                  key={d.id}
                  duel={d}
                  profilesMap={profilesMap}
                  decksMap={decksMap}
                  onSaved={load}
                  onDelete={() => deleteDuel(d.id)}
                />
              ))}
              {duels.length === 0 && <li className="px-4 py-6 text-center text-muted-foreground">No duels.</li>}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="tournaments">
          <div className="card-mystic rounded-lg overflow-hidden">
            <ul>
              {tournaments.map((t) => (
                <TournamentRow
                  key={t.id}
                  t={t}
                  users={users}
                  onSaved={load}
                  onDelete={() => deleteTournament(t.id)}
                />
              ))}
              {tournaments.length === 0 && <li className="px-4 py-6 text-center text-muted-foreground">No tournaments.</li>}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="decks" className="space-y-4">
          <AddDeckForm users={users} onDone={load} />
          <div className="card-mystic rounded-lg overflow-hidden">
            <ul>
              {decks.map((dk) => (
                <DeckEditRow
                  key={dk.id}
                  deck={dk}
                  users={users}
                  profilesMap={profilesMap}
                  onSaved={load}
                  onDelete={() => deleteDeck(dk.id)}
                />
              ))}
              {decks.length === 0 && <li className="px-4 py-6 text-center text-muted-foreground">No decks.</li>}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="card-mystic rounded-lg overflow-hidden">
            <ul>
              {users.map((u) => (
                <li key={u.id} className="border-b border-border last:border-0 px-4 py-3 flex items-center gap-2 text-sm">
                  <div className="flex-1">
                    <Link to="/u/$username" params={{ username: u.username }} className="font-medium text-gold hover:underline">{u.username}</Link>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="px-4 py-3 text-xs text-muted-foreground border-t border-border">User account deletion must be done from the backend dashboard.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Current time in the "YYYY-MM-DDTHH:mm" local format a datetime-local input
// expects (toISOString() would give UTC, i.e. 1–2 hours off in Italy).
function nowForDateTimeInput() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Game wins must be whole numbers ≥ 0 and must not contradict the chosen
// winner (e.g. winner P1 with a 0-2 score). Returns an error message or null.
function checkDuelScore(w1: string, w2: string, winner: string): string | null {
  const a = Number(w1), b = Number(w2);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return "Wins must be whole numbers ≥ 0";
  if (winner === "p1" && b > a) return "Score says Player 2 won, but the winner is Player 1";
  if (winner === "p2" && a > b) return "Score says Player 1 won, but the winner is Player 2";
  return null;
}

function AddDuelForm({ users, decks, onDone }: { users: AdminUser[]; decks: Deck[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [p1, setP1] = useState(""); const [p2, setP2] = useState("");
  const [gameFormat, setGameFormat] = useState<GameFormat>(DEFAULT_GAME_FORMAT);
  const [d1, setD1] = useState(""); const [d2, setD2] = useState("");
  const formatDecks = decks.filter((d) => d.game_format === gameFormat);
  // Picking a player (or the format) fills in that player's default deck for
  // the format; it can still be changed by hand afterwards.
  const [defaultDecks, setDefaultDecks] = useState<DefaultDecks>({});
  useEffect(() => { if (open) fetchDefaultDecks().then(setDefaultDecks); }, [open]);
  const defaultDeck = (userId: string, f: GameFormat) =>
    userId ? defaultDeckFor(defaultDecks, userId, f, decks.filter((d) => d.game_format === f)) : "";
  const changeP1 = (id: string) => { setP1(id); setD1(defaultDeck(id, gameFormat)); };
  const changeP2 = (id: string) => { setP2(id); setD2(defaultDeck(id, gameFormat)); };
  const changeFormat = (f: GameFormat) => { setGameFormat(f); setD1(defaultDeck(p1, f)); setD2(defaultDeck(p2, f)); };
  const [w1, setW1] = useState("0"); const [w2, setW2] = useState("0");
  const [winner, setWinner] = useState<"p1" | "p2" | "draw">("p1");
  const [date, setDate] = useState(nowForDateTimeInput);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!p1 || !p2 || p1 === p2) { toast.error("Pick two different players"); return; }
    if (!d1 || !d2) { toast.error("Pick both decks"); return; }
    const scoreError = checkDuelScore(w1, w2, winner);
    if (scoreError) { toast.error(scoreError); return; }
    const when = new Date(date);
    if (!date || Number.isNaN(when.getTime())) { toast.error("Pick a valid date"); return; }
    setBusy(true);
    try {
      const winner_id = winner === "p1" ? p1 : winner === "p2" ? p2 : null;
      const { error } = await supabase.from("duels").insert({
        player1_id: p1, player2_id: p2,
        deck1_id: d1, deck2_id: d2, game_format: gameFormat,
        games_p1_wins: Number(w1), games_p2_wins: Number(w2),
        // A manually recorded duel is already over (even with no winner): without
        // this it would default to "live" and show up as a duel in progress.
        winner_id, date: when.toISOString(), status: "finished",
      } as never);
      if (error) toast.error(error.message);
      else { toast.success("Duel added"); setOpen(false); onDone(); }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <Button onClick={() => setOpen(true)} className="gold-gradient text-background"><Plus className="h-4 w-4" /> Add duel manually</Button>;
  }

  return (
    <div className="card-mystic rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><Label>Player 1</Label><PlayerSelect value={p1} onChange={changeP1} users={users} /></div>
        <div><Label>Player 2</Label><PlayerSelect value={p2} onChange={changeP2} users={users} /></div>
        <div>
          <Label>Game format</Label>
          <Select value={gameFormat} onValueChange={(v) => changeFormat(v as GameFormat)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{GAME_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div />
        <div><Label>Deck 1</Label><DeckSelect value={d1} onChange={setD1} decks={formatDecks} /></div>
        <div><Label>Deck 2</Label><DeckSelect value={d2} onChange={setD2} decks={formatDecks} /></div>
        <div><Label>Wins P1</Label><Input type="number" min={0} value={w1} onChange={(e) => setW1(e.target.value)} /></div>
        <div><Label>Wins P2</Label><Input type="number" min={0} value={w2} onChange={(e) => setW2(e.target.value)} /></div>
        <div>
          <Label>Winner</Label>
          <Select value={winner} onValueChange={(v) => setWinner(v as "p1" | "p2" | "draw")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="p1">Player 1</SelectItem>
              <SelectItem value="p2">Player 2</SelectItem>
              <SelectItem value="draw">No winner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Date</Label><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button onClick={submit} disabled={busy} className="gold-gradient text-background">Save</Button>
      </div>
    </div>
  );
}

function PlayerSelect({ value, onChange, users }: { value: string; onChange: (v: string) => void; users: AdminUser[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select player" /></SelectTrigger>
      <SelectContent>
        {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
function DeckSelect({ value, onChange, decks }: { value: string; onChange: (v: string) => void; decks: Deck[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select deck" /></SelectTrigger>
      <SelectContent>
        {decks.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DuelEditRow({ duel, profilesMap, decksMap, onSaved, onDelete }: {
  duel: DuelRow; profilesMap: Record<string, string>; decksMap: Record<string, string>;
  onSaved: () => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [w1, setW1] = useState(String(duel.games_p1_wins));
  const [w2, setW2] = useState(String(duel.games_p2_wins));
  const [winner, setWinner] = useState<string>(
    duel.winner_id === duel.player1_id ? "p1" : duel.winner_id === duel.player2_id ? "p2" : "draw"
  );

  const save = async () => {
    const scoreError = checkDuelScore(w1, w2, winner);
    if (scoreError) { toast.error(scoreError); return; }
    const winner_id = winner === "p1" ? duel.player1_id : winner === "p2" ? duel.player2_id : null;
    const { error } = await supabase.from("duels").update({
      games_p1_wins: Number(w1),
      games_p2_wins: Number(w2),
      winner_id,
    }).eq("id", duel.id);
    if (error) toast.error(error.message);
    else { toast.success("Duel updated"); setEditing(false); onSaved(); }
  };

  return (
    <li className="border-b border-border last:border-0 px-4 py-3 text-sm">
      <div className="grid grid-cols-12 items-center gap-2">
        <div className="col-span-5">
          <div className="font-medium">
            {profilesMap[duel.player1_id] ?? "?"} <span className="text-muted-foreground">vs</span> {profilesMap[duel.player2_id] ?? "?"}
            <GameFormatBadge format={duel.game_format} className="ml-2" />
          </div>
          <div className="text-xs text-muted-foreground">
            {decksMap[duel.deck1_id ?? ""] ?? "—"} vs {decksMap[duel.deck2_id ?? ""] ?? "—"}
          </div>
        </div>
        <div className="col-span-2 text-center text-muted-foreground">{duel.games_p1_wins}-{duel.games_p2_wins}</div>
        <div className="col-span-3 text-xs text-muted-foreground">{new Date(duel.date).toLocaleString()}</div>
        <div className="col-span-2 text-right flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit"}</Button>
          <Button size="icon" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      {editing && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div><Label className="text-xs">Wins P1</Label><Input type="number" value={w1} onChange={(e) => setW1(e.target.value)} /></div>
          <div><Label className="text-xs">Wins P2</Label><Input type="number" value={w2} onChange={(e) => setW2(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Winner</Label>
            <Select value={winner} onValueChange={setWinner}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="p1">{profilesMap[duel.player1_id] ?? "P1"}</SelectItem>
                <SelectItem value="p2">{profilesMap[duel.player2_id] ?? "P2"}</SelectItem>
                <SelectItem value="draw">No winner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={save} className="gold-gradient text-background"><Save className="h-4 w-4" /> Save</Button>
        </div>
      )}
    </li>
  );
}

function TournamentRow({ t, users, onSaved, onDelete }: { t: Tournament; users: AdminUser[]; onSaved: () => void; onDelete: () => void }) {
  const [winner, setWinner] = useState<string>(t.winner_id ?? "");
  const [expanded, setExpanded] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const winnerName = useMemo(() => users.find((u) => u.id === t.winner_id)?.username, [t.winner_id, users]);
  const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.username ?? "?") : "TBD");

  const loadMatches = async () => {
    const { data } = await supabase.from("tournament_matches").select("*").eq("tournament_id", t.id).order("round").order("bracket_position");
    setMatches(data ?? []);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (expanded) loadMatches(); }, [expanded, t.id]);

  // Keep the champion picker in sync with the DB: setting the final's winner
  // below crowns the champion server-side, and a stale picker would then
  // wipe it on the next "Save".
  useEffect(() => { setWinner(t.winner_id ?? ""); }, [t.winner_id]);

  const save = async () => {
    // Removing the champion reopens a finished tournament instead of leaving
    // it "finished" with no winner.
    const status = winner ? "finished" : t.status === "finished" ? "active" : t.status;
    const { error } = await supabase.from("tournaments")
      .update({ winner_id: winner || null, status })
      .eq("id", t.id);
    if (error) toast.error(error.message);
    else { toast.success("Cup updated"); onSaved(); }
  };

  const setMatchWinner = async (matchId: string, winnerId: string | null) => {
    const { error } = await supabase.from("tournament_matches").update({ winner_id: winnerId }).eq("id", matchId);
    if (error) toast.error(error.message);
    else { toast.success(winnerId ? "Match winner set" : "Match winner cleared"); loadMatches(); onSaved(); }
  };

  return (
    <li className="border-b border-border last:border-0 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Link to="/tournaments/$id" params={{ id: t.id }} className="font-medium text-gold hover:underline">{t.name}</Link>
          <div className="text-xs text-muted-foreground">
            {t.status} • {t.max_players} players • {t.format === "league" ? "League" : "Single elimination"} • <GameFormatBadge format={t.game_format} />
            {winnerName && <> • <Trophy className="inline h-3 w-3 text-gold" /> {winnerName}</>}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide matches" : "Manage matches"}
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="mt-2 flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs">Assign champion (trophy)</Label>
          <Select value={winner || "none"} onValueChange={(v) => setWinner(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="No winner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No winner</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} className="gold-gradient text-background"><Save className="h-4 w-4" /> Save</Button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {matches.length === 0 && <div className="text-xs text-muted-foreground">No matches generated yet (start the tournament).</div>}
          {matches.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 bg-muted/30 rounded px-2 py-1.5">
              <span className="text-xs text-muted-foreground w-16">R{m.round} · #{i + 1}</span>
              <span className="flex-1 truncate">{nameOf(m.player1_id)} <span className="text-muted-foreground">vs</span> {nameOf(m.player2_id)}</span>
              <Select
                value={m.winner_id ?? "none"}
                onValueChange={(v) => setMatchWinner(m.id, v === "none" ? null : v)}
              >
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No winner</SelectItem>
                  {m.player1_id && <SelectItem value={m.player1_id}>{nameOf(m.player1_id)}</SelectItem>}
                  {m.player2_id && <SelectItem value={m.player2_id}>{nameOf(m.player2_id)}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}


function AddDeckForm({ users, onDone }: { users: AdminUser[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState<string>("none");
  const [gameFormat, setGameFormat] = useState<GameFormat>(DEFAULT_GAME_FORMAT);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) { toast.error("Name must be 1–80 chars"); return; }
    setBusy(true);
    const { error } = await supabase.from("decks").insert({
      name: trimmed,
      user_id: owner === "none" ? null : owner,
      game_format: gameFormat,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Deck added"); setName(""); setOwner("none"); setOpen(false); onDone(); }
  };

  if (!open) {
    return <Button onClick={() => setOpen(true)} className="gold-gradient text-background"><Plus className="h-4 w-4" /> Add deck</Button>;
  }
  return (
    <div className="card-mystic rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><Label>Deck name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
        <div>
          <Label>Game format</Label>
          <Select value={gameFormat} onValueChange={(v) => setGameFormat(v as GameFormat)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{GAME_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Owner (optional)</Label>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No owner</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button onClick={submit} disabled={busy} className="gold-gradient text-background">Save</Button>
      </div>
    </div>
  );
}

function DeckEditRow({ deck, users, profilesMap, onSaved, onDelete }: {
  deck: Deck; users: AdminUser[]; profilesMap: Record<string, string>;
  onSaved: () => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(deck.name);
  const [owner, setOwner] = useState<string>(deck.user_id ?? "none");
  const [gameFormat, setGameFormat] = useState<GameFormat>(deck.game_format === "edison" ? "edison" : "goat");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) { toast.error("Name must be 1–80 chars"); return; }
    setBusy(true);
    const { error } = await supabase.from("decks").update({
      name: trimmed,
      user_id: owner === "none" ? null : owner,
      game_format: gameFormat,
    }).eq("id", deck.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Deck updated"); setEditing(false); onSaved(); }
  };

  return (
    <li className="border-b border-border last:border-0 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="font-medium flex items-center gap-1.5">{deck.name} <GameFormatBadge format={deck.game_format} /></div>
          <div className="text-xs text-muted-foreground">owner: {deck.user_id ? (profilesMap[deck.user_id] ?? "—") : "—"}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit"}</Button>
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      {editing && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
          <div>
            <Label className="text-xs">Game format</Label>
            <Select value={gameFormat} onValueChange={(v) => setGameFormat(v as GameFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GAME_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Owner</Label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No owner</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={save} disabled={busy} className="gold-gradient text-background"><Save className="h-4 w-4" /> Save</Button>
        </div>
      )}
    </li>
  );
}
