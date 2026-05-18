'use client';

import { Button } from '@/components/ui/button';
import { useFormStatus } from 'react-dom';

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingText?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  disabled?: boolean;
};

export function SubmitButton({
  children,
  pendingText = 'Kör…',
  variant = 'default',
  size = 'default',
  className,
  disabled = false
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type='submit'
      size={size}
      variant={variant}
      className={className}
      disabled={disabled}
      isLoading={pending}
      aria-live='polite'
    >
      {pending ? pendingText : children}
    </Button>
  );
}
