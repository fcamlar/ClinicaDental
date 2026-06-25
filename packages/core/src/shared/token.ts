/**
 * Generador de tokens criptográficos inyectable. La implementación de
 * producción usa `crypto.randomBytes(32)`; en tests devolvemos un mock.
 */
export interface TokenGenerator {
  /** Devuelve un token URL-safe de longitud variable. */
  generate(): string;
}
