'use client';

export const runtime = 'edge';


import { useState } from 'react';
import { Odontogram, type OdontogramState } from '@castellar/ui';

/**
 * Sandbox del odontograma para sesiones de validación con dentistas.
 * No persiste nada — el estado vive solo en memoria.
 */
export default function OdontogramDemoPage() {
  const [state, setState] = useState<OdontogramState>({});

  return (
    <main style={{ maxWidth: 1100, margin: '2rem auto', padding: '0 1.5rem' }}>
      <h1 style={{ fontSize: 24 }}>Odontograma — prototipo</h1>
      <p style={{ color: '#4b5563' }}>
        Selecciona una condición en la paleta y haz clic en una superficie del diente para
        marcarla. Click en el borde del diente aplica condiciones globales (ausente, implante,
        corona, extracción planificada). Esta vista es solo para validación UX: no guarda nada.
      </p>
      <div style={{ marginTop: 24 }}>
        <Odontogram value={state} onChange={setState} />
      </div>
      <details style={{ marginTop: 24 }}>
        <summary style={{ cursor: 'pointer', color: '#374151' }}>Estado JSON</summary>
        <pre
          style={{
            background: '#111827',
            color: '#f9fafb',
            padding: 16,
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 12,
          }}
        >
          {JSON.stringify(state, null, 2)}
        </pre>
      </details>
    </main>
  );
}
