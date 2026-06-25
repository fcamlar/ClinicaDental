'use client';

export const runtime = 'edge';


import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FileText, Stethoscope, User2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExportPatientDataButton } from '@/components/patients/export-data-button';
import { trpc } from '@/lib/trpc';

/**
 * Ficha de paciente.
 *
 * Antes de cargar los datos pedimos motivo de acceso (Ley 41/2002).
 * El motivo se envía a `patients.get` y queda registrado en audit_log.
 *
 * Mientras no haya motivo, mostramos un modal bloqueante.
 */
export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('patients');
  const tA = useTranslations('patients.alerts');
  const tC = useTranslations('patients.consents');
  const tRd = useTranslations('patients.reasonDialog');
  const [reason, setReason] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const data = trpc.patients.get.useQuery(
    { patientId: id, reason: reason ?? '' },
    { enabled: reason !== null && reason.length >= 3 },
  );

  if (reason === null) {
    return (
      <ReasonDialog
        draft={draft}
        setDraft={setDraft}
        onConfirm={() => setReason(draft.trim())}
        labels={{
          title: tRd('title'),
          description: tRd('description'),
          placeholder: tRd('placeholder'),
          continue: tRd('continue'),
        }}
      />
    );
  }

  if (data.isLoading) return <p className="text-muted-foreground">…</p>;
  if (!data.data) return <p className="text-muted-foreground">Paciente no encontrado</p>;

  const { patient, alerts, consents } = data.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {patient.firstName} {patient.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{patient.code}</span>
            {patient.nationalId && ` · ${patient.nationalId}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="max-w-[60vw] truncate sm:max-w-none">
            Motivo: {reason}
          </Badge>
          <ExportPatientDataButton patientId={patient.id} patientCode={patient.code} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User2 className="h-4 w-4" /> {t('tabs.data')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <Field label={t('form.email')} value={patient.email} />
            <Field label={t('form.phone')} value={patient.phone} />
            <Field
              label={t('form.birthDate')}
              value={patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('es-ES') : null}
            />
            <Field label={t('form.sex')} value={patient.sex} />
            <Field label={t('form.address')} value={patient.addressLine1} />
            <Field label={t('form.postalCode')} value={patient.postalCode} />
            <Field label={t('form.city')} value={patient.city} />
            <Field label={t('form.country')} value={patient.country} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" /> {t('tabs.alerts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 && (
              <p className="text-sm text-muted-foreground">{tA('empty')}</p>
            )}
            <ul className="grid gap-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <span className="font-medium">{a.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {tA(`category.${a.category}`)}
                    </span>
                    {a.details && <p className="text-xs text-muted-foreground">{a.details}</p>}
                  </div>
                  <Badge
                    variant={
                      a.severity === 'CRITICAL' || a.severity === 'HIGH'
                        ? 'destructive'
                        : a.severity === 'MEDIUM'
                          ? 'warning'
                          : 'secondary'
                    }
                  >
                    {tA(`severity.${a.severity}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> {t('tabs.consents')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {consents.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin consentimientos firmados.</p>
            )}
            <ul className="grid gap-2 text-sm">
              {consents.map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b py-2">
                  <div>
                    <span className="font-medium">{tC(`type.${c.type}`)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(c.signedAt).toLocaleDateString('es-ES')}
                    </span>
                  </div>
                  <Badge variant={c.revokedAt ? 'destructive' : 'success'}>
                    {c.revokedAt ? tC('revoked') : tC('signed')}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Stethoscope className="h-4 w-4" /> {t('tabs.clinical')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Abre la historia clínica completa con notas, odontograma y visitas.
            </p>
            <a
              href={`/patients/${patient.id}/clinical`}
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              → Ir a historia clínica
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value ?? '—'}</div>
    </div>
  );
}

function ReasonDialog({
  draft,
  setDraft,
  onConfirm,
  labels,
}: {
  draft: string;
  setDraft: (s: string) => void;
  onConfirm: () => void;
  labels: { title: string; description: string; placeholder: string; continue: string };
}) {
  return (
    <div className="grid place-items-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">{labels.description}</p>
          <div className="grid gap-2">
            <Label htmlFor="reason">{labels.placeholder}</Label>
            <Input
              id="reason"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={255}
              autoFocus
            />
          </div>
          <Button onClick={onConfirm} disabled={draft.trim().length < 3}>
            {labels.continue}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
