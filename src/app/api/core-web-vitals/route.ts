import { NextRequest, NextResponse } from 'next/server';
import { fetchCoreWebVitals } from '@/lib/gsc.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url')
    ? decodeURIComponent(searchParams.get('url')!)
    : null;
  const device = searchParams.get('device') || searchParams.get('formFactor') || 'mobile';
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const result = await fetchCoreWebVitals(url, device, forceRefresh);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('Core Web Vitals fetch failed:', errorMessage(err));
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
