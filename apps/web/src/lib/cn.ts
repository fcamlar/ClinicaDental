import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina nombres de clase Tailwind resolviendo conflictos.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
