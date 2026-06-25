'use client';

export const runtime = 'edge';


import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { trpc } from '@/lib/trpc';

export default function PatientsListPage() {
  const t = useTranslations('patients');
  const [query, setQuery] = useState('');
  const list = trpc.patients.list.useQuery({ limit: 50 });
  const search = trpc.patients.search.useQuery({ query, limit: 50 }, { enabled: query.length > 0 });
  const items = query.length > 0 ? (search.data ?? []) : list.data?.items ?? [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('title')}</h1>
        <Button asChild className="gap-2">
          <Link href="/patients/new">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('newPatient')}</span>
            <span className="sm:hidden">Nuevo</span>
          </Link>
        </Button>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden sm:table-cell">{t('table.code')}</TableHead>
                <TableHead>{t('table.name')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('table.phone')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('table.email')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="hidden sm:table-cell">
                    <Link href={`/patients/${p.id}`} className="font-mono text-xs text-primary hover:underline">
                      {p.code}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/patients/${p.id}`} className="hover:underline">
                      <div>{p.firstName} {p.lastName}</div>
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {p.code} {p.phone ? `· ${p.phone}` : ''}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.phone ?? '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{p.email ?? '—'}</TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    {list.isLoading || search.isLoading ? '…' : 'Sin resultados'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
