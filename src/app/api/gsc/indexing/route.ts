import { NextRequest, NextResponse } from 'next/server';
import { getIndexingData } from '@/lib/gsc.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const siteUrl = searchParams.get('siteUrl')
    ? decodeURIComponent(searchParams.get('siteUrl')!)
    : null;
  const page = parseInt(searchParams.get('page') || '1', 10) || 1;
  const pageSize = parseInt(searchParams.get('pageSize') || '25', 10) || 25;
  const statusFilter = searchParams.get('status') || null;
  const searchQuery = searchParams.get('search') || null;
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const result = await getIndexingData(siteUrl, {
      page,
      pageSize,
      status: statusFilter,
      search: searchQuery,
      refresh: forceRefresh,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('Indexing fetch failed:', errorMessage(err));
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
