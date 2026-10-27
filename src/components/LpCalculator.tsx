import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Plus, X, Pencil, Check } from "lucide-react";
import { duelToast } from "@/components/DuelBoard";

type Shortcut = { id: string; label: string; delta: number; position: number };

// Shows that a tap went through (the keys don't move or change otherwise).
const PRESS = "transition active:scale-95 active:brightness-125";

// The LP calculator as a popup that fills the board, so the keypad is as big as it can be.
export function LpCalculatorDialog({
  open,
  onClose,
  container,
  compact,
  playerName,
  currentLp,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  container?: HTMLElement | null;
  // Little room (phone): smaller text in the left column.
  compact: boolean;
  playerName: string;
  currentLp: number;
  onApply: (newLp: number) => void;
}) {
  // Keep showing the last player while the popup fades out after closing.
  const shown = useRef({ playerName, currentLp });
  if (open) shown.current = { playerName, currentLp };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        container={container}
        hideClose
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Percentages are of the board while it's rotated (the dialog renders inside it);
        // otherwise the height is of the visible screen (dvh), so on a phone the top
        // with the close button isn't hidden behind the browser's bars.
        // On a big screen it stops growing at a size that's still comfortable to use.
        // No text selection: a slightly long press on a key would select its label instead of tapping it.
        className={`w-[97%] ${container ? "h-[95%]" : "h-[95dvh]"} max-w-5xl max-h-[44rem] flex flex-col rounded-lg bg-background border-gold/30 select-none touch-manipulation ${compact ? "p-2 gap-1.5" : "p-4 gap-3"}`}
      >
        <DialogTitle className="sr-only">LP calculator</DialogTitle>
        <LpCalculator
          playerName={shown.current.playerName}
          currentLp={shown.current.currentLp}
          onApply={onApply}
          compact={compact}
        />
      </DialogContent>
    </Dialog>
  );
}

function LpCalculator({
  playerName,
  currentLp,
  onApply,
  compact,
}: {
  playerName: string;
  currentLp: number;
  onApply: (newLp: number) => void;
  compact: boolean;
}) {
  const { user } = useAuth();
  const [entry, setEntry] = useState("");
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDelta, setNewDelta] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_lp_shortcuts")
      .select("*")
      .eq("user_id", user.id)
      .order("position")
      .then(({ data }) => setShortcuts((data ?? []) as Shortcut[]));
  }, [user]);

  // A tap that can't do anything shakes the display, so it doesn't look lost.
  const [nudge, setNudge] = useState(0);
  const refuse = () => setNudge((n) => n + 1);

  const append = (s: string) => {
    if (entry.length + s.length > 5) { refuse(); return; }
    setEntry(entry + s);
  };
  const clear = () => setEntry("");

  const apply = (delta: number) => {
    const next = Math.max(0, currentLp + delta);
    onApply(next);
    setEntry("");
  };

  const compute = (operator: "+" | "-") => {
    const n = parseInt(entry || "0", 10);
    if (!n) { refuse(); return; }
    // Auto-pad with 2 zeros only for short entries (1-2 digits): "17" → 1700, "5" → 500.
    // For 3+ digits, treat the number as entered literally ("1200" → 1200).
    const amount = entry.length <= 2 ? n * 100 : n;
    if (operator === "-") {
      apply(-Math.min(amount, currentLp));
    } else {
      apply(amount);
    }
  };

  const halve = () => onApply(Math.round(currentLp / 2));

  const addShortcut = async () => {
    if (!user) return;
    const d = parseInt(newDelta, 10);
    const label = newLabel.trim() || (d > 0 ? `+${d}` : `${d}`);
    if (!d || Number.isNaN(d)) { duelToast.error("Enter a valid number (negative values allowed)"); return; }
    const { data, error } = await supabase
      .from("user_lp_shortcuts")
      .insert({ user_id: user.id, label, delta: d, position: shortcuts.length } as never)
      .select("*").single();
    if (error || !data) { duelToast.error(error?.message ?? "Error"); return; }
    setShortcuts((s) => [...s, data as Shortcut]);
    setNewLabel(""); setNewDelta("");
  };

  const removeShortcut = async (id: string) => {
    await supabase.from("user_lp_shortcuts").delete().eq("id", id);
    setShortcuts((s) => s.filter((x) => x.id !== id));
  };

  // 4 rows: "−" takes two of them in the last column, beside 1-2-3 and 0-00-000.
  const keys: { label: string; on: () => void; cls?: string }[] = [
    { label: "7", on: () => append("7") },
    { label: "8", on: () => append("8") },
    { label: "9", on: () => append("9") },
    { label: "C", on: clear, cls: "bg-destructive/80 text-destructive-foreground" },
    { label: "4", on: () => append("4") },
    { label: "5", on: () => append("5") },
    { label: "6", on: () => append("6") },
    { label: "÷2", on: halve, cls: "bg-gold/20 text-gold border border-gold/40" },
    { label: "1", on: () => append("1") },
    { label: "2", on: () => append("2") },
    { label: "3", on: () => append("3") },
    { label: "−", on: () => compute("-"), cls: "row-span-2 bg-destructive text-destructive-foreground font-bold" },
    { label: "0", on: () => append("0") },
    { label: "00", on: () => append("00") },
    { label: "000", on: () => append("000") },
  ];

  const btn = compact ? "h-10 text-sm" : "h-12 text-base";
  const input = compact ? "h-9" : "h-10";

  return (
    <>
      {/* Header: player and LP, then the Close button */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="text-xs uppercase tracking-widest text-muted-foreground truncate">{playerName}</span>
        <motion.span key={currentLp} initial={{ scale: 1.1 }} animate={{ scale: 1 }} className={`font-display gold-text whitespace-nowrap ${compact ? "text-xl" : "text-3xl"}`}>
          {currentLp} LP
        </motion.span>
        {/* A wide button rather than a small X in the corner: easy to hit with a thumb. */}
        <DialogClose
          className={`ml-auto shrink-0 flex items-center justify-center gap-2 rounded-lg border border-gold/40 bg-card text-foreground font-display uppercase tracking-wider hover:bg-muted active:bg-muted ${PRESS} ${
            compact ? "h-11 min-w-[9rem] px-4 text-base" : "h-12 min-w-[11rem] px-5 text-lg"
          }`}
        >
          <X className="h-5 w-5" />
          Close
        </DialogClose>
      </div>

      <div className={`flex-1 min-h-0 grid grid-cols-[1fr_2.5fr] ${compact ? "gap-2" : "gap-4"}`}>
        {/* LEFT: display, add button, shortcuts (scrolls if they don't fit) */}
        <div className="min-w-0 min-h-0 overflow-y-auto space-y-1.5">
          <motion.div
            key={nudge}
            animate={{ x: nudge ? [0, -6, 6, -4, 4, 0] : 0 }}
            transition={{ duration: 0.3 }}
            className={`rounded-lg bg-background/60 border border-gold/30 text-right font-mono flex items-center justify-end px-2 ${compact ? "h-11 text-2xl" : "h-14 text-3xl"}`}
          >
            {entry || "0"}
          </motion.div>

          <Button
            onClick={() => compute("+")}
            className={`w-full px-1.5 whitespace-normal leading-tight font-display bg-success/80 hover:bg-success text-background ${PRESS} ${btn}`}
          >
            + Add {entry || "…"} LP
          </Button>

          {/* Custom shortcuts */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground truncate">Shortcuts</div>
              <Button size="sm" variant="ghost" className={`h-8 px-2 text-xs shrink-0 ${PRESS}`} onClick={() => setEditMode((v) => !v)}>
                {editMode ? <Check className="h-3 w-3 mr-1" /> : <Pencil className="h-3 w-3 mr-1" />}
                {editMode ? "Done" : "Edit"}
              </Button>
            </div>
            {shortcuts.length === 0 && !editMode && (
              <div className="text-xs text-muted-foreground italic">No shortcuts yet. Click "Edit" to add some.</div>
            )}
            {/* The padding leaves room for the remove badges. */}
            <div className="grid grid-cols-2 gap-1.5 pt-2 pr-2 -mt-2">
              {shortcuts.map((s) => (
                <div key={s.id} className="relative">
                  <Button
                    onClick={() => !editMode && apply(s.delta)}
                    className={`w-full px-1 font-display ${PRESS} ${btn} ${
                      s.delta < 0
                        ? "bg-destructive/80 hover:bg-destructive text-destructive-foreground"
                        : "bg-success/80 hover:bg-success text-background"
                    }`}
                  >
                    {s.label}
                  </Button>
                  {editMode && (
                    <button
                      onClick={() => removeShortcut(s.id)}
                      className={`absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full h-6 w-6 grid place-items-center text-xs ${PRESS}`}
                      aria-label="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {editMode && (
              // The column is narrow: the label gets its own row, delta and + share the next.
              <div className="flex flex-wrap gap-1.5 items-end pt-1.5 border-t border-border">
                <div className="basis-full min-w-0">
                  <label className="text-[10px] uppercase text-muted-foreground">Label (optional)</label>
                  {/* select-text: Safari won't let you type in a field that can't be selected */}
                  <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="-500" className={`select-text ${input}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] uppercase text-muted-foreground">Delta LP</label>
                  <Input type="number" value={newDelta} onChange={(e) => setNewDelta(e.target.value)} placeholder="-500" className={`select-text ${input}`} />
                </div>
                <Button size="sm" onClick={addShortcut} className={`gold-gradient text-background px-2.5 ${PRESS} ${input}`}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: keypad, filling all the height left. The digits scale with it
            (cqw/cqh are percentages of the keypad's own width/height). */}
        <div className={`[container-type:size] min-h-0 grid grid-cols-4 grid-rows-4 ${compact ? "gap-1.5" : "gap-2.5"}`}>
          {keys.map((k) => (
            <Button
              key={k.label}
              onClick={k.on}
              className={`h-full px-0 font-display text-[length:min(9cqw,13cqh)] ${PRESS} ${k.cls ?? "bg-card hover:bg-card/80 text-foreground border border-border"}`}
            >
              {k.label}
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}
