'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';

/**
 * Botón de exportación RGPD. Pide motivo, llama a `patients.exportData`,
 * y descarga el JSON resultante. El backend audita la operación.
 */
export function ExportPatientDataButton({
  patientId,
  patientCode,
}: {
  patientId: string;
  patientCode: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const exportMutation = trpc.patients.exportData.useMutation({
    onSuccess(data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `castellar-export-${patientCode}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
      setReason('');
    },
  });

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" />
        Exportar datos RGPD
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4">
      <Card className="max-h-[95vh] w-full max-w-md overflow-y-auto">
        <CardHeader>
          <CardTitle>Exportar datos del paciente</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Descarga un JSON con todos los datos personales del paciente (acceso y
            portabilidad — Art. 15 y 20 RGPD). La operación queda registrada con motivo en la
            auditoría.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="reason">Motivo</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Solicitud de acceso del paciente"
            />
          </div>
          {exportMutation.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {exportMutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={reason.trim().length < 3 || exportMutation.isPending}
              onClick={() => exportMutation.mutate({ patientId, reason })}
            >
              Descargar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
