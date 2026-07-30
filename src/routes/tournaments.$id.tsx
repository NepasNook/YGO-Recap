import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Trophy, Users, Play, Swords, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildTournamentMatches } from "@/lib/tournamentBracket";

export const Route = createFileRoute("/tournaments/$id")({ component: TournamentDetail });

type T = {
  id: string;
  name: string;
  description: string | null;
  max_players: number;
  status: "open" | "active" | "finished";
  creator_id: string;
  winner_id: string | null;
  start_date: string | null;
  format: "bracket" | "league";
  matches_per_player: number | null;
};
type M = {
  id: string;
  round: number;
  bracket_position: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  duel_id: string | null;
};

function TournamentDetail() {
  const { id } = Route.useParams();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [t, setT] = useState<T | null>(null);
  const [parts, setParts] = useState<{ user_id: string; username: string }[]>([]);
  const [matches, setMatches] = useState<M[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, { p1: number; p2: number }>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<T>>({});

  const load = async () => {
    const { data: td } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
    setT(td as T | null);
    const { data: p } = await supabase
      .from("tournament_participants")
      .select("user_id, profiles(username)")
      .eq("tournament_id", id);
    const list = (p ?? []).map((r: any) => ({
      user_id: r.user_id,
      username: r.profiles?.username ?? "?",
    }));
    setParts(list);
    setUsernames(Object.fromEntries(list.map((x) => [x.user_id, x.username])));
    const { data: ms } = await supabase
      .from("tournament_matches")
      .select("*")
      .eq("tournament_id", id)
      .order("round")
      .order("bracket_position");
    const matchesRows = (ms as M[] | null) ?? [];
    setMatches(matchesRows);
    const duelIds = matchesRows.map((m) => m.duel_id).filter(Boolean) as string[];
    if (duelIds.length) {
      const { data: ds } = await supabase
        .from("duels")
        .select("id, games_p1_wins, games_p2_wins")
        .in("id", duelIds);
      const byDuel: Record<string, { p1: number; p2: number }> = {};
      (ds ?? []).forEach((d: any) => {
        byDuel[d.id] = { p1: d.games_p1_wins ?? 0, p2: d.games_p2_wins ?? 0 };
      });
      const map: Record<string, { p1: number; p2: number }> = {};
      matchesRows.forEach((m) => {
        if (m.duel_id && byDuel[m.duel_id]) map[m.id] = byDuel[m.duel_id];
      });
      setScores(map);
    } else setScores({});
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [id]);

  useEffect(() => {
    const ch = supabase
      .channel(`t:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${id}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_participants",
          filter: `tournament_id=eq.${id}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line
  }, [id]);

  if (!t) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;

  const isCreator = user?.id === t.creator_id;
  const canManage = isCreator || isAdmin;
  const isParticipant = !!user && parts.some((p) => p.user_id === user.id);
  const isFull = parts.length >= t.max_players;

  const join = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("tournament_participants")
      .insert({ tournament_id: id, user_id: user.id });
    if (error) toast.error(error.message);
    else {
      toast.success("Joined!");
      load();
    }
  };
  const leave = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("tournament_participants")
      .delete()
      .eq("tournament_id", id)
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
    else load();
  };

  // Legacy fallback: generates the bracket/schedule for tournaments created
  // before match generation happened automatically at creation time.
  const start = async () => {
    if (parts.length < 2) {
      toast.error("Servono almeno 2 giocatori");
      return;
    }
    const ids = parts.map((p) => p.user_id);
    const matches = buildTournamentMatches(t.format, ids);
    const { error } = await supabase
      .from("tournament_matches")
      .insert(matches.map((m) => ({ tournament_id: id, ...m })));
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("tournaments").update({ status: "active" }).eq("id", id);
    load();
  };

  const declareWinner = async (m: M, winnerId: string) => {
    const { error } = await supabase
      .from("tournament_matches")
      .update({ winner_id: winnerId })
      .eq("id", m.id);
    if (error) toast.error(error.message);
    else toast.success("Vincitore registrato");
  };

  const clearWinner = async (m: M) => {
    const { error } = await supabase
      .from("tournament_matches")
      .update({ winner_id: null })
      .eq("id", m.id);
    if (error) toast.error(error.message);
  };

  const finalizeLeague = async (winnerId: string) => {
    const { error } = await supabase
      .from("tournaments")
      .update({ winner_id: winnerId, status: "finished" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Torneo concluso");
  };

  const rounds: M[][] = [];
  matches.forEach((m) => {
    (rounds[m.round - 1] ||= []).push(m);
  });

  return (
    <div className="space-y-6 py-4">
      <header>
        <Link to="/tournaments" className="text-xs text-muted-foreground hover:text-foreground">
          ← All tournaments
        </Link>
        <div className="flex items-start justify-between gap-3 mt-1">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl gold-text break-words">{t.name}</h1>
            {t.description && (
              <p className="text-muted-foreground text-sm mt-1 whitespace-pre-wrap break-words">
                {t.description}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {parts.length} giocatori
              </span>
              <span className="uppercase tracking-wider">{t.status}</span>
              <span className="uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/15 text-gold">
                {t.format === "league" ? "Campionato" : "Eliminazione diretta"}
              </span>
              {matches.length > 0 && <span>{rounds.length} turni</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditForm({
                    name: t.name,
                    description: t.description,
                    format: t.format,
                    status: t.status,
                  });
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            )}
            {matches.length === 0 &&
              t.status === "open" &&
              user &&
              (isParticipant ? (
                <Button variant="outline" size="sm" onClick={leave}>
                  Leave
                </Button>
              ) : (
                !isFull && (
                  <Button size="sm" className="gold-gradient text-background" onClick={join}>
                    Join
                  </Button>
                )
              ))}
            {matches.length === 0 && t.status === "open" && canManage && (
              <Button size="sm" onClick={start} className="bg-success text-background">
                <Play className="h-3 w-3 mr-1" /> Start
              </Button>
            )}
          </div>
        </div>
        {t.winner_id && (
          <div className="card-mystic rounded-lg p-4 mt-4 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-gold" />
            <div>
              <div className="text-xs text-muted-foreground">Champion</div>
              <div className="font-display text-xl gold-text">{usernames[t.winner_id] ?? "?"}</div>
            </div>
          </div>
        )}
      </header>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica torneo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={editForm.name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Textarea
                value={editForm.description ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Formato</Label>
                <Select
                  value={editForm.format}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, format: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bracket">Eliminazione diretta</SelectItem>
                    <SelectItem value="league">Campionato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stato</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="finished">Finished</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annulla
            </Button>
            <Button
              className="gold-gradient text-background"
              onClick={async () => {
                const payload: any = {
                  name: editForm.name,
                  description: editForm.description || null,
                  format: editForm.format,
                  status: editForm.status,
                };
                const { error } = await supabase.from("tournaments").update(payload).eq("id", id);
                if (error) toast.error(error.message);
                else {
                  toast.success("Torneo aggiornato");
                  setEditOpen(false);
                  load();
                }
              }}
            >
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {matches.length === 0 ? (
        <section>
          <h2 className="font-display text-lg mb-2">Participants</h2>
          {parts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No one yet.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {parts.map((p) => (
                <li key={p.user_id} className="card-mystic rounded-md px-3 py-2 text-sm">
                  {p.username}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : t.format === "league" ? (
        <LeagueView
          matches={matches}
          usernames={usernames}
          userId={user?.id}
          canManage={canManage}
          tournament={t}
          onDeclareWinner={declareWinner}
          onClearWinner={clearWinner}
          onFinalize={finalizeLeague}
          onCreateDuel={async (m) => createDuelForMatch(m, user?.id, isAdmin, navigate)}
          onResume={(mid, did) =>
            did && navigate({ to: "/duel/$id", params: { id: did }, search: { match: mid } })
          }
        />
      ) : (
        <Bracket
          rounds={rounds}
          usernames={usernames}
          userId={user?.id}
          canManage={canManage}
          onDeclareWinner={declareWinner}
          onClearWinner={clearWinner}
          navigate={(matchId, duelId) => {
            if (duelId)
              navigate({ to: "/duel/$id", params: { id: duelId }, search: { match: matchId } });
          }}
          onCreateDuel={async (m) => createDuelForMatch(m, user?.id, isAdmin, navigate)}
        />
      )}

      {matches.length > 0 && <MatchLog matches={matches} usernames={usernames} scores={scores} />}

      {canManage && (
        <AdminMatches tournamentId={id} matches={matches} parts={parts} usernames={usernames} />
      )}
    </div>
  );
}

function AdminMatches({
  tournamentId,
  matches,
  parts,
  usernames,
}: {
  tournamentId: string;
  matches: M[];
  parts: { user_id: string; username: string }[];
  usernames: Record<string, string>;
}) {
  const [addRound, setAddRound] = useState<number>(
    () => (matches.reduce((mx, m) => Math.max(mx, m.round), 0) || 0) + 1,
  );
  const [addP1, setAddP1] = useState<string>("");
  const [addP2, setAddP2] = useState<string>("__bye__");

  const updateMatch = async (mid: string, patch: Partial<M>) => {
    const { error } = await supabase.from("tournament_matches").update(patch).eq("id", mid);
    if (error) toast.error(error.message);
    else toast.success("Match aggiornato");
  };
  const deleteMatch = async (mid: string) => {
    if (!confirm("Eliminare questo match?")) return;
    const { error } = await supabase.from("tournament_matches").delete().eq("id", mid);
    if (error) toast.error(error.message);
    else toast.success("Match eliminato");
  };
  const addMatch = async () => {
    if (!addP1) {
      toast.error("Seleziona player 1");
      return;
    }
    const p2 = addP2 === "__bye__" ? null : addP2;
    const roundMatches = matches.filter((m) => m.round === addRound);
    const pos = (roundMatches.reduce((mx, m) => Math.max(mx, m.bracket_position), 0) || 0) + 1;
    const { error } = await supabase.from("tournament_matches").insert({
      tournament_id: tournamentId,
      round: addRound,
      bracket_position: pos,
      player1_id: addP1,
      player2_id: p2,
      winner_id: p2 === null ? addP1 : null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Match aggiunto");
      setAddP1("");
      setAddP2("__bye__");
    }
  };

  const byRound: Record<number, M[]> = {};
  matches.forEach((m) => {
    (byRound[m.round] ||= []).push(m);
  });
  const keys = Object.keys(byRound)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <section>
      <h2 className="font-display text-lg mb-2 flex items-center gap-2">
        <Pencil className="h-4 w-4 text-gold" /> Gestione match (admin)
      </h2>
      <div className="card-mystic rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr_1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">Turno</Label>
            <Input
              type="number"
              min={1}
              value={addRound}
              onChange={(e) => setAddRound(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <div>
            <Label className="text-xs">Player 1</Label>
            <Select value={addP1} onValueChange={setAddP1}>
              <SelectTrigger>
                <SelectValue placeholder="Scegli" />
              </SelectTrigger>
              <SelectContent>
                {parts.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Player 2</Label>
            <Select value={addP2} onValueChange={setAddP2}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__bye__">BYE (vittoria auto)</SelectItem>
                {parts.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={addMatch} className="gold-gradient text-background">
            Aggiungi
          </Button>
        </div>

        {keys.map((r) => (
          <div key={r} className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-gold">Turno {r}</div>
            {byRound[r].map((m) => {
              const winnerOptions = [m.player1_id, m.player2_id].filter(Boolean) as string[];
              return (
                <div
                  key={m.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center bg-muted/20 rounded p-2"
                >
                  <Select
                    value={m.player1_id ?? "__none__"}
                    onValueChange={(v) =>
                      updateMatch(m.id, { player1_id: v === "__none__" ? null : v } as any)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— nessuno —</SelectItem>
                      {parts.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {p.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={m.player2_id ?? "__none__"}
                    onValueChange={(v) =>
                      updateMatch(m.id, { player2_id: v === "__none__" ? null : v } as any)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— BYE —</SelectItem>
                      {parts.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {p.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={m.winner_id ?? "__none__"}
                    onValueChange={(v) =>
                      updateMatch(m.id, { winner_id: v === "__none__" ? null : v } as any)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vincitore" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— nessun vincitore —</SelectItem>
                      {winnerOptions.map((uid) => (
                        <SelectItem key={uid} value={uid}>
                          {usernames[uid] ?? "?"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="destructive" onClick={() => deleteMatch(m.id)}>
                    Elimina
                  </Button>
                </div>
              );
            })}
          </div>
        ))}
        {matches.length === 0 && (
          <p className="text-xs text-muted-foreground">Nessun match — aggiungine uno sopra.</p>
        )}
      </div>
    </section>
  );
}

function MatchLog({
  matches,
  usernames,
  scores,
}: {
  matches: M[];
  usernames: Record<string, string>;
  scores: Record<string, { p1: number; p2: number }>;
}) {
  const byRound: Record<number, M[]> = {};
  matches.forEach((m) => {
    (byRound[m.round] ||= []).push(m);
  });
  const keys = Object.keys(byRound)
    .map(Number)
    .sort((a, b) => a - b);
  return (
    <section>
      <h2 className="font-display text-lg mb-2">Storico partite</h2>
      <div className="card-mystic rounded-lg p-4 space-y-4 text-sm">
        {keys.map((r) => (
          <div key={r}>
            <div className="text-xs uppercase tracking-wider text-gold mb-1">Turno {r}:</div>
            <ul className="space-y-0.5 pl-2 font-mono text-[13px]">
              {byRound[r].map((m) => {
                const p1 = m.player1_id ? (usernames[m.player1_id] ?? "?") : "TBD";
                const p2 = m.player2_id ? (usernames[m.player2_id] ?? "?") : null;
                if (!p2) return <li key={m.id}>{p1} (bye)</li>;
                const s = scores[m.id];
                let scoreStr = "";
                if (s) scoreStr = ` (${s.p1}-${s.p2})`;
                else if (m.winner_id) scoreStr = m.winner_id === m.player1_id ? " (1-0)" : " (0-1)";
                else scoreStr = " (—)";
                return (
                  <li key={m.id}>
                    {p1} vs {p2}
                    {scoreStr}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

async function createDuelForMatch(
  m: M,
  userId: string | undefined,
  isAdmin: boolean,
  navigate: any,
) {
  if (!userId || !m.player1_id || !m.player2_id) return;
  if (userId !== m.player1_id && userId !== m.player2_id && !isAdmin) {
    toast.error("Only match players can start");
    return;
  }
  const { data, error } = await supabase
    .from("duels")
    .insert({
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      tournament_match_id: m.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    toast.error(error?.message ?? "Failed");
    return;
  }
  await supabase
    .from("tournament_matches")
    .update({ duel_id: data.id, started_at: new Date().toISOString() })
    .eq("id", m.id);
  navigate({ to: "/duel/$id", params: { id: data.id }, search: { match: m.id } });
}

function Bracket({
  rounds,
  usernames,
  userId,
  canManage,
  navigate,
  onCreateDuel,
  onDeclareWinner,
  onClearWinner,
}: {
  rounds: M[][];
  usernames: Record<string, string>;
  userId?: string;
  canManage: boolean;
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
            <div className="text-xs uppercase tracking-wider text-muted-foreground text-center">
              {ri === rounds.length - 1 ? "Final" : `Round ${ri + 1}`}
            </div>
            {round.map((m) => {
              const isPlayer = userId && (m.player1_id === userId || m.player2_id === userId);
              return (
                <div key={m.id} className="card-mystic rounded-md overflow-hidden text-sm">
                  <Slot
                    name={m.player1_id ? (usernames[m.player1_id] ?? "?") : "TBD"}
                    won={m.winner_id === m.player1_id}
                    onPick={
                      canManage && m.player1_id && m.player2_id && !m.winner_id
                        ? () => onDeclareWinner(m, m.player1_id!)
                        : undefined
                    }
                  />
                  <div className="border-t border-border" />
                  <Slot
                    name={m.player2_id ? (usernames[m.player2_id] ?? "?") : "TBD"}
                    won={m.winner_id === m.player2_id}
                    onPick={
                      canManage && m.player1_id && m.player2_id && !m.winner_id
                        ? () => onDeclareWinner(m, m.player2_id!)
                        : undefined
                    }
                  />
                  {!m.winner_id &&
                    m.player1_id &&
                    m.player2_id &&
                    isPlayer &&
                    (m.duel_id ? (
                      <button
                        onClick={() => navigate(m.id, m.duel_id)}
                        className="w-full bg-gold/15 text-gold text-xs py-1.5 hover:bg-gold/25"
                      >
                        <Swords className="h-3 w-3 inline mr-1" /> Resume
                      </button>
                    ) : (
                      <button
                        onClick={() => onCreateDuel(m)}
                        className="w-full bg-gold/15 text-gold text-xs py-1.5 hover:bg-gold/25"
                      >
                        <Swords className="h-3 w-3 inline mr-1" /> Start duel
                      </button>
                    ))}
                  {canManage && m.winner_id && (
                    <button
                      onClick={() => onClearWinner(m)}
                      className="w-full bg-muted text-muted-foreground text-[10px] py-1 hover:bg-muted/80"
                    >
                      Annulla risultato
                    </button>
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
    <div
      className={`px-3 py-2 flex justify-between items-center gap-2 ${won ? "bg-gold/15 text-gold font-semibold" : ""}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title={name}
        className={`text-left flex-1 min-w-0 ${expanded ? "whitespace-normal break-words" : "truncate"}`}
      >
        {name}
      </button>
      <div className="flex items-center gap-1 shrink-0">
        {won && <Trophy className="h-3 w-3" />}
        {onPick && (
          <button
            onClick={onPick}
            title="Segna vincitore"
            className="h-5 w-5 rounded bg-success/20 text-success hover:bg-success/40 flex items-center justify-center"
          >
            <Check className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function LeagueView({
  matches,
  usernames,
  userId,
  canManage,
  tournament,
  onDeclareWinner,
  onClearWinner,
  onFinalize,
  onCreateDuel,
  onResume,
}: {
  matches: M[];
  usernames: Record<string, string>;
  userId?: string;
  canManage: boolean;
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
        <h2 className="font-display text-lg mb-2">Classifica</h2>
        <div className="card-mystic rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Giocatore</th>
                <th className="px-3 py-2 text-right">V</th>
                <th className="px-3 py-2 text-right">Bye</th>
                <th className="px-3 py-2 text-right">G</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr
                  key={s.uid}
                  className={`border-t border-border ${i === 0 && allDone && tied.length === 1 ? "bg-gold/10 text-gold font-semibold" : ""}`}
                >
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
              {tied.length > 1
                ? `Parità tra ${tied.length} giocatori — scegli il vincitore (spareggio manuale)`
                : "Concludi il torneo assegnando il vincitore"}
            </div>
            <div className="flex flex-wrap gap-2">
              {(tied.length > 1 ? tied : standings.slice(0, 1)).map((s) => (
                <Button
                  key={s.uid}
                  size="sm"
                  className="gold-gradient text-background"
                  onClick={() => onFinalize(s.uid)}
                >
                  <Trophy className="h-3 w-3 mr-1" /> {usernames[s.uid] ?? "?"} vince
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg mb-2">Partite</h2>
        {(() => {
          const byRound: Record<number, M[]> = {};
          matches.forEach((m) => {
            (byRound[m.round] ||= []).push(m);
          });
          const roundKeys = Object.keys(byRound)
            .map(Number)
            .sort((a, b) => a - b);
          return (
            <div className="space-y-4">
              {roundKeys.map((r) => (
                <div key={r}>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Turno {r}
                  </div>
                  <ul className="space-y-2">
                    {byRound[r].map((m) => {
                      const isBye = !m.player2_id;
                      const isPlayer =
                        userId && (m.player1_id === userId || m.player2_id === userId);
                      return (
                        <li key={m.id} className="card-mystic rounded-md overflow-hidden">
                          {isBye ? (
                            <div className="flex items-center text-sm px-3 py-2">
                              <span className="font-medium">
                                {m.player1_id ? (usernames[m.player1_id] ?? "?") : "?"}
                              </span>
                              <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/15 text-gold">
                                BYE — vittoria auto
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-stretch text-sm">
                              <Slot
                                name={m.player1_id ? (usernames[m.player1_id] ?? "?") : "TBD"}
                                won={m.winner_id === m.player1_id}
                                onPick={
                                  canManage && m.player1_id && m.player2_id && !m.winner_id
                                    ? () => onDeclareWinner(m, m.player1_id!)
                                    : undefined
                                }
                              />
                              <div className="px-2 flex items-center text-xs text-muted-foreground">
                                vs
                              </div>
                              <Slot
                                name={m.player2_id ? (usernames[m.player2_id] ?? "?") : "TBD"}
                                won={m.winner_id === m.player2_id}
                                onPick={
                                  canManage && m.player1_id && m.player2_id && !m.winner_id
                                    ? () => onDeclareWinner(m, m.player2_id!)
                                    : undefined
                                }
                              />
                            </div>
                          )}
                          {!isBye &&
                            !m.winner_id &&
                            m.player1_id &&
                            m.player2_id &&
                            isPlayer &&
                            (m.duel_id ? (
                              <button
                                onClick={() => onResume(m.id, m.duel_id)}
                                className="w-full bg-gold/15 text-gold text-xs py-1.5 hover:bg-gold/25"
                              >
                                <Swords className="h-3 w-3 inline mr-1" /> Resume
                              </button>
                            ) : (
                              <button
                                onClick={() => onCreateDuel(m)}
                                className="w-full bg-gold/15 text-gold text-xs py-1.5 hover:bg-gold/25"
                              >
                                <Swords className="h-3 w-3 inline mr-1" /> Start duel
                              </button>
                            ))}
                          {!isBye && canManage && m.winner_id && (
                            <button
                              onClick={() => onClearWinner(m)}
                              className="w-full bg-muted text-muted-foreground text-[10px] py-1 hover:bg-muted/80"
                            >
                              Annulla risultato
                            </button>
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
