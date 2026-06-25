import Link from 'next/link';

/**
 * Página 404 explícita.
 *
 * Necesaria con `@cloudflare/next-on-pages`: la página 404 automática de
 * Next.js no hereda el `runtime = 'edge'` del layout raíz porque vive
 * fuera del árbol normal de rutas. Sin esta export explícita, el build
 * falla con "the following routes were not configured to run with the
 * Edge Runtime: /_not-found".
 */
export const runtime = 'edge';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1 style={{ fontSize: 48, margin: 0 }}>404</h1>
        <p style={{ color: '#6b7280', margin: '0.5rem 0 1.5rem' }}>
          No hemos encontrado la página que buscas.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '10px 16px',
            background: '#111827',
            color: 'white',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
