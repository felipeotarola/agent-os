import { bridgeRequest } from '@/lib/bridge';
import { NextRequest, NextResponse } from 'next/server';

function redirectToWorklog(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/dashboard/time', request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const kind = String(form.get('kind') ?? 'session');
  const businessDate = String(form.get('businessDate') ?? '').trim();
  try {
    if (kind === 'session') {
      await bridgeRequest('/worklog/sessions', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          startTime: String(form.get('startTime') ?? ''),
          endTime: String(form.get('endTime') ?? ''),
          locationType: String(form.get('locationType') ?? 'unknown'),
          note: String(form.get('note') ?? ''),
          source: 'cockpit'
        })
      });
    } else if (kind === 'note') {
      await bridgeRequest('/worklog/notes', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          body: String(form.get('body') ?? ''),
          source: 'cockpit'
        })
      });
    } else if (kind === 'expense') {
      await bridgeRequest('/worklog/expenses', {
        method: 'POST',
        body: JSON.stringify({
          businessDate,
          category: String(form.get('category') ?? 'other'),
          amount: String(form.get('amount') ?? ''),
          merchant: String(form.get('merchant') ?? ''),
          note: String(form.get('note') ?? ''),
          source: 'cockpit'
        })
      });
    }
    return redirectToWorklog(request, { date: businessDate, created: kind });
  } catch (error) {
    console.error('Worklog write failed', error);
    return redirectToWorklog(request, { date: businessDate, error: 'save' });
  }
}
