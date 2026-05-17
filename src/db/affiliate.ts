import { bridgeRequest, hasBridge } from '@/lib/bridge';

export type AffiliateAccount = {
  id: string;
  provider: string;
  name: string;
  trackingId: string;
  marketplace: string;
  status: string;
  source: string;
  notes: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
};

export type AffiliateDailyStat = {
  id: string;
  accountId: string;
  accountName?: string;
  date: string;
  clicks: number;
  orderedItems: number;
  shippedItems: number;
  revenue: number;
  commission: number;
  currency: string;
  conversionRate: number;
  topProducts: Array<Record<string, unknown>>;
  source: string;
};

export type AffiliateSnapshot = {
  source: string;
  generatedAt: string;
  configured: boolean;
  connected: boolean;
  accounts: AffiliateAccount[];
  totals: {
    clicks: number;
    orderedItems: number;
    shippedItems: number;
    revenue: number;
    commission: number;
    conversionRate: number;
    currency: string;
  };
  rows: AffiliateDailyStat[];
  nextSteps: string[];
};

const fallback: AffiliateSnapshot = {
  source: 'fallback',
  generatedAt: new Date().toISOString(),
  configured: false,
  connected: false,
  accounts: [],
  totals: {
    clicks: 0,
    orderedItems: 0,
    shippedItems: 0,
    revenue: 0,
    commission: 0,
    conversionRate: 0,
    currency: 'SEK'
  },
  rows: [],
  nextSteps: ['Bridge saknas. Koppla AGENT_OS_BRIDGE_URL och AGENT_OS_BRIDGE_TOKEN.']
};

export async function getAffiliateSnapshot(): Promise<AffiliateSnapshot> {
  if (!hasBridge()) return fallback;
  try {
    return await bridgeRequest<AffiliateSnapshot>('/affiliate/snapshot');
  } catch (error) {
    console.error('Affiliate bridge request failed', error);
    return fallback;
  }
}
