import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Trophy, Plus, Users, Crown } from "lucide-react";
import { toast } from "sonner";
import { buildTournamentMatches } from "@/lib/tournamentBracket";

export const Route = createFileRoute("/tournaments/")({
  component: TournamentsPage,
  head: () => ({ meta: [{ title: "Tournaments — YGO Recap" }] }),
});

type T = {
  id: string;
  name: string;
  description: string | null;
  max_players: number;
  status: "open" | "active" | "finished";
  start_date: string | null;
  creator_id: string;
  winner_id: string | null;
  format: "bracket" | "league";
};

function TournamentsPage() {
  const { user } = useAuth();
  const [list, setList] = useState<T[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "open" | "active" | "finished">("all");
  const navigate = useNavigate();

  const load = async () => {
    const { data } = await supabase
      .from("tournaments")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data as T[] | null) ?? [];
    setList(rows);
    const { data: parts } = await supabase.from("tournament_participants").select("tournament_id");
    const c: Record<string, number> = {};
    (parts ?? []).forEach((p: any) => {
      c[p.tournament_id] = (c[p.tournament_id] ?? 0) + 1;
    });
    setCounts(c);
    const winIds = rows.map((r) => r.winner_id).filter(Boolean) as string[];
    if (winIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", winIds);
      setNames(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.username])));
    } else setNames({});
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => (tab === "all" ? list : list.filter((t) => t.status === tab)),
    [list, tab],
  );

  const create = async (form: {
    name: string;
    description: string;
    start_date: string;
    format: "bracket" | "league";
    playerIds: string[];
  }) => {
    if (!user) return;
    const playerIds = form.playerIds.includes(user.id)
      ? form.playerIds
      : [...form.playerIds, user.id];
    if (playerIds.length < 2) {
      toast.error("Seleziona almeno 2 giocatori");
      return;
    }

    const { data, error } = await supabase
      .from("tournaments")
      .insert({
        name: form.name,
        description: form.description,
        max_players: playerIds.length,
        start_date: form.start_date || null,
        creator_id: user.id,
        format: form.format,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Failed");
      return;
    }

    const { error: partErr } = await supabase
      .from("tournament_participants")
      .insert(playerIds.map((uid) => ({ tournament_id: data.id, user_id: uid })));
    if (partErr) {
      toast.error(partErr.message);
      return;
    }

    const matches = buildTournamentMatches(form.format, playerIds);
    const { error: matchErr } = await supabase
      .from("tournament_matches")
      .insert(matches.map((m) => ({ tournament_id: data.id, ...m })));
    if (matchErr) {
      toast.error(matchErr.message);
      return;
    }

    setOpen(false);
    toast.success("Torneo creato — tabellone generato");
    navigate({ to: "/tournaments/$id", params: { id: data.id } });
  };

  const tabs: { k: typeof tab; label: string }[] = [
    { k: "all", label: "Tutti" },
    { k: "open", label: "Aperti" },
    { k: "active", label: "In corso" },
    { k: "finished", label: "Terminati" },
  ];

  return (
    <div className="space-y-6 py-4">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl gold-text">Tournaments</h1>
        {user && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gold-gradient text-background">
                <Plus className="h-4 w-4 mr-1" /> New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display gold-text">Create Tournament</DialogTitle>
              </DialogHeader>
              <CreateForm onSubmit={create} />
            </DialogContent>
          </Dialog>
        )}
      </header>

      <div className="flex gap-1 flex-wrap">
        {tabs.map((tt) => (
          <button
            key={tt.k}
            onClick={() => setTab(tt.k)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === tt.k ? "gold-gradient text-background" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}
          >
            {tt.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card-mystic rounded-xl p-10 text-center">
          <Trophy className="h-10 w-10 mx-auto text-gold mb-3" />
          <p className="text-muted-foreground">Nessun torneo qui.</p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link
                to="/tournaments/$id"
                params={{ id: t.id }}
                className="card-mystic rounded-xl p-4 block hover:glow-gold transition"
              >
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-display text-lg break-words">{t.name}</h3>
                  <StatusPill s={t.status} />
                </div>
                {t.winner_id && (
                  <div className="flex items-center gap-1.5 mt-2 text-sm text-gold">
                    <Crown className="h-3.5 w-3.5" />
                    <span className="font-medium">{names[t.winner_id] ?? "?"}</span>
                    <span className="text-xs text-muted-foreground">vincitore</span>
                  </div>
                )}
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {counts[t.id] ?? 0} giocatori
                  </span>
                  <span className="uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold/10 text-gold">
                    {t.format === "league" ? "Campionato" : "Elim."}
                  </span>
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
  const map = {
    open: "bg-success/20 text-success",
    active: "bg-gold/20 text-gold",
    finished: "bg-muted text-muted-foreground",
  };
  const label = { open: "Aperto", active: "In corso", finished: "Terminato" };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${map[s]}`}>
      {label[s]}
    </span>
  );
}

function CreateForm({
  onSubmit,
}: {
  onSubmit: (f: {
    name: string;
    description: string;
    start_date: string;
    format: "bracket" | "league";
    playerIds: string[];
  }) => void;
}) {
  const { user } = useAuth();
  const [f, setF] = useState<{
    name: string;
    description: string;
    start_date: string;
    format: "bracket" | "league";
  }>({
    name: "",
    description: "",
    start_date: "",
    format: "bracket",
  });
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(user ? [user.id] : []));
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, username")
      .order("username")
      .then(({ data }) => {
        setUsers((data as { id: string; username: string }[] | null) ?? []);
      });
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredUsers = useMemo(
    () => users.filter((u) => u.username.toLowerCase().includes(search.toLowerCase())),
    [users, search],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) return;
        if (selected.size < 2) {
          toast.error("Seleziona almeno 2 giocatori");
          return;
        }
        onSubmit({ ...f, playerIds: [...selected] });
      }}
      className="space-y-3"
    >
      <div>
        <Label>Name</Label>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </div>
      <div>
        <Label>Formato</Label>
        <Select
          value={f.format}
          onValueChange={(v) => setF({ ...f, format: v as "bracket" | "league" })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bracket">Eliminazione diretta</SelectItem>
            <SelectItem value="league">Campionato</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          {f.format === "bracket"
            ? "Chi perde è eliminato. Con giocatori dispari, uno avanza in automatico al turno successivo."
            : "Ogni giocatore affronta tutti gli altri (round robin). Con giocatori dispari, un turno a testa è BYE = vittoria automatica."}
        </p>
      </div>
      <div>
        <Label>Giocatori ({selected.size} selezionati)</Label>
        <Input
          placeholder="Cerca utente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        <div className="max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {filteredUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">Nessun utente trovato.</p>
          ) : (
            filteredUsers.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30"
              >
                <Checkbox
                  checked={selected.has(u.id)}
                  onCheckedChange={() => toggle(u.id)}
                  disabled={u.id === user?.id}
                />
                <span>
                  {u.username}
                  {u.id === user?.id ? " (tu)" : ""}
                </span>
              </label>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Il numero di turni e gli accoppiamenti verranno generati automaticamente (round robin /
          bracket).
        </p>
      </div>
      <div>
        <Label>Start date</Label>
        <Input
          type="datetime-local"
          value={f.start_date}
          onChange={(e) => setF({ ...f, start_date: e.target.value })}
        />
      </div>
      <Button type="submit" className="w-full gold-gradient text-background">
        Create
      </Button>
    </form>
  );
}
