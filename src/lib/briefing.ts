import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { getCockpitSnapshot } from '@/db/queries';
import type { CockpitSnapshot } from '@/db/queries';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type DispatchTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignee?: string | null;
  projectName?: string | null;
  dueDate?: string | null;
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

type MarketAsset = {
  id: string;
  label: string;
  symbol: string;
  kind: 'crypto' | 'tracker' | 'fund';
  holding: boolean;
  quantity?: string | null;
  priceSek: number | null;
  priceUsd: number | null;
  change24h: number | null;
  source: string;
};

type MarketsSnapshot = {
  ok: boolean;
  source: string;
  assets: MarketAsset[];
  holdings: {
    count: number;
    liveCount: number;
    averageChange24h: number | null;
  };
};

type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt?: string | null;
  imageUrl?: string | null;
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

const fallbackCockpit: CockpitSnapshot = {
  dbOnline: false,
  stats: [],
  tasks: [],
  agents: [],
  subagents: {
    ok: false,
    source: 'overview:fallback',
    available: false,
    runningCount: 0,
    activeTaskRunCount: 0,
    activeSessionCount: 0,
    recent: [],
    activeSessions: [],
    error: 'Overview snapshot timed out',
    checkedAt: new Date().toISOString()
  },
  taskStatus: {},
  events: [],
  generatedAt: new Date().toISOString()
};

const NEWS_IMAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;
const BITCOIN_CACHE_TTL_MS = 60 * 1000;
const MARKETS_CACHE_TTL_MS = 60 * 1000;
const BRIDGE_CACHE_TTL_MS = 30 * 1000;

const newsImageCache = new Map<string, { imageUrl: string | null; expiresAt: number }>();
const briefingCache = new Map<string, { value: unknown; expiresAt: number }>();

type PrivateHolding = {
  id: string;
  quantity?: string | null;
};

type PrivateHoldingsConfig = {
  holdings?: PrivateHolding[];
};

async function cachedBriefingValue<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  fallback: T
): Promise<T> {
  const cached = briefingCache.get(key) as { value: T; expiresAt: number } | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const value = await fetcher();
    briefingCache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } catch (error) {
    if (cached) return cached.value;
    console.error(`Cai briefing ${key} failed`, error);
    return fallback;
  }
}

function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 1500) {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs)
  });
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function getPrivateHoldingsConfig(): Promise<PrivateHoldingsConfig> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'data/private/holdings.json'), 'utf8');
    return JSON.parse(raw) as PrivateHoldingsConfig;
  } catch {
    return {};
  }
}

function applyPrivateHoldings(assets: MarketAsset[], config: PrivateHoldingsConfig) {
  const holdings = new Map((config.holdings ?? []).map((holding) => [holding.id, holding]));
  if (holdings.size === 0) return assets;
  return assets.map((asset) => {
    const holding = holdings.get(asset.id);
    if (!holding) return asset;
    return {
      ...asset,
      holding: true,
      quantity: holding.quantity ?? asset.quantity ?? null
    };
  });
}

async function getDispatchSummary(): Promise<DispatchSummary> {
  if (!hasBridge()) return fallbackDispatch;
  return cachedBriefingValue(
    'dispatch',
    BRIDGE_CACHE_TTL_MS,
    () =>
      bridgeRequest<DispatchSummary>('/tasks/dispatch-summary', {
        signal: AbortSignal.timeout(1200)
      }),
    fallbackDispatch
  );
}

async function getBitcoinSnapshot(): Promise<BitcoinSnapshot> {
  try {
    const response = await fetchWithTimeout(
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
      const response = await fetchWithTimeout(
        'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
        {
          cache: 'no-store'
        }
      );
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

const fallbackBitcoin: BitcoinSnapshot = {
  ok: false,
  priceSek: null,
  priceUsd: null,
  change24h: null,
  source: 'bitcoin:fallback'
};

const manualMarketAssets: MarketAsset[] = [
  {
    id: 'bitcoin-xbt',
    label: 'CoinShares Bitcoin XBT',
    symbol: 'BITCOIN XBT',
    kind: 'tracker',
    holding: true,
    priceSek: null,
    priceUsd: null,
    change24h: null,
    source: 'watchlist:manual'
  },
  {
    id: 'ether-xbt',
    label: 'CoinShares Ether XBT',
    symbol: 'ETHER XBT',
    kind: 'tracker',
    holding: true,
    priceSek: null,
    priceUsd: null,
    change24h: null,
    source: 'watchlist:manual'
  },
  {
    id: 'valour-btc-zero-sek',
    label: 'Valour Bitcoin Zero SEK',
    symbol: 'BTC ZERO SEK',
    kind: 'tracker',
    holding: true,
    priceSek: null,
    priceUsd: null,
    change24h: null,
    source: 'watchlist:manual'
  },
  {
    id: 'avanza-disruptive-ark',
    label: 'Avanza Disruptive Innovation by ARK Invest',
    symbol: 'ARK fund',
    kind: 'fund',
    holding: true,
    priceSek: null,
    priceUsd: null,
    change24h: null,
    source: 'watchlist:manual'
  },
  {
    id: 'lf-global-index',
    label: 'Länsförsäkringar Global Index',
    symbol: 'Global index',
    kind: 'fund',
    holding: true,
    priceSek: null,
    priceUsd: null,
    change24h: null,
    source: 'watchlist:manual'
  },
  {
    id: 'storebrand-usa-a-sek',
    label: 'Storebrand USA A SEK',
    symbol: 'USA fund',
    kind: 'fund',
    holding: true,
    priceSek: null,
    priceUsd: null,
    change24h: null,
    source: 'watchlist:manual'
  }
];

async function getMarketsSnapshot(): Promise<MarketsSnapshot> {
  try {
    const response = await fetchWithTimeout(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=sek,usd&include_24hr_change=true',
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error(`CoinGecko ${response.status}`);
    const json = await response.json();
    const bitcoin = json.bitcoin ?? {};
    const ethereum = json.ethereum ?? {};
    const bitcoinChange = toNumber(bitcoin.sek_24h_change ?? bitcoin.usd_24h_change);
    const ethereumChange = toNumber(ethereum.sek_24h_change ?? ethereum.usd_24h_change);
    const privateHoldings = await getPrivateHoldingsConfig();
    const assets: MarketAsset[] = applyPrivateHoldings(
      [
        {
          id: 'bitcoin',
          label: 'Bitcoin',
          symbol: 'BTC',
          kind: 'crypto',
          holding: true,
          priceSek: toNumber(bitcoin.sek),
          priceUsd: toNumber(bitcoin.usd),
          change24h: bitcoinChange,
          source: 'coingecko:simple-price'
        },
        {
          id: 'ethereum',
          label: 'Ethereum',
          symbol: 'ETH',
          kind: 'crypto',
          holding: false,
          priceSek: toNumber(ethereum.sek),
          priceUsd: toNumber(ethereum.usd),
          change24h: ethereumChange,
          source: 'coingecko:simple-price'
        },
        ...manualMarketAssets.map((asset) => ({
          ...asset,
          change24h:
            asset.id === 'bitcoin-xbt' || asset.id === 'valour-btc-zero-sek'
              ? bitcoinChange
              : asset.id === 'ether-xbt'
                ? ethereumChange
                : asset.change24h,
          source:
            asset.id === 'bitcoin-xbt' || asset.id === 'valour-btc-zero-sek'
              ? 'coingecko:btc-proxy'
              : asset.id === 'ether-xbt'
                ? 'coingecko:eth-proxy'
                : asset.source
        }))
      ],
      privateHoldings
    );
    const liveHoldingChanges = assets
      .filter((asset) => asset.holding && asset.change24h !== null)
      .map((asset) => asset.change24h as number);

    return {
      ok: true,
      source: 'coingecko:simple-price+watchlist',
      assets,
      holdings: summarizeHoldings(assets, liveHoldingChanges)
    };
  } catch (error) {
    console.error('Markets briefing fetch failed', error);
    const privateHoldings = await getPrivateHoldingsConfig();
    const assets = applyPrivateHoldings(manualMarketAssets, privateHoldings);
    return {
      ok: false,
      source: 'markets:fallback',
      assets,
      holdings: summarizeHoldings(assets)
    };
  }
}

const fallbackMarkets: MarketsSnapshot = {
  ok: false,
  source: 'markets:fallback',
  assets: manualMarketAssets,
  holdings: summarizeHoldings(manualMarketAssets, [])
};

function summarizeHoldings(assets: MarketAsset[], liveChanges?: number[]) {
  const holdingAssets = assets.filter((asset) => asset.holding);
  const changes =
    liveChanges ??
    holdingAssets
      .filter((asset) => asset.change24h !== null)
      .map((asset) => asset.change24h as number);
  return {
    count: holdingAssets.length,
    liveCount: changes.length,
    averageChange24h:
      changes.length > 0 ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null
  };
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

function attrValue(fragment: string, attr: string) {
  const match = fragment.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
  return match ? decodeXml(match[1]) : null;
}

function absoluteUrl(value: string | null, baseUrl: string) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function isLikelyImageUrl(value: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function metaContent(html: string, key: string) {
  const escaped = key.replaceAll(':', '\\:');
  const match =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+>`, 'i'))?.[0] ??
    html.match(
      new RegExp(
        `<meta[^>]+content=["'][^"']+["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
        'i'
      )
    )?.[0];
  return match ? attrValue(match, 'content') : null;
}

async function getArticleImageUrl(url: string) {
  const cached = newsImageCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.imageUrl;

  let imageUrl: string | null = null;
  try {
    const response = await fetchWithTimeout(
      url,
      {
        cache: 'force-cache',
        headers: {
          accept: 'text/html,application/xhtml+xml'
        },
        next: { revalidate: 21_600 }
      },
      900
    );
    if (response.ok) {
      const html = await response.text();
      imageUrl = absoluteUrl(
        metaContent(html, 'og:image') ??
          metaContent(html, 'twitter:image') ??
          metaContent(html, 'twitter:image:src'),
        response.url || url
      );
    }
  } catch {
    imageUrl = null;
  }

  newsImageCache.set(url, { imageUrl, expiresAt: Date.now() + NEWS_IMAGE_CACHE_TTL_MS });
  return imageUrl;
}

async function getArticleImageUrlFast(url: string) {
  const cached = newsImageCache.get(url);
  if (cached) return cached.imageUrl;

  void getArticleImageUrl(url).catch(() => null);
  return null;
}

function firstImageUrl(item: string) {
  const media = item.match(/<(media:content|media:thumbnail|enclosure)\b[^>]*>/i)?.[0];
  const mediaUrl = media ? (attrValue(media, 'url') ?? attrValue(media, 'href')) : null;
  if (isLikelyImageUrl(mediaUrl)) return mediaUrl;

  const description = tagValue(item, 'description') ?? tagValue(item, 'content:encoded') ?? '';
  const img = description.match(/<img\b[^>]*>/i)?.[0];
  const src = img ? attrValue(img, 'src') : null;
  return isLikelyImageUrl(src) ? src : null;
}

async function getRssItems(url: string, source: string, limit = 4): Promise<NewsItem[]> {
  const response = await fetchWithTimeout(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${source} RSS ${response.status}`);
  const xml = await response.text();
  const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)]
    .map((match) => {
      const item = match[0];
      return {
        title: tagValue(item, 'title') ?? '',
        url: tagValue(item, 'link') ?? '',
        source,
        publishedAt: tagValue(item, 'pubDate') ?? null,
        imageUrl: firstImageUrl(item)
      };
    })
    .filter((item) => item.title && item.url)
    .slice(0, limit);

  return Promise.all(
    items.map(async (item) => ({
      ...item,
      imageUrl: item.imageUrl ?? (await getArticleImageUrlFast(item.url))
    }))
  );
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

const fallbackNews: NewsSnapshot = {
  ok: false,
  items: [],
  source: 'news:fallback',
  error: 'News briefing unavailable.'
};

async function getLatestCaiBriefMessage(): Promise<CaiBriefMessageSnapshot> {
  if (!hasBridge()) {
    return { ok: false, source: 'bridge:not-configured', latest: null, runs: [] };
  }
  return cachedBriefingValue<CaiBriefMessageSnapshot>(
    'latest-cai-message',
    BRIDGE_CACHE_TTL_MS,
    async () => {
      const result = await bridgeRequest<Omit<CaiBriefMessageSnapshot, 'ok'>>(
        '/cai/latest-brief-message',
        { signal: AbortSignal.timeout(1200) }
      );
      return { ok: true, ...result };
    },
    {
      ok: false,
      source: 'openclaw:cron-runs:fallback',
      latest: null,
      runs: []
    }
  );
}

export async function getCaiBriefing() {
  const [cockpit, dispatch, bitcoin, markets, news, latestMessage] = await Promise.all([
    cachedBriefingValue('cockpit', 15_000, getCockpitSnapshot, fallbackCockpit),
    getDispatchSummary(),
    cachedBriefingValue('bitcoin', BITCOIN_CACHE_TTL_MS, getBitcoinSnapshot, fallbackBitcoin),
    cachedBriefingValue('markets', MARKETS_CACHE_TTL_MS, getMarketsSnapshot, fallbackMarkets),
    cachedBriefingValue('news', NEWS_CACHE_TTL_MS, getNewsSnapshot, fallbackNews),
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
    markets,
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
