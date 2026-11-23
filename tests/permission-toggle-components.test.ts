import { createSSRApp, defineComponent, h, reactive, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProtection } from '../src/domain/model'
import { toggleMasterStudy, toggleProtectionModule } from '../src/domain/protectionModules'

const mocks = vi.hoisted(() => ({
  app: null as any,
  router: { push: vi.fn(), replace: vi.fn() },
  protection: vi.fn(),
  protectionOpenSettings: vi.fn(),
  dnd: vi.fn(),
  dndOpenSettings: vi.fn(),
  dndRestore: vi.fn(),
  notification: vi.fn(),
  notificationOpenSettings: vi.fn(),
  notificationRebind: vi.fn(),
  recent: vi.fn(),
  launcher: vi.fn(),
  wallpaper: vi.fn(),
  prepareWallpaper: vi.fn(),
  importWallpaperOriginal: vi.fn(),
  apps: vi.fn(),
  requestNotifications: vi.fn(),
}))

vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router }))
vi.mock('../src/platform/bridge', () => ({
  native: false,
  requestNotifications: mocks.requestNotifications,
  permissionStatus: vi.fn(async () => ({
    notifications: false,
    exactAlarms: false,
    batteryOptimizationIgnored: false,
    foregroundServiceActive: false,
  })),
  openBatteryOptimizationSettings: vi.fn(),
  protectionDriver: {
    status: mocks.protection,
    openSettings: mocks.protectionOpenSettings,
    recentTasks: mocks.recent,
    launcher: mocks.launcher,
    wallpaper: mocks.wallpaper,
    prepareWallpaper: mocks.prepareWallpaper,
    importWallpaperOriginal: mocks.importWallpaperOriginal,
    apps: mocks.apps,
  },
}))
vi.mock('../src/platform/dnd', () => ({
  dndDriver: {
    read: mocks.dnd,
    openSettings: mocks.dndOpenSettings,
    restore: mocks.dndRestore,
  },
}))
vi.mock('../src/platform/notifications', () => ({
  notificationDriver: {
    read: mocks.notification,
    openSettings: mocks.notificationOpenSettings,
    rebind: mocks.notificationRebind,
  },
}))

import StudyModeSheet from '../src/components/StudyModeSheet.vue'
import DndSetting from '../src/components/DndSetting.vue'
import NotificationSetting from '../src/components/NotificationSetting.vue'

const pendingEnableCases = [
  ['dnd', DndSetting, 'toggle', {}],
  ['interceptNotifications', NotificationSetting, 'toggle', {}],
] as const

function selected(key: string) {
  const prefs = mocks.app.data.preferences.protection
  return key in prefs ? prefs[key] : prefs.enhancements.includes(key)
}

function setPermissions(authorized: boolean, connected = authorized, supported = true) {
  const capability = { supported, authorized, connected, active: false, state: 'off', reason: '', identity: {} }
  mocks.protection.mockResolvedValue({ ...capability, effectiveWhitelist: [], navigation: capability, antiClose: capability })
  mocks.dnd.mockResolvedValue({ supported, permissionGranted: authorized, requested: false, phase: 'off' })
  mocks.notification.mockResolvedValue({ supported, authorized, connected, requested: false, phase: 'off' })
  mocks.recent.mockResolvedValue({ supported, recoveryAvailable: authorized, phase: 'off' })
  mocks.launcher.mockResolvedValue({ supported, recoveryAvailable: authorized, phase: 'off' })
}

async function setup(component: Component, props: Record<string, unknown> = {}) {
  const vnode = h(component, props)
  const app = createSSRApp({ render: () => vnode })
  app.component(
    'RouterLink',
    defineComponent({
      props: { to: String },
      setup: (p, context) => () => h('a', { href: p.to }, context.slots.default?.()),
    }),
  )
  await renderToString(app)
  const state = (vnode.component as any).setupState
  await state.refresh()
  return state
}

async function renderSheet(props: Record<string, unknown> = {}, onBeforeRender?: (state: any) => void) {
  let setupState: any
  const vnode = h(StudyModeSheet, { open: true, ...props })
  const app = createSSRApp({ render: () => vnode })
  app.component(
    'RouterLink',
    defineComponent({
      props: { to: String },
      setup: (p, context) => () => h('a', { href: p.to }, context.slots.default?.()),
    }),
  )
  app.mixin({
    created() {
      const internal = (this as any).$
      if (internal?.type === StudyModeSheet) {
        setupState = internal.setupState
        onBeforeRender?.(setupState)
      }
    },
  })
  const html = await renderToString(app)
  const state = setupState ?? (vnode.component as any).setupState
  await state.refresh()
  return { state, html }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.app = reactive({
    data: { preferences: { protection: defaultProtection() } },
    focus: { session: null },
    lock: { session: null },
    notify: vi.fn(),
    mutate: vi.fn(async (change: any) => change(mocks.app.data)),
    acknowledgeStrict: vi.fn(),
    clearStrictAcknowledged: vi.fn(),
  })
  setPermissions(false)
  mocks.apps.mockReset().mockResolvedValue([])
  mocks.wallpaper.mockReset().mockResolvedValue({ supported: true, prepared: false, phase: 'off', current: {} })
  mocks.protectionOpenSettings.mockReset().mockResolvedValue(undefined)
  mocks.dndOpenSettings.mockReset().mockResolvedValue(undefined)
  mocks.notificationOpenSettings.mockReset().mockResolvedValue(undefined)
  mocks.notificationRebind.mockReset().mockResolvedValue(undefined)
  mocks.requestNotifications.mockReset().mockResolvedValue(undefined)
})

describe('DndSetting & NotificationSetting permission-enable gates', () => {
  it.each(pendingEnableCases)('%s is not saved before permission consent and stays off on cancellation', async (key, component, handler, props) => {
    const state = await setup(component, props)
    const target = { checked: true }
    await state[handler]({ target })
    expect(selected(key)).toBe(false)
    expect(target.checked).toBe(false)
    state.cancelEnable()
    expect(selected(key)).toBe(false)
    expect(mocks.app.mutate).not.toHaveBeenCalled()
  })

  it.each(pendingEnableCases)('%s stays off after returning without granting, including later unrelated grants', async (key, component, handler, props) => {
    const state = await setup(component, props)
    await state[handler]({ target: { checked: true } })
    state.enableGate.launch()
    state.enableGate.leave()
    state.enableGate.resume()
    await state.refresh()
    expect(selected(key)).toBe(false)
    setPermissions(true)
    await state.refresh()
    expect(selected(key)).toBe(false)
    expect(mocks.app.mutate).not.toHaveBeenCalled()
  })

  it.each(pendingEnableCases)('%s saves exactly once after requested permission is granted', async (key, component, handler, props) => {
    const state = await setup(component, props)
    await state[handler]({ target: { checked: true } })
    state.enableGate.launch()
    state.enableGate.leave()
    state.enableGate.resume()
    setPermissions(true)
    await state.refresh()
    await state.refresh()
    expect(selected(key)).toBe(true)
    expect(mocks.app.mutate).toHaveBeenCalledTimes(1)
  })

  it.each(pendingEnableCases)('%s ignores late grant results after cancel or closing the permission prompt', async (key, component, handler, props) => {
    const state = await setup(component, props)
    await state[handler]({ target: { checked: true } })
    state.enableGate.launch()
    state.cancelEnable()
    setPermissions(true)
    await state.refresh()
    expect(selected(key)).toBe(false)
    expect(mocks.app.mutate).not.toHaveBeenCalled()
  })

  it.each(pendingEnableCases)('%s can enable directly when already authorized; closing manual help preserves it', async (key, component, handler, props) => {
    setPermissions(true)
    const state = await setup(component, props)
    await state[handler]({ target: { checked: true } })
    expect(selected(key)).toBe(true)
    state.cancelEnable()
    expect(selected(key)).toBe(true)
  })

  it('interceptNotifications waits for a delayed service connection after authorization', async () => {
    const state = await setup(NotificationSetting)
    await state.toggle({ target: { checked: true } })
    state.enableGate.launch()
    state.enableGate.leave()
    state.enableGate.resume()
    setPermissions(true, false)
    await state.refresh()
    expect(selected('interceptNotifications')).toBe(false)
    expect(state.enableGate.pending.value).toBe(true)
    setPermissions(true, true)
    await state.refresh()
    expect(selected('interceptNotifications')).toBe(true)
    expect(mocks.app.mutate).toHaveBeenCalledTimes(1)
  })

  it('normalizes stale terminal phases when idle while preserving active-round withdrawal text', async () => {
    mocks.dnd.mockResolvedValue({ supported: true, permissionGranted: true, requested: false, recoveryPending: false, phase: 'withdrawn' })
    mocks.notification.mockResolvedValue({ supported: true, authorized: true, connected: true, requested: false, recoveryPending: false, phase: 'released' })
    expect((await setup(DndSetting)).phaseText).toBe('本轮未启用')
    expect((await setup(NotificationSetting)).phaseText).toBe('本轮未开启')

    mocks.app.data.preferences.protection = {
      ...defaultProtection(),
      dnd: true,
      interceptNotifications: true,
    }
    expect((await setup(DndSetting)).phaseText).toBe('已设置，等待下一轮')
    expect((await setup(NotificationSetting)).phaseText).toBe('已设置，等待下一轮')

    mocks.dnd.mockResolvedValue({ supported: true, permissionGranted: false, requested: false, recoveryPending: false, phase: 'restored' })
    mocks.notification.mockResolvedValue({ supported: true, authorized: false, connected: false, requested: false, recoveryPending: false, phase: 'released' })
    expect((await setup(DndSetting)).phaseText).toBe('未获勿扰授权，计时可继续')
    expect((await setup(NotificationSetting)).phaseText).toBe('通知访问未授权')

    mocks.dnd.mockResolvedValue({ supported: true, permissionGranted: true, requested: true, recoveryPending: false, phase: 'withdrawn' })
    mocks.notification.mockResolvedValue({ supported: true, authorized: true, connected: true, requested: true, recoveryPending: false, phase: 'withdrawn' })
    expect((await setup(DndSetting)).phaseText).toBe('本轮声音辅助已主动撤销')
    expect((await setup(NotificationSetting)).phaseText).toBe('本轮已停止新拦截')
  })
})

describe('StudyModeSheet single-layer 8-view stack & permission gates', () => {
  it('navigates across the single-layer 8-view stack without nested dialogs and routes cleanly', async () => {
    const { state, html } = await renderSheet()
    expect((html.match(/<dialog\b/g) ?? []).length).toBeLessThanOrEqual(1)
    expect(state.view).toBe('home')
    expect(state.sheetTitle).toBe('学霸模式')
    expect(state.backLabel).toBeUndefined()

    state.view = 'apps'
    expect(state.sheetTitle).toBe('应用限制')
    expect(state.backLabel).toBe('学霸模式')
    state.view = 'whitelist'
    expect(state.sheetTitle).toBe('全局白名单')
    expect(state.backLabel).toBe('应用限制')
    state.goBack()
    expect(state.view).toBe('apps')
    state.goBack()
    expect(state.view).toBe('home')

    state.view = 'strict'
    expect(state.sheetTitle).toBe('严格模式')
    expect(state.backLabel).toBe('学霸模式')
    state.view = 'wallpaperConsent'
    expect(state.sheetTitle).toBe('壁纸辅助保护说明')
    expect(state.backLabel).toBe('严格模式')
    state.goBack()
    expect(state.view).toBe('strict')
    state.goBack()
    expect(state.view).toBe('home')

    for (const [v, title] of [
      ['quiet', '免打扰'],
      ['permissions', '权限与使用帮助'],
      ['permissionGuide', '还差 3 项权限'],
    ] as const) {
      state.view = v
      expect(state.sheetTitle).toBe(title)
      expect(state.backLabel).toBe('学霸模式')
      state.goBack()
      expect(state.view).toBe('home')
    }
    setPermissions(true, true, true)
    await state.refresh()
    state.view = 'permissionGuide'
    expect(state.sheetTitle).toBe('权限与授权引导')

    const strictRender = await renderSheet({ initialView: 'strict' })
    expect(strictRender.html).toContain('倒计时不可暂停、不可提前结束')
    expect(strictRender.html).toContain('限制桌面与最近任务')
    expect(strictRender.html).toContain('精确防关闭')
    expect(strictRender.html).toContain('进阶防绕过（可能影响日常使用）')
    expect(strictRender.html).not.toMatch(/<details[^>]*class="advanced-disclosure"[^>]*\bopen\b/)

    const onClose = vi.fn()
    const order: string[] = []
    onClose.mockImplementation(() => order.push('close'))
    mocks.router.push.mockImplementationOnce(async () => { order.push('push') })
    const routeState = await setup(StudyModeSheet, { open: true, initialView: 'permissions', onClose })
    await routeState.openRoute('/permissions')
    expect(order).toEqual(['close', 'push'])
    expect(mocks.router.push).toHaveBeenCalledWith('/permissions')
  })

  it('toggleStudy saves master immediately on Android, initializes optional quiet defaults, and closes on turn-off', async () => {
    const onClose = vi.fn()
    setPermissions(false, false, false)
    const webState = await setup(StudyModeSheet, { open: true, onClose })
    const webTarget = { checked: true }
    await webState.toggleStudy({ target: webTarget })
    expect(webState.masterEnabled).toBe(false)
    expect(webTarget.checked).toBe(false)
    expect(mocks.app.mutate).not.toHaveBeenCalled()

    setPermissions(true, true, true)
    const state = await setup(StudyModeSheet, { open: true, onClose })
    await state.toggleStudy({ target: { checked: true } })
    expect(state.masterEnabled).toBe(true)
    expect(state.modules.apps.enabled).toBe(true)
    expect(state.modules.quiet.enabled).toBe(true)
    expect(state.quietSub.sound).toBe(true)
    expect(state.quietSub.intercept).toBe(true)
    expect(mocks.app.mutate).toHaveBeenCalledTimes(1)

    await state.toggleStudy({ target: { checked: false } })
    expect(state.masterEnabled).toBe(false)
    expect(mocks.app.clearStrictAcknowledged).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('toggleStudy surfaces missing permissions when unauthorized and can still turn off unsupported saved config', async () => {
    setPermissions(false, false, true)
    const state = await setup(StudyModeSheet, { open: true })
    await state.toggleStudy({ target: { checked: true } })
    expect(state.masterEnabled).toBe(true)
    expect(state.missingPermissions.some((p: any) => p.id === 'accessibility')).toBe(true)

    setPermissions(false, false, false)
    await state.refresh()
    const onClose = vi.fn()
    const savedUnsupported = await setup(StudyModeSheet, { open: true, onClose })
    await savedUnsupported.toggleStudy({ target: { checked: false } })
    expect(savedUnsupported.masterEnabled).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('guards Android-only module/subItem enables while letting strict noPauseEnd toggle and manage strictAcknowledged', async () => {
    setPermissions(false, false, false)
    const state = await setup(StudyModeSheet, { open: true })

    for (const mod of ['apps', 'quiet'] as const) {
      const target = { checked: true }
      await state.toggleModule(mod, { target })
      expect(state.modules[mod].enabled).toBe(false)
      expect(target.checked).toBe(false)
    }

    for (const [mod, sub] of [
      ['strict', 'hideRecents'],
      ['strict', 'hideLauncher'],
    ] as const) {
      const target = { checked: true }
      await state.toggleSubItem(mod, sub, { target })
      expect(target.checked).toBe(false)
    }
    expect(mocks.app.mutate).not.toHaveBeenCalled()

    // Previously enabled unsupported toggles can still be turned off, and re-enabling while unsupported is blocked
    for (const [mod, sub] of [
      ['apps', 'restrict'],
      ['apps', 'temporaryAccess'],
      ['strict', 'navigation'],
      ['strict', 'antiClose'],
      ['quiet', 'sound'],
      ['quiet', 'intercept'],
      ['quiet', 'whitelistPass'],
    ] as const) {
      if (state[`${mod}Sub`][sub]) {
        await state.toggleSubItem(mod, sub, { target: { checked: false } })
        expect(state[`${mod}Sub`][sub]).toBe(false)
      }
      const blockedTarget = { checked: true }
      await state.toggleSubItem(mod, sub, { target: blockedTarget })
      expect(blockedTarget.checked).toBe(false)
      expect(state[`${mod}Sub`][sub]).toBe(false)
    }
    mocks.app.mutate.mockClear()

    await state.toggleModule('strict', { target: { checked: true } })
    expect(state.modules.strict.enabled).toBe(true)
    expect(mocks.app.acknowledgeStrict).toHaveBeenCalledTimes(1)
    expect(mocks.app.notify).toHaveBeenCalledWith('开启后倒计时不可中途暂停或提前结束，正计时不受影响')

    await state.toggleSubItem('strict', 'noPauseEnd', { target: { checked: false } })
    expect(state.strictSub.noPauseEnd).toBe(false)
    expect(mocks.app.clearStrictAcknowledged).toHaveBeenCalledTimes(1)

    await state.toggleSubItem('strict', 'noPauseEnd', { target: { checked: true } })
    expect(state.strictSub.noPauseEnd).toBe(true)
    expect(mocks.app.acknowledgeStrict).toHaveBeenCalledTimes(2)

    setPermissions(false, false, true)
    await state.refresh()
    await state.toggleStudy({ target: { checked: true } })
    await state.toggleModule('apps', { target: { checked: true } })
    await state.toggleSubItem('strict', 'navigation', { target: { checked: true } })
    await state.toggleSubItem('strict', 'antiClose', { target: { checked: true } })
    await state.toggleSubItem('strict', 'hideRecents', { target: { checked: true } })
    await state.toggleSubItem('strict', 'hideLauncher', { target: { checked: true } })
    expect(state.modules.apps.enabled).toBe(true)
    expect(state.strictSub.navigation).toBe(true)
    expect(state.strictSub.antiClose).toBe(true)
    expect(state.strictSub.hideRecents).toBe(true)
    expect(state.strictSub.hideLauncher).toBe(true)
    expect(selected('navigationHomeRecents')).toBe(true)
    expect(selected('preciseAntiClose')).toBe(true)
    expect(selected('recentTasksHidden')).toBe(true)
    expect(selected('launcherIconHidden')).toBe(true)
    expect(state.strictMissingPermissions.map((p: any) => p.id)).toContain('accessibility')
  })

  it('routes strict.wallpaper through wallpaperConsent baseline gate and handles async refresh races', async () => {
    setPermissions(true, true, true)
    mocks.app.data.preferences.protection = toggleMasterStudy(
      toggleProtectionModule(defaultProtection(), 'strict', true),
      true,
    )
    const state = await setup(StudyModeSheet, { open: true, initialView: 'strict' })

    const target = { checked: true }
    await state.toggleSubItem('strict', 'wallpaper', { target })
    expect(target.checked).toBe(false)
    expect(state.strictSub.wallpaper).toBe(false)
    expect(selected('wallpaperProtection')).toBe(false)
    expect(state.view).toBe('wallpaperConsent')
    expect(mocks.app.mutate).not.toHaveBeenCalled()

    await state.prepareWallpaperBaseline()
    expect(mocks.prepareWallpaper).not.toHaveBeenCalled()

    state.limitsAccepted = true
    state.originalMatches = true
    mocks.prepareWallpaper.mockRejectedValueOnce(new Error('baseline failed'))
    await state.prepareWallpaperBaseline()
    expect(state.strictSub.wallpaper).toBe(false)
    expect(selected('wallpaperProtection')).toBe(false)
    expect(state.error).toBe('baseline failed')
    expect(mocks.app.mutate).not.toHaveBeenCalled()

    const prepared = { supported: true, prepared: true, phase: 'baseline_ready', current: {} }
    mocks.prepareWallpaper.mockResolvedValueOnce(prepared)
    let resolveRead!: (status: typeof prepared) => void
    mocks.wallpaper.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve }))
    const preparing = state.prepareWallpaperBaseline()
    await Promise.resolve()
    const backgroundRead = state.refresh()
    resolveRead(prepared)
    await Promise.all([preparing, backgroundRead])
    expect(state.strictSub.wallpaper).toBe(true)
    expect(selected('wallpaperProtection')).toBe(true)
    expect(mocks.app.mutate).toHaveBeenCalledTimes(1)
    expect(state.view).toBe('strict')
    expect(state.error).toBe('')

    // Late read started before saving must not overwrite prepared wallpaper status
    mocks.app.data.preferences.protection = toggleMasterStudy(
      toggleProtectionModule(defaultProtection(), 'strict', true),
      true,
    )
    const unprepared = { supported: true, prepared: false, phase: 'off', current: {} }
    let resolveStaleRead!: (status: typeof unprepared) => void
    mocks.wallpaper.mockImplementationOnce(() => new Promise((resolve) => { resolveStaleRead = resolve }))
    mocks.prepareWallpaper.mockResolvedValueOnce(prepared)
    state.view = 'wallpaperConsent'
    state.limitsAccepted = true
    state.originalMatches = true
    const lateRead = state.refresh()
    await state.prepareWallpaperBaseline()
    resolveStaleRead(unprepared)
    await lateRead
    expect(state.wallpaperStatus).toEqual(prepared)
    expect(state.strictSub.wallpaper).toBe(true)
    expect(selected('wallpaperProtection')).toBe(true)
  })

  it('auto-enables optional quiet sub-items only when pending guide grant finishes, waiting for listener connection', async () => {
    setPermissions(false, false, true)
    const state = await setup(StudyModeSheet, { open: true })
    await state.toggleStudy({ target: { checked: true } })
    state.view = 'permissionGuide'
    mocks.app.mutate.mockClear()

    expect(state.modules.quiet.enabled).toBe(false)
    expect(state.quietSub.sound).toBe(false)
    expect(state.quietSub.intercept).toBe(false)

    await state.authorizePermission('dnd', true)
    expect(state.pendingOptionalGrant).toBe('dnd')
    expect(state.modules.quiet.enabled).toBe(false)
    expect(selected('dnd')).toBe(false)

    mocks.dnd.mockResolvedValue({ supported: true, permissionGranted: true, requested: false, phase: 'off' })
    await state.refresh()
    expect(state.pendingOptionalGrant).toBeNull()
    expect(state.modules.quiet.enabled).toBe(true)
    expect(state.quietSub.sound).toBe(true)
    expect(selected('dnd')).toBe(true)
    expect(mocks.app.mutate).toHaveBeenCalledTimes(1)

    await state.authorizePermission('notificationListener', true)
    expect(state.pendingOptionalGrant).toBe('notificationListener')
    mocks.notification.mockResolvedValue({ supported: true, authorized: true, connected: false, requested: false, phase: 'disconnected' })
    await state.refresh()
    expect(selected('interceptNotifications')).toBe(false)
    expect(state.pendingOptionalGrant).toBe('notificationListener')

    // Reconnect path when authorized && !connected
    await state.authorizePermission('notificationListener')
    expect(mocks.notificationRebind).toHaveBeenCalledTimes(1)
    expect(mocks.notificationOpenSettings).toHaveBeenCalledTimes(1)

    mocks.notification.mockResolvedValue({ supported: true, authorized: true, connected: true, requested: false, phase: 'off' })
    await state.refresh()
    expect(state.pendingOptionalGrant).toBeNull()
    expect(state.quietSub.intercept).toBe(true)
    expect(selected('interceptNotifications')).toBe(true)
    expect(mocks.app.mutate).toHaveBeenCalledTimes(2)
  })

  it('saves whitelist back to apps view and resets module defaults cleanly', async () => {
    setPermissions(true, true, true)
    const state = await setup(StudyModeSheet, { open: true, initialView: 'whitelist' })
    await state.saveApps(['com.reader'])
    expect(state.prefs.globalWhitelist).toEqual(['com.reader'])
    expect(state.view).toBe('apps')

    await state.toggleModule('strict', { target: { checked: true } })
    await state.toggleSubItem('strict', 'hideRecents', { target: { checked: true } })
    await state.toggleSubItem('strict', 'noPauseEnd', { target: { checked: false } })
    expect(state.strictSub.hideRecents).toBe(true)
    expect(state.strictSub.noPauseEnd).toBe(false)

    await state.resetModule('strict')
    expect(state.strictSub.hideRecents).toBe(false)
    expect(state.strictSub.noPauseEnd).toBe(true)
    expect(mocks.app.notify).toHaveBeenCalledWith('已恢复推荐默认')
    expect(mocks.app.acknowledgeStrict).toHaveBeenCalled()

    await state.toggleModule('strict', { target: { checked: false } })
    await state.resetModule('strict')
    expect(mocks.app.clearStrictAcknowledged).toHaveBeenCalled()
  })
})
