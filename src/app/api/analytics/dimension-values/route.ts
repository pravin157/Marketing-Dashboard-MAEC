import { NextRequest, NextResponse } from 'next/server';
import { getGA4DimensionValues } from '@/lib/analysis.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dimension = searchParams.get('dimension');
  const startDate = searchParams.get('startDate') || '90daysAgo';
  const endDate = searchParams.get('endDate') || 'today';

  if (!dimension) {
    return NextResponse.json(
      { success: false, error: 'Dimension parameter is required' },
      { status: 400 }
    );
  }

  try {
    const values = await getGA4DimensionValues(dimension, startDate, endDate);
    return NextResponse.json({ success: true, data: values });
  } catch (err: unknown) {
    console.error(`Dimension values fetch failed (${dimension}):`, errorMessage(err));
    return NextResponse.json({ success: false, error: errorMessage(err) }, { status: 500 });
  }
}
