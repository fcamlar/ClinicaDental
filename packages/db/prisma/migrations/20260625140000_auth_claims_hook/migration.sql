-- Castellar — Supabase Auth custom access token hook.
--
-- Cada vez que Supabase emite un JWT (login, refresh), llama a esta función.
-- Devolvemos el JWT enriquecido con app_metadata.castellar.* que la API lee
-- para construir el contexto tRPC (tenantId, role, clinicIds).
--
-- Configurar en Dashboard de Supabase:
--   Auth → Hooks → Custom Access Token → public.castellar_access_token_hook
--
-- Esta función se ejecuta como `supabase_auth_admin`, NO como `castellar_app`,
-- y por tanto NO está sujeta a RLS. Es deliberado: necesita leer users
-- a través de tenants sin saber el tenant activo.

CREATE OR REPLACE FUNCTION public.castellar_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_user_id uuid;
  v_user            users%ROWTYPE;
  v_clinic_ids      uuid[];
  v_claims          jsonb;
BEGIN
  v_supabase_user_id := (event->>'user_id')::uuid;

  SELECT * INTO v_user FROM users WHERE supabase_user_id = v_supabase_user_id LIMIT 1;

  IF NOT FOUND THEN
    -- Usuario autenticado en Supabase pero sin registro en Castellar.
    -- Devolvemos el JWT sin claims castellar; la API responderá UNAUTHORIZED.
    RETURN event;
  END IF;

  SELECT COALESCE(array_agg(clinic_id), '{}')
    INTO v_clinic_ids
    FROM clinic_members
    WHERE user_id = v_user.id;

  v_claims := event->'claims';
  v_claims := jsonb_set(
    v_claims,
    '{app_metadata,castellar}',
    jsonb_build_object(
      'tenant_id', v_user.tenant_id,
      'role',      v_user.role,
      'clinic_ids', to_jsonb(v_clinic_ids)
    ),
    true
  );

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- Permitir que supabase_auth_admin ejecute la función (Supabase lo hace
-- automáticamente al registrar el hook desde el Dashboard).
GRANT EXECUTE ON FUNCTION public.castellar_access_token_hook(jsonb) TO supabase_auth_admin;
