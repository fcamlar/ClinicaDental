/**
 * Seed clinical: para los primeros 10 pacientes que tengan al menos una cita
 * COMPLETED, abrimos su historia clínica, creamos 1–3 visitas y añadimos
 * notas + un odontograma con hallazgos variados.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

const NOTE_BODIES = [
  'Paciente acude para revisión. Higiene aceptable, sin caries visibles. Recomendado mantenimiento en 6 meses.',
  'Se realiza limpieza dental. Sangrado leve en sextante 3. Se entrega cepillo interdental.',
  'Caries oclusal en 26. Se realiza obturación con composite. Indicado evitar comer durante 1 hora.',
  'Control de ortodoncia. Cambio de gomas. Próxima cita en 4 semanas.',
  'Endodoncia en 36. Se completa instrumentación y obturación de conductos. Próxima visita para corona.',
];

const SAMPLE_ODONTOGRAMS: Array<Record<string, unknown>> = [
  { '26': { surfaces: { occlusal: { condition: 'FILLING' } } } },
  {
    '16': { surfaces: { occlusal: { condition: 'CARIES' } } },
    '47': { whole: 'EXTRACTION_PLANNED' },
  },
  {
    '36': { surfaces: { mesial: { condition: 'ENDODONTICS' } } },
    '11': { whole: 'CROWN' },
  },
  { '46': { whole: 'IMPLANT' } },
  {},
];

export async function seedClinical(args: {
  prisma: PrismaClient;
  tenantId: string;
  authorId: string;
  professionalId: string;
}) {
  const { prisma, tenantId, authorId, professionalId } = args;

  const completedAppointments = await prisma.appointment.findMany({
    where: { tenantId, status: 'COMPLETED' },
    orderBy: { startsAt: 'asc' },
    take: 20,
  });

  const seenPatients = new Set<string>();
  for (const a of completedAppointments) {
    if (seenPatients.has(a.patientId)) continue;
    if (seenPatients.size >= 10) break;
    seenPatients.add(a.patientId);

    // 1. ClinicalRecord
    const record = await prisma.clinicalRecord.upsert({
      where: { patientId: a.patientId },
      update: {},
      create: { tenantId, patientId: a.patientId },
    });

    // 2. Visita ligada a la cita.
    const existingVisit = await prisma.visit.findUnique({ where: { appointmentId: a.id } });
    const visit =
      existingVisit ??
      (await prisma.visit.create({
        data: {
          tenantId,
          recordId: record.id,
          patientId: a.patientId,
          professionalId,
          appointmentId: a.id,
          startedAt: a.startsAt,
          closedAt: a.completedAt ?? new Date(a.startsAt.getTime() + 30 * 60_000),
          status: 'CLOSED',
          motive: a.reason ?? 'Visita programada',
        },
      }));

    // 3. 1–2 notas con lockedAt si han pasado 24h.
    const noteCount = (seenPatients.size % 2) + 1;
    for (let i = 0; i < noteCount; i++) {
      const body = NOTE_BODIES[(seenPatients.size + i) % NOTE_BODIES.length]!;
      const createdAt = new Date(a.startsAt.getTime() + i * 60_000);
      const isLocked = Date.now() - createdAt.getTime() > 24 * 60 * 60 * 1000;
      await prisma.clinicalNote.create({
        data: {
          tenantId,
          recordId: record.id,
          visitId: visit.id,
          authorId,
          type: i === 0 ? 'EVOLUTION' : 'TREATMENT_PLAN',
          body,
          parentNoteId: null,
          lockedAt: isLocked ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000) : null,
          createdAt,
          updatedAt: createdAt,
        },
      });
    }

    // 4. Odontograma snapshot (la visita está CLOSED → inmutable).
    const state = SAMPLE_ODONTOGRAMS[seenPatients.size % SAMPLE_ODONTOGRAMS.length];
    const odontogramExists = await prisma.odontogram.findUnique({ where: { visitId: visit.id } });
    if (!odontogramExists && state) {
      await prisma.odontogram.create({
        data: {
          tenantId,
          visitId: visit.id,
          stateJson: state as Prisma.InputJsonValue,
        },
      });
    }
  }
}
