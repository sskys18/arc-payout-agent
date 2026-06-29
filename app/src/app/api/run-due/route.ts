import { NextResponse } from 'next/server';
import { runDue } from '@/lib/agent';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await runDue();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
