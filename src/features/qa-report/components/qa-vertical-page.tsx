import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import type { QaReport, QaStrategyDefinition } from '../api/types';

interface QaVerticalPageProps {
  strategy: QaStrategyDefinition;
  reports: QaReport[];
}

export function QaVerticalPage({ strategy, reports }: QaVerticalPageProps) {
  return (
    <main className='bg-background min-h-screen'>
      <section className='border-b'>
        <div className='mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16'>
          <Link
            href='/qa-rapport'
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium'
          >
            <Icons.chevronLeft className='size-4' />
            QA verticals
          </Link>
          <div className='mt-8 max-w-4xl'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='secondary'>{strategy.shortName}</Badge>
              <Badge variant={strategy.status === 'active' ? 'default' : 'secondary'}>
                {strategy.status}
              </Badge>
              <Badge variant='outline'>{strategy.reportTemplate}</Badge>
            </div>
            <h1 className='text-foreground mt-5 text-4xl font-semibold tracking-tight sm:text-5xl'>
              {strategy.name}
            </h1>
            <p className='text-muted-foreground mt-5 max-w-3xl text-lg leading-8'>
              {strategy.description}
            </p>
          </div>
        </div>
      </section>

      <div className='mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8'>
        <div className='min-w-0 flex flex-col gap-8'>
          <Card className='rounded-lg'>
            <CardHeader>
              <CardTitle>Reports</CardTitle>
              <CardDescription>Published reports for this vertical.</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {reports.length > 0 ? (
                reports.map((report) => (
                  <Link
                    key={`${report.customerSlug}-${report.slug}`}
                    href={`/qa-rapport/${report.vertical}/${report.customerSlug}/${report.slug}`}
                  >
                    <div className='hover:bg-muted/50 min-w-0 rounded-md border p-4 transition-colors'>
                      <div className='flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                        <div className='min-w-0'>
                          <div className='font-medium'>
                            {report.customerName} / {report.title}
                          </div>
                          <p className='text-muted-foreground mt-2 text-sm leading-6 break-words'>
                            {report.executiveSummary}
                          </p>
                        </div>
                        <Badge className='w-fit shrink-0' variant='outline'>
                          {report.score}/100
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className='bg-muted/50 rounded-md p-6'>
                  <div className='font-medium'>No reports yet</div>
                  <p className='text-muted-foreground mt-2 text-sm leading-6'>
                    This strategy is defined for Sladdis, but the public report template has not
                    been implemented yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className='rounded-lg'>
            <CardHeader>
              <CardTitle>Trigger phrases</CardTitle>
              <CardDescription>Language Sladdis can use to select this strategy.</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-wrap gap-2'>
              {strategy.triggerPhrases.map((phrase) => (
                <Badge key={phrase} variant='outline'>
                  {phrase}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className='flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start'>
          <Card className='rounded-lg'>
            <CardHeader>
              <CardTitle>Agent file</CardTitle>
              <CardDescription>
                Instruction file Sladdis should load before this test.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='bg-muted/50 rounded-md p-3 font-mono text-xs break-all'>
                {strategy.agentInstructionsPath}
              </div>
            </CardContent>
          </Card>

          <Card className='rounded-lg'>
            <CardHeader>
              <CardTitle>Key questions</CardTitle>
              <CardDescription>What the report must answer.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className='flex flex-col gap-3'>
                {strategy.primaryQuestions.map((question) => (
                  <li key={question} className='flex gap-3 text-sm'>
                    <Icons.target className='mt-0.5 size-4 shrink-0' />
                    <span className='text-muted-foreground leading-6'>{question}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className='rounded-lg'>
            <CardHeader>
              <CardTitle>Default scope</CardTitle>
              <CardDescription>Checklist Sladdis starts from.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className='flex flex-col gap-3'>
                {strategy.defaultScope.map((item) => (
                  <li key={item} className='flex gap-3 text-sm'>
                    <Icons.check className='mt-0.5 size-4 shrink-0' />
                    <span className='text-muted-foreground leading-6'>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
