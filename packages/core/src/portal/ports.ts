import type { PortalToken } from './entities.js';

export interface PortalTokenRepository {
  /** Búsqueda por hash — la consulta del canjeo es PÚBLICA, sin tenant activo. */
  findByHash(tokenHash: string): Promise<PortalToken | null>;
  create(args: Omit<PortalToken, 'id' | 'createdAt' | 'lastUsedAt' | 'revokedAt'>): Promise<PortalToken>;
  /** Decrementa usesLeft y actualiza lastUsedAt. Atómico. */
  consume(id: string, at: Date): Promise<void>;
  revoke(id: string, at: Date): Promise<void>;
}

/**
 * Mailer para enviar el enlace mágico al paciente. La implementación real
 * usa Resend; el dominio solo conoce el puerto.
 */
export interface PortalMailer {
  sendAccessLink(args: {
    to: string;
    patientName: string;
    clinicName: string;
    portalUrl: string;
    validHours: number;
  }): Promise<void>;
}
