'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
import type { Priority, Task } from '../utils/store';
import { COLUMN_TITLES, TASK_COLUMNS } from '../utils/store';

type TaskDetailDialogProps = {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdate: (task: Task) => void;
};

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  onTaskUpdate
}: TaskDetailDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo(
    () => ({
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? 'backlog',
      priority: task?.priority ?? 'medium',
      ownerAgentId: task?.assignee ?? '',
      projectId: task?.projectId ?? '',
      dueDate: task?.dueDate ?? ''
    }),
    [task]
  );

  const [form, setForm] = useState(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [initial, open]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: task.id, ...form })
      });
      if (!response.ok) throw new Error(await response.text());
      const updated = (await response.json()) as Task;
      onTaskUpdate(updated);
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kunde inte spara tasken.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <div className='flex flex-wrap items-center gap-2'>
            <DialogTitle>Task details</DialogTitle>
            {task?.source && <Badge variant='secondary'>{task.source}</Badge>}
            {task?.updatedAt && (
              <Badge variant='outline'>
                updated {new Date(task.updatedAt).toLocaleString('sv-SE')}
              </Badge>
            )}
          </div>
          <DialogDescription>Läs hela ticketen och editera de viktigaste fälten.</DialogDescription>
        </DialogHeader>

        {task && (
          <div className='grid gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='task-title'>Titel</Label>
              <Input
                id='task-title'
                value={form.title}
                onChange={(event) => update('title', event.target.value)}
              />
            </div>

            <div className='grid gap-4 md:grid-cols-3'>
              <div className='space-y-2'>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => update('status', value)}>
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_COLUMNS.map((column) => (
                      <SelectItem key={column} value={column}>
                        {COLUMN_TITLES[column]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) => update('priority', value as Priority)}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='high'>High</SelectItem>
                    <SelectItem value='medium'>Medium</SelectItem>
                    <SelectItem value='low'>Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='task-due'>Due date</Label>
                <Input
                  id='task-due'
                  type='date'
                  value={form.dueDate}
                  onChange={(event) => update('dueDate', event.target.value)}
                />
              </div>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='task-owner'>Owner/agent id</Label>
                <Input
                  id='task-owner'
                  value={form.ownerAgentId}
                  onChange={(event) => update('ownerAgentId', event.target.value)}
                  placeholder='cai, charles, worker…'
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='task-project'>Project id</Label>
                <Input
                  id='task-project'
                  value={form.projectId}
                  onChange={(event) => update('projectId', event.target.value)}
                  placeholder='agent-os, lysande…'
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='task-description'>Full ticket</Label>
              <Textarea
                id='task-description'
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
                className='min-h-64 font-mono text-sm leading-relaxed'
                placeholder='Beskriv ticketen, acceptance criteria, notes, beslut…'
              />
            </div>

            <div className='grid gap-2 rounded-xl border bg-muted/30 p-3 text-xs md:grid-cols-2'>
              <div>
                <span className='text-muted-foreground'>ID:</span>{' '}
                <span className='font-mono'>{task.id}</span>
              </div>
              <div>
                <span className='text-muted-foreground'>Project:</span>{' '}
                {task.projectName ?? task.projectId ?? '—'}
              </div>
              <div>
                <span className='text-muted-foreground'>Assignee:</span> {task.assignee ?? '—'}
              </div>
              <div>
                <span className='text-muted-foreground'>Position:</span> {task.position ?? '—'}
              </div>
            </div>

            {error && (
              <div className='text-destructive rounded-lg border border-destructive/30 p-3 text-sm'>
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>
            Stäng
          </Button>
          <Button onClick={save} isLoading={saving} disabled={!task || !form.title.trim()}>
            Spara ändringar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
