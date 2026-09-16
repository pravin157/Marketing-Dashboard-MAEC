import { NextResponse } from 'next/server';
import { runGA4Countries } from '@/lib/analysis.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const rows = await runGA4Countries();
    return NextResponse.json({ data: rows });
  } catch (err: unknown) {
    console.error('Countries fetch failed:', errorMessage(err));
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
