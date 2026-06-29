// USDC-style fixed-point amount helpers. Default 6 decimals (USDC).
// All parsing is strict: we reject anything that is not a clean, non-negative
// decimal string within the allowed precision so callers never silently lose value.

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/**
 * Parse a human decimal string into integer base units.
 * Throws on empty, negative, NaN/garbage, or more than `decimals` fractional digits.
 */
export function parseUnits(decimal: string, decimals = 6): bigint {
  if (typeof decimal !== 'string' || decimal.trim() === '') {
    throw new Error('parseUnits: empty amount');
  }
  const s = decimal.trim();
  if (s.startsWith('-')) {
    throw new Error(`parseUnits: negative amount not allowed: ${s}`);
  }
  if (!DECIMAL_RE.test(s)) {
    throw new Error(`parseUnits: invalid decimal: ${s}`);
  }
  const [intPart, fracPart = ''] = s.split('.');
  if (fracPart.length > decimals) {
    throw new Error(`parseUnits: too many fractional digits (max ${decimals}): ${s}`);
  }
  const padded = fracPart.padEnd(decimals, '0');
  return BigInt(intPart + padded);
}

/** Format integer base units back into a trimmed decimal string. */
export function formatUnits(units: bigint, decimals = 6): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const intPart = abs / base;
  const fracUnits = abs % base;
  let out = intPart.toString();
  if (decimals > 0) {
    const frac = fracUnits.toString().padStart(decimals, '0').replace(/0+$/, '');
    if (frac) out += `.${frac}`;
  }
  return neg ? `-${out}` : out;
}

/** Throw unless `decimal` parses to a strictly positive amount. */
export function assertPositiveAmount(decimal: string): void {
  const units = parseUnits(decimal);
  if (units <= 0n) {
    throw new Error(`assertPositiveAmount: amount must be > 0: ${decimal}`);
  }
}
