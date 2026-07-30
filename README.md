# YGO Recap

A Yu-Gi-Oh! duel and tournament tracker: run a live duel from your phone while you play, log every life-point swing, and let the leaderboard and Elo ratings build themselves from the results.

Built as a full-stack side project — React 19 on TanStack Start, with Supabase as the entire backend.

**[▶ Live demo](https://ygoarenachronicles.lovable.app)** — sign up with any email to try a duel.

<!-- Add a screenshot at public/og.png and reference it here:
![YGO Recap](public/og.png)
-->

## Features

- **Live duel room** — two players open the same duel and stay in sync in real time: life points, game wins, dice and coin rolls, and a shared event feed. Best-of-3 with automatic match resolution.
- **Life-point calculator** with a full append-only log and undo.
- **Leaderboards** — win-rate ranking plus an Elo ladder computed on the fly from duel history.
- **Tournaments** — single-elimination brackets or round-robin, generated automatically from the player list; tournament matches spawn real duels that report their result back to the bracket.
- **Decks** — a fixed, admin-managed list of archetypes so stats stay comparable across players.
- **Auth and roles** — email/password sign-up, user profiles, and an admin panel.

## Stack

| Layer     | Choice                                                       |
| --------- | ------------------------------------------------------------ |
| Framework | TanStack Start (SSR) + TanStack Router, React 19             |
| Language  | TypeScript                                                   |
| Styling   | Tailwind CSS v4 (CSS-first tokens), shadcn/ui, Framer Motion |
| Backend   | Supabase — Postgres, Auth, Realtime                          |
| Build     | Vite 7                                                       |
| Hosting   | Lovable (see below)                                          |

## Architecture notes

The parts worth reading, if you're skimming the code:

**Authorization lives in the database, not the client.** There are no server functions guarding data access — the browser talks to Supabase directly and every table is protected by Row Level Security. The client-side route guard (`src/routes/_authenticated.tsx`) only redirects to the login page; it is deliberately _not_ a security boundary. Admin checks go through `public.has_role()`, a `SECURITY DEFINER STABLE` function with a pinned `search_path`, which exists specifically to avoid recursive RLS evaluation on the `user_roles` table.

**The duel room is server-authoritative shared state.** `duel_live_state` holds the mutable half of a match (life points, game wins, `last_event`) 1:1 with the `duels` row. Dice and coin rolls are not local UI state: the roller writes an event with a fresh timestamp, both clients receive the Realtime UPDATE and open the same dialog, deduped on that timestamp. A short polling loop backs up Realtime during the join handshake so a dropped message can't strand the host waiting for an opponent.

**Elo is derived, never stored.** `compute_elo_ratings()` recomputes the whole ladder per call (K=32, base 1500, casual duels excluded, counted from a fixed cutoff date). An earlier trigger-maintained rating column was reverted on purpose — recomputing kept the ratings consistent when historical duels were edited, and at this scale the cost is irrelevant. The revert is preserved in the migration history.

**Every life-point change is an event.** `duel_lp_logs` stores `prev_lp` / `new_lp` / `delta` per change, which makes undo a delete-and-restore rather than a recalculation, and leaves a readable match history for free.

## Running locally

Requires Node 20+ and a Supabase project.

```bash
npm install
cp .env.example .env    # then fill in your Supabase URL and publishable (anon) key
npm run dev             # http://localhost:3000
```

The values go in `.env` under both the `VITE_*` names (injected into the client bundle at build time) and the bare names (read during SSR). The publishable key is meant to be public — it ships in the JavaScript bundle and is only as safe as the RLS policies behind it. The service role key is **not** used by the app and must never go in `.env`.

Other scripts:

```bash
npm run build           # production build (Cloudflare Workers output)
npm test                # vitest — unit tests for the tournament pairing logic
npm run lint            # eslint — Prettier runs as a lint rule, so formatting failures are lint failures
npm run format          # prettier --write .
npx tsc --noEmit        # type-check (there is no dedicated script)
```

Tests cover `src/lib/tournamentBracket.ts` — the pure pairing logic behind both formats: that a round-robin pairs every player exactly once and hands out one bye each when the count is odd, and that a bracket pads to the next power of two, advances walkovers, and leaves later rounds empty until they are played. CI runs the type-check and the tests on every push; `npm run lint` is not gated yet because the route components still carry `any`s inherited from the generated Supabase types.

## Database

Schema lives in `supabase/migrations/`, timestamp-prefixed and applied in order. Apply them with the Supabase CLI (`supabase db push`) or by pasting them into the SQL editor in sequence.

Conventions the migrations maintain:

- RLS is enabled on every table; policies route admin checks through `public.has_role()`.
- Roles live in `user_roles`, never as a column on `profiles`.
- Tables read over Realtime need both `ALTER PUBLICATION supabase_realtime ADD TABLE` and `REPLICA IDENTITY FULL`.
- `public_profiles` is the anon-safe view over `profiles`; auth emails are reachable only through an admin-gated `SECURITY DEFINER` function.
- Admin bootstrap reads from a table in the unexposed `private` schema, seeded by hand — no email is ever hardcoded in a migration.

## Hosting and deployment

The live demo is hosted by Lovable, the platform this project was scaffolded on. That is where the app actually runs today.

The repository is also wired for Cloudflare Workers, and this is worth explaining because there are files in here that only make sense in that light. The Vite preset the project inherits registers the Cloudflare build plugin, so `npm run build` emits a Worker bundle; `wrangler.jsonc` points that bundle at `src/server.ts`, which wraps the TanStack server entry to render a branded error page instead of leaking a raw JSON 500. None of that is wired up to a Cloudflare account of mine — it came with the template and still builds cleanly, so I left it in place.

To deploy it to Workers yourself:

```bash
npm run build
npx wrangler deploy
```

Two things that are easy to miss. Worker secrets are per-Worker and do not carry over from the build: set `SUPABASE_URL`, `SUPABASE_PROJECT_ID` and `SUPABASE_PUBLISHABLE_KEY` with `npx wrangler secret put ...` rather than committing them, or the app boots and immediately fails on the missing-variable check. And add the new origin under Supabase → Authentication → URL Configuration, otherwise sign-up confirmation links keep pointing at the old domain.

## A note on origins

The project was scaffolded from a TanStack Start template and the initial UI was generated with Lovable. The application logic, database schema, RLS policies, Realtime duel synchronisation, Elo computation and tournament bracket generation are my own work — that's the part worth reviewing.

## License

MIT — see [LICENSE](LICENSE).
