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
  completeness?: number;
  storeVerified?: boolean;
  updatedAt: string;
};

export type AffiliateOpportunity = {
  productId: string;
  title: string;
  category: string;
  score: number;
  confidence: number;
  status: 'ready' | 'watch' | 'needs_review' | string;
  evidence: string[];
  rejectionReasons: string[];
  factors: Record<string, number>;
  updatedAt: string;
};

export type AffiliateCatalogHealth = {
  status: 'healthy' | 'needs_attention' | string;
  blockingCount: number;
  checks: Array<{ id: string; label: string; count: number }>;
  repairQueue: Array<{
    productId: string;
    title: string;
    severity: 'blocker' | 'high' | 'medium' | string;
    issues: string[];
    suggestedFixes: string[];
  }>;
  weakestProducts: Array<{ id: string; title: string; completeness: number; missing: string[] }>;
  checkedAt: string;
};

export type AffiliateComplianceCheck = {
  productId: string;
  title: string;
  status: 'clear' | 'blocked' | string;
  warnings: string[];
  requiredApproval: boolean;
  platforms: string[];
};

export type AffiliateContentDraft = {
  id: string;
  productId: string;
  title: string;
  status: string;
  angle: string;
  formats: string[];
  brief: string;
};

export type AffiliateApprovalItem = {
  id: string;
  productId: string;
  title: string;
  kind: string;
  status: string;
  reason: string;
  nextAction: string;
};

export type AffiliateAnalytics = {
  status: 'tracking' | 'no_data' | string;
  latest: AffiliateDailyStat | null;
  last7: {
    days: number;
    current: {
      clicks: number;
      orderedItems: number;
      shippedItems: number;
      revenue: number;
      commission: number;
      conversionRate: number;
    };
    previous: {
      clicks: number;
      orderedItems: number;
      shippedItems: number;
      revenue: number;
      commission: number;
      conversionRate: number;
    };
  };
  deltas: {
    clicks: number;
    orderedItems: number;
    revenue: number;
    commission: number;
  };
  averageCtr: number | null;
  contentPerformance: Array<
    Record<string, unknown> & {
      date: string;
      accountId: string;
      accountName?: string;
      clicks: number;
      conversions: number;
      revenue: number;
      ctr: number | null;
      rankingChange: number | null;
    }
  >;
  rankingChanges: Array<Record<string, unknown> & { rankingChange: number | null }>;
  summary: string[];
  suggestedNextAction: string;
};

export type AffiliateSnapshot = {
  source: string;
  generatedAt: string;
  configured: boolean;
  connected: boolean;
  accounts: AffiliateAccount[];
  products: AffiliateProduct[];
  opportunities: AffiliateOpportunity[];
  catalogHealth: AffiliateCatalogHealth;
  compliance: {
    status: string;
    checks: AffiliateComplianceCheck[];
    rules: Record<string, Record<string, unknown>>;
  };
  contentPipeline: {
    drafts: AffiliateContentDraft[];
    approvalQueue: AffiliateApprovalItem[];
    visibleSurfaces: string[];
  };
  dailyBrief: {
    headline: string;
    topOpportunities: AffiliateOpportunity[];
    blockers: string[];
    suggestedActions: string[];
    generatedAt: string;
  };
  catalog: {
    totalProducts: number;
    activeProducts: number;
    categories: string[];
    inStockProducts: number;
    needsDataProducts: number;
  };
  analytics: AffiliateAnalytics;
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
  opportunities: [],
  catalogHealth: {
    status: 'fallback',
    blockingCount: 0,
    checks: [],
    repairQueue: [],
    weakestProducts: [],
    checkedAt: new Date().toISOString()
  },
  compliance: { status: 'fallback', checks: [], rules: {} },
  contentPipeline: { drafts: [], approvalQueue: [], visibleSurfaces: [] },
  analytics: {
    status: 'fallback',
    latest: null,
    last7: {
      days: 7,
      current: {
        clicks: 0,
        orderedItems: 0,
        shippedItems: 0,
        revenue: 0,
        commission: 0,
        conversionRate: 0
      },
      previous: {
        clicks: 0,
        orderedItems: 0,
        shippedItems: 0,
        revenue: 0,
        commission: 0,
        conversionRate: 0
      }
    },
    deltas: { clicks: 0, orderedItems: 0, revenue: 0, commission: 0 },
    averageCtr: null,
    contentPerformance: [],
    rankingChanges: [],
    summary: ['Affiliate bridge unavailable'],
    suggestedNextAction: 'Reconnect Agent OS bridge'
  },
  dailyBrief: {
    headline: 'Affiliate bridge unavailable',
    topOpportunities: [],
    blockers: ['Bridge unavailable'],
    suggestedActions: ['Reconnect Agent OS bridge'],
    generatedAt: new Date().toISOString()
  },
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
