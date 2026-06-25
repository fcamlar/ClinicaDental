import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Resuelve la sesión Supabase en Server Components. Si no hay sesión,
 * redirige a /login. Devuelve los datos del access token.
 */
export async function requireAuthOrRedirect() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          /* no-op: server components no pueden setear cookies aquí */
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect('/login');
  }
  return data.user;
}
