import { Sidebar } from '@/components/sidebar';
import { requireAuthOrRedirect } from '@/lib/server-auth';

export default async function InvoicesLayout({ children }: { children: React.ReactNode }) {
  await requireAuthOrRedirect();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
