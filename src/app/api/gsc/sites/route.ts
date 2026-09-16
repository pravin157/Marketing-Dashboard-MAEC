import { NextResponse } from 'next/server';
import { listSites } from '@/lib/gsc.js';
import { errorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const sites = await listSites();
    return NextResponse.json({ sites });
  } catch (err: unknown) {
    console.error('GSC sites list failed:', errorMessage(err));
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
