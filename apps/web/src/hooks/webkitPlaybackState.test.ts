import { describe, expect, it } from 'vitest'
import { nextWebKitPlaybackState, type WebKitPlaybackState } from './webkitPlaybackState'

describe('nextWebKitPlaybackState', () => {
  it('moves through loading, playing, seeking, and back to playing', () => {
    let state: WebKitPlaybackState = 'idle'
    state = nextWebKitPlaybackState(state, 'source_attached')
    expect(state).toBe('loading')
    state = nextWebKitPlaybackState(state, 'play_started')
    expect(state).toBe('playing')
    state = nextWebKitPlaybackState(state, 'seek_started')
    expect(state).toBe('seeking')
    state = nextWebKitPlaybackState(state, 'seek_succeeded')
    expect(state).toBe('playing')
  })

  it('enters error on failed seek and can reset', () => {
    let state: WebKitPlaybackState = 'playing'
    state = nextWebKitPlaybackState(state, 'seek_started')
    state = nextWebKitPlaybackState(state, 'seek_failed')
    expect(state).toBe('error')
    state = nextWebKitPlaybackState(state, 'reset')
    expect(state).toBe('idle')
  })

  it('enters recovering and returns to playing', () => {
    let state: WebKitPlaybackState = 'error'
    state = nextWebKitPlaybackState(state, 'recovery_started')
    expect(state).toBe('recovering')
    state = nextWebKitPlaybackState(state, 'recovery_succeeded')
    expect(state).toBe('playing')
  })
})
