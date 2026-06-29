import { NextResponse } from 'next/server';
import { getHistory } from '@/lib/agent';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ receipts: getHistory() });
}
