import { NextResponse } from 'next/server';
import { runAnalytics } from '@/lib/analysis.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  console.log('\nRefreshing dashboard live data...');
  try {
    const payload = await runAnalytics();
    console.log('Refresh complete.');
    return NextResponse.json(payload);
  } catch (err: unknown) {
    console.error('Refresh failed:', errorMessage(err));
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
