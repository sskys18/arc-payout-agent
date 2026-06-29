// Arc testnet block explorer URL helpers.

export const ARCSCAN_BASE = 'https://testnet.arcscan.app';

const HEX_RE = /^0x[0-9a-fA-F]+$/;

/** Explorer URL for a transaction. Throws on empty or non-0x-hex hashes. */
export function txUrl(hash: string): string {
  if (!hash || !HEX_RE.test(hash)) {
    throw new Error(`txUrl: invalid tx hash: ${JSON.stringify(hash)}`);
  }
  return `${ARCSCAN_BASE}/tx/${hash}`;
}

/** Explorer URL for an address. Throws on empty or non-0x-hex addresses. */
export function addressUrl(addr: string): string {
  if (!addr || !HEX_RE.test(addr)) {
    throw new Error(`addressUrl: invalid address: ${JSON.stringify(addr)}`);
  }
  return `${ARCSCAN_BASE}/address/${addr}`;
}
