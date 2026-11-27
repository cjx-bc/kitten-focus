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
  syncFocusOverlayState: vi.fn(),
  onNativeOverlayEvent: vi.fn(async () => () => {}),
  keepAliveDriver: {
    guide: vi.fn(async () => ({
      brand: 'generic',
      brandLabel: '标准 Android',
      foregroundServiceActive: false,
      batteryOptimizationIgnored: false,
      hasAutoStartSurface: false,
      autoStartHint: '测试自启动提示',
      recentLockHint: '测试锁卡提示',
      hideRecentsConflict: false,
    })),
    openSettings: vi.fn(async () => true),
  },
  deviceAdminDriver: {
    status: vi.fn(async () => ({
      supported: true,
      active: false,
      preferenceEnabled: false,
      state: 'off',
      reason: '',
    })),
    requestActivation: vi.fn(async () => true),
    deactivate: vi.fn(async () => ({
      supported: true,
      active: false,
      preferenceEnabled: false,
      state: 'off',
      reason: '',
    })),
  },
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

  it('renders calm optional battery card in StudyModeSheet permissions view without red badge or standby toggle', async () => {
    const { html, state } = await mountSSR(StudyModeSheet, { open: true, initialView: 'permissions' })
    expect(html).toContain('后台运行不限制')
    expect(html).toContain('未放行 · 可选')
    expect(html).not.toContain('后台常驻保活')
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
    expect(html).not.toContain('待机常驻保活')
  })

  it('includes scannable OEM keep-alive steps and dual-engine persistent permission guidance in offline help', () => {
    const section = protectionHelpSections.find((item) => item.id === 'keepalive')
    expect(section).toBeDefined()
    expect(section?.title).toBe('后台保活与各品牌设置')
    const guidance = section?.paragraphs.join(' ')
    expect(guidance).toContain('使用情况访问 + 悬浮窗')
    expect(guidance).toContain('系统开关仍保留')
    expect(guidance).toContain('「强行停止」可能撤回无障碍开关')
    expect(guidance).toContain('手机管家 / 安全中心触发了风险管控')
    expect(guidance).toContain('将小猫专注设为信任或白名单，再重新开启无障碍')
    expect(guidance).toContain('在无障碍授权被撤回时继续使用日常应用限制')
    expect(guidance).toContain('最近任务锁卡仅防底部一键清除')
    expect(guidance).toContain('日常退出请按 Home 或返回键')
    expect(section?.steps).toHaveLength(5)
    const oppo = section?.steps?.find((s) => s.brand.includes('OPPO'))
    expect(oppo?.path).toContain('完全允许后台行为')
    expect(oppo?.path).toContain('开启小猫专注以放行通知监听与后台服务绑定')
    expect(oppo?.path).toContain('「手机管家 / 安全中心」将小猫专注设为信任或白名单')

    const xiaomi = section?.steps?.find((s) => s.brand.includes('小米'))
    expect(xiaomi?.path).toContain('安全中心 → 自启动管理')
    expect(xiaomi?.path).toContain('在安全中心将小猫专注加入信任或忽略风险')

    const vivo = section?.steps?.find((s) => s.brand.includes('vivo'))
    expect(vivo?.path).toContain('i 管家 → 权限管理 → 自启动')
    expect(vivo?.path).toContain('在 i 管家安全检测中将小猫专注加入信任或忽略风险')

    const huawei = section?.steps?.find((s) => s.brand.includes('华为 / 荣耀'))
    expect(huawei?.path).toContain('手机管家 → 应用启动管理')
    expect(huawei?.path).toContain('手机管家「病毒查杀 / 风险管控」中解除管控并加入信任')

    const samsung = section?.steps?.find((s) => s.brand === '三星 / 原生 Android')
    expect(samsung?.path).toContain('Android 13 及以上版本侧载安装')
    expect(samsung?.path).toContain('「应用信息 → 右上角 ⋮」选择「允许受限设置」')
  })
})
