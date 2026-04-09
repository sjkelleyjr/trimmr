/**
 * Single source of truth for SEO HTML pages and sitemap URLs.
 * Paths are relative to the repository root.
 */
export const SITE_ORIGIN = 'https://trimmr.xyz'

/** @type {{ relPath: string, loc: string, requireAppLink: boolean, workflowGuide?: boolean }[]} */
export const SEO_PAGES = [
  {
    relPath: 'apps/web/index.html',
    loc: `${SITE_ORIGIN}/`,
    requireAppLink: false,
  },
  {
    relPath: 'apps/web/public/workflows/index.html',
    loc: `${SITE_ORIGIN}/workflows/index.html`,
    requireAppLink: true,
  },
  {
    relPath: 'apps/web/public/workflows/trim-gif.html',
    loc: `${SITE_ORIGIN}/workflows/trim-gif.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/resize-gif.html',
    loc: `${SITE_ORIGIN}/workflows/resize-gif.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/add-text-to-gif.html',
    loc: `${SITE_ORIGIN}/workflows/add-text-to-gif.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/video-to-gif.html',
    loc: `${SITE_ORIGIN}/workflows/video-to-gif.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/trim-video.html',
    loc: `${SITE_ORIGIN}/workflows/trim-video.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/video-meme.html',
    loc: `${SITE_ORIGIN}/workflows/video-meme.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/trim-webm.html',
    loc: `${SITE_ORIGIN}/workflows/trim-webm.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/cut-mp4-online.html',
    loc: `${SITE_ORIGIN}/workflows/cut-mp4-online.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/convert-webm-to-mp4.html',
    loc: `${SITE_ORIGIN}/workflows/convert-webm-to-mp4.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/trimmr-vs-kapwing.html',
    loc: `${SITE_ORIGIN}/workflows/trimmr-vs-kapwing.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/trimmr-vs-ezgif.html',
    loc: `${SITE_ORIGIN}/workflows/trimmr-vs-ezgif.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/gif-speed-changer.html',
    loc: `${SITE_ORIGIN}/workflows/gif-speed-changer.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/podcast-stream-to-gif.html',
    loc: `${SITE_ORIGIN}/workflows/podcast-stream-to-gif.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/product-demo-gif-for-social-docs.html',
    loc: `${SITE_ORIGIN}/workflows/product-demo-gif-for-social-docs.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/reaction-gif-from-long-video.html',
    loc: `${SITE_ORIGIN}/workflows/reaction-gif-from-long-video.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/before-after-quick-tip-gif-loops.html',
    loc: `${SITE_ORIGIN}/workflows/before-after-quick-tip-gif-loops.html`,
    requireAppLink: true,
    workflowGuide: true,
  },
]
