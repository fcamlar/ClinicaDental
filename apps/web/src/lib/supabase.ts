import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase para el navegador. Se usa para login, logout y refresh.
 * En el back-office, tras login, el JWT se envía al API de Castellar en cada
 * petición tRPC vía Authorization: Bearer.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createBrowserClient(url, anon);
}
