import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Castellar</h1>
      <p style={{ color: '#4b5563', marginBottom: 24 }}>
        SaaS de gestión de clínicas dentales. Sprint 0 — cimientos y spikes técnicos.
      </p>
      <ul style={{ display: 'grid', gap: 8, padding: 0, listStyle: 'none' }}>
        <li>
          <Link href="/login" style={{ color: '#2563eb' }}>
            → Iniciar sesión
          </Link>
        </li>
        <li>
          <Link href="/odontogram-demo" style={{ color: '#2563eb' }}>
            → Prototipo del odontograma (validación UX)
          </Link>
        </li>
      </ul>
    </main>
  );
}
