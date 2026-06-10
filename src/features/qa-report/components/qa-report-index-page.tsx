import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Icons } from '@/components/icons';
import type { QaReport, QaStrategyDefinition } from '../api/types';

interface QaReportIndexPageProps {
  strategies: QaStrategyDefinition[];
  reports: QaReport[];
}

const minimumReportBody = `{
  "vertical": "ux-ui",
  "customerSlug": "lysande",
  "customerName": "Lysande",
  "slug": "homepage-review",
  "title": "Lysande UX/UI QA report",
  "targetUrl": "https://www.lysande.ai",
  "generatedAt": "2026-06-10T10:37:18.782Z",
  "agentName": "Sladdis",
  "reportType": "ux-ui-report",
  "executiveSummary": "Short summary of the most important QA findings.",
  "score": 78,
  "verdict": "Usable, with clear fixes recommended.",
  "scope": ["Homepage first impression"],
  "metrics": [],
  "environment": [],
  "coverage": [],
  "timeline": [],
  "risks": [],
  "evidence": [],
  "findings": [],
  "suggestedTests": [],
  "nextRun": ["Retest after fixes."]
}`;

function getReportCount(reports: QaReport[], strategy: QaStrategyDefinition) {
  return reports.filter((report) => report.vertical === strategy.vertical).length;
}

export function QaReportIndexPage({ strategies, reports }: QaReportIndexPageProps) {
  return (
    <main className='bg-background min-h-screen'>
      <section className='border-b'>
        <div className='mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16'>
          <div className='max-w-4xl'>
            <Badge variant='secondary'>Sladdis QA reports</Badge>
            <h1 className='text-foreground mt-5 text-4xl font-semibold tracking-tight sm:text-5xl'>
              QA report verticals
            </h1>
            <p className='text-muted-foreground mt-5 max-w-3xl text-lg leading-8'>
              Pick a testing strategy, load its agent instructions, and publish a shareable report
              under the matching vertical.
            </p>
          </div>
        </div>
      </section>

      <section className='mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        <Card className='mb-8 rounded-lg'>
          <CardHeader>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
              <div>
                <CardTitle>Agent publishing access</CardTitle>
                <CardDescription className='mt-2'>
                  Agents must claim scoped writer access before saving reports to Agent OS.
                </CardDescription>
              </div>
              <Badge variant='outline'>requires Felipe approval</Badge>
            </div>
          </CardHeader>
          <CardContent className='grid gap-6 lg:grid-cols-[1fr_360px]'>
            <div className='grid gap-3 md:grid-cols-2'>
              {[
                {
                  label: '1. Create claim',
                  value: 'POST /api/qa-reports/claims'
                },
                {
                  label: '2. Send activation link',
                  value: '/qa-rapport/activate?claim=...'
                },
                {
                  label: '3. Exchange approved claim',
                  value: 'POST /api/qa-reports/claims/exchange'
                },
                {
                  label: '4. Publish report',
                  value: 'POST /api/qa-reports'
                }
              ].map((step) => (
                <div key={step.label} className='bg-muted/50 rounded-md p-4'>
                  <div className='text-sm font-medium'>{step.label}</div>
                  <div className='text-muted-foreground mt-2 font-mono text-xs'>{step.value}</div>
                </div>
              ))}
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <div className='text-sm font-medium'>Instruction file</div>
                <div className='text-muted-foreground mt-2 font-mono text-xs'>
                  docs/sladdis/qa-report-publishing.llm.md
                </div>
              </div>
              <Separator />
              <p className='text-muted-foreground text-sm leading-6'>
                Sladdis should not request dashboard cookies, passwords, or session tokens. It must
                ask for an activation link approval and use the scoped writer token returned after
                claim exchange.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className='mb-8 rounded-lg'>
          <CardHeader>
            <CardTitle>Minimum report body</CardTitle>
            <CardDescription>
              `POST /api/qa-reports` returns `invalid-report` with validation issues when this shape
              is not met.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className='bg-muted/50 max-h-[520px] overflow-auto rounded-md p-4 text-xs leading-5'>
              <code>{minimumReportBody}</code>
            </pre>
          </CardContent>
        </Card>

        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {strategies.map((strategy) => {
            const reportCount = getReportCount(reports, strategy);

            return (
              <Link key={strategy.vertical} href={`/qa-rapport/${strategy.vertical}`}>
                <Card className='hover:bg-muted/40 h-full rounded-lg transition-colors'>
                  <CardHeader>
                    <div className='flex items-start justify-between gap-4'>
                      <div>
                        <CardTitle>{strategy.name}</CardTitle>
                        <CardDescription className='mt-2'>{strategy.description}</CardDescription>
                      </div>
                      <Badge variant={strategy.status === 'active' ? 'default' : 'secondary'}>
                        {strategy.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className='flex flex-col gap-5'>
                    <div className='grid grid-cols-2 gap-3'>
                      <div className='bg-muted/50 rounded-md p-3'>
                        <div className='text-2xl font-semibold'>{reportCount}</div>
                        <div className='text-muted-foreground mt-1 text-xs'>reports</div>
                      </div>
                      <div className='bg-muted/50 rounded-md p-3'>
                        <div className='text-2xl font-semibold'>
                          {strategy.triggerPhrases.length}
                        </div>
                        <div className='text-muted-foreground mt-1 text-xs'>triggers</div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <div className='text-sm font-medium'>Agent instructions</div>
                      <div className='text-muted-foreground mt-2 font-mono text-xs'>
                        {strategy.agentInstructionsPath}
                      </div>
                    </div>
                    <div className='flex items-center justify-between gap-4 text-sm font-medium'>
                      <span>Open vertical</span>
                      <Icons.arrowRight className='size-4' />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
