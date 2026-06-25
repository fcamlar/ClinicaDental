import { randomBytes } from 'node:crypto';
import type { identity } from '@castellar/core';

/**
 * Generador de tokens criptográficamente seguros, base64url, 32 bytes.
 */
export const cryptoTokenGenerator: identity.TokenGenerator = {
  generate(): string {
    return randomBytes(32).toString('base64url');
  },
};
