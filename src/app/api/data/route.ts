import { NextResponse } from 'next/server';
import { runAnalytics } from '@/lib/analysis.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const payload = await runAnalytics();
    return NextResponse.json(payload);
  } catch (err: unknown) {
    console.error('Data fetch failed:', errorMessage(err));
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
