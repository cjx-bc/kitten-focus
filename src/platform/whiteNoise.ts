import { Capacitor } from '@capacitor/core'
import type { WhiteNoiseId } from '../domain/model'
import { WHITE_NOISE_IDS } from '../domain/model'
import { getCatFocusPlugin } from './catFocusPlugin'

interface WhiteNoiseNativeBridge {
  syncWhiteNoise?(options?: { userAction?: boolean }): Promise<{ ok: boolean }>
}

const plugin = getCatFocusPlugin<WhiteNoiseNativeBridge>()

async function invokeNativeWhiteNoiseSync(userAction: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform() || typeof plugin.syncWhiteNoise !== 'function') return
  await plugin.syncWhiteNoise({ userAction }).catch(() => {})
}

export interface WhiteNoiseTrackOption {
  id: WhiteNoiseId
  label: string
  src?: string
}

export const DEFAULT_WHITE_NOISE_VOLUME = 0.6

export const WHITE_NOISE_TRACKS: readonly WhiteNoiseTrackOption[] = [
  { id: 'off', label: '关闭' },
  { id: 'rain', label: '雨声', src: '/audio/rain.wav' },
  { id: 'birds', label: '鸟鸣', src: '/audio/birds.wav' },
  { id: 'stream', label: '溪流', src: '/audio/stream.wav' },
  { id: 'fire', label: '篝火', src: '/audio/fire.wav' },
  { id: 'waves', label: '海浪', src: '/audio/waves.wav' },
] as const

export interface AudioLike {
  loop: boolean
  volume: number
  src: string
  paused: boolean
  currentTime: number
  play(): Promise<void> | void
  pause(): void
}

export interface WhiteNoiseSyncInput {
  track?: WhiteNoiseId | string
  volume?: number
  hasActiveFocus: boolean
  sessionState?: 'running' | 'paused' | null
}

export function normalizeWhiteNoiseId(value: unknown): WhiteNoiseId {
  if (typeof value === 'string' && (WHITE_NOISE_IDS as readonly string[]).includes(value)) {
    return value as WhiteNoiseId
  }
  return 'off'
}

export function clampWhiteNoiseVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_WHITE_NOISE_VOLUME
  return Math.min(1, Math.max(0, value))
}

export function trackSrcForId(id: WhiteNoiseId): string | null {
  return WHITE_NOISE_TRACKS.find((item) => item.id === id)?.src ?? null
}

export function createWhiteNoiseController(deps?: {
  isNative?: () => boolean
  syncNative?: (userAction: boolean) => Promise<void>
  createAudio?: (src: string) => AudioLike | null
}) {
  const isNative = deps?.isNative ?? (() => Capacitor.isNativePlatform())
  const syncNativeFn = deps?.syncNative ?? invokeNativeWhiteNoiseSync
  const createAudio =
    deps?.createAudio ??
    ((src: string): AudioLike | null => {
      if (typeof Audio === 'undefined') return null
      const audio = new Audio(src)
      audio.preload = 'auto'
      return audio
    })

  let audio: AudioLike | null = null
  let currentTrack: WhiteNoiseId = 'off'
  let liveVolume = DEFAULT_WHITE_NOISE_VOLUME
  let pausedByNoisy = false
  let lastInput: WhiteNoiseSyncInput = {
    track: 'off',
    volume: DEFAULT_WHITE_NOISE_VOLUME,
    hasActiveFocus: false,
    sessionState: null,
  }

  function releaseAudio() {
    if (!audio) return
    try {
      audio.pause()
      audio.currentTime = 0
      audio.src = ''
    } catch {}
    audio = null
    currentTrack = 'off'
  }

  async function sync(input: WhiteNoiseSyncInput, userAction = false): Promise<void> {
    const track = normalizeWhiteNoiseId(input.track)
    const volume = clampWhiteNoiseVolume(input.volume)
    if (!input.hasActiveFocus || track === 'off' || userAction) {
      pausedByNoisy = false
    }
    lastInput = {
      track,
      volume,
      hasActiveFocus: Boolean(input.hasActiveFocus),
      sessionState: input.sessionState ?? null,
    }
    liveVolume = volume

    if (isNative()) {
      releaseAudio()
      if (userAction) {
        await syncNativeFn(true).catch(() => {})
      }
      return
    }

    if (!input.hasActiveFocus || track === 'off') {
      releaseAudio()
      return
    }

    const src = trackSrcForId(track)
    if (!src) {
      releaseAudio()
      return
    }

    if (input.sessionState !== 'running' || pausedByNoisy) {
      if (audio) {
        try {
          audio.pause()
        } catch {}
      }
      return
    }

    if (!audio || currentTrack !== track) {
      releaseAudio()
      audio = createAudio(src)
      if (!audio) return
      currentTrack = track
      audio.loop = true
    }

    audio.volume = volume
    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        // Ignore browser autoplay rejection in non-interactive test environments.
      }
    }
  }

  function pauseForNoisy() {
    pausedByNoisy = true
    if (audio) {
      try {
        audio.pause()
      } catch {}
    }
  }

  function clearNoisyPause() {
    pausedByNoisy = false
  }

  function setLiveVolume(volume: number) {
    liveVolume = clampWhiteNoiseVolume(volume)
    if (!isNative() && audio) {
      audio.volume = liveVolume
    }
  }

  function stop() {
    pausedByNoisy = false
    lastInput = { ...lastInput, hasActiveFocus: false, sessionState: null }
    releaseAudio()
  }

  return {
    sync,
    pauseForNoisy,
    clearNoisyPause,
    setLiveVolume,
    stop,
    getState: () => ({ currentTrack, liveVolume, pausedByNoisy, hasAudio: Boolean(audio), lastInput }),
  }
}

const defaultController = createWhiteNoiseController()

export const syncWhiteNoisePlayback = (input: WhiteNoiseSyncInput, userAction = false) =>
  defaultController.sync(input, userAction)
export const pauseWhiteNoiseForNoisy = () => defaultController.pauseForNoisy()
export const clearWhiteNoiseNoisyPause = () => defaultController.clearNoisyPause()
export const setWhiteNoiseLiveVolume = (volume: number) => defaultController.setLiveVolume(volume)
export const stopWhiteNoisePlayback = () => defaultController.stop()
