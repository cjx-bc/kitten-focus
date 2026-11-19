import { createSSRApp, defineComponent, h, reactive, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProtection } from '../src/domain/model'

const mocks = vi.hoisted(() => ({ app: null as any, protection: vi.fn(), dnd: vi.fn(), notification: vi.fn(), recent: vi.fn(), launcher: vi.fn(), wallpaper: vi.fn(), prepareWallpaper: vi.fn(), requestNotifications: vi.fn() }))
vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('../src/platform/bridge', () => ({ native: false, requestNotifications: mocks.requestNotifications, protectionDriver: { status: mocks.protection, openSettings: vi.fn(), recentTasks: mocks.recent, launcher: mocks.launcher, wallpaper: mocks.wallpaper, prepareWallpaper: mocks.prepareWallpaper } }))
vi.mock('../src/platform/dnd', () => ({ dndDriver: { read: mocks.dnd, openSettings: vi.fn() } }))
vi.mock('../src/platform/notifications', () => ({ notificationDriver: { read: mocks.notification, openSettings: vi.fn() } }))

import StudyModeSheet from '../src/components/StudyModeSheet.vue'
import DndSetting from '../src/components/DndSetting.vue'
import NotificationSetting from '../src/components/NotificationSetting.vue'
import EnhancedProtectionSettings from '../src/components/EnhancedProtectionSettings.vue'
import AntiCloseSettings from '../src/components/AntiCloseSettings.vue'
import RecentTasksSetting from '../src/components/RecentTasksSetting.vue'
import LauncherSetting from '../src/components/LauncherSetting.vue'
import WallpaperSetting from '../src/components/WallpaperSetting.vue'

const cases = [
  ['study', StudyModeSheet, 'toggleStudy', { open: true }],
  ['dnd', DndSetting, 'toggle', {}],
  ['interceptNotifications', NotificationSetting, 'toggle', {}],
  ['navigationHomeRecents', EnhancedProtectionSettings, 'toggle', {}],
  ['preciseAntiClose', AntiCloseSettings, 'toggle', {}],
  ['recentTasksHidden', RecentTasksSetting, 'toggle', {}],
  ['launcherIconHidden', LauncherSetting, 'toggle', {}],
] as const
function selected(key: string) {
  const prefs = mocks.app.data.preferences.protection
  return key in prefs ? prefs[key] : prefs.enhancements.includes(key)
}
function setPermissions(authorized: boolean, connected = authorized) {
  const capability = { supported: true, authorized, connected, active: false, state: 'off', reason: '', identity: {} }
  mocks.protection.mockResolvedValue({ ...capability, effectiveWhitelist: [], navigation: capability, antiClose: capability })
  mocks.dnd.mockResolvedValue({ supported: true, permissionGranted: authorized, requested: false, phase: 'off' })
  mocks.notification.mockResolvedValue({ supported: true, authorized, connected, requested: false, phase: 'off' })
  mocks.recent.mockResolvedValue({ supported: true, recoveryAvailable: authorized, phase: 'off' })
  mocks.launcher.mockResolvedValue({ supported: true, recoveryAvailable: authorized, phase: 'off' })
}

async function setup(component: Component, props = {}) {
  const vnode = h(component, props)
  const app = createSSRApp({ render: () => vnode })
  app.component('RouterLink', defineComponent({ props: { to: String }, setup: (props, context) => () => h('a', { href: props.to }, context.slots.default?.()) }))
  await renderToString(app)
  const state = (vnode.component as any).setupState
  await state.refresh()
  return state
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.app = reactive({
    data: { preferences: { protection: defaultProtection() } }, focus: { session: null },
    notify: vi.fn(), mutate: vi.fn(async (change: any) => change(mocks.app.data)),
  })
  setPermissions(false)
  mocks.wallpaper.mockReset().mockResolvedValue({ supported: true, prepared: false, phase: 'off', current: {} })
})
describe('real protection component permission cancellation', () => {
  it.each([...cases, ['wallpaperProtection', WallpaperSetting, 'toggle', {}] as const])('%s is not saved before permission consent and stays off on cancellation', async (key, component, handler, props) => {
    const state = await setup(component, props)
    const target = { checked: true }
    await state[handler]({ target })
    expect(selected(key)).toBe(false)
    expect(target.checked).toBe(false)
    state.cancelEnable()
    expect(selected(key)).toBe(false)
    expect(mocks.app.mutate).not.toHaveBeenCalled()
  })
  it.each(cases)('%s stays off after returning without granting, including later unrelated grants', async (key, component, handler, props) => {
    const state = await setup(component, props)
    await state[handler]({ target: { checked: true } })
    state.enableGate.launch(); state.enableGate.leave(); state.enableGate.resume()
    await state.refresh()
    expect(selected(key)).toBe(false)
    setPermissions(true)
    await state.refresh()
    expect(selected(key)).toBe(false)
    expect(mocks.app.mutate).not.toHaveBeenCalled()
  })
  it.each(cases)('%s saves exactly once after requested permission is granted', async (key, component, handler, props) => {
    const state = await setup(component, props)
    await state[handler]({ target: { checked: true } })
    state.enableGate.launch(); state.enableGate.leave(); state.enableGate.resume()
    setPermissions(true)
    await state.refresh(); await state.refresh()
    expect(selected(key)).toBe(true)
    expect(mocks.app.mutate).toHaveBeenCalledTimes(1)
  })
  it.each(cases)('%s ignores late grant results after cancel or closing the permission prompt', async (key, component, handler, props) => {
    const state = await setup(component, props)
    await state[handler]({ target: { checked: true } })
    state.enableGate.launch(); state.cancelEnable()
    setPermissions(true)
    await state.refresh()
    expect(selected(key)).toBe(false)
    expect(mocks.app.mutate).not.toHaveBeenCalled()
  })
  it.each(cases)('%s can enable directly when already authorized; closing manual help preserves it', async (key, component, handler, props) => {
    setPermissions(true)
    const state = await setup(component, props)
    await state[handler]({ target: { checked: true } })
    expect(selected(key)).toBe(true)
    state.cancelEnable()
    expect(selected(key)).toBe(true)
  })
  it('does not enable wallpaper when baseline confirmation is incomplete or fails', async () => {
    const state = await setup(WallpaperSetting)
    await state.toggle({ target: { checked: true } })
    await state.prepare()
    expect(mocks.prepareWallpaper).not.toHaveBeenCalled()
    state.limitsAccepted = true; state.originalMatches = true
    mocks.prepareWallpaper.mockRejectedValueOnce(new Error('baseline failed'))
    await state.prepare()
    expect(selected('wallpaperProtection')).toBe(false)
    expect(mocks.app.mutate).not.toHaveBeenCalled()
  })
  it('enables wallpaper after the native baseline is saved even if a background read supersedes a refresh', async () => {
    const state = await setup(WallpaperSetting)
    await state.toggle({ target: { checked: true } })
    state.limitsAccepted = true; state.originalMatches = true
    const prepared = { supported: true, prepared: true, phase: 'baseline_ready', current: {} }
    mocks.prepareWallpaper.mockResolvedValueOnce(prepared)
    mocks.wallpaper.mockResolvedValue(prepared)
    let resolveRead: ((status: typeof prepared) => void) | undefined
    mocks.wallpaper.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve }))
    const preparing = state.prepare()
    await Promise.resolve()
    const backgroundRead = state.refresh()
    resolveRead?.(prepared)
    await Promise.all([preparing, backgroundRead])
    expect(selected('wallpaperProtection')).toBe(true)
    expect(mocks.app.mutate).toHaveBeenCalledTimes(1)
    expect(state.consentOpen).toBe(false)
    expect(state.error).toBe('')
  })
  it('keeps the prepared wallpaper status when a read started before saving returns late', async () => {
    const state = await setup(WallpaperSetting)
    await state.toggle({ target: { checked: true } })
    state.limitsAccepted = true; state.originalMatches = true
    const unprepared = { supported: true, prepared: false, phase: 'off', current: {} }
    const prepared = { ...unprepared, prepared: true, phase: 'baseline_ready' }
    let resolveRead!: (status: typeof unprepared) => void
    mocks.wallpaper.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve }))
    mocks.prepareWallpaper.mockResolvedValueOnce(prepared)
    const lateRead = state.refresh()
    await state.prepare()
    resolveRead(unprepared)
    await lateRead
    expect(state.status).toEqual(prepared)
    expect(selected('wallpaperProtection')).toBe(true)
  })
  it.each([
    ['study', StudyModeSheet, 'toggleStudy', { open: true }],
    ['interceptNotifications', NotificationSetting, 'toggle', {}],
    ['navigationHomeRecents', EnhancedProtectionSettings, 'toggle', {}],
    ['preciseAntiClose', AntiCloseSettings, 'toggle', {}],
  ] as const)('%s waits for a delayed service connection after authorization', async (key, component, handler, props) => {
    const state = await setup(component, props)
    await state[handler]({ target: { checked: true } })
    state.enableGate.launch(); state.enableGate.leave(); state.enableGate.resume()
    setPermissions(true, false)
    await state.refresh()
    expect(selected(key)).toBe(false)
    expect(state.enableGate.pending.value).toBe(true)
    setPermissions(true, true)
    await state.refresh()
    expect(selected(key)).toBe(true)
    expect(mocks.app.mutate).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['recentTasksHidden', RecentTasksSetting], ['launcherIconHidden', LauncherSetting],
  ] as const)('%s stays off when the native notification permission prompt is denied', async (key, component) => {
    const state = await setup(component)
    await state.toggle({ target: { checked: true } })
    mocks.requestNotifications.mockResolvedValueOnce(undefined)
    await state.authorize()
    expect(selected(key)).toBe(false)
    expect(state.enableGate.pending.value).toBe(false)
    expect(mocks.app.mutate).not.toHaveBeenCalled()
  })
})
