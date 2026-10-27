import { GAME_FORMATS, gameFormatLabel, type GameFormat } from "@/lib/gameFormat";

// Segmented GOAT / EDISON switch for pages that show one format at a time.
export function GameFormatTabs({ value, onChange, className = "" }: { value: GameFormat; onChange: (f: GameFormat) => void; className?: string }) {
  return (
    <div className={`inline-flex gap-1 p-1 rounded-lg bg-muted/40 ${className}`}>
      {GAME_FORMATS.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => onChange(f.value)}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold tracking-wider transition ${value === f.value ? "gold-gradient text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export function GameFormatBadge({ format, className = "" }: { format: string | null | undefined; className?: string }) {
  const edison = format === "edison";
  return (
    <span className={`text-[9px] uppercase tracking-widest px-1 py-0.5 rounded border ${edison ? "bg-sky-500/15 text-sky-300 border-sky-400/40" : "bg-gold/10 text-gold border-gold/30"} ${className}`}>
      {gameFormatLabel(format)}
    </span>
  );
}
