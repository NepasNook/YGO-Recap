import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Plus, X, Pencil, Check } from "lucide-react";
import { toast } from "sonner";

type Shortcut = { id: string; label: string; delta: number; position: number };

export function LpCalculator({
  playerName,
  currentLp,
  onApply,
  onClose,
}: {
  playerName: string;
  currentLp: number;
  onApply: (newLp: number) => void;
  onClose: () => void;
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

  const append = (s: string) => setEntry((e) => (e.length >= 5 ? e : e + s));
  const clear = () => setEntry("");
  const back = () => setEntry((e) => e.slice(0, -1));

  const apply = (delta: number) => {
    const next = Math.max(0, currentLp + delta);
    onApply(next);
    setEntry("");
  };

  const compute = (operator: "+" | "-") => {
    const n = parseInt(entry || "0", 10);
    if (!n) return;
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
    if (!d || Number.isNaN(d)) {
      toast.error("Inserisci un numero valido (anche negativo)");
      return;
    }
    const { data, error } = await supabase
      .from("user_lp_shortcuts")
      .insert({ user_id: user.id, label, delta: d, position: shortcuts.length } as never)
      .select("*")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Errore");
      return;
    }
    setShortcuts((s) => [...s, data as Shortcut]);
    setNewLabel("");
    setNewDelta("");
  };

  const removeShortcut = async (id: string) => {
    await supabase.from("user_lp_shortcuts").delete().eq("id", id);
    setShortcuts((s) => s.filter((x) => x.id !== id));
  };

  const keys: { label: string; on: () => void; cls?: string }[] = [
    { label: "7", on: () => append("7") },
    { label: "8", on: () => append("8") },
    { label: "9", on: () => append("9") },
    { label: "÷2", on: halve, cls: "bg-gold/20 text-gold border border-gold/40" },
    { label: "4", on: () => append("4") },
    { label: "5", on: () => append("5") },
    { label: "6", on: () => append("6") },
    { label: "⌫", on: back, cls: "bg-muted text-foreground" },
    { label: "1", on: () => append("1") },
    { label: "2", on: () => append("2") },
    { label: "3", on: () => append("3") },
    { label: "C", on: clear, cls: "bg-destructive/80 text-destructive-foreground" },
    { label: "0", on: () => append("0") },
    { label: "00", on: () => append("00") },
    { label: "000", on: () => append("000") },
    {
      label: "−",
      on: () => compute("-"),
      cls: "bg-destructive text-destructive-foreground font-bold",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1.6fr] gap-4 max-w-4xl mx-auto">
      {/* LEFT: display, shortcuts, add button */}
      <div className="space-y-3 order-2 md:order-1">
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {playerName}
          </div>
          <motion.div
            key={currentLp}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            className="font-display text-4xl gold-text"
          >
            {currentLp} LP
          </motion.div>
        </div>

        <div className="rounded-lg bg-background/60 border border-gold/30 p-3 text-right font-mono text-3xl h-14 flex items-center justify-end">
          {entry || "0"}
        </div>

        <Button
          onClick={() => compute("+")}
          className="w-full h-12 text-base font-display bg-success/80 hover:bg-success text-background"
        >
          + Aggiungi {entry || "…"} LP
        </Button>

        {/* Custom shortcuts */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Scorciatoie
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? <Check className="h-3 w-3 mr-1" /> : <Pencil className="h-3 w-3 mr-1" />}
              {editMode ? "Fatto" : "Modifica"}
            </Button>
          </div>
          {shortcuts.length === 0 && !editMode && (
            <div className="text-xs text-muted-foreground italic">
              Nessuna scorciatoia. Clicca "Modifica" per aggiungerne.
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {shortcuts.map((s) => (
              <div key={s.id} className="relative">
                <Button
                  onClick={() => !editMode && apply(s.delta)}
                  className={`w-full h-11 text-sm font-display ${
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
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-5 w-5 grid place-items-center text-xs"
                    aria-label="Rimuovi"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {editMode && (
            <div className="flex gap-2 items-end pt-2 border-t border-border">
              <div className="flex-1">
                <label className="text-[10px] uppercase text-muted-foreground">
                  Etichetta (opz.)
                </label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="-500"
                />
              </div>
              <div className="w-24">
                <label className="text-[10px] uppercase text-muted-foreground">Delta LP</label>
                <Input
                  type="number"
                  value={newDelta}
                  onChange={(e) => setNewDelta(e.target.value)}
                  placeholder="-500"
                />
              </div>
              <Button size="sm" onClick={addShortcut} className="gold-gradient text-background">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <Button variant="outline" onClick={onClose} className="w-full">
          Chiudi
        </Button>
      </div>

      {/* RIGHT: keypad */}
      <div className="order-1 md:order-2">
        <div className="grid grid-cols-4 gap-2">
          {keys.map((k) => (
            <Button
              key={k.label}
              onClick={k.on}
              className={`h-14 text-lg font-display ${k.cls ?? "bg-card hover:bg-card/80 text-foreground border border-border"}`}
            >
              {k.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
