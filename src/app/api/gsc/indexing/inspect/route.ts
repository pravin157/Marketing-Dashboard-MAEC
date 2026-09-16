import { NextRequest, NextResponse } from 'next/server';
import { inspectSingleUrl } from '@/lib/gsc.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const siteUrl = body.siteUrl;
  const url = body.url;

  if (!siteUrl || !url) {
    return NextResponse.json(
      { success: false, error: 'siteUrl and url are required' },
      { status: 400 }
    );
  }

  try {
    const result = await inspectSingleUrl(siteUrl, url);
    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    console.error('Single URL inspection failed:', errorMessage(err));
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
