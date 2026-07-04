# QAA + Sladdis Remotion Film

Local Remotion prototype for a 60-90 second product story explaining how QAA acts as the QA platform and Sladdis performs scoped QA work through it.

## Files

- `docs/storyboard.md` - positioning, storyboard, and voiceover draft.
- `src/video.tsx` - the animated composition.
- `src/root.tsx` - Remotion composition registration.
- `out/` - local render artifacts, ignored by git.

## Commands

```bash
npm run preview
npm run typecheck
npm run render
npm run render:still
```

The main composition id is `QaaSladdisPlatform`.

## Notes

This folder is intentionally self-contained under `remotion/` so the video can evolve without touching the main app.
