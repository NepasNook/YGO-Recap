import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import {
  Dices,
  Coins,
  Trophy,
  RotateCcw,
  Hand,
  Handshake,
  Maximize2,
  Minimize2,
  ScrollText,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { LpCalculator } from "@/components/LpCalculator";
import { DiceRollDialog, CoinFlipDialog, StartDiceDialog } from "@/components/DiceCoinDialog";
import { useIsMobile } from "@/hooks/use-mobile";

type LpLog = {
  id: string;
  duel_id: string;
  player: number;
  prev_lp: number;
  new_lp: number;
  delta: number;
  by_user_id: string | null;
  created_at: string;
  note: string | null;
};

type Search = { match?: string };

export const Route = createFileRoute("/_authenticated/duel/$id")({
  component: DuelRoom,
  validateSearch: (s: Record<string, unknown>): Search => ({
    match: typeof s.match === "string" ? s.match : undefined,
  }),
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
  pending_join_user_id: string | null;
  is_local: boolean;
  for_fun: boolean;
};
type LiveState = {
  duel_id: string;
  p1_lp: number;
  p2_lp: number;
  p1_wins: number;
  p2_wins: number;
  draws: number;
  rps_needed: boolean;
  starter: number | null;
  last_event: any;
};
type Deck = { id: string; name: string };

function DuelRoom() {
  const { id } = Route.useParams();
  const { match: matchId } = useSearch({ from: "/_authenticated/duel/$id" });
  const navigate = useNavigate();
  const { user } = useAuth();

  const [duel, setDuel] = useState<Duel | null>(null);
  const [live, setLive] = useState<LiveState | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [decks, setDecks] = useState<Deck[]>([]);
  const [calcFor, setCalcFor] = useState<1 | 2 | null>(null);
  const [diceOpen, setDiceOpen] = useState(false);
  const [coinOpen, setCoinOpen] = useState(false);
  const [diceVal, setDiceVal] = useState<number | null>(null);
  const [coinVal, setCoinVal] = useState<"heads" | "tails" | null>(null);
  const [joinPrompt, setJoinPrompt] = useState(false);
  const [pickDeckOpen, setPickDeckOpen] = useState(false);
  const [pickedDeck, setPickedDeck] = useState<string>("");
  const [rpsOpen, setRpsOpen] = useState(false);
  const [winLoading, setWinLoading] = useState<1 | 2 | null>(null);
  const [confirmFinal, setConfirmFinal] = useState<1 | 2 | null>(null);
  const lastEventAtRef = useRef<number | null>(null);
  const startDiceTriedRef = useRef<boolean>(false);
  const isMobile = useIsMobile();
  const [portrait, setPortrait] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [logs, setLogs] = useState<LpLog[]>([]);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(orientation: portrait)");
    const cb = () => setPortrait(mq.matches);
    cb();
    mq.addEventListener("change", cb);
    const fsCb = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fsCb);
    return () => {
      mq.removeEventListener("change", cb);
      document.removeEventListener("fullscreenchange", fsCb);
    };
  }, []);

  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      const orient = (screen as any).orientation;
      if (orient?.lock) {
        try {
          await orient.lock("landscape");
        } catch {
          /* fallback to CSS rotation */
        }
      }
    } catch {
      /* ignore */
    }
  };
  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  };

  // Initial load
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("duels").select("*").eq("id", id).maybeSingle();
      if (!data) {
        toast.error("Duello non trovato");
        navigate({ to: "/duel/new" });
        return;
      }
      setDuel(data as Duel);
      const ids = [data.player1_id, data.player2_id, data.pending_join_user_id].filter(
        Boolean,
      ) as string[];
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, username").in("id", ids);
        setNames(Object.fromEntries((ps ?? []).map((p) => [p.id, p.username])));
      }
      const { data: ls } = await supabase
        .from("duel_live_state")
        .select("*")
        .eq("duel_id", id)
        .maybeSingle();
      if (ls) setLive(ls as LiveState);
      else {
        const { data: created } = await supabase
          .from("duel_live_state")
          .insert({ duel_id: id } as never)
          .select("*")
          .single();
        if (created) setLive(created as LiveState);
      }
      const { data: dks } = await supabase.from("decks").select("id, name").order("name");
      setDecks((dks ?? []) as Deck[]);
    })();
  }, [id, navigate]);

  // Realtime: duel + live state + lp logs
  useEffect(() => {
    const ch = supabase
      .channel(`duel-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "duels", filter: `id=eq.${id}` },
        (p) => {
          setDuel(p.new as Duel);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "duel_live_state", filter: `duel_id=eq.${id}` },
        (p) => {
          setLive(p.new as LiveState);
          const ev = (p.new as LiveState).last_event;
          if (ev && typeof ev.at === "number" && ev.at !== lastEventAtRef.current) {
            lastEventAtRef.current = ev.at;
            if (ev.type === "dice") {
              setDiceVal(ev.value);
              setDiceOpen(true);
            }
            if (ev.type === "coin") {
              setCoinVal(ev.value);
              setCoinOpen(true);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "duel_lp_logs", filter: `duel_id=eq.${id}` },
        (p) => {
          setLogs((cur) => [p.new as LpLog, ...cur].slice(0, 200));
        },
      )
      .subscribe();
    // Initial logs fetch
    supabase
      .from("duel_lp_logs")
      .select("*")
      .eq("duel_id", id)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setLogs((data ?? []) as LpLog[]));
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  // Polling fallback: while waiting for an opponent, re-check the duel every 2s
  // so the host always sees join requests even if realtime drops a message.
  useEffect(() => {
    if (!duel) return;
    const waitingForJoin = !duel.player2_id && user?.id === duel.player1_id;
    if (!waitingForJoin) return;
    const t = setInterval(async () => {
      const { data } = await supabase.from("duels").select("*").eq("id", id).maybeSingle();
      if (data) setDuel(data as Duel);
    }, 2000);
    return () => clearInterval(t);
  }, [duel?.player2_id, duel?.player1_id, user?.id, id]);

  // Load profile name for incoming joiner
  useEffect(() => {
    if (duel?.pending_join_user_id && !names[duel.pending_join_user_id]) {
      supabase
        .from("profiles")
        .select("id, username")
        .eq("id", duel.pending_join_user_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setNames((n) => ({ ...n, [data.id]: data.username }));
        });
    }
    // Show join prompt to host
    if (duel && user?.id === duel.player1_id && duel.pending_join_user_id && !duel.player2_id) {
      setJoinPrompt(true);
    }
    // If I'm the joiner and got accepted: pick deck
    if (duel && user?.id === duel.player2_id && !duel.deck2_id) {
      setPickDeckOpen(true);
    }
  }, [duel, user, names]);

  // Auto-trigger the "start-of-duel" dice roll once both players have a deck
  // and no starter has been chosen yet. Host (player1) is the source of truth.
  useEffect(() => {
    if (!duel || !live || !user) return;
    if (user.id !== duel.player1_id) return; // only host triggers
    if (!duel.deck1_id || !duel.deck2_id || !duel.player2_id) return;
    if (live.starter != null) {
      startDiceTriedRef.current = false;
      return;
    }
    if (duel.winner_id || duel.status === "finished") return;
    const ev = live.last_event as any;
    if (ev?.type === "start_dice") return; // already rolling/awaiting choice
    if (startDiceTriedRef.current) return;
    startDiceTriedRef.current = true;
    let d1 = 1 + Math.floor(Math.random() * 6);
    let d2 = 1 + Math.floor(Math.random() * 6);
    while (d1 === d2) {
      d1 = 1 + Math.floor(Math.random() * 6);
      d2 = 1 + Math.floor(Math.random() * 6);
    }
    const at = Date.now();
    supabase
      .from("duel_live_state")
      .update({
        last_event: { type: "start_dice", d1, d2, winner: d1 > d2 ? 1 : 2, at } as any,
      } as never)
      .eq("duel_id", id);
  }, [duel, live, user, id]);

  if (!duel || !live)
    return <div className="py-20 text-center text-muted-foreground">Caricamento duello…</div>;

  const isPlayer = user?.id === duel.player1_id || user?.id === duel.player2_id;
  const isLocalHost = duel.is_local && user?.id === duel.player1_id;
  const p1Name = names[duel.player1_id] ?? "P1";
  const p2Name = duel.player2_id ? (names[duel.player2_id] ?? "P2") : "In attesa…";
  const p1Deck = duel.deck1_id ? decks.find((d) => d.id === duel.deck1_id)?.name : "—";
  const p2Deck = duel.deck2_id ? decks.find((d) => d.id === duel.deck2_id)?.name : "—";
  const [init1, init2] = distinctInitials(p1Name, p2Name);

  const updateLive = async (patch: Partial<LiveState>) => {
    setLive((cur) => (cur ? { ...cur, ...patch } : cur));
    await supabase
      .from("duel_live_state")
      .update(patch as never)
      .eq("duel_id", id);
  };

  const applyLp = async (player: 1 | 2, newLp: number) => {
    const prev = player === 1 ? live.p1_lp : live.p2_lp;
    await updateLive(player === 1 ? { p1_lp: newLp } : { p2_lp: newLp });
    if (newLp !== prev) {
      await supabase.from("duel_lp_logs").insert({
        duel_id: id,
        player,
        prev_lp: prev,
        new_lp: newLp,
        delta: newLp - prev,
        by_user_id: user?.id ?? null,
      } as never);
    }
    setCalcFor(null);
  };

  const undoLastLp = async () => {
    const last = logs.find((l) => !l.note);
    if (!last) {
      toast.info("Nessuna operazione da annullare");
      return;
    }
    const patch = last.player === 1 ? { p1_lp: last.prev_lp } : { p2_lp: last.prev_lp };
    await updateLive(patch);
    await supabase.from("duel_lp_logs").delete().eq("id", last.id);
    setLogs((cur) => cur.filter((l) => l.id !== last.id));
    toast.success(`Annullato: ${last.player === 1 ? p1Name : p2Name} ${last.prev_lp} LP`);
  };

  const rollDice = async () => {
    const v = 1 + Math.floor(Math.random() * 6);
    const at = Date.now();
    lastEventAtRef.current = at;
    setDiceVal(v);
    setDiceOpen(true);
    await updateLive({ last_event: { type: "dice", value: v, by: user?.id, at } as any });
  };
  const flipCoin = async () => {
    const v: "heads" | "tails" = Math.random() < 0.5 ? "heads" : "tails";
    const at = Date.now();
    lastEventAtRef.current = at;
    setCoinVal(v);
    setCoinOpen(true);
    await updateLive({ last_event: { type: "coin", value: v, by: user?.id, at } as any });
  };

  const rerollStartDice = async () => {
    let d1 = 1 + Math.floor(Math.random() * 6);
    let d2 = 1 + Math.floor(Math.random() * 6);
    while (d1 === d2) {
      d1 = 1 + Math.floor(Math.random() * 6);
      d2 = 1 + Math.floor(Math.random() * 6);
    }
    await updateLive({
      last_event: { type: "start_dice", d1, d2, winner: d1 > d2 ? 1 : 2, at: Date.now() } as any,
    });
  };

  const chooseStarter = async (order: "first" | "second") => {
    const ev = live.last_event as any;
    if (!ev || ev.type !== "start_dice") return;
    const winner: 1 | 2 = ev.winner;
    const starter: 1 | 2 = order === "first" ? winner : winner === 1 ? 2 : 1;
    const winnerName = winner === 1 ? p1Name : p2Name;
    const starterName = starter === 1 ? p1Name : p2Name;
    await updateLive({ starter, last_event: { type: "start_dice_done", at: Date.now() } as any });
    await supabase.from("duel_lp_logs").insert({
      duel_id: id,
      player: starter,
      prev_lp: live.p1_lp,
      new_lp: live.p1_lp,
      delta: 0,
      by_user_id: user?.id ?? null,
      note: `Dado iniziale: ${p1Name} ${ev.d1} – ${p2Name} ${ev.d2}. Vince ${winnerName}, inizia ${starterName} (${order === "first" ? "1°" : "2°"}).`,
    } as never);
  };

  const acceptJoin = async () => {
    if (!duel.pending_join_user_id) return;
    await supabase
      .from("duels")
      .update({
        player2_id: duel.pending_join_user_id,
        pending_join_user_id: null,
        status: "live",
      } as never)
      .eq("id", id);
    setJoinPrompt(false);
    toast.success("Avversario accettato");
  };
  const rejectJoin = async () => {
    await supabase
      .from("duels")
      .update({ pending_join_user_id: null } as never)
      .eq("id", id);
    setJoinPrompt(false);
  };

  const confirmDeck = async () => {
    if (!pickedDeck) return;
    await supabase
      .from("duels")
      .update({ deck2_id: pickedDeck } as never)
      .eq("id", id);
    setPickDeckOpen(false);
  };

  const declareWinner = async (winner: 1 | 2, confirmed = false) => {
    const winId = winner === 1 ? duel.player1_id : duel.player2_id;
    if (!winId) return;
    const newP1 = live.p1_wins + (winner === 1 ? 1 : 0);
    const newP2 = live.p2_wins + (winner === 2 ? 1 : 0);
    const isFinal = newP1 === 2 || newP2 === 2;
    if (isFinal && !confirmed) {
      setConfirmFinal(winner);
      return;
    }
    setWinLoading(winner);
    try {
      await supabase.from("duel_games").insert({
        duel_id: duel.id,
        game_number: newP1 + newP2 + live.draws,
        winner_id: winId,
        p1_final_lp: live.p1_lp,
        p2_final_lp: live.p2_lp,
      } as never);
      await supabase
        .from("duels")
        .update({ games_p1_wins: newP1, games_p2_wins: newP2 } as never)
        .eq("id", duel.id);
      if (isFinal) {
        const matchWinner = newP1 === 2 ? duel.player1_id : duel.player2_id;
        await supabase
          .from("duels")
          .update({ winner_id: matchWinner, status: "finished" } as never)
          .eq("id", duel.id);
        if (matchId && matchWinner)
          await supabase
            .from("tournament_matches")
            .update({ winner_id: matchWinner, duel_id: duel.id } as never)
            .eq("id", matchId);
      } else {
        await updateLive({
          p1_lp: 8000,
          p2_lp: 8000,
          p1_wins: newP1,
          p2_wins: newP2,
          rps_needed: false,
        });
      }
      await new Promise((r) => setTimeout(r, 700));
    } finally {
      setWinLoading(null);
      setConfirmFinal(null);
    }
  };

  const declareDraw = async () => {
    await supabase.from("duel_games").insert({
      duel_id: duel.id,
      game_number: live.p1_wins + live.p2_wins + live.draws + 1,
      winner_id: null,
      p1_final_lp: live.p1_lp,
      p2_final_lp: live.p2_lp,
    } as never);
    await updateLive({
      p1_lp: 8000,
      p2_lp: 8000,
      draws: live.draws + 1,
      rps_needed: false,
      starter: null,
      last_event: null as any,
    });
    toast.info("Pareggio: si tirano di nuovo i dadi per decidere chi inizia");
  };

  const setRpsLoser = async (loser: 1 | 2) => {
    // chi perde inizia per primo
    await updateLive({ rps_needed: false, starter: loser });
    setRpsOpen(false);
    toast.success(`Inizia P${loser} (ha perso al sasso/carta/forbici)`);
  };

  const matchScore = `${live.p1_wins} - ${live.p2_wins}${live.draws > 0 ? ` (${live.draws} pari)` : ""}`;
  const finished = duel.status === "finished" || duel.winner_id;
  const waiting = duel.status === "waiting_opponent" && !duel.player2_id;

  const forceRotate = isMobile && portrait;
  const outerClass = forceRotate
    ? "fixed inset-0 z-50 bg-background overflow-hidden"
    : "fixed inset-0 top-[57px] bottom-[64px] md:bottom-0 bg-background";
  const innerStyle = forceRotate
    ? ({
        position: "absolute",
        top: "50%",
        left: "50%",
        width: "100vh",
        height: "100vw",
        transform: "translate(-50%, -50%) rotate(90deg)",
        transformOrigin: "center center",
      } as const)
    : undefined;
  const innerClass = forceRotate ? "flex flex-col" : "w-full h-full flex flex-col";

  return (
    <div className={outerClass}>
      {/* Fullscreen toggle (mobile) */}
      {isMobile && (
        <button
          onClick={isFs ? exitFullscreen : enterFullscreen}
          className="fixed top-2 right-2 z-[60] h-9 w-9 grid place-items-center rounded-full bg-background/80 backdrop-blur border border-gold/40 text-gold"
          aria-label={isFs ? "Esci da schermo intero" : "Schermo intero"}
        >
          {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      )}
      <div className={innerClass} style={innerStyle}>
        {/* Header */}
        <div className="flex-shrink-0 px-3 py-2 text-center border-b border-gold/20">
          <div className="font-display text-lg gold-text">
            {p1Name} <span className="text-foreground font-mono">{matchScore}</span> {p2Name}
          </div>
          {waiting && (
            <div className="text-xs text-gold animate-pulse">In attesa di un avversario…</div>
          )}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {duel.is_local && (
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Duello locale
              </div>
            )}
            {duel.for_fun && (
              <div className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-400/40">
                for fun · non conta
              </div>
            )}
          </div>
          {live.starter && !finished && (
            <div className="text-xs text-gold">Inizia P{live.starter}</div>
          )}
        </div>

        {/* Split panel — horizontal layout */}
        <div className="flex-1 flex flex-row min-h-0">
          <PlayerHalf
            name={p1Name}
            deck={p1Deck}
            lp={live.p1_lp}
            accent="gold"
            clickable={isPlayer && !finished}
            onClick={() => setCalcFor(1)}
          />
          <div className="flex-shrink-0 flex flex-col items-stretch justify-center gap-2 px-2 py-3 border-x border-gold/20 bg-background w-[120px] sm:w-[136px]">
            <Button
              onClick={rollDice}
              disabled={!isPlayer}
              variant="outline"
              className="w-full h-10 text-xs px-1"
            >
              <Dices className="h-4 w-4 mr-1" />
              Dado
            </Button>
            <Button
              onClick={flipCoin}
              disabled={!isPlayer}
              variant="outline"
              className="w-full h-10 text-xs px-1"
            >
              <Coins className="h-4 w-4 mr-1" />
              Moneta
            </Button>
            <Button
              onClick={() => setLogOpen(true)}
              variant="outline"
              className="w-full h-10 text-xs px-1"
            >
              <ScrollText className="h-4 w-4 mr-1" />
              Log
            </Button>
            <Button
              onClick={undoLastLp}
              disabled={!isPlayer || !!finished}
              variant="outline"
              className="w-full h-10 text-xs px-1"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              Undo
            </Button>
            {isPlayer && !finished && duel.player2_id && (
              <>
                <Button
                  onClick={() => declareWinner(1)}
                  disabled={winLoading !== null}
                  variant="outline"
                  className="w-full h-10 text-xs px-1 font-semibold"
                >
                  {winLoading === 1 ? "…" : `${init1} win`}
                </Button>
                <Button
                  onClick={() => declareWinner(2)}
                  disabled={winLoading !== null}
                  variant="outline"
                  className="w-full h-10 text-xs px-1 font-semibold"
                >
                  {winLoading === 2 ? "…" : `${init2} win`}
                </Button>
                <Button
                  onClick={declareDraw}
                  disabled={winLoading !== null}
                  variant="outline"
                  className="w-full h-10 text-xs px-1"
                >
                  <Handshake className="h-4 w-4 mr-1" />
                  Pari
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateLive({ p1_lp: 8000, p2_lp: 8000 })}
              disabled={!isPlayer}
              className="w-full h-8"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          <PlayerHalf
            name={p2Name}
            deck={p2Deck}
            lp={live.p2_lp}
            accent="purple"
            clickable={isPlayer && !finished && !!duel.player2_id}
            onClick={() => setCalcFor(2)}
          />
        </div>

        {finished && (
          <div className="absolute inset-0 grid place-items-center bg-background/90 backdrop-blur-sm z-30">
            <div className="card-mystic rounded-xl p-8 text-center space-y-4 max-w-sm">
              <Trophy className="h-12 w-12 mx-auto text-gold" />
              <h2 className="font-display text-2xl gold-text">
                {duel.winner_id === duel.player1_id ? p1Name : p2Name} vince!
              </h2>
              <Button
                onClick={() => navigate({ to: "/profile" })}
                className="gold-gradient text-background"
              >
                Torna al profilo
              </Button>
            </div>
          </div>
        )}

        {/* LP Calculator sheet */}
        <Sheet open={calcFor !== null} onOpenChange={(v) => !v && setCalcFor(null)}>
          <SheetContent
            side="bottom"
            className="bg-background border-gold/30 max-h-[95vh] overflow-y-auto p-4 sm:max-w-none"
          >
            <div>
              <SheetTitle className="text-center font-display gold-text mb-2">
                Calcolatrice LP
              </SheetTitle>
              {calcFor && (
                <LpCalculator
                  playerName={calcFor === 1 ? p1Name : p2Name}
                  currentLp={calcFor === 1 ? live.p1_lp : live.p2_lp}
                  onApply={(n) => applyLp(calcFor, n)}
                  onClose={() => setCalcFor(null)}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>

        <DiceRollDialog
          open={diceOpen}
          onClose={() => setDiceOpen(false)}
          value={diceVal}
          onReroll={isPlayer ? rollDice : undefined}
        />
        <CoinFlipDialog
          open={coinOpen}
          onClose={() => setCoinOpen(false)}
          value={coinVal}
          onReroll={isPlayer ? flipCoin : undefined}
        />

        {/* Start-of-duel dice: both players, host triggers, winner chooses 1°/2° */}
        {(() => {
          const ev = live.last_event as any;
          const open =
            ev?.type === "start_dice" &&
            live.starter == null &&
            !!duel.deck1_id &&
            !!duel.deck2_id &&
            !!duel.player2_id &&
            !duel.winner_id;
          const winner = (ev?.winner as 1 | 2 | undefined) ?? null;
          const winnerUserId =
            winner === 1 ? duel.player1_id : winner === 2 ? duel.player2_id : null;
          const canChoose =
            !!user && (isLocalHost || (winnerUserId != null && user.id === winnerUserId));
          return (
            <StartDiceDialog
              open={open}
              d1={(ev?.d1 as number) ?? null}
              d2={(ev?.d2 as number) ?? null}
              p1Name={p1Name}
              p2Name={p2Name}
              canChoose={canChoose}
              onChoose={chooseStarter}
              onReroll={rerollStartDice}
            />
          );
        })()}

        {/* LP Log sheet */}
        <Sheet open={logOpen} onOpenChange={setLogOpen}>
          <SheetContent
            side="right"
            className="bg-background border-gold/30 w-full sm:max-w-md overflow-y-auto"
          >
            <SheetTitle className="font-display gold-text mb-3">Cronologia LP</SheetTitle>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna modifica ai Life Points registrata.
              </p>
            ) : (
              <ul className="space-y-2">
                {logs.map((l) => {
                  const who = l.player === 1 ? p1Name : p2Name;
                  const pos = l.delta > 0;
                  if (l.note) {
                    return (
                      <li
                        key={l.id}
                        className="rounded-md border border-amber-400/30 bg-amber-500/5 p-2 text-sm"
                      >
                        <div className="text-xs text-amber-300 uppercase tracking-widest">
                          Evento
                        </div>
                        <div className="text-sm">{l.note}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {new Date(l.created_at).toLocaleTimeString()}
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={l.id}
                      className="rounded-md border border-gold/20 bg-background/40 p-2 text-sm flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-medium">{who}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.prev_lp} → {l.new_lp} LP ·{" "}
                          {new Date(l.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                      <div
                        className={`font-mono font-bold ${pos ? "text-success" : "text-destructive"}`}
                      >
                        {pos ? "+" : ""}
                        {l.delta}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SheetContent>
        </Sheet>

        {/* Host: incoming join request */}
        <Dialog open={joinPrompt} onOpenChange={setJoinPrompt}>
          <DialogContent className="border-gold/40">
            <DialogTitle className="gold-text font-display">Richiesta di entrare</DialogTitle>
            <p className="text-sm">
              <span className="font-bold">
                {duel.pending_join_user_id
                  ? (names[duel.pending_join_user_id] ?? "Un utente")
                  : "Un utente"}
              </span>{" "}
              vuole entrare nel tuo duello.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={rejectJoin}>
                Rifiuta
              </Button>
              <Button className="gold-gradient text-background" onClick={acceptJoin}>
                Accetta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Joiner: pick deck after accepted */}
        <Dialog open={pickDeckOpen} onOpenChange={setPickDeckOpen}>
          <DialogContent className="border-gold/40">
            <DialogTitle className="gold-text font-display">Scegli il tuo deck</DialogTitle>
            <Select value={pickedDeck} onValueChange={setPickedDeck}>
              <SelectTrigger>
                <SelectValue placeholder="Scegli un deck" />
              </SelectTrigger>
              <SelectContent>
                {decks.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button
                onClick={confirmDeck}
                disabled={!pickedDeck}
                className="gold-gradient text-background"
              >
                Conferma
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rock-Paper-Scissors result */}
        <Dialog open={rpsOpen} onOpenChange={setRpsOpen}>
          <DialogContent className="border-gold/40">
            <DialogTitle className="gold-text font-display">Sasso / Carta / Forbici</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Fate il sasso/carta/forbici dal vivo, poi indica chi ha{" "}
              <span className="text-amber-400 font-semibold">perso</span>: inizierà per primo.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRpsLoser(1)}>
                Ha perso {p1Name}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setRpsLoser(2)}>
                Ha perso {p2Name}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Confirm final winner */}
        <Dialog
          open={confirmFinal !== null}
          onOpenChange={(v) => {
            if (!v && winLoading === null) setConfirmFinal(null);
          }}
        >
          <DialogContent className="border-gold/40">
            <DialogTitle className="gold-text font-display">Conferma vittoria finale</DialogTitle>
            <p className="text-sm">
              Stai per chiudere il match assegnando la vittoria a{" "}
              <span className="font-bold text-gold">
                {confirmFinal === 1 ? p1Name : confirmFinal === 2 ? p2Name : ""}
              </span>
              . Confermi?
            </p>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmFinal(null)}
                disabled={winLoading !== null}
              >
                Annulla
              </Button>
              <Button
                className="gold-gradient text-background"
                disabled={winLoading !== null}
                onClick={() => confirmFinal && declareWinner(confirmFinal, true)}
              >
                {winLoading !== null ? "Salvataggio…" : "Conferma"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function PlayerHalf({
  name,
  deck,
  lp,
  accent,
  clickable,
  onClick,
}: {
  name: string;
  deck?: string;
  lp: number;
  accent: "gold" | "purple";
  clickable: boolean;
  onClick: () => void;
}) {
  const grad = accent === "gold" ? "from-amber-300 to-amber-600" : "from-violet-400 to-purple-700";
  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`flex-1 min-w-0 h-full px-2 flex flex-col items-center justify-center gap-2 overflow-hidden transition ${clickable ? "hover:bg-gold/5 active:bg-gold/10 cursor-pointer" : "cursor-default"}`}
    >
      <div className="text-xs uppercase tracking-widest text-muted-foreground text-center truncate max-w-full">
        {name} · {deck ?? "—"}
      </div>
      <motion.div
        key={lp}
        initial={{ scale: 1.15, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`font-display text-4xl sm:text-5xl md:text-7xl tabular-nums bg-gradient-to-br ${grad} bg-clip-text text-transparent leading-none`}
      >
        {lp}
      </motion.div>
      {clickable && (
        <div className="text-[10px] text-muted-foreground">tap per la calcolatrice</div>
      )}
    </button>
  );
}

function distinctInitials(a: string, b: string): [string, string] {
  const A = (a || "P1").trim();
  const B = (b || "P2").trim();
  const len = Math.min(A.length, B.length);
  for (let i = 0; i < len; i++) {
    if (A[i].toUpperCase() !== B[i].toUpperCase()) {
      return [A[i].toUpperCase(), B[i].toUpperCase()];
    }
  }
  if (A.length !== B.length) {
    return [(A[0] ?? "P").toUpperCase(), (B[0] ?? "P").toUpperCase()];
  }
  return ["1", "2"];
}
