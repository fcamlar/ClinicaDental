import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import {
  formatCents,
  formatDate,
  type PdfBudgetData,
  type PdfInvoiceData,
  type PdfLine,
  type PdfPartyInfo,
} from './types.js';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  brand: { fontSize: 16, fontWeight: 700 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  subline: { color: '#555', fontSize: 9 },
  twoColumns: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  block: { width: '48%' },
  blockTitle: { fontSize: 9, color: '#555', marginBottom: 4, textTransform: 'uppercase' },
  table: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#ddd' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingVertical: 4,
    fontWeight: 700,
    fontSize: 9,
    backgroundColor: '#fafafa',
  },
  cellDesc: { width: '40%', paddingHorizontal: 4 },
  cellSmall: { width: '10%', paddingHorizontal: 4, textAlign: 'right' },
  cellSmallLeft: { width: '10%', paddingHorizontal: 4 },
  cellLarge: { width: '20%', paddingHorizontal: 4, textAlign: 'right' },
  totals: {
    marginTop: 12,
    width: '40%',
    marginLeft: 'auto',
    borderTopWidth: 1,
    borderTopColor: '#111',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#111',
    fontSize: 12,
    fontWeight: 700,
  },
  footer: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 24,
    fontSize: 8,
    color: '#777',
    textAlign: 'center',
  },
  hash: { fontFamily: 'Courier', fontSize: 8, color: '#666', marginTop: 4 },
  notes: {
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    color: '#333',
  },
});

function Party({ title, info }: { title: string; info: PdfPartyInfo }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={{ fontWeight: 700 }}>{info.name}</Text>
      {info.nationalId && <Text>{info.nationalId}</Text>}
      {info.address && <Text>{info.address}</Text>}
      {(info.postalCode || info.city) && (
        <Text>
          {[info.postalCode, info.city].filter(Boolean).join(' ')}
        </Text>
      )}
      {info.email && <Text style={styles.subline}>{info.email}</Text>}
    </View>
  );
}

function LinesTable({ lines, locale }: { lines: PdfLine[]; locale: string }) {
  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <Text style={styles.cellDesc}>Concepto</Text>
        <Text style={styles.cellSmallLeft}>Pieza</Text>
        <Text style={styles.cellSmall}>Cant.</Text>
        <Text style={styles.cellSmall}>Precio</Text>
        <Text style={styles.cellSmall}>Dto.</Text>
        <Text style={styles.cellLarge}>Importe</Text>
      </View>
      {lines.map((l, i) => (
        <View key={i} style={styles.row} wrap={false}>
          <Text style={styles.cellDesc}>{l.description}</Text>
          <Text style={styles.cellSmallLeft}>{l.toothRef ?? ''}</Text>
          <Text style={styles.cellSmall}>{l.quantity}</Text>
          <Text style={styles.cellSmall}>{formatCents(l.unitPrice, locale)}</Text>
          <Text style={styles.cellSmall}>
            {l.discount > 0 ? `${Math.round(l.discount * 100)}%` : '—'}
          </Text>
          <Text style={styles.cellLarge}>{formatCents(l.totalAmount, locale)}</Text>
        </View>
      ))}
    </View>
  );
}

export function InvoiceDocument({ data }: { data: PdfInvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.clinic.name}</Text>
            {data.clinic.vatId && <Text style={styles.subline}>{data.clinic.vatId}</Text>}
            {data.clinic.address && <Text style={styles.subline}>{data.clinic.address}</Text>}
          </View>
          <View>
            <Text style={styles.title}>{data.documentTitle}</Text>
            <Text style={styles.subline}>Nº {data.reference}</Text>
            <Text style={styles.subline}>{formatDate(data.issuedAt, data.locale)}</Text>
            {data.rectifiesReference && (
              <Text style={styles.subline}>Rectifica: {data.rectifiesReference}</Text>
            )}
          </View>
        </View>

        <View style={styles.twoColumns}>
          <Party title="Emisor" info={data.clinic as unknown as PdfPartyInfo} />
          <Party title="Cliente" info={data.customer} />
        </View>

        <LinesTable lines={data.lines} locale={data.locale} />

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Base imponible</Text>
            <Text>{formatCents(data.totals.subtotal, data.locale)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>IVA</Text>
            <Text>{formatCents(data.totals.taxTotal, data.locale)}</Text>
          </View>
          <View style={styles.grandTotal}>
            <Text>Total</Text>
            <Text>{formatCents(data.totals.total, data.locale)}</Text>
          </View>
          {typeof data.totals.paidTotal === 'number' && (
            <View style={styles.totalRow}>
              <Text>Pagado</Text>
              <Text>{formatCents(data.totals.paidTotal, data.locale)}</Text>
            </View>
          )}
          {typeof data.totals.paidTotal === 'number' &&
            data.totals.paidTotal < data.totals.total && (
              <View style={styles.totalRow}>
                <Text style={{ fontWeight: 700 }}>Pendiente</Text>
                <Text style={{ fontWeight: 700 }}>
                  {formatCents(data.totals.total - data.totals.paidTotal, data.locale)}
                </Text>
              </View>
            )}
        </View>

        {data.notes && (
          <View style={styles.notes}>
            <Text>{data.notes}</Text>
          </View>
        )}

        <Text style={styles.footer} fixed>
          Castellar · Documento generado electrónicamente. Integridad: {data.internalHashShort}
        </Text>
      </Page>
    </Document>
  );
}

export function BudgetDocument({ data }: { data: PdfBudgetData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.clinic.name}</Text>
            {data.clinic.vatId && <Text style={styles.subline}>{data.clinic.vatId}</Text>}
            {data.clinic.address && <Text style={styles.subline}>{data.clinic.address}</Text>}
          </View>
          <View>
            <Text style={styles.title}>{data.documentTitle}</Text>
            <Text style={styles.subline}>Nº {data.reference}</Text>
            <Text style={styles.subline}>{formatDate(data.issuedAt, data.locale)}</Text>
            {data.validUntil && (
              <Text style={styles.subline}>
                Válido hasta {formatDate(data.validUntil, data.locale)}
              </Text>
            )}
            <Text style={styles.subline}>Estado: {data.status}</Text>
          </View>
        </View>

        <View style={styles.twoColumns}>
          <Party title="Emisor" info={data.clinic as unknown as PdfPartyInfo} />
          <Party title="Paciente" info={data.customer} />
        </View>

        <LinesTable lines={data.lines} locale={data.locale} />

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Base imponible</Text>
            <Text>{formatCents(data.totals.subtotal, data.locale)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>IVA</Text>
            <Text>{formatCents(data.totals.taxTotal, data.locale)}</Text>
          </View>
          <View style={styles.grandTotal}>
            <Text>Total</Text>
            <Text>{formatCents(data.totals.total, data.locale)}</Text>
          </View>
        </View>

        {data.notes && (
          <View style={styles.notes}>
            <Text>{data.notes}</Text>
          </View>
        )}

        <Text style={styles.footer} fixed>
          Castellar · Presupuesto orientativo. La aceptación se formaliza por escrito.
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Genera el PDF y devuelve un Buffer Node compatible.
 *
 * En entornos serverless (Cloudflare Pages, Render) react-pdf usa Skia/WASM —
 * lo invocaremos desde el API NestJS (Node) tras pulsar "descargar PDF".
 */
export async function renderInvoicePdf(data: PdfInvoiceData): Promise<Uint8Array> {
  return renderToUint8Array(InvoiceDocument({ data }));
}

export async function renderBudgetPdf(data: PdfBudgetData): Promise<Uint8Array> {
  return renderToUint8Array(BudgetDocument({ data }));
}

async function renderToUint8Array(element: ReactElement): Promise<Uint8Array> {
  const instance = pdf(element);
  const blob = await instance.toBlob();
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}
