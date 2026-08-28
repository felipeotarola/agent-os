import { CredentialsPage } from '@/features/credentials/components/credentials-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Credential Vault'
};

export default function CredentialsRoute() {
  return <CredentialsPage />;
}
