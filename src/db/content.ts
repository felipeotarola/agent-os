import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { z } from 'zod';

export const contentStatuses = [
  'draft',
  'ready',
  'scheduled',
  'posted',
  'failed',
  'archived'
] as const;
export const contentPlatforms = [
  'instagram',
  'tiktok',
  'youtube_shorts',
  'youtube_longform',
  'x',
  'facebook'
] as const;

const contentStatusSchema = z.enum(contentStatuses);
const contentPlatformSchema = z.enum(contentPlatforms);

export type ContentStatus = z.infer<typeof contentStatusSchema>;
export type ContentPlatform = z.infer<typeof contentPlatformSchema>;

const contentMediaAssetSchema = z.object({
  id: z.string(),
  contentItemId: z.string(),
  variantId: z.string().nullable().optional(),
  kind: z.string(),
  status: z.string(),
  blobKey: z.string().nullable().optional(),
  blobUrl: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  bytes: z.number().nullable().optional(),
  usedAt: z.string().nullable().optional(),
  usedPlatforms: z.array(contentPlatformSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional()
});

export type ContentMediaAsset = z.infer<typeof contentMediaAssetSchema>;

const contentVariantSchema = z.object({
  id: z.string(),
  contentItemId: z.string(),
  platform: contentPlatformSchema,
  status: contentStatusSchema,
  title: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  scheduleAt: z.string().nullable().optional(),
  externalUrl: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  mediaAssets: z.array(contentMediaAssetSchema).optional()
});

export type ContentVariant = z.infer<typeof contentVariantSchema>;

const contentItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  brief: z.string(),
  status: contentStatusSchema,
  pillar: z.string(),
  campaign: z.string(),
  ownerAgentId: z.string().nullable().optional(),
  source: z.string(),
  scheduleAt: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  variants: z.array(contentVariantSchema),
  mediaAssets: z.array(contentMediaAssetSchema)
});

export type ContentItem = z.infer<typeof contentItemSchema>;

const contentStudioSnapshotSchema = z.object({
  items: z.array(contentItemSchema),
  counts: z.object({
    total: z.number(),
    draft: z.number(),
    ready: z.number(),
    scheduled: z.number(),
    posted: z.number(),
    failed: z.number(),
    archived: z.number()
  }),
  source: z.string()
});

export type ContentStudioSnapshot = z.infer<typeof contentStudioSnapshotSchema>;

export const emptyContentStudioSnapshot: ContentStudioSnapshot = {
  items: [],
  counts: { total: 0, draft: 0, ready: 0, scheduled: 0, posted: 0, failed: 0, archived: 0 },
  source: 'empty'
};

export async function getContentStudioSnapshot(): Promise<ContentStudioSnapshot> {
  if (!hasBridge()) return emptyContentStudioSnapshot;
  try {
    return contentStudioSnapshotSchema.parse(await bridgeRequest('/content/items'));
  } catch (error) {
    console.error('Content Studio bridge request failed', error);
    return { ...emptyContentStudioSnapshot, source: 'bridge-error' };
  }
}
