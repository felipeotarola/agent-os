import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { getCockpitSnapshot } from '@/db/queries';

type DispatchTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignee?: string | null;
  projectName?: string | null;
};

type DispatchGroup = {
  agentId: string;
  agentName: string;
  emoji?: string;
  count: number;
  highPriorityCount: number;
  tasks: DispatchTask[];
};

type DispatchSummary = {
  generatedAt: string;
  actionableCount: number;
  byAgent: DispatchGroup[];
  suggestedMessage: string;
};

type BitcoinSnapshot = {
  ok: boolean;
  priceSek: number | null;
  priceUsd: number | null;
  change24h: number | null;
  source: string;
};

type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt?: string | null;
};

type NewsSnapshot = {
  ok: boolean;
  items: NewsItem[];
  source: string;
  error?: string;
};

const fallbackDispatch: DispatchSummary = {
  generatedAt: new Date().toISOString(),
  actionableCount: 0,
  byAgent: [],
  suggestedMessage: 'Bridge dispatch-summary unavailable.'
};

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function getDispatchSummary(): Promise<DispatchSummary> {
  if (!hasBridge()) return fallbackDispatch;
  try {
    return await bridgeRequest<DispatchSummary>('/tasks/dispatch-summary');
  } catch (error) {
    console.error('Cai briefing dispatch summary failed', error);
    return fallbackDispatch;
  }
}

async function getBitcoinSnapshot(): Promise<BitcoinSnapshot> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=sek,usd&include_24hr_change=true',
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error(`CoinGecko ${response.status}`);
    const json = await response.json();
    const bitcoin = json.bitcoin ?? {};
    return {
      ok: true,
      priceSek: toNumber(bitcoin.sek),
      priceUsd: toNumber(bitcoin.usd),
      change24h: toNumber(bitcoin.sek_24h_change ?? bitcoin.usd_24h_change),
      source: 'coingecko:simple-price'
    };
  } catch (error) {
    console.error('Bitcoin briefing fetch failed', error);
    return {
      ok: false,
      priceSek: null,
      priceUsd: null,
      change24h: null,
      source: 'coingecko:error'
    };
  }
}

async function getNewsSnapshot(): Promise<NewsSnapshot> {
  try {
    const response = await fetch(
      'https://hn.algolia.com/api/v1/search_by_date?tags=front_page&hitsPerPage=6',
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error(`HN ${response.status}`);
    const json = await response.json();
    const items = (Array.isArray(json.hits) ? json.hits : [])
      .map((hit: Record<string, unknown>) => ({
        title: String(hit.title || hit.story_title || '').trim(),
        url: String(
          hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`
        ).trim(),
        source: 'Hacker News',
        publishedAt: typeof hit.created_at === 'string' ? hit.created_at : null
      }))
      .filter((item: NewsItem) => item.title && item.url)
      .slice(0, 5);

    return { ok: true, items, source: 'hackernews:front_page' };
  } catch (error) {
    console.error('News briefing fetch failed', error);
    return {
      ok: false,
      items: [],
      source: 'hackernews:error',
      error: error instanceof Error ? error.message : 'unknown news error'
    };
  }
}

export async function getCaiBriefing() {
  const [cockpit, dispatch, bitcoin, news] = await Promise.all([
    getCockpitSnapshot(),
    getDispatchSummary(),
    getBitcoinSnapshot(),
    getNewsSnapshot()
  ]);

  const taskStatus = cockpit.taskStatus ?? {};
  const openTasks = Object.entries(taskStatus)
    .filter(([status]) => !['done', 'cancelled'].includes(status))
    .reduce((sum, [, count]) => sum + Number(count), 0);
  const runningAgents = cockpit.subagents?.runningCount ?? 0;
  const latestEvent = cockpit.events?.[0] ?? null;
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    cockpit,
    dispatch,
    bitcoin,
    news,
    pulse: {
      openTasks,
      reviewTasks: Number(taskStatus.review ?? 0),
      waitingTasks: Number(taskStatus.waiting ?? 0),
      runningAgents,
      memoryChunks:
        cockpit.stats.find((stat) => stat.label.toLowerCase().includes('memory'))?.value ?? '—',
      latestEvent
    }
  };
}

export type CaiBriefing = Awaited<ReturnType<typeof getCaiBriefing>>;
