/**
 * Castellar — catálogo de idiomas.
 *
 * Locales soportados. El locale por defecto del MVP es `es-ES`. `en-US` y
 * `pt-BR` están preparados pero pt-BR queda con cobertura parcial hasta el
 * Sprint 7.
 */

import esES from './locales/es-ES.json';
import enUS from './locales/en-US.json';
import ptBR from './locales/pt-BR.json';

export const SUPPORTED_LOCALES = ['es-ES', 'en-US', 'pt-BR'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'es-ES';

/**
 * Tipo derivado del catálogo es-ES: cualquier clave usada en la app debe
 * existir como mínimo aquí.
 */
export type CastellarMessages = typeof esES;

export const messages: Record<SupportedLocale, unknown> = {
  'es-ES': esES,
  'en-US': enUS,
  'pt-BR': ptBR,
};

export function getMessages(locale: SupportedLocale): unknown {
  return messages[locale] ?? esES;
}
