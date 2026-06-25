#!/usr/bin/env tsx
/**
 * Castellar — restore drill.
 *
 * Restaura la cadena hash de facturas de un dump de Supabase y verifica
 * integridad. Pensado para correrlo mensualmente contra un proyecto
 * efímero de Supabase con un snapshot reciente.
 *
 * Uso:
 *   DATABASE_MIGRATE_URL=postgres://... pnpm exec tsx scripts/restore-drill.ts
 *
 * Reporta:
 *   - tiempo total
 *   - número de facturas verificadas
 *   - índice de la primera fila corrupta (si la hay)
 */

import { PrismaClient } from '@prisma/client';
import { verifyChain, type IssuedInvoice } from '@castellar/billing';

async function main() {
  const start = Date.now();
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_MIGRATE_URL,
  });

  // Agrupamos por serie (cada cadena es independiente).
  const series = await prisma.invoiceSeries.findMany();
  let totalChecked = 0;
  for (const s of series) {
    const invoices = await prisma.invoice.findMany({
      where: { seriesId: s.id },
      orderBy: { number: 'asc' },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    const chain: IssuedInvoice[] = invoices.map((i) => ({
      identity: {
        tenantId: i.tenantId,
        series: s.code,
        number: i.number,
        issuedAt: i.issuedAt,
      },
      lines: i.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRegime: l.taxRegime,
      })),
      subtotal: i.subtotal,
      taxTotal: i.taxTotal,
      total: i.total,
      paidTotal: i.paidTotal,
      prevHash: i.prevHash,
      internalHash: i.internalHash,
      status: i.status,
    }));
    const bad = verifyChain(chain);
    if (bad >= 0) {
      console.error(
        `❌ Serie ${s.code} (tenant ${s.tenantId}) corrupta en posición ${bad} (invoice ${chain[bad]?.identity.number})`,
      );
      process.exit(1);
    }
    totalChecked += chain.length;
    console.warn(`✓ Serie ${s.code}: ${chain.length} facturas OK`);
  }

  const ms = Date.now() - start;
  console.warn(
    `Drill OK — ${totalChecked} facturas verificadas en ${ms} ms (${series.length} series).`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('restore-drill falló', err);
  process.exit(1);
});
