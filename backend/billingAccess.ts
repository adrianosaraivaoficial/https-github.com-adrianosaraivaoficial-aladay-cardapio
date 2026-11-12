// Runtime plans generate monthly charges, including the annual commitment (12 monthly charges).
export function paidAccessUntil(
  invoices: Array<{ status?: string; dueDate?: string }>,
): string | null {
  let latest = 0;
  for (const invoice of invoices) {
    if (
      !['RECEIVED', 'CONFIRMED'].includes(invoice.status || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(invoice.dueDate || '')
    )
      continue;
    const due = new Date(`${invoice.dueDate}T00:00:00.000Z`);
    if (!Number.isFinite(due.getTime()) || due.toISOString().slice(0, 10) !== invoice.dueDate) continue;
    const nextMonth = due.getUTCMonth() + 1;
    const lastDay = new Date(
      Date.UTC(due.getUTCFullYear(), nextMonth + 1, 0),
    ).getUTCDate();
    const end = Date.UTC(
      due.getUTCFullYear(),
      nextMonth,
      Math.min(due.getUTCDate(), lastDay),
    );
    latest = Math.max(latest, end);
  }
  return latest ? new Date(latest).toISOString() : null;
}
