import { createTRPCReact, type CreateTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@castellar/api-contracts';

/**
 * Cliente React Query + tRPC tipado contra el AppRouter.
 *
 * Anotamos el tipo de retorno explícitamente porque el tipo inferido
 * referencia paths internos de los paquetes del workspace (vía symlinks de
 * pnpm) que TS no puede serializar sin contextos absolutos. La anotación
 * corta esa cadena y mantiene la inferencia portable.
 */
export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();
