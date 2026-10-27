-- Remove email column from profiles entirely; AuthProvider uses session.email,
-- admin uses admin_list_user_emails() RPC. Update handle_new_user accordingly.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uname TEXT;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1));
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = uname) LOOP
    uname := uname || floor(random()*1000)::text;
  END LOOP;
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, uname);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$function$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- Re-grant safe columns to authenticated (since column list changed)
REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (id, username, avatar_url, created_at) ON public.profiles TO authenticated;
GRANT SELECT (id, username, avatar_url) ON public.profiles TO anon;