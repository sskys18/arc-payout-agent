// Stable, deterministic keys for the no-double-run / no-double-pay guarantees.
// The ledger's terminal markers are keyed by these strings, so they MUST be pure
// functions of their inputs (no time, no randomness).

// Segments are escaped before joining with ':' so distinct inputs can never
// collide via the delimiter (e.g. ('a:b','c') vs ('a','b:c') map to different keys).
export const esc = (s: string): string => encodeURIComponent(s);

/** Key for a single contractor payout within a run. */
export function payoutKey(runId: string, contractorId: string): string {
  return `payout:${esc(runId)}:${esc(contractorId)}`;
}

/** Key for an entire run on a given local date. */
export function runKey(localDate: string): string {
  return `run:${esc(localDate)}`;
}
