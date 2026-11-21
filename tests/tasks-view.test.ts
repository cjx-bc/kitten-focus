import { createSSRApp, defineComponent, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPeriods, defaultProtection } from '../src/domain/model'

const mocks = vi.hoisted(() => ({
  app: null as any,
  router: { push: vi.fn(), replace: vi.fn() },
  protection: vi.fn(),
}))

vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router }))
vi.mock('../src/platform/bridge', () => ({
  protectionDriver: {
    status: mocks.protection,
    apps: vi.fn(async () => []),
  },
}))

import TasksView from '../src/views/TasksView.vue'

async function mountTasksSSR(onCreated?: (state: any) => void) {
  let setupState: any
  const vnode = h(TasksView)
  const app = createSSRApp({ render: () => vnode })
  app.component(
    'RouterLink',
    defineComponent({
      props: { to: String },
      setup: (p, ctx) => () => h('a', { href: p.to }, ctx.slots.default?.()),
    }),
  )
  app.mixin({
    created() {
      const internal = (this as any).$
      if (internal?.type === TasksView) {
        setupState = internal.setupState
        onCreated?.(setupState)
      }
    },
  })
  const html = await renderToString(app)
  return { state: setupState ?? (vnode.component as any).setupState, html }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.protection.mockResolvedValue({
    supported: true,
    authorized: true,
    connected: true,
    active: false,
    state: 'off',
    reason: '',
    effectiveWhitelist: [],
  })
  mocks.app = reactive({
    data: {
      themes: [{ id: 't1', name: '英语', color: '#ef4e36', order: 0, collapsed: false }],
      items: [
        { id: 'i1', themeId: 't1', title: '背单词', note: '', mode: 'countdown', minutes: 25, order: 0 },
        { id: 'i2', themeId: 't1', title: '练听力', note: '', mode: 'countdown', minutes: 30, order: 1 },
      ],
      records: [],
      events: [],
      eventExceptions: [],
      semesters: [{ id: 's1', name: '2026秋', startDate: '2026-09-07', weeks: 20, periods: defaultPeriods() }],
      courses: [],
      courseExceptions: [],
      lockConfigurations: [],
      preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: 's1', protection: defaultProtection() },
    },
    themes: [{ id: 't1', name: '英语', color: '#ef4e36', order: 0, collapsed: false }],
    items: [
      { id: 'i1', themeId: 't1', title: '背单词', note: '', mode: 'countdown', minutes: 25, order: 0 },
      { id: 'i2', themeId: 't1', title: '练听力', note: '', mode: 'countdown', minutes: 30, order: 1 },
    ],
    focus: { session: null, elapsedMs: 0 },
    rest: { session: null, remainingMs: 0 },
    lock: { session: null, remainingMs: 0, records: [] },
    start: vi.fn(async () => {}),
    notify: vi.fn(),
    saveTheme: vi.fn(async () => {}),
    toggleThemeCollapsed: vi.fn(async () => {}),
    saveItem: vi.fn(async () => {}),
    saveItemWithNewTheme: vi.fn(async () => {}),
    removeItem: vi.fn(async () => {}),
    removeTheme: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
  })
})

describe('TasksView UX improvements', () => {
  it('shows direct focus start and example-guided item creation in empty state without bottom free-focus button', async () => {
    mocks.app.themes = []
    mocks.app.items = []
    mocks.app.data.preferences.defaultMinutes = 30
    const { state, html } = await mountTasksSSR()

    expect(html).toContain('开始 30 分钟专注')
    expect(html).toContain('创建第一个待办')
    expect(html).toContain('例如「英语 → 背单词」')
    expect(html).not.toContain('class="free-focus')

    await state.startDefaultFree()
    expect(mocks.app.start).toHaveBeenCalledWith(null, 'countdown', 30)
    expect(mocks.router.push).toHaveBeenCalledWith('/focus')

    state.openItem('')
    state.newThemeName = '英语'
    state.itemForm.title = '背单词'
    await state.submitItem()
    expect(mocks.app.saveItemWithNewTheme).toHaveBeenCalledWith(
      expect.objectContaining({ name: '英语' }),
      expect.objectContaining({ title: '背单词', minutes: 30 }),
    )
  })

  it('uses task card main area to start, more button to edit, and theme title to toggle collapse', async () => {
    const { state, html } = await mountTasksSSR()

    expect(html).toContain('aria-label="开始背单词"')
    expect(html).toContain('aria-label="编辑背单词"')
    expect(html).not.toContain('aria-label="编辑待办背单词"')
    expect(html).toContain('aria-label="收起主题英语"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-label="编辑主题英语"')

    state.toggleTheme(mocks.app.themes[0])
    expect(mocks.app.toggleThemeCollapsed).toHaveBeenCalledWith('t1')

    state.onTaskCardClick(mocks.app.items[0])
    await vi.waitFor(() => expect(mocks.app.start).toHaveBeenCalledWith(mocks.app.items[0]))
  })

  it('orders duration before collapsed application whitelist in item sheet and cleans global choice', async () => {
    const { state, html } = await mountTasksSSR((s) => {
      s.openItem('t1')
    })

    const durationIdx = html.indexOf('专注时长（分钟）')
    const whitelistIdx = html.indexOf('aria-controls="item-whitelist-panel"')
    expect(durationIdx).toBeGreaterThan(-1)
    expect(whitelistIdx).toBeGreaterThan(durationIdx)
    expect(html).not.toContain('规则说明')
    expect(html).not.toContain('<textarea')

    state.setItemWhitelist('custom')
    expect(state.itemForm.whitelist?.source).toBe('custom')
    state.setItemWhitelist('global')
    expect(state.itemForm.whitelist).toBeUndefined()

    state.openItem('t1', mocks.app.items[0])
    state.onItemThemeSelect({ target: { value: '' } })
    state.newThemeName = '词汇'
    await state.submitItem()
    expect(mocks.app.saveItemWithNewTheme).toHaveBeenCalledWith(
      expect.objectContaining({ name: '词汇' }),
      expect.objectContaining({ id: 'i1', title: '背单词' }),
    )
  })

  it('shows active session blockers up front, turns active card into return entry, and blocks other starts', async () => {
    mocks.app.focus.session = {
      id: 'f1',
      itemId: 'i1',
      themeId: 't1',
      title: '背单词',
      themeName: '英语',
      color: '#ef4e36',
      mode: 'countdown',
      targetMs: 1500000,
      startedAt: 1,
      timeZone: 'UTC',
      state: 'running',
      elapsedMs: 120000,
      pausedMs: 0,
      anchorMono: 1,
      anchorEpoch: 1,
      bootId: 0,
      segments: [],
    }
    const focusRender = await mountTasksSSR()
    expect(focusRender.html).toContain('返回背单词')
    expect(focusRender.html).toContain('正在专注「背单词」，结束后可开始其他事项')
    expect(focusRender.html).toContain('进行中 · 返回专注')
    expect(focusRender.html).toContain('aria-label="开始练听力" aria-disabled="true"')

    focusRender.state.onTaskCardClick(mocks.app.items[0])
    expect(mocks.router.push).toHaveBeenCalledWith('/focus')
    expect(mocks.app.start).not.toHaveBeenCalled()

    focusRender.state.onTaskCardClick(mocks.app.items[1])
    expect(mocks.app.notify).toHaveBeenCalledWith('正在专注「背单词」，结束后可开始其他事项')
    expect(mocks.app.start).not.toHaveBeenCalled()

    focusRender.state.openFree()
    expect(focusRender.state.sheet).toBeNull()
    expect(mocks.app.notify).toHaveBeenCalledTimes(2)

    mocks.app.focus.session = null
    mocks.app.rest.session = {
      record: {
        id: 'r1', itemId: 'i1', themeId: 't1', title: '背单词', themeName: '英语', color: '#ef4e36',
        mode: 'countdown', targetMs: 1500000, startedAt: 1, endedAt: 2, timeZone: 'UTC',
        durationMs: 1500000, pausedMs: 0, segments: [], status: 'completed',
      },
      startedAt: 2,
      endsAt: 302000,
      state: 'running',
    }
    mocks.app.rest.remainingMs = 180000
    const restRender = await mountTasksSSR()
    expect(restRender.html).toContain('休息中 · 返回休息')
    expect(restRender.html).toContain('休息中，结束后可开始')
    restRender.state.openFree()
    expect(mocks.app.notify).toHaveBeenCalledWith('休息中，结束后可开始')

    mocks.app.rest.session = null
    mocks.app.lock.session = {
      id: 'lock-1',
      configurationId: 'c1',
      title: '全天锁机',
      targetMs: 600000,
      startedAt: 1,
      strictMode: false,
      protection: { study: true, source: 'global', whitelist: [] },
    }
    const lockRender = await mountTasksSSR()
    expect(lockRender.html).toContain('锁机进行中 · 返回处理')
    expect(lockRender.html).toContain('锁机进行中，结束后可开始')
    expect(lockRender.html).toContain('aria-label="开始背单词" aria-disabled="true"')
    lockRender.state.openFree()
    expect(mocks.app.notify).toHaveBeenCalledWith('锁机进行中，结束后可开始')
  })

  it('disables move option when deleting the only theme that still has items', async () => {
    const onlyThemeDelete = await mountTasksSSR((s) => {
      s.openTheme(mocks.app.themes[0])
      s.removeTheme()
    })
    expect(onlyThemeDelete.html).toContain('没有其他主题可移入')
    expect(onlyThemeDelete.html).toContain('value="move" disabled')
    expect(onlyThemeDelete.html).toContain('一并删除这 2 个待办')
  })

  it('requires explicit choice when deleting theme with items and shows exact count on confirm button', async () => {
    mocks.app.themes.push({ id: 't2', name: '数学', color: '#698caa', order: 1, collapsed: false })
    mocks.app.items = Array.from({ length: 6 }, (_, idx) => ({
      id: `i${idx}`, themeId: 't1', title: `词表${idx}`, note: '', mode: 'countdown', minutes: 25, order: idx,
    }))

    const initialDelete = await mountTasksSSR((s) => {
      s.openTheme(mocks.app.themes[0])
      s.removeTheme()
    })
    expect(initialDelete.html).toContain('请选择待办的去向')
    expect(initialDelete.html).toContain('移到其他主题')
    expect(initialDelete.html).toContain('一并删除这 6 个待办')

    const confirmDelete = await mountTasksSSR((s) => {
      s.openTheme(mocks.app.themes[0])
      s.removeTheme()
      s.deleteChoice = 'delete'
    })
    expect(confirmDelete.html).toContain('删除主题和 6 个待办')
    expect(confirmDelete.html).toContain('这些待办的开始入口会消失')
    await confirmDelete.state.submitRemoveTheme()
    expect(mocks.app.removeTheme).toHaveBeenCalledWith('t1', null)

    const confirmMove = await mountTasksSSR((s) => {
      s.openTheme(mocks.app.themes[0])
      s.removeTheme()
      s.deleteChoice = 'move'
    })
    expect(confirmMove.html).toContain('删除主题，6 个待办移到「数学」')
    await confirmMove.state.submitRemoveTheme()
    expect(mocks.app.removeTheme).toHaveBeenCalledWith('t1', 't2')

    mocks.app.themes = [{ id: 't1', name: '英语', color: '#ef4e36', order: 0, collapsed: false }]
    mocks.app.items = []
    const emptyThemeDelete = await mountTasksSSR((s) => {
      s.openTheme(mocks.app.themes[0])
      s.removeTheme()
    })
    expect(emptyThemeDelete.html).not.toContain('移到其他主题')
    expect(emptyThemeDelete.html).toContain('>删除主题</button>')
    await emptyThemeDelete.state.submitRemoveTheme()
    expect(mocks.app.removeTheme).toHaveBeenCalledWith('t1', null)
  })
})
