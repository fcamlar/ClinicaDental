/**
 * Bounded context `analytics` — KPIs del dashboard.
 *
 * Cobertura del MVP:
 *   - Citas de hoy (count + lista compacta).
 *   - Pacientes nuevos en los últimos 30 días.
 *   - Cobros pendientes (suma de invoice.total - invoice.paidTotal de las ISSUED/PARTIALLY_PAID).
 *   - Facturación del mes actual (sum de invoice.total de las STANDARD, excluye VOIDED y RECTIFICATIVE).
 *   - Ocupación semanal (slot ocupado / total) — solo si tenemos workingHours.
 */

export interface DashboardSummary {
  todayAppointments: {
    count: number;
    upcoming: number;
    completed: number;
  };
  newPatients30d: number;
  pendingPayments: {
    /** Importe pendiente total en céntimos. */
    amountCents: number;
    /** Cantidad de facturas con pendiente. */
    invoiceCount: number;
  };
  monthRevenue: {
    /** Total facturado este mes (céntimos), excluyendo anuladas y rectificativas. */
    amountCents: number;
    /** Total cobrado este mes (céntimos). */
    paidCents: number;
  };
  weeklyOccupancy: {
    /** Minutos ocupados (cita activa) en la última semana. */
    bookedMinutes: number;
    /** Minutos hábiles según working_hours en la última semana. */
    availableMinutes: number;
  };
}

export interface AgendaItem {
  id: string;
  patientName: string;
  professionalId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  reason: string | null;
}

export interface RecentInvoice {
  id: string;
  seriesCode: string;
  number: number;
  patientName: string;
  total: number;
  paidTotal: number;
  status: string;
  issuedAt: Date;
}

export interface PendingInvoice {
  id: string;
  seriesCode: string;
  number: number;
  patientName: string;
  pendingCents: number;
  daysOverdue: number;
}
