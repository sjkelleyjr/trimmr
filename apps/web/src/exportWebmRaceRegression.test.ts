import { describe, expect, it } from 'vitest'

/**
 * Regression for mobile-safari export e2e: `Promise.race` with raw
 * `page.waitForEvent('download')` rejects on timeout, which rejects the whole race
 * before the success status line can win. Download + status promises must use
 * `.catch(() => null)` so they resolve (possibly to null) instead of rejecting.
 */
describe('exportWebmWithin race semantics', () => {
  it('resolves with status when download settles to null after status (catch-to-null)', async () => {
    const downloadOutcome = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 20)
    })
      .then((d) => ({ kind: 'download' as const, d }))
      .catch(() => null)

    const statusOutcome = new Promise<{ kind: 'status' }>((resolve) => {
      setTimeout(() => resolve({ kind: 'status' as const }), 5)
    }).catch(() => null)

    const outcome = await Promise.race([downloadOutcome, statusOutcome])

    expect(outcome).toEqual({ kind: 'status' })
  })

  it('rejects the race when download rejects without catch-to-null', async () => {
    const rawDownload = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 5)
    })

    const statusOutcome = new Promise<{ kind: 'status' }>((resolve) => {
      setTimeout(() => resolve({ kind: 'status' }), 15)
    })

    await expect(Promise.race([rawDownload, statusOutcome])).rejects.toThrow('timeout')
  })
})
