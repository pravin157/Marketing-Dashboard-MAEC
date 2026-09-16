import { NextRequest, NextResponse } from 'next/server';
import { runGSC } from '@/lib/gsc.js';
import { getCachedData, setCachedData } from '@/lib/cache';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const siteUrl = searchParams.get('siteUrl')
    ? decodeURIComponent(searchParams.get('siteUrl')!)
    : null;
  const startDate = searchParams.get('startDate') || null;
  const endDate = searchParams.get('endDate') || null;
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const cacheKey = `site:${siteUrl}:${startDate}:${endDate}`;
    let payload: {
      siteUrl?: string;
      topPages?: unknown[];
      [key: string]: unknown;
    };

    const cachedGSC = getCachedData(cacheKey, false) as
      | { data?: typeof payload }
      | null;
    if (cachedGSC && !forceRefresh && cachedGSC.data) {
      payload = cachedGSC.data;
    } else {
      const rawPayload = await runGSC(siteUrl, startDate, endDate);
      payload = {
        siteUrl: rawPayload.siteUrl,
        dateRange: rawPayload.dateRange,
        clicks: rawPayload.summary.totalClicks,
        impressions: rawPayload.summary.totalImpressions,
        ctr: rawPayload.summary.avgCTR,
        position: rawPayload.summary.avgPosition,
        dailyPerformance: rawPayload.daily,
        topQueries: rawPayload.queries,
        topPages: rawPayload.pages,
        countries: rawPayload.countries,
        devices: rawPayload.devices,
      };
      setCachedData(cacheKey, { success: true, data: payload });
    }

    const topPages = payload.topPages || [];

    return NextResponse.json({
      success: true,
      data: {
        siteUrl: payload.siteUrl,
        pages: topPages,
      },
    });
  } catch (err: unknown) {
    console.error('GSC indexing fetch failed:', errorMessage(err));
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
