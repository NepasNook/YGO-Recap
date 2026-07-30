
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "roles readable by all" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles public read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles admin all" ON public.profiles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Auto create profile + default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1));
  -- ensure unique
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) LOOP
    uname := uname || floor(random()*1000)::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, email) VALUES (NEW.id, uname, NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Decks
CREATE TABLE public.decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decks public read" ON public.decks FOR SELECT USING (true);
CREATE POLICY "decks owner write" ON public.decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "decks owner update" ON public.decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "decks owner delete" ON public.decks FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "decks admin all" ON public.decks FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Tournaments
CREATE TYPE public.tournament_status AS ENUM ('open','active','finished');

CREATE TABLE public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_players INT NOT NULL CHECK (max_players IN (4,8,16,32)),
  status tournament_status NOT NULL DEFAULT 'open',
  start_date TIMESTAMPTZ,
  winner_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournaments public read" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments creator insert" ON public.tournaments FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "tournaments creator update" ON public.tournaments FOR UPDATE USING (auth.uid() = creator_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "tournaments admin delete" ON public.tournaments FOR DELETE USING (auth.uid() = creator_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.tournament_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tp public read" ON public.tournament_participants FOR SELECT USING (true);
CREATE POLICY "tp self join" ON public.tournament_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tp self leave" ON public.tournament_participants FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round INT NOT NULL,
  bracket_position INT NOT NULL,
  player1_id UUID REFERENCES public.profiles(id),
  player2_id UUID REFERENCES public.profiles(id),
  winner_id UUID REFERENCES public.profiles(id),
  scheduled_time TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  duel_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tm public read" ON public.tournament_matches FOR SELECT USING (true);
CREATE POLICY "tm players or admin update" ON public.tournament_matches FOR UPDATE USING (
  auth.uid() = player1_id OR auth.uid() = player2_id OR public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.creator_id = auth.uid())
);
CREATE POLICY "tm creator or admin insert" ON public.tournament_matches FOR INSERT WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.creator_id = auth.uid())
);

-- Duels
CREATE TABLE public.duels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL REFERENCES public.profiles(id),
  player2_id UUID NOT NULL REFERENCES public.profiles(id),
  deck1_id UUID REFERENCES public.decks(id),
  deck2_id UUID REFERENCES public.decks(id),
  winner_id UUID REFERENCES public.profiles(id),
  games_p1_wins INT NOT NULL DEFAULT 0,
  games_p2_wins INT NOT NULL DEFAULT 0,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  tournament_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.duels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "duels public read" ON public.duels FOR SELECT USING (true);
CREATE POLICY "duels participant insert" ON public.duels FOR INSERT WITH CHECK (auth.uid() = player1_id OR auth.uid() = player2_id);
CREATE POLICY "duels participant update" ON public.duels FOR UPDATE USING (auth.uid() = player1_id OR auth.uid() = player2_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "duels admin delete" ON public.duels FOR DELETE USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.duel_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id UUID NOT NULL REFERENCES public.duels(id) ON DELETE CASCADE,
  game_number INT NOT NULL,
  winner_id UUID REFERENCES public.profiles(id),
  p1_final_lp INT NOT NULL DEFAULT 0,
  p2_final_lp INT NOT NULL DEFAULT 0,
  lp_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.duel_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dg public read" ON public.duel_games FOR SELECT USING (true);
CREATE POLICY "dg participant write" ON public.duel_games FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.duels d WHERE d.id = duel_id AND (auth.uid() = d.player1_id OR auth.uid() = d.player2_id))
);
CREATE POLICY "dg participant update" ON public.duel_games FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.duels d WHERE d.id = duel_id AND (auth.uid() = d.player1_id OR auth.uid() = d.player2_id OR public.has_role(auth.uid(),'admin')))
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.duels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.duel_games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Stats view
CREATE OR REPLACE VIEW public.user_stats AS
SELECT
  p.id AS user_id,
  p.username,
  COUNT(d.id) FILTER (WHERE d.winner_id IS NOT NULL) AS total_duels,
  COUNT(d.id) FILTER (WHERE d.winner_id = p.id) AS wins,
  COUNT(d.id) FILTER (WHERE d.winner_id IS NOT NULL AND d.winner_id <> p.id) AS losses,
  CASE WHEN COUNT(d.id) FILTER (WHERE d.winner_id IS NOT NULL) > 0
    THEN ROUND(100.0 * COUNT(d.id) FILTER (WHERE d.winner_id = p.id) / COUNT(d.id) FILTER (WHERE d.winner_id IS NOT NULL), 1)
    ELSE 0 END AS win_pct
FROM public.profiles p
LEFT JOIN public.duels d ON (d.player1_id = p.id OR d.player2_id = p.id)
GROUP BY p.id, p.username;
