import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { getRndLoopBoard, RND_LOOP_COLUMN_TITLES } from '@/db/rnd-loops';
import { RndLoopBoard } from './rnd-loop-board';

export const metadata = {
  title: 'Agent OS: R&D Loops'
};

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const [board, params] = await Promise.all([getRndLoopBoard(), searchParams]);
  const loopCount = Object.values(board.columns).flat().length;

  return (
    <PageContainer
      pageTitle='R&D Loops'
      pageDescription='Recurring investigation boards that turn broad Agent OS improvement themes into finite experiments and tasks.'
    >
      <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline' className='border-primary/40 bg-primary/10 text-primary'>
            {board.source}
          </Badge>
          <Badge variant='secondary'>{loopCount} loops</Badge>
          <Badge variant='secondary'>{board.columnOrder.length} columns</Badge>
        </div>
        {(params.created || params.error) && (
          <div
            className={params.error ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}
          >
            {params.created && 'R&D loop skapad.'}
            {params.error === 'missing' && 'Theme krävs.'}
          </div>
        )}
      </div>

      <form action='/api/rnd-loops' method='post' className='mb-5 rounded-md border bg-card p-4'>
        <div className='grid gap-3 lg:grid-cols-[1.1fr_1.4fr_0.7fr_0.7fr_auto] lg:items-end'>
          <div className='space-y-2'>
            <Label htmlFor='rnd-theme'>Theme</Label>
            <Input id='rnd-theme' name='theme' placeholder='Keep Agent OS useful' required />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rnd-question'>Current question</Label>
            <Input
              id='rnd-question'
              name='question'
              placeholder='What should the agent investigate next?'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rnd-owner'>Owner</Label>
            <Select name='ownerAgentId' defaultValue='cai'>
              <SelectTrigger id='rnd-owner'>
                <SelectValue placeholder='Owner' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='cai'>Cai</SelectItem>
                <SelectItem value='charles'>Charles</SelectItem>
                <SelectItem value='sladdis'>Sladdis</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='rnd-priority'>Priority</Label>
            <Select name='priority' defaultValue='medium'>
              <SelectTrigger id='rnd-priority'>
                <SelectValue placeholder='Priority' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='high'>High</SelectItem>
                <SelectItem value='medium'>Medium</SelectItem>
                <SelectItem value='low'>Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type='submit' className='w-full lg:w-auto'>
            Create Loop
          </Button>
        </div>
        <div className='mt-3'>
          <Label htmlFor='rnd-hypothesis'>Hypothesis</Label>
          <Textarea
            id='rnd-hypothesis'
            name='hypothesis'
            placeholder='What do we think is true, and how could we test it?'
            className='mt-2 min-h-20'
          />
        </div>
      </form>

      <RndLoopBoard board={board} columnTitles={RND_LOOP_COLUMN_TITLES} />
    </PageContainer>
  );
}
