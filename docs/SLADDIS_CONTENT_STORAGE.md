# Sladdis Content Storage

How Sladdis should add text + images to Agent OS Content Studio.

## What this storage is

Content Storage is the source-of-truth layer behind `/dashboard/content-studio`.

It stores:

- content item metadata in `content_items`
- per-platform variants in `content_variants`
- image references in `content_media_assets`
- image files in **Vercel Blob Storage**

Supabase Edge Functions are used for fast ingestion, but images do **not** live in Supabase Storage.

## Human/UI workflow

1. Open `/dashboard/content-studio`.
2. Create a new draft.
3. Fill in:
   - **Title** — required
   - **Brief** — hook, angle, CTA, notes
   - **Pillar** — e.g. education, launch, proof, comparison
   - **Campaign** — usually `sladdis`
   - **Platforms** — Instagram, TikTok, YouTube Shorts, etc.
   - **Source images** — optional image files
4. Click **Create draft**.
5. Content Studio sends the form to `/api/content/items`.
6. If Edge is configured, Agent OS forwards it to the Supabase Edge Function.
7. The Edge Function:
   - writes text metadata to Supabase/Postgres
   - uploads images to Vercel Blob
   - stores each image URL/key in `content_media_assets`

## Agent/API workflow

POST `multipart/form-data` to the Edge Function:

```http
POST /functions/v1/sladdis-content
Authorization: Bearer <SLADDIS_CONTENT_INGEST_TOKEN>
Content-Type: multipart/form-data
```

Fields:

| Field          | Required | Notes                                                     |
| -------------- | -------: | --------------------------------------------------------- |
| `title`        |      yes | Internal content title                                    |
| `brief`        |       no | Hook, angle, CTA, source notes                            |
| `pillar`       |       no | Content pillar/category                                   |
| `campaign`     |       no | Defaults to `sladdis`                                     |
| `ownerAgentId` |       no | Defaults to `sladdis`                                     |
| `platforms`    |       no | Repeatable; defaults to Instagram, TikTok, YouTube Shorts |
| `media`        |       no | Repeatable image files                                    |

Example with `curl`:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/sladdis-content" \
  -H "Authorization: Bearer $SLADDIS_CONTENT_INGEST_TOKEN" \
  -F "title=3 myths about toddler sleep" \
  -F "brief=Hook: parents over-optimize bedtime. CTA: try Sladdis checklist." \
  -F "pillar=education" \
  -F "campaign=sladdis" \
  -F "platforms=instagram" \
  -F "platforms=tiktok" \
  -F "media=@./cover.png"
```

## Storage rules

- Images go to Vercel Blob using `BLOB_READ_WRITE_TOKEN` / `VERCEL_BLOB_READ_WRITE_TOKEN`.
- DB rows go to Supabase/Postgres using `SUPABASE_SERVICE_ROLE_KEY`.
- Sladdis should only receive `SLADDIS_CONTENT_INGEST_TOKEN`, never the Supabase service-role key or Blob token.
- Service-role and Blob tokens must never be sent to browsers or public chat.
- V1 accepts images only, max 15 MB each.
- V1 does not publish externally.

## Blob path convention

Images are stored with this pathname:

```text
<campaign>/<contentItemId>/<assetId>.<extension>
```

Example:

```text
sladdis/4c3f.../9a21....png
```

The DB stores:

- `blob_key` — the Vercel Blob pathname
- `blob_url` — the returned Vercel Blob URL
- `file_name`
- `content_type`
- `bytes`
- `metadata.storage = "vercel-blob"`

## Status lifecycle

New content starts as `draft`.

Use Content Studio actions to move it:

1. `draft`
2. `ready`
3. `scheduled`
4. later/manual: `posted`, `failed`, or `archived`

## Important boundary

Content Storage prepares content. It does not post to Instagram, TikTok, YouTube, X, or Facebook.

Publishing should be a separate explicit human-approved launch flow.

## Recommended Sladdis auth V1

Use a restricted content-ingest token:

- secret name/env: `SLADDIS_CONTENT_INGEST_TOKEN`
- allowed operation: create Sladdis content drafts + upload source images
- not allowed: dashboard login, secrets, tasks, mail, publishing, deleting, or general bridge/API access

This is safer than giving Sladdis `AGENT_OS_BRIDGE_TOKEN`, a human cookie, `SUPABASE_SERVICE_ROLE_KEY`, or `BLOB_READ_WRITE_TOKEN`.

## Future claim flow

A nicer version can be added later:

1. Sladdis requests a claim URL from Agent OS.
2. Felipe opens the URL while logged in.
3. Felipe approves scope + expiry, e.g. `content:create`, `content:read`, 30 days.
4. Agent OS returns a restricted token to Sladdis once.
5. Token can be revoked/rotated from Settings.

Until that exists, manually provision `SLADDIS_CONTENT_INGEST_TOKEN` as a scoped secret.
