'use client';

import { Badge } from '@/components/ui/badge';
import type { VaultFile } from '@/lib/vault';
import { useMemo, useState } from 'react';

type VaultGraphProps = {
  files: VaultFile[];
};

type Node = {
  id: string;
  label: string;
  folder: string;
  x: number;
  y: number;
};

type Edge = {
  from: string;
  to: string;
};

function folderFor(path: string) {
  if (!path.includes('/')) return 'root';
  return path.split('/').slice(0, -1).join('/');
}

function labelFor(path: string) {
  return path.split('/').at(-1)!.replace(/\.md$/, '').replaceAll('-', ' ').slice(0, 32);
}

function colorFor(folder: string) {
  if (folder.includes('/wiki')) return 'hsl(var(--primary))';
  if (folder.includes('/raw')) return 'hsl(var(--muted-foreground))';
  return 'hsl(var(--chart-2))';
}

function extractWikiLinks(content: string) {
  const links = new Set<string>();
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    links.add(match[1]);
  }
  return [...links];
}

function buildGraph(files: VaultFile[]) {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const pathSet = new Set(sorted.map((file) => file.path));
  const width = 900;
  const height = 520;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.38;

  const nodes: Node[] = sorted.map((file, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(sorted.length, 1) - Math.PI / 2;
    const folder = folderFor(file.path);
    const folderBias = folder === 'root' ? 0.45 : folder.includes('/wiki') ? 0.85 : 1;
    return {
      id: file.path,
      label: labelFor(file.path),
      folder,
      x: cx + Math.cos(angle) * radius * folderBias,
      y: cy + Math.sin(angle) * radius * folderBias
    };
  });

  const edges: Edge[] = [];
  for (const file of sorted) {
    for (const link of extractWikiLinks(file.content)) {
      const candidates = [link, `${link}.md`, link.replace(/^\/+/, '')];
      const to = candidates.find((candidate) => pathSet.has(candidate));
      if (to && to !== file.path) edges.push({ from: file.path, to });
    }
  }

  // Ensure the graph is useful even before deep cross-linking exists.
  for (const file of sorted) {
    if (file.path !== 'index.md') edges.push({ from: 'index.md', to: file.path });
    if (file.path.startsWith('knowledge/wiki/')) {
      const rawPath = file.path.replace('/wiki/', '/raw/');
      const rawCandidate = sorted.find(
        (candidate) => candidate.path.split('/').at(-1) === rawPath.split('/').at(-1)
      );
      if (rawCandidate) edges.push({ from: rawCandidate.path, to: file.path });
    }
  }

  return { nodes, edges, width, height };
}

export function VaultGraph({ files }: VaultGraphProps) {
  const graph = useMemo(() => buildGraph(files), [files]);
  const [selectedId, setSelectedId] = useState(graph.nodes[0]?.id ?? '');
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <div className='rounded-xl border bg-background/40'>
      <div className='flex flex-col gap-3 border-b p-4 md:flex-row md:items-start md:justify-between'>
        <div>
          <div className='text-sm font-medium'>Obsidian graph</div>
          <div className='text-muted-foreground text-xs'>
            {graph.nodes.length} nodes · {graph.edges.length} links
          </div>
        </div>
        {selected && <Badge variant='secondary'>{selected.folder}</Badge>}
      </div>
      <div className='grid grid-cols-1 gap-0 xl:grid-cols-12'>
        <div className='overflow-hidden xl:col-span-9'>
          <svg
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            className='h-[28rem] w-full bg-muted/20'
          >
            <defs>
              <filter id='nodeShadow' x='-20%' y='-20%' width='140%' height='140%'>
                <feDropShadow dx='0' dy='2' stdDeviation='3' floodOpacity='0.18' />
              </filter>
            </defs>
            {graph.edges.map((edge, index) => {
              const from = byId.get(edge.from);
              const to = byId.get(edge.to);
              if (!from || !to) return null;
              const active = selected && (edge.from === selected.id || edge.to === selected.id);
              return (
                <line
                  key={`${edge.from}-${edge.to}-${index}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={active ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                  strokeWidth={active ? 2.4 : 1.2}
                  opacity={active ? 0.9 : 0.55}
                />
              );
            })}
            {graph.nodes.map((node) => {
              const active = selected?.id === node.id;
              return (
                <g
                  key={node.id}
                  role='button'
                  tabIndex={0}
                  onClick={() => setSelectedId(node.id)}
                  className='cursor-pointer outline-none'
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={active ? 13 : 9}
                    fill={colorFor(node.folder)}
                    opacity={active ? 1 : 0.78}
                    filter='url(#nodeShadow)'
                  />
                  <text
                    x={node.x}
                    y={node.y + 25}
                    textAnchor='middle'
                    className='fill-foreground text-[10px]'
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className='border-t p-4 xl:col-span-3 xl:border-t-0 xl:border-l'>
          {selected ? (
            <div className='space-y-3'>
              <div>
                <div className='font-mono text-xs font-medium'>{selected.id}</div>
                <div className='text-muted-foreground mt-1 text-xs'>{selected.folder}</div>
              </div>
              <div className='space-y-2'>
                <div className='text-xs font-medium'>Links</div>
                {graph.edges
                  .filter((edge) => edge.from === selected.id || edge.to === selected.id)
                  .slice(0, 12)
                  .map((edge, index) => {
                    const other = edge.from === selected.id ? edge.to : edge.from;
                    return (
                      <button
                        key={`${edge.from}-${edge.to}-${index}`}
                        type='button'
                        onClick={() => setSelectedId(other)}
                        className='text-muted-foreground hover:text-primary block w-full truncate rounded border bg-background/40 px-2 py-1 text-left font-mono text-[11px]'
                      >
                        {other}
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className='text-muted-foreground text-sm'>No node selected.</div>
          )}
        </div>
      </div>
    </div>
  );
}
