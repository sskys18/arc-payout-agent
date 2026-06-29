// Arc testnet transaction primitives. Depends on ethers.
// NOTE: pure-logic tests must NOT import this module (it pulls in ethers).
import { ethers } from 'ethers';

export const ARC_CHAIN_ID = 5042002;

/** A JsonRpcProvider pinned to the Arc testnet chain id. */
export function arcProvider(rpcUrl = 'https://rpc.testnet.arc.network'): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(rpcUrl, { chainId: ARC_CHAIN_ID, name: 'arc-testnet' });
}

const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

/** ABI-encode an ERC-20 `transfer(to, units)` call. */
export function encodeErc20Transfer(to: string, units: bigint): string {
  const iface = new ethers.Interface(ERC20_ABI);
  return iface.encodeFunctionData('transfer', [to, units]);
}

/**
 * Poll for a transaction receipt until confirmed/failed or the timeout elapses.
 * Returns 'pending' if no receipt is seen before the deadline.
 */
export async function pollTxStatus(
  provider: ethers.Provider,
  hash: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<'confirmed' | 'failed' | 'pending'> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const receipt = await provider.getTransactionReceipt(hash);
    if (receipt) {
      return receipt.status === 1 ? 'confirmed' : 'failed';
    }
    if (Date.now() + intervalMs >= deadline) {
      return 'pending';
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
