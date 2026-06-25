import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { AppProviders } from '@/lib/providers';
import { TelemetryConsent } from '@/components/telemetry-consent';
import './globals.css';

/**
 * Runtime edge para que Cloudflare Pages pueda ejecutar las rutas dinámicas
 * vía Workers. Heredan todas las páginas hijas del app router.
 */
export const runtime = 'edge';

export const metadata: Metadata = {
  title: 'Castellar',
  description: 'SaaS de gestión de clínicas dentales',
};

export const viewport: Viewport = {
  // `viewport-fit=cover` deja el contenido fluir bajo la notch (iOS) y
  // permite reservar safe-area con CSS env(safe-area-inset-*).
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#111827' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders>{children}</AppProviders>
          <TelemetryConsent />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
