'use client';

import { useEffect, useState } from 'react';
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
  Menu,
  X,
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

/**
 * Sidebar responsive:
 *
 *   - En `lg+` (≥1024px) se muestra estática, lateral, 240 px.
 *   - En `<lg` queda oculta por defecto. Se abre con `<MobileNav />` que
 *     muestra un botón hamburguesa en la cabecera y un drawer con overlay.
 *
 * Cierre automático al cambiar de ruta para no atrapar al usuario en el menú.
 */
export function Sidebar() {
  const t = useTranslations('navigation');
  const tAuth = useTranslations('auth');
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bloquea scroll del body cuando el drawer está abierto.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      {/* Cabecera móvil (oculta en desktop). */}
      <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 lg:hidden">
        <span className="text-lg font-semibold">Castellar</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* Overlay del drawer móvil. */}
      {open && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar: drawer en móvil, estática en desktop. */}
      <aside
        className={cn(
          'flex w-60 shrink-0 flex-col border-r border-border bg-muted/30 p-4',
          // Móvil: drawer fijo a la izquierda.
          'fixed inset-y-0 left-0 z-50 transform transition-transform duration-200',
          open ? 'translate-x-0 shadow-xl' : '-translate-x-full',
          // Desktop: estática.
          'lg:static lg:translate-x-0 lg:shadow-none',
        )}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <span className="text-lg font-semibold">Castellar</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="lg:hidden"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
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
    </>
  );
}
