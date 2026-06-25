import { Sidebar } from '@/components/sidebar';
import { requireAuthOrRedirect } from '@/lib/server-auth';

export default async function BudgetsLayout({ children }: { children: React.ReactNode }) {
  await requireAuthOrRedirect();
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
