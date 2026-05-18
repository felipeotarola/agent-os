'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Kanban, KanbanBoard as KanbanBoardPrimitive, KanbanOverlay } from '@/components/ui/kanban';
import type { KanbanColumns, Task } from '../utils/store';
import { TASK_COLUMNS } from '../utils/store';
import { TaskColumn } from './board-column';
import { TaskCard } from './task-card';
import { TaskDetailDialog } from './task-detail-dialog';
import { createRestrictToContainer } from '../utils/restrict-to-container';

type KanbanBoardProps = {
  initialColumns: KanbanColumns;
  columnOrder?: string[];
};

function normalizeColumns(columns: KanbanColumns, columnOrder: string[]) {
  const normalized: KanbanColumns = {};
  for (const column of columnOrder) normalized[column] = columns[column] ?? [];
  return normalized;
}

async function persistBoard(columns: KanbanColumns) {
  const updates = Object.entries(columns).flatMap(([status, tasks]) =>
    tasks.map((task, index) => ({ id: task.id, status, position: (index + 1) * 1000 }))
  );

  const response = await fetch('/api/tasks/reorder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ updates })
  });
  if (!response.ok) throw new Error(await response.text());
}

export function KanbanBoard({ initialColumns, columnOrder = [...TASK_COLUMNS] }: KanbanBoardProps) {
  const orderedColumns = useMemo(
    () => (columnOrder.length ? columnOrder : [...TASK_COLUMNS]),
    [columnOrder]
  );
  const [columns, setColumnsState] = useState<KanbanColumns>(() =>
    normalizeColumns(initialColumns, orderedColumns)
  );
  const [syncState, setSyncState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- factory function, stable after mount
  const restrictToBoard = useCallback(
    createRestrictToContainer(() => containerRef.current),
    []
  );

  const setColumns = useCallback(
    (nextColumns: Record<string, Task[]>) => {
      const normalized = normalizeColumns(nextColumns, orderedColumns);
      setColumnsState(normalized);
      setSyncState('saving');
      persistBoard(normalized)
        .then(() => setSyncState('saved'))
        .catch((error) => {
          console.error('Failed to persist task board', error);
          setSyncState('error');
        });
    },
    [orderedColumns]
  );

  const updateTaskInColumns = useCallback(
    (updatedTask: Task) => {
      setColumnsState((currentColumns) => {
        const nextColumns = normalizeColumns(currentColumns, orderedColumns);
        for (const column of Object.keys(nextColumns)) {
          nextColumns[column] = nextColumns[column].filter((task) => task.id !== updatedTask.id);
        }
        const status = orderedColumns.includes(updatedTask.status) ? updatedTask.status : 'backlog';
        nextColumns[status] = [...(nextColumns[status] ?? []), updatedTask].sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0)
        );
        return nextColumns;
      });
      setSelectedTask(updatedTask);
      setSyncState('saved');
    },
    [orderedColumns]
  );

  return (
    <div ref={containerRef} className='space-y-3'>
      <div className='flex justify-end'>
        <span className='text-muted-foreground text-xs'>
          {syncState === 'saving'
            ? 'Sparar…'
            : syncState === 'error'
              ? 'Sync-fel'
              : 'Synkad med Postgres'}
        </span>
      </div>
      <Kanban
        value={columns}
        onValueChange={setColumns}
        getItemValue={(item) => item.id}
        modifiers={[restrictToBoard]}
        autoScroll={false}
      >
        <div className='w-full overflow-x-auto rounded-md pb-4'>
          <KanbanBoardPrimitive className='flex flex-col items-start gap-4 md:flex-row'>
            {orderedColumns.map((columnValue) => (
              <TaskColumn
                key={columnValue}
                value={columnValue}
                tasks={columns[columnValue] ?? []}
                onTaskOpen={setSelectedTask}
              />
            ))}
          </KanbanBoardPrimitive>
        </div>
        <KanbanOverlay>
          {({ value, variant }) => {
            if (variant === 'column') {
              const tasks = columns[value] ?? [];
              return <TaskColumn value={value} tasks={tasks} />;
            }

            const task = Object.values(columns)
              .flat()
              .find((task) => task.id === value);

            if (!task) return null;
            return <TaskCard task={task} />;
          }}
        </KanbanOverlay>
      </Kanban>
      <TaskDetailDialog
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
        onTaskUpdate={updateTaskInColumns}
      />
    </div>
  );
}
