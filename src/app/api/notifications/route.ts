import { getNotifications } from '@/db/notifications';
import { NextResponse } from 'next/server';

export async function GET() {
  const snapshot = await getNotifications();
  return NextResponse.json(snapshot, { headers: { 'cache-control': 'no-store' } });
}
