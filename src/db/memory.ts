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

export async function searchMemory(query: string, corpus = 'all'): Promise<MemorySearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) return { query: '', corpus, results: [], source: 'empty' };
  if (!hasBridge())
    return { query: trimmed, corpus, results: [], source: 'fallback', error: 'Bridge saknas' };

  const params = new URLSearchParams({ query: trimmed, corpus, maxResults: '10' });
  return bridgeRequest<MemorySearchResponse>(`/memory/search?${params.toString()}`);
}
