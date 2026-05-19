import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getRunwaySnapshot } from '@/lib/runway';

export const metadata = {
  title: 'Agent OS: Runway'
};

export default function RunwayPage() {
  const snapshot = getRunwaySnapshot();

  return (
    <PageContainer>
      <div className='flex flex-1 flex-col gap-6'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div className='space-y-2'>
            <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
              Life OS · safe summary
            </Badge>
            <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>Runway Picture</h1>
            <p className='text-muted-foreground max-w-2xl text-sm md:text-base'>
              Konkret 30-60 dagars bild: hur Felipe får in pengar utan att dumpa all energi i fel
              sorts consulting. Inga bankdetaljer, tokens, konton eller råa transaktioner här.
            </p>
          </div>
          <div className='rounded-xl border bg-card p-4 text-sm'>
            <div className='text-muted-foreground'>Posture</div>
            <div className='font-mono'>{snapshot.posture}</div>
            <div className='text-muted-foreground mt-2 text-xs'>
              {new Date(snapshot.generatedAt).toLocaleString('sv-SE')}
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
          {snapshot.situation.map((item) => (
            <Card key={item.label}>
              <CardHeader className='pb-2'>
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className='text-2xl'>{item.value}</CardTitle>
              </CardHeader>
              <CardContent className='text-muted-foreground text-sm'>{item.detail}</CardContent>
            </Card>
          ))}
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          <Card className='xl:col-span-2'>
            <CardHeader>
              <CardTitle>Best paths to cash</CardTitle>
              <CardDescription>
                Prioriterat efter fit, speed-to-cash och hur mycket autonomi de bevarar.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {snapshot.paths.map((path) => (
                <div key={path.id} className='rounded-xl border bg-background/40 p-4'>
                  <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                    <div className='min-w-0'>
                      <div className='font-medium'>{path.title}</div>
                      <div className='text-muted-foreground mt-2 grid gap-1 text-sm md:grid-cols-3'>
                        <span>fit: {path.fit}</span>
                        <span>speed: {path.speed}</span>
                        <span>risk: {path.downside}</span>
                      </div>
                      <div className='mt-3 text-sm'>{path.nextAction}</div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guardrails</CardTitle>
              <CardDescription>
                Håll planeringen användbar utan att lagra farlig data.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm'>
              {snapshot.guardrails.map((guardrail) => (
                <div key={guardrail} className='rounded-xl border bg-background/40 p-3'>
                  {guardrail}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Next 7 days</CardTitle>
              <CardDescription>Det här är actionlistan. Inte research-teater.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {snapshot.nextSevenDays.map((action, index) => (
                <div key={action} className='rounded-xl border bg-background/40 p-3 text-sm'>
                  <span className='text-muted-foreground mr-2 font-mono'>{index + 1}.</span>
                  {action}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Questions to resolve</CardTitle>
              <CardDescription>
                Frågor Cai bör få svar på innan bilden blir exaktare.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {snapshot.questions.map((question) => (
                <div key={question} className='rounded-xl border bg-background/40 p-3 text-sm'>
                  {question}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
