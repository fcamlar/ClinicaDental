import { randomBytes } from 'node:crypto';
import type { TokenGenerator } from '@castellar/core';

/**
 * Generador de tokens criptográficamente seguros, base64url, 32 bytes.
 */
export const cryptoTokenGenerator: TokenGenerator = {
  generate(): string {
    return randomBytes(32).toString('base64url');
  },
};
