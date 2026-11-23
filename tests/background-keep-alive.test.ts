import { createSSRApp, defineComponent, h, reactive, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProtection } from '../src/domain/model'
import { collectRequiredPermissions } from '../src/domain/studyPermissions'
import { protectionHelpSections } from '../src/content/protectionHelp'

const mocks = vi.hoisted(() => ({
  app: null as any,
  router: { push: vi.fn(), replace: vi.fn() },
  permissionStatus: vi.fn(),
  openBatteryOptimizationSettings: vi.fn(),
  protectionStatus: vi.fn(),
  recentTasks: vi.fn(),
  launcher: vi.fn(),
  wallpaper: vi.fn(),
  observeControl: vi.fn(),
  previewRecovery: vi.fn(),
  dndRead: vi.fn(),
  notificationRead: vi.fn(),
}))

vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router, useRoute: () => ({ path: '/permissions', hash: '' }) }))
vi.mock('../src/platform/bridge', () => ({
  native: true,
  permissionStatus: mocks.permissionStatus,
  openBatteryOptimizationSettings: mocks.openBatteryOptimizationSettings,
  requestNotifications: vi.fn(),
  openAlarmSettings: vi.fn(),
  exportFile: vi.fn(),
  importNativeFile: vi.fn(),
  controlDriver: { observe: mocks.observeControl },
  recoveryDriver: { preview: mocks.previewRecovery, confirm: vi.fn() },
  protectionDriver: {
    status: mocks.protectionStatus,
    openSettings: vi.fn(),
    recentTasks: mocks.recentTasks,
    launcher: mocks.launcher,
    wallpaper: mocks.wallpaper,
    prepareWallpaper: vi.fn(),
    importWallpaperOriginal: vi.fn(),
    apps: vi.fn(async () => []),
  },
}))
vi.mock('../src/platform/dnd', () => ({
  dndDriver: { read: mocks.dndRead, openSettings: vi.fn(), restore: vi.fn() },
}))
vi.mock('../src/platform/notifications', () => ({
  notificationDriver: { read: mocks.notificationRead, openSettings: vi.fn(), rebind: vi.fn() },
}))

import StudyModeSheet from '../src/components/StudyModeSheet.vue'
import ProtectionDiagnostics from '../src/components/ProtectionDiagnostics.vue'

async function mountSSR(component: Component, props = {}) {
  const createAppWithStubs = () => {
    const vnode = h(component, props)
    const app = createSSRApp({ render: () => vnode })
    app.component(
      'RouterLink',
      defineComponent({
        props: { to: String },
        setup: (p, ctx) => () => h('a', { href: p.to }, ctx.slots.default?.()),
      }),
    )
    return { app, vnode }
  }
  const first = createAppWithStubs()
  const html = await renderToString(first.app)
  const state = (first.vnode.component as any).setupState
  if (typeof state?.refresh === 'function') await state.refresh()
  const htmlAfterRefresh = await renderToString(createAppWithStubs().app)
  return { state, html, htmlAfterRefresh }
}

describe('background keep-alive & battery optimization UI hygiene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const cap = { supported: true, authorized: true, connected: true, active: false, state: 'off', reason: '', identity: {} }
    mocks.protectionStatus.mockResolvedValue({ ...cap, effectiveWhitelist: [], navigation: cap, antiClose: cap })
    mocks.dndRead.mockResolvedValue({ supported: true, permissionGranted: true, requested: false, phase: 'off' })
    mocks.notificationRead.mockResolvedValue({
      supported: true, authorized: true, connected: true, requested: false, active: false, phase: 'off',
      pendingCount: 0, snoozedCount: 0, restoredCount: 0, absentCount: 0, releaseFailedCount: 0, error: '', reason: '',
    })
    mocks.recentTasks.mockResolvedValue({ supported: true, requested: false, active: false, verified: false, phase: 'off', recoveryPending: false, recoveryAvailable: true, error: '' })
    mocks.launcher.mockResolvedValue({ supported: true, requested: false, active: false, verified: false, phase: 'off', recoveryPending: false, recoveryAvailable: true, error: '' })
    mocks.wallpaper.mockResolvedValue({ supported: true, prepared: true, phase: 'off', selected: false, active: false, verified: false, recoveryPending: false, current: {} })
    mocks.observeControl.mockResolvedValue({ owner: null, focus: { session: null }, rest: { session: null }, needsReconcile: false, mainEntry: { requested: false, active: false, withdrawn: false } })
    mocks.previewRecovery.mockResolvedValue({ supported: true, revision: '1', pending: false, steps: [] })
    mocks.permissionStatus.mockResolvedValue({
      notifications: true,
      exactAlarms: true,
      batteryOptimizationIgnored: false,
      foregroundServiceActive: false,
    })
    mocks.app = reactive({
      data: {
        preferences: {
          protection: defaultProtection(),
        },
      },
      focus: { session: null },
      lock: { session: null },
      mutate: vi.fn(),
      notify: vi.fn(),
    })
  })

  it('keeps battery optimization out of required study permissions (zero blocking/panic)', () => {
    const required = collectRequiredPermissions(defaultProtection(), {
      protection: {
        supported: true, authorized: true, connected: true, active: false,
        preferenceEnabled: false, state: 'off', reason: '', effectiveWhitelist: [],
      },
      dnd: null,
      notification: null,
      recentTasks: null,
      launcher: null,
      wallpaper: null,
    })
    expect(required).toEqual([])
  })

  it('renders calm optional battery card in StudyModeSheet permissions view without required red badge', async () => {
    const { html, state } = await mountSSR(StudyModeSheet, { open: true, initialView: 'permissions' })
    expect(html).toContain('后台运行不限制')
    expect(html).toContain('未放行 · 可选')
    expect(html).toContain('perm-state')
    expect(html).not.toContain('perm-badge required')
    await state.openBatteryKeepAlive()
    expect(mocks.openBatteryOptimizationSettings).toHaveBeenCalledTimes(1)
  })

  it('renders standalone backgroundKeepAlive card in ProtectionDiagnostics', async () => {
    const { html } = await mountSSR(ProtectionDiagnostics)
    expect(html).toContain('data-capability="backgroundKeepAlive"')
    expect(html).toContain('后台运行与电池优化')
    expect(html).toContain('电池优化白名单')
    expect(html).toContain('专注保活服务')
  })

  it('includes scannable OEM keep-alive steps for 5 phone families in offline help', () => {
    const section = protectionHelpSections.find((item) => item.id === 'keepalive')
    expect(section).toBeDefined()
    expect(section?.title).toBe('后台保活与各品牌设置')
    expect(section?.steps).toHaveLength(5)
    expect(section?.steps?.map((s) => s.brand).join(' ')).toContain('小米')
    expect(section?.steps?.map((s) => s.brand).join(' ')).toContain('OPPO')
  })
})
