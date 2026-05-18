import { bridgeRequest } from '@/lib/bridge';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const limit = search.get('limit') ?? '25';
  const minScore = search.get('minScore') ?? '35';
  const snapshot = await bridgeRequest(
    `/knowledge/sessions/inventory?limit=${limit}&minScore=${minScore}`
  );
  return NextResponse.json(snapshot);
}
