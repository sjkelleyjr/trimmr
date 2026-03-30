import { describe, expect, it } from 'vitest'
import { buildTrafficSourceProps } from './trafficSource'

describe('buildTrafficSourceProps', () => {
  it('marks empty referrer as direct', () => {
    expect(buildTrafficSourceProps('', '')).toEqual({
      traffic_source: 'direct',
    })
  })

  it('parses Reddit subreddit from www link', () => {
    expect(
      buildTrafficSourceProps('https://www.reddit.com/r/webdev/comments/abc/hello/', ''),
    ).toMatchObject({
      traffic_source: 'reddit',
      referrer_host: 'www.reddit.com',
      reddit_subreddit: 'webdev',
    })
  })

  it('parses old.reddit.com and np.reddit.com', () => {
    expect(buildTrafficSourceProps('https://old.reddit.com/r/videos', '')).toMatchObject({
      traffic_source: 'reddit',
      reddit_subreddit: 'videos',
    })
    expect(
      buildTrafficSourceProps('https://np.reddit.com/r/golang/about/', ''),
    ).toMatchObject({
      reddit_subreddit: 'golang',
    })
  })

  it('classifies Facebook link shim host', () => {
    expect(
      buildTrafficSourceProps('https://l.facebook.com/l.php?u=https%3A%2F%2Ftrimmr.xyz', ''),
    ).toMatchObject({
      traffic_source: 'facebook',
      referrer_host: 'l.facebook.com',
    })
  })

  it('classifies Google', () => {
    expect(buildTrafficSourceProps('https://www.google.com/search?q=trimmr', '')).toMatchObject({
      traffic_source: 'google',
      referrer_host: 'www.google.com',
    })
    expect(buildTrafficSourceProps('https://google.co.uk/url?q=...', '')).toMatchObject({
      traffic_source: 'google',
    })
  })

  it('includes UTM params from landing search string', () => {
    expect(
      buildTrafficSourceProps('', '?utm_source=newsletter&utm_medium=email&utm_campaign=lunch'),
    ).toEqual({
      traffic_source: 'direct',
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'lunch',
    })
  })

  it('combines referrer classification with UTMs', () => {
    const props = buildTrafficSourceProps('https://t.co/xyz', '?utm_campaign=test')
    expect(props).toMatchObject({
      traffic_source: 'twitter',
      utm_campaign: 'test',
    })
  })
})
