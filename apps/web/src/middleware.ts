import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cabeceras de seguridad para todas las rutas servidas por Next.js.
 *
 * El back-office (`/dashboard`, `/patients`, `/budgets`, …) y el portal
 * (`/portal/*`) requieren CSP estricta. Las rutas de marketing pueden
 * relajar `script-src` si añadimos analytics.
 */
export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} ${
        process.env.NEXT_PUBLIC_API_URL ?? ''
      }`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
