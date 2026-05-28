'use client';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { ContentMediaAsset } from '@/db/content';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';

const imageLibraryPlatforms = [
  'instagram',
  'tiktok',
  'youtube_shorts',
  'youtube_longform',
  'x',
  'facebook'
] as const;

const platformLabels: Record<(typeof imageLibraryPlatforms)[number], string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube_shorts: 'YouTube Shorts',
  youtube_longform: 'YouTube Longform',
  x: 'X',
  facebook: 'Facebook'
};

type ImageLibraryAsset = ContentMediaAsset & {
  collection: string;
  itemTitle: string;
  itemUpdatedAt?: string | null;
};

function usageLabel(asset: ImageLibraryAsset) {
  const platforms = asset.usedPlatforms ?? [];
  if (!asset.usedAt || !platforms.length) return 'Unused';
  return platforms.map((platform) => platformLabels[platform]).join(', ');
}

function assetLabel(asset: ImageLibraryAsset) {
  return asset.fileName ?? asset.itemTitle ?? 'Source image';
}

export function ImageLibraryPanel({
  assets,
  collections
}: {
  assets: ImageLibraryAsset[];
  collections: number;
}) {
  const visibleAssets = useMemo(() => assets.filter((asset) => asset.blobUrl), [assets]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedAsset = selectedIndex === null ? null : visibleAssets[selectedIndex];

  function openAt(index: number) {
    setSelectedIndex(index);
  }

  const goNext = useCallback(() => {
    setSelectedIndex((current) =>
      current === null ? 0 : (current + 1) % Math.max(visibleAssets.length, 1)
    );
  }, [visibleAssets.length]);

  const goPrevious = useCallback(() => {
    setSelectedIndex((current) =>
      current === null
        ? 0
        : (current - 1 + Math.max(visibleAssets.length, 1)) % Math.max(visibleAssets.length, 1)
    );
  }, [visibleAssets.length]);

  useEffect(() => {
    if (selectedIndex === null) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrevious();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrevious, selectedIndex]);

  return (
    <>
      <div className='rounded-lg border bg-card'>
        <div className='flex flex-col gap-3 p-6 md:flex-row md:items-start md:justify-between'>
          <div className='flex items-start gap-3'>
            <Icons.media className='mt-1 h-5 w-5 text-muted-foreground' />
            <div>
              <div className='text-lg font-semibold'>Image library</div>
              <div className='text-muted-foreground text-sm'>
                One reusable container for every uploaded image asset.
              </div>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Badge variant='secondary'>
              {assets.length} image{assets.length === 1 ? '' : 's'}
            </Badge>
            <Badge variant='outline'>
              {collections} collection{collections === 1 ? '' : 's'}
            </Badge>
          </div>
        </div>
        <div className='px-6 pb-6'>
          {visibleAssets.length ? (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6'>
              {visibleAssets.map((asset, index) => (
                <div key={asset.id} className='overflow-hidden rounded-lg border bg-muted'>
                  <button
                    type='button'
                    onClick={() => openAt(index)}
                    className='group block w-full text-left'
                    title={assetLabel(asset)}
                  >
                    <span
                      aria-label={assetLabel(asset)}
                      className='block aspect-square bg-cover bg-center transition group-hover:scale-105'
                      role='img'
                      style={{ backgroundImage: `url(${asset.blobUrl})` }}
                    />
                  </button>
                  <div className='min-w-0 border-t bg-background/95 px-2 py-2'>
                    <div className='mb-2 flex flex-wrap items-center gap-1.5'>
                      <Badge variant={asset.usedAt ? 'default' : 'secondary'}>
                        {asset.usedAt ? 'Used' : 'Unused'}
                      </Badge>
                      {asset.usedAt && <Badge variant='outline'>{usageLabel(asset)}</Badge>}
                    </div>
                    <span className='block truncate text-xs font-medium'>{assetLabel(asset)}</span>
                    <span className='text-muted-foreground block truncate text-[11px]'>
                      {asset.collection}
                    </span>
                    <UsageForm asset={asset} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
              Upload images from the panel on the right and they will collect here.
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={selectedIndex !== null}
        onOpenChange={(open) => !open && setSelectedIndex(null)}
      >
        <DialogContent className='max-w-[calc(100vw-2rem)] gap-3 p-3 sm:max-w-5xl'>
          {selectedAsset && (
            <div className='space-y-3'>
              <div className='flex min-w-0 items-start justify-between gap-3 pr-9'>
                <div className='min-w-0'>
                  <DialogTitle className='truncate'>{assetLabel(selectedAsset)}</DialogTitle>
                  <DialogDescription className='truncate'>
                    {selectedAsset.collection} · {usageLabel(selectedAsset)}
                  </DialogDescription>
                </div>
                <Badge variant='outline'>
                  {(selectedIndex ?? 0) + 1} / {visibleAssets.length}
                </Badge>
              </div>
              <div className='relative flex min-h-[55vh] items-center justify-center overflow-hidden rounded-md bg-muted'>
                <Image
                  src={selectedAsset.blobUrl ?? ''}
                  alt={assetLabel(selectedAsset)}
                  fill
                  sizes='(max-width: 768px) 100vw, 900px'
                  className='object-contain'
                  unoptimized
                />
                {visibleAssets.length > 1 && (
                  <>
                    <Button
                      type='button'
                      variant='secondary'
                      size='icon'
                      className='absolute left-3 top-1/2 -translate-y-1/2'
                      onClick={goPrevious}
                      aria-label='Previous image'
                    >
                      <Icons.chevronLeft className='h-4 w-4' />
                    </Button>
                    <Button
                      type='button'
                      variant='secondary'
                      size='icon'
                      className='absolute right-3 top-1/2 -translate-y-1/2'
                      onClick={goNext}
                      aria-label='Next image'
                    >
                      <Icons.chevronRight className='h-4 w-4' />
                    </Button>
                  </>
                )}
              </div>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex flex-wrap gap-1.5'>
                  <Badge variant={selectedAsset.usedAt ? 'default' : 'secondary'}>
                    {selectedAsset.usedAt ? 'Used' : 'Unused'}
                  </Badge>
                  {selectedAsset.usedAt && (
                    <Badge variant='outline'>{usageLabel(selectedAsset)}</Badge>
                  )}
                </div>
                <Button asChild size='sm' variant='outline'>
                  <a href={selectedAsset.blobUrl ?? '#'} target='_blank' rel='noreferrer'>
                    <Icons.externalLink className='h-4 w-4' />
                    Open original
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function UsageForm({ asset }: { asset: ImageLibraryAsset }) {
  return (
    <form action='/api/content/media/action' method='post' className='mt-2 space-y-2'>
      <input type='hidden' name='id' value={asset.id} />
      <div className='grid grid-cols-1 gap-1'>
        {imageLibraryPlatforms.map((platform) => (
          <label key={platform} className='flex min-w-0 items-center gap-1.5 text-[11px]'>
            <input
              type='checkbox'
              name='platforms'
              value={platform}
              defaultChecked={asset.usedPlatforms?.includes(platform)}
              className='h-3 w-3 shrink-0'
            />
            <span className='truncate'>{platformLabels[platform]}</span>
          </label>
        ))}
      </div>
      <div className='grid grid-cols-2 gap-1'>
        <Button
          type='submit'
          name='action'
          value='mark-used'
          size='sm'
          variant='secondary'
          className='h-7 px-2 text-[11px]'
        >
          Save
        </Button>
        <Button
          type='submit'
          name='action'
          value='clear-used'
          size='sm'
          variant='outline'
          className='h-7 px-2 text-[11px]'
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
