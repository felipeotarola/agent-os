'use client';

import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group';
import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import type { ManagedCredential } from '@/features/credentials/api/types';
import {
  createCredentialSchema,
  type CredentialFormValues,
  updateCredentialSchema
} from '@/features/credentials/schemas/credential';
import * as React from 'react';

interface CredentialEditorDialogProps {
  credential: ManagedCredential | null;
  existingProjects: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: CredentialFormValues) => Promise<void>;
}

interface SecretValueInputProps {
  id: string;
  value: string;
  invalid: boolean;
  replacement: boolean;
  onBlur: () => void;
  onChange: (value: string) => void;
}

function SecretValueInput({
  id,
  value,
  invalid,
  replacement,
  onBlur,
  onChange
}: SecretValueInputProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        name={id}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        type={visible ? 'text' : 'password'}
        placeholder={replacement ? 'Enter a new value to rotate' : 'Paste the secret value'}
        autoComplete='new-password'
        spellCheck={false}
        aria-invalid={invalid}
      />
      <InputGroupAddon align='inline-end'>
        <InputGroupButton
          size='icon-xs'
          aria-label={visible ? 'Hide secret value' : 'Show secret value'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <Icons.eyeOff /> : <Icons.eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export function CredentialEditorDialog({
  credential,
  existingProjects,
  open,
  onOpenChange,
  onSave
}: CredentialEditorDialogProps) {
  const editing = credential !== null;
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const dialogContentRef = React.useRef<HTMLDivElement>(null);
  const { FormTextField, FormTextareaField } = useFormFields<CredentialFormValues>();
  const form = useAppForm({
    defaultValues: {
      name: credential?.name ?? '',
      project: credential?.project ?? '',
      description: credential?.description ?? '',
      value: ''
    } as CredentialFormValues,
    validators: {
      onSubmit: editing ? updateCredentialSchema : createCredentialSchema
    },
    onSubmitInvalid: () => {
      requestAnimationFrame(() => {
        dialogContentRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await onSave(value);
        form.reset();
        onOpenChange(false);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : 'Could not save credential.');
      }
    }
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset();
      setSubmitError(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className='max-h-[min(92vh,48rem)] overflow-y-auto sm:max-w-xl'
      >
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit credential' : 'Add credential'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update its project or description, and optionally replace the stored value.'
              : 'Store a server-side credential for an Agent OS project or integration.'}
          </DialogDescription>
        </DialogHeader>

        <form.AppForm>
          <form.Form className='gap-5 p-0 md:p-0'>
            {submitError ? (
              <Alert variant='destructive'>
                <Icons.alertCircle />
                <AlertTitle>Credential was not saved</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            ) : null}

            <form.AppField name='name'>
              {(field) => {
                const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <field.FieldSet>
                    <field.Field
                      data-invalid={invalid || undefined}
                      data-disabled={editing || undefined}
                    >
                      <field.FieldLabel htmlFor={field.name}>
                        Environment key name *
                      </field.FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value.toUpperCase())}
                        placeholder='OPENAI_API_KEY'
                        autoComplete='off'
                        spellCheck={false}
                        maxLength={80}
                        disabled={editing}
                        aria-invalid={invalid}
                        className='font-mono'
                      />
                      <field.FieldDescription>
                        {editing
                          ? 'Names stay fixed so integrations do not lose their reference.'
                          : 'Use uppercase letters, numbers, and underscores.'}
                      </field.FieldDescription>
                    </field.Field>
                    <field.FieldError />
                  </field.FieldSet>
                );
              }}
            </form.AppField>

            <FormTextField
              name='project'
              label='Project or scope'
              placeholder='Agent OS, Sladdis, Personal infra…'
              description='Optional. Used to organize and filter the credential inventory.'
              list='credential-project-options'
              maxLength={80}
              autoComplete='off'
            />
            <datalist id='credential-project-options'>
              {existingProjects.map((project) => (
                <option key={project} value={project} />
              ))}
            </datalist>

            <FormTextareaField
              name='description'
              label='Description'
              placeholder='What uses this credential?'
              description='Describe the consumer or purpose without including sensitive data.'
              maxLength={240}
              rows={3}
            />

            <form.AppField name='value'>
              {(field) => {
                const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <field.FieldSet>
                    <field.Field data-invalid={invalid || undefined}>
                      <field.FieldLabel htmlFor={field.name}>
                        {editing ? 'Replacement value' : 'Secret value *'}
                      </field.FieldLabel>
                      <SecretValueInput
                        id={field.name}
                        value={field.state.value}
                        invalid={invalid}
                        replacement={editing}
                        onBlur={field.handleBlur}
                        onChange={field.handleChange}
                      />
                      <field.FieldDescription>
                        {editing
                          ? 'Leave blank to keep the stored value. Existing values are never loaded into this form.'
                          : 'The visibility control only reveals this unsaved draft. After saving, the value cannot be viewed here.'}
                      </field.FieldDescription>
                    </field.Field>
                    <field.FieldError />
                  </field.FieldSet>
                );
              }}
            </form.AppField>

            <DialogFooter>
              <Button type='button' variant='outline' onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <form.SubmitButton>{editing ? 'Save changes' : 'Save credential'}</form.SubmitButton>
            </DialogFooter>
          </form.Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  );
}
