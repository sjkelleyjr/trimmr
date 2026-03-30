export type TrafficSourceLabel =
  | 'direct'
  | 'reddit'
  | 'facebook'
  | 'google'
  | 'twitter'
  | 'instagram'
  | 'linkedin'
  | 'bing'
  | 'duckduckgo'
  | 'yahoo'
  | 'hackernews'
  | 'producthunt'
  | 'youtube'
  | 'tiktok'
  | 'discord'
  | 'other'

const MAX_PATH_LEN = 240

function classifyTrafficSource(host: string): TrafficSourceLabel {
  const h = host.toLowerCase().replace(/^www\./, '')
  if (!h) {
    return 'direct'
  }

  if (h.endsWith('reddit.com') || h === 'redd.it') {
    return 'reddit'
  }
  if (h.includes('facebook.com') || h === 'fb.com' || h === 'fb.me' || h.endsWith('.fb.com')) {
    return 'facebook'
  }
  if (h === 't.co' || h === 'x.com' || h === 'twitter.com') {
    return 'twitter'
  }
  if (h.includes('instagram.com')) {
    return 'instagram'
  }
  if (h.includes('linkedin.com') || h === 'lnkd.in') {
    return 'linkedin'
  }
  if (h === 'bing.com' || h.startsWith('bing.') || h.endsWith('.bing.com')) {
    return 'bing'
  }
  if (h.includes('duckduckgo.com')) {
    return 'duckduckgo'
  }
  if (h.includes('search.yahoo.com') || h.endsWith('yahoo.com')) {
    return 'yahoo'
  }
  if (h === 'news.ycombinator.com') {
    return 'hackernews'
  }
  if (h.includes('producthunt.com')) {
    return 'producthunt'
  }
  if (h === 'youtu.be' || h.includes('youtube.com') || h.includes('youtube-nocookie.com')) {
    return 'youtube'
  }
  if (h.includes('tiktok.com')) {
    return 'tiktok'
  }
  if (h.includes('discord.com') || h.includes('discord.gg')) {
    return 'discord'
  }
  if (h === 'google.com' || h.endsWith('.google.com') || /^google\.[a-z.]+$/i.test(h)) {
    return 'google'
  }

  return 'other'
}

function extractRedditSubreddit(host: string, pathname: string): string {
  const h = host.toLowerCase()
  if (!h.endsWith('reddit.com') && h !== 'redd.it') {
    return ''
  }

  const match = pathname.match(/\/r\/([A-Za-z0-9_]+)\b/)
  return match?.[1] ? match[1].toLowerCase() : ''
}

function truncatePath(pathname: string): string {
  if (pathname.length <= MAX_PATH_LEN) {
    return pathname
  }
  return `${pathname.slice(0, MAX_PATH_LEN)}…`
}

export type TrafficSourceAnalyticsProps = Record<string, string>

/** Parses document.referrer + landing-page query (UTMs). Safe to call in browser only. */
export function buildTrafficSourceProps(referrer: string, landingSearch: string): TrafficSourceAnalyticsProps {
  const params = new URLSearchParams(landingSearch.startsWith('?') ? landingSearch.slice(1) : landingSearch)

  let referrerHost = ''
  let referrerPath = ''
  let trafficSource: TrafficSourceLabel = 'direct'
  let redditSubreddit = ''

  if (referrer) {
    try {
      const url = new URL(referrer)
      referrerHost = url.hostname.toLowerCase()
      referrerPath = truncatePath(`${url.pathname}${url.search}`)
      trafficSource = classifyTrafficSource(referrerHost)
      redditSubreddit = extractRedditSubreddit(referrerHost, url.pathname)
    } catch {
      trafficSource = 'other'
      referrerHost = ''
      referrerPath = ''
    }
  }

  const props: TrafficSourceAnalyticsProps = {
    traffic_source: trafficSource,
  }

  if (referrerHost) {
    props.referrer_host = referrerHost
  }
  if (referrerPath) {
    props.referrer_path = referrerPath
  }
  if (redditSubreddit) {
    props.reddit_subreddit = redditSubreddit
  }

  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const) {
    const value = params.get(key)
    if (value) {
      props[key] = value.slice(0, 200)
    }
  }

  return props
}
