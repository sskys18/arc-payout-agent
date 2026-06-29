// Payout signer abstraction. Two implementations:
//  - EoaFallbackSigner: a LOCAL DEV / FALLBACK path that signs ERC-20 transfers with a
//    raw EOA private key via ethers. This is NOT the production custody path.
//  - CircleWalletsSigner: the intended production path via Circle Programmable Wallets.
//    It is a stub until real API credentials are wired (human-blocked).
import { ethers } from 'ethers';
import { encodeErc20Transfer, arcProvider } from './txEngine.ts';

export interface PayoutSigner {
  address(): Promise<string>;
  submitUsdcTransfer(args: {
    usdc: string;
    to: string;
    units: bigint;
    idempotencyKey: string;
  }): Promise<{ txHash: string }>;
}

/**
 * LOCAL DEV / FALLBACK signer. Holds a raw EOA private key and submits a plain
 * ERC-20 transfer. The `idempotencyKey` is advisory here (on-chain nonces provide
 * replay protection); the Circle path uses it as a true idempotency token.
 *
 * Do NOT use this for real contractor funds — it exists for local testnet dev only.
 */
export class EoaFallbackSigner implements PayoutSigner {
  private readonly wallet: ethers.Wallet;

  constructor(privateKey: string, provider: ethers.Provider) {
    this.wallet = new ethers.Wallet(privateKey, provider);
  }

  async address(): Promise<string> {
    return this.wallet.address;
  }

  async submitUsdcTransfer(args: {
    usdc: string;
    to: string;
    units: bigint;
    idempotencyKey: string;
  }): Promise<{ txHash: string }> {
    const data = encodeErc20Transfer(args.to, args.units);
    const tx = await this.wallet.sendTransaction({ to: args.usdc, data });
    return { txHash: tx.hash };
  }
}

/**
 * Production Circle Programmable Wallets signer. Interface stub: every method throws
 * until real Circle Wallets API credentials and SDK calls are wired in.
 */
export class CircleWalletsSigner implements PayoutSigner {
  constructor(_config: { apiKey: string; walletId?: string }) {
    // Credentials captured for the future real implementation; nothing to do yet.
  }

  async address(): Promise<string> {
    throw new Error('Circle Wallets API access required (human-blocked)');
  }

  async submitUsdcTransfer(_args: {
    usdc: string;
    to: string;
    units: bigint;
    idempotencyKey: string;
  }): Promise<{ txHash: string }> {
    throw new Error('Circle Wallets API access required (human-blocked)');
  }
}

export interface SignerEnv {
  CIRCLE_API_KEY?: string;
  CIRCLE_WALLET_ID?: string;
  EOA_PRIVATE_KEY?: string;
  RPC_URL?: string;
}

/** Pick the Circle signer when CIRCLE_API_KEY is present, else the EOA fallback. */
export function makeSigner(env: SignerEnv): PayoutSigner {
  if (env.CIRCLE_API_KEY) {
    return new CircleWalletsSigner({ apiKey: env.CIRCLE_API_KEY, walletId: env.CIRCLE_WALLET_ID });
  }
  const pk = env.EOA_PRIVATE_KEY;
  if (!pk) {
    throw new Error('makeSigner: EOA_PRIVATE_KEY required for the EOA fallback when CIRCLE_API_KEY is absent');
  }
  return new EoaFallbackSigner(pk, arcProvider(env.RPC_URL));
}
