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

  const cacheKey = `site:${siteUrl}:${startDate}:${endDate}`;
  const cached = getCachedData(cacheKey, forceRefresh);
  if (cached) {
    console.log(`[Cache Hit] Returning cached GSC data for ${cacheKey}`);
    return NextResponse.json(cached);
  }

  try {
    const payload = await runGSC(siteUrl, startDate, endDate);
    const normalized = {
      success: true,
      data: {
        siteUrl: payload.siteUrl,
        dateRange: payload.dateRange,
        clicks: payload.summary.totalClicks,
        impressions: payload.summary.totalImpressions,
        ctr: payload.summary.avgCTR,
        position: payload.summary.avgPosition,
        dailyPerformance: payload.daily,
        topQueries: payload.queries,
        topPages: payload.pages,
        countries: payload.countries,
        devices: payload.devices,
      },
    };
    setCachedData(cacheKey, normalized);
    return NextResponse.json(normalized);
  } catch (err: unknown) {
    console.error('GSC fetch failed:', errorMessage(err));
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
