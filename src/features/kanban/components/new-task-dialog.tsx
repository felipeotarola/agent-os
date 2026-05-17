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
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>Add Agent OS task</DialogTitle>
          <DialogDescription>
            Creates a real Postgres-backed task in the cockpit board.
          </DialogDescription>
        </DialogHeader>
        <form id='task-form' action='/api/tasks' method='post' className='grid gap-4 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='title'>Title</Label>
            <Input id='title' name='title' placeholder='Task title...' required />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='description'>Description</Label>
            <Textarea
              id='description'
              name='description'
              placeholder='What needs to happen?'
              className='min-h-28'
            />
          </div>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='priority'>Priority</Label>
              <Select name='priority' defaultValue='medium'>
                <SelectTrigger id='priority'>
                  <SelectValue placeholder='Priority' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='high'>High</SelectItem>
                  <SelectItem value='medium'>Medium</SelectItem>
                  <SelectItem value='low'>Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='ownerAgentId'>Owner</Label>
              <Select name='ownerAgentId' defaultValue='cai'>
                <SelectTrigger id='ownerAgentId'>
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
              <Label htmlFor='projectId'>Project</Label>
              <Select name='projectId' defaultValue='agent-os'>
                <SelectTrigger id='projectId'>
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
        </form>
        <DialogFooter>
          <DialogTrigger asChild>
            <Button type='submit' size='sm' form='task-form'>
              Add Task
            </Button>
          </DialogTrigger>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
