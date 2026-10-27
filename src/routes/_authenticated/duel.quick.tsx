import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Dices, Coins, Trophy, RotateCcw, Handshake, ScrollText, Undo2, XCircle, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { LpCalculatorDialog } from "@/components/LpCalculator";
import { DiceRollDialog, CoinFlipDialog } from "@/components/DiceCoinDialog";
import { useDuelLayout, useSwappedSides, FullscreenButton, PlayerHalf, UtilityButton, LpLogDialog, DuelToaster, duelToast, distinctInitials, type LpLogEntry } from "@/components/DuelBoard";
import { type QuickMatchState, QUICK_WINS_NEEDED, FRESH_QUICK_MATCH, loadQuickMatch, saveQuickMatch, clearQuickMatch } from "@/lib/quickMatch";

export const Route = createFileRoute("/_authenticated/duel/quick")({
  component: QuickMatch,
  head: () => ({ meta: [{ title: "Quick match — YGO Recap" }] }),
});

const P1_NAME = "Player 1";
const P2_NAME = "Player 2";

function QuickMatch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? "";

  // null until read from localStorage (it isn't available during SSR).
  const [state, setState] = useState<QuickMatchState | null>(null);
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [calcFor, setCalcFor] = useState<1 | 2 | null>(null);
  const [diceOpen, setDiceOpen] = useState(false);
  const [coinOpen, setCoinOpen] = useState(false);
  const [diceVal, setDiceVal] = useState<number | null>(null);
  const [coinVal, setCoinVal] = useState<"heads" | "tails" | null>(null);
  const [diceRollId, setDiceRollId] = useState<number | null>(null);
  const [coinRollId, setCoinRollId] = useState<number | null>(null);
  const [confirmFinal, setConfirmFinal] = useState<1 | 2 | null>(null);
  const [confirmAction, setConfirmAction] = useState<"draw" | "reset" | "cancel" | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const lpAudioRef = useRef<HTMLAudioElement | null>(null);
  const { showFullscreen, isFs, enterFullscreen, exitFullscreen, outerClass, innerStyle, innerClass, innerRef, rotated, overlayContainer, compact } = useDuelLayout();
  const { swapped, toggleSwapped } = useSwappedSides("quickMatchSwapped");

  useEffect(() => {
    if (!userId) return;
    setState(loadQuickMatch(userId) ?? FRESH_QUICK_MATCH);
  }, [userId]);

  // Every change is saved right away; once the match is over it's cleared instead.
  useEffect(() => {
    if (!userId || !state || winner) return;
    saveQuickMatch(userId, state);
  }, [userId, state, winner]);

  if (!state) return <div className="py-20 text-center text-muted-foreground">Loading match…</div>;

  const live = state;
  const [init1, init2] = distinctInitials(P1_NAME, P2_NAME);
  const finished = winner !== null;

  const playLpSound = () => {
    if (!lpAudioRef.current) lpAudioRef.current = new Audio("/sounds/lp-change.mp3");
    const a = lpAudioRef.current;
    a.currentTime = 0;
    a.play().catch(() => { /* autoplay blocked before any user gesture — ignore */ });
  };

  const newLog = (row: { player: 1 | 2; prev_lp: number; new_lp: number; delta: number; note?: string }): LpLogEntry => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
    note: row.note ?? null,
    player: row.player, prev_lp: row.prev_lp, new_lp: row.new_lp, delta: row.delta,
  });

  // Event notes mark game boundaries (new game, draw, LP reset).
  const eventLog = (note: string, player: 1 | 2 = 1) =>
    newLog({ player, prev_lp: live.p1_lp, new_lp: live.p1_lp, delta: 0, note });

  const withLog = (logs: LpLogEntry[], entry: LpLogEntry) => [entry, ...logs].slice(0, 200);

  const applyLp = (player: 1 | 2, newLp: number) => {
    const prev = player === 1 ? live.p1_lp : live.p2_lp;
    if (newLp !== prev) {
      playLpSound();
      setState({
        ...live,
        ...(player === 1 ? { p1_lp: newLp } : { p2_lp: newLp }),
        logs: withLog(live.logs, newLog({ player, prev_lp: prev, new_lp: newLp, delta: newLp - prev })),
      });
    }
    setCalcFor(null);
  };

  const undoLastLp = () => {
    // Only the latest entry, and never past an event note: Undo can't reach
    // back into a previous game (whose LP were already reset to 8000).
    const last = live.logs[0];
    if (!last || last.note) { duelToast.info("Nothing to undo"); return; }
    setState({
      ...live,
      ...(last.player === 1 ? { p1_lp: last.prev_lp } : { p2_lp: last.prev_lp }),
      logs: live.logs.slice(1),
    });
    duelToast.success(`Undone: ${last.player === 1 ? P1_NAME : P2_NAME} ${last.prev_lp} LP`);
  };

  const resetLp = () => {
    setState({ ...live, p1_lp: 8000, p2_lp: 8000, logs: withLog(live.logs, eventLog("Both players' LP reset to 8000.")) });
  };

  const cancelMatch = () => {
    clearQuickMatch(userId);
    toast.success("Quick match cancelled");
    navigate({ to: "/duel/new" });
  };

  const rollDice = () => {
    setDiceVal(1 + Math.floor(Math.random() * 6)); setDiceRollId(Date.now()); setDiceOpen(true);
  };
  const flipCoin = () => {
    setCoinVal(Math.random() < 0.5 ? "heads" : "tails"); setCoinRollId(Date.now()); setCoinOpen(true);
  };

  const declareWinner = (w: 1 | 2, confirmed = false) => {
    const newP1 = live.p1_wins + (w === 1 ? 1 : 0);
    const newP2 = live.p2_wins + (w === 2 ? 1 : 0);
    const isFinal = newP1 === QUICK_WINS_NEEDED || newP2 === QUICK_WINS_NEEDED;
    if (isFinal && !confirmed) { setConfirmFinal(w); return; }
    setConfirmFinal(null);
    if (isFinal) {
      // The match is over: forget it, so the next quick match starts fresh.
      clearQuickMatch(userId);
      setState({ ...live, p1_wins: newP1, p2_wins: newP2 });
      setWinner(w);
      return;
    }
    // Next game: who starts is decided by the players at the table.
    const gameNumber = newP1 + newP2 + live.draws;
    setState({
      ...live, p1_lp: 8000, p2_lp: 8000, p1_wins: newP1, p2_wins: newP2,
      logs: withLog(live.logs, eventLog(`Game ${gameNumber} won by ${w === 1 ? P1_NAME : P2_NAME}: LP reset to 8000.`, w)),
    });
  };

  const declareDraw = () => {
    const gameNumber = live.p1_wins + live.p2_wins + live.draws + 1;
    setState({
      ...live, p1_lp: 8000, p2_lp: 8000, draws: live.draws + 1,
      logs: withLog(live.logs, eventLog(`Game ${gameNumber}: draw. LP reset to 8000.`)),
    });
    duelToast.info("Draw: LP reset to 8000");
  };

  const newMatch = () => {
    setWinner(null);
    setState(FRESH_QUICK_MATCH);
  };

  // Score, halves and "wins" buttons follow the sides shown (see Swap).
  const [leftWins, rightWins] = swapped ? [live.p2_wins, live.p1_wins] : [live.p1_wins, live.p2_wins];
  const matchScore = `${leftWins} - ${rightWins}${live.draws > 0 ? ` (draws: ${live.draws})` : ""}`;
  const p1Half = (
    <PlayerHalf
      key="p1" name={P1_NAME} deck="—" lp={live.p1_lp} accent="gold"
      clickable={!finished} onClick={() => setCalcFor(1)}
    />
  );
  const p2Half = (
    <PlayerHalf
      key="p2" name={P2_NAME} deck="—" lp={live.p2_lp} accent="purple"
      clickable={!finished} onClick={() => setCalcFor(2)}
    />
  );
  const winButton = (w: 1 | 2) => (
    <Button key={w} onClick={() => declareWinner(w)} className="w-full flex-1 min-h-10 text-lg font-display font-bold px-1 bg-success/15 hover:bg-success/25 text-success border border-success/40">
      {`${w === 1 ? init1 : init2} wins`}
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
              disabled={finished}
              className="absolute top-0 right-0 h-7 w-7 grid place-items-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Reset LP"
              title="Reset LP"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <div className="flex items-center justify-center gap-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-widest px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40">not saved</span>
              {live.draws > 0 && <span className="text-[9px] uppercase tracking-widest text-muted-foreground">draws {live.draws}</span>}
            </div>
          </div>

          {/* Utility actions */}
          <div className="grid grid-cols-2 gap-1.5">
            <UtilityButton onClick={rollDice} icon={Dices} label="Die" />
            <UtilityButton onClick={flipCoin} icon={Coins} label="Coin" />
            <UtilityButton onClick={() => setLogOpen(true)} icon={ScrollText} label="Log" />
            <UtilityButton onClick={undoLastLp} disabled={finished} icon={Undo2} label="Undo" />
            <UtilityButton onClick={() => setConfirmAction("cancel")} disabled={finished} icon={XCircle} label="Cancel" />
            <UtilityButton onClick={toggleSwapped} icon={ArrowLeftRight} label="Swap" />
          </div>

          {/* Primary match actions — bigger, more prominent */}
          {!finished && (
            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              {swapped ? [winButton(2), winButton(1)] : [winButton(1), winButton(2)]}
              <Button onClick={() => setConfirmAction("draw")} variant="outline" className="w-full h-10 shrink-0 text-sm px-1">
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
              {winner === 1 ? P1_NAME : P2_NAME} wins!
            </h2>
            <div className="font-mono text-lg">{matchScore}</div>
            <div className="flex flex-col gap-2">
              <Button onClick={newMatch} className="gold-gradient text-background">New quick match</Button>
              <Button variant="outline" onClick={() => navigate({ to: "/duel/new" })}>Back to duels</Button>
            </div>
          </div>
        </div>
      )}

      {/* LP Calculator popup */}
      <LpCalculatorDialog
        open={calcFor !== null}
        onClose={() => setCalcFor(null)}
        container={overlayContainer}
        compact={compact}
        playerName={calcFor === 1 ? P1_NAME : P2_NAME}
        currentLp={calcFor === 1 ? live.p1_lp : live.p2_lp}
        onApply={(n) => calcFor && applyLp(calcFor, n)}
      />

      <DiceRollDialog container={overlayContainer} open={diceOpen} onClose={() => setDiceOpen(false)} value={diceVal} rollId={diceRollId} onReroll={rollDice} />
      <CoinFlipDialog container={overlayContainer} open={coinOpen} onClose={() => setCoinOpen(false)} value={coinVal} rollId={coinRollId} onReroll={flipCoin} />

      {/* LP log popup */}
      <LpLogDialog container={overlayContainer} open={logOpen} onClose={() => setLogOpen(false)} logs={live.logs} p1Name={P1_NAME} p2Name={P2_NAME} />

      {/* Messages shown inside the board, so they rotate with it */}
      <DuelToaster />

      {/* Confirm draw / LP reset / cancel */}
      <Dialog open={confirmAction !== null} onOpenChange={(v) => { if (!v) setConfirmAction(null); }}>
        <DialogContent container={overlayContainer} className={`border-gold/40 ${rotated ? "max-h-[95vw] overflow-y-auto" : ""}`}>
          <DialogTitle className="gold-text font-display">
            {confirmAction === "draw" ? "Confirm draw" : confirmAction === "cancel" ? "Cancel match" : "Reset LP"}
          </DialogTitle>
          <p className="text-sm">
            {confirmAction === "draw"
              ? "Confirm the draw? Both players' LP return to 8000."
              : confirmAction === "cancel"
                ? "Cancel this quick match? LP and result will be lost."
                : "Reset both players' LP to 8000?"}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Back</Button>
            <Button
              className="gold-gradient text-background"
              onClick={() => {
                const a = confirmAction;
                setConfirmAction(null);
                if (a === "draw") declareDraw();
                else if (a === "reset") resetLp();
                else if (a === "cancel") cancelMatch();
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm final winner */}
      <Dialog open={confirmFinal !== null} onOpenChange={(v) => { if (!v) setConfirmFinal(null); }}>
        <DialogContent container={overlayContainer} className={`border-gold/40 ${rotated ? "max-h-[95vw] overflow-y-auto" : ""}`}>
          <DialogTitle className="gold-text font-display">Confirm final win</DialogTitle>
          <p className="text-sm">
            You're about to close the match, awarding the win to{" "}
            <span className="font-bold text-gold">{confirmFinal === 1 ? P1_NAME : confirmFinal === 2 ? P2_NAME : ""}</span>. Confirm?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmFinal(null)}>Cancel</Button>
            <Button className="gold-gradient text-background" onClick={() => confirmFinal && declareWinner(confirmFinal, true)}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
