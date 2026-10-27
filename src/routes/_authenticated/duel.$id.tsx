import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Dices, Coins, Trophy, RotateCcw, Handshake, ScrollText, Undo2, XCircle, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { LpCalculatorDialog } from "@/components/LpCalculator";
import { DiceRollDialog, CoinFlipDialog } from "@/components/DiceCoinDialog";
import { useDuelLayout, useSwappedSides, FullscreenButton, PlayerHalf, UtilityButton, LpLogDialog, DuelToaster, duelToast, distinctInitials } from "@/components/DuelBoard";
import { GameFormatBadge } from "@/components/GameFormatPicker";

type LpLog = { id: string; duel_id: string; player: number; prev_lp: number; new_lp: number; delta: number; by_user_id: string | null; created_at: string; note: string | null };

type Search = { match?: string };

export const Route = createFileRoute("/_authenticated/duel/$id")({
  component: DuelRoom,
  validateSearch: (s: Record<string, unknown>): Search => ({ match: typeof s.match === "string" ? s.match : undefined }),
});

type Duel = {
  id: string;
  player1_id: string;
  player2_id: string | null;
  deck1_id: string | null;
  deck2_id: string | null;
  games_p1_wins: number;
  games_p2_wins: number;
  winner_id: string | null;
  status: string;
  is_local: boolean;
  for_fun: boolean;
  best_of: number;
  game_format: string;
  tournament_match_id: string | null;
};
// A die roll or coin flip, shared with the other phone through duel_live_state.
type DuelEvent =
  | { type: "dice"; value: number; by?: string; at: number }
  | { type: "coin"; value: "heads" | "tails"; by?: string; at: number };
type LiveState = { duel_id: string; p1_lp: number; p2_lp: number; p1_wins: number; p2_wins: number; draws: number; rps_needed: boolean; starter: number | null; last_event: DuelEvent | null };
type Deck = { id: string; name: string };

function DuelRoom() {
  const { id } = Route.useParams();
  const { match: matchId } = useSearch({ from: "/_authenticated/duel/$id" });
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [duel, setDuel] = useState<Duel | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  // The live state couldn't be read or created (e.g. a spectator opening a duel
  // nobody has started yet): show that instead of loading forever.
  const [liveMissing, setLiveMissing] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [decks, setDecks] = useState<Deck[]>([]);
  const [calcFor, setCalcFor] = useState<1 | 2 | null>(null);
  const [diceOpen, setDiceOpen] = useState(false);
  const [coinOpen, setCoinOpen] = useState(false);
  const [diceVal, setDiceVal] = useState<number | null>(null);
  const [coinVal, setCoinVal] = useState<"heads" | "tails" | null>(null);
  const [diceRollId, setDiceRollId] = useState<number | null>(null);
  const [coinRollId, setCoinRollId] = useState<number | null>(null);
  const [winLoading, setWinLoading] = useState<1 | 2 | null>(null);
  const [confirmFinal, setConfirmFinal] = useState<1 | 2 | null>(null);
  const lastEventAtRef = useRef<number | null>(null);
  // Guard multi-step writes against a double tap.
  const busyRef = useRef(false);
  const undoBusyRef = useRef(false);
  // Live-state fields written by this device and still waiting for the DB's
  // answer (field → number of writes in flight).
  const pendingFieldsRef = useRef<Map<string, number>>(new Map());
  // A realtime echo arrived while writes were in flight: resync once they end.
  const echoSkippedRef = useRef(false);
  // In-app confirmation (a native confirm() would drop the phone out of fullscreen).
  const [confirmAction, setConfirmAction] = useState<"draw" | "reset" | "cancel" | null>(null);
  const lpAudioRef = useRef<HTMLAudioElement | null>(null);
  const { showFullscreen, isFs, enterFullscreen, exitFullscreen, outerClass, innerStyle, innerClass, innerRef, rotated, overlayContainer, compact } = useDuelLayout();
  const [logs, setLogs] = useState<LpLog[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const { swapped, toggleSwapped } = useSwappedSides(`duelSwapped:${id}`);

  // Initial load
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("duels").select("*").eq("id", id).maybeSingle();
      if (!data) { toast.error("Duel not found"); navigate({ to: "/duel/new" }); return; }
      setDuel(data as Duel);
      const ids = [data.player1_id, data.player2_id].filter(Boolean) as string[];
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, username").in("id", ids);
        setNames(Object.fromEntries((ps ?? []).map((p) => [p.id, p.username])));
      }
      const { data: ls } = await supabase.from("duel_live_state").select("*").eq("duel_id", id).maybeSingle();
      // Mark the dice/coin roll already stored as seen: every realtime echo (e.g.
      // after an LP change) carries the whole row, and without this the first
      // one would replay that old roll as if it had just been thrown.
      const seenAt = (ls as LiveState | null)?.last_event?.at;
      if (typeof seenAt === "number") lastEventAtRef.current = seenAt;
      if (ls) setLive(ls as LiveState);
      else {
        const { data: created } = await supabase.from("duel_live_state").insert({ duel_id: id } as never).select("*").single();
        if (created) setLive(created as LiveState);
        else setLiveMissing(true);
      }
      const { data: dks } = await supabase.from("decks").select("id, name").order("name");
      setDecks((dks ?? []) as Deck[]);
    })();
  }, [id, navigate]);

  // Realtime: duel + live state + lp logs
  useEffect(() => {
    const ch = supabase.channel(`duel-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "duels", filter: `id=eq.${id}` }, (p) => {
        setDuel(p.new as Duel);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "duel_live_state", filter: `duel_id=eq.${id}` }, (p) => {
        // While our own writes are in flight, an echo may be an older snapshot
        // of the fields we're writing: applying those would briefly roll back
        // the LP just entered (e.g. two quick changes). Keep our values for
        // those fields only, so a change made meanwhile on the other phone
        // still shows up, and resync once our writes are done.
        const remote = p.new as LiveState;
        const pending = pendingFieldsRef.current;
        if (pending.size === 0) setLive(remote);
        else {
          echoSkippedRef.current = true;
          setLive((cur) => {
            if (!cur) return remote;
            const merged: Record<string, unknown> = { ...remote };
            pending.forEach((_, k) => { merged[k] = (cur as Record<string, unknown>)[k]; });
            return merged as LiveState;
          });
        }
        const ev = remote.last_event;
        if (ev && typeof ev.at === "number" && ev.at !== lastEventAtRef.current) {
          lastEventAtRef.current = ev.at;
          if (ev.type === "dice") { setDiceVal(ev.value); setDiceRollId(ev.at); setDiceOpen(true); }
          if (ev.type === "coin") { setCoinVal(ev.value); setCoinRollId(ev.at); setCoinOpen(true); }
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "duel_lp_logs", filter: `duel_id=eq.${id}` }, (p) => {
        // Our own inserts are already added locally (see insertLog): skip their echo.
        const row = p.new as LpLog;
        setLogs((cur) => (cur.some((l) => l.id === row.id) ? cur : [row, ...cur].slice(0, 200)));
      })
      // An Undo from the other phone deletes the entry: drop it here too, or an
      // Undo on this phone would replay a change that's already been undone.
      // (Delete events can't be filtered by duel: match on the row id instead.)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "duel_lp_logs" }, (p) => {
        const oldId = (p.old as { id?: string }).id;
        if (oldId) setLogs((cur) => cur.filter((l) => l.id !== oldId));
      })
      .subscribe();
    // Initial logs fetch
    supabase.from("duel_lp_logs").select("*").eq("duel_id", id).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setLogs((data ?? []) as LpLog[]));
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  if (duel && !live && liveMissing) return <div className="py-20 text-center text-muted-foreground">This duel hasn't been started by either player yet.</div>;
  if (!duel || !live) return <div className="py-20 text-center text-muted-foreground">Loading duel…</div>;

  const isPlayer = user?.id === duel.player1_id || user?.id === duel.player2_id;
  // Players run the duel; an admin may too, as referee (e.g. a tournament
  // played on the organizer's phone).
  const canControl = isPlayer || isAdmin;
  // The duel remembers its tournament match, so the result reaches the bracket
  // even when the duel is reopened without `?match` (e.g. from "Resume").
  const tournamentMatchId = matchId ?? duel.tournament_match_id ?? undefined;
  const p1Name = names[duel.player1_id] ?? "P1";
  const p2Name = duel.player2_id ? names[duel.player2_id] ?? "P2" : "Waiting…";
  const p1Deck = duel.deck1_id ? decks.find((d) => d.id === duel.deck1_id)?.name : "—";
  const p2Deck = duel.deck2_id ? decks.find((d) => d.id === duel.deck2_id)?.name : "—";
  const [init1, init2] = distinctInitials(p1Name, p2Name);

  // Optimistic update. If the write fails (flaky network, phone waking from standby)
  // retry once, then resync from DB: otherwise the screen keeps a value the DB never got,
  // and the next realtime echo (full row) silently reverts it.
  const updateLive = async (patch: Partial<LiveState>): Promise<boolean> => {
    setLive((cur) => (cur ? { ...cur, ...patch } : cur));
    const pending = pendingFieldsRef.current;
    const keys = Object.keys(patch);
    keys.forEach((k) => pending.set(k, (pending.get(k) ?? 0) + 1));
    try {
      let { error } = await supabase.from("duel_live_state").update(patch as never).eq("duel_id", id);
      if (error) {
        ({ error } = await supabase.from("duel_live_state").update(patch as never).eq("duel_id", id));
      }
      if (error) {
        const { data } = await supabase.from("duel_live_state").select("*").eq("duel_id", id).maybeSingle();
        if (data) setLive(data as LiveState);
        duelToast.error("Change not saved (connection issue?). Please try again.");
        return false;
      }
      return true;
    } finally {
      keys.forEach((k) => {
        const n = (pending.get(k) ?? 1) - 1;
        if (n > 0) pending.set(k, n); else pending.delete(k);
      });
      // Echoes merged while writing may have carried stale values for fields
      // the other phone changed at the same moment: read the row once more.
      // (Not awaited: the caller shouldn't wait for this extra round trip.)
      if (pending.size === 0 && echoSkippedRef.current) {
        echoSkippedRef.current = false;
        supabase.from("duel_live_state").select("*").eq("duel_id", id).maybeSingle().then(({ data }) => {
          if (pending.size > 0) echoSkippedRef.current = true; // a newer write will resync
          else if (data) setLive(data as LiveState);
        });
      }
    }
  };

  const playLpSound = () => {
    if (!lpAudioRef.current) lpAudioRef.current = new Audio("/sounds/lp-change.mp3");
    const a = lpAudioRef.current;
    a.currentTime = 0;
    a.play().catch(() => { /* autoplay blocked before any user gesture — ignore */ });
  };

  // Adds the row locally right away instead of waiting for its realtime echo,
  // so Undo sees it even when the realtime connection is down.
  const insertLog = async (row: { player: 1 | 2; prev_lp: number; new_lp: number; delta: number; note?: string }) => {
    const { data } = await supabase.from("duel_lp_logs")
      .insert({ duel_id: id, by_user_id: user?.id ?? null, ...row } as never)
      .select("*").single();
    if (data) setLogs((cur) => (cur.some((l) => l.id === (data as LpLog).id) ? cur : [data as LpLog, ...cur].slice(0, 200)));
  };

  // Event notes mark game boundaries (new game, draw, LP reset).
  const logEvent = (note: string, player: 1 | 2 = 1) =>
    insertLog({ player, prev_lp: live.p1_lp, new_lp: live.p1_lp, delta: 0, note });

  // The calculator closes right away and the LP show at once (updateLive is
  // optimistic): waiting for the network made a tap look lost. If saving
  // fails, updateLive puts the saved LP back and says so.
  const applyLp = async (player: 1 | 2, newLp: number) => {
    setCalcFor(null);
    const prev = player === 1 ? live.p1_lp : live.p2_lp;
    if (newLp === prev) return;
    playLpSound();
    const ok = await updateLive(player === 1 ? { p1_lp: newLp } : { p2_lp: newLp });
    if (ok) await insertLog({ player, prev_lp: prev, new_lp: newLp, delta: newLp - prev });
  };

  const undoLastLp = async () => {
    // Only the latest entry, and never past an event note: Undo can't reach
    // back into a previous game (whose LP were already reset to 8000).
    if (undoBusyRef.current) return;
    const last = logs[0];
    if (!last || last.note) { duelToast.info("Nothing to undo"); return; }
    undoBusyRef.current = true;
    try {
      const who = last.player === 1 ? p1Name : p2Name;
      const patch = last.player === 1 ? { p1_lp: last.prev_lp } : { p2_lp: last.prev_lp };
      const ok = await updateLive(patch);
      if (!ok) return;
      setLogs((cur) => cur.filter((l) => l.id !== last.id));
      // Without the delete policy the DB refuses silently (no error, 0 rows):
      // check what was actually deleted, not just the error.
      const { data: deleted, error: delErr } = await supabase.from("duel_lp_logs").delete().eq("id", last.id).select("id");
      if (delErr || !deleted?.length) {
        // The entry is still there (DB not migrated yet): leave a note after
        // it, so a later Undo can't replay this change again.
        await logEvent(`Undone: ${who} back to ${last.prev_lp} LP.`, last.player as 1 | 2);
      }
      duelToast.success(`Undone: ${who} ${last.prev_lp} LP`);
    } finally {
      undoBusyRef.current = false;
    }
  };

  const resetLp = async () => {
    const ok = await updateLive({ p1_lp: 8000, p2_lp: 8000 });
    if (ok) await logEvent("Both players' LP reset to 8000.");
  };

  const cancelDuel = async () => {
    if (tournamentMatchId) {
      await supabase.from("tournament_matches").update({ duel_id: null, started_at: null } as never).eq("id", tournamentMatchId);
    }
    const { error } = await supabase.from("duels").delete().eq("id", id);
    if (error) { duelToast.error(error.message); return; }
    toast.success("Duel cancelled");
    navigate({ to: "/duel/new" });
  };



  const rollDice = async () => {
    const v = 1 + Math.floor(Math.random() * 6);
    const at = Date.now();
    lastEventAtRef.current = at;
    setDiceVal(v); setDiceRollId(at); setDiceOpen(true);
    await updateLive({ last_event: { type: "dice", value: v, by: user?.id, at } });
  };
  const flipCoin = async () => {
    const v: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
    const at = Date.now();
    lastEventAtRef.current = at;
    setCoinVal(v); setCoinRollId(at); setCoinOpen(true);
    await updateLive({ last_event: { type: "coin", value: v, by: user?.id, at } });
  };

  // Skips inserting a game that's already recorded, so retrying after a
  // partial failure (e.g. network drop midway) doesn't count it twice.
  const recordGame = async (gameNumber: number, winnerId: string | null) => {
    const { data: existing } = await supabase.from("duel_games").select("id").eq("duel_id", duel.id).eq("game_number", gameNumber).limit(1);
    if (existing?.length) return true;
    const { error } = await supabase.from("duel_games").insert({
      duel_id: duel.id, game_number: gameNumber, winner_id: winnerId,
      p1_final_lp: live.p1_lp, p2_final_lp: live.p2_lp,
    } as never);
    if (error) { duelToast.error(`Game not saved: ${error.message}`); return false; }
    return true;
  };



  // Each step is checked: on failure it stops with an error instead of going
  // on with half-saved data, and pressing "wins" again safely resumes.
  const declareWinner = async (winner: 1 | 2, confirmed = false) => {
    if (busyRef.current) return;
    const winId = winner === 1 ? duel.player1_id : duel.player2_id;
    if (!winId) return;
    const newP1 = live.p1_wins + (winner === 1 ? 1 : 0);
    const newP2 = live.p2_wins + (winner === 2 ? 1 : 0);
    const winsNeeded = duel.best_of === 1 ? 1 : 2;
    const isFinal = newP1 === winsNeeded || newP2 === winsNeeded;
    if (isFinal && !confirmed) {
      setConfirmFinal(winner);
      return;
    }
    busyRef.current = true;
    setWinLoading(winner);
    try {
      const gameNumber = newP1 + newP2 + live.draws;
      if (!(await recordGame(gameNumber, winId))) return;
      const { error: scoreErr } = await supabase.from("duels").update({ games_p1_wins: newP1, games_p2_wins: newP2 } as never).eq("id", duel.id);
      if (scoreErr) {
        // Already closed by an earlier attempt whose response got lost: show it,
        // and make sure the tournament got the result too.
        const { data: cur } = await supabase.from("duels").select("*").eq("id", duel.id).maybeSingle();
        if (cur?.winner_id) {
          setDuel(cur as Duel);
          if (tournamentMatchId) await supabase.from("tournament_matches").update({ winner_id: cur.winner_id, duel_id: duel.id } as never).eq("id", tournamentMatchId);
          return;
        }
        duelToast.error(`Score not saved: ${scoreErr.message}`);
        return;
      }
      if (isFinal) {
        const matchWinner = newP1 === winsNeeded ? duel.player1_id : duel.player2_id;
        const { error: winErr } = await supabase.from("duels").update({ winner_id: matchWinner, status: "finished" } as never).eq("id", duel.id);
        if (winErr) {
          // A retry may find the duel already closed (the first attempt went
          // through but its response was lost): that counts as done.
          const { data: cur } = await supabase.from("duels").select("winner_id").eq("id", duel.id).maybeSingle();
          if (cur?.winner_id !== matchWinner) { duelToast.error(`Result not saved: ${winErr.message}`); return; }
        }
        // Show the result now rather than waiting for the realtime echo, which
        // may never come if the connection dropped (the user would tap again).
        setDuel((d) => (d ? { ...d, winner_id: matchWinner, status: "finished", games_p1_wins: newP1, games_p2_wins: newP2 } : d));
        if (tournamentMatchId && matchWinner) {
          const { error: tmErr } = await supabase.from("tournament_matches").update({ winner_id: matchWinner, duel_id: duel.id } as never).eq("id", tournamentMatchId);
          if (tmErr) duelToast.error(`Tournament not updated: ${tmErr.message}`);
        }
      } else {
        // Next game: who starts is decided by the players at the table.
        const ok = await updateLive({ p1_lp: 8000, p2_lp: 8000, p1_wins: newP1, p2_wins: newP2 });
        if (!ok) return;
        await logEvent(`Game ${gameNumber} won by ${winner === 1 ? p1Name : p2Name}: LP reset to 8000.`, winner);
      }
      await new Promise((r) => setTimeout(r, 700));
    } finally {
      busyRef.current = false;
      setWinLoading(null);
      setConfirmFinal(null);
    }
  };

  const declareDraw = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const gameNumber = live.p1_wins + live.p2_wins + live.draws + 1;
      if (!(await recordGame(gameNumber, null))) return;
      const ok = await updateLive({ p1_lp: 8000, p2_lp: 8000, draws: live.draws + 1 });
      if (!ok) return;
      await logEvent(`Game ${gameNumber}: draw. LP reset to 8000.`);
      duelToast.info("Draw: LP reset to 8000");
    } finally {
      busyRef.current = false;
    }
  };

  const finished = duel.status === "finished" || duel.winner_id;

  // Score, halves and "wins" buttons follow the sides shown (see Swap).
  const [leftWins, rightWins] = swapped ? [live.p2_wins, live.p1_wins] : [live.p1_wins, live.p2_wins];
  const p1Half = (
    <PlayerHalf
      key="p1" name={p1Name} deck={p1Deck} lp={live.p1_lp} accent="gold"
      clickable={canControl && !finished} onClick={() => setCalcFor(1)}
    />
  );
  const p2Half = (
    <PlayerHalf
      key="p2" name={p2Name} deck={p2Deck} lp={live.p2_lp} accent="purple"
      clickable={canControl && !finished && !!duel.player2_id} onClick={() => setCalcFor(2)}
    />
  );
  const winButton = (w: 1 | 2) => (
    <Button key={w} onClick={() => declareWinner(w)} disabled={winLoading !== null} className="w-full flex-1 min-h-10 text-lg font-display font-bold px-1 bg-success/15 hover:bg-success/25 text-success border border-success/40">
      {winLoading === w ? "…" : `${w === 1 ? init1 : init2} wins`}
    </Button>
  );

  return (
    <div className={outerClass}>
      <div className={innerClass} style={innerStyle} ref={innerRef}>
      <FullscreenButton show={showFullscreen} isFs={isFs} onEnter={enterFullscreen} onExit={exitFullscreen} />
      {/* Split panel — horizontal layout */}
      <div className="flex-1 flex flex-row min-h-0">
        {swapped ? p2Half : p1Half}
        <div className="flex-shrink-0 flex flex-col gap-1.5 p-1.5 border-x border-gold/20 bg-background w-[132px] sm:w-[156px]">
          {/* Match score (no header above the board: the room goes to the LP), LP reset beside it */}
          <div className="relative text-center leading-tight">
            <div className="font-mono text-xl font-bold text-foreground">{leftWins} - {rightWins}</div>
            <button
              onClick={() => setConfirmAction("reset")}
              disabled={!canControl}
              className="absolute top-0 right-0 h-7 w-7 grid place-items-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Reset LP"
              title="Reset LP"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <div className="flex items-center justify-center gap-1 flex-wrap">
              <GameFormatBadge format={duel.game_format} />
              {duel.for_fun && <span className="text-[9px] uppercase tracking-widest px-1 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-400/40">for fun</span>}
              {live.draws > 0 && <span className="text-[9px] uppercase tracking-widest text-muted-foreground">draws {live.draws}</span>}
            </div>
          </div>

          {/* Utility actions */}
          <div className="grid grid-cols-2 gap-1.5">
            <UtilityButton onClick={rollDice} disabled={!canControl} icon={Dices} label="Die" />
            <UtilityButton onClick={flipCoin} disabled={!canControl} icon={Coins} label="Coin" />
            <UtilityButton onClick={() => setLogOpen(true)} icon={ScrollText} label="Log" />
            <UtilityButton onClick={undoLastLp} disabled={!canControl || !!finished} icon={Undo2} label="Undo" />
            <UtilityButton onClick={() => setConfirmAction("cancel")} disabled={!canControl || !!finished} icon={XCircle} label="Cancel" />
            <UtilityButton onClick={toggleSwapped} icon={ArrowLeftRight} label="Swap" />
          </div>

          {/* Primary match actions — bigger, more prominent */}
          {canControl && !finished && duel.player2_id && (
            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              {swapped ? [winButton(2), winButton(1)] : [winButton(1), winButton(2)]}
              <Button onClick={() => setConfirmAction("draw")} disabled={winLoading !== null} variant="outline" className="w-full h-10 shrink-0 text-sm px-1">
                <Handshake className="h-4 w-4 mr-1" />Draw
              </Button>
            </div>
          )}
        </div>
        {swapped ? p1Half : p2Half}
      </div>

      {finished && (
        <div className="absolute inset-0 grid place-items-center bg-background/90 backdrop-blur-sm z-30">
          <div className="card-mystic rounded-xl p-8 text-center space-y-4 max-w-sm">
            <Trophy className="h-12 w-12 mx-auto text-gold" />
            <h2 className="font-display text-2xl gold-text">
              {duel.winner_id === duel.player1_id ? p1Name : p2Name} wins!
            </h2>
            <Button onClick={() => navigate({ to: "/profile" })} className="gold-gradient text-background">Back to profile</Button>
          </div>
        </div>
      )}

      {/* LP Calculator popup */}
      <LpCalculatorDialog
        open={calcFor !== null}
        onClose={() => setCalcFor(null)}
        container={overlayContainer}
        compact={compact}
        playerName={calcFor === 1 ? p1Name : p2Name}
        currentLp={calcFor === 1 ? live.p1_lp : live.p2_lp}
        onApply={(n) => calcFor && applyLp(calcFor, n)}
      />

      <DiceRollDialog container={overlayContainer} open={diceOpen} onClose={() => setDiceOpen(false)} value={diceVal} rollId={diceRollId} onReroll={canControl ? rollDice : undefined} />
      <CoinFlipDialog container={overlayContainer} open={coinOpen} onClose={() => setCoinOpen(false)} value={coinVal} rollId={coinRollId} onReroll={canControl ? flipCoin : undefined} />

      {/* LP log popup */}
      <LpLogDialog container={overlayContainer} open={logOpen} onClose={() => setLogOpen(false)} logs={logs} p1Name={p1Name} p2Name={p2Name} />

      {/* Messages shown inside the board, so they rotate with it */}
      <DuelToaster />


      {/* Confirm draw / LP reset (both wipe the current LP) / cancel */}
      <Dialog open={confirmAction !== null} onOpenChange={(v) => { if (!v) setConfirmAction(null); }}>
        <DialogContent container={overlayContainer} className={`border-gold/40 ${rotated ? "max-h-[95vw] overflow-y-auto" : ""}`}>
          <DialogTitle className="gold-text font-display">
            {confirmAction === "draw" ? "Confirm draw" : confirmAction === "cancel" ? "Cancel duel" : "Reset LP"}
          </DialogTitle>
          <p className="text-sm">
            {confirmAction === "draw"
              ? "Confirm the draw? Both players' LP return to 8000."
              : confirmAction === "cancel"
                ? "Cancel this duel? LP, dice/coin rolls and results will be deleted. This can't be undone."
                : "Reset both players' LP to 8000?"}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              className="gold-gradient text-background"
              onClick={() => { const a = confirmAction; setConfirmAction(null); if (a === "draw") declareDraw(); else if (a === "reset") resetLp(); else if (a === "cancel") cancelDuel(); }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm final winner */}
      <Dialog open={confirmFinal !== null} onOpenChange={(v) => { if (!v && winLoading === null) setConfirmFinal(null); }}>
        <DialogContent container={overlayContainer} className={`border-gold/40 ${rotated ? "max-h-[95vw] overflow-y-auto" : ""}`}>
          <DialogTitle className="gold-text font-display">Confirm final win</DialogTitle>
          <p className="text-sm">
            You're about to close the match, awarding the win to{" "}
            <span className="font-bold text-gold">{confirmFinal === 1 ? p1Name : confirmFinal === 2 ? p2Name : ""}</span>. Confirm?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmFinal(null)} disabled={winLoading !== null}>Cancel</Button>
            <Button
              className="gold-gradient text-background"
              disabled={winLoading !== null}
              onClick={() => confirmFinal && declareWinner(confirmFinal, true)}
            >
              {winLoading !== null ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
