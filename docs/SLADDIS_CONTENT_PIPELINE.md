# Sladdis Content Pipeline V1

Safe skeleton for the Sladdis content workflow. V1 is a prepare/schedule/control layer only; it does **not** publish to Instagram, TikTok, YouTube, X, or Facebook.

## Scope

- Cockpit route: `/dashboard/content-studio`
- Server API bridge:
  - `GET /content/items`
  - `POST /content/items`
  - `PATCH /content/items`
- Next form/API bridge:
  - `GET|POST|PATCH /api/content/items`
  - `POST /api/content/items/action`
- Tables:
  - `content_items` — canonical draft/ready/scheduled/posted/failed/archived item metadata
  - `content_variants` — per-platform metadata and schedule state
  - `content_media_assets` — media references prepared for server-side Vercel Blob storage

## Safety boundaries

- No external platform autopublish in V1.
- Manual launch button intentionally redirects with `launch=blocked`.
- Vercel Blob tokens must stay server-only. UI stores only media metadata references such as `blob_key`, `blob_url`, content type, and byte size.
- Bridge metadata marks `autopublish: false` on created/updated records.

## Supported statuses

- `draft`
- `ready`
- `scheduled`
- `posted` (future connector receipt only)
- `failed` (future connector receipt only)
- `archived`

## Supported platforms

- `instagram`
- `tiktok`
- `youtube_shorts`
- `youtube_longform`
- `x`
- `facebook`

## Future connector contract

A future launcher should require an explicit human action and then record receipts back into `content_variants` / `content_items` instead of silently posting. Minimum receipt fields should include external URL/id, platform response metadata, status, and failure reason when relevant.
