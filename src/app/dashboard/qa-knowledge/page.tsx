import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { qaStrategies } from '@/features/qa-report/api/strategies';
import {
  buildSladdisQaInstructionPreview,
  getQaKnowledgeConfig,
  saveQaKnowledgeConfig
} from '@/features/qa-knowledge/api/config';
import { qaTechniques } from '@/features/qa-knowledge/api/defaults';
import type { QaDecisionPolicy, QaTechniquePriority } from '@/features/qa-knowledge/api/types';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const priorityOptions: Array<{ value: QaTechniquePriority; label: string }> = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' }
];

const policyOptions: Array<{ value: QaDecisionPolicy; label: string }> = [
  { value: 'ask-when-ambiguous', label: 'Ask when ambiguous' },
  { value: 'auto-suggest', label: 'Auto-suggest' },
  { value: 'ask-before-running', label: 'Ask before running' }
];

function formValues(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is string => typeof value === 'string');
}

async function saveStrategyConfig(formData: FormData) {
  'use server';

  const activeTechniqueIds = formValues(formData, 'activeTechniqueIds');
  await saveQaKnowledgeConfig({
    activeTechniqueIds,
    requireStrategyInReports: formData.get('requireStrategyInReports') === 'on',
    requireCoverageGaps: formData.get('requireCoverageGaps') === 'on',
    requireRecommendedNextTest: formData.get('requireRecommendedNextTest') === 'on',
    updatedAt: new Date().toISOString(),
    verticalSettings: qaStrategies.map((strategy) => {
      const priority = formData.get(`priority:${strategy.vertical}`);
      const decisionPolicy = formData.get(`policy:${strategy.vertical}`);
      const staleAfterDays = Number(formData.get(`staleAfterDays:${strategy.vertical}`));

      return {
        vertical: strategy.vertical,
        priority:
          typeof priority === 'string' && ['low', 'medium', 'high'].includes(priority)
            ? (priority as QaTechniquePriority)
            : 'medium',
        decisionPolicy:
          typeof decisionPolicy === 'string' &&
          ['auto-suggest', 'ask-when-ambiguous', 'ask-before-running'].includes(decisionPolicy)
            ? (decisionPolicy as QaDecisionPolicy)
            : 'ask-when-ambiguous',
        techniqueIds: formValues(formData, `techniques:${strategy.vertical}`),
        staleAfterDays: Number.isFinite(staleAfterDays) ? staleAfterDays : 60,
        requireScreenshots: formData.get(`screenshots:${strategy.vertical}`) === 'on'
      };
    })
  });

  revalidatePath('/dashboard/qa-knowledge');
}

function checkboxClass() {
  return 'mt-0.5 size-4 rounded border border-input accent-primary';
}

function fieldShellClass() {
  return 'rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
}

function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export default async function QaKnowledgePage() {
  const config = await getQaKnowledgeConfig();
  const activeTechniqueIds = new Set(config.activeTechniqueIds);
  const preview = buildSladdisQaInstructionPreview(config);

  const activeCount = qaTechniques.filter((technique) =>
    activeTechniqueIds.has(technique.id)
  ).length;
  const screenshotRequiredCount = config.verticalSettings.filter(
    (setting) => setting.requireScreenshots
  ).length;
  const guardedCount = config.verticalSettings.filter(
    (setting) => setting.decisionPolicy !== 'auto-suggest'
  ).length;

  return (
    <PageContainer>
      <form action={saveStrategyConfig} className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='w-fit'>
              Internal QA Strategy
            </Badge>
            <h1 className='max-w-4xl text-3xl font-semibold tracking-tight md:text-4xl'>
              Sladdis QA knowledge and decision config
            </h1>
            <p className='max-w-3xl text-sm text-muted-foreground md:text-base'>
              Private dashboard control for what QA techniques Sladdis can use, when he should ask
              first, and what strategy metadata new QA reports must include.
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button asChild variant='outline'>
              <Link href='/qa-rapport'>Public QA reports</Link>
            </Button>
            <Button type='submit'>
              <Icons.check className='mr-2 size-4' />
              Save strategy
            </Button>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Active techniques</CardDescription>
              <CardTitle className='text-3xl'>{activeCount}</CardTitle>
            </CardHeader>
            <CardContent className='text-sm text-muted-foreground'>
              Techniques available to Sladdis
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Guarded scenarios</CardDescription>
              <CardTitle className='text-3xl'>{guardedCount}</CardTitle>
            </CardHeader>
            <CardContent className='text-sm text-muted-foreground'>
              Ask-first or ask-when-ambiguous policies
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='pb-2'>
              <CardDescription>Screenshot required</CardDescription>
              <CardTitle className='text-3xl'>{screenshotRequiredCount}</CardTitle>
            </CardHeader>
            <CardContent className='text-sm text-muted-foreground'>
              Scenarios requiring visual evidence
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]'>
          <section className='space-y-4'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <h2 className='text-xl font-semibold tracking-tight'>Technique Library</h2>
                <p className='text-sm text-muted-foreground'>
                  Select the methods Sladdis may use when choosing and executing QA scenarios.
                </p>
              </div>
              <Badge variant='secondary'>{qaTechniques.length} methods</Badge>
            </div>

            <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
              {qaTechniques.map((technique) => (
                <Card key={technique.id}>
                  <CardHeader className='space-y-3'>
                    <div className='flex items-start justify-between gap-3'>
                      <label className='flex min-w-0 items-start gap-3'>
                        <span className='sr-only'>{technique.name}</span>
                        <input
                          type='checkbox'
                          name='activeTechniqueIds'
                          value={technique.id}
                          defaultChecked={activeTechniqueIds.has(technique.id)}
                          className={checkboxClass()}
                        />
                        <span className='min-w-0'>
                          <CardTitle className='text-base'>{technique.name}</CardTitle>
                          <CardDescription className='mt-1 capitalize'>
                            {technique.category}
                          </CardDescription>
                        </span>
                      </label>
                      <Badge variant='outline' className='shrink-0'>
                        {technique.sources[0]?.title.split(':')[0] ?? 'Source'}
                      </Badge>
                    </div>
                    <p className='text-sm text-muted-foreground'>{technique.summary}</p>
                  </CardHeader>
                  <CardContent className='space-y-3 text-sm'>
                    <div>
                      <div className='font-medium'>Use when</div>
                      <ul className='mt-2 space-y-1 text-muted-foreground'>
                        {technique.useWhen.slice(0, 2).map((item) => (
                          <li key={item}>- {item}</li>
                        ))}
                      </ul>
                    </div>
                    <Separator />
                    <div className='flex flex-wrap gap-2'>
                      {technique.evidence.map((item) => (
                        <Badge key={item} variant='secondary'>
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <aside className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>Report requirements</CardTitle>
                <CardDescription>
                  Fields Sladdis should attach to new QA report payloads.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3 text-sm'>
                {[
                  ['requireStrategyInReports', 'Include testStrategy'],
                  ['requireCoverageGaps', 'Include coverageGaps'],
                  ['requireRecommendedNextTest', 'Include recommendedNextTest']
                ].map(([name, label]) => (
                  <label key={name} className='flex items-start gap-3 rounded-md border p-3'>
                    <span className='sr-only'>{label}</span>
                    <input
                      type='checkbox'
                      name={name}
                      defaultChecked={Boolean(config[name as keyof typeof config])}
                      className={checkboxClass()}
                    />
                    <span>
                      <span className='block font-medium'>{label}</span>
                      <span className='text-muted-foreground'>
                        Makes the report explain why this scenario was selected.
                      </span>
                    </span>
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sladdis instruction preview</CardTitle>
                <CardDescription>Generated from the selected settings.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className='max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/35 p-4 text-xs leading-5 text-muted-foreground'>
                  {preview}
                </pre>
                <p className='mt-3 text-xs text-muted-foreground'>
                  Last updated {compactDate(config.updatedAt)}
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>

        <section className='space-y-4'>
          <div>
            <h2 className='text-xl font-semibold tracking-tight'>Scenario Matrix</h2>
            <p className='text-sm text-muted-foreground'>
              Tune how Sladdis chooses between available QA scenarios for a URL.
            </p>
          </div>

          <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
            {qaStrategies.map((strategy) => {
              const setting =
                config.verticalSettings.find((item) => item.vertical === strategy.vertical) ??
                config.verticalSettings[0];
              const selectedTechniqueIds = new Set(setting.techniqueIds);

              return (
                <Card key={strategy.vertical}>
                  <CardHeader>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                      <div>
                        <CardTitle>{strategy.shortName}</CardTitle>
                        <CardDescription>{strategy.description}</CardDescription>
                      </div>
                      <Badge variant={strategy.status === 'active' ? 'default' : 'secondary'}>
                        {strategy.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                      <label className='space-y-1 text-sm'>
                        <span className='font-medium'>Priority</span>
                        <select
                          name={`priority:${strategy.vertical}`}
                          defaultValue={setting.priority}
                          className={`${fieldShellClass()} w-full`}
                        >
                          {priorityOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className='space-y-1 text-sm md:col-span-2'>
                        <span className='font-medium'>Decision policy</span>
                        <select
                          name={`policy:${strategy.vertical}`}
                          defaultValue={setting.decisionPolicy}
                          className={`${fieldShellClass()} w-full`}
                        >
                          {policyOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                      <label className='space-y-1 text-sm'>
                        <span className='font-medium'>Retest after days</span>
                        <input
                          type='number'
                          min='1'
                          max='365'
                          name={`staleAfterDays:${strategy.vertical}`}
                          defaultValue={setting.staleAfterDays}
                          className={`${fieldShellClass()} w-full`}
                        />
                      </label>
                      <label className='flex items-center gap-3 rounded-md border px-3 py-2 text-sm'>
                        <input
                          type='checkbox'
                          name={`screenshots:${strategy.vertical}`}
                          defaultChecked={setting.requireScreenshots}
                          className={checkboxClass()}
                        />
                        <span className='font-medium'>Require screenshots</span>
                      </label>
                    </div>

                    <div className='space-y-2'>
                      <div className='text-sm font-medium'>Recommended techniques</div>
                      <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                        {qaTechniques.map((technique) => (
                          <label
                            key={technique.id}
                            className='flex items-start gap-2 rounded-md border bg-background/60 p-2 text-sm'
                          >
                            <span className='sr-only'>{technique.name}</span>
                            <input
                              type='checkbox'
                              name={`techniques:${strategy.vertical}`}
                              value={technique.id}
                              defaultChecked={selectedTechniqueIds.has(technique.id)}
                              className={checkboxClass()}
                            />
                            <span>
                              <span className='block font-medium'>{technique.name}</span>
                              <span className='text-xs capitalize text-muted-foreground'>
                                {technique.category}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </form>
    </PageContainer>
  );
}
