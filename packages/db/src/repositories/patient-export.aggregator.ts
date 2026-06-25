import type { Prisma, PrismaClient } from '@prisma/client';
import type { patients } from '@castellar/core';

/**
 * Agregador para export RGPD. Compone todas las áreas a partir del modelo
 * Prisma sin hacer joins masivos en una sola query (mejor legibilidad y
 * bajo coste — un paciente individual tiene volúmenes pequeños).
 *
 * Devuelve objetos crudos (no entidades de dominio) — el caso de uso solo
 * empaqueta en JSON, sin lógica adicional.
 */
export class PrismaPatientExportAggregator implements patients.PatientExportAggregator {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async fetch({ patientId }: { patientId: string }) {
    const [
      patient,
      consents,
      alerts,
      files,
      clinicalRecord,
      visits,
      notes,
      odontograms,
      budgets,
      invoices,
      payments,
      appointments,
    ] = await Promise.all([
      this.tx.patient.findUniqueOrThrow({ where: { id: patientId } }),
      this.tx.consent.findMany({ where: { patientId }, orderBy: { signedAt: 'desc' } }),
      this.tx.medicalAlert.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' } }),
      this.tx.file.findMany({
        where: { ownerType: 'PATIENT', ownerId: patientId, deletedAt: null },
        orderBy: { uploadedAt: 'desc' },
      }),
      this.tx.clinicalRecord.findUnique({ where: { patientId } }),
      this.tx.visit.findMany({ where: { patientId }, orderBy: { startedAt: 'desc' } }),
      this.tx.clinicalNote.findMany({
        where: { record: { patientId } },
        orderBy: { createdAt: 'asc' },
      }),
      this.tx.odontogram.findMany({
        where: { visit: { patientId } },
        orderBy: { snapshotAt: 'desc' },
      }),
      this.tx.budget.findMany({
        where: { patientId },
        orderBy: { issuedAt: 'desc' },
        include: { lines: { orderBy: { position: 'asc' } } },
      }),
      this.tx.invoice.findMany({
        where: { patientId },
        orderBy: { issuedAt: 'desc' },
        include: { lines: { orderBy: { position: 'asc' } } },
      }),
      this.tx.payment.findMany({
        where: { invoice: { patientId } },
        orderBy: { paidAt: 'asc' },
      }),
      this.tx.appointment.findMany({
        where: { patientId },
        orderBy: { startsAt: 'desc' },
      }),
    ]);

    return {
      patient,
      consents,
      alerts,
      files,
      clinicalRecord,
      visits,
      notes,
      odontograms,
      budgets,
      invoices,
      payments,
      appointments,
    };
  }
}
