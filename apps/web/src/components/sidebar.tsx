'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Calendar,
  Users,
  Stethoscope,
  FileText,
  Receipt,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

interface NavItem {
  href: string;
  labelKey:
    | 'agenda'
    | 'patients'
    | 'treatments'
    | 'budgets'
    | 'invoices'
    | 'reports'
    | 'settings';
  Icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { href: '/agenda', labelKey: 'agenda', Icon: Calendar },
  { href: '/patients', labelKey: 'patients', Icon: Users },
  { href: '/treatments', labelKey: 'treatments', Icon: Stethoscope },
  { href: '/budgets', labelKey: 'budgets', Icon: FileText },
  { href: '/invoices', labelKey: 'invoices', Icon: Receipt },
  { href: '/reports', labelKey: 'reports', Icon: BarChart3 },
  { href: '/settings/users', labelKey: 'settings', Icon: Settings },
];

export function Sidebar() {
  const t = useTranslations('navigation');
  const tAuth = useTranslations('auth');
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-muted/30 p-4">
      <div className="mb-8 px-2 text-lg font-semibold">Castellar</div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ href, labelKey, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>
      <Button variant="ghost" size="sm" onClick={signOut} className="justify-start gap-2">
        <LogOut className="h-4 w-4" />
        <span>{tAuth('signOut')}</span>
      </Button>
    </aside>
  );
}
