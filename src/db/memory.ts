import { bridgeRequest, hasBridge } from '@/lib/bridge';

export type MemorySearchResult = {
  path: string;
  startLine?: number;
  endLine?: number;
  score?: number;
  snippet: string;
  source?: string;
};

export type MemorySearchResponse = {
  query: string;
  corpus: string;
  results: MemorySearchResult[];
  source: string;
  error?: string;
};

export type MemoryStatusAgent = {
  agentId: string;
  status: {
    backend?: string;
    provider?: string;
    model?: string;
    files?: number;
    chunks?: number;
    dirty?: boolean;
    workspaceDir?: string;
    dbPath?: string;
    sources?: string[];
    sourceCounts?: Array<{ source: string; files: number; chunks: number }>;
    vector?: { enabled?: boolean };
    custom?: { qmd?: { collections?: number; lastUpdateAt?: string | null } };
  };
  scan?: {
    totalFiles?: number;
    issues?: unknown[];
    sources?: Array<{ source: string; totalFiles: number; issues?: unknown[] }>;
  };
  audit?: {
    updatedAt?: string;
    exists?: boolean;
    entryCount?: number;
    promotedCount?: number;
    spacedEntryCount?: number;
    conceptTaggedEntryCount?: number;
    invalidEntryCount?: number;
    issues?: unknown[];
    qmd?: { collections?: number; dbBytes?: number };
  };
  dreamingAudit?: {
    dreamsPath?: string;
    sessionCorpusFileCount?: number;
    suspiciousSessionCorpusFileCount?: number;
    suspiciousSessionCorpusLineCount?: number;
    sessionIngestionExists?: boolean;
    issues?: unknown[];
  };
};

export type MemoryStatusResponse = {
  status: MemoryStatusAgent[];
  source: string;
  error?: string;
};

export async function searchMemory(query: string, corpus = 'all'): Promise<MemorySearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) return { query: '', corpus, results: [], source: 'empty' };
  if (!hasBridge())
    return { query: trimmed, corpus, results: [], source: 'fallback', error: 'Bridge saknas' };

  const params = new URLSearchParams({ query: trimmed, corpus, maxResults: '10' });
  return bridgeRequest<MemorySearchResponse>(`/memory/search?${params.toString()}`, {
    cacheMs: 5000,
    timeoutMs: 4000
  });
}

export async function getMemoryStatus(): Promise<MemoryStatusResponse> {
  if (!hasBridge()) return { status: [], source: 'fallback', error: 'Bridge saknas' };

  try {
    return await bridgeRequest<MemoryStatusResponse>('/memory/status', {
      cacheMs: 15000,
      timeoutMs: 6000
    });
  } catch (error) {
    return {
      status: [],
      source: 'bridge:error',
      error: error instanceof Error ? error.message : 'unknown memory status error'
    };
  }
}
