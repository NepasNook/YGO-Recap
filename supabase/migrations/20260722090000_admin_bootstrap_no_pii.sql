-- Bootstrap del ruolo admin senza dati personali nel repository.
-- Chi si registra con un indirizzo presente in private.admin_bootstrap_emails
-- riceve automaticamente il ruolo 'admin', in aggiunta al ruolo 'user' di default.
--
-- L'elenco degli indirizzi e' un DATO del database, non codice: va popolato una
-- volta sola dallo SQL Editor di Supabase (comando da NON versionare):
--   INSERT INTO private.admin_bootstrap_emails (email)
--   VALUES ('<indirizzo-admin>') ON CONFLICT DO NOTHING;
--
-- Su un database creato da zero non esiste alcun admin preconfigurato: il primo
-- utente va promosso a mano. Vedi il README.

-- 1) Schema privato: Supabase espone via PostgREST solo "public" (e graphql_public),
--    quindi questa tabella non e' raggiungibile ne' con la anon key ne' da un utente loggato.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.admin_bootstrap_emails (
  email      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.admin_bootstrap_emails FROM anon, authenticated;

-- Difesa in profondita': anche se lo schema venisse esposto per errore, nessuna
-- policy = nessuna riga leggibile. Il proprietario della tabella (e quindi la
-- funzione SECURITY DEFINER qui sotto) continua a bypassare le RLS.
ALTER TABLE private.admin_bootstrap_emails ENABLE ROW LEVEL SECURITY;

-- 2) Trigger function: SECURITY DEFINER + search_path fisso, come le altre del progetto.
CREATE OR REPLACE FUNCTION public.grant_bootstrap_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM private.admin_bootstrap_emails b
    WHERE lower(b.email) = lower(NEW.email)
  ) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

-- 3) Il nome del trigger resta alfabeticamente precedente a "on_auth_user_created"
--    (g < o), quindi l'ordine di esecuzione dei trigger AFTER INSERT non cambia.
DROP TRIGGER IF EXISTS grant_bootstrap_admin_trigger ON auth.users;
CREATE TRIGGER grant_bootstrap_admin_trigger
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_bootstrap_admin();
