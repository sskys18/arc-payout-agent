// Recurring payout cadence. Date math is done in UTC so scheduling is deterministic
// and independent of the host timezone.

export type Cadence = 'weekly' | 'monthly';

/** The next due date after `from` for the given cadence. */
export function nextDue(cadence: Cadence, from: Date): Date {
  const d = new Date(from.getTime());
  switch (cadence) {
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case 'monthly': {
      // Advance one month, clamping the day to the destination month's length so
      // month-end dates don't overflow (e.g. Jan 31 -> Feb 28/29, not Mar 3).
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      const lastDayOfMonth = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate();
      d.setUTCDate(Math.min(day, lastDayOfMonth));
      return d;
    }
    default: {
      const exhaustive: never = cadence;
      throw new Error(`nextDue: unknown cadence: ${String(exhaustive)}`);
    }
  }
}

/** Due when never paid, or when `now` has reached the next due date after `lastPaidAt`. */
export function isDue(opts: { cadence: Cadence; lastPaidAt: Date | null; now: Date }): boolean {
  const { cadence, lastPaidAt, now } = opts;
  if (lastPaidAt === null) return true;
  return now.getTime() >= nextDue(cadence, lastPaidAt).getTime();
}
