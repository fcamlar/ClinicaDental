import { getRequestConfig } from 'next-intl/server';
import type { AbstractIntlMessages } from 'next-intl';
import { cookies } from 'next/headers';
import { getMessages, DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@castellar/i18n';

/**
 * Configuración de next-intl.
 *
 * El locale se resuelve por orden:
 *   1. Cookie `castellar-locale` (si el usuario lo cambió manualmente).
 *   2. Locale del tenant (Sprint 2 — leer desde la API).
 *   3. DEFAULT_LOCALE.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('castellar-locale')?.value;
  const locale = (
    cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as SupportedLocale)
      ? (cookieLocale as SupportedLocale)
      : DEFAULT_LOCALE
  );

  return {
    locale,
    messages: getMessages(locale) as AbstractIntlMessages,
  };
});
