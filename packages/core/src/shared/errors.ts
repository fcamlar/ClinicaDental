/**
 * Errores de dominio. Cada uno se mapea a un código tRPC en la capa API.
 *
 *   DomainError → TRPCError(code)
 *
 * El mensaje SÍ va al cliente; no incluir PII.
 */

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'FORBIDDEN'
      | 'BAD_REQUEST'
      | 'UNAUTHORIZED'
      | 'PRECONDITION_FAILED',
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFound extends DomainError {
  constructor(resource: string) {
    super(`${resource} no encontrado`, 'NOT_FOUND');
  }
}

export class Conflict extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}

export class Forbidden extends DomainError {
  constructor(message = 'No tienes permiso para esta acción') {
    super(message, 'FORBIDDEN');
  }
}

export class BadRequest extends DomainError {
  constructor(message: string) {
    super(message, 'BAD_REQUEST');
  }
}

export class PreconditionFailed extends DomainError {
  constructor(message: string) {
    super(message, 'PRECONDITION_FAILED');
  }
}
