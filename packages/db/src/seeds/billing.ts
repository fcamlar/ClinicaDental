/**
 * Seed Sprint 5: serie de facturación, 15 presupuestos en varios estados
 * y 8 facturas con cadena hash íntegra y pagos.
 */

import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const TAX_RATE: Record<string, number> = {
  EXEMPT_HEALTHCARE: 0,
  STANDARD_AESTHETIC: 0.21,
  STANDARD_PRODUCT: 0.21,
  REDUCED: 0.1,
  NOT_SUBJECT: 0,
};

function canonicalize(invoice: {
  identity: { tenantId: string; series: string; number: number; issuedAt: Date };
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRegime: string;
  }>;
  subtotal: number;
  taxTotal: number;
  total: number;
  prevHash: string | null;
}): string {
  return JSON.stringify({
    v: 1,
    tenantId: invoice.identity.tenantId,
    series: invoice.identity.series,
    number: invoice.identity.number,
    issuedAt: invoice.identity.issuedAt.toISOString(),
    lines: invoice.lines,
    subtotal: invoice.subtotal,
    taxTotal: invoice.taxTotal,
    total: invoice.total,
    prevHash: invoice.prevHash,
  });
}

function hashInvoice(...args: Parameters<typeof canonicalize>): string {
  return createHash('sha256').update(canonicalize(...args), 'utf8').digest('hex');
}

export async function seedBilling(args: {
  prisma: PrismaClient;
  tenantId: string;
  clinicId: string;
  userId: string;
}) {
  const { prisma, tenantId, clinicId, userId } = args;
  const year = new Date().getUTCFullYear();
  const seriesCode = `${String(year)}-A`;

  // 1. Serie.
  const series = await prisma.invoiceSeries.upsert({
    where: { tenantId_code: { tenantId, code: seriesCode } },
    update: {},
    create: { tenantId, clinicId, code: seriesCode, lastNumber: 0 },
  });

  // 2. Pacientes y catálogo demo.
  const patients = await prisma.patient.findMany({ where: { tenantId }, take: 20 });
  const treatments = await prisma.treatment.findMany({ where: { tenantId, active: true } });
  if (patients.length === 0 || treatments.length === 0) return;

  // 3. 15 presupuestos.
  const statuses = [
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'ACCEPTED',
    'REJECTED',
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'ACCEPTED',
    'ACCEPTED',
    'DRAFT',
    'SENT',
    'EXPIRED',
    'ACCEPTED',
    'ACCEPTED',
  ] as const;

  for (let i = 0; i < statuses.length; i++) {
    const patient = patients[i % patients.length]!;
    const code = `B-${String(year)}-${String(i + 1).padStart(4, '0')}`;
    const existing = await prisma.budget.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    if (existing) continue;

    // 2-4 líneas por presupuesto.
    const lineCount = 2 + (i % 3);
    const lineData: Array<{
      treatmentId: string;
      description: string;
      toothRef: number | null;
      quantity: number;
      unitPrice: number;
      discount: number;
      taxRegime: 'EXEMPT_HEALTHCARE' | 'STANDARD_AESTHETIC' | 'STANDARD_PRODUCT' | 'REDUCED' | 'NOT_SUBJECT';
      netAmount: number;
      taxAmount: number;
      totalAmount: number;
      position: number;
    }> = [];
    let subtotal = 0;
    let taxTotal = 0;
    for (let j = 0; j < lineCount; j++) {
      const tr = treatments[(i * 3 + j) % treatments.length]!;
      const quantity = 1;
      const discount = j === 0 && i % 4 === 0 ? 0.1 : 0;
      const gross = tr.defaultPrice * quantity;
      const net = Math.round(gross * (1 - discount));
      const tax = Math.round(net * (TAX_RATE[tr.taxRegime] ?? 0));
      lineData.push({
        treatmentId: tr.id,
        description: tr.name,
        toothRef: tr.category === 'Conservadora' || tr.category === 'Endodoncia' ? 16 + (j % 16) : null,
        quantity,
        unitPrice: tr.defaultPrice,
        discount,
        taxRegime: tr.taxRegime as
          | 'EXEMPT_HEALTHCARE'
          | 'STANDARD_AESTHETIC'
          | 'STANDARD_PRODUCT'
          | 'REDUCED'
          | 'NOT_SUBJECT',
        netAmount: net,
        taxAmount: tax,
        totalAmount: net + tax,
        position: j,
      });
      subtotal += net;
      taxTotal += tax;
    }

    const total = subtotal + taxTotal;
    const status = statuses[i]!;
    const issuedAt = new Date(Date.now() - (statuses.length - i) * 86_400_000);
    const acceptedAt = (status as string) === 'ACCEPTED' || (status as string) === 'CONVERTED' ? issuedAt : null;

    await prisma.budget.create({
      data: {
        tenantId,
        clinicId,
        patientId: patient.id,
        code,
        status,
        issuedAt,
        sentAt: status !== 'DRAFT' ? issuedAt : null,
        acceptedAt,
        rejectedAt: status === 'REJECTED' ? issuedAt : null,
        subtotal,
        taxTotal,
        total,
        notes: i % 5 === 0 ? 'Pendiente de aceptación del paciente.' : null,
        createdById: userId,
        lines: { create: lineData.map(({ ...rest }) => ({ ...rest, tenantId })) },
      },
    });
  }

  // 4. 8 facturas — emitidas con cadena hash íntegra.
  const acceptedBudgets = await prisma.budget.findMany({
    where: { tenantId, status: 'ACCEPTED' },
    orderBy: { acceptedAt: 'asc' },
    take: 8,
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  let prevHash: string | null = null;
  let lastNumber = series.lastNumber;
  for (const b of acceptedBudgets) {
    lastNumber += 1;
    const issuedAt = b.acceptedAt ?? new Date();
    const pureLines = b.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      taxRegime: l.taxRegime,
    }));
    const internalHash = hashInvoice({
      identity: { tenantId, series: series.code, number: lastNumber, issuedAt },
      lines: pureLines,
      subtotal: b.subtotal,
      taxTotal: b.taxTotal,
      total: b.total,
      prevHash,
    });

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        clinicId,
        patientId: b.patientId,
        seriesId: series.id,
        number: lastNumber,
        kind: 'STANDARD',
        issuedAt,
        status: 'ISSUED',
        subtotal: b.subtotal,
        taxTotal: b.taxTotal,
        total: b.total,
        prevHash,
        internalHash,
        customerNotes: b.notes,
        createdById: userId,
        lines: {
          create: b.lines.map((l) => ({
            tenantId,
            treatmentId: l.treatmentId,
            description: l.description,
            toothRef: l.toothRef,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            taxRegime: l.taxRegime,
            netAmount: l.netAmount,
            taxAmount: l.taxAmount,
            totalAmount: l.totalAmount,
            position: l.position,
          })),
        },
      },
    });
    prevHash = internalHash;

    await prisma.budget.update({
      where: { id: b.id },
      data: { status: 'CONVERTED', convertedAt: issuedAt, invoiceId: invoice.id },
    });

    // Pago parcial o total alterno.
    const fullyPaid = lastNumber % 2 === 0;
    const amount = fullyPaid ? b.total : Math.round(b.total / 2);
    await prisma.payment.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        method: ['CASH', 'CARD', 'TRANSFER'][lastNumber % 3] as 'CASH' | 'CARD' | 'TRANSFER',
        amount,
        paidAt: issuedAt,
        recordedById: userId,
      },
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        paidTotal: amount,
        status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
      },
    });
  }

  await prisma.invoiceSeries.update({
    where: { id: series.id },
    data: { lastNumber },
  });
}
