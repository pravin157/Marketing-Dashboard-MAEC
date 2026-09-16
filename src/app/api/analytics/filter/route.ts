import { NextRequest, NextResponse } from 'next/server';
import { getFilteredGA4Data } from '@/lib/analysis.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const filters = body.filters || {};
    const startDate = body.startDate || '90daysAgo';
    const endDate = body.endDate || 'today';
    const data = await getFilteredGA4Data(filters, startDate, endDate);
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    console.error('Filtered GA4 data fetch failed:', errorMessage(err));
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
