export interface CredentialVaultOptions {
  secretsDir?: string;
  fingerprintKey?: string;
}

export interface ManagedCredential {
  name: string;
  project: string;
  description: string;
  bytes: number;
  fingerprint: string;
  updatedAt: string;
}

export interface CredentialResponse {
  secret: ManagedCredential;
}

export interface CredentialListResponse {
  secrets: ManagedCredential[];
}

export interface CredentialDeleteResponse {
  name: string;
  deleted: true;
  quarantined: boolean;
  quarantineId: string | null;
}

export interface CredentialVault {
  readonly secretsDir: string;
  listSecrets(): Promise<CredentialListResponse>;
  createSecret(input: unknown): Promise<CredentialResponse>;
  updateSecret(name: string, input: unknown): Promise<CredentialResponse>;
  deleteSecret(name: string): Promise<CredentialDeleteResponse>;
}

export const DEFAULT_CREDENTIAL_VAULT_DIR: string;

export class CredentialVaultError extends Error {
  readonly status: number;
  constructor(message: string, status?: number);
}

export function createCredentialVault(options?: CredentialVaultOptions): CredentialVault;

export const credentialVault: CredentialVault;
