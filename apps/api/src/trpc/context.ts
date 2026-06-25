import type { Request } from 'express';
import type { TrpcContext } from '@castellar/api-contracts';
import { verifySupabaseJwt } from '../auth/supabase.js';
import type { ServicesProvider } from '../services/services.module.js';

/**
 * Construye el contexto tRPC a partir de la request HTTP.
 *
 * - Lee el Bearer token de Authorization.
 * - Verifica el JWT contra Supabase Auth (JWKS).
 * - Extrae tenantId y role desde los claims app_metadata.castellar.
 * - Inyecta `services` ya configurado con el tenant activo.
 */
export async function createContext(req: Request, services: ServicesProvider): Promise<TrpcContext> {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown';
  const userAgent = req.headers['user-agent'] ?? 'unknown';

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      tenantId: null,
      user: null,
      ip,
      userAgent,
      services: services.buildServices(null),
    };
  }

  const token = authHeader.slice('Bearer '.length);
  const verified = await verifySupabaseJwt(token);
  if (!verified) {
    return {
      tenantId: null,
      user: null,
      ip,
      userAgent,
      services: services.buildServices(null),
    };
  }

  return {
    tenantId: verified.tenantId,
    user: verified.user,
    ip,
    userAgent,
    services: services.buildServices(verified.tenantId),
  };
}
