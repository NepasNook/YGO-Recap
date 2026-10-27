import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Trophy, Plus, Users, Crown } from "lucide-react";
import { toast } from "sonner";
import { buildTournamentMatches } from "@/lib/tournamentBracket";
import { LoginRequired } from "@/components/LoginRequired";
import { GameFormatBadge } from "@/components/GameFormatPicker";
import { GAME_FORMATS, type GameFormat } from "@/lib/gameFormat";
import { useGameFormat } from "@/hooks/use-game-format";

export const Route = createFileRoute("/tournaments/")({
  component: TournamentsPage,
  head: () => ({ meta: [{ title: "Tournaments — YGO Recap" }] }),
});

type T = { id: string; name: string; description: string | null; max_players: number; status: "open" | "active" | "finished"; start_date: string | null; creator_id: string; winner_id: string | null; format: "bracket" | "league"; game_format: GameFormat };

function TournamentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [list, setList] = useState<T[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "active" | "finished">("all");
  const [formatFilter, setFormatFilter] = useState<GameFormat | "all">("all");
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await supabase.from("tournaments").select("*").order("created_at", { ascending: false });
    const rows = (data as T[] | null) ?? [];
    setList(rows);
    // Paged: PostgREST caps each response at 1000 rows, which would silently
    // undercount players once there are many registrations overall.
    const c: Record<string, number> = {};
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: parts, error } = await supabase.from("tournament_participants").select("tournament_id").order("id").range(from, from + pageSize - 1);
      if (error || !parts) break;
      parts.forEach((p) => { c[p.tournament_id] = (c[p.tournament_id] ?? 0) + 1; });
      if (parts.length < pageSize) break;
    }
    setCounts(c);
    const winIds = rows.map((r) => r.winner_id).filter(Boolean) as string[];
    if (winIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", winIds);
      setNames(Object.fromEntries((profs ?? []).map((p) => [p.id, p.username])));
    } else setNames({});
  };
  // Tournaments are readable only once signed in: reload when the session shows up.
  useEffect(() => { load(); }, [user?.id]);

  const filtered = useMemo(
    () => list.filter((t) => (tab === "all" || t.status === tab) && (formatFilter === "all" || t.game_format === formatFilter)),
    [list, tab, formatFilter]
  );

  const create = async (form: { name: string; description: string; start_date: string; format: "bracket" | "league"; game_format: GameFormat; playerIds: string[]; maxRounds: number | null }) => {
    if (!user) return;
    const playerIds = form.playerIds.includes(user.id) ? form.playerIds : [...form.playerIds, user.id];
    if (playerIds.length < 2) { toast.error("Select at least 2 players"); return; }

    // Created as "open" and switched to "active" only once participants and
    // matches are in: if a step fails midway, the tournament page still offers
    // the "Start" button (shown for open tournaments without matches) to finish it.
    const { data, error } = await supabase.from("tournaments").insert({
      name: form.name, description: form.description, max_players: playerIds.length,
      // datetime-local has no timezone: read it as local time, store it as UTC.
      start_date: form.start_date ? new Date(form.start_date).toISOString() : null, creator_id: user.id,
      format: form.format, game_format: form.game_format, status: "open",
      matches_per_player: form.format === "league" ? form.maxRounds : null,
    }).select("id").single();
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }

    const { error: partErr } = await supabase.from("tournament_participants").insert(
      playerIds.map((uid) => ({ tournament_id: data.id, user_id: uid }))
    );
    if (partErr) { toast.error(partErr.message); navigate({ to: "/tournaments/$id", params: { id: data.id } }); return; }

    const matches = buildTournamentMatches(form.format, playerIds, form.maxRounds ?? undefined);
    const { error: matchErr } = await supabase.from("tournament_matches").insert(
      matches.map((m) => ({ tournament_id: data.id, ...m }))
    );
    if (matchErr) { toast.error(matchErr.message); navigate({ to: "/tournaments/$id", params: { id: data.id } }); return; }

    const { error: statusErr } = await supabase.from("tournaments").update({ status: "active" }).eq("id", data.id);
    if (statusErr) toast.error(statusErr.message);

    setOpen(false);
    toast.success("Tournament created — matches generated");
    navigate({ to: "/tournaments/$id", params: { id: data.id } });
  };

  const tabs: { k: typeof tab; label: string }[] = [
    { k: "all", label: "All" },
    { k: "active", label: "In progress" },
    { k: "finished", label: "Finished" },
  ];

  return (
    <div className="space-y-6 py-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl gold-text">Tournaments</h1>
        {user && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="gold-gradient text-background"><Plus className="h-4 w-4 mr-1" /> New</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-display gold-text">Create Tournament</DialogTitle></DialogHeader>
              <CreateForm onSubmit={create} />
            </DialogContent>
          </Dialog>
        )}
      </header>

      <div className="flex gap-x-4 gap-y-2 flex-wrap justify-between">
        <div className="flex gap-1 flex-wrap">
          {tabs.map((tt) => (
            <button key={tt.k} onClick={() => setTab(tt.k)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === tt.k ? "gold-gradient text-background" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}>
              {tt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {[{ value: "all" as const, label: "All formats" }, ...GAME_FORMATS].map((f) => (
            <button key={f.value} onClick={() => setFormatFilter(f.value)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${formatFilter === f.value ? "gold-gradient text-background" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!authLoading && !user ? (
        <LoginRequired message="Sign in to view tournaments." />
      ) : filtered.length === 0 ? (
        <div className="card-mystic rounded-xl p-10 text-center"><Trophy className="h-10 w-10 mx-auto text-gold mb-3" /><p className="text-muted-foreground">No tournaments here.</p></div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link to="/tournaments/$id" params={{ id: t.id }} className="card-mystic rounded-xl p-4 block hover:glow-gold transition">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-display text-lg break-words">{t.name}</h3>
                  <StatusPill s={t.status} />
                </div>
                {t.winner_id && (
                  <div className="flex items-center gap-1.5 mt-2 text-sm text-gold">
                    <Crown className="h-3.5 w-3.5" />
                    <span className="font-medium">{names[t.winner_id] ?? "?"}</span>
                    <span className="text-xs text-muted-foreground">winner</span>
                  </div>
                )}
                {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{counts[t.id] ?? 0} players</span>
                  <span className="uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/10 text-gold">{t.format === "league" ? "League" : "Elim."}</span>
                  <GameFormatBadge format={t.game_format} />
                  {t.start_date && <span>{new Date(t.start_date).toLocaleDateString()}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ s }: { s: T["status"] }) {
  const map = { open: "bg-success/20 text-success", active: "bg-gold/20 text-gold", finished: "bg-muted text-muted-foreground" };
  const label = { open: "Open", active: "In progress", finished: "Finished" };
  return <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${map[s]}`}>{label[s]}</span>;
}

function CreateForm({ onSubmit }: { onSubmit: (f: { name: string; description: string; start_date: string; format: "bracket" | "league"; game_format: GameFormat; playerIds: string[]; maxRounds: number | null }) => void }) {
  const { user } = useAuth();
  const [rememberedFormat] = useGameFormat();
  const [f, setF] = useState<{ name: string; description: string; start_date: string; format: "bracket" | "league"; game_format: GameFormat }>({
    name: "", description: "", start_date: "", format: "bracket", game_format: rememberedFormat,
  });
  // The remembered format is read after mount: start the form on it.
  useEffect(() => { setF((prev) => ({ ...prev, game_format: rememberedFormat })); }, [rememberedFormat]);
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(user ? [user.id] : []));
  const [search, setSearch] = useState("");
  const [maxRoundsInput, setMaxRoundsInput] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("id, username").order("username").then(({ data }) => {
      setUsers((data as { id: string; username: string }[] | null) ?? []);
    });
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredUsers = useMemo(
    () => users.filter((u) => u.username.toLowerCase().includes(search.toLowerCase())),
    [users, search]
  );

  const maxPossibleRounds = selected.size < 2 ? 0 : (selected.size % 2 === 0 ? selected.size - 1 : selected.size);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!f.name.trim()) return;
      if (selected.size < 2) { toast.error("Select at least 2 players"); return; }
      const parsed = parseInt(maxRoundsInput, 10);
      const maxRounds = f.format === "league" && maxRoundsInput.trim() && !Number.isNaN(parsed) && parsed > 0 ? parsed : null;
      onSubmit({ ...f, playerIds: [...selected], maxRounds });
    }} className="space-y-3">
      <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
      <div><Label>Description</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div>
        <Label>Game format</Label>
        <Select value={f.game_format} onValueChange={(v) => setF({ ...f, game_format: v as GameFormat })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {GAME_FORMATS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          All tournament duels are played with decks of this format and count toward its standings.
        </p>
      </div>
      <div>
        <Label>Format</Label>
        <Select value={f.format} onValueChange={(v) => setF({ ...f, format: v as "bracket" | "league" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bracket">Single elimination</SelectItem>
            <SelectItem value="league">League</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          {f.format === "bracket"
            ? "The loser is eliminated. With an odd number of players, one advances automatically to the next round."
            : "Every player faces all the others (round robin). With an odd number of players, each player gets one BYE round = automatic win."}
        </p>
      </div>
      {f.format === "league" && (
        <div>
          <Label>Maximum number of rounds (optional)</Label>
          <Input
            type="number" min={1} max={maxPossibleRounds || undefined}
            placeholder={maxPossibleRounds ? `Leave empty for ${maxPossibleRounds} (everyone plays everyone)` : "Leave empty for everyone plays everyone"}
            value={maxRoundsInput}
            onChange={(e) => setMaxRoundsInput(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            With fewer rounds than the maximum, not every player will face every other (with BYEs if odd).
          </p>
        </div>
      )}
      <div>
        <Label>Players ({selected.size} selected)</Label>
        <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
        <div className="max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {filteredUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">No users found.</p>
          ) : (
            filteredUsers.map((u) => (
              <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30">
                <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} disabled={u.id === user?.id} />
                <span>{u.username}{u.id === user?.id ? " (you)" : ""}</span>
              </label>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Pairings will be generated automatically (round robin / bracket).</p>
      </div>
      <div><Label>Start date</Label><Input type="datetime-local" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
      <Button type="submit" className="w-full gold-gradient text-background">Create</Button>
    </form>
  );
}
