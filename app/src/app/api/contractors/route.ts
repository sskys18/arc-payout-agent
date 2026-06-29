import { NextResponse } from 'next/server';
import { agent, getContractors } from '@/lib/agent';
import type { Cadence } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ contractors: getContractors() });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    const contractor = agent().store.add({
      name: String(body.name ?? ''),
      payoutAddress: String(body.payoutAddress ?? ''),
      amountUsdc: String(body.amountUsdc ?? ''),
      cadence: body.cadence as Cadence,
    });
    return NextResponse.json({ contractor }, { status: 201 });
  } catch (err) {
    // Store validation throws on bad name/address/amount/cadence -> 400.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
