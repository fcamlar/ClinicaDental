'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { trpc } from '@/lib/trpc';

const REGIMES = [
  'EXEMPT_HEALTHCARE',
  'STANDARD_AESTHETIC',
  'STANDARD_PRODUCT',
  'REDUCED',
  'NOT_SUBJECT',
] as const;
type Regime = (typeof REGIMES)[number];

const RATE: Record<Regime, number> = {
  EXEMPT_HEALTHCARE: 0,
  STANDARD_AESTHETIC: 0.21,
  STANDARD_PRODUCT: 0.21,
  REDUCED: 0.1,
  NOT_SUBJECT: 0,
};

interface LineDraft {
  treatmentId?: string;
  description: string;
  toothRef?: number;
  quantity: number;
  /** Precio unitario en céntimos. */
  unitPrice: number;
  discount: number;
  taxRegime: Regime;
}

const EURO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function NewBudgetPage() {
  const t = useTranslations('billing.budgets');
  const router = useRouter();
  const clinics = trpc.identity.listClinics.useQuery();
  const treatments = trpc.catalog.list.useQuery({ activeOnly: true });

  const [patientQuery, setPatientQuery] = useState('');
  const [patientId, setPatientId] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const search = trpc.patients.search.useQuery(
    { query: patientQuery, limit: 10 },
    { enabled: patientQuery.length >= 2 },
  );
  const create = trpc.billing.createBudget.useMutation({
    onSuccess(b) {
      router.push(`/budgets/${b.id}`);
    },
  });

  function addLineFromTreatment(treatmentId: string) {
    const tr = treatments.data?.find((x) => x.id === treatmentId);
    if (!tr) return;
    setLines((prev) => [
      ...prev,
      {
        treatmentId: tr.id,
        description: tr.name,
        quantity: 1,
        unitPrice: tr.defaultPrice,
        discount: 0,
        taxRegime: tr.taxRegime as Regime,
      },
    ]);
  }

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const l of lines) {
      const gross = l.unitPrice * l.quantity;
      const net = Math.round(gross * (1 - l.discount));
      subtotal += net;
      taxTotal += Math.round(net * RATE[l.taxRegime]);
    }
    return { subtotal, taxTotal, total: subtotal + taxTotal };
  }, [lines]);

  function submit() {
    if (!patientId || !clinicId || lines.length === 0) return;
    create.mutate({
      clinicId,
      patientId,
      notes: notes || undefined,
      lines: lines.map((l) => ({
        treatmentId: l.treatmentId,
        description: l.description,
        toothRef: l.toothRef,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRegime: l.taxRegime,
      })),
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('new')}</h1>

      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>{t('patient')}</Label>
            <Input
              value={patientQuery}
              onChange={(e) => {
                setPatientQuery(e.target.value);
                setPatientId(null);
              }}
              placeholder="Buscar paciente…"
            />
            {patientQuery.length >= 2 && (
              <ul className="max-h-40 overflow-y-auto rounded-md border border-input">
                {search.data?.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setPatientId(p.id);
                        setPatientQuery(`${p.firstName} ${p.lastName}`);
                      }}
                    >
                      {p.firstName} {p.lastName}{' '}
                      <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Sede</Label>
            <select
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
          <div className="grid gap-2 md:col-span-2">
            <Label>{t('notes')}</Label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Líneas</CardTitle>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  addLineFromTreatment(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="">{t('selectTreatment')}…</option>
              {treatments.data?.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  {
                    description: '',
                    quantity: 1,
                    unitPrice: 0,
                    discount: 0,
                    taxRegime: 'EXEMPT_HEALTHCARE',
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              {t('addLine')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="w-16">{t('tooth')}</TableHead>
                <TableHead className="w-16">{t('quantity')}</TableHead>
                <TableHead className="w-24">{t('price')}</TableHead>
                <TableHead className="w-20">{t('discount')}</TableHead>
                <TableHead className="w-36">{t('regime')}</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => {
                const gross = l.unitPrice * l.quantity;
                const net = Math.round(gross * (1 - l.discount));
                const tax = Math.round(net * RATE[l.taxRegime]);
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <Input
                        value={l.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={11}
                        max={48}
                        value={l.toothRef ?? ''}
                        onChange={(e) =>
                          updateLine(i, {
                            toothRef: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={(l.unitPrice / 100).toFixed(2)}
                        onChange={(e) =>
                          updateLine(i, { unitPrice: Math.round(Number(e.target.value) * 100) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={99}
                        value={Math.round(l.discount * 100)}
                        onChange={(e) =>
                          updateLine(i, {
                            discount: Math.max(0, Math.min(0.99, Number(e.target.value) / 100)),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <select
                        value={l.taxRegime}
                        onChange={(e) => updateLine(i, { taxRegime: e.target.value as Regime })}
                        className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {REGIMES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {EURO.format((net + tax) / 100)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(i)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                    Añade tratamientos al presupuesto
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-end justify-between">
        <div className="ml-auto rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
          <div className="flex gap-12">
            <span>Base</span>
            <span className="tabular-nums">{EURO.format(totals.subtotal / 100)}</span>
          </div>
          <div className="flex gap-12">
            <span>IVA</span>
            <span className="tabular-nums">{EURO.format(totals.taxTotal / 100)}</span>
          </div>
          <div className="mt-1 flex gap-12 border-t border-border pt-1 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{EURO.format(totals.total / 100)}</span>
          </div>
        </div>
      </div>

      {create.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {create.error.message}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={submit}
          disabled={!patientId || !clinicId || lines.length === 0 || create.isPending}
        >
          Crear presupuesto
        </Button>
      </div>
    </div>
  );
}
