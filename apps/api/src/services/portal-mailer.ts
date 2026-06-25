import { Resend } from 'resend';
import type { portal } from '@castellar/core';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class ResendPortalMailer implements portal.PortalMailer {
  private readonly resend: Resend;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY no definida');
    this.resend = new Resend(apiKey);
    this.from = process.env.SMTP_FROM ?? 'no-reply@castellar.app';
  }

  async sendAccessLink(args: {
    to: string;
    patientName: string;
    clinicName: string;
    portalUrl: string;
    validHours: number;
  }): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: args.to,
      subject: `Acceso a tu portal de paciente — ${args.clinicName}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 540px;">
          <h2>Hola ${escapeHtml(args.patientName)}</h2>
          <p>
            Tu clínica <strong>${escapeHtml(args.clinicName)}</strong> te ha generado un
            enlace de acceso al portal del paciente para que consultes tus próximas citas,
            tus facturas y firmes consentimientos online.
          </p>
          <p>
            <a href="${args.portalUrl}"
               style="display:inline-block;padding:10px 16px;background:#111827;color:white;border-radius:6px;text-decoration:none;">
              Acceder al portal
            </a>
          </p>
          <p style="color:#6b7280;font-size:13px;">
            El enlace caduca en ${args.validHours} horas y permite varios accesos.
          </p>
        </div>
      `,
    });
    if (error) throw new Error(`Resend portal link falló: ${error.message}`);
  }
}
