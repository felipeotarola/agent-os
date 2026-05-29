# Sladdis Content Studio Quickstart

Short handoff for Sladdis to start using Agent OS Content Studio.

## Where to go

Open Agent OS and go to:

`/dashboard/content-studio`

## What Content Studio does in V1

Content Studio is a planning/control surface for Sladdis content.

It can:

- create content drafts
- upload source images to Vercel Blob when the Sladdis Supabase Edge Function is configured
- track content status: draft, ready, scheduled, posted, failed, archived
- create platform variants for Instagram, TikTok, YouTube Shorts, YouTube longform, X, and Facebook
- store campaign/pillar/schedule metadata
- prepare media references for later server-side upload/launch handling

It does **not** auto-post to external platforms yet.

## First workflow

1. Create a new draft.
2. Fill in:
   - **Title** — short internal name for the idea
   - **Brief** — hook, angle, source notes, CTA, asset needs
   - **Pillar** — e.g. education, launch, proof, comparison, behind-the-scenes
   - **Campaign** — default is `sladdis`
   - **Platforms** — default: Instagram, TikTok, YouTube Shorts
   - **Source images** — optional images to upload into the content asset store
3. Click **Create draft**.
4. Review/adapt the draft outside the form if needed.
5. When it is good enough for publishing prep, click **Mark ready**.
6. If there is a planned publish time, set a date/time and click **Schedule**.
7. Archive ideas that should not be used.

## Status meaning

- **Draft** — idea exists, still being shaped
- **Ready** — approved/prepared enough for launch work
- **Scheduled** — intended publish time has been set
- **Posted** — future connector/manual receipt state
- **Failed** — future connector/manual receipt state
- **Archived** — no longer active

## Important V1 boundary

The **Manual launch** button is intentionally blocked. Nothing in V1 should post to Instagram, TikTok, YouTube, X, or Facebook without a separate explicit human-controlled launch flow.

## What Sladdis needs from a human before using it seriously

For each content idea, ask for or infer:

- target audience
- message/claim
- source/proof
- desired CTA
- platform priority
- media needed: video, image, carousel, screenshot, etc.
- deadline or target publish date

## Good brief template

```text
Hook:
Angle:
Audience:
Proof/source:
CTA:
Platforms:
Asset needs:
Deadline:
Notes:
```

## Brand visual rule

For headphone and social drafts, use the recurring `Sladdis postergirl` / `sladdis-model-01-urban-black-fit` persona as the primary visual when available. Product images can support the copy, but the feed should keep the same recognizable model/persona instead of switching to product-only hero visuals.

## Media library rule

Treat Media Library images as clean reusable source assets. Do not store baked final creatives with text overlays as source media; schedule drafts should combine selected source media with copy, platform, and schedule metadata for the later posting/rendering step.

## Current limitations

- Media upload exists only when the Supabase Edge Function is deployed and configured with a Vercel Blob token.
- Video upload is enabled for common short-form web formats (`mp4`, `mov`, `webm`, `m4v`).
- No external autopublishing.
- No platform-specific caption editor beyond generated metadata/variants.
- No approval queue beyond status changes.

Use it as the content pipeline’s source of truth, not as the final publisher.
