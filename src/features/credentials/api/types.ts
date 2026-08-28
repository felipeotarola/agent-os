export interface ManagedCredential {
  name: string;
  project: string;
  description: string;
  bytes: number;
  fingerprint: string;
  updatedAt: string;
}

export interface CredentialCreateInput {
  name: string;
  project: string;
  description: string;
  value: string;
}

export interface CredentialUpdateInput {
  project: string;
  description: string;
  value?: string;
}

export interface CredentialsResponse {
  secrets: ManagedCredential[];
}

export interface CredentialResponse {
  secret: ManagedCredential;
}

export interface DeleteCredentialResponse {
  name: string;
  deleted: boolean;
  quarantined: boolean;
  quarantineId: string | null;
}
