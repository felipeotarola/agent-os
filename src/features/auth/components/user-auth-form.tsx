'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppForm } from '@/components/ui/tanstack-form';
import { useTransition } from 'react';
import { toast } from 'sonner';
import * as z from 'zod';

const formSchema = z.object({
  email: z.string().email({ message: 'Enter a valid email address' })
});

export default function UserAuthForm() {
  const [loading, startTransition] = useTransition();

  const form = useAppForm({
    defaultValues: {
      email: ''
    },
    validators: {
      onSubmit: formSchema
    },
    onSubmit: () => {
      startTransition(() => {
        toast.success('Signed In Successfully!');
      });
    }
  });

  return (
    <>
      <form.AppForm>
        <form.Form className='w-full space-y-2'>
          <form.AppField
            name='email'
            children={(field) => (
              <field.FieldSet>
                <field.Field>
                  <field.FieldLabel htmlFor={field.name}>Email</field.FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder='Enter your email...'
                    disabled={loading}
                    aria-invalid={field.state.meta.isTouched && !field.state.meta.isValid}
                  />
                </field.Field>
                <field.FieldError />
              </field.FieldSet>
            )}
          />
          <Button disabled={loading} className='mt-2 ml-auto w-full' type='submit'>
            Continue With Email
          </Button>
        </form.Form>
      </form.AppForm>
    </>
  );
}
