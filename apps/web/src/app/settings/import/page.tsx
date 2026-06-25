'use client';

export const runtime = 'edge';


import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';

/**
 * Importador CSV mínimo: el usuario pega CSV con cabecera
 *
 *   firstName,lastName,nationalId,birthDate,email,phone,city,notes
 *
 * Una fila por paciente. El parsing es naive (split por línea/coma con
 * trim). Para CSVs complejos (con comas dentro de comillas) recomendamos
 * pre-procesar con un editor. El backend valida con Zod.
 */
export default function ImportPage() {
  const clinics = trpc.identity.listClinics.useQuery();
  const [clinicId, setClinicId] = useState('');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    failed: number;
    rows: Array<{ index: number; status: string; reason?: string }>;
  } | null>(null);

  const importMutation = trpc.patients.importCsv.useMutation({
    onSuccess(data) {
      setResult(data);
    },
  });

  function parse(): Array<Record<string, string>> {
    const lines = csv.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return [];
    const headers = lines[0]!.split(',').map((h) => h.trim());
    const out: Array<Record<string, string>> = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i]!.split(',').map((c) => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (cells[idx]) row[h] = cells[idx]!;
      });
      out.push(row);
    }
    return out;
  }

  function submit() {
    if (!clinicId) return;
    const rows = parse();
    if (rows.length === 0) return;
    importMutation.mutate({
      clinicId,
      rows: rows.map((r) => ({
        firstName: r.firstName ?? '',
        lastName: r.lastName ?? '',
        nationalId: r.nationalId || undefined,
        birthDate: r.birthDate || undefined,
        email: r.email || undefined,
        phone: r.phone || undefined,
        city: r.city || undefined,
        notes: r.notes || undefined,
      })),
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Importar pacientes (CSV)</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Origen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="clinic">Sede</Label>
            <select
              id="clinic"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">—</option>
              {clinics.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="csv">CSV</Label>
            <textarea
              id="csv"
              rows={12}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="firstName,lastName,nationalId,birthDate,email,phone,city,notes&#10;Lucía,Pérez Gómez,12345678Z,1985-04-12,lucia@demo.test,+34600...,Madrid,Alérgica a penicilina"
              className="rounded-md border border-input bg-background p-3 font-mono text-xs"
            />
          </div>
          {importMutation.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {importMutation.error.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              onClick={submit}
              disabled={!clinicId || csv.trim().length === 0 || importMutation.isPending}
            >
              Importar
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 text-sm">
              <span className="font-semibold text-emerald-600">Creados: {result.created}</span>
              {' · '}
              <span className="font-semibold text-amber-600">Omitidos: {result.skipped}</span>
              {' · '}
              <span className="font-semibold text-destructive">Errores: {result.failed}</span>
            </div>
            <ul className="space-y-1 text-xs">
              {result.rows
                .filter((r) => r.status !== 'created')
                .map((r) => (
                  <li key={r.index}>
                    Fila {r.index + 1}: <span className="font-mono">{r.status}</span>
                    {r.reason && ` — ${r.reason}`}
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
