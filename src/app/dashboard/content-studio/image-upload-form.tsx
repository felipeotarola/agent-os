'use client';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { upload } from '@vercel/blob/client';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';

const MAX_IMAGE_UPLOAD_FILES = 20;

function safePathPart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'upload'
  );
}

export function ImageUploadForm() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const files = formData
      .getAll('media')
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!files.length) {
      toast.error('Choose at least one image to upload');
      return;
    }
    if (files.length > MAX_IMAGE_UPLOAD_FILES) {
      toast.error(`Upload ${MAX_IMAGE_UPLOAD_FILES} images or fewer at a time`);
      return;
    }
    if (files.some((file) => !file.type.startsWith('image/'))) {
      toast.error('Only image uploads are accepted');
      return;
    }

    const title = String(formData.get('title') ?? '').trim();
    const campaign = String(formData.get('campaign') ?? 'agent-assets').trim() || 'agent-assets';
    const brief = String(formData.get('brief') ?? '').trim();

    setIsUploading(true);
    try {
      const uploadedAssets = await Promise.all(
        files.map(async (file) => {
          const blob = await upload(
            `content/${safePathPart(campaign)}/${crypto.randomUUID()}-${safePathPart(file.name)}`,
            file,
            {
              access: 'public',
              handleUploadUrl: '/api/content/blob-upload'
            }
          );

          return {
            url: blob.url,
            pathname: blob.pathname,
            originalName: file.name,
            contentType: file.type,
            size: file.size
          };
        })
      );

      const response = await fetch('/api/content/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: 'image-library',
          contentKind: 'image-library',
          title,
          campaign,
          brief,
          pillar: 'asset-library',
          ownerAgentId: 'sladdis',
          uploadedAssets
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `content-item-${response.status}`);

      toast.success(
        `${uploadedAssets.length} image${uploadedAssets.length === 1 ? '' : 's'} uploaded`
      );
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Image upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='image-title'>Label</Label>
        <Input id='image-title' name='title' placeholder='e.g. Sladdis onboarding screenshots' />
      </div>
      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-1'>
        <div className='space-y-2'>
          <Label htmlFor='image-campaign'>Collection</Label>
          <Input id='image-campaign' name='campaign' defaultValue='agent-assets' />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='image-brief'>Notes</Label>
          <Input id='image-brief' name='brief' placeholder='Context an agent should know' />
        </div>
      </div>
      <div className='space-y-2'>
        <Label htmlFor='image-media'>Images</Label>
        <Input id='image-media' name='media' type='file' accept='image/*' multiple required />
        <p className='text-muted-foreground text-xs'>
          Files upload directly to Vercel Blob from your browser. Select up to 20 images at once, 15
          MB each.
        </p>
      </div>
      <Button type='submit' variant='secondary' className='w-full' disabled={isUploading}>
        <Icons.upload className='h-4 w-4' />
        {isUploading ? 'Uploading...' : 'Upload images'}
      </Button>
    </form>
  );
}
