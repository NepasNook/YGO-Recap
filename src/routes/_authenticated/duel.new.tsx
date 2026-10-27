import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Swords, Play, PartyPopper, Zap } from "lucide-react";
import { loadQuickMatch, type QuickMatchState } from "@/lib/quickMatch";
import { GAME_FORMATS, type GameFormat } from "@/lib/gameFormat";
import { useGameFormat } from "@/hooks/use-game-format";
import { GameFormatBadge } from "@/components/GameFormatPicker";
import { defaultDeckFor, fetchDefaultDecks, type DefaultDecks } from "@/lib/defaultDecks";



export const Route = createFileRoute("/_authenticated/duel/new")({
  component: DuelNew,
  head: () => ({ meta: [{ title: "New Duel — YGO Recap" }] }),
});

type Deck = { id: string; name: string; game_format: string };
type Profile = { id: string; username: string };
type ActiveDuel = { id: string; status: string; is_local: boolean; for_fun: boolean; best_of: number; game_format: string; player1_id: string; player2_id: string | null };

function DuelNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [active, setActive] = useState<ActiveDuel[]>([]);
  // Quick match in progress on this phone (it's never saved online).
  const [quick, setQuick] = useState<QuickMatchState | null>(null);

  // Single duel state
  const [gameFormat, setGameFormat] = useGameFormat();
  const [p2, setP2] = useState<string>("");
  const [deck1, setDeck1] = useState<string>("");
  const [deck2, setDeck2] = useState<string>("");
  const [forFun, setForFun] = useState(false);
  const [bestOf, setBestOf] = useState<3 | 1>(3);
  const [creating, setCreating] = useState(false);
  const [defaultDecks, setDefaultDecks] = useState<DefaultDecks | null>(null);

  useEffect(() => {
    supabase.from("decks").select("id, name, game_format").order("name").then(({ data }) => {
      setDecks((data ?? []) as Deck[]);
    });
    supabase.from("profiles").select("id, username").order("username").then(({ data }) => {
      setProfiles((data ?? []) as Profile[]);
    });
    fetchDefaultDecks().then(setDefaultDecks);
  }, []);

  useEffect(() => {
    if (user) setQuick(loadQuickMatch(user.id));
  }, [user]);

  // Each format has its own deck pool: switching format replaces the decks
  // picked for the other one with each player's default deck for the new one.
  const formatDecks = decks.filter((d) => d.game_format === gameFormat);
  const defaultDeck = (userId: string | null | undefined, f: GameFormat) =>
    defaultDecks ? defaultDeckFor(defaultDecks, userId, f, decks.filter((d) => d.game_format === f)) : "";
  const changeGameFormat = (f: GameFormat) => {
    setGameFormat(f);
    setDeck1(defaultDeck(user?.id, f));
    setDeck2(p2 ? defaultDeck(p2, f) : "");
  };
  const changeOpponent = (id: string) => {
    setP2(id);
    setDeck2(defaultDeck(id, gameFormat));
  };

  // Once decks and defaults have loaded — and whenever the format changes,
  // e.g. when the remembered one is restored — keep each picked deck if it
  // belongs to the format, otherwise fall back to that player's default.
  useEffect(() => {
    if (!defaultDecks || decks.length === 0 || !user) return;
    const inFormat = (id: string) => decks.some((d) => d.id === id && d.game_format === gameFormat);
    setDeck1((cur) => (inFormat(cur) ? cur : defaultDeck(user.id, gameFormat)));
    setDeck2((cur) => (inFormat(cur) ? cur : p2 ? defaultDeck(p2, gameFormat) : ""));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDecks, decks, user?.id, gameFormat]);

  const loadActive = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("duels")
      .select("id, status, is_local, for_fun, best_of, game_format, player1_id, player2_id")
      .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
      .neq("status", "finished")
      .is("winner_id", null)
      .order("created_at", { ascending: false })
      .limit(5);
    setActive((data ?? []) as ActiveDuel[]);
  };

  useEffect(() => {
    loadActive();
    const ch = supabase
      .channel("lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "duels" }, () => loadActive())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const startDuel = async () => {
    if (!user || !p2 || !deck1 || !deck2) {
      toast.error("Fill in all the fields"); return;
    }
    if (p2 === user.id) { toast.error("Pick an opponent other than yourself"); return; }
    setCreating(true);
    const { data, error } = await supabase.from("duels").insert({
      player1_id: user.id,
      player2_id: p2,
      deck1_id: deck1,
      deck2_id: deck2,
      status: "live",
      is_local: true,
      for_fun: forFun,
      best_of: bestOf,
      game_format: gameFormat,
    } as never).select("id").single();
    // Keep the button disabled until we've navigated away, so a second tap
    // can't create a duplicate duel in the meantime.
    if (error || !data) { setCreating(false); toast.error(error?.message ?? "Error"); return; }
    await supabase.from("duel_live_state").insert({ duel_id: data.id } as never);
    navigate({ to: "/duel/$id", params: { id: data.id } });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <h1 className="font-display text-3xl gold-text text-center">New Duel</h1>

      {/* RESUME ACTIVE DUELS */}
      {active.length > 0 && (
        <div className="card-mystic rounded-xl p-4 space-y-3 border-amber-400/50">
          <div className="flex items-center gap-2 text-amber-300">
            <Play className="h-5 w-5" />
            <span className="font-display">Duel in progress — pick up where you left off</span>
          </div>
          {active.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/40 border border-amber-400/30">
              <div className="text-sm">
                <div className="font-medium">
                  {d.best_of === 1 ? "Single Match" : "Best of 3"}
                  <GameFormatBadge format={d.game_format} className="ml-2" />
                  {d.for_fun && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-400/40">for fun</span>}
                </div>
                <div className="text-xs text-muted-foreground">Status: {d.status}</div>
              </div>
              <Button size="sm" className="gold-gradient text-background" onClick={() => navigate({ to: "/duel/$id", params: { id: d.id } })}>
                Resume
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* QUICK MATCH */}
      <div className="card-mystic rounded-xl p-4 space-y-3 border-sky-400/40">
        <div className="flex items-center gap-2 text-sky-300">
          <Zap className="h-5 w-5" />
          <span className="font-display">Quick match</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Life Points only, Best of 3: no players or decks to pick, and the match isn't saved
          and doesn't count in the stats. It stays on this phone only until the match is over.
        </p>
        {quick ? (
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background/40 border border-sky-400/30">
            <div className="text-sm">
              <div className="font-medium">Quick match in progress</div>
              <div className="text-xs text-muted-foreground">
                {quick.p1_wins} - {quick.p2_wins}{quick.draws > 0 ? ` (draws: ${quick.draws})` : ""} · LP {quick.p1_lp} / {quick.p2_lp}
              </div>
            </div>
            <Button size="sm" className="gold-gradient text-background" onClick={() => navigate({ to: "/duel/quick" })}>
              Resume
            </Button>
          </div>
        ) : (
          <Button onClick={() => navigate({ to: "/duel/quick" })} variant="outline" className="w-full border-sky-400/40 text-sky-300 hover:text-sky-200">
            <Zap className="h-4 w-4 mr-2" /> Start quick match
          </Button>
        )}
      </div>

      {/* SINGLE DUEL */}
      <div className="card-mystic rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-gold"><Swords className="h-5 w-5" /><span className="font-display">New duel</span></div>
        <div>
          <Label>Game format</Label>
          <Select value={gameFormat} onValueChange={(v) => changeGameFormat(v as GameFormat)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GAME_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Each format has its own decks and its own leaderboard.
          </p>
        </div>
        <div>
          <Label>Match type</Label>
          <Select value={String(bestOf)} onValueChange={(v) => setBestOf(v === "1" ? 1 : 3)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Best of 3</SelectItem>
              <SelectItem value="1">Single Match</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {bestOf === 3
              ? "Whoever wins 2 games out of 3 wins the duel."
              : "Winning a single game is enough to win the duel."}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Player 1 (you)</Label>
            <div className="px-3 py-2 rounded-md border border-gold/20 bg-background/40 text-sm">
              {profiles.find((p) => p.id === user?.id)?.username ?? "You"}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Deck P1</Label>
            <Select value={deck1} onValueChange={setDeck1}>
              <SelectTrigger><SelectValue placeholder="Pick a deck" /></SelectTrigger>
              <SelectContent>{formatDecks.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
            {defaultDecks && !defaultDeck(user?.id, gameFormat) && (
              <p className="text-[11px] text-muted-foreground">
                Set a default deck in your <Link to="/profile" className="text-gold hover:underline">profile</Link> to have it preselected.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Player 2</Label>
            <Select value={p2} onValueChange={changeOpponent}>
              <SelectTrigger><SelectValue placeholder="Pick an opponent" /></SelectTrigger>
              <SelectContent>
                {profiles.filter((p) => p.id !== user?.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Deck P2</Label>
            <Select value={deck2} onValueChange={setDeck2}>
              <SelectTrigger><SelectValue placeholder="Pick a deck" /></SelectTrigger>
              <SelectContent>{formatDecks.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center justify-between gap-3 p-2 rounded-md border border-pink-400/30 bg-pink-500/5 cursor-pointer">
          <span className="flex items-center gap-2 text-sm">
            <PartyPopper className="h-4 w-4 text-pink-300" />
            <span className="font-semibold text-pink-300">for fun</span> mode (doesn't count in the stats)
          </span>
          <Switch checked={forFun} onCheckedChange={setForFun} />
        </label>
        <Button onClick={startDuel} disabled={creating} className="w-full gold-gradient text-background">
          <Swords className="h-4 w-4 mr-2" /> {creating ? "Starting…" : "Start duel"}
        </Button>
      </div>
    </div>
  );
}
