export const config = { path: '/robots.txt' }

export function onRequest(): Response {
  const body = 'User-agent: *\nAllow: /\nSitemap: https://trimmr.xyz/sitemap.xml\n'
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=14400, must-revalidate',
    },
  })
}
