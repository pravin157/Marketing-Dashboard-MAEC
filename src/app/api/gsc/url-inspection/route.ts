import { NextRequest, NextResponse } from 'next/server';
import {
  inspectSingleUrlWithCache,
  isUrlInProperty,
  mapUrlInspectionError,
} from '@/lib/gsc.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const body = await req.json();
  const url = body.url;
  const forceRefresh = searchParams.get('refresh') === 'true';

  if (!url) {
    return NextResponse.json(
      { success: false, error: 'Please enter a URL.' },
      { status: 400 }
    );
  }

  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      { success: false, error: 'Please enter a valid URL.' },
      { status: 400 }
    );
  }

  const siteUrl = body.siteUrl || searchParams.get('siteUrl') || process.env.GSC_SITE_URL;
  if (!siteUrl) {
    return NextResponse.json(
      { success: false, error: 'Search Console property is not configured.' },
      { status: 400 }
    );
  }

  if (!isUrlInProperty(url, siteUrl)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Please enter a URL belonging to the configured Search Console property.',
      },
      { status: 400 }
    );
  }

  try {
    const result = await inspectSingleUrlWithCache(siteUrl, url, forceRefresh);
    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    console.error('URL inspection failed:', errorMessage(err));
    const mappedErr = mapUrlInspectionError(err);

    let statusCode = 500;
    if (mappedErr.message.includes('Invalid URL.')) statusCode = 400;
    else if (mappedErr.message.includes('Google authorization has expired')) statusCode = 401;
    else if (mappedErr.message.includes('Access denied')) statusCode = 403;
    else if (mappedErr.message.includes('property was not found')) statusCode = 404;
    else if (mappedErr.message.includes('quota has been exceeded')) statusCode = 429;

    return NextResponse.json({ success: false, error: mappedErr.message }, { status: statusCode });
  }
}
