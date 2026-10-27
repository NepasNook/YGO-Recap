
# Piano

## 1. Admin non visibile — fix immediato
**Causa trovata:** nella tabella `user_roles`, l'account dell'admin ha solo `role = 'user'`, manca la riga `admin`. Per questo `isAdmin` resta `false` e la voce "Admin" nel menu non compare.

**Azione:** migration che inserisce `('<tuo-uid>', 'admin')` in `user_roles`. Inoltre aggiungo un trigger che, ogni volta che si registra un utente con l'email dell'admin, gli assegna automaticamente `admin` (così se rifai login da zero non perdi il ruolo).

Dopo questa migration la voce "Admin" comparirà subito nel menu (mobile + desktop) e la pagina `/admin` esistente sarà accessibile.

## 2. Calcolatrice LP — riscrittura
Sostituisco l'attuale UI con una calcolatrice "vera" stile Yu-Gi-Oh:

- Tastierino numerico 0–9 + `00` + `000` (tipico LP YGO)
- Operatori: `+`, `−`, `=`, `C` (clear), `⌫` (backspace)
- Tasto speciale **`÷2`** che dimezza gli LP correnti del giocatore selezionato (arrotondamento standard `Math.round`)
- Display grande sempre visibile (numero in input + LP correnti)
- Pulsanti grandi, layout 4×N adatto al touch su mobile

## 3. Schermata duello — split orizzontale
Riprogetto `/duel/$id`:

```text
┌──────────────────────────┐
│  Giocatore 1 (in alto)   │
│  Nome · Deck · LP grandi │
│  [tap per calcolatrice]  │
├──────────────────────────┤
│  Giocatore 2 (in basso)  │
│  Nome · Deck · LP grandi │
│  [tap per calcolatrice]  │
└──────────────────────────┘
   Barra azioni: 🎲 dado · 🪙 moneta · Game W/L · Fine duello
```

Tap su un riquadro → si apre un **bottom-sheet** con la calcolatrice riferita a quel giocatore. Conferma applica il delta agli LP. Tutto entra in una schermata senza scroll.

## 4. Dado e moneta — animazione popup
Quando premi 🎲 o 🪙:
- Si apre un Dialog con backdrop scuro (blur)
- Animazione: dado 3D che ruota (CSS transforms su 6 facce) per ~1.5s prima di fermarsi sul risultato; moneta che gira sull'asse X
- Risultato grande al centro, pulsante "Chiudi"
- Il risultato viene salvato nel duello (per sincronizzarlo all'avversario nel multiplayer)

## 5. Duello live multiplayer
Nuovo flusso lobby + sync realtime:

**Hosting:**
- L'host crea il duello scegliendo SOLO il proprio deck → stato `waiting_opponent`, `player2_id = NULL`
- Compare nella nuova sezione **"Duelli aperti"** della pagina `/duel/new` (lista live aggiornata via Supabase Realtime)

**Join:**
- Un altro utente clicca "Entra" → viene registrato come `pending_join` (richiesta in attesa)
- L'host vede un toast/Dialog: *"X vuole entrare. Accetta / Rifiuta"*
- Se accettato → `player2_id` impostato, stato `live`, l'avversario sceglie il deck e si entra nel duello
- Se rifiutato → richiesta cancellata

**Sincronizzazione live:**
- Tabella `duel_live_state` (LP correnti dei due giocatori, ultimo dado/moneta, game wins) aggiornata in tempo reale
- Realtime: entrambi i client ricevono `postgres_changes` e aggiornano UI
- Entrambi possono modificare LP del proprio E dell'avversario (utile per fix), animazione di flash sul valore appena cambiato dall'altro
- Animazioni dado/moneta visibili a entrambi (il risultato viene scritto su `duel_live_state.last_roll` con timestamp → l'altro client mostra lo stesso popup)

## Dettagli tecnici

### Database (migration)
- `INSERT` ruolo admin per l'utente esistente
- Trigger `auto_admin_armando` su `auth.users` per assegnare admin all'email specifica
- Aggiungo colonne a `duels`:
  - `status text` (`waiting_opponent` | `pending_join` | `live` | `finished`)
  - `pending_join_user_id uuid`
- Nuova tabella `duel_live_state` (1:1 con duels):
  - `duel_id uuid PK`, `p1_lp int`, `p2_lp int`, `p1_wins int`, `p2_wins int`
  - `last_event jsonb` (`{type:'dice'|'coin', value, by, at}`)
- RLS: read pubblico, update solo per i due partecipanti o admin
- Aggiungo le tabelle interessate a `supabase_realtime` publication + `REPLICA IDENTITY FULL`

### Frontend
- `src/components/LpCalculator.tsx` — nuova calcolatrice (riusabile)
- `src/components/DiceRollDialog.tsx` + `CoinFlipDialog.tsx` — popup animati
- `src/routes/_authenticated/duel.$id.tsx` — riscritto con split + sheet + realtime subscription
- `src/routes/_authenticated/duel.new.tsx` — aggiunta sezione "Duelli aperti" + bottone "Hosta duello"
- Hook `useDuelRealtime(duelId)` per gestire subscription + aggiornamenti ottimistici

### Note
- Il `÷2` usa `Math.round(lp/2)` (standard, come da tua scelta)
- L'admin panel attuale resta com'è (già completo dopo le ultime modifiche); questo piano sblocca solo la visibilità del menu
- Non tocco styling globale: riuso i token già definiti (`gold`, `background`)
