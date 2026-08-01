import type {
  CredentialCreateInput,
  CredentialResponse,
  CredentialsResponse,
  CredentialUpdateInput,
  DeleteCredentialResponse,
  ManagedCredential
} from './types';

interface ApiErrorPayload {
  error?: string;
}

function normalizeCredential(credential: ManagedCredential): ManagedCredential {
  return {
    ...credential,
    project: credential.project ?? ''
  };
}

async function readPayload<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) {
    throw new Error(payload.error ?? fallbackMessage);
  }
  return payload;
}

export async function listCredentials(signal?: AbortSignal): Promise<ManagedCredential[]> {
  const response = await fetch('/api/secrets', {
    cache: 'no-store',
    signal
  });
  const payload = await readPayload<CredentialsResponse>(response, 'Could not load credentials.');
  return payload.secrets.map(normalizeCredential);
}

export async function createCredential(input: CredentialCreateInput): Promise<ManagedCredential> {
  const response = await fetch('/api/secrets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  const payload = await readPayload<CredentialResponse>(response, 'Could not save credential.');
  return normalizeCredential(payload.secret);
}

export async function updateCredential(
  name: string,
  input: CredentialUpdateInput
): Promise<ManagedCredential> {
  const response = await fetch(`/api/secrets/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  const payload = await readPayload<CredentialResponse>(response, 'Could not update credential.');
  return normalizeCredential(payload.secret);
}

export async function deleteCredential(name: string): Promise<DeleteCredentialResponse> {
  const response = await fetch(`/api/secrets/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
  return readPayload<DeleteCredentialResponse>(response, 'Could not delete credential.');
}
