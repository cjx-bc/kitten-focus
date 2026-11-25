import { createSSRApp, defineComponent, h, reactive, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProtection } from '../src/domain/model'
import { setProtectionSubItem, toggleMasterStudy, toggleProtectionModule } from '../src/domain/protectionModules'

const mocks = vi.hoisted(() => ({
  app: null as any,
  router: { push: vi.fn(), replace: vi.fn() },
  guide: vi.fn(),
  adminStatus: vi.fn(),
  adminDeactivate: vi.fn(),
  protectionStatus: vi.fn(),
  recoveryPreview: vi.fn(),
}))

vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router, useRoute: () => ({ path: '/permissions', hash: '' }) }))
vi.mock('../src/platform/bridge', () => ({
  native: true,
  permissionStatus: vi.fn(async () => ({
    notifications: true,
    exactAlarms: true,
    batteryOptimizationIgnored: false,
    foregroundServiceActive: false,
  })),
  openBatteryOptimizationSettings: vi.fn(),
  requestNotifications: vi.fn(),
  openAlarmSettings: vi.fn(),
  exportFile: vi.fn(),
  importNativeFile: vi.fn(),
  syncFocusOverlayState: vi.fn(),
  onNativeOverlayEvent: vi.fn(async () => () => {}),
  keepAliveDriver: {
    guide: mocks.guide,
    openSettings: vi.fn(async () => true),
  },
  deviceAdminDriver: {
    status: mocks.adminStatus,
    requestActivation: vi.fn(async () => true),
    deactivate: mocks.adminDeactivate,
  },
  recoveryDriver: {
    preview: mocks.recoveryPreview,
    confirm: vi.fn(),
  },
  protectionDriver: {
    status: mocks.protectionStatus,
    openSettings: vi.fn(),
    recentTasks: vi.fn(async () => ({ supported: true, requested: false, active: false, phase: 'off' })),
    launcher: vi.fn(async () => ({ supported: true, requested: false, active: false, phase: 'off' })),
    wallpaper: vi.fn(async () => ({ supported: true, prepared: true, phase: 'off', current: {} })),
    prepareWallpaper: vi.fn(),
    importWallpaperOriginal: vi.fn(),
    apps: vi.fn(async () => []),
  },
}))
vi.mock('../src/platform/dnd', () => ({
  dndDriver: { read: vi.fn(async () => ({ supported: true, permissionGranted: true })), openSettings: vi.fn(), restore: vi.fn() },
}))
vi.mock('../src/platform/notifications', () => ({
  notificationDriver: { read: vi.fn(async () => ({ supported: true, authorized: true, connected: true })), openSettings: vi.fn(), rebind: vi.fn() },
}))

import StudyModeSheet from '../src/components/StudyModeSheet.vue'
import RecoverySheet from '../src/components/RecoverySheet.vue'

async function renderComponent(component: Component, props: Record<string, unknown>) {
  let state: any
  const vnode = h(component, props)
  const app = createSSRApp({ render: () => vnode })
  app.mixin({
    async serverPrefetch() {
      const internal = (this as any).$
      if (internal?.type === component) {
        state = internal.setupState
        if (typeof state?.refresh === 'function') await state.refresh()
        if (typeof state?.loadPreview === 'function') await state.loadPreview()
      }
    },
  })
  app.component(
    'RouterLink',
    defineComponent({
      props: { to: String },
      setup: (p, ctx) => () => h('a', { href: p.to }, ctx.slots.default?.()),
    }),
  )
  const rendered = await renderToString(app)
  return { state: state ?? (vnode.component as any)?.setupState, html: rendered }
}

describe('keep-alive guide view & device admin recovery integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let p = toggleMasterStudy(defaultProtection(), true, { quietDefault: false })
    p = toggleProtectionModule(p, 'strict', true)
    p = setProtectionSubItem(p, 'strict', 'hideRecents', true)
    mocks.app = reactive({
      data: { preferences: { protection: p }, items: [], lockConfigurations: [] },
      focus: { session: null },
      lock: { session: null },
      strictAcknowledged: true,
      notify: vi.fn(),
      mutate: vi.fn(),
      acknowledgeStrict: vi.fn(),
      clearStrictAcknowledged: vi.fn(),
    })
    mocks.protectionStatus.mockResolvedValue({
      supported: true,
      authorized: true,
      connected: true,
      active: false,
      state: 'ready',
      reason: '',
      effectiveWhitelist: [],
      navigation: { supported: true, authorized: true, connected: true, state: 'ready', identity: {} },
      antiClose: { supported: true, authorized: true, connected: true, state: 'ready', identity: {} },
    })
    mocks.guide.mockResolvedValue({
      brand: 'oppo',
      brandLabel: 'OPPO / 一加 / realme（ColorOS）',
      foregroundServiceActive: false,
      batteryOptimizationIgnored: false,
      hasAutoStartSurface: true,
      autoStartHint: '在「应用信息 → 耗电管理」开启允许完全后台行为',
      recentLockHint: '上滑悬停进入最近任务 → 点击锁定',
      hideRecentsConflict: true,
    })
    mocks.adminStatus.mockResolvedValue({
      supported: true,
      active: true,
      preferenceEnabled: true,
      state: 'active',
      reason: '防卸载保护已开启',
    })
    mocks.adminDeactivate.mockResolvedValue({
      supported: true,
      active: false,
      preferenceEnabled: false,
      state: 'off',
      reason: '防卸载保护未开启',
    })
    mocks.recoveryPreview.mockResolvedValue({ supported: true, revision: 'rev-1', pending: false, steps: [] })
  })

  it('renders 4-step keepAliveGuide inside the single Sheet without nested dialogs or forbidden strings', async () => {
    const { html } = await renderComponent(StudyModeSheet, { open: true, initialView: 'keepAliveGuide' })

    expect(html).toContain('OPPO / 一加 / realme（ColorOS）')
    expect(html).toContain('1. 专注进行中前台提醒保活')
    expect(html).toContain('2. 允许后台运行与电池优化白名单')
    expect(html).toContain('3. 允许本机自启动管理')
    expect(html).toContain('4. 在最近任务中锁定小猫卡片')
    expect(html).toContain('隐藏最近任务卡片')
    expect(html.match(/<dialog\b/g)?.length ?? 0).toBe(1)

    for (const forbidden of [
      'ordinaryAdmin',
      'deviceOwner',
      'profileOwner',
      'strictSettingsGuard',
      'deviceAdminAntiUninstall',
      'rebootResumeLock',
      'studyLocked',
      'needsReconcile',
    ]) {
      expect(html).not.toContain(forbidden)
    }
  })

  it('shows one-tap device admin deactivation in RecoverySheet when active', async () => {
    const { state, html } = await renderComponent(RecoverySheet, { open: true, inline: true })
    expect(html).toContain('防卸载保护（设备管理器） · 已激活')
    expect(html).toContain('一键停用防卸载保护')
    await state.disableDeviceAdmin()
    expect(mocks.adminDeactivate).toHaveBeenCalledTimes(1)
  })
})
