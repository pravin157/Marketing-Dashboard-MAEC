import { NextRequest, NextResponse } from 'next/server';
import { analyzePageSpeed } from '@/lib/pagespeed.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, strategy, refresh } = body || {};
    const forceRefresh = refresh === true || body?.forceRefresh === true;
    const result = await analyzePageSpeed(url, strategy, forceRefresh);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('PageSpeed analysis failed:', errorMessage(err));
    const statusCode = errorMessage(err).includes('Invalid URL') ? 400 : 500;
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: statusCode });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url')
    ? decodeURIComponent(searchParams.get('url')!)
    : null;
  const strategy = searchParams.get('strategy') || searchParams.get('device') || 'mobile';
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const result = await analyzePageSpeed(url, strategy, forceRefresh);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('PageSpeed analysis GET failed:', errorMessage(err));
    const statusCode = errorMessage(err).includes('Invalid URL') ? 400 : 500;
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: statusCode });
  }
}
