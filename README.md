# trimmr

trimmr is a **free**, **private**, and **secure** open-source editor for animated media and video—your files **never leave your computer**. Edit trims and captions in seconds, then **export or convert to other video file formats** (WebM, MP4, and more) from the same workflow, with no upload and no account, **totally for free!**

The first product wedge is animated internet media:

- GIF
- animated WebP
- APNG
- MP4 and WebM videos

The first shipping workflow is intentionally narrow:

1. Choose an animated asset or video from your computer.
2. Trim the in and out points.
3. Adjust playback speed.
4. Add a text overlay.
5. Export a clean result.

## Product principles

- **Free** core editor; no account required.
- **Private and secure**: processing stays on the user’s device; files are not uploaded to our servers.
- **Fast** repeated utility workflows before creative-suite breadth.
- Zero install (open the app and go).
- Ads are deferred until the product shows clear product-market fit.

## Monorepo layout

- `apps/web`: React + Vite browser app and hosted shell
- `packages/shared`: shared types, utility helpers, analytics event schemas
- `packages/editor-core`: project model, commands, undo/redo
- `packages/media-engine`: import metadata, export helpers, draft persistence
- `packages/ui`: reusable editor UI primitives
- `docs/product-spec.md`: locked MVP scope
- `docs/mvp-checklist.md`: implementation checklist
- `docs/seo-entry-pages.md`: first SEO workflow pages
- `docs/technical-foundation.md`: browser stack decisions and feasibility notes

## Local development

Use the pinned Node version:

```bash
nvm use
npm install
npm run dev
```

Optional: enable PostHog product analytics for local/dev builds by setting:

```bash
VITE_PUBLIC_POSTHOG_TOKEN=phc_xxx
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

## Quality gates

This repo is set up to behave like an open-source package, not a throwaway prototype.

- `npm run typecheck`: checks the app and all shared packages
- `npm run lint`: lints app code, package code, and root configs
- `npm run test:coverage`: runs unit and integration tests with enforced coverage thresholds
- `npm run test:e2e`: runs the browser smoke test
- `npm run check`: runs the full quality gate locally

Coverage is enforced at `>=95%` for statements, branches, functions, and lines across the application-specific logic layer:

- timeline helpers in `packages/shared/src/timeline.ts`
- editor state and command logic in `packages/editor-core/src/index.ts`
- keyboard shortcut behavior in `apps/web/src/hooks/useKeyboardShortcuts.ts`
- preview/render mapping logic in `apps/web/src/lib/renderProjectFrame.ts`

Integration-heavy surfaces and UI wrapper components are still tested, but they are not the primary coverage gate.

## Status

This repository currently contains:

- the product spec and delivery checklist
- the monorepo scaffold
- an editor prototype for import, trim, caption, draft persistence, and export (on-device processing)
- starter unit and browser smoke tests

## Near-term roadmap

- improve animated image decoding beyond metadata-only fallback paths
- add image and sticker overlays
- add richer optimization presets and stronger export controls
- expand from a single-clip workflow to multi-clip editing
