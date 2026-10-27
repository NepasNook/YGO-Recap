import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { User } from "lucide-react";

// 3D dice: a real cube with 6 pip faces. The cube rotates wildly, then settles
// into the orientation matching the rolled value.
const FACE_ROTATIONS: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },       // front
  6: { x: 0, y: 180 },     // back
  3: { x: 0, y: -90 },     // right
  4: { x: 0, y: 90 },      // left
  2: { x: -90, y: 0 },     // top
  5: { x: 90, y: 0 },      // bottom
};

function Pip({ className = "" }: { className?: string }) {
  return <span className={`block h-2.5 w-2.5 rounded-full bg-background shadow-inner ${className}`} />;
}

function FaceContent({ n }: { n: number }) {
  // 3x3 grid layout per face
  const slots = Array.from({ length: 9 }, (_, i) => i);
  const positions: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const active = new Set(positions[n]);
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1 h-full w-full p-3">
      {slots.map((i) => (
        <div key={i} className="flex items-center justify-center">
          {active.has(i) && <Pip />}
        </div>
      ))}
    </div>
  );
}

function Dice3D({ value, rolling }: { value: number | null; rolling: boolean }) {
  const size = 112; // px
  const half = size / 2;
  const [targetRot, setTargetRot] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (value === null) {
      setTargetRot({ x: 0, y: 0 });
    } else {
      const t = FACE_ROTATIONS[value] || { x: 0, y: 0 };
      setTargetRot({ x: 360 * 4 + t.x, y: 360 * 5 + t.y });
    }
  }, [value]);

  const faceBase = "absolute inset-0 rounded-lg border-2 border-amber-700/60 shadow-[inset_0_0_20px_rgba(0,0,0,0.4)] bg-gradient-to-br from-amber-300 to-amber-500";

  return (
    <div style={{ perspective: 700 }} className="flex items-center justify-center h-40 w-40">
      <motion.div
        animate={{ rotateX: targetRot.x, rotateY: targetRot.y }}
        transition={{ duration: rolling ? 1.6 : 0, ease: rolling ? [0.2, 0.7, 0.3, 1] : "linear" }}
        style={{ width: size, height: size, transformStyle: "preserve-3d", position: "relative" }}
      >
        <div className={faceBase} style={{ transform: `translateZ(${half}px)` }}><FaceContent n={1} /></div>
        <div className={faceBase} style={{ transform: `rotateY(180deg) translateZ(${half}px)` }}><FaceContent n={6} /></div>
        <div className={faceBase} style={{ transform: `rotateY(90deg) translateZ(${half}px)` }}><FaceContent n={3} /></div>
        <div className={faceBase} style={{ transform: `rotateY(-90deg) translateZ(${half}px)` }}><FaceContent n={4} /></div>
        <div className={faceBase} style={{ transform: `rotateX(90deg) translateZ(${half}px)` }}><FaceContent n={2} /></div>
        <div className={faceBase} style={{ transform: `rotateX(-90deg) translateZ(${half}px)` }}><FaceContent n={5} /></div>
      </motion.div>
    </div>
  );
}

// `rollId` identifies each throw, so a reroll that lands on the same value
// still replays the animation.
export function DiceRollDialog({
  open, onClose, value, onReroll, rollId, container,
}: { open: boolean; onClose: () => void; value: number | null; onReroll?: () => void; rollId?: number | null; container?: HTMLElement | null }) {
  const [rolling, setRolling] = useState(true);
  const [rollKey, setRollKey] = useState(0);
  useEffect(() => {
    if (open) {
      setRolling(true);
      setRollKey(k => k + 1);
      const t = setTimeout(() => setRolling(false), 1600);
      return () => clearTimeout(t);
    }
  }, [open, value, rollId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent container={container} className={`bg-background/95 backdrop-blur-xl border-gold/40 max-w-sm ${container ? "max-h-[95vw] overflow-y-auto" : ""}`}>
        <DialogTitle className="text-center font-display gold-text">Roll the die</DialogTitle>
        <button
          type="button"
          onClick={() => { if (!rolling && onReroll) onReroll(); }}
          disabled={rolling || !onReroll}
          className="flex items-center justify-center py-6 w-full cursor-pointer disabled:cursor-default focus:outline-none"
          aria-label="Roll the die again"
        >
          <Dice3D key={rollKey} value={value} rolling={rolling} />
        </button>
        {!rolling && value !== null && (
          <div className="text-center text-muted-foreground text-sm">
            Result: <span className="text-gold font-bold text-2xl">{value}</span>
            {onReroll && <div className="text-xs text-muted-foreground/70 mt-1">Tap the die to roll again</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Coin3D({ value, flipping }: { value: "heads" | "tails" | null; flipping: boolean }) {
  const size = 144; // px
  const thickness = 14; // edge depth in px
  const half = thickness / 2;
  const segments = 36;

  const [targetRot, setTargetRot] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (value === null) {
      setTargetRot({ x: 0, y: 0 });
    } else {
      setTargetRot({ x: 360 * 4 + (value === "tails" ? 180 : 0), y: 720 });
    }
  }, [value]);

  const faceBase =
    "absolute inset-0 rounded-full grid place-items-center " +
    "bg-[radial-gradient(circle_at_30%_25%,#fde68a_0%,#f5c542_35%,#b8860b_75%,#6b4a06_100%)] " +
    "border-2 border-amber-900/60 " +
    "shadow-[inset_0_0_24px_rgba(120,70,0,0.55),inset_0_0_4px_rgba(255,240,180,0.8)]";

  return (
    <div style={{ perspective: 900 }} className="flex items-center justify-center h-44 w-44">
      <motion.div
        animate={{ rotateX: targetRot.x, rotateY: targetRot.y }}
        transition={{ duration: flipping ? 1.6 : 0, ease: flipping ? [0.2, 0.7, 0.3, 1] : "linear" }}
        style={{ width: size, height: size, transformStyle: "preserve-3d", position: "relative" }}
      >
        {/* Heads face */}
        <div className={faceBase} style={{ transform: `translateZ(${half}px)` }}>
          <div className="flex flex-col items-center text-amber-950 drop-shadow-[0_1px_0_rgba(255,240,180,0.6)]">
            <User className="h-9 w-9" strokeWidth={2.5} />
            <span className="font-display text-[10px] tracking-[0.3em] mt-1">HEADS</span>
          </div>
        </div>
        {/* Tails face (rotated so it shows correctly when flipped) */}
        <div className={faceBase} style={{ transform: `rotateX(180deg) translateZ(${half}px)` }}>
          <div className="flex flex-col items-center text-amber-950 drop-shadow-[0_1px_0_rgba(255,240,180,0.6)]">
            <span className="font-display text-3xl leading-none">✦</span>
            <span className="font-display text-[10px] tracking-[0.3em] mt-1">TAILS</span>
          </div>
        </div>
        {/* Edge: a ring of thin segments around the rim to create thickness */}
        {Array.from({ length: segments }).map((_, i) => {
          const angle = (360 / segments) * i;
          return (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 bg-gradient-to-b from-amber-700 via-amber-500 to-amber-800"
              style={{
                width: thickness,
                height: (Math.PI * size) / segments + 1,
                marginLeft: -thickness / 2,
                marginTop: -((Math.PI * size) / segments + 1) / 2,
                transform: `rotateX(90deg) rotateY(${angle}deg) translateZ(${size / 2}px)`,
                transformStyle: "preserve-3d",
              }}
            />
          );
        })}
      </motion.div>
    </div>
  );
}

export function CoinFlipDialog({
  open, onClose, value, onReroll, rollId, container,
}: { open: boolean; onClose: () => void; value: "heads" | "tails" | null; onReroll?: () => void; rollId?: number | null; container?: HTMLElement | null }) {
  const [flipping, setFlipping] = useState(true);
  const [flipKey, setFlipKey] = useState(0);
  useEffect(() => {
    if (open) {
      setFlipping(true);
      setFlipKey(k => k + 1);
      const t = setTimeout(() => setFlipping(false), 1600);
      return () => clearTimeout(t);
    }
  }, [open, value, rollId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent container={container} className={`bg-background/95 backdrop-blur-xl border-gold/40 max-w-sm ${container ? "max-h-[95vw] overflow-y-auto" : ""}`}>
        <DialogTitle className="text-center font-display gold-text">Flip a coin</DialogTitle>
        <button
          type="button"
          onClick={() => { if (!flipping && onReroll) onReroll(); }}
          disabled={flipping || !onReroll}
          className="flex items-center justify-center py-6 w-full cursor-pointer disabled:cursor-default focus:outline-none"
          aria-label="Flip the coin again"
        >
          <Coin3D key={flipKey} value={value} flipping={flipping} />
        </button>
        {!flipping && value && (
          <div className="text-center text-muted-foreground text-sm">
            Result: <span className="text-gold font-bold text-lg">{value === "heads" ? "Heads" : "Tails"}</span>
            {onReroll && <div className="text-xs text-muted-foreground/70 mt-1">Tap the coin to flip again</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
