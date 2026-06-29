// Contractor registry for recurring USDC payouts.
//
// Validation is strict at the boundary so the planner/runner downstream can trust
// every stored record: names are non-empty, payout addresses are real EVM addresses
// stored in checksum form, amounts are clean positive USDC decimals, and cadence is
// one of the two supported recurrences. Invalid input throws — we never store junk.
import { randomUUID } from 'node:crypto';
import { ethers } from 'ethers';
import { assertPositiveAmount } from '../amounts.ts';
import type { Cadence } from '../cadence.ts';

export type Contractor = {
  id: string;
  name: string;
  payoutAddress: string;
  amountUsdc: string;
  cadence: Cadence;
  lastPaidAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Fields accepted when adding a contractor. `id`/`lastPaidAt`/`active` are optional. */
export type AddContractorInput = {
  id?: string;
  name: string;
  payoutAddress: string;
  amountUsdc: string;
  cadence: Cadence;
  lastPaidAt?: string | null;
  active?: boolean;
};

/** Mutable subset accepted by `update`. */
export type UpdateContractorPatch = Partial<
  Pick<Contractor, 'name' | 'payoutAddress' | 'amountUsdc' | 'cadence' | 'lastPaidAt' | 'active'>
>;

export interface ContractorStore {
  add(input: AddContractorInput): Contractor;
  update(id: string, patch: UpdateContractorPatch): Contractor;
  deactivate(id: string): void;
  get(id: string): Contractor | undefined;
  list(): Contractor[];
}

/** Validate the business fields and return the checksum-normalized payout address. */
function validateBusinessFields(fields: {
  name: string;
  payoutAddress: string;
  amountUsdc: string;
  cadence: Cadence;
}): { payoutAddress: string } {
  if (typeof fields.name !== 'string' || fields.name.trim() === '') {
    throw new Error('Contractor: name must be non-empty');
  }
  if (typeof fields.payoutAddress !== 'string' || !ethers.isAddress(fields.payoutAddress)) {
    throw new Error(`Contractor: invalid payout address: ${JSON.stringify(fields.payoutAddress)}`);
  }
  // Throws on empty / negative / NaN / over-precision / zero.
  assertPositiveAmount(fields.amountUsdc);
  if (fields.cadence !== 'weekly' && fields.cadence !== 'monthly') {
    throw new Error(`Contractor: invalid cadence: ${JSON.stringify(fields.cadence)}`);
  }
  return { payoutAddress: ethers.getAddress(fields.payoutAddress) };
}

/** Volatile contractor registry for tests, dry runs, and single-process use. */
export class InMemoryContractorStore implements ContractorStore {
  private readonly map = new Map<string, Contractor>();

  add(input: AddContractorInput): Contractor {
    const { payoutAddress } = validateBusinessFields({
      name: input.name,
      payoutAddress: input.payoutAddress,
      amountUsdc: input.amountUsdc,
      cadence: input.cadence,
    });
    const id = input.id ?? randomUUID();
    if (this.map.has(id)) {
      throw new Error(`Contractor: id already exists: ${id}`);
    }
    const ts = new Date().toISOString();
    const record: Contractor = {
      id,
      name: input.name.trim(),
      payoutAddress,
      amountUsdc: input.amountUsdc.trim(),
      cadence: input.cadence,
      lastPaidAt: input.lastPaidAt ?? null,
      active: input.active ?? true,
      createdAt: ts,
      updatedAt: ts,
    };
    this.map.set(id, record);
    return { ...record };
  }

  update(id: string, patch: UpdateContractorPatch): Contractor {
    const existing = this.map.get(id);
    if (!existing) {
      throw new Error(`Contractor: not found: ${id}`);
    }
    const merged = { ...existing, ...patch };
    const { payoutAddress } = validateBusinessFields({
      name: merged.name,
      payoutAddress: merged.payoutAddress,
      amountUsdc: merged.amountUsdc,
      cadence: merged.cadence,
    });
    const updated: Contractor = {
      ...merged,
      id: existing.id,
      name: merged.name.trim(),
      payoutAddress,
      amountUsdc: merged.amountUsdc.trim(),
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.map.set(id, updated);
    return { ...updated };
  }

  deactivate(id: string): void {
    const existing = this.map.get(id);
    if (!existing) {
      throw new Error(`Contractor: not found: ${id}`);
    }
    this.map.set(id, { ...existing, active: false, updatedAt: new Date().toISOString() });
  }

  get(id: string): Contractor | undefined {
    const found = this.map.get(id);
    return found ? { ...found } : undefined;
  }

  list(): Contractor[] {
    return [...this.map.values()].map((c) => ({ ...c }));
  }
}
