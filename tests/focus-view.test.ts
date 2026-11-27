import { createSSRApp, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProtection, emptyData } from '../src/domain/model'

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
  mocks.protection.mockResolvedValue({ supported: false, authorized: false, connected: false, active: false, state: 'unsupported', reason: '', effectiveWhitelist: [] })
  mocks.app = reactive({
    data: {
      ...emptyData(),
      pet: { version: 1, selectedAnimalId: 'black-cat', selectedSkins: {}, lastSelectedItemId: null, retroCutoffAt: null },
      preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null, protection: defaultProtection() },
    },
    themes: [{ id: 't1', name: '高数', color: '#ef4e36', order: 0, collapsed: false }],
    items: [{ id: 'i1', themeId: 't1', title: '极限刷题', note: '', mode: 'countdown', minutes: 45, order: 0 }],
    focus: { session: null, elapsedMs: 0 },
    rest: { session: null, remainingMs: 0 },
    lock: { session: null, remainingMs: 0, records: [] },
    petProjection: {
      affection: 15,
      peakAffection: 15,
      currentStreakDays: 1,
      maxConsecutiveDays: 1,
      totalRaised: 3,
      raisedByAnimal: { 'black-cat': 3 },
      dailyGainToday: 5,
      dailyGains: {},
      recordEffects: new Map([
        ['r-done', { recordId: 'r-done', animalId: 'black-cat', skinId: 'default', affectionDelta: 5, litter: 1, validForPet: true, retroactive: false, dayKey: '2026-11-27' }],
      ]),
      unlockedAnimals: ['black-cat', 'yellow-chick'],
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

describe('FocusView standby, 3-stage growth, 10s cancel, and settlement', () => {
  it('renders standby with selected task pill, study capsule, black cat stage, drag clock, quick bar, and single start CTA', async () => {
    const { state, html } = await mountFocusSSR()
    expect(html).toContain('自由专注')
    expect(html).toContain('学霸模式 · 关')
    expect(html).toContain('小黑猫 · 换伙伴')
    expect(html).toContain('25:00')
    expect(html).toContain('开始专注')

    state.stepDuration(-5)
    expect(state.standbyMode).toBe('stopwatch')
    state.stepDuration(1)
    expect(state.standbyMode).toBe('countdown')
    expect(state.standbyMinutes).toBe(5)
    state.stepDuration(40)
    expect(state.standbyMinutes).toBe(180)
  })

  it('shows 3 growth stages and switches from 取消 (<10s) to 左滑放弃 (>=10s)', async () => {
    mocks.app.focus.session = {
      id: 'f1', itemId: null, themeId: null, title: '自由专注', themeName: '自由专注', color: '#222222',
      mode: 'countdown', targetMs: 100_000, startedAt: 0, timeZone: 'UTC', state: 'running',
      elapsedMs: 5_000, pausedMs: 0, anchorMono: 0, anchorEpoch: 0, bootId: 0, segments: [],
    }
    mocks.app.focus.elapsedMs = 5_000
    const stage1 = await mountFocusSSR()
    expect(stage1.html).toContain('小黑猫（阶段1）')
    expect(stage1.html).toMatch(/cancel-control[^>]*>\s*取消\s*</)
    expect(stage1.html).not.toContain('左滑放弃')

    mocks.app.focus.elapsedMs = 40_000
    const stage2 = await mountFocusSSR()
    expect(stage2.html).toContain('小黑猫（阶段2）')
    expect(stage2.html).toContain('左滑放弃')
    expect(stage2.html).not.toMatch(/cancel-control[^>]*>\s*取消\s*</)

    mocks.app.focus.elapsedMs = 80_000
    const stage3 = await mountFocusSSR()
    expect(stage3.html).toContain('小黑猫（阶段3）')
  })

  it('renders completed affection/litter gains and early failure chips + note input', async () => {
    mocks.app.lastResult = {
      id: 'r-done', itemId: null, themeId: null, title: '自由专注', themeName: '自由专注', color: '#222222',
      mode: 'countdown', targetMs: 1_500_000, startedAt: 0, endedAt: 1_500_000, timeZone: 'UTC',
      durationMs: 1_500_000, pausedMs: 0, segments: [], status: 'completed', animalId: 'black-cat', skinId: 'default',
    }
    const done = await mountFocusSSR()
    expect(done.html).toContain('本次专注正常结束')
    expect(done.html).toContain('好感 +5 · 农场 +1 只')
    expect(done.html).toContain('休息 5 分钟')

    mocks.app.lastResult = {
      ...mocks.app.lastResult,
      id: 'r-early',
      status: 'early',
      failReason: 'left_app',
    }
    const early = await mountFocusSSR()
    expect(early.html).toContain('完蛋！你的小黑猫挂了')
    expect(early.html).toContain('离开专注太久，没能救回来')
    expect(early.html).toContain('好感 -5')
    expect(early.html).toContain('回消息')
    expect(early.html).toContain('刷视频')
    expect(early.html).toContain('临时有事')
    expect(early.html).toContain('走神了')
  })
})
