import { createRenderer, createSSRApp, h, nextTick, reactive, ssrContextKey } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProtection, emptyData } from '../src/domain/model'

const mocks = vi.hoisted(() => ({
  app: null as any,
  router: { push: vi.fn(async () => {}), replace: vi.fn(async () => {}) },
  feedback: vi.fn(),
  updates: {
    state: { currentVersion: '0.2.18', phase: 'idle', release: null, received: 0, total: 0 },
    checking: false,
    hasUpdate: false,
  },
}))

vi.mock('/icons/github-mark.png', () => ({ default: '/icons/github-mark.png' }))
vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('../src/stores/updates', () => ({ useUpdates: () => mocks.updates }))
vi.mock('vue-router', () => ({
  useRouter: () => mocks.router,
  onBeforeRouteLeave: () => {},
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))
vi.mock('../src/platform/bridge', () => ({
  native: false,
  exportFile: vi.fn(async () => {}),
  importNativeFile: vi.fn(async () => ({ text: '' })),
  permissionStatus: vi.fn(async () => ({
    notifications: false,
    exactAlarms: false,
    batteryOptimizationIgnored: false,
    foregroundServiceActive: false,
  })),
  requestNotifications: vi.fn(async () => ({ notifications: false })),
  openAlarmSettings: vi.fn(async () => {}),
  openBatteryOptimizationSettings: vi.fn(async () => {}),
  protectionDriver: { status: vi.fn(async () => ({ supported: false })), apps: vi.fn(async () => []) },
}))
vi.mock('../src/platform/feedback', () => ({
  playLightCompletionFeedback: mocks.feedback,
}))

import SettingsView from '../src/views/SettingsView.vue'
import RestView from '../src/views/RestView.vue'

async function mountSSR(component: any, prepare?: (state: any) => void) {
  let setupState: any
  const vnode = h(component)
  const app = createSSRApp({ render: () => vnode })
  app.component('RouterLink', { props: ['to'], template: '<a :href="to"><slot /></a>' })
  if (prepare) {
    app.mixin({
      created() {
        const internal = (this as any).$
        if (internal?.type === component) {
          setupState = internal.setupState
          prepare(setupState)
        }
      },
    })
  }
  const html = await renderToString(app)
  return { state: setupState ?? (vnode.component as any).setupState, html }
}

function mountLiveRestView() {
  const prevDoc = globalThis.document
  Object.defineProperty(globalThis, 'document', {
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    configurable: true,
  })
  const noop = () => {}
  const { createApp } = createRenderer<any, any>({
    patchProp: noop,
    insert: noop,
    remove: noop,
    createElement: (type) => ({ type, children: [] }),
    createText: (text) => ({ text }),
    createComment: (text) => ({ text }),
    setText: noop,
    setElementText: noop,
    parentNode: () => null,
    nextSibling: () => null,
  })
  const root = { type: 'root', children: [] }
  let setupState: any
  const app = createApp({ render: () => h(RestView) })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mixin({
    created() {
      const internal = (this as any).$
      if (internal?.type === RestView) setupState = internal.setupState
    },
  })
  app.mount(root)
  return {
    state: setupState,
    unmount: () => {
      app.unmount()
      Object.defineProperty(globalThis, 'document', { value: prevDoc, configurable: true })
    },
  }
}

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    itemId: 'i1',
    themeId: 't1',
    title: '背单词',
    themeName: '英语',
    color: '#ef4e36',
    mode: 'countdown' as const,
    targetMs: 25 * 60_000,
    startedAt: 1_000_000,
    endedAt: 2_500_000,
    timeZone: 'UTC',
    durationMs: 25 * 60_000,
    pausedMs: 0,
    segments: [{ start: 1_000_000, end: 2_500_000 }],
    status: 'completed' as const,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.app = reactive({
    data: {
      ...emptyData(),
      themes: [{ id: 't1', name: '英语', color: '#ef4e36', order: 0, collapsed: false }],
      items: [{ id: 'i1', themeId: 't1', title: '背单词', note: '', mode: 'countdown', minutes: 25, order: 0 }],
      preferences: {
        defaultMinutes: 25,
        sound: true,
        vibration: true,
        activeSemesterId: null,
        protection: defaultProtection(),
      },
    },
    themes: [{ id: 't1', name: '英语', color: '#ef4e36', order: 0, collapsed: false }],
    items: [{ id: 'i1', themeId: 't1', title: '背单词', note: '', mode: 'countdown', minutes: 25, order: 0 }],
    focus: { session: null, elapsedMs: 0 },
    rest: { session: null, remainingMs: 0 },
    lock: { session: null, remainingMs: 0, records: [] },
    notify: vi.fn(),
    start: vi.fn(async () => {}),
    exitRest: vi.fn(async () => {
      mocks.app.rest = { session: null, remainingMs: 0 }
    }),
    mutate: vi.fn(async (fn: any) => fn(mocks.app.data)),
    clearStrictAcknowledged: vi.fn(),
    restore: vi.fn(async () => {}),
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SettingsView 计时与休息, 屏幕常亮, and 提醒与声音 layout (§5.6)', () => {
  it('places 计时与休息, 屏幕常亮 (default true), and 提醒与声音 inside 专注设置 with <= 4 rows, moving sound/vibration into 提醒与声音 sheet', async () => {
    const { html } = await mountSSR(SettingsView)
    const startIdx = html.indexOf('专注设置</h3>')
    const endIdx = html.indexOf('专注保护</h3>')
    expect(startIdx).toBeGreaterThan(-1)
    expect(endIdx).toBeGreaterThan(startIdx)
    const focusGroupHtml = html.slice(startIdx, endIdx)

    expect(focusGroupHtml).toContain('默认专注时长')
    expect(focusGroupHtml).toContain('计时与休息')
    expect(focusGroupHtml).toContain('5 分钟')
    expect(focusGroupHtml).toContain('屏幕常亮')
    expect(focusGroupHtml).toContain('提醒与声音')
    expect(focusGroupHtml).not.toContain('结束提示音')
    expect(focusGroupHtml).not.toContain('结束振动')

    const rowCount = (focusGroupHtml.match(/class="settings-row/g) ?? []).length
    expect(rowCount).toBe(4)

    // keepScreenOn defaults to checked when undefined
    const screenRowMatch = focusGroupHtml.match(/屏幕常亮[\s\S]*?<input[^>]*>/)
    expect(screenRowMatch?.[0]).toContain('checked')
  })

  it('opens 计时与休息 sheet with 5/10/15/20 chips, autoRest, pomodoroLoop, conditional note, and saves preferences', async () => {
    const { state, html } = await mountSSR(SettingsView, (s) => {
      s.openSheet('restTiming')
    })
    expect(html).toContain('休息时长')
    expect(html).toContain('5 分钟')
    expect(html).toContain('10 分钟')
    expect(html).toContain('15 分钟')
    expect(html).toContain('20 分钟')
    expect(html).toContain('自动进入休息')
    expect(html).toContain('番茄循环')
    expect(html).toContain('保存设置')
    // Conditional note when autoRest is false
    expect(html).toContain('自动进入休息')

    state.restForm.restMinutes = 15
    state.restForm.autoRest = true
    state.restForm.pomodoroLoop = true
    await state.saveRestTiming()

    expect(mocks.app.data.preferences.restMinutes).toBe(15)
    expect(mocks.app.data.preferences.autoRest).toBe(true)
    expect(mocks.app.data.preferences.pomodoroLoop).toBe(true)
    expect(state.sheet).toBeNull()
  })

  it('mounts 结束提示音 and 结束振动 inside 提醒与声音 sheet', async () => {
    const { html } = await mountSSR(SettingsView, (s) => {
      s.openSheet('sound')
    })
    expect(html).toContain('结束提示音')
    expect(html).toContain('结束振动')
    expect(html).toContain('前往学霸模式 · 免打扰设置')
  })
})

describe('RestView pomodoroLoop behavior', () => {
  it('automatically plays reminder and restarts previous item + targetMs when rest naturally completes with pomodoroLoop=true', async () => {
    mocks.app.data.preferences.pomodoroLoop = true
    mocks.app.data.preferences.autoRest = true
    mocks.app.data.preferences.sound = true
    mocks.app.data.preferences.vibration = false
    const record = makeRecord()
    mocks.app.rest = {
      session: { durationMs: 600_000, record, startedAt: 2_500_000, endsAt: 3_100_000, state: 'running' },
      remainingMs: 600_000,
    }

    const mounted = mountLiveRestView()
    mocks.app.rest = {
      session: { durationMs: 600_000, record, startedAt: 2_500_000, endsAt: 3_100_000, state: 'completed' },
      remainingMs: 0,
    }
    await nextTick()
    await nextTick()
    mounted.unmount()

    expect(mocks.feedback).toHaveBeenCalledWith({ sound: true, vibration: false })
    expect(mocks.app.start).toHaveBeenCalledWith(mocks.app.items[0], 'countdown', 25)
    expect(mocks.router.replace).toHaveBeenCalledWith('/focus')
  })

  it('does NOT auto-start next focus when user manually exits rest even if pomodoroLoop=true', async () => {
    mocks.app.data.preferences.pomodoroLoop = true
    const record = makeRecord()
    mocks.app.rest = {
      session: { durationMs: 600_000, record, startedAt: 2_500_000, endsAt: 3_100_000, state: 'running' },
      remainingMs: 300_000,
    }

    const mounted = mountLiveRestView()
    await mounted.state.exit()
    mounted.unmount()

    expect(mocks.app.exitRest).toHaveBeenCalledTimes(1)
    expect(mocks.app.start).not.toHaveBeenCalled()
    expect(mocks.router.replace).toHaveBeenCalledWith('/focus')
  })

  it('surfaces startError sheet cleanly if pomodoroLoop auto-start throws a protection error', async () => {
    mocks.app.data.preferences.pomodoroLoop = true
    mocks.app.start.mockRejectedValueOnce(new Error('请先授权无障碍服务'))
    const record = makeRecord({ itemId: null, title: '自由专注', mode: 'stopwatch', targetMs: 45 * 60_000 })
    mocks.app.rest = {
      session: { durationMs: 300_000, record, startedAt: 2_500_000, endsAt: 2_800_000, state: 'running' },
      remainingMs: 300_000,
    }

    const mounted = mountLiveRestView()
    mocks.app.rest = {
      session: { durationMs: 300_000, record, startedAt: 2_500_000, endsAt: 2_800_000, state: 'completed' },
      remainingMs: 0,
    }
    await nextTick()
    await nextTick()

    expect(mocks.app.start).toHaveBeenCalledWith(null, 'stopwatch', 45)
    expect(mounted.state.sheet).toBe('startError')
    expect(mounted.state.startError?.message).toContain('无障碍')
    mounted.unmount()
  })

  it('auto-triggers completion reminder and next focus once on cold-open completed rest with pomodoroLoop=true', async () => {
    mocks.app.data.preferences.pomodoroLoop = true
    mocks.app.data.preferences.sound = true
    mocks.app.data.preferences.vibration = true
    const record = makeRecord({ id: 'rec-cold-1' })
    mocks.app.rest = {
      session: { durationMs: 300_000, record, startedAt: 2_500_000, endsAt: 2_800_000, state: 'completed' },
      remainingMs: 0,
    }

    const firstMount = mountLiveRestView()
    await nextTick()
    await nextTick()
    firstMount.unmount()

    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.feedback).toHaveBeenCalledWith({ sound: true, vibration: true })
    expect(mocks.app.start).toHaveBeenCalledTimes(1)
    expect(mocks.app.start).toHaveBeenCalledWith(mocks.app.items[0], 'countdown', 25)
    expect(mocks.router.replace).toHaveBeenCalledWith('/focus')

    // Re-mounting / returning to completed rest for the same record.id must NOT loop
    const secondMount = mountLiveRestView()
    await nextTick()
    secondMount.unmount()
    expect(mocks.app.start).toHaveBeenCalledTimes(1)
  })
})
