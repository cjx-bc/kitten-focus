import { createSSRApp, defineComponent, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPeriods, defaultProtection } from '../src/domain/model'
import { toggleMasterStudy, toggleProtectionModule } from '../src/domain/protectionModules'

const mocks = vi.hoisted(() => ({
  app: null as any,
  router: { push: vi.fn(), replace: vi.fn() },
  protection: vi.fn(),
  diagnostics: vi.fn(),
}))

vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router }))
vi.mock('../src/platform/bridge', () => ({
  native: true,
  protectionDriver: {
    status: mocks.protection,
    apps: vi.fn(async () => []),
  },
}))
vi.mock('../src/platform/protectionDiagnostics', () => ({
  readProtectionDiagnostics: (...args: unknown[]) => mocks.diagnostics(...args),
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
  mocks.diagnostics.mockResolvedValue({ capabilities: [] })
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
    mutate: vi.fn(async (change: any) => change(mocks.app.data)),
    clearUnreadyProtections: vi.fn(async () => {}),
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

    const emptyItemSheet = await mountTasksSSR((s) => {
      s.openItem('')
    })
    expect(emptyItemSheet.state.newThemeName).toBe('日常学习')
    expect(emptyItemSheet.html).toContain('日常学习')
    expect(emptyItemSheet.html).toContain('保存并开始')

    emptyItemSheet.state.newThemeName = '英语'
    emptyItemSheet.state.itemForm.title = '背单词'
    await emptyItemSheet.state.submitItem()
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

  it('orders duration before collapsed application whitelist in item sheet, switches to single-sheet whitelist view, and cleans global choice', async () => {
    const { state, html } = await mountTasksSSR((s) => {
      s.openItem('t1')
    })

    const durationIdx = html.indexOf('专注时长（分钟）')
    const moreIdx = html.indexOf('class="more-settings"')
    const whitelistIdx = html.indexOf('id="item-whitelist-panel"')
    expect(state.itemMoreExpanded).toBe(false)
    expect(html).not.toMatch(/<details[^>]*class="more-settings"[^>]*\bopen\b/)
    expect(durationIdx).toBeGreaterThan(-1)
    expect(moreIdx).toBeGreaterThan(durationIdx)
    expect(whitelistIdx).toBeGreaterThan(moreIdx)
    expect(html).not.toContain('规则说明')
    expect(html.slice(0, moreIdx)).not.toContain('<textarea')

    state.setItemWhitelist('custom')
    expect(state.itemForm.whitelist?.source).toBe('custom')
    state.openItemWhitelist()
    expect(state.sheet).toBe('itemWhitelist')
    state.onConfirmItemWhitelist(['com.reader'])
    expect(state.sheet).toBe('item')
    expect(state.itemForm.whitelist).toEqual({ source: 'custom', packages: ['com.reader'] })

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
    expect(focusRender.html).toContain('正在专注')
    expect(focusRender.html).toContain('进行中 · 返回专注')
    expect(focusRender.html).toContain('aria-label="开始练听力" aria-disabled="true"')
    expect(focusRender.html).not.toContain('blocker-hint')
    expect(focusRender.html).not.toContain('正在专注「背单词」，结束后可开始其他事项')

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
    expect(restRender.html).not.toContain('休息中，结束后可开始')
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
    expect(lockRender.html).not.toContain('锁机进行中，结束后可开始')
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

  it('renders single-zone anti-misclick study capsule across off, enabled, and warning states and opens StudyModeSheet', async () => {
    const offRender = await mountTasksSSR()
    expect(offRender.html).toContain('data-tone="off"')
    expect(offRender.html).toContain('aria-haspopup="dialog"')
    expect(offRender.html).toContain('aria-label="学霸模式未开启，点击开启或配置"')
    expect(offRender.html).toContain('>学霸模式 · 关<')
    expect(offRender.html).not.toContain('study-split')

    offRender.state.openStudyFromCapsule()
    expect(offRender.state.studyOpen).toBe(true)
    expect(offRender.state.studyInitialView).toBe('home')
    expect(mocks.app.mutate).not.toHaveBeenCalled()

    // Enabled state render opens home view
    mocks.app.data.preferences.protection = toggleMasterStudy(defaultProtection(), true)
    const onRender = await mountTasksSSR((s) => {
      s.protectionState = { supported: true, authorized: true, connected: true, active: false, state: 'off', reason: '', effectiveWhitelist: [] }
    })
    expect(onRender.html).toContain('data-tone="enabled"')
    expect(onRender.html).toContain('aria-label="学霸模式已开启，点击配置或关闭"')
    expect(onRender.html).toContain('学霸模式 · 开')

    onRender.state.openStudyFromCapsule()
    expect(onRender.state.studyOpen).toBe(true)
    expect(onRender.state.studyInitialView).toBe('home')

    // Warning state render opens permissions view
    const warnRender = await mountTasksSSR((s) => {
      s.protectionState = { supported: true, authorized: false, connected: false, active: false, state: 'off', reason: '', effectiveWhitelist: [] }
    })
    expect(warnRender.html).toContain('data-tone="warning"')
    expect(warnRender.html).toContain('aria-label="学霸模式待授权，点击处理权限"')
    expect(warnRender.html).toContain('学霸模式 · 待授权')

    warnRender.state.openStudyFromCapsule()
    expect(warnRender.state.studyOpen).toBe(true)
    expect(warnRender.state.studyInitialView).toBe('permissions')
  })

  it('uses saveAndStart as primary CTA for new items vs 仅保存, and falls back to 保存待办 when blocked or editing', async () => {
    const newItemRender = await mountTasksSSR((s) => {
      s.openItem('t1')
    })
    expect(newItemRender.html).toMatch(/<input[^>]*placeholder="例如：背单词"[^>]*autofocus/)
    expect(newItemRender.html).toMatch(/<button class="primary wide"[^>]*>保存并开始<\/button>/)
    expect(newItemRender.html).toMatch(/<button type="button" class="text-button"[^>]*>\s*仅保存\s*<\/button>/)

    newItemRender.state.itemForm.title = '精读'
    await newItemRender.state.submitItem(false)
    expect(mocks.app.saveItem).toHaveBeenCalledWith(expect.objectContaining({ title: '精读' }))
    expect(newItemRender.state.sheet).toBeNull()
    expect(mocks.app.start).not.toHaveBeenCalled()

    newItemRender.state.openItem('t1')
    newItemRender.state.itemForm.title = '默写'
    const saved = { id: newItemRender.state.itemForm.id, themeId: 't1', title: '默写', note: '', mode: 'countdown' as const, minutes: 25, order: 2 }
    mocks.app.saveItem.mockImplementationOnce(async () => {
      mocks.app.items.push(saved)
    })
    newItemRender.state.onItemFormSubmit()
    await vi.waitFor(() => expect(mocks.app.start).toHaveBeenCalledWith(saved))
    expect(mocks.router.push).toHaveBeenCalledWith('/focus')
    expect(newItemRender.state.sheet).toBeNull()

    const editRender = await mountTasksSSR((s) => {
      s.openItem('t1', mocks.app.items[0])
    })
    expect(editRender.html).toMatch(/<button class="primary wide"[^>]*>保存待办<\/button>/)
    expect(editRender.html).not.toContain('保存并开始')

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
    const blockedNewRender = await mountTasksSSR((s) => {
      s.openItem('t1')
    })
    expect(blockedNewRender.html).toContain('休息中，结束后可开始')
    expect(blockedNewRender.html).toMatch(/<button class="primary wide"[^>]*>保存待办<\/button>/)
    expect(blockedNewRender.html).not.toContain('保存并开始')
    expect(blockedNewRender.html).not.toContain('仅保存')
    blockedNewRender.state.itemForm.title = '复盘'
    blockedNewRender.state.onItemFormSubmit()
    await vi.waitFor(() => expect(mocks.app.saveItem).toHaveBeenCalledWith(expect.objectContaining({ title: '复盘' })))
    expect(mocks.app.start).toHaveBeenCalledTimes(1)
  })

  it('renders inline item delete confirmation without nested dialogs and removes item on confirm', async () => {
    const initialEdit = await mountTasksSSR((s) => {
      s.openItem('t1', mocks.app.items[0])
    })
    expect(initialEdit.html).toContain('删除待办')
    expect(initialEdit.html).not.toContain('确认删除？历史专注记录仍保留。')
    expect((initialEdit.html.match(/<dialog\b/g) ?? []).length).toBeLessThanOrEqual(1)

    const confirmEdit = await mountTasksSSR((s) => {
      s.openItem('t1', mocks.app.items[0])
      s.itemDeleteConfirm = true
    })
    expect(confirmEdit.html).toContain('aria-label="确认删除待办"')
    expect(confirmEdit.html).toContain('确认删除？历史专注记录仍保留。')
    expect(confirmEdit.html).toContain('确认删除')
    expect((confirmEdit.html.match(/<dialog\b/g) ?? []).length).toBeLessThanOrEqual(1)

    await confirmEdit.state.confirmDeleteItem()
    expect(mocks.app.removeItem).toHaveBeenCalledWith('i1')
    expect(confirmEdit.state.itemDeleteConfirm).toBe(false)
    expect(confirmEdit.state.sheet).toBeNull()
  })

  it('handles startError recovery for protection, recovery route, startFree sheet-first close, and cancelled strict start', async () => {
    const { state } = await mountTasksSSR()

    // Cancelled strict start stays silent without opening startError
    mocks.app.start.mockRejectedValueOnce(new Error('已取消开始专注'))
    await state.begin(mocks.app.items[0])
    expect(state.sheet).toBeNull()
    expect(state.startError).toBeNull()

    // Recovery error routes to /recovery
    mocks.app.start.mockRejectedValueOnce(new Error('存在待恢复项目，请先完成故障恢复'))
    await state.begin(mocks.app.items[0])
    expect(state.sheet).toBe('startError')
    expect(state.startError?.kind).toBe('recovery')
    const recoveryModal = await mountTasksSSR((s) => {
      s.startError = { message: '存在待恢复项目，请先完成故障恢复', kind: 'recovery', item: mocks.app.items[0] }
      s.sheet = 'startError'
    })
    expect(recoveryModal.html).toContain('前往故障恢复')
    await state.goRecoveryFromStartError()
    expect(state.sheet).toBeNull()
    expect(state.startError).toBeNull()
    expect(mocks.router.push).toHaveBeenCalledWith('/recovery')

    // Protection error supports opening StudyModeSheet or clearing unready protections and retrying
    mocks.app.data.preferences.protection = toggleMasterStudy(
      toggleProtectionModule(defaultProtection(), 'apps', true),
      true,
    )
    mocks.app.start.mockRejectedValueOnce(new Error('无障碍权限未授权，请开启后重试'))
    await state.begin(mocks.app.items[0])
    expect(state.sheet).toBe('startError')
    expect(state.startError?.kind).toBe('protection')

    const protectionModal = await mountTasksSSR((s) => {
      s.startError = { message: '无障碍权限未授权，请开启后重试', kind: 'protection', item: mocks.app.items[0] }
      s.sheet = 'startError'
    })
    expect(protectionModal.html).toContain('前往学霸模式处理')
    expect(protectionModal.html).toContain('关闭未就绪保护并开始')

    mocks.diagnostics.mockResolvedValueOnce({
      capabilities: [{ id: 'applications', selected: true, supported: true, authorized: false, connected: false }],
    })
    mocks.app.start.mockResolvedValueOnce(undefined)
    await state.clearUnreadyAndRetry()
    expect(mocks.app.clearUnreadyProtections).toHaveBeenCalledWith(['applications'], true)
    expect(mocks.app.start).toHaveBeenLastCalledWith(mocks.app.items[0])
    expect(state.sheet).toBeNull()
    expect(mocks.router.push).toHaveBeenCalledWith('/focus')

    // startFree closes sheet before invoking app.start and shows startError on failure
    state.openFree()
    expect(state.sheet).toBe('free')
    let sheetDuringStart: unknown = 'not-run'
    mocks.app.start.mockImplementationOnce(async () => {
      sheetDuringStart = state.sheet
      throw new Error('无障碍服务未连接')
    })
    await state.startFree()
    expect(sheetDuringStart).toBeNull()
    expect(state.sheet).toBe('startError')
    expect(state.startError?.kind).toBe('protection')

    await state.openStudyFromStartError()
    expect(state.sheet).toBeNull()
    expect(state.studyOpen).toBe(true)
    expect(state.studyInitialView).toBe('permissions')
  })
})
