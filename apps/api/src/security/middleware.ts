/**
 * Castellar — middleware de seguridad para el API.
 *
 * Aplica headers HTTP recomendados (OWASP ASVS L2 §14) y rate limiting
 * básico por IP. El rate limit fino por usuario+procedure llega en Sprint 8;
 * aquí cubrimos el bloqueo de ataques de fuerza bruta sobre /trpc.
 */

import type { Request, Response, NextFunction } from 'express';
import { Redis as IORedis } from 'ioredis';

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // No cacheamos respuestas con datos personales por defecto.
  'Cache-Control': 'no-store',
};

export function securityHeaders() {
  return function middleware(_req: Request, res: Response, next: NextFunction) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    next();
  };
}

/**
 * Rate limit por IP usando un sliding window aproximado con Redis.
 *
 *   - `max` peticiones por `windowMs`.
 *   - Si Redis no está disponible, deja pasar — falla abierto en MVP.
 *     Sprint 8 cierra el fail-open con una segunda capa local.
 *
 * Clave: `rl:{prefix}:{ip}` con TTL = windowMs.
 */
export function rateLimit(opts: {
  prefix: string;
  max: number;
  windowMs: number;
  redisUrl?: string;
}) {
  const redis = new IORedis(opts.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379', {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  // Conectamos al primer uso y soltamos errores en silencio (fail-open).
  redis.connect().catch(() => {
    /* no-op — la primera llamada determinará si hay conexión */
  });

  return async function middleware(req: Request, res: Response, next: NextFunction) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown';
    const key = `rl:${opts.prefix}:${ip}`;
    try {
      const hits = await redis.incr(key);
      if (hits === 1) await redis.pexpire(key, opts.windowMs);
      res.setHeader('X-RateLimit-Limit', String(opts.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, opts.max - hits)));
      if (hits > opts.max) {
        res.status(429).json({ error: 'rate_limited' });
        return;
      }
      next();
    } catch {
      // Fail-open documentado.
      next();
    }
  };
}
