import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BadRequest, Forbidden, NotFound, PreconditionFailed } from '../shared/errors.js';
import type { Clock } from '../shared/clock.js';
import type { TokenGenerator } from '../shared/token.js';
import type * as identity from '../identity/index.js';
import type * as patients from '../patients/index.js';
import type * as scheduling from '../scheduling/index.js';
import type * as billing from '../billing/index.js';
import type { PortalMailer, PortalTokenRepository } from './ports.js';
import type { PortalSession } from './entities.js';

const PORTAL_TOKEN_TTL_HOURS = 72;
const PORTAL_TOKEN_USES = 10;

function hashToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

// ---------- Schemas Zod ---------------------------------------------------

export const issuePortalLinkInput = z.object({
  patientId: z.string().uuid(),
});

export const exchangePortalTokenInput = z.object({
  token: z.string().min(16).max(128),
});
export type ExchangePortalTokenInput = z.infer<typeof exchangePortalTokenInput>;

// ---------- Casos de uso --------------------------------------------------

/**
 * La clínica genera un enlace mágico para el paciente. Llamado desde el
 * back-office (RECEPTION+). Envía email con la URL completa.
 */
export function makeIssuePortalLinkUseCase(deps: {
  patientRepo: patients.PatientRepository;
  tokenRepo: PortalTokenRepository;
  mailer: PortalMailer;
  audit: identity.AuditLogRepository;
  tokens: TokenGenerator;
  clock: Clock;
  portalUrlFor: (token: string) => string;
  clinicName: string;
}) {
  return async function issuePortalLink(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: z.infer<typeof issuePortalLinkInput>;
    ip: string | null;
  }) {
    if (
      args.actorRole !== 'OWNER' &&
      args.actorRole !== 'ADMIN_CLINIC' &&
      args.actorRole !== 'RECEPTION'
    ) {
      throw new Forbidden('Tu rol no permite emitir enlaces de portal');
    }

    const patient = await deps.patientRepo.findById(args.input.patientId);
    if (!patient) throw new NotFound('Paciente');
    if (!patient.email) {
      throw new BadRequest('El paciente no tiene email registrado');
    }

    const plain = deps.tokens.generate();
    const tokenHash = hashToken(plain);
    const expiresAt = new Date(
      deps.clock.now().getTime() + PORTAL_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );
    const token = await deps.tokenRepo.create({
      tenantId: args.tenantId,
      patientId: patient.id,
      tokenHash,
      expiresAt,
      usesLeft: PORTAL_TOKEN_USES,
    });

    await deps.mailer.sendAccessLink({
      to: patient.email,
      patientName: `${patient.firstName} ${patient.lastName}`,
      clinicName: deps.clinicName,
      portalUrl: deps.portalUrlFor(plain),
      validHours: PORTAL_TOKEN_TTL_HOURS,
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'portal.link.issue',
      resourceType: 'patient',
      resourceId: patient.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { tokenId: token.id, expiresAt: expiresAt.toISOString() },
    });

    return { tokenId: token.id, expiresAt };
  };
}

/**
 * Canjeo PÚBLICO del token. Devuelve `PortalSession` que la API expone como
 * cookie HTTP-only de corta duración (la implementación de la capa HTTP).
 */
export function makeExchangePortalTokenUseCase(deps: {
  tokenRepo: PortalTokenRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function exchangePortalToken(args: {
    input: ExchangePortalTokenInput;
    ip: string | null;
  }): Promise<PortalSession> {
    const tokenHash = hashToken(args.input.token);
    const token = await deps.tokenRepo.findByHash(tokenHash);
    if (!token) throw new NotFound('Enlace');
    if (token.revokedAt) throw new PreconditionFailed('Enlace revocado');
    if (token.expiresAt.getTime() < deps.clock.now().getTime()) {
      throw new PreconditionFailed('Enlace caducado');
    }
    if (token.usesLeft <= 0) throw new PreconditionFailed('Enlace agotado');

    const now = deps.clock.now();
    await deps.tokenRepo.consume(token.id, now);

    await deps.audit.write({
      tenantId: token.tenantId,
      actorId: null,
      action: 'portal.session.open',
      resourceType: 'portal_access_token',
      resourceId: token.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: null,
    });

    return {
      tenantId: token.tenantId,
      patientId: token.patientId,
      validUntil: token.expiresAt,
    };
  };
}

// ---------- Vistas restringidas al propio paciente ------------------------

export function makeMyProfileUseCase(deps: { patientRepo: patients.PatientRepository }) {
  return async function myProfile(session: PortalSession) {
    const patient = await deps.patientRepo.findById(session.patientId);
    if (!patient) throw new NotFound('Paciente');
    if (patient.tenantId !== session.tenantId) {
      // Sanidad — el token está atado al tenant; si esto ocurriera, sería bug grave.
      throw new Forbidden('Sesión inválida');
    }
    return patient;
  };
}

export function makeMyUpcomingAppointmentsUseCase(deps: {
  appointmentRepo: scheduling.AppointmentRepository;
  clock: Clock;
}) {
  return async function myUpcomingAppointments(session: PortalSession) {
    const from = deps.clock.now();
    const to = new Date(from.getTime() + 365 * 24 * 60 * 60 * 1000);
    return deps.appointmentRepo.listForPatient({
      patientId: session.patientId,
      from,
      to,
    });
  };
}

export function makeMyInvoicesUseCase(deps: { invoiceRepo: billing.InvoiceRepository }) {
  return async function myInvoices(session: PortalSession) {
    return deps.invoiceRepo.list({ patientId: session.patientId, limit: 50 });
  };
}
