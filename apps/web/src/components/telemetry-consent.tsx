'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const CONSENT_KEY = 'castellar-telemetry-consent';

/**
 * Castellar — banner de consentimiento de telemetría producto.
 *
 * Reglas:
 *   - Solo cargamos PostHog si el usuario acepta explícitamente.
 *   - Region UE forzada (`api_host: 'https://eu.i.posthog.com'`).
 *   - No tracking de IP completa, no session replay sobre datos clínicos.
 *   - Decisión persistida en localStorage. Cambiable en `/settings`.
 *
 * Cumple RGPD: opt-in granular, no oscuro, retirable en cualquier momento.
 */
export function TelemetryConsent() {
  const [decision, setDecision] = useState<'pending' | 'opt-in' | 'opt-out'>('pending');

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === 'opt-in' || stored === 'opt-out') {
      setDecision(stored);
      if (stored === 'opt-in') loadPostHog();
    }
  }, []);

  if (decision !== 'pending') return null;

  function decide(value: 'opt-in' | 'opt-out') {
    localStorage.setItem(CONSENT_KEY, value);
    setDecision(value);
    if (value === 'opt-in') loadPostHog();
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-lg border border-border bg-background p-4 shadow-lg">
      <h2 className="text-sm font-semibold">Telemetría de producto</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Usamos métricas anónimas para mejorar Castellar (qué pantallas se usan, qué errores
        ocurren). Nunca incluimos datos de pacientes ni clínicos. Puedes cambiar tu decisión
        en cualquier momento desde Configuración.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => decide('opt-out')}>
          No, gracias
        </Button>
        <Button size="sm" onClick={() => decide('opt-in')}>
          Aceptar
        </Button>
      </div>
    </div>
  );
}

async function loadPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const posthog = (await import('posthog-js')).default;
  posthog.init(key, {
    api_host: 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true, // jamás sobre pantallas clínicas
    autocapture: false,
    sanitize_properties: (props) => {
      // Filtro defensivo: nada que parezca PII.
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        if (/email|phone|dni|nif|nie|name|patient/i.test(k)) continue;
        out[k] = v;
      }
      return out;
    },
  });
}
