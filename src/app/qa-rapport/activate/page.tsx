import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { sessionCookieName, verifySessionToken } from '@/lib/auth/session';
import { getQaReportClaimByToken } from '@/features/qa-report/api/claims';
import { getQaStrategy } from '@/features/qa-report/api/strategies';

interface QaActivatePageProps {
  searchParams: Promise<{
    claim?: string;
    status?: string;
  }>;
}

export default async function QaActivatePage({ searchParams }: QaActivatePageProps) {
  const params = await searchParams;

  if (params.status === 'approved') {
    return (
      <main className='bg-background flex min-h-screen items-center justify-center p-6'>
        <Card className='w-full max-w-lg rounded-lg'>
          <CardHeader>
            <CardTitle>Sladdis access approved</CardTitle>
            <CardDescription>
              Sladdis can now exchange the approved claim for a scoped QA report writer token.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const claimToken = params.claim;
  if (!claimToken) {
    redirect('/qa-rapport');
  }

  const cookieStore = await cookies();
  const session = await verifySessionToken(cookieStore.get(sessionCookieName)?.value);
  const nextPath = `/qa-rapport/activate?claim=${encodeURIComponent(claimToken)}`;
  if (!session) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
  }

  const claim = await getQaReportClaimByToken(claimToken);
  if (!claim || claim.status !== 'pending' || claim.expiresAt.getTime() < Date.now()) {
    return (
      <main className='bg-background flex min-h-screen items-center justify-center p-6'>
        <Card className='w-full max-w-lg rounded-lg'>
          <CardHeader>
            <CardTitle>Activation link is not valid</CardTitle>
            <CardDescription>
              Ask Sladdis to create a fresh QA report activation link.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const strategy = getQaStrategy(claim.vertical);

  return (
    <main className='bg-background flex min-h-screen items-center justify-center p-6'>
      <Card className='w-full max-w-lg rounded-lg'>
        <CardHeader>
          <div className='flex flex-wrap gap-2'>
            <Badge variant='secondary'>{claim.requestedByAgent}</Badge>
            {strategy ? <Badge>{strategy.shortName}</Badge> : null}
          </div>
          <CardTitle>Approve QA report writer access</CardTitle>
          <CardDescription>
            This approves a scoped writer token for Sladdis. It can create QA reports, but it does
            not grant dashboard access.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-5'>
          <dl className='grid gap-3 text-sm'>
            <div className='flex justify-between gap-4'>
              <dt className='text-muted-foreground'>Vertical</dt>
              <dd className='font-medium'>{claim.vertical}</dd>
            </div>
            <div className='flex justify-between gap-4'>
              <dt className='text-muted-foreground'>Customer</dt>
              <dd className='font-medium'>{claim.customerName || claim.customerSlug || 'Any'}</dd>
            </div>
            <div className='flex justify-between gap-4'>
              <dt className='text-muted-foreground'>Target URL</dt>
              <dd className='truncate font-medium'>{claim.targetUrl || 'Not specified'}</dd>
            </div>
          </dl>
          <form action='/api/qa-reports/claims/approve' method='post'>
            <input type='hidden' name='claim' value={claimToken} />
            <Button type='submit' className='w-full'>
              Approve Sladdis writer token
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
