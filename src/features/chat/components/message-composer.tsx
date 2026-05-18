'use client';

import { FormEvent } from 'react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface MessageComposerProps {
  draft: string;
  isSending: boolean;
  onDraftChange: (text: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

const suggestions = [
  'What can you do?',
  'Show latest runs',
  'Create a task',
  'Weather in Stockholm'
];

export function MessageComposer({
  draft,
  isSending,
  onDraftChange,
  onSubmit
}: MessageComposerProps) {
  const canSend = draft.trim().length > 0 && !isSending;

  return (
    <form
      onSubmit={onSubmit}
      className='border-t bg-background/90 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4 sm:py-4'
      aria-label='Chat composer'
    >
      <div className='mx-auto flex max-w-3xl flex-col gap-2'>
        <div className='no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1'>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type='button'
              onClick={() => onDraftChange(suggestion)}
              className='text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded-full border bg-card px-3 py-1.5 text-xs transition-colors'
              disabled={isSending}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className='flex items-end gap-2 rounded-[1.6rem] border bg-card p-2 shadow-lg shadow-black/5 sm:gap-3 sm:p-3'>
          <button
            type='button'
            className='text-muted-foreground hover:bg-muted hover:text-foreground flex size-10 shrink-0 items-center justify-center rounded-full transition-colors'
            aria-label='Attach file'
            disabled={isSending}
          >
            <Icons.paperclip className='size-4' aria-hidden='true' />
          </button>
          <label htmlFor='agent-chat-composer' className='sr-only'>
            Message
          </label>
          <Textarea
            id='agent-chat-composer'
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder='Message this agent…'
            rows={1}
            className='max-h-32 min-h-11 resize-none border-0 bg-transparent px-1 py-2.5 text-base shadow-none focus-visible:ring-0 sm:text-sm'
            disabled={isSending}
          />
          <Button
            type='submit'
            size='icon'
            className='size-11 shrink-0 rounded-full'
            disabled={!canSend}
          >
            <Icons.send className='size-4' aria-hidden='true' />
            <span className='sr-only'>{isSending ? 'Sending' : 'Send message'}</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
