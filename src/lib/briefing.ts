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

type CaiBriefMessageRun = {
  jobId: string;
  label: string;
  slot: string;
  status: string;
  summary: string;
  delivered: boolean;
  deliveryStatus: string | null;
  runAtMs: number;
  ts: number;
};

type CaiBriefMessageSnapshot = {
  ok: boolean;
  source: string;
  latest: CaiBriefMessageRun | null;
  runs: CaiBriefMessageRun[];
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
    try {
      const response = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=BTC', {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Coinbase ${response.status}`, { cause: error });
      const json = await response.json();
      const rates = json.data?.rates ?? {};
      return {
        ok: true,
        priceSek: toNumber(rates.SEK),
        priceUsd: toNumber(rates.USD),
        change24h: null,
        source: 'coinbase:exchange-rates:fallback'
      };
    } catch (fallbackError) {
      console.error('Bitcoin fallback fetch failed', fallbackError);
      return {
        ok: false,
        priceSek: null,
        priceUsd: null,
        change24h: null,
        source: 'bitcoin:error'
      };
    }
  }
}

function decodeXml(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .trim();
}

function tagValue(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return null;
  return decodeXml(match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, ''));
}

async function getRssItems(url: string, source: string, limit = 4): Promise<NewsItem[]> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${source} RSS ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)]
    .map((match) => {
      const item = match[0];
      return {
        title: tagValue(item, 'title') ?? '',
        url: tagValue(item, 'link') ?? '',
        source,
        publishedAt: tagValue(item, 'pubDate') ?? null
      };
    })
    .filter((item) => item.title && item.url)
    .slice(0, limit);
}

async function getNewsSnapshot(): Promise<NewsSnapshot> {
  try {
    const [svt, hn, btc] = await Promise.allSettled([
      getRssItems('https://www.svt.se/nyheter/rss.xml', 'SVT Nyheter', 3),
      getRssItems('https://hnrss.org/frontpage', 'Hacker News', 3),
      getRssItems('https://cointelegraph.com/rss/tag/bitcoin', 'Cointelegraph Bitcoin', 2)
    ]);

    const items = [svt, hn, btc]
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index)
      .slice(0, 8);

    if (items.length > 0) return { ok: true, items, source: 'rss:svt+hn+bitcoin' };

    throw new Error('all RSS sources returned zero items');
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

async function getLatestCaiBriefMessage(): Promise<CaiBriefMessageSnapshot> {
  if (!hasBridge()) {
    return { ok: false, source: 'bridge:not-configured', latest: null, runs: [] };
  }
  try {
    const result = await bridgeRequest<Omit<CaiBriefMessageSnapshot, 'ok'>>(
      '/cai/latest-brief-message'
    );
    return { ok: true, ...result };
  } catch (error) {
    console.error('Latest Cai brief message failed', error);
    return {
      ok: false,
      source: 'openclaw:cron-runs:error',
      latest: null,
      runs: [],
      error: error instanceof Error ? error.message : 'unknown cron run error'
    };
  }
}

export async function getCaiBriefing() {
  const [cockpit, dispatch, bitcoin, news, latestMessage] = await Promise.all([
    getCockpitSnapshot(),
    getDispatchSummary(),
    getBitcoinSnapshot(),
    getNewsSnapshot(),
    getLatestCaiBriefMessage()
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
    latestMessage,
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
