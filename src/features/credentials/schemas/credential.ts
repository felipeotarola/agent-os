import * as z from 'zod';

export const CREDENTIAL_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;

const nameSchema = z
  .string()
  .trim()
  .regex(CREDENTIAL_NAME_PATTERN, 'Use 2–80 uppercase letters, numbers, or underscores.');

const projectSchema = z.string().trim().max(80, 'Project must be 80 characters or fewer.');
const descriptionSchema = z
  .string()
  .trim()
  .max(240, 'Description must be 240 characters or fewer.');
const requiredValueSchema = z
  .string()
  .trim()
  .min(1, 'Secret value is required.')
  .max(16_384, 'Secret value is too large.');
const replacementValueSchema = z
  .string()
  .max(16_384, 'Secret value is too large.')
  .refine((value) => value.length === 0 || value.trim().length > 0, {
    message: 'A replacement value cannot contain only whitespace.'
  });

export const createCredentialSchema = z.object({
  name: nameSchema,
  project: projectSchema,
  description: descriptionSchema,
  value: requiredValueSchema
});

export const updateCredentialSchema = z.object({
  name: nameSchema,
  project: projectSchema,
  description: descriptionSchema,
  value: replacementValueSchema
});

export type CredentialFormValues = z.infer<typeof createCredentialSchema>;
