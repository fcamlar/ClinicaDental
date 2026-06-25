'use client';

import { useState, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc';
import { createSupabaseBrowserClient } from '@/lib/supabase';

/**
 * Provider raíz de tRPC + React Query.
 *
 * - Lee el JWT actual desde Supabase Auth (cliente browser) y lo añade
 *   como Bearer en cada petición.
 * - Apunta al endpoint /trpc del API de Castellar.
 */
export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/trpc`,
          async headers() {
            const supabase = createSupabaseBrowserClient();
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            return token ? { authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
