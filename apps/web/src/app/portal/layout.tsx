import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Castellar · Portal del paciente',
};

/**
 * Layout aislado del portal del paciente. No incluye sidebar ni vinculación
 * al back-office — el paciente solo ve lo suyo.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold">Castellar · Portal</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
