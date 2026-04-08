export type WebKitPlaybackState = 'idle' | 'loading' | 'playing' | 'seeking' | 'recovering' | 'error'

export type WebKitPlaybackEvent =
  | 'source_attached'
  | 'play_started'
  | 'seek_started'
  | 'seek_succeeded'
  | 'seek_failed'
  | 'recovery_started'
  | 'recovery_succeeded'
  | 'reset'

export function nextWebKitPlaybackState(
  current: WebKitPlaybackState,
  event: WebKitPlaybackEvent,
): WebKitPlaybackState {
  switch (event) {
    case 'source_attached':
      return 'loading'
    case 'play_started':
      return 'playing'
    case 'seek_started':
      return 'seeking'
    case 'seek_succeeded':
      return 'playing'
    case 'seek_failed':
      return 'error'
    case 'recovery_started':
      return 'recovering'
    case 'recovery_succeeded':
      return 'playing'
    case 'reset':
      return 'idle'
    default:
      return current
  }
}
