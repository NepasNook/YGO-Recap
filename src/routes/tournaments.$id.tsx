import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Trophy, Users, Play, Swords, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildTournamentMatches } from "@/lib/tournamentBracket";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { UserAvatar } from "@/components/UserAvatar";
import { LoginRequired } from "@/components/LoginRequired";
import { GameFormatBadge } from "@/components/GameFormatPicker";
import { defaultDeckFor, fetchDefaultDecks, type DefaultDecks } from "@/lib/defaultDecks";
import type { GameFormat } from "@/lib/gameFormat";

export const Route = createFileRoute("/tournaments/$id")({ component: TournamentDetail });

type T = {
  id: string; name: string; description: string | null; max_players: number;
  status: "open" | "active" | "finished"; creator_id: string; winner_id: string | null;
  start_date: string | null; format: "bracket" | "league"; game_format: string; matches_per_player: number | null;
};
type M = { id: string; round: number; bracket_position: number; player1_id: string | null; player2_id: string | null; winner_id: string | null; duel_id: string | null };

function TournamentDetail() {
  const { id } = Route.useParams();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [t, setT] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [parts, setParts] = useState<{ user_id: string; username: string; avatar_url: string | null }[]>([]);
  const [matches, setMatches] = useState<M[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, { p1: number; p2: number }>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<T>>({});
  const [decks, setDecks] = useState<{ id: string; name: string; game_format: string }[]>([]);
  const [pendingMatch, setPendingMatch] = useState<M | null>(null);
  const [pendingDeck1, setPendingDeck1] = useState("");
  const [pendingDeck2, setPendingDeck2] = useState("");
  const [creatingDuel, setCreatingDuel] = useState(false);
  const [defaultDecks, setDefaultDecks] = useState<DefaultDecks>({});

  useEffect(() => {
    supabase.from("decks").select("id, name, game_format").order("name").then(({ data }) => setDecks(data ?? []));
    fetchDefaultDecks().then(setDefaultDecks);
  }, []);

  const load = async () => {
    const { data: td } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
    setT(td as T | null);
    setLoaded(true);
    const { data: p } = await supabase.from("tournament_participants").select("user_id, profiles(username, avatar_url)").eq("tournament_id", id);
    const list = (p ?? []).map((r) => ({ user_id: r.user_id, username: r.profiles?.username ?? "?", avatar_url: r.profiles?.avatar_url ?? null }));
    setParts(list);
    setUsernames(Object.fromEntries(list.map((x) => [x.user_id, x.username])));
    const { data: ms } = await supabase.from("tournament_matches").select("*").eq("tournament_id", id).order("round").order("bracket_position");
    const matchesRows = (ms as M[] | null) ?? [];
    setMatches(matchesRows);
    const duelIds = matchesRows.map((m) => m.duel_id).filter(Boolean) as string[];
    if (duelIds.length) {
      const { data: ds } = await supabase.from("duels").select("id, player1_id, games_p1_wins, games_p2_wins").in("id", duelIds);
      const byDuel: Record<string, { p1: number; p2: number; duelP1: string }> = {};
      (ds ?? []).forEach((d) => { byDuel[d.id] = { p1: d.games_p1_wins ?? 0, p2: d.games_p2_wins ?? 0, duelP1: d.player1_id }; });
      const map: Record<string, { p1: number; p2: number }> = {};
      // A duel started by the match's player 2 has the sides swapped: flip its
      // score back so it lines up with the match's player 1 / player 2.
      matchesRows.forEach((m) => {
        const d = m.duel_id ? byDuel[m.duel_id] : undefined;
        if (d) map[m.id] = d.duelP1 === m.player1_id ? { p1: d.p1, p2: d.p2 } : { p1: d.p2, p2: d.p1 };
      });
      setScores(map);
    } else setScores({});
  };
  // Tournaments are readable only once signed in: reload when the session shows up.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLoaded(false); load(); }, [id, user?.id]);

  useEffect(() => {
    const ch = supabase.channel(`t:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter: `tournament_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [id]);

  if (!t) {
    if (!authLoading && !user) return <div className="py-10"><LoginRequired message="Sign in to view the tournament." /></div>;
    if (loaded && !authLoading) return <div className="py-20 text-center text-muted-foreground">Tournament not found.</div>;
    return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  }

  const isCreator = user?.id === t.creator_id;
  const canManage = isCreator || isAdmin;
  const isParticipant = !!user && parts.some((p) => p.user_id === user.id);
  const isFull = parts.length >= t.max_players;

  const join = async () => {
    if (!user) return;
    const { error } = await supabase.from("tournament_participants").insert({ tournament_id: id, user_id: user.id });
    if (error) toast.error(error.message); else { toast.success("Joined!"); load(); }
  };
  const leave = async () => {
    if (!user) return;
    const { error } = await supabase.from("tournament_participants").delete().eq("tournament_id", id).eq("user_id", user.id);
    if (error) toast.error(error.message); else load();
  };

  // Legacy fallback: generates the bracket/schedule for tournaments created
  // before match generation happened automatically at creation time.
  const start = async () => {
    if (parts.length < 2) { toast.error("At least 2 players are required"); return; }
    const ids = parts.map((p) => p.user_id);
    const matches = buildTournamentMatches(t.format, ids, t.matches_per_player ?? undefined);
    const { error } = await supabase.from("tournament_matches").insert(
      matches.map((m) => ({ tournament_id: id, ...m }))
    );
    if (error) { toast.error(error.message); return; }
    await supabase.from("tournaments").update({ status: "active" }).eq("id", id);
    load();
  };

  // The `tournaments` table isn't in the realtime publication, so reload after
  // each change: a result may also update the tournament itself (champion, status).
  const declareWinner = async (m: M, winnerId: string) => {
    const { error } = await supabase.from("tournament_matches").update({ winner_id: winnerId }).eq("id", m.id);
    if (error) toast.error(error.message); else toast.success("Winner recorded");
    load();
  };

  const clearWinner = async (m: M) => {
    const { error } = await supabase.from("tournament_matches").update({ winner_id: null }).eq("id", m.id);
    if (error) toast.error(error.message);
    load();
  };

  const finalizeLeague = async (winnerId: string) => {
    const { error } = await supabase.from("tournaments").update({ winner_id: winnerId, status: "finished" }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Tournament finished");
    load();
  };

  // Each player starts with their default deck for the tournament's format.
  const openDeckPicker = (m: M) => {
    const format = (t?.game_format ?? "goat") as GameFormat;
    const formatDecks = decks.filter((d) => d.game_format === format);
    setPendingMatch(m);
    setPendingDeck1(defaultDeckFor(defaultDecks, m.player1_id, format, formatDecks));
    setPendingDeck2(defaultDeckFor(defaultDecks, m.player2_id, format, formatDecks));
  };

  const confirmCreateDuel = async () => {
    const m = pendingMatch;
    if (!m || !pendingDeck1 || !pendingDeck2) { toast.error("Select a deck for both players"); return; }
    if (!user?.id || !m.player1_id || !m.player2_id) return;
    if (user.id !== m.player1_id && user.id !== m.player2_id && !isAdmin) { toast.error("Only match players can start"); return; }
    setCreatingDuel(true);
    // The duel's player 1 is its host (only they may create it, and their phone
    // runs the starting dice): when the match's player 2 starts it, swap sides.
    const swap = user.id === m.player2_id;
    const { data, error } = await supabase.from("duels").insert({
      player1_id: swap ? m.player2_id : m.player1_id,
      player2_id: swap ? m.player1_id : m.player2_id,
      tournament_match_id: m.id,
      game_format: t?.game_format,
      deck1_id: swap ? pendingDeck2 : pendingDeck1,
      deck2_id: swap ? pendingDeck1 : pendingDeck2,
    }).select("id").single();
    // Stays "Starting…" until we navigate away, so a second tap can't create a duplicate duel.
    if (error || !data) { setCreatingDuel(false); toast.error(error?.message ?? "Failed"); return; }
    const { error: linkErr } = await supabase.from("tournament_matches").update({ duel_id: data.id, started_at: new Date().toISOString() }).eq("id", m.id);
    if (linkErr) toast.error(linkErr.message);
    setPendingMatch(null);
    navigate({ to: "/duel/$id", params: { id: data.id }, search: { match: m.id } });
  };

  // Only the decks of the tournament's game format can be picked for its duels.
  const tournamentDecks = decks.filter((d) => d.game_format === (t?.game_format ?? "goat"));

  const rounds: M[][] = [];
  matches.forEach((m) => { (rounds[m.round - 1] ||= []).push(m); });

  return (
    <div className="space-y-6 py-4">
      <header>
        <Link to="/tournaments" className="text-xs text-muted-foreground hover:text-foreground">← All tournaments</Link>
        <div className="flex items-start justify-between gap-3 mt-1">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl gold-text break-words">{t.name}</h1>
            {t.description && <p className="text-muted-foreground text-sm mt-1 whitespace-pre-wrap break-words">{t.description}</p>}
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {parts.length} players</span>
              <span className="uppercase tracking-wider">{t.status}</span>
              <span className="uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/15 text-gold">{t.format === "league" ? "League" : "Single elimination"}</span>
              <GameFormatBadge format={t.game_format} />
              {matches.length > 0 && <span>{rounds.length} rounds</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => { setEditForm({ name: t.name, description: t.description, format: t.format, status: t.status }); setEditOpen(true); }}>
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            )}
            {matches.length === 0 && t.status === "open" && user && (isParticipant ? <Button variant="outline" size="sm" onClick={leave}>Leave</Button> : !isFull && <Button size="sm" className="gold-gradient text-background" onClick={join}>Join</Button>)}
            {matches.length === 0 && t.status === "open" && canManage && <Button size="sm" onClick={start} className="bg-success text-background"><Play className="h-3 w-3 mr-1" /> Start</Button>}
          </div>
        </div>
        {t.winner_id && <div className="card-mystic rounded-lg p-4 mt-4 flex items-center gap-3"><Trophy className="h-8 w-8 text-gold" /><div><div className="text-xs text-muted-foreground">Champion</div><div className="font-display text-xl gold-text">{usernames[t.winner_id] ?? "?"}</div></div></div>}
      </header>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit tournament</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea value={editForm.description ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Format</Label>
                {/* Once matches exist, switching format would reinterpret them (a league
                    schedule read as a bracket corrupts results), so it's locked. */}
                <Select value={editForm.format} onValueChange={(v) => setEditForm((f) => ({ ...f, format: v as T["format"] }))} disabled={matches.length > 0}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="bracket">Single elimination</SelectItem><SelectItem value="league">League</SelectItem></SelectContent>
                </Select>
                {matches.length > 0 && <p className="text-[10px] text-muted-foreground mt-1">Locked: matches have already been generated.</p>}
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as T["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="finished">Finished</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="gold-gradient text-background" onClick={async () => {
              const payload: TablesUpdate<"tournaments"> = {
                name: editForm.name, description: editForm.description || null,
                format: editForm.format, status: editForm.status,
              };
              const { error } = await supabase.from("tournaments").update(payload).eq("id", id);
              if (error) toast.error(error.message); else { toast.success("Tournament updated"); setEditOpen(false); load(); }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingMatch} onOpenChange={(v) => { if (!v && !creatingDuel) setPendingMatch(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Choose decks</DialogTitle></DialogHeader>
          {pendingMatch && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Select the deck each player is using for this match.</p>
              <div>
                <Label>{usernames[pendingMatch.player1_id ?? ""] ?? "Player 1"}</Label>
                <Select value={pendingDeck1} onValueChange={setPendingDeck1}>
                  <SelectTrigger><SelectValue placeholder="Choose a deck" /></SelectTrigger>
                  <SelectContent>{tournamentDecks.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{usernames[pendingMatch.player2_id ?? ""] ?? "Player 2"}</Label>
                <Select value={pendingDeck2} onValueChange={setPendingDeck2}>
                  <SelectTrigger><SelectValue placeholder="Choose a deck" /></SelectTrigger>
                  <SelectContent>{tournamentDecks.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMatch(null)} disabled={creatingDuel}>Cancel</Button>
            <Button className="gold-gradient text-background" onClick={confirmCreateDuel} disabled={creatingDuel || !pendingDeck1 || !pendingDeck2}>
              <Swords className="h-3 w-3 mr-1" /> {creatingDuel ? "Starting…" : "Start duel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {matches.length === 0 ? (
        <section>
          <h2 className="font-display text-lg mb-2">Participants</h2>
          {parts.length === 0 ? <p className="text-muted-foreground text-sm">No one yet.</p> : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {parts.map((p) => (
                <li key={p.user_id} className="card-mystic rounded-md px-3 py-2 text-sm flex items-center gap-2">
                  <UserAvatar url={p.avatar_url} name={p.username} className="h-6 w-6 shrink-0" />
                  <span className="truncate">{p.username}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : t.format === "league" ? (
        <LeagueView
          matches={matches} usernames={usernames} userId={user?.id} canManage={canManage}
          tournament={t} onDeclareWinner={declareWinner} onClearWinner={clearWinner}
          onFinalize={finalizeLeague}
          onCreateDuel={openDeckPicker}
          onResume={(mid, did) => did && navigate({ to: "/duel/$id", params: { id: did }, search: { match: mid } })}
        />
      ) : (
        <Bracket
          rounds={rounds} usernames={usernames} userId={user?.id} canManage={canManage}
          onDeclareWinner={declareWinner} onClearWinner={clearWinner}
          navigate={(matchId, duelId) => { if (duelId) navigate({ to: "/duel/$id", params: { id: duelId }, search: { match: matchId } }); }}
          onCreateDuel={openDeckPicker}
        />
      )}

      {matches.length > 0 && <MatchLog matches={matches} usernames={usernames} scores={scores} />}

      {canManage && <AdminMatches tournamentId={id} matches={matches} parts={parts} usernames={usernames} />}
    </div>
  );
}

function AdminMatches({ tournamentId, matches, parts, usernames }: {
  tournamentId: string; matches: M[]; parts: { user_id: string; username: string; avatar_url: string | null }[]; usernames: Record<string, string>;
}) {
  const [addRound, setAddRound] = useState<number>(() => (matches.reduce((mx, m) => Math.max(mx, m.round), 0) || 0) + 1);
  const [addP1, setAddP1] = useState<string>("");
  const [addP2, setAddP2] = useState<string>("__bye__");

  const updateMatch = async (mid: string, patch: Partial<M>) => {
    const { error } = await supabase.from("tournament_matches").update(patch).eq("id", mid);
    if (error) toast.error(error.message); else toast.success("Match updated");
  };
  const deleteMatch = async (mid: string) => {
    if (!confirm("Delete this match?")) return;
    const { error } = await supabase.from("tournament_matches").delete().eq("id", mid);
    if (error) toast.error(error.message); else toast.success("Match deleted");
  };
  const addMatch = async () => {
    if (!addP1) { toast.error("Select player 1"); return; }
    const p2 = addP2 === "__bye__" ? null : addP2;
    const roundMatches = matches.filter((m) => m.round === addRound);
    const pos = (roundMatches.reduce((mx, m) => Math.max(mx, m.bracket_position), 0) || 0) + 1;
    const { data, error } = await supabase.from("tournament_matches").insert({
      tournament_id: tournamentId, round: addRound, bracket_position: pos,
      player1_id: addP1, player2_id: p2, winner_id: null,
    }).select("id").single();
    if (error || !data) { toast.error(error?.message ?? "Error"); return; }
    // A BYE's automatic win is set with a separate update: the DB only moves a
    // winner to the next round when the result is *updated*, not on insert.
    if (p2 === null) {
      const { error: byeErr } = await supabase.from("tournament_matches").update({ winner_id: addP1 }).eq("id", data.id);
      if (byeErr) { toast.error(byeErr.message); return; }
    }
    toast.success("Match added"); setAddP1(""); setAddP2("__bye__");
  };

  const byRound: Record<number, M[]> = {};
  matches.forEach((m) => { (byRound[m.round] ||= []).push(m); });
  const keys = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  return (
    <section>
      <h2 className="font-display text-lg mb-2 flex items-center gap-2"><Pencil className="h-4 w-4 text-gold" /> Match management (admin)</h2>
      <div className="card-mystic rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr_1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">Round</Label>
            <Input type="number" min={1} value={addRound} onChange={(e) => setAddRound(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
          <div>
            <Label className="text-xs">Player 1</Label>
            <Select value={addP1} onValueChange={setAddP1}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{parts.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.username}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Player 2</Label>
            <Select value={addP2} onValueChange={setAddP2}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__bye__">BYE (auto win)</SelectItem>
                {parts.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.username}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={addMatch} className="gold-gradient text-background">Add</Button>
        </div>

        {keys.map((r) => (
          <div key={r} className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-gold">Round {r}</div>
            {byRound[r].map((m) => {
              const winnerOptions = [m.player1_id, m.player2_id].filter(Boolean) as string[];
              return (
                <div key={m.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center bg-muted/20 rounded p-2">
                  <Select value={m.player1_id ?? "__none__"} onValueChange={(v) => updateMatch(m.id, { player1_id: v === "__none__" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— none —</SelectItem>
                      {parts.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.username}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={m.player2_id ?? "__none__"} onValueChange={(v) => updateMatch(m.id, { player2_id: v === "__none__" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— BYE —</SelectItem>
                      {parts.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.username}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={m.winner_id ?? "__none__"} onValueChange={(v) => updateMatch(m.id, { winner_id: v === "__none__" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Winner" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— no winner —</SelectItem>
                      {winnerOptions.map((uid) => <SelectItem key={uid} value={uid}>{usernames[uid] ?? "?"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="destructive" onClick={() => deleteMatch(m.id)}>Delete</Button>
                </div>
              );
            })}
          </div>
        ))}
        {matches.length === 0 && <p className="text-xs text-muted-foreground">No matches yet — add one above.</p>}
      </div>
    </section>
  );
}

function MatchLog({ matches, usernames, scores }: { matches: M[]; usernames: Record<string, string>; scores: Record<string, { p1: number; p2: number }> }) {
  const byRound: Record<number, M[]> = {};
  matches.forEach((m) => { (byRound[m.round] ||= []).push(m); });
  const keys = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  return (
    <section>
      <h2 className="font-display text-lg mb-2">Match history</h2>
      <div className="card-mystic rounded-lg p-4 space-y-4 text-sm">
        {keys.map((r) => (
          <div key={r}>
            <div className="text-xs uppercase tracking-wider text-gold mb-1">Round {r}:</div>
            <ul className="space-y-0.5 pl-2 font-mono text-[13px]">
              {byRound[r].map((m) => {
                const p1 = m.player1_id ? usernames[m.player1_id] ?? "?" : "TBD";
                const p2 = m.player2_id ? usernames[m.player2_id] ?? "?" : null;
                if (!p2) return <li key={m.id}>{p1} (bye)</li>;
                const s = scores[m.id];
                let scoreStr = "";
                if (s) scoreStr = ` (${s.p1}-${s.p2})`;
                else if (m.winner_id) scoreStr = m.winner_id === m.player1_id ? " (1-0)" : " (0-1)";
                else scoreStr = " (—)";
                return <li key={m.id}>{p1} vs {p2}{scoreStr}</li>;
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}


function Bracket({ rounds, usernames, userId, canManage, navigate, onCreateDuel, onDeclareWinner, onClearWinner }: {
  rounds: M[][]; usernames: Record<string, string>; userId?: string; canManage: boolean;
  navigate: (matchId: string, duelId: string | null) => void;
  onCreateDuel: (m: M) => void;
  onDeclareWinner: (m: M, winnerId: string) => void;
  onClearWinner: (m: M) => void;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4 min-w-max">
        {rounds.map((round, ri) => (
          <div key={ri} className="flex flex-col justify-around gap-3 min-w-[200px]">
            <div className="text-xs uppercase tracking-wider text-muted-foreground text-center">{ri === rounds.length - 1 ? "Final" : `Round ${ri + 1}`}</div>
            {round.map((m) => {
              return (
                <div key={m.id} className="card-mystic rounded-md overflow-hidden text-sm">
                  <Slot name={m.player1_id ? usernames[m.player1_id] ?? "?" : "TBD"} won={m.winner_id === m.player1_id}
                    onPick={canManage && m.player1_id && m.player2_id && !m.winner_id ? () => onDeclareWinner(m, m.player1_id!) : undefined} />
                  <div className="border-t border-border" />
                  <Slot name={m.player2_id ? usernames[m.player2_id] ?? "?" : "TBD"} won={m.winner_id === m.player2_id}
                    onPick={canManage && m.player1_id && m.player2_id && !m.winner_id ? () => onDeclareWinner(m, m.player2_id!) : undefined} />
                  {!m.winner_id && m.player1_id && m.player2_id && (
                    m.duel_id
                      ? <button onClick={() => navigate(m.id, m.duel_id)} className="w-full bg-gold/15 text-gold text-xs py-1.5 hover:bg-gold/25"><Swords className="h-3 w-3 inline mr-1" /> Resume</button>
                      : <button onClick={() => onCreateDuel(m)} className="w-full bg-gold/15 text-gold text-xs py-1.5 hover:bg-gold/25"><Swords className="h-3 w-3 inline mr-1" /> Start duel</button>
                  )}
                  {/* Not on BYEs: their win is automatic and couldn't be re-set from here. */}
                  {canManage && m.winner_id && m.player1_id && m.player2_id && (
                    <button onClick={() => onClearWinner(m)} className="w-full bg-muted text-muted-foreground text-[10px] py-1 hover:bg-muted/80">Clear result</button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Slot({ name, won, onPick }: { name: string; won: boolean; onPick?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`px-3 py-2 flex justify-between items-center gap-2 ${won ? "bg-gold/15 text-gold font-semibold" : ""}`}>
      <button type="button" onClick={() => setExpanded((v) => !v)} title={name} className={`text-left flex-1 min-w-0 ${expanded ? "whitespace-normal break-words" : "truncate"}`}>{name}</button>
      <div className="flex items-center gap-1 shrink-0">
        {won && <Trophy className="h-3 w-3" />}
        {onPick && <button onClick={onPick} title="Mark as winner" className="h-5 w-5 rounded bg-success/20 text-success hover:bg-success/40 flex items-center justify-center"><Check className="h-3 w-3" /></button>}
      </div>
    </div>
  );
}

function LeagueView({ matches, usernames, userId, canManage, tournament, onDeclareWinner, onClearWinner, onFinalize, onCreateDuel, onResume }: {
  matches: M[]; usernames: Record<string, string>; userId?: string; canManage: boolean;
  tournament: T;
  onDeclareWinner: (m: M, winnerId: string) => void;
  onClearWinner: (m: M) => void;
  onFinalize: (winnerId: string) => void;
  onCreateDuel: (m: M) => void;
  onResume: (matchId: string, duelId: string | null) => void;
}) {
  const standings = useMemo(() => {
    const stats: Record<string, { wins: number; played: number; byes: number }> = {};
    for (const m of matches) {
      const isBye = !m.player2_id;
      if (m.player1_id) stats[m.player1_id] ??= { wins: 0, played: 0, byes: 0 };
      if (m.player2_id) stats[m.player2_id] ??= { wins: 0, played: 0, byes: 0 };
      if (m.winner_id) {
        stats[m.winner_id] ??= { wins: 0, played: 0, byes: 0 };
        stats[m.winner_id].wins++;
        if (isBye) {
          stats[m.winner_id].byes++;
        } else {
          if (m.player1_id) stats[m.player1_id].played++;
          if (m.player2_id && m.player2_id !== m.player1_id) stats[m.player2_id].played++;
        }
      }
    }
    return Object.entries(stats)
      .map(([uid, s]) => ({ uid, ...s }))
      .sort((a, b) => b.wins - a.wins || a.byes - b.byes || b.played - a.played);
  }, [matches]);

  const allDone = matches.length > 0 && matches.every((m) => m.winner_id);
  const topWins = standings[0]?.wins ?? 0;
  const topByes = standings[0]?.byes ?? 0;
  // Real ties only when wins AND byes match — fewer byes already ranks a player above,
  // so no manual tie-break is needed unless both are equal.
  const tied = standings.filter((s) => s.wins === topWins && s.byes === topByes);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <section>
        <h2 className="font-display text-lg mb-2">Standings</h2>
        <div className="card-mystic rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Player</th><th className="px-3 py-2 text-right">W</th><th className="px-3 py-2 text-right">Bye</th><th className="px-3 py-2 text-right">P</th></tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.uid} className={`border-t border-border ${i === 0 && allDone && tied.length === 1 ? "bg-gold/10 text-gold font-semibold" : ""}`}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{usernames[s.uid] ?? "?"}</td>
                  <td className="px-3 py-2 text-right">{s.wins}</td>
                  <td className="px-3 py-2 text-right">{s.byes}</td>
                  <td className="px-3 py-2 text-right">{s.played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage && allDone && !tournament.winner_id && (
          <div className="mt-3 card-mystic rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-2">
              {tied.length > 1 ? `Tie between ${tied.length} players — choose the winner (manual tiebreak)` : "Finish the tournament by declaring the winner"}
            </div>
            <div className="flex flex-wrap gap-2">
              {(tied.length > 1 ? tied : standings.slice(0, 1)).map((s) => (
                <Button key={s.uid} size="sm" className="gold-gradient text-background" onClick={() => onFinalize(s.uid)}>
                  <Trophy className="h-3 w-3 mr-1" /> {usernames[s.uid] ?? "?"} wins
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg mb-2">Matches</h2>
        {(() => {
          const byRound: Record<number, M[]> = {};
          matches.forEach((m) => { (byRound[m.round] ||= []).push(m); });
          const roundKeys = Object.keys(byRound).map(Number).sort((a, b) => a - b);
          return (
            <div className="space-y-4">
              {roundKeys.map((r) => (
                <div key={r}>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Round {r}</div>
                  <ul className="space-y-2">
                    {byRound[r].map((m) => {
                      const isBye = !m.player2_id;
                      return (
                        <li key={m.id} className="card-mystic rounded-md overflow-hidden">
                          {isBye ? (
                            <div className="flex items-center text-sm px-3 py-2">
                              <span className="font-medium">{m.player1_id ? usernames[m.player1_id] ?? "?" : "?"}</span>
                              <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/15 text-gold">BYE — auto win</span>
                            </div>
                          ) : (
                            <div className="flex items-stretch text-sm">
                              <Slot name={m.player1_id ? usernames[m.player1_id] ?? "?" : "TBD"} won={m.winner_id === m.player1_id}
                                onPick={canManage && m.player1_id && m.player2_id && !m.winner_id ? () => onDeclareWinner(m, m.player1_id!) : undefined} />
                              <div className="px-2 flex items-center text-xs text-muted-foreground">vs</div>
                              <Slot name={m.player2_id ? usernames[m.player2_id] ?? "?" : "TBD"} won={m.winner_id === m.player2_id}
                                onPick={canManage && m.player1_id && m.player2_id && !m.winner_id ? () => onDeclareWinner(m, m.player2_id!) : undefined} />
                            </div>
                          )}
                          {!isBye && !m.winner_id && m.player1_id && m.player2_id && (
                            m.duel_id
                              ? <button onClick={() => onResume(m.id, m.duel_id)} className="w-full bg-gold/15 text-gold text-xs py-1.5 hover:bg-gold/25"><Swords className="h-3 w-3 inline mr-1" /> Resume</button>
                              : <button onClick={() => onCreateDuel(m)} className="w-full bg-gold/15 text-gold text-xs py-1.5 hover:bg-gold/25"><Swords className="h-3 w-3 inline mr-1" /> Start duel</button>
                          )}
                          {!isBye && canManage && m.winner_id && (
                            <button onClick={() => onClearWinner(m)} className="w-full bg-muted text-muted-foreground text-[10px] py-1 hover:bg-muted/80">Clear result</button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          );
        })()}
      </section>
    </div>
  );
}
