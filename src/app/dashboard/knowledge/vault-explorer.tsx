'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { VaultFile } from '@/lib/vault';
import { useMemo, useState } from 'react';

type VaultExplorerProps = {
  files: VaultFile[];
};

function folderFor(path: string) {
  if (!path.includes('/')) return 'root';
  return path.split('/').slice(0, -1).join('/');
}

function basename(path: string) {
  return path.split('/').at(-1) ?? path;
}

function renderMarkdown(content: string) {
  return content.split('\n').map((line, index) => {
    if (line.startsWith('# ')) {
      return (
        <h1 key={index} className='mt-4 text-2xl font-semibold first:mt-0'>
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h2 key={index} className='mt-4 text-lg font-semibold'>
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith('### ')) {
      return (
        <h3 key={index} className='mt-3 font-semibold'>
          {line.slice(4)}
        </h3>
      );
    }
    if (line.startsWith('- ')) {
      return (
        <div key={index} className='text-muted-foreground ml-4 text-sm'>
          • {line.slice(2)}
        </div>
      );
    }
    if (line === '---') {
      return <hr key={index} className='my-3' />;
    }
    if (!line.trim()) return <div key={index} className='h-2' />;
    return (
      <p key={index} className='text-muted-foreground text-sm leading-relaxed'>
        {line}
      </p>
    );
  });
}

export function VaultExplorer({ files }: VaultExplorerProps) {
  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => a.path.localeCompare(b.path)),
    [files]
  );
  const [selectedPath, setSelectedPath] = useState(sortedFiles[0]?.path ?? '');
  const selected = sortedFiles.find((file) => file.path === selectedPath) ?? sortedFiles[0];
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of sortedFiles)
      counts.set(folderFor(file.path), (counts.get(folderFor(file.path)) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sortedFiles]);

  if (!selected) {
    return (
      <div className='text-muted-foreground rounded-xl border border-dashed p-6 text-sm'>
        Vaulten är tom.
      </div>
    );
  }

  return (
    <div className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
      <div className='rounded-xl border bg-background/40 xl:col-span-4'>
        <div className='border-b p-3'>
          <div className='text-sm font-medium'>Vault Explorer</div>
          <div className='text-muted-foreground text-xs'>{files.length} markdown-filer</div>
        </div>
        <div className='max-h-[34rem] overflow-auto p-2'>
          {folders.map(([folder, count]) => (
            <div key={folder} className='mb-3'>
              <div className='text-muted-foreground px-2 py-1 font-mono text-[11px] uppercase tracking-wide'>
                {folder} · {count}
              </div>
              <div className='space-y-1'>
                {sortedFiles
                  .filter((file) => folderFor(file.path) === folder)
                  .map((file) => (
                    <button
                      key={file.path}
                      type='button'
                      onClick={() => setSelectedPath(file.path)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition hover:bg-muted/60 ${
                        selected.path === file.path
                          ? 'border-primary bg-primary/10'
                          : 'bg-background/40'
                      }`}
                    >
                      <div className='truncate font-mono text-xs'>{basename(file.path)}</div>
                      <div className='text-muted-foreground mt-1 truncate text-[11px]'>
                        {file.path}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className='rounded-xl border bg-background/40 xl:col-span-8'>
        <div className='flex flex-col gap-3 border-b p-4 md:flex-row md:items-start md:justify-between'>
          <div className='min-w-0'>
            <div className='truncate font-mono text-sm font-medium'>{selected.path}</div>
            <div className='text-muted-foreground mt-1 text-xs'>
              {selected.content.length} chars
            </div>
          </div>
          <div className='flex gap-2'>
            <Badge variant='secondary'>{folderFor(selected.path)}</Badge>
            <Button asChild size='sm' variant='outline'>
              <a href='/api/knowledge/vault/export'>Download zip</a>
            </Button>
          </div>
        </div>
        <div className='grid grid-cols-1 gap-0 lg:grid-cols-2'>
          <div className='border-b p-4 lg:border-r lg:border-b-0'>
            <div className='mb-3 text-sm font-medium'>Preview</div>
            <div className='prose prose-sm dark:prose-invert max-h-[32rem] max-w-none overflow-auto rounded-lg border bg-card p-4'>
              {renderMarkdown(selected.content)}
            </div>
          </div>
          <div className='p-4'>
            <div className='mb-3 text-sm font-medium'>Markdown</div>
            <pre className='text-muted-foreground max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed'>
              {selected.content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
