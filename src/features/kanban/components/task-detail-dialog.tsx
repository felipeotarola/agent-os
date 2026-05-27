'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '@/components/icons';
import { MermaidDiagram } from '@/components/mermaid-diagram';
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
import type { TaskOwnerAgent } from '@/db/agents';
import type { Priority, Task } from '../utils/store';
import { COLUMN_TITLES, TASK_COLUMNS } from '../utils/store';

type TaskDetailDialogProps = {
  task: Task | null;
  open: boolean;
  agents: TaskOwnerAgent[];
  onOpenChange: (open: boolean) => void;
  onTaskUpdate: (task: Task) => void;
};

type TaskEvent = {
  id: string;
  actorAgentId?: string | null;
  kind: string;
  message: string;
  createdAt?: string | null;
};

type EditableTask = {
  title: string;
  description: string;
  status: string;
  priority: Priority;
  ownerAgentId: string;
  projectId: string;
  dueDate: string;
};

const UNASSIGNED_OWNER = '__unassigned__';

function agentLabel(agent: TaskOwnerAgent) {
  return agent.name ? `${agent.name} (${agent.id})` : agent.id;
}

function editableTask(task: Task | null): EditableTask {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'backlog',
    priority: task?.priority ?? 'medium',
    ownerAgentId: task?.assignee ?? '',
    projectId: task?.projectId ?? '',
    dueDate: task?.dueDate ?? ''
  };
}

function editableKey(editable: EditableTask) {
  return JSON.stringify(editable);
}

function extractMermaidBlocks(value: string) {
  return [...value.matchAll(/```mermaid\s*([\s\S]*?)```/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

export function TaskDetailDialog({
  task,
  open,
  agents,
  onOpenChange,
  onTaskUpdate
}: TaskDetailDialogProps) {
  const [saving, setSaving] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [comment, setComment] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const lastSavedRef = useRef('');
  const saveTimerRef = useRef<number | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);

  const initial = useMemo(() => editableTask(task), [task]);

  const [form, setForm] = useState(initial);

  const formKey = useMemo(() => editableKey(form), [form]);
  const mermaidBlocks = useMemo(() => extractMermaidBlocks(form.description), [form.description]);
  const ownerOptions = useMemo(() => {
    if (!form.ownerAgentId || agents.some((agent) => agent.id === form.ownerAgentId)) return agents;
    return [
      { id: form.ownerAgentId, name: form.ownerAgentId, role: 'Current assignee' },
      ...agents
    ];
  }, [agents, form.ownerAgentId]);

  useEffect(() => {
    if (!open) return;
    if (currentTaskIdRef.current !== (task?.id ?? null)) {
      currentTaskIdRef.current = task?.id ?? null;
      const nextInitial = editableTask(task);
      setForm(nextInitial);
      lastSavedRef.current = editableKey(nextInitial);
      setSaveState('idle');
      setError(null);
    }
  }, [open, task]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!open || !task?.id) {
      setEvents([]);
      setComment('');
      return;
    }

    let cancelled = false;
    fetch(`/api/tasks/events?id=${encodeURIComponent(task.id)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<{ events: TaskEvent[] }>;
      })
      .then((result) => {
        if (!cancelled) setEvents(result.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, task?.id]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function copyTaskId() {
    if (!task?.id) return;
    await navigator.clipboard.writeText(task.id);
    setCopiedId(true);
    window.setTimeout(() => setCopiedId(false), 1200);
  }

  async function addComment() {
    if (!task || !comment.trim()) return;
    setCommenting(true);
    setError(null);
    try {
      const response = await fetch('/api/tasks/comment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: task.id, message: comment.trim(), actorAgentId: 'cai' })
      });
      if (!response.ok) throw new Error(await response.text());
      const event = (await response.json()) as TaskEvent;
      setEvents((current) => [event, ...current]);
      setComment('');
    } catch (commentError) {
      setError(
        commentError instanceof Error ? commentError.message : 'Kunde inte spara kommentaren.'
      );
    } finally {
      setCommenting(false);
    }
  }

  const save = useCallback(
    async (options?: { close?: boolean }) => {
      if (!task || !form.title.trim()) return;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const nextKey = editableKey(form);
      if (nextKey === lastSavedRef.current) {
        if (options?.close) onOpenChange(false);
        return;
      }

      setSaving(true);
      setSaveState('saving');
      setError(null);
      try {
        const response = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: task.id, ...form })
        });
        if (!response.ok) throw new Error(await response.text());
        const updated = (await response.json()) as Task;
        lastSavedRef.current = nextKey;
        setSaveState('saved');
        onTaskUpdate(updated);
        if (options?.close) onOpenChange(false);
      } catch (saveError) {
        setSaveState('dirty');
        setError(saveError instanceof Error ? saveError.message : 'Kunde inte spara tasken.');
      } finally {
        setSaving(false);
      }
    },
    [form, onOpenChange, onTaskUpdate, task]
  );

  useEffect(() => {
    if (!open || !task) return;
    if (formKey === lastSavedRef.current) return;
    if (!form.title.trim()) {
      setSaveState('dirty');
      return;
    }

    setSaveState('dirty');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void save();
    }, 900);
  }, [form.title, formKey, open, save, task]);

  const saveLabel =
    saveState === 'saving'
      ? 'Sparar…'
      : saveState === 'saved'
        ? 'Sparat automatiskt'
        : saveState === 'dirty'
          ? 'Osparade ändringar'
          : 'Autosparar';

  function requestOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    if (task && form.title.trim() && formKey !== lastSavedRef.current) {
      void save({ close: true });
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
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
                <Label>Owner/agent</Label>
                <Select
                  value={form.ownerAgentId || UNASSIGNED_OWNER}
                  onValueChange={(value) =>
                    update('ownerAgentId', value === UNASSIGNED_OWNER ? '' : value)
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='Choose agent' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_OWNER}>Unassigned</SelectItem>
                    {ownerOptions.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agentLabel(agent)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <Label htmlFor='task-description'>Full ticket</Label>
                {mermaidBlocks.length > 0 && (
                  <Badge variant='outline' className='gap-1'>
                    <Icons.chartBar className='size-3' />
                    {mermaidBlocks.length} diagram{mermaidBlocks.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>
              <Textarea
                id='task-description'
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
                className='min-h-64 font-mono text-sm leading-relaxed'
                placeholder='Beskriv ticketen, acceptance criteria, notes, beslut…'
              />
            </div>

            {mermaidBlocks.length > 0 && (
              <div className='space-y-3'>
                {mermaidBlocks.map((chart, index) => (
                  <MermaidDiagram
                    key={`${task.id}-diagram-${index}-${chart.slice(0, 24)}`}
                    title={`${form.title || 'Task'} diagram ${index + 1}`}
                    chart={chart}
                  />
                ))}
              </div>
            )}

            <div className='grid gap-2 rounded-xl border bg-muted/30 p-3 text-xs md:grid-cols-2'>
              <div className='flex min-w-0 items-center gap-2'>
                <span className='text-muted-foreground'>ID:</span>
                <code className='min-w-0 truncate font-mono'>{task.id}</code>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 shrink-0 gap-1 px-2 text-[11px]'
                  onClick={copyTaskId}
                >
                  <Icons.copy className='size-3' />
                  {copiedId ? 'Kopierad' : 'Kopiera'}
                </Button>
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

            <div className='space-y-3 rounded-xl border bg-muted/20 p-3'>
              <div className='flex items-center justify-between gap-2'>
                <Label htmlFor='task-comment'>Kommentarer / historik</Label>
                <Badge variant='secondary'>{events.length}</Badge>
              </div>
              <div className='flex flex-col gap-2 sm:flex-row'>
                <Input
                  id='task-comment'
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
                      void addComment();
                  }}
                  placeholder='Lägg till lösningsnotering, beslut eller nästa steg…'
                />
                <Button
                  type='button'
                  variant='secondary'
                  onClick={addComment}
                  isLoading={commenting}
                  disabled={!comment.trim() || commenting}
                >
                  Kommentera
                </Button>
              </div>
              <div className='max-h-48 space-y-2 overflow-y-auto pr-1'>
                {events.length ? (
                  events.map((event) => (
                    <div key={event.id} className='rounded-lg border bg-background/60 p-2 text-xs'>
                      <div className='mb-1 flex flex-wrap items-center gap-2 text-muted-foreground'>
                        <span className='font-medium text-foreground'>{event.kind}</span>
                        {event.actorAgentId && <span>{event.actorAgentId}</span>}
                        {event.createdAt && (
                          <span>{new Date(event.createdAt).toLocaleString('sv-SE')}</span>
                        )}
                      </div>
                      <p className='whitespace-pre-wrap'>{event.message}</p>
                    </div>
                  ))
                ) : (
                  <p className='text-muted-foreground text-xs'>Ingen historik ännu.</p>
                )}
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
          <div className='mr-auto flex items-center gap-2 text-xs text-muted-foreground'>
            <span
              className={
                saveState === 'dirty' || saveState === 'saving' ? 'text-primary' : undefined
              }
            >
              {saveLabel}
            </span>
          </div>
          <Button variant='outline' onClick={() => requestOpenChange(false)} disabled={saving}>
            Stäng
          </Button>
          <Button
            onClick={() => save({ close: true })}
            isLoading={saving}
            disabled={!task || !form.title.trim()}
          >
            Spara & stäng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
