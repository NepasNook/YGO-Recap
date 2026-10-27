import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { X, Maximize2, Minimize2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";

// Shared by the real duel room and the quick match: same screen, same parts.

export type LpLogEntry = { id: string; player: number; prev_lp: number; new_lp: number; delta: number; created_at: string; note: string | null };

// On a phone held upright the board is rotated to landscape with CSS (unless
// the browser lets us lock the orientation in fullscreen).
// eslint-disable-next-line react-refresh/only-export-components -- shared by both duel rooms with the components below
export function useDuelLayout() {
  const isMobile = useIsMobile();
  const [portrait, setPortrait] = useState(false);
  const [short, setShort] = useState(false);
  const [isFs, setIsFs] = useState(false);
  // iPhone Safari has no fullscreen for pages: there the button isn't shown.
  const [canFs, setCanFs] = useState(false);
  // The board element (set via innerRef): while it's rotated, sheets such as
  // the LP calculator open inside it so they are rotated to landscape too.
  const [boardEl, setBoardEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(orientation: portrait)");
    const shortMq = window.matchMedia("(max-height: 499px)");
    const cb = () => { setPortrait(mq.matches); setShort(shortMq.matches); };
    cb();
    mq.addEventListener("change", cb);
    shortMq.addEventListener("change", cb);
    setCanFs(!!document.fullscreenEnabled);
    const fsCb = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fsCb);
    return () => { mq.removeEventListener("change", cb); shortMq.removeEventListener("change", cb); document.removeEventListener("fullscreenchange", fsCb); };
  }, []);

  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      // lock() isn't in every browser's typings (Safari lacks it), hence the optional call.
      const orient = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (orient?.lock) { try { await orient.lock("landscape"); } catch { /* fallback to CSS rotation */ } }
    } catch { /* ignore */ }
  };
  const exitFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
  };

  const forceRotate = isMobile && portrait;
  // In a phone browser 100vh also counts the space under the address/tool
  // bars, so a board that wide would be cut off on both sides: use the
  // visible height (dvh) where the browser supports it.
  const visibleHeight = typeof CSS !== "undefined" && CSS.supports("height", "100dvh") ? "100dvh" : "100vh";
  // On a phone the app's menu bars are hidden in the duel (see Nav), so the
  // board takes the whole screen; elsewhere it stays below the top bar.
  const outerClass = forceRotate
    ? "fixed inset-0 z-50 bg-background overflow-hidden"
    : "fixed inset-x-0 bottom-0 top-[57px] max-md:top-0 [@media(max-height:499px)]:top-0 bg-background";
  const innerStyle: CSSProperties | undefined = forceRotate
    ? { position: "absolute", top: "50%", left: "50%", width: visibleHeight, height: "100vw", transform: "translate(-50%, -50%) rotate(90deg)", transformOrigin: "center center" }
    : undefined;
  const innerClass = forceRotate ? "flex flex-col" : "w-full h-full flex flex-col";

  const overlayContainer = forceRotate ? boardEl : null;
  // Little height to work with (rotated board, or a phone really in landscape):
  // the LP calculator switches to its compact layout.
  const compact = forceRotate || short;

  const showFullscreen = (isMobile || short) && canFs;

  return { showFullscreen, isFs, enterFullscreen, exitFullscreen, outerClass, innerStyle, innerClass, innerRef: setBoardEl, rotated: forceRotate, overlayContainer, compact };
}

// Which player sits on the left on this device: Swap trades the two sides
// (each player keeps their LP), remembered here only (the other phone keeps
// its own layout).
// eslint-disable-next-line react-refresh/only-export-components -- shared by both duel rooms with the components below
export function useSwappedSides(storageKey: string) {
  const [swapped, setSwapped] = useState(false);
  useEffect(() => {
    try { setSwapped(localStorage.getItem(storageKey) === "1"); } catch { /* storage unavailable */ }
  }, [storageKey]);
  const toggleSwapped = () => {
    const next = !swapped;
    setSwapped(next);
    try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* storage unavailable */ }
  };
  return { swapped, toggleSwapped };
}

// The duel's messages show in a toaster inside the board, so they turn with
// it while it's rotated (the app's own toaster would stay sideways). Messages
// shown right before leaving the duel keep using the plain `toast`.
const DUEL_TOASTER = "duel";
// eslint-disable-next-line react-refresh/only-export-components -- shared by both duel rooms with the components below
export const duelToast = {
  success: (msg: string) => toast.success(msg, { toasterId: DUEL_TOASTER }),
  info: (msg: string) => toast.info(msg, { toasterId: DUEL_TOASTER }),
  error: (msg: string) => toast.error(msg, { toasterId: DUEL_TOASTER }),
};

export function DuelToaster() {
  return <Toaster theme="dark" id={DUEL_TOASTER} />;
}

// Inside the board, in its corner: it turns with the board, and popups open
// above it instead of under it (it used to cover the calculator's X).
export function FullscreenButton({ show, isFs, onEnter, onExit }: {
  show: boolean; isFs: boolean; onEnter: () => void; onExit: () => void;
}) {
  if (!show) return null;
  return (
    <button
      onClick={isFs ? onExit : onEnter}
      className="absolute top-1.5 right-1.5 z-20 h-8 w-8 grid place-items-center rounded-full bg-background/80 border border-gold/40 text-gold"
      aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}
    >
      {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  );
}

export function UtilityButton({ icon: Icon, label, onClick, disabled }: {
  icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-11 rounded-md border border-border bg-card/40 hover:bg-card active:bg-card text-muted-foreground disabled:opacity-40 disabled:pointer-events-none flex flex-col items-center justify-center gap-1 transition"
    >
      <Icon className="h-5 w-5" />
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  );
}

// Animates the displayed value counting rapidly from its previous value up
// to the new one (instead of just popping in) whenever `target` changes.
function useCountingNumber(target: number, duration = 1100) {
  const [display, setDisplay] = useState(target);
  // Tracks the value currently on screen, so an interrupted animation restarts
  // from there instead of freezing mid-way (e.g. target goes 8000 → 7000 → 8000).
  const shownRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = shownRef.current;
    const to = target;
    if (from === to) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(from + (to - from) * t);
      shownRef.current = v;
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return display;
}

export function PlayerHalf({ name, deck, lp, accent, clickable, onClick }: {
  name: string; deck?: string; lp: number; accent: "gold" | "purple"; clickable: boolean; onClick: () => void;
}) {
  const grad = accent === "gold" ? "from-amber-300 to-amber-600" : "from-violet-400 to-purple-700";
  const displayLp = useCountingNumber(lp);
  return (
    // The LP sit in the exact middle of the half, as big as it allows (cqw/cqh are
    // percentages of the half's own width/height); name and hint are pinned to the edges.
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`relative [container-type:size] flex-1 min-w-0 h-full px-2 grid place-items-center overflow-hidden transition ${clickable ? "hover:bg-gold/5 active:bg-gold/10 cursor-pointer" : "cursor-default"}`}
    >
      <div className="absolute top-2 inset-x-10 text-sm uppercase tracking-widest text-muted-foreground text-center truncate">{name} · {deck ?? "—"}</div>
      <motion.div
        initial={false}
        animate={{ scale: displayLp === lp ? 1 : 1.04 }}
        className={`font-display tabular-nums bg-gradient-to-br ${grad} bg-clip-text text-transparent leading-none ${
          displayLp >= 10000 ? "text-[length:min(21cqw,55cqh)]" : "text-[length:min(27cqw,55cqh)]"
        }`}
      >
        {displayLp}
      </motion.div>
      {clickable && <div className="absolute bottom-2 inset-x-0 text-[11px] text-muted-foreground">tap for calculator</div>}
    </button>
  );
}

// The LP log as a centered popup (like the LP calculator): it never goes
// past 95% of the board, and the list scrolls inside it.
export function LpLogDialog({ open, onClose, container, logs, p1Name, p2Name }: {
  open: boolean; onClose: () => void; container?: HTMLElement | null;
  logs: LpLogEntry[]; p1Name: string; p2Name: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        container={container}
        hideClose
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Percentages are of the board while it's rotated (the dialog renders inside it).
        className="w-[95%] max-w-lg max-h-[95%] flex flex-col p-3 gap-2 rounded-lg bg-background border-gold/30"
      >
        <div className="flex items-center gap-2 shrink-0">
          <DialogTitle className="font-display gold-text">LP log</DialogTitle>
          <DialogClose
            className="ml-auto h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <LpLogList logs={logs} p1Name={p1Name} p2Name={p2Name} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LpLogList({ logs, p1Name, p2Name }: { logs: LpLogEntry[]; p1Name: string; p2Name: string }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">No Life Points changes recorded.</p>;
  }
  return (
    <ul className="space-y-2">
      {logs.map((l) => {
        const who = l.player === 1 ? p1Name : p2Name;
        const pos = l.delta > 0;
        if (l.note) {
          return (
            <li key={l.id} className="rounded-md border border-amber-400/30 bg-amber-500/5 p-2 text-sm">
              <div className="text-xs text-amber-300 uppercase tracking-widest">Event</div>
              <div className="text-sm break-words">{l.note}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{new Date(l.created_at).toLocaleTimeString()}</div>
            </li>
          );
        }
        return (
          <li key={l.id} className="rounded-md border border-gold/20 bg-background/40 p-2 text-sm flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium break-words">{who}</div>
              <div className="text-xs text-muted-foreground">
                {l.prev_lp} → {l.new_lp} LP · {new Date(l.created_at).toLocaleTimeString()}
              </div>
            </div>
            <div className={`shrink-0 font-mono font-bold ${pos ? "text-success" : "text-destructive"}`}>
              {pos ? "+" : ""}{l.delta}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- shared by both duel rooms with the components above
export function distinctInitials(a: string, b: string): [string, string] {
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
