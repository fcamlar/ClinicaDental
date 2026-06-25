'use client';

export const runtime = 'edge';


import { use, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Lock, FileText } from 'lucide-react';
import { Odontogram, type OdontogramState } from '@castellar/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';

/**
 * Historia clínica del paciente.
 *
 * Estructura:
 *   - Diálogo de motivo (Ley 41/2002) antes de cargar nada.
 *   - Listado de visitas pasadas + visita abierta.
 *   - Editor de notas (con regla 24h).
 *   - Odontograma con autosave (debounced) cuando la visita está OPEN.
 *
 * No mezcla lógica de negocio — el backend valida lock/cerrado y RBAC.
 */
export default function PatientClinicalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: patientId } = use(params);
  const t = useTranslations('clinical');
  const tN = useTranslations('clinical.noteType');
  const [reason, setReason] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');

  if (reason === null) {
    return (
      <div className="grid place-items-center pt-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('reasonRequired')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              placeholder="p. ej. Visita programada"
              autoFocus
            />
            <Button
              onClick={() => setReason(reasonDraft.trim())}
              disabled={reasonDraft.trim().length < 3}
            >
              {t('reasonContinue')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ClinicalContent patientId={patientId} reason={reason} />;
}

function ClinicalContent({ patientId, reason }: { patientId: string; reason: string }) {
  const t = useTranslations('clinical');
  const utils = trpc.useUtils();

  const visits = trpc.clinical.listVisits.useQuery({ patientId, reason, limit: 20 });
  const openVisitId = visits.data?.find((v) => v.status === 'OPEN')?.id ?? null;

  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeVisitId && (openVisitId || visits.data?.[0]?.id)) {
      setActiveVisitId(openVisitId ?? visits.data?.[0]?.id ?? null);
    }
  }, [openVisitId, visits.data, activeVisitId]);

  const startVisit = trpc.clinical.startVisit.useMutation({
    async onSuccess(v) {
      await utils.clinical.listVisits.invalidate();
      setActiveVisitId(v.id);
    },
  });
  const closeVisit = trpc.clinical.closeVisit.useMutation({
    async onSuccess() {
      await utils.clinical.listVisits.invalidate();
      await utils.clinical.getVisit.invalidate();
    },
  });

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{t('visits')}</CardTitle>
          {!openVisitId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => startVisit.mutate({ patientId, motive: reason })}
              disabled={startVisit.isPending}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              {t('startVisit')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-1 p-0">
          {visits.data?.length === 0 && (
            <p className="px-4 py-4 text-sm text-muted-foreground">{t('noVisits')}</p>
          )}
          <ul className="divide-y divide-border">
            {visits.data?.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setActiveVisitId(v.id)}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-accent ${
                    activeVisitId === v.id ? 'bg-accent' : ''
                  }`}
                >
                  <div>
                    <div className="font-medium">
                      {new Date(v.startedAt).toLocaleDateString('es-ES', {
                        dateStyle: 'medium',
                      })}
                    </div>
                    {v.motive && (
                      <div className="text-xs text-muted-foreground">{v.motive}</div>
                    )}
                  </div>
                  <Badge variant={v.status === 'OPEN' ? 'warning' : 'secondary'}>
                    {v.status === 'OPEN' ? t('openVisit') : t('visitClosed').split('—')[0]?.trim()}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {activeVisitId && (
        <VisitDetail
          visitId={activeVisitId}
          reason={reason}
          onClose={() => {
            closeVisit.mutate({ visitId: activeVisitId });
          }}
        />
      )}
    </div>
  );
}

interface VisitDetailProps {
  visitId: string;
  reason: string;
  onClose: () => void;
}

function VisitDetail({ visitId, reason, onClose }: VisitDetailProps) {
  const t = useTranslations('clinical');
  const tN = useTranslations('clinical.noteType');
  const utils = trpc.useUtils();
  const visit = trpc.clinical.getVisit.useQuery({ visitId, reason });

  const isOpen = visit.data?.visit.status === 'OPEN';

  const addNote = trpc.clinical.addNote.useMutation({
    async onSuccess() {
      await utils.clinical.getVisit.invalidate();
    },
  });
  const editNote = trpc.clinical.editNote.useMutation({
    async onSuccess() {
      await utils.clinical.getVisit.invalidate();
    },
  });
  const addAddendum = trpc.clinical.addAddendum.useMutation({
    async onSuccess() {
      await utils.clinical.getVisit.invalidate();
    },
  });
  const saveOdontogram = trpc.clinical.saveOdontogram.useMutation();

  // Autosave del odontograma con debounce 1.5 s.
  const [localOdontogram, setLocalOdontogram] = useState<OdontogramState | null>(null);
  useEffect(() => {
    if (visit.data?.odontogram?.stateJson && !localOdontogram) {
      setLocalOdontogram(visit.data.odontogram.stateJson as OdontogramState);
    }
  }, [visit.data, localOdontogram]);

  useEffect(() => {
    if (!localOdontogram || !isOpen) return;
    const id = setTimeout(() => {
      saveOdontogram.mutate({ visitId, state: localOdontogram });
    }, 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localOdontogram, isOpen]);

  // Estado del editor de nueva nota.
  const [newNote, setNewNote] = useState({ type: 'EVOLUTION' as const, body: '' });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [addendaFor, setAddendaFor] = useState<string | null>(null);
  const [addendaBody, setAddendaBody] = useState('');

  if (visit.isLoading) return <p className="text-muted-foreground">…</p>;
  if (!visit.data) return <p className="text-muted-foreground">Visita no encontrada</p>;

  const notes = visit.data.notes;
  const originals = notes.filter((n) => !n.parentNoteId);
  const addendumsByParent = new Map<string, typeof notes>();
  for (const n of notes) {
    if (n.parentNoteId) {
      const arr = addendumsByParent.get(n.parentNoteId) ?? [];
      arr.push(n);
      addendumsByParent.set(n.parentNoteId, arr);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
            {new Date(visit.data.visit.startedAt).toLocaleString('es-ES', {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </h2>
          {visit.data.visit.motive && (
            <p className="text-sm text-muted-foreground">{visit.data.visit.motive}</p>
          )}
        </div>
        {isOpen ? (
          <Button onClick={onClose} variant="outline" className="gap-2">
            <Lock className="h-4 w-4" />
            {t('closeVisit')}
          </Button>
        ) : (
          <Badge variant="secondary">{t('visitClosed')}</Badge>
        )}
      </header>

      {/* Odontograma */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('odontogram')}</CardTitle>
          {!isOpen && (
            <p className="text-xs text-muted-foreground">{t('odontogramReadOnly')}</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className={isOpen ? '' : 'pointer-events-none opacity-70'}>
              <Odontogram
                value={localOdontogram ?? {}}
                onChange={(s) => isOpen && setLocalOdontogram(s)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('notes')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOpen && (
            <div className="grid gap-2 rounded-md border border-dashed border-input p-3">
              <div className="flex items-center gap-2">
                <select
                  value={newNote.type}
                  onChange={(e) =>
                    setNewNote({ ...newNote, type: e.target.value as typeof newNote.type })
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {(
                    [
                      'EVOLUTION',
                      'DIAGNOSIS',
                      'TREATMENT_PLAN',
                      'PRESCRIPTION',
                      'REFERRAL',
                      'OTHER',
                    ] as const
                  ).map((tp) => (
                    <option key={tp} value={tp}>
                      {tN(tp)}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={3}
                value={newNote.body}
                onChange={(e) => setNewNote({ ...newNote, body: e.target.value })}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={t('noteBody')}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={newNote.body.trim().length === 0 || addNote.isPending}
                  onClick={() =>
                    addNote.mutate({
                      visitId,
                      patientId: visit.data!.visit.patientId,
                      type: newNote.type,
                      body: newNote.body,
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> {t('newNote')}
                </Button>
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {originals.map((n) => {
              const editing = editingNoteId === n.id;
              const addenda = addendumsByParent.get(n.id) ?? [];
              return (
                <li key={n.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      <FileText className="mr-1 inline h-3 w-3" />
                      {tN(n.type)} ·{' '}
                      {new Date(n.createdAt).toLocaleString('es-ES', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                    {n.lockedAt && (
                      <span title={String(n.lockedAt)}>
                        <Lock className="mr-1 inline h-3 w-3" />
                        {t('lockedAt')}{' '}
                        {new Date(n.lockedAt).toLocaleDateString('es-ES')}
                      </span>
                    )}
                  </div>
                  {editing ? (
                    <div className="mt-2 grid gap-2">
                      <textarea
                        rows={3}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            editNote.mutate({ noteId: n.id, body: editBody });
                            setEditingNoteId(null);
                          }}
                        >
                          {t('saveEdit')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)}>
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm">{n.body}</p>
                  )}

                  {addenda.length > 0 && (
                    <ul className="mt-3 space-y-2 border-l-2 border-amber-200 pl-3">
                      {addenda.map((ad) => (
                        <li key={ad.id} className="text-sm">
                          <div className="text-xs text-muted-foreground">
                            {t('addendumOf')} ·{' '}
                            {new Date(ad.createdAt).toLocaleString('es-ES', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap">{ad.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {isOpen && !editing && (
                    <div className="mt-2 flex gap-2">
                      {!n.lockedAt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingNoteId(n.id);
                            setEditBody(n.body);
                          }}
                        >
                          {t('edit')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAddendaFor(addendaFor === n.id ? null : n.id);
                          setAddendaBody('');
                        }}
                      >
                        {t('addendum')}
                      </Button>
                    </div>
                  )}

                  {addendaFor === n.id && (
                    <div className="mt-3 grid gap-2">
                      <Label htmlFor={`ad-${n.id}`} className="text-xs">
                        {t('addendumPlaceholder')}
                      </Label>
                      <textarea
                        id={`ad-${n.id}`}
                        rows={2}
                        value={addendaBody}
                        onChange={(e) => setAddendaBody(e.target.value)}
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          disabled={addendaBody.trim().length === 0}
                          onClick={() => {
                            addAddendum.mutate({ parentNoteId: n.id, body: addendaBody });
                            setAddendaFor(null);
                          }}
                        >
                          {t('save')}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
