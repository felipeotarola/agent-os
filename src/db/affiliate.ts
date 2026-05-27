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

export type AffiliateProduct = {
  id: string;
  accountId: string | null;
  accountName?: string | null;
  source: string;
  sourceProductId: string;
  title: string;
  category: string;
  price: number | null;
  currency: string;
  imageUrl: string;
  productUrl: string;
  trackingLink: string;
  stockStatus: 'in_stock' | 'out_of_stock' | 'limited' | 'unknown' | string;
  status: 'active' | 'draft' | 'archived' | string;
  rating: number | null;
  reviewCount: number;
  metadata?: Record<string, unknown>;
  updatedAt: string;
};

export type AffiliateSnapshot = {
  source: string;
  generatedAt: string;
  configured: boolean;
  connected: boolean;
  accounts: AffiliateAccount[];
  products: AffiliateProduct[];
  catalog: {
    totalProducts: number;
    activeProducts: number;
    categories: string[];
    inStockProducts: number;
    needsDataProducts: number;
  };
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
  products: [],
  catalog: {
    totalProducts: 0,
    activeProducts: 0,
    categories: [],
    inStockProducts: 0,
    needsDataProducts: 0
  },
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
