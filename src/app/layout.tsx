import type { Metadata, Viewport } from 'next';
import './vault.css';

export const metadata: Metadata = {
  title: {
    default: 'AgentOS Vault',
    template: '%s | AgentOS Vault'
  },
  description: 'Privat hantering av credentials för agenter och integrationer.',
  robots: {
    index: false,
    follow: false
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0d10'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='sv'>
      <body>{children}</body>
    </html>
  );
}
