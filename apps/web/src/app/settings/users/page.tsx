'use client';

export const runtime = 'edge';


import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

type Role = 'OWNER' | 'ADMIN_CLINIC' | 'DENTIST' | 'HYGIENIST' | 'RECEPTION' | 'ACCOUNTING';
const ROLES: Role[] = ['ADMIN_CLINIC', 'DENTIST', 'HYGIENIST', 'RECEPTION', 'ACCOUNTING'];

interface InviteForm {
  email: string;
  role: Role;
}

export default function SettingsUsersPage() {
  const t = useTranslations('settings.users');
  const tRoles = useTranslations('roles');
  const [showInvite, setShowInvite] = useState(false);
  const utils = trpc.useUtils();
  const users = trpc.identity.listUsers.useQuery();
  const invite = trpc.identity.inviteUser.useMutation({
    async onSuccess() {
      await utils.identity.listUsers.invalidate();
      setShowInvite(false);
    },
  });

  const { register, handleSubmit, reset, formState } = useForm<InviteForm>({
    defaultValues: { role: 'RECEPTION' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await invite.mutateAsync(values);
    reset();
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={() => setShowInvite((v) => !v)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('invite')}</span>
          <span className="sm:hidden">Invitar</span>
        </Button>
      </header>

      {showInvite && (
        <Card>
          <CardHeader>
            <CardTitle>{t('invite')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
              <div className="grid gap-2">
                <Label htmlFor="email">{t('inviteEmail')}</Label>
                <Input id="email" type="email" {...register('email', { required: true })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">{t('inviteRole')}</Label>
                <select
                  id="role"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  {...register('role', { required: true })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {tRoles(r)}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={formState.isSubmitting || invite.isPending}>
                {t('sendInvite')}
              </Button>
              {invite.error && (
                <p className="col-span-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {invite.error.message}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tableEmail')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('tableRole')}</TableHead>
                <TableHead>{t('tableStatus')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="truncate">{u.email}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                      {tRoles(u.role)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{tRoles(u.role)}</TableCell>
                  <TableCell>
                    {u.status === 'ACTIVE' && <Badge variant="success">{t('statusActive')}</Badge>}
                    {u.status === 'INVITED' && (
                      <Badge variant="warning">{t('statusInvited')}</Badge>
                    )}
                    {u.status === 'SUSPENDED' && (
                      <Badge variant="destructive">{t('statusSuspended')}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {users.isLoading && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    …
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
