import { Resend } from 'resend';
import { Logger } from '@nestjs/common';
import type { identity } from '@castellar/core';

/**
 * Mailer Resend para invitaciones.
 *
 * Email simple en MVP: asunto + cuerpo HTML mínimo. Plantilla React Email
 * llegará en Sprint 2 con `@castellar/mailer`.
 *
 * Si `RESEND_API_KEY` no está definida, el mailer arranca en modo *no-op*
 * (loguea el envío en lugar de mandar email). Permite levantar el servicio
 * en entornos donde Resend aún no esté provisionado (preview deploys,
 * primer despliegue MVP). En producción real la variable debe estar.
 */
export class ResendInvitationMailer implements identity.InvitationMailer {
  private readonly logger = new Logger(ResendInvitationMailer.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY no definida — el mailer arranca en modo no-op (no se envían emails).',
      );
      this.resend = null;
    } else {
      this.resend = new Resend(apiKey);
    }
    this.from = process.env.SMTP_FROM ?? 'no-reply@castellar.app';
  }

  async sendInvitation(args: {
    email: string;
    inviterEmail: string;
    tenantName: string;
    role: identity.Role;
    acceptUrl: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `[no-op mailer] would send invitation to ${args.email} for tenant ${args.tenantName}`,
      );
      return;
    }
    const subject = `Te han invitado a ${args.tenantName} en Castellar`;
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 540px;">
        <h2>Bienvenido a Castellar</h2>
        <p>
          <strong>${escapeHtml(args.inviterEmail)}</strong> te ha invitado a unirte a
          <strong>${escapeHtml(args.tenantName)}</strong> con el rol
          <strong>${args.role}</strong>.
        </p>
        <p>
          Acepta la invitación pulsando este enlace. Caduca en 7 días:
        </p>
        <p>
          <a href="${args.acceptUrl}"
             style="display:inline-block;padding:10px 16px;background:#111827;color:white;border-radius:6px;text-decoration:none;">
            Aceptar invitación
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">
          Si no esperabas este email, ignóralo.
        </p>
      </div>
    `;
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: args.email,
      subject,
      html,
    });
    if (error) throw new Error(`Resend falló: ${error.message}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
