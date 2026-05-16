/**
 * Single source of truth for SEO HTML pages and sitemap URLs.
 * Paths are relative to the repository root.
 *
 * Structure: public/workflows/<slug>/index.html
 * URL: https://trimmr.xyz/workflows/<slug>/
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
    loc: `${SITE_ORIGIN}/workflows/`,
    requireAppLink: true,
  },
  {
    relPath: 'apps/web/public/workflows/trim-gif/index.html',
    loc: `${SITE_ORIGIN}/workflows/trim-gif/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/resize-gif/index.html',
    loc: `${SITE_ORIGIN}/workflows/resize-gif/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/add-text-to-gif/index.html',
    loc: `${SITE_ORIGIN}/workflows/add-text-to-gif/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/video-to-gif/index.html',
    loc: `${SITE_ORIGIN}/workflows/video-to-gif/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/trim-video/index.html',
    loc: `${SITE_ORIGIN}/workflows/trim-video/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/video-meme/index.html',
    loc: `${SITE_ORIGIN}/workflows/video-meme/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/trim-webm/index.html',
    loc: `${SITE_ORIGIN}/workflows/trim-webm/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/cut-mp4-online/index.html',
    loc: `${SITE_ORIGIN}/workflows/cut-mp4-online/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/convert-webm-to-mp4/index.html',
    loc: `${SITE_ORIGIN}/workflows/convert-webm-to-mp4/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/trimmr-vs-kapwing/index.html',
    loc: `${SITE_ORIGIN}/workflows/trimmr-vs-kapwing/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/trimmr-vs-ezgif/index.html',
    loc: `${SITE_ORIGIN}/workflows/trimmr-vs-ezgif/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/gif-speed-changer/index.html',
    loc: `${SITE_ORIGIN}/workflows/gif-speed-changer/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/podcast-stream-to-gif/index.html',
    loc: `${SITE_ORIGIN}/workflows/podcast-stream-to-gif/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/product-demo-gif-for-social-docs/index.html',
    loc: `${SITE_ORIGIN}/workflows/product-demo-gif-for-social-docs/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/reaction-gif-from-long-video/index.html',
    loc: `${SITE_ORIGIN}/workflows/reaction-gif-from-long-video/`,
    requireAppLink: true,
    workflowGuide: true,
  },
  {
    relPath: 'apps/web/public/workflows/before-after-quick-tip-gif-loops/index.html',
    loc: `${SITE_ORIGIN}/workflows/before-after-quick-tip-gif-loops/`,
    requireAppLink: true,
    workflowGuide: true,
  },
]
