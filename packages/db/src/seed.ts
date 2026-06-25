/* eslint-disable no-console */
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { DEMO_TREATMENTS } from './seeds/treatments.js';
import { generateDemoPatients } from './seeds/patients.js';
import { seedAppointments } from './seeds/appointments.js';
import { seedClinical } from './seeds/clinical.js';
import { seedBilling } from './seeds/billing.js';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_MIGRATE_URL,
});

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CLINIC_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const ROOM_1 = 'r1111111-1111-1111-1111-111111111111'.replace(/^./, 'b');
const ROOM_2 = 'r2222222-2222-2222-2222-222222222222'.replace(/^./, 'b');
const PROF_DENTIST = 'd0000000-0000-0000-0000-000000000001';
const PROF_DENTIST_2 = 'd0000000-0000-0000-0000-000000000002';
const PROF_HYG = 'd0000000-0000-0000-0000-000000000003';

const ROLES = [
  { id: '10000000-0000-0000-0000-000000000001', email: 'owner@castellar.demo', role: 'OWNER' as const },
  { id: '10000000-0000-0000-0000-000000000002', email: 'admin@castellar.demo', role: 'ADMIN_CLINIC' as const },
  { id: '10000000-0000-0000-0000-000000000003', email: 'dentist@castellar.demo', role: 'DENTIST' as const },
  { id: '10000000-0000-0000-0000-000000000004', email: 'hygienist@castellar.demo', role: 'HYGIENIST' as const },
  { id: '10000000-0000-0000-0000-000000000005', email: 'reception@castellar.demo', role: 'RECEPTION' as const },
  { id: '10000000-0000-0000-0000-000000000006', email: 'accounting@castellar.demo', role: 'ACCOUNTING' as const },
];

function hashNationalId(raw: string): string {
  return createHash('sha256').update(raw.trim().replace(/[\s-]/g, '').toUpperCase(), 'utf8').digest('hex');
}

async function main() {
  console.warn('🌱 Sembrando Sprints 1-3…');

  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: 'Castellar Demo',
      country: 'ES',
      locale: 'es-ES',
      plan: 'free',
    },
  });

  const clinic = await prisma.clinic.upsert({
    where: { id: CLINIC_ID },
    update: {},
    create: {
      id: CLINIC_ID,
      tenantId: tenant.id,
      name: 'Sede Castellar Madrid',
      address: 'Calle de la Demo 1, 28001 Madrid',
      vatId: 'B12345678',
      timezone: 'Europe/Madrid',
    },
  });

  for (const r of ROLES) {
    const user = await prisma.user.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        tenantId: tenant.id,
        supabaseUserId: r.id,
        email: r.email,
        role: r.role,
        status: 'ACTIVE',
      },
    });
    await prisma.clinicMember.upsert({
      where: { userId_clinicId: { userId: user.id, clinicId: clinic.id } },
      update: { role: r.role },
      create: { userId: user.id, clinicId: clinic.id, role: r.role },
    });
    await prisma.userSecurity.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        mfaRequired: ['OWNER', 'ADMIN_CLINIC', 'DENTIST', 'HYGIENIST'].includes(r.role),
        mfaEnrolledAt: new Date('2026-06-01T09:00:00Z'),
      },
    });
  }

  // Profesionales (cada uno apunta a un user existente con el mismo rol clínico).
  const dentistUser = ROLES.find((r) => r.id.endsWith('003'))!;
  const adminUser = ROLES.find((r) => r.id.endsWith('002'))!; // segundo dentista demo
  const hygUser = ROLES.find((r) => r.id.endsWith('004'))!;

  const professionals = [
    { id: PROF_DENTIST, userId: dentistUser.id, specialty: 'Odontología general', color: '#0ea5e9' },
    { id: PROF_DENTIST_2, userId: adminUser.id, specialty: 'Endodoncia', color: '#8b5cf6' },
    { id: PROF_HYG, userId: hygUser.id, specialty: 'Higiene', color: '#10b981' },
  ];
  for (const p of professionals) {
    await prisma.professional.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        tenantId: tenant.id,
        userId: p.userId,
        specialty: p.specialty,
        color: p.color,
      },
    });
  }

  // Salas
  const rooms = [
    { id: 'b1111111-1111-1111-1111-111111111111', name: 'Gabinete 1' },
    { id: 'b2222222-2222-2222-2222-222222222222', name: 'Gabinete 2' },
  ];
  for (const r of rooms) {
    await prisma.room.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        tenantId: tenant.id,
        clinicId: clinic.id,
        name: r.name,
      },
    });
  }

  // Working hours: L–V 09:00–14:00 y 16:00–20:00 para los 3.
  for (const p of professionals) {
    await prisma.workingHours.deleteMany({ where: { professionalId: p.id, clinicId: clinic.id } });
    for (const dow of [1, 2, 3, 4, 5]) {
      await prisma.workingHours.createMany({
        data: [
          { tenantId: tenant.id, professionalId: p.id, clinicId: clinic.id, dayOfWeek: dow, startMinute: 9 * 60, endMinute: 14 * 60 },
          { tenantId: tenant.id, professionalId: p.id, clinicId: clinic.id, dayOfWeek: dow, startMinute: 16 * 60, endMinute: 20 * 60 },
        ],
      });
    }
  }
  console.warn(`✔ ${professionals.length} profesionales + ${rooms.length} salas + horarios`);

  // Catálogo de tratamientos
  for (const t of DEMO_TREATMENTS) {
    await prisma.treatment.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: t.code } },
      update: {
        name: t.name,
        defaultPrice: t.defaultPrice,
        taxRegime: t.taxRegime,
        category: t.category ?? null,
        active: t.active,
      },
      create: {
        tenantId: tenant.id,
        code: t.code,
        name: t.name,
        description: t.description,
        defaultPrice: t.defaultPrice,
        taxRegime: t.taxRegime,
        category: t.category ?? null,
        active: t.active,
      },
    });
  }
  console.warn(`✔ ${DEMO_TREATMENTS.length} tratamientos`);

  // Pacientes
  const owner = ROLES.find((r) => r.role === 'OWNER')!;
  const patients = generateDemoPatients(50);
  for (const p of patients) {
    const patient = await prisma.patient.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
      update: {},
      create: {
        tenantId: tenant.id,
        clinicId: clinic.id,
        code: p.code,
        firstName: p.firstName,
        lastName: p.lastName,
        nationalId: p.nationalId,
        nationalIdHash: hashNationalId(p.nationalId),
        birthDate: p.birthDate,
        sex: p.sex,
        email: p.email,
        phone: p.phone,
        city: p.city,
        country: 'ES',
        gdprConsentAt: new Date('2026-06-01T09:00:00Z'),
        marketingConsent: false,
      },
    });
    if (p.addAlerts) {
      for (const a of p.addAlerts) {
        const exists = await prisma.medicalAlert.findFirst({
          where: { patientId: patient.id, label: a.label },
        });
        if (!exists) {
          await prisma.medicalAlert.create({
            data: {
              tenantId: tenant.id,
              patientId: patient.id,
              severity: a.severity,
              category: a.category,
              label: a.label,
              createdById: owner.id,
            },
          });
        }
      }
    }
  }
  console.warn(`✔ ${patients.length} pacientes`);

  await seedAppointments({ prisma, tenantId: tenant.id, clinicId: clinic.id, count: 200 });
  const appCount = await prisma.appointment.count({ where: { tenantId: tenant.id } });
  console.warn(`✔ ${appCount} citas`);

  const dentistRole = ROLES.find((r) => r.role === 'DENTIST')!;
  await seedClinical({
    prisma,
    tenantId: tenant.id,
    authorId: dentistRole.id,
    professionalId: PROF_DENTIST,
  });
  const visitCount = await prisma.visit.count({ where: { tenantId: tenant.id } });
  console.warn(`✔ ${visitCount} visitas clínicas`);

  const accountingRole = ROLES.find((r) => r.role === 'ACCOUNTING')!;
  await seedBilling({
    prisma,
    tenantId: tenant.id,
    clinicId: clinic.id,
    userId: accountingRole.id,
  });
  const invoiceCount = await prisma.invoice.count({ where: { tenantId: tenant.id } });
  const budgetCount = await prisma.budget.count({ where: { tenantId: tenant.id } });
  console.warn(`✔ ${budgetCount} presupuestos, ${invoiceCount} facturas`);

  console.warn('Listo.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
