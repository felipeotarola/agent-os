'use client';

import { useEffect, useId, useState } from 'react';

type MermaidDiagramProps = {
  chart: string;
  title: string;
};

export function MermaidDiagram({ chart, title }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <pre className='overflow-auto rounded-xl border bg-muted/40 p-4 text-xs text-muted-foreground'>
        {`Mermaid render failed: ${error}\n\n${chart}`}
      </pre>
    );
  }

  return (
    <figure className='overflow-hidden rounded-xl border bg-background/45 p-3'>
      <figcaption className='sr-only'>{title}</figcaption>
      {svg ? (
        <div
          className='mermaid-svg overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full'
          // Mermaid produces sanitized SVG when securityLevel=strict.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className='text-muted-foreground flex min-h-48 items-center justify-center text-sm'>
          Rendering diagram…
        </div>
      )}
    </figure>
  );
}
