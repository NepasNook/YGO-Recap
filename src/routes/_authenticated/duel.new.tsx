import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Swords, Users, Radio, Home, PartyPopper, Play } from "lucide-react";

export const Route = createFileRoute("/_authenticated/duel/new")({
  component: DuelNew,
  head: () => ({ meta: [{ title: "New Duel — YGO Recap" }] }),
});

type Deck = { id: string; name: string };
type Profile = { id: string; username: string };
type OpenDuel = {
  id: string;
  player1_id: string;
  deck1_id: string | null;
  created_at: string;
  for_fun?: boolean;
};
type ActiveDuel = {
  id: string;
  status: string;
  is_local: boolean;
  for_fun: boolean;
  player1_id: string;
  player2_id: string | null;
};

function DuelNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [myDeck, setMyDeck] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<OpenDuel[]>([]);
  const [hostNames, setHostNames] = useState<Record<string, string>>({});
  const [deckNames, setDeckNames] = useState<Record<string, string>>({});
  const [hostForFun, setHostForFun] = useState(false);
  const [active, setActive] = useState<ActiveDuel[]>([]);

  // Local duel state
  const [localP2, setLocalP2] = useState<string>("");
  const [localDeck1, setLocalDeck1] = useState<string>("");
  const [localDeck2, setLocalDeck2] = useState<string>("");
  const [localForFun, setLocalForFun] = useState(false);
  const [creatingLocal, setCreatingLocal] = useState(false);

  useEffect(() => {
    supabase
      .from("decks")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        const d = (data ?? []) as Deck[];
        setDecks(d);
        setDeckNames(Object.fromEntries(d.map((x) => [x.id, x.name])));
      });
    supabase
      .from("profiles")
      .select("id, username")
      .order("username")
      .then(({ data }) => {
        setProfiles((data ?? []) as Profile[]);
      });
  }, []);

  const loadOpen = async () => {
    const { data } = await supabase
      .from("duels")
      .select("id, player1_id, deck1_id, created_at, status, player2_id, for_fun")
      .eq("status", "waiting_opponent")
      .is("player2_id", null)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as OpenDuel[];
    setOpen(list);
    if (list.length) {
      const ids = Array.from(new Set(list.map((d) => d.player1_id)));
      const { data: ps } = await supabase.from("profiles").select("id, username").in("id", ids);
      setHostNames(Object.fromEntries((ps ?? []).map((p) => [p.id, p.username])));
    }
  };

  const loadActive = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("duels")
      .select("id, status, is_local, for_fun, player1_id, player2_id")
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .neq("status", "finished")
      .is("winner_id", null)
      .order("created_at", { ascending: false })
      .limit(5);
    setActive((data ?? []) as ActiveDuel[]);
  };

  useEffect(() => {
    loadOpen();
    loadActive();
    const ch = supabase
      .channel("lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "duels" }, () => {
        loadOpen();
        loadActive();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const host = async () => {
    if (!user || !myDeck) {
      toast.error("Scegli il tuo deck");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("duels")
      .insert({
        player1_id: user.id,
        deck1_id: myDeck,
        status: "waiting_opponent",
        for_fun: hostForFun,
      } as never)
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(error?.message ?? "Errore");
      return;
    }
    await supabase.from("duel_live_state").insert({ duel_id: data.id } as never);
    navigate({ to: "/duel/$id", params: { id: data.id } });
  };

  const requestJoin = async (duelId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("duels")
      .update({ pending_join_user_id: user.id } as never)
      .eq("id", duelId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Richiesta inviata, attendi che l'host accetti");
    navigate({ to: "/duel/$id", params: { id: duelId } });
  };

  const startLocal = async () => {
    if (!user || !localP2 || !localDeck1 || !localDeck2) {
      toast.error("Compila tutti i campi");
      return;
    }
    if (localP2 === user.id) {
      toast.error("Scegli un avversario diverso da te");
      return;
    }
    setCreatingLocal(true);
    const { data, error } = await supabase
      .from("duels")
      .insert({
        player1_id: user.id,
        player2_id: localP2,
        deck1_id: localDeck1,
        deck2_id: localDeck2,
        status: "live",
        is_local: true,
        for_fun: localForFun,
      } as never)
      .select("id")
      .single();
    setCreatingLocal(false);
    if (error || !data) {
      toast.error(error?.message ?? "Errore");
      return;
    }
    await supabase.from("duel_live_state").insert({ duel_id: data.id } as never);
    navigate({ to: "/duel/$id", params: { id: data.id } });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <h1 className="font-display text-3xl gold-text text-center">Nuovo Duello</h1>

      {/* RESUME ACTIVE DUELS */}
      {active.length > 0 && (
        <div className="card-mystic rounded-xl p-4 space-y-3 border-amber-400/50">
          <div className="flex items-center gap-2 text-amber-300">
            <Play className="h-5 w-5" />
            <span className="font-display">Duello in corso — riprendi da dove avevi lasciato</span>
          </div>
          {active.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/40 border border-amber-400/30"
            >
              <div className="text-sm">
                <div className="font-medium">
                  {d.is_local
                    ? "Duello locale"
                    : d.player2_id
                      ? "Duello live"
                      : "In attesa di avversario"}
                  {d.for_fun && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-400/40">
                      for fun
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">Stato: {d.status}</div>
              </div>
              <Button
                size="sm"
                className="gold-gradient text-background"
                onClick={() => navigate({ to: "/duel/$id", params: { id: d.id } })}
              >
                Riprendi
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* LOCAL */}
      <div className="card-mystic rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-gold">
          <Home className="h-5 w-5" />
          <span className="font-display">Duello locale (un dispositivo)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Giocatore 1 (tu)</Label>
            <div className="px-3 py-2 rounded-md border border-gold/20 bg-background/40 text-sm">
              {profiles.find((p) => p.id === user?.id)?.username ?? "Tu"}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Deck P1</Label>
            <Select value={localDeck1} onValueChange={setLocalDeck1}>
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
          </div>
          <div className="space-y-2">
            <Label>Giocatore 2</Label>
            <Select value={localP2} onValueChange={setLocalP2}>
              <SelectTrigger>
                <SelectValue placeholder="Scegli avversario" />
              </SelectTrigger>
              <SelectContent>
                {profiles
                  .filter((p) => p.id !== user?.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.username}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Deck P2</Label>
            <Select value={localDeck2} onValueChange={setLocalDeck2}>
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
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 p-2 rounded-md border border-pink-400/30 bg-pink-500/5 cursor-pointer">
          <span className="flex items-center gap-2 text-sm">
            <PartyPopper className="h-4 w-4 text-pink-300" />
            Modalità <span className="font-semibold text-pink-300">for fun</span> (non conta nelle
            statistiche)
          </span>
          <Switch checked={localForFun} onCheckedChange={setLocalForFun} />
        </label>
        <Button
          onClick={startLocal}
          disabled={creatingLocal}
          className="w-full gold-gradient text-background"
        >
          <Swords className="h-4 w-4 mr-2" /> {creatingLocal ? "Avvio…" : "Inizia duello locale"}
        </Button>
      </div>

      {/* HOST ONLINE */}
      <div className="card-mystic rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-gold">
          <Radio className="h-5 w-5" />
          <span className="font-display">Hosta un duello live</span>
        </div>
        <div className="space-y-2">
          <Label>Il tuo deck</Label>
          <Select value={myDeck} onValueChange={setMyDeck}>
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
        </div>
        <label className="flex items-center justify-between gap-3 p-2 rounded-md border border-pink-400/30 bg-pink-500/5 cursor-pointer">
          <span className="flex items-center gap-2 text-sm">
            <PartyPopper className="h-4 w-4 text-pink-300" />
            Modalità <span className="font-semibold text-pink-300">for fun</span> (non conta nelle
            statistiche)
          </span>
          <Switch checked={hostForFun} onCheckedChange={setHostForFun} />
        </label>
        <Button onClick={host} disabled={creating} className="w-full gold-gradient text-background">
          <Swords className="h-4 w-4 mr-2" /> {creating ? "Apertura…" : "Apri duello"}
        </Button>
      </div>

      {/* OPEN DUELS */}
      <div className="card-mystic rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-gold">
          <Users className="h-5 w-5" />
          <span className="font-display">Duelli aperti</span>
        </div>
        {open.length === 0 && (
          <div className="text-sm text-muted-foreground">Nessun duello aperto al momento.</div>
        )}
        {open.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/40 border border-gold/20"
          >
            <div>
              <div className="font-medium flex items-center gap-2">
                {hostNames[d.player1_id] ?? "…"}
                {d.for_fun && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-400/40">
                    for fun
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Deck: {d.deck1_id ? (deckNames[d.deck1_id] ?? "?") : "—"}
              </div>
            </div>
            {user?.id === d.player1_id ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate({ to: "/duel/$id", params: { id: d.id } })}
              >
                Apri
              </Button>
            ) : (
              <Button
                size="sm"
                className="gold-gradient text-background"
                onClick={() => requestJoin(d.id)}
              >
                Entra
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
