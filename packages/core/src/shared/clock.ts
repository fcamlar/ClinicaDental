/**
 * Reloj inyectable — el dominio no llama `new Date()` directamente, recibe
 * un `Clock` para que los tests puedan congelar el tiempo.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Reloj que devuelve siempre la misma fecha. Útil en tests. */
export function fixedClock(at: Date): Clock {
  return { now: () => new Date(at.getTime()) };
}
