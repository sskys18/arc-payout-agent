import { NextResponse } from 'next/server';
import { agent } from '@/lib/agent';
import type { Cadence, ContractorDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const store = agent().store;
  if (!store.get(id)) {
    return NextResponse.json({ error: `contractor not found: ${id}` }, { status: 404 });
  }

  // Build a patch from only the provided fields.
  const patch: Partial<Pick<ContractorDTO, 'name' | 'payoutAddress' | 'amountUsdc' | 'cadence' | 'active'>> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.payoutAddress !== undefined) patch.payoutAddress = String(body.payoutAddress);
  if (body.amountUsdc !== undefined) patch.amountUsdc = String(body.amountUsdc);
  if (body.cadence !== undefined) patch.cadence = body.cadence as Cadence;
  if (body.active !== undefined) patch.active = Boolean(body.active);

  try {
    const contractor = store.update(id, patch);
    return NextResponse.json({ contractor });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const store = agent().store;
  if (!store.get(id)) {
    return NextResponse.json({ error: `contractor not found: ${id}` }, { status: 404 });
  }
  try {
    store.deactivate(id);
    return NextResponse.json({ contractor: store.get(id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
