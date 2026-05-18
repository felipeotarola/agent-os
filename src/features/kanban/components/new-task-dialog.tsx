'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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

export default function NewTaskDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant='secondary' size='sm'>
          + Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className='w-[calc(100vw-2rem)] max-w-[520px] overflow-hidden sm:max-w-[520px]'>
        <DialogHeader className='min-w-0 pr-6'>
          <DialogTitle>Add Agent OS task</DialogTitle>
          <DialogDescription>
            Creates a real Postgres-backed task in the cockpit board.
          </DialogDescription>
        </DialogHeader>
        <form action='/api/tasks' method='post' className='grid min-w-0 max-w-full gap-4 py-4'>
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='new-task-title'>Title</Label>
            <Input
              id='new-task-title'
              name='title'
              placeholder='Task title...'
              className='max-w-full'
              required
            />
          </div>
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='new-task-description'>Description</Label>
            <Textarea
              id='new-task-description'
              name='description'
              placeholder='What needs to happen?'
              className='min-h-28 max-w-full resize-y'
            />
          </div>
          <div className='grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3'>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='new-task-priority'>Priority</Label>
              <Select name='priority' defaultValue='medium'>
                <SelectTrigger id='new-task-priority' className='w-full max-w-full'>
                  <SelectValue placeholder='Priority' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='high'>High</SelectItem>
                  <SelectItem value='medium'>Medium</SelectItem>
                  <SelectItem value='low'>Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='new-task-owner'>Owner</Label>
              <Select name='ownerAgentId' defaultValue='cai'>
                <SelectTrigger id='new-task-owner' className='w-full max-w-full'>
                  <SelectValue placeholder='Owner' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='cai'>Cai</SelectItem>
                  <SelectItem value='charles'>Charles</SelectItem>
                  <SelectItem value='sladdis'>Sladdis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='new-task-project'>Project</Label>
              <Select name='projectId' defaultValue='agent-os'>
                <SelectTrigger id='new-task-project' className='w-full max-w-full'>
                  <SelectValue placeholder='Project' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='agent-os'>Agent OS</SelectItem>
                  <SelectItem value='life-os'>Life OS</SelectItem>
                  <SelectItem value='lysande'>Lysande</SelectItem>
                  <SelectItem value='health'>Health</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className='min-w-0 pt-2'>
            <Button type='submit' size='sm' className='w-full sm:w-auto'>
              Add Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
