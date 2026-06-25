'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { trpc } from '@/lib/trpc';

/**
 * Visor de auditoría. Solo OWNER y ADMIN_CLINIC pueden acceder (validado en
 * el backend con identity.listAudit). Permite filtrar por recurso e
 * implementa paginación cursor-based.
 */
export default function AuditLogPage() {
  const t = useTranslations('navigation');
  const [resourceType, setResourceType] = useState<string>('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<string[]>([]);

  const query = trpc.identity.listAudit.useQuery(
    {
      limit: 50,
      cursor,
      resourceType: resourceType || undefined,
    },
    { staleTime: 30_000 },
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('audit')}</h1>
        <p className="text-sm text-muted-foreground">
          Registro inmutable de acciones significativas en la plataforma.
        </p>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="grid gap-1">
            <Label htmlFor="rt">Recurso</Label>
            <Input
              id="rt"
              value={resourceType}
              onChange={(e) => {
                setResourceType(e.target.value);
                setCursor(undefined);
                setHistory([]);
              }}
              placeholder="patient, invoice, visit…"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead className="hidden md:table-cell">Recurso</TableHead>
                <TableHead className="hidden md:table-cell">Actor</TableHead>
                <TableHead className="hidden lg:table-cell">Motivo</TableHead>
                <TableHead className="hidden lg:table-cell">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">
                    {new Date(e.at).toLocaleString('es-ES', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </TableCell>
                  <TableCell>
                    <div>{e.action}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground md:hidden font-mono">
                      {e.resourceType}
                      {e.resourceId && `/${e.resourceId.slice(0, 8)}`}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs">
                    {e.resourceType}
                    {e.resourceId && `/${e.resourceId.slice(0, 8)}`}
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs">
                    {e.actorId?.slice(0, 8) ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell max-w-xs truncate">
                    {e.reason ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs">
                    {e.ip ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
              {query.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Sin entradas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={history.length === 0}
          onClick={() => {
            const previous = history[history.length - 1];
            setHistory(history.slice(0, -1));
            setCursor(previous);
          }}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          disabled={!query.data?.nextCursor}
          onClick={() => {
            if (cursor !== undefined) setHistory([...history, cursor]);
            setCursor(query.data?.nextCursor ?? undefined);
          }}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
