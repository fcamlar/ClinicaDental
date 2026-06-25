import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { AuthenticatedUser } from '@castellar/api-contracts';

/**
 * Verifica un JWT de Supabase Auth y devuelve el usuario autenticado.
 *
 * En Sprint 1 se mapea `sub` (supabase user id) a la tabla `users` para
 * recuperar tenantId, role y clinicIds. En este spike devolvemos el shape
 * mínimo a partir de los custom claims que Castellar inyectará vía hooks
 * de Supabase Auth (app_metadata.castellar.*).
 */

interface CastellarClaims {
  app_metadata?: {
    castellar?: {
      tenant_id?: string;
      role?: AuthenticatedUser['role'];
      clinic_ids?: string[];
    };
  };
  email?: string;
  sub?: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (jwks) return jwks;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL no definida — no se puede verificar JWT');
  }
  jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  return jwks;
}

export async function verifySupabaseJwt(
  token: string,
): Promise<{ user: AuthenticatedUser; tenantId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    });

    const claims = payload as CastellarClaims;
    const castellar = claims.app_metadata?.castellar;

    if (!claims.sub || !claims.email || !castellar?.tenant_id || !castellar.role) {
      return null;
    }

    return {
      tenantId: castellar.tenant_id,
      user: {
        id: claims.sub,
        email: claims.email,
        role: castellar.role,
        clinicIds: castellar.clinic_ids ?? [],
      },
    };
  } catch {
    return null;
  }
}
