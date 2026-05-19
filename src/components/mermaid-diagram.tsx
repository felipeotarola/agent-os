'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type MermaidDiagramProps = {
  chart: string;
  title: string;
};

type Point = {
  x: number;
  y: number;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.2;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

export function MermaidDiagram({ chart, title }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, '');
  const panStartRef = useRef<{ pointer: Point; offset: Point } | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  function resetView() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  function fitView() {
    setScale(0.85);
    setOffset({ x: 0, y: 0 });
  }

  function zoomBy(delta: number) {
    setScale((current) => clampScale(current + delta));
  }

  useEffect(() => {
    let mounted = true;

    async function renderDiagram() {
      try {
        const mermaid = (await import('mermaid')).default;
        const isDark = document.documentElement.classList.contains('dark');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: {
            background: isDark ? '#111827' : '#ffffff',
            primaryColor: isDark ? '#111827' : '#ffffff',
            primaryTextColor: isDark ? '#f9fafb' : '#111827',
            primaryBorderColor: isDark ? '#374151' : '#d1d5db',
            lineColor: isDark ? '#9ca3af' : '#6b7280',
            secondaryColor: isDark ? '#1f2937' : '#f3f4f6',
            tertiaryColor: isDark ? '#030712' : '#f9fafb',
            fontFamily: 'inherit'
          }
        });
        const result = await mermaid.render(`mermaid-${id}`, chart);
        if (!mounted) return;
        setSvg(result.svg);
        setError(null);
        resetView();
      } catch (renderError) {
        if (!mounted) return;
        setError(renderError instanceof Error ? renderError.message : 'Failed to render diagram');
      }
    }

    renderDiagram();

    return () => {
      mounted = false;
    };
  }, [chart, id]);

  if (error) {
    return (
      <pre className='text-muted-foreground overflow-auto rounded-xl border bg-muted/40 p-4 text-xs'>
        {`Mermaid render failed: ${error}\n\n${chart}`}
      </pre>
    );
  }

  return (
    <figure className='overflow-hidden rounded-xl border bg-background/45'>
      <figcaption className='sr-only'>{title}</figcaption>
      {svg ? (
        <div className='space-y-2 p-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='text-muted-foreground text-xs'>
              Drag to pan · wheel/controls to zoom · {Math.round(scale * 100)}%
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button type='button' variant='outline' size='sm' onClick={() => zoomBy(-SCALE_STEP)}>
                −
              </Button>
              <Button type='button' variant='outline' size='sm' onClick={() => zoomBy(SCALE_STEP)}>
                +
              </Button>
              <Button type='button' variant='outline' size='sm' onClick={fitView}>
                Fit
              </Button>
              <Button type='button' variant='secondary' size='sm' onClick={resetView}>
                Reset
              </Button>
            </div>
          </div>
          <div
            className={`min-h-72 overflow-hidden rounded-lg border bg-background/60 ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            role='img'
            aria-label={title}
            onWheel={(event) => {
              if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
              event.preventDefault();
              zoomBy(event.deltaY > 0 ? -0.08 : 0.08);
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              panStartRef.current = {
                pointer: { x: event.clientX, y: event.clientY },
                offset
              };
              setIsPanning(true);
            }}
            onPointerMove={(event) => {
              if (!panStartRef.current) return;
              const dx = event.clientX - panStartRef.current.pointer.x;
              const dy = event.clientY - panStartRef.current.pointer.y;
              setOffset({
                x: panStartRef.current.offset.x + dx,
                y: panStartRef.current.offset.y + dy
              });
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
              panStartRef.current = null;
              setIsPanning(false);
            }}
            onPointerCancel={() => {
              panStartRef.current = null;
              setIsPanning(false);
            }}
          >
            <div
              className='mermaid-svg flex min-h-72 items-center justify-center p-4 [&_svg]:h-auto [&_svg]:max-w-none'
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                touchAction: 'none'
              }}
              // Mermaid produces sanitized SVG when securityLevel=strict.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      ) : (
        <div className='text-muted-foreground flex min-h-48 items-center justify-center text-sm'>
          Rendering diagram…
        </div>
      )}
    </figure>
  );
}
