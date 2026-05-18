'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { VaultFile } from '@/lib/vault';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type VaultGraphProps = {
  files: VaultFile[];
};

type GraphNode = {
  id: string;
  label: string;
  folder: string;
  content: string;
  links: string[];
};

type GraphEdge = {
  from: string;
  to: string;
};

type SimNode = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pinned?: boolean;
};

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type DragState =
  | { kind: 'pan'; startX: number; startY: number; viewX: number; viewY: number }
  | { kind: 'node'; id: string; offsetX: number; offsetY: number };

function folderFor(path: string) {
  if (!path.includes('/')) return 'root';
  return path.split('/').slice(0, -1).join('/');
}

function labelFor(path: string) {
  return path.split('/').at(-1)!.replace(/\.md$/, '').replaceAll('-', ' ').slice(0, 32);
}

type GraphTheme = {
  primary: string;
  muted: string;
  mutedForeground: string;
  foreground: string;
  border: string;
  chart2: string;
  chart3: string;
};

function readTheme(): GraphTheme {
  const style = window.getComputedStyle(document.documentElement);
  const probe = document.createElement('canvas').getContext('2d');
  const canvasColor = (raw: string, fallback: string) => {
    if (!probe || !raw) return fallback;
    probe.fillStyle = '#010203';
    probe.fillStyle = raw;
    return probe.fillStyle === '#010203' ? fallback : raw;
  };
  const cssVar = (name: string, fallback: string) =>
    canvasColor(style.getPropertyValue(name).trim(), fallback);
  return {
    primary: cssVar('--primary', '#6366f1'),
    muted: cssVar('--muted', '#27272a'),
    mutedForeground: cssVar('--muted-foreground', '#a1a1aa'),
    foreground: cssVar('--foreground', '#fafafa'),
    border: cssVar('--border', '#3f3f46'),
    chart2: cssVar('--chart-2', '#22c55e'),
    chart3: cssVar('--chart-3', '#f59e0b')
  };
}

function colorFor(folder: string, theme: GraphTheme) {
  if (folder.includes('/wiki')) return theme.primary;
  if (folder.includes('/raw')) return theme.mutedForeground;
  if (folder.includes('journal')) return theme.chart3;
  return theme.chart2;
}

function extractWikiLinks(content: string) {
  const links = new Set<string>();
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) links.add(match[1]);
  return [...links];
}

function resolveLink(link: string, pathSet: Set<string>) {
  const clean = link.replace(/^\/+/, '');
  const candidates = [
    clean,
    `${clean}.md`,
    `knowledge/wiki/${clean}.md`,
    `knowledge/raw/${clean}.md`
  ];
  return candidates.find((candidate) => pathSet.has(candidate));
}

function buildGraph(files: VaultFile[]) {
  const sorted = files.toSorted((a, b) => a.path.localeCompare(b.path));
  const pathSet = new Set(sorted.map((file) => file.path));
  const nodes: GraphNode[] = sorted.map((file) => ({
    id: file.path,
    label: labelFor(file.path),
    folder: folderFor(file.path),
    content: file.content,
    links: extractWikiLinks(file.content)
  }));

  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  const addEdge = (from: string, to: string) => {
    if (from === to) return;
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  };

  for (const file of sorted) {
    for (const link of extractWikiLinks(file.content)) {
      const to = resolveLink(link, pathSet);
      if (to) addEdge(file.path, to);
    }
  }

  // Keep the graph useful before deep cross-linking exists, but only with real vault files.
  if (pathSet.has('index.md')) {
    for (const file of sorted) if (file.path !== 'index.md') addEdge('index.md', file.path);
  }

  for (const file of sorted) {
    if (!file.path.startsWith('knowledge/wiki/')) continue;
    const rawName = file.path.split('/').at(-1);
    const rawCandidate = sorted.find(
      (candidate) =>
        candidate.path.startsWith('knowledge/raw/') && candidate.path.split('/').at(-1) === rawName
    );
    if (rawCandidate) addEdge(rawCandidate.path, file.path);
  }

  return { nodes, edges };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function worldPoint(
  event: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  view: Viewport
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - view.x) / view.scale,
    y: (event.clientY - rect.top - view.y) / view.scale
  };
}

export function VaultGraph({ files }: VaultGraphProps) {
  const graph = useMemo(() => buildGraph(files), [files]);
  const folders = useMemo(
    () =>
      [...new Set(graph.nodes.map((node) => node.folder))].toSorted((a, b) => a.localeCompare(b)),
    [graph.nodes]
  );
  const [activeFolders, setActiveFolders] = useState<Set<string>>(() => new Set(folders));
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(graph.nodes[0]?.id ?? '');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const viewRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<DragState | null>(null);
  const selectedRef = useRef(selectedId);
  const activeFoldersRef = useRef(activeFolders);
  const queryRef = useRef(query);

  const visibleIds = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return new Set(
      graph.nodes
        .filter((node) => activeFolders.has(node.folder))
        .filter(
          (node) =>
            !needle ||
            node.id.toLowerCase().includes(needle) ||
            node.content.toLowerCase().includes(needle)
        )
        .map((node) => node.id)
    );
  }, [activeFolders, graph.nodes, query]);

  const visibleEdges = useMemo(
    () => graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)),
    [graph.edges, visibleIds]
  );

  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const selectedLinks = selected
    ? graph.edges
        .filter((edge) => edge.from === selected.id || edge.to === selected.id)
        .map((edge) => (edge.from === selected.id ? edge.to : edge.from))
        .filter((id, index, all) => all.indexOf(id) === index)
    : [];

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    activeFoldersRef.current = activeFolders;
  }, [activeFolders]);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    setActiveFolders((current) => {
      const next = new Set(current);
      for (const folder of folders) next.add(folder);
      for (const folder of next) if (!folders.includes(folder)) next.delete(folder);
      return next;
    });
  }, [folders]);

  useEffect(() => {
    const oldNodes = new Map(nodesRef.current.map((node) => [node.id, node]));
    const count = Math.max(graph.nodes.length, 1);
    nodesRef.current = graph.nodes.map((node, index) => {
      const old = oldNodes.get(node.id);
      if (old) return { ...old, ...node };
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      const folderBias = node.folder === 'root' ? 0.35 : node.folder.includes('/wiki') ? 0.75 : 1;
      return {
        ...node,
        x: Math.cos(angle) * 220 * folderBias,
        y: Math.sin(angle) * 220 * folderBias,
        vx: 0,
        vy: 0,
        r: node.id === 'index.md' ? 12 : 8
      };
    });
    viewRef.current = { x: 0, y: 0, scale: 1 };
  }, [graph.nodes]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(520 * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(520 * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = '520px';
      viewRef.current = { x: rect.width / 2, y: 260, scale: 1 };
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const theme = readTheme();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = theme.muted;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    const view = viewRef.current;
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    const nodes = nodesRef.current;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const visible = new Set(
      nodes
        .filter((node) => activeFoldersRef.current.has(node.folder))
        .filter((node) => {
          const needle = queryRef.current.trim().toLowerCase();
          return (
            !needle ||
            node.id.toLowerCase().includes(needle) ||
            node.content.toLowerCase().includes(needle)
          );
        })
        .map((node) => node.id)
    );
    const selected = selectedRef.current;

    ctx.lineCap = 'round';
    for (const edge of graph.edges) {
      if (!visible.has(edge.from) || !visible.has(edge.to)) continue;
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) continue;
      const active = selected && (edge.from === selected || edge.to === selected);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = active ? theme.primary : theme.border;
      ctx.globalAlpha = active ? 0.85 : 0.58;
      ctx.lineWidth = active ? 2.2 / view.scale : 1.2 / view.scale;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const node of nodes) {
      if (!visible.has(node.id)) continue;
      const active = node.id === selected;
      const connected = graph.edges.some(
        (edge) =>
          (edge.from === selected && edge.to === node.id) ||
          (edge.to === selected && edge.from === node.id)
      );
      ctx.beginPath();
      ctx.arc(node.x, node.y, active ? node.r + 5 : node.r, 0, Math.PI * 2);
      ctx.fillStyle = colorFor(node.folder, theme);
      ctx.globalAlpha = active || !selected || connected ? 1 : 0.42;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (active) {
        ctx.strokeStyle = theme.foreground;
        ctx.lineWidth = 2 / view.scale;
        ctx.stroke();
      }
      if (view.scale > 0.55 || active) {
        ctx.font = `${active ? 12 : 10}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillStyle = theme.foreground;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.label, node.x, node.y + node.r + 6);
      }
    }
    ctx.restore();

    ctx.fillStyle = theme.mutedForeground;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(
      'wheel: zoom · drag background: pan · drag node: move · double click: focus',
      12,
      height - 14
    );
  }, [graph.edges]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const nodes = nodesRef.current;
      const visible = new Set(
        nodes
          .filter((node) => activeFoldersRef.current.has(node.folder))
          .filter((node) => {
            const needle = queryRef.current.trim().toLowerCase();
            return (
              !needle ||
              node.id.toLowerCase().includes(needle) ||
              node.content.toLowerCase().includes(needle)
            );
          })
          .map((node) => node.id)
      );
      const byId = new Map(nodes.map((node) => [node.id, node]));

      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        if (!visible.has(a.id)) continue;
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          if (!visible.has(b.id)) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = Math.max(dx * dx + dy * dy, 36);
          const force = 900 / distSq;
          const dist = Math.sqrt(distSq);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!a.pinned) {
            a.vx += fx;
            a.vy += fy;
          }
          if (!b.pinned) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }

      for (const edge of graph.edges) {
        if (!visible.has(edge.from) || !visible.has(edge.to)) continue;
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) continue;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.max(Math.hypot(dx, dy), 1);
        const target = 95;
        const force = (dist - target) * 0.012;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!from.pinned) {
          from.vx += fx;
          from.vy += fy;
        }
        if (!to.pinned) {
          to.vx -= fx;
          to.vy -= fy;
        }
      }

      for (const node of nodes) {
        if (!visible.has(node.id) || node.pinned) continue;
        node.vx += -node.x * 0.002;
        node.vy += -node.y * 0.002;
        node.vx *= 0.86;
        node.vy *= 0.86;
        node.x += node.vx;
        node.y += node.vy;
      }

      draw();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [draw, graph.edges]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const findNodeAt = useCallback((x: number, y: number) => {
    const nodes = nodesRef.current;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (!activeFoldersRef.current.has(node.folder)) continue;
      if (Math.hypot(x - node.x, y - node.y) <= node.r + 8) return node;
    }
    return null;
  }, []);

  const focusNode = useCallback(
    (id: string) => {
      const node = nodesRef.current.find((candidate) => candidate.id === id);
      const canvas = canvasRef.current;
      if (!node || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      setSelectedId(id);
      viewRef.current = {
        x: rect.width / 2 - node.x * viewRef.current.scale,
        y: rect.height / 2 - node.y * viewRef.current.scale,
        scale: Math.max(viewRef.current.scale, 1.15)
      };
      draw();
    },
    [draw]
  );

  const resetView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    viewRef.current = { x: rect.width / 2, y: rect.height / 2, scale: 1 };
    for (const node of nodesRef.current) node.pinned = false;
    draw();
  }, [draw]);

  return (
    <div className='rounded-xl border bg-background/40'>
      <div className='flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-start xl:justify-between'>
        <div>
          <div className='text-sm font-medium'>Interactive Obsidian graph</div>
          <div className='text-muted-foreground text-xs'>
            {visibleIds.size} / {graph.nodes.length} nodes · {visibleEdges.length} links
          </div>
        </div>
        <div className='flex flex-col gap-2 md:flex-row md:items-center'>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Search notes...'
            className='h-8 md:w-56'
          />
          <Button type='button' size='sm' variant='outline' onClick={resetView}>
            Reset view
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-0 xl:grid-cols-12'>
        <div className='xl:col-span-9'>
          <div ref={wrapperRef} className='relative h-[520px] overflow-hidden'>
            <canvas
              ref={canvasRef}
              className='block size-full cursor-grab active:cursor-grabbing'
              onWheel={(event) => {
                event.preventDefault();
                const canvas = canvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const before = worldPoint(event, canvas, viewRef.current);
                const scale = clamp(
                  viewRef.current.scale * (event.deltaY > 0 ? 0.9 : 1.1),
                  0.28,
                  3.2
                );
                viewRef.current = {
                  scale,
                  x: event.clientX - rect.left - before.x * scale,
                  y: event.clientY - rect.top - before.y * scale
                };
                draw();
              }}
              onPointerDown={(event) => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                canvas.setPointerCapture(event.pointerId);
                const point = worldPoint(event, canvas, viewRef.current);
                const node = findNodeAt(point.x, point.y);
                if (node) {
                  node.pinned = true;
                  setSelectedId(node.id);
                  dragRef.current = {
                    kind: 'node',
                    id: node.id,
                    offsetX: node.x - point.x,
                    offsetY: node.y - point.y
                  };
                } else {
                  dragRef.current = {
                    kind: 'pan',
                    startX: event.clientX,
                    startY: event.clientY,
                    viewX: viewRef.current.x,
                    viewY: viewRef.current.y
                  };
                }
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                const canvas = canvasRef.current;
                if (!drag || !canvas) return;
                if (drag.kind === 'pan') {
                  viewRef.current = {
                    ...viewRef.current,
                    x: drag.viewX + event.clientX - drag.startX,
                    y: drag.viewY + event.clientY - drag.startY
                  };
                } else {
                  const point = worldPoint(event, canvas, viewRef.current);
                  const node = nodesRef.current.find((candidate) => candidate.id === drag.id);
                  if (node) {
                    node.x = point.x + drag.offsetX;
                    node.y = point.y + drag.offsetY;
                    node.vx = 0;
                    node.vy = 0;
                  }
                }
                draw();
              }}
              onPointerUp={(event) => {
                const canvas = canvasRef.current;
                canvas?.releasePointerCapture(event.pointerId);
                dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
              onDoubleClick={(event) => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                const point = worldPoint(event, canvas, viewRef.current);
                const node = findNodeAt(point.x, point.y);
                if (node) focusNode(node.id);
              }}
            />
          </div>
        </div>

        <div className='space-y-4 border-t p-4 xl:col-span-3 xl:border-t-0 xl:border-l'>
          <div>
            <div className='mb-2 text-xs font-medium'>Folders</div>
            <div className='flex flex-wrap gap-2'>
              {folders.map((folder) => {
                const active = activeFolders.has(folder);
                return (
                  <button
                    key={folder}
                    type='button'
                    onClick={() => {
                      setActiveFolders((current) => {
                        const next = new Set(current);
                        if (next.has(folder)) next.delete(folder);
                        else next.add(folder);
                        return next;
                      });
                    }}
                    className={`rounded-full border px-2 py-1 text-[11px] transition ${
                      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground opacity-60'
                    }`}
                  >
                    {folder}
                  </button>
                );
              })}
            </div>
          </div>

          {selected ? (
            <div className='space-y-3'>
              <div className='flex flex-wrap gap-2'>
                <Badge variant='secondary'>{selected.folder}</Badge>
                <Badge variant='outline'>{selectedLinks.length} links</Badge>
              </div>
              <div>
                <div className='font-mono text-xs font-medium'>{selected.id}</div>
                <div className='text-muted-foreground mt-2 line-clamp-5 text-xs'>
                  {selected.content.slice(0, 420) || 'No content.'}
                </div>
              </div>
              <div className='space-y-2'>
                <div className='text-xs font-medium'>Connected notes</div>
                {selectedLinks.length === 0 ? (
                  <div className='text-muted-foreground rounded border border-dashed p-2 text-xs'>
                    No links yet.
                  </div>
                ) : (
                  selectedLinks.slice(0, 18).map((id) => (
                    <button
                      key={id}
                      type='button'
                      onClick={() => focusNode(id)}
                      className='text-muted-foreground hover:text-primary block w-full truncate rounded border bg-background/40 px-2 py-1 text-left font-mono text-[11px]'
                    >
                      {id}
                    </button>
                  ))
                )}
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
