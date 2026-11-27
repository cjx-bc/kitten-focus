import fs from 'node:fs'
import path from 'node:path'
import { createSSRApp, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProtection, emptyData } from '../src/domain/model'
import {
  DEFAULT_WHITE_NOISE_VOLUME,
  WHITE_NOISE_TRACKS,
  clampWhiteNoiseVolume,
  createWhiteNoiseController,
  normalizeWhiteNoiseId,
  type AudioLike,
} from '../src/platform/whiteNoise'

const mocks = vi.hoisted(() => ({
  app: null as any,
  router: { push: vi.fn(), replace: vi.fn() },
  protection: vi.fn(),
}))

vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router }))
vi.mock('../src/platform/bridge', () => ({
  native: false,
  protectionDriver: { status: mocks.protection, apps: vi.fn(async () => []) },
}))

import FocusView from '../src/views/FocusView.vue'

const AUDIO_DIR = path.resolve(process.cwd(), 'public/audio')
const EXPECTED_TRACKS = ['rain', 'birds', 'stream', 'fire', 'waves'] as const
const MAX_TOTAL_BYTES = 1_887_436 // strictly < 1.8 MiB

function makeMockAudio(src: string): AudioLike & { playCalls: number; pauseCalls: number } {
  const instance = {
    src,
    loop: false,
    volume: 1,
    paused: true,
    currentTime: 0,
    playCalls: 0,
    pauseCalls: 0,
    play() {
      instance.playCalls += 1
      instance.paused = false
    },
    pause() {
      instance.pauseCalls += 1
      instance.paused = true
    },
  }
  return instance
}

async function mountFocusSSR(prepare?: (state: any) => void) {
  let setupState: any
  const vnode = h(FocusView)
  const app = createSSRApp({ render: () => vnode })
  if (prepare) {
    app.mixin({
      created() {
        const internal = (this as any).$
        if (internal?.type === FocusView) {
          setupState = internal.setupState
          prepare(setupState)
        }
      },
    })
  }
  const html = await renderToString(app)
  return { state: setupState ?? (vnode.component as any).setupState, html }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.protection.mockResolvedValue({
    supported: false,
    authorized: false,
    connected: false,
    active: false,
    state: 'unsupported',
    reason: '',
    effectiveWhitelist: [],
  })
  mocks.app = reactive({
    data: {
      ...emptyData(),
      pet: { version: 1, selectedAnimalId: 'black-cat', selectedSkins: {}, lastSelectedItemId: null, retroCutoffAt: null },
      preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null, protection: defaultProtection() },
    },
    themes: [],
    items: [],
    focus: { session: null, elapsedMs: 0 },
    rest: { session: null, remainingMs: 0 },
    lock: { session: null, remainingMs: 0, records: [] },
    petProjection: {
      affection: 0,
      peakAffection: 0,
      currentStreakDays: 0,
      maxConsecutiveDays: 0,
      totalRaised: 0,
      raisedByAnimal: {},
      dailyGainToday: 0,
      dailyGains: {},
      recordEffects: new Map(),
      unlockedAnimals: ['black-cat'],
      unlockedSkins: { 'black-cat': ['default'] },
      weekFarmSlice: () => ({ weekStartDate: '2026-11-23', weekEndDate: '2026-11-29', weekTotalCount: 0, totalDurationMs: 0, instances: [] }),
      weeklyFourColorMatrix: () => [],
    },
    lastResult: undefined,
    notify: vi.fn(),
    start: vi.fn(async () => {}),
    action: vi.fn(async () => {}),
    dismissResult: vi.fn(),
    updateRecordNote: vi.fn(async () => {}),
    selectStandbyItem: vi.fn(async () => {}),
    selectAnimal: vi.fn(async () => {}),
    startRest: vi.fn(async () => {}),
    mutate: vi.fn(async (fn: any) => fn(mocks.app.data)),
  })
})

describe('offline white noise audio assets', () => {
  it('provides all 5 non-empty seamless audio files totaling strictly under 1.8MB', () => {
    expect(fs.existsSync(AUDIO_DIR)).toBe(true)
    const files = fs.readdirSync(AUDIO_DIR)
    let totalBytes = 0
    for (const file of files) {
      const stat = fs.statSync(path.join(AUDIO_DIR, file))
      if (stat.isFile()) totalBytes += stat.size
    }

    for (const track of EXPECTED_TRACKS) {
      const match = files.find((f) => f.startsWith(`${track}.`))
      expect(match, `missing audio file for track "${track}"`).toBeDefined()
      const filePath = path.join(AUDIO_DIR, match!)
      const buf = fs.readFileSync(filePath)
      expect(buf.length).toBeGreaterThan(10_000)
      if (match!.endsWith('.wav')) {
        expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF')
        expect(buf.subarray(8, 12).toString('ascii')).toBe('WAVE')
      }
    }

    expect(totalBytes).toBeGreaterThan(0)
    expect(totalBytes).toBeLessThan(MAX_TOTAL_BYTES)
  })
})

describe('whiteNoise playback controller and state linkage', () => {
  it('normalizes tracks, clamps volume, and defaults to 60% off', () => {
    expect(DEFAULT_WHITE_NOISE_VOLUME).toBe(0.6)
    expect(WHITE_NOISE_TRACKS.map((t) => t.id)).toEqual(['off', 'rain', 'birds', 'stream', 'fire', 'waves'])
    expect(normalizeWhiteNoiseId('rain')).toBe('rain')
    expect(normalizeWhiteNoiseId('invalid')).toBe('off')
    expect(clampWhiteNoiseVolume(undefined)).toBe(0.6)
    expect(clampWhiteNoiseVolume(Number.NaN)).toBe(0.6)
    expect(clampWhiteNoiseVolume(-0.5)).toBe(0)
    expect(clampWhiteNoiseVolume(1.5)).toBe(1)
  })

  it('links browser audio playback with running/paused/stopped focus lifecycle and live volume', async () => {
    const created: Array<ReturnType<typeof makeMockAudio>> = []
    const controller = createWhiteNoiseController({
      isNative: () => false,
      createAudio: (src) => {
        const a = makeMockAudio(src)
        created.push(a)
        return a
      },
    })

    // Standby -> no playback
    await controller.sync({ track: 'rain', volume: 0.6, hasActiveFocus: false, sessionState: null })
    expect(created).toHaveLength(0)

    // Focus running -> loops rain at 0.6
    await controller.sync({ track: 'rain', volume: 0.6, hasActiveFocus: true, sessionState: 'running' })
    expect(created).toHaveLength(1)
    expect(created[0]!.src).toBe('/audio/rain.wav')
    expect(created[0]!.loop).toBe(true)
    expect(created[0]!.volume).toBe(0.6)
    expect(created[0]!.paused).toBe(false)

    // Real-time volume update
    controller.setLiveVolume(0.85)
    expect(created[0]!.volume).toBe(0.85)

    // Focus paused -> pauses audio without releasing track
    await controller.sync({ track: 'rain', volume: 0.85, hasActiveFocus: true, sessionState: 'paused' })
    expect(created[0]!.paused).toBe(true)

    // Focus resumed -> resumes playback
    await controller.sync({ track: 'rain', volume: 0.85, hasActiveFocus: true, sessionState: 'running' })
    expect(created[0]!.paused).toBe(false)

    // Switch track -> releases previous and starts new track
    await controller.sync({ track: 'waves', volume: 0.5, hasActiveFocus: true, sessionState: 'running' })
    expect(created).toHaveLength(2)
    expect(created[0]!.src).toBe('')
    expect(created[1]!.src).toBe('/audio/waves.wav')
    expect(created[1]!.volume).toBe(0.5)
    expect(created[1]!.paused).toBe(false)

    // Session ends -> stops and releases audio
    await controller.sync({ track: 'waves', volume: 0.5, hasActiveFocus: false, sessionState: null })
    expect(created[1]!.paused).toBe(true)
    expect(created[1]!.src).toBe('')
  })

  it('delegates playback on native platform without spawning WebView <audio>', async () => {
    const syncNative = vi.fn(async () => {})
    const createAudio = vi.fn(() => makeMockAudio('/audio/rain.wav'))
    const controller = createWhiteNoiseController({
      isNative: () => true,
      syncNative,
      createAudio,
    })

    await controller.sync({ track: 'rain', volume: 0.6, hasActiveFocus: true, sessionState: 'running' }, true)
    expect(createAudio).not.toHaveBeenCalled()
    expect(syncNative).toHaveBeenCalledWith(true)
  })
})

describe('FocusView white noise controls and persistence', () => {
  it('renders white noise trigger in standby and running headers, opens sheet with 6 options & 60% slider, and persists preferences', async () => {
    const standby = await mountFocusSSR((s) => {
      s.focusSheet = 'whiteNoise'
    })
    expect(standby.html).toContain('aria-label="白噪音"')
    expect(standby.html).toContain('关闭')
    expect(standby.html).toContain('雨声')
    expect(standby.html).toContain('鸟鸣')
    expect(standby.html).toContain('溪流')
    expect(standby.html).toContain('篝火')
    expect(standby.html).toContain('海浪')
    expect(standby.html).toContain('60%')
    expect(standby.html).not.toContain('结束提示音')

    await standby.state.selectWhiteNoise('fire')
    expect(mocks.app.data.preferences.whiteNoise).toBe('fire')
    expect(mocks.app.data.preferences.whiteNoiseVolume).toBe(0.6)

    standby.state.onWhiteNoiseVolumeInput({ target: { value: '85' } } as unknown as Event)
    await standby.state.flushWhiteNoiseVolume()
    expect(mocks.app.data.preferences.whiteNoiseVolume).toBe(0.85)

    mocks.app.focus.session = {
      id: 'f1',
      itemId: null,
      themeId: null,
      title: '自由专注',
      themeName: '自由专注',
      color: '#222222',
      mode: 'countdown',
      targetMs: 1_500_000,
      startedAt: 0,
      timeZone: 'UTC',
      state: 'running',
      elapsedMs: 1000,
      pausedMs: 0,
      anchorMono: 0,
      anchorEpoch: 0,
      bootId: 0,
      segments: [],
    }
    const running = await mountFocusSSR()
    expect(running.html).toContain('aria-label="白噪音"')
  })
})
