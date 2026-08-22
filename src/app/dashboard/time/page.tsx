import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getWorklogSnapshot } from '@/db/worklog';
import { verifySessionToken } from '@/lib/auth/session';
import { cookies } from 'next/headers';

export const metadata = { title: 'Agent OS: Worklog' };

function minutesLabel(minutes: number) {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

function moneyLabel(minor: number, currency: string) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(minor / 100);
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm'
  }).format(new Date(iso));
}

function timeInputValue(iso: string | null) {
  return iso
    ? new Intl.DateTimeFormat('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Europe/Stockholm'
      }).format(new Date(iso))
    : '';
}

function stockholmToday() {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Stockholm'
  })
    .format(new Date())
    .replaceAll('/', '-');
}

export default async function WorklogPage({
  searchParams
}: {
  searchParams: Promise<{
    date?: string;
    created?: string;
    error?: string;
    finance?: string;
    revealError?: string;
  }>;
}) {
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : stockholmToday();
  const revealToken = (await cookies()).get('agent_os_worklog_finance_reveal')?.value;
  const financeRevealed = Boolean(await verifySessionToken(revealToken));
  const snapshot = await getWorklogSnapshot(date, financeRevealed);
  const sourceUnavailable = !snapshot.source.startsWith('bridge:');
  const locations = [...new Set(snapshot.sessions.map((session) => session.locationType))];
  const mixedDay = locations.length > 1;

  return (
    <PageContainer
      pageTitle='Worklog'
      pageDescription='Tid, plats, arbetsnoteringar och arbetskostnader. Cai kan registrera samma fakta från Telegram.'
      rightRailTitle='Workday context'
      rightRailDescription='Totals are derived from recorded sessions. Revenue is shown only after private-financial reveal.'
      rightRail={
        <Card className='gap-3 py-4'>
          <CardHeader className='px-4'>
            <CardTitle className='text-base'>Day status</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 px-4 text-sm'>
            <div className='flex justify-between gap-3'>
              <span className='text-muted-foreground'>Gross time</span>
              <strong className='tabular-nums'>{minutesLabel(snapshot.totals.grossMinutes)}</strong>
            </div>
            <div className='flex justify-between gap-3'>
              <span className='text-muted-foreground'>Open sessions</span>
              <strong>{snapshot.totals.incompleteSessions}</strong>
            </div>
            <p className='text-muted-foreground text-xs'>
              Only recorded sessions count. Revenue uses the private hourly rate and excludes VAT.
            </p>
          </CardContent>
        </Card>
      }
      rightRailDefaultOpen
    >
      <div className='flex min-w-0 flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>{date}</Badge>
          <Badge variant={sourceUnavailable ? 'destructive' : 'secondary'}>
            {sourceUnavailable ? 'Unavailable' : 'Supabase worklog'}
          </Badge>
          {mixedDay && <Badge variant='secondary'>Mixed day · {locations.join(' → ')}</Badge>}
          {params.created && <span className='text-muted-foreground text-sm'>Saved.</span>}
          {params.error && (
            <span className='text-destructive text-sm'>
              Could not save. Check the entry and retry.
            </span>
          )}
        </div>

        <Card className='gap-0 overflow-hidden py-0'>
          <CardContent className='px-0'>
            <dl className='grid divide-x sm:grid-cols-4'>
              <div className='p-4'>
                <dt className='text-muted-foreground text-xs'>Worked</dt>
                <dd className='mt-1 text-xl font-semibold tabular-nums'>
                  {minutesLabel(snapshot.totals.netMinutes)}
                </dd>
              </div>
              <div className='p-4'>
                <dt className='text-muted-foreground text-xs'>Expenses</dt>
                <dd className='mt-1 text-xl font-semibold tabular-nums'>
                  {moneyLabel(snapshot.totals.expenseMinor, snapshot.totals.currency)}
                </dd>
              </div>
              <div className='p-4'>
                <dt className='text-muted-foreground text-xs'>Sessions / location</dt>
                <dd className='mt-1 text-xl font-semibold tabular-nums'>
                  {snapshot.sessions.length}
                  {mixedDay ? ' · mixed' : ''}
                </dd>
              </div>
              <div className='p-4'>
                <dt className='text-muted-foreground text-xs'>Estimated revenue</dt>
                <dd className='mt-1 text-xl font-semibold tabular-nums'>
                  {snapshot.financials.revealed
                    ? snapshot.financials.estimatedRevenueMinor === null
                      ? '—'
                      : moneyLabel(
                          snapshot.financials.estimatedRevenueMinor,
                          snapshot.financials.currency
                        )
                    : '••••'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Private financials</CardTitle>
            <CardDescription>
              {snapshot.financials.revealed
                ? 'Visible for this Worklog session. The reveal expires after five minutes.'
                : 'Hourly rate and revenue are excluded from this page until you re-authenticate.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {snapshot.financials.revealed ? (
              <div className='flex flex-wrap gap-4 text-sm'>
                <span>
                  Rate:{' '}
                  <strong className='tabular-nums'>
                    {snapshot.financials.rateMinor === null
                      ? '—'
                      : moneyLabel(snapshot.financials.rateMinor, snapshot.financials.currency) +
                        '/h'}
                  </strong>
                </span>
                <span>
                  Completed work only: <strong>{minutesLabel(snapshot.totals.netMinutes)}</strong>
                </span>
              </div>
            ) : (
              <form
                action='/api/worklog/reveal'
                method='post'
                className='flex max-w-md flex-wrap gap-2'
              >
                <input type='hidden' name='date' value={date} />
                <Label htmlFor='worklog-reveal-password' className='sr-only'>
                  Password
                </Label>
                <Input
                  id='worklog-reveal-password'
                  name='password'
                  type='password'
                  autoComplete='current-password'
                  placeholder='Agent OS password'
                  required
                />
                <Button type='submit' variant='outline'>
                  <Icons.eye data-icon='inline-start' />
                  Reveal
                </Button>
                {params.revealError && (
                  <span className='text-destructive self-center text-sm'>Wrong password.</span>
                )}
              </form>
            )}
          </CardContent>
        </Card>

        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Log work</CardTitle>
              <CardDescription>
                Enter a complete session. Open sessions are supported; reminders are not enabled
                yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action='/api/worklog' method='post' className='grid gap-3 sm:grid-cols-2'>
                <input type='hidden' name='kind' value='session' />
                <input type='hidden' name='businessDate' value={date} />
                <div className='space-y-2'>
                  <Label htmlFor='work-start'>Start</Label>
                  <Input id='work-start' name='startTime' type='time' required />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='work-end'>End</Label>
                  <Input id='work-end' name='endTime' type='time' />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='work-location'>Location</Label>
                  <Select name='locationType' defaultValue='office'>
                    <SelectTrigger id='work-location'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='office'>Office</SelectItem>
                      <SelectItem value='home'>Home</SelectItem>
                      <SelectItem value='other'>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='work-note'>Optional note</Label>
                  <Input id='work-note' name='note' placeholder='What did you work on?' />
                </div>
                <Button type='submit' className='sm:col-span-2'>
                  <Icons.clock data-icon='inline-start' />
                  Save work session
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Log expense</CardTitle>
              <CardDescription>
                Recorded as a cost only. No deduction, VAT, or reimbursement is inferred.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action='/api/worklog' method='post' className='grid gap-3 sm:grid-cols-2'>
                <input type='hidden' name='kind' value='expense' />
                <input type='hidden' name='businessDate' value={date} />
                <div className='space-y-2'>
                  <Label htmlFor='expense-amount'>Amount (SEK)</Label>
                  <Input
                    id='expense-amount'
                    name='amount'
                    type='number'
                    min='0.01'
                    step='0.01'
                    required
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='expense-category'>Category</Label>
                  <Select name='category' defaultValue='parking'>
                    <SelectTrigger id='expense-category'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='parking'>Parking</SelectItem>
                      <SelectItem value='travel'>Travel</SelectItem>
                      <SelectItem value='meal'>Meal</SelectItem>
                      <SelectItem value='equipment'>Equipment</SelectItem>
                      <SelectItem value='other'>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='expense-merchant'>Merchant</Label>
                  <Input id='expense-merchant' name='merchant' placeholder='Optional' />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='expense-note'>Note</Label>
                  <Input id='expense-note' name='note' placeholder='Optional' />
                </div>
                <Button type='submit' variant='outline' className='sm:col-span-2'>
                  Save expense
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Day timeline</CardTitle>
            <CardDescription>
              {mixedDay
                ? `Mixed workday: ${locations.join(' → ')}.`
                : `Facts captured for ${date}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {snapshot.sessions.length === 0 &&
            snapshot.notes.length === 0 &&
            snapshot.expenses.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                No entries yet. Tell Cai “kom in 08:00, gick hem 15:30, kontoret” once Telegram
                ingestion is enabled, or add a session here.
              </p>
            ) : null}
            {snapshot.sessions.map((session) => (
              <div
                key={session.id}
                className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm'
              >
                <div>
                  <strong>
                    {timeLabel(session.startedAt)}
                    {session.endedAt ? `–${timeLabel(session.endedAt)}` : '–open'}
                  </strong>
                  <span className='text-muted-foreground'> · {session.locationType}</span>
                  {session.note ? (
                    <p className='text-muted-foreground mt-1'>{session.note}</p>
                  ) : null}
                </div>
                <Badge variant='outline'>
                  {session.durationMinutes === null
                    ? 'Open'
                    : minutesLabel(session.durationMinutes)}
                </Badge>
                <details className='w-full border-t pt-3'>
                  <summary className='cursor-pointer text-muted-foreground'>
                    Correct this session
                  </summary>
                  <form
                    action='/api/worklog'
                    method='post'
                    className='mt-3 grid gap-2 sm:grid-cols-2'
                  >
                    <input type='hidden' name='kind' value='session-correction' />
                    <input type='hidden' name='businessDate' value={date} />
                    <input type='hidden' name='sessionId' value={session.id} />
                    <Input
                      name='startTime'
                      type='time'
                      defaultValue={timeInputValue(session.startedAt)}
                      required
                    />
                    <Input
                      name='endTime'
                      type='time'
                      defaultValue={timeInputValue(session.endedAt)}
                    />
                    <select
                      name='locationType'
                      defaultValue={session.locationType}
                      className='border-input bg-background h-9 rounded-md border px-3 text-sm'
                    >
                      <option value='office'>Office</option>
                      <option value='home'>Home</option>
                      <option value='other'>Other</option>
                    </select>
                    <Input name='note' defaultValue={session.note} placeholder='Optional note' />
                    <Input
                      name='reason'
                      defaultValue='Corrected in Worklog'
                      className='sm:col-span-2'
                    />
                    <Button type='submit' variant='outline' className='sm:col-span-2'>
                      Save correction
                    </Button>
                  </form>
                </details>
              </div>
            ))}
            {snapshot.notes.map((note) => (
              <div key={note.id} className='rounded-lg border p-3 text-sm'>
                <span className='text-muted-foreground'>Note</span>
                <p className='mt-1'>{note.body}</p>
              </div>
            ))}
            {snapshot.expenses.map((expense) => (
              <div
                key={expense.id}
                className='flex justify-between gap-3 rounded-lg border p-3 text-sm'
              >
                <span>
                  {expense.category}
                  {expense.merchant ? ` · ${expense.merchant}` : ''}
                </span>
                <strong className='tabular-nums'>
                  {moneyLabel(expense.amountMinor, expense.currency)}
                </strong>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
