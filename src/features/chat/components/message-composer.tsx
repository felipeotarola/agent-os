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
      className='border-t bg-background/95 p-3 sm:p-4'
      aria-label='Chat composer'
    >
      <div className='mx-auto flex max-w-4xl items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm sm:gap-3 sm:p-3'>
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
          className='max-h-32 min-h-11 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0 sm:text-sm'
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
    </form>
  );
}
