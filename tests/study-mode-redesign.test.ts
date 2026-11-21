import { createSSRApp, defineComponent, h, reactive, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProtection, emptyData, type ProtectionPreferences } from '../src/domain/model'
import {
  getModuleSubItems,
  isMasterFocusLockActive,
  isModuleCustomized,
  migrateProtectionPreferences,
  moduleSummaryText,
  resetProtectionModuleDefault,
  resolveEffectiveProtection,
  setProtectionSubItem,
  syncLegacyFlatMutation,
  toggleMasterStudy,
  toggleProtectionModule,
} from '../src/domain/protectionModules'
import { collectRequiredPermissions } from '../src/domain/studyPermissions'
import { makeBackup, readBackup } from '../src/domain/backup'
import { installMainEntryGuard, isStudySessionLocked, resolveStudyFocusEntry } from '../src/navigation/mainEntry'

const mocks = vi.hoisted(() => ({
  app: null as any,
  router: { push: vi.fn(), replace: vi.fn() },
  protection: vi.fn(),
  dnd: vi.fn(),
  notification: vi.fn(),
  recent: vi.fn(),
  launcher: vi.fn(),
  wallpaper: vi.fn(),
  prepareWallpaper: vi.fn(),
  importWallpaperOriginal: vi.fn(),
  requestNotifications: vi.fn(),
  controlObserve: vi.fn(),
}))

vi.mock('/icons/github-mark.png', () => ({ default: '/icons/github-mark.png' }))
vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('../src/stores/updates', () => ({
  useUpdates: () => ({
    state: { currentVersion: '0.2.8', phase: 'idle', received: 0, total: 0, canInstall: false },
    checking: false,
    hasUpdate: false,
    error: '',
    refresh: vi.fn(),
    check: vi.fn(),
  }),
}))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRouter: () => mocks.router,
  }
})
vi.mock('../src/platform/bridge', () => ({
  native: false,
  requestNotifications: mocks.requestNotifications,
  permissionStatus: vi.fn(async () => ({ notifications: 'granted', exactAlarm: 'granted' })),
  openAlarmSettings: vi.fn(),
  exportFile: vi.fn(),
  importNativeFile: vi.fn(),
  controlDriver: { observe: mocks.controlObserve },
  protectionDriver: {
    status: mocks.protection,
    openSettings: vi.fn(),
    recentTasks: mocks.recent,
    launcher: mocks.launcher,
    wallpaper: mocks.wallpaper,
    prepareWallpaper: mocks.prepareWallpaper,
    importWallpaperOriginal: mocks.importWallpaperOriginal,
    apps: vi.fn(async () => []),
  },
}))
vi.mock('../src/platform/dnd', () => ({
  dndDriver: { read: mocks.dnd, openSettings: vi.fn(), restore: vi.fn() },
}))
vi.mock('../src/platform/notifications', () => ({
  notificationDriver: { read: mocks.notification, openSettings: vi.fn(), rebind: vi.fn() },
}))

import FocusView from '../src/views/FocusView.vue'
import LockView from '../src/views/LockView.vue'
import SettingsView from '../src/views/SettingsView.vue'
import StudyModeSheet from '../src/components/StudyModeSheet.vue'
import StrictModeSetting from '../src/components/StrictModeSetting.vue'

async function mountSSR(component: Component, props = {}) {
  const vnode = h(component, props)
  const app = createSSRApp({ render: () => vnode })
  app.component(
    'RouterLink',
    defineComponent({
      props: { to: String },
      setup: (p, ctx) => () => h('a', { href: p.to }, ctx.slots.default?.()),
    }),
  )
  const html = await renderToString(app)
  return { state: (vnode.component as any).setupState, html }
}

function setDevicePermissions(opts: {
  supported?: boolean
  accessibility?: boolean
  accessibilityConnected?: boolean
  dnd?: boolean
  notif?: boolean
  notifConnected?: boolean
  controlNotif?: boolean
  wallpaperPrepared?: boolean
}) {
  const supported = opts.supported ?? true
  const acc = opts.accessibility ?? false
  const accConn = opts.accessibilityConnected ?? acc
  const cap = { supported, authorized: acc, connected: accConn, active: false, state: acc && accConn ? 'ready' : 'authorization', reason: '', identity: {} }
  mocks.protection.mockResolvedValue({ ...cap, effectiveWhitelist: [], navigation: cap, antiClose: cap })
  mocks.dnd.mockResolvedValue({ supported, permissionGranted: opts.dnd ?? false, requested: false, phase: 'off' })
  const notif = opts.notif ?? false
  const notifConn = opts.notifConnected ?? notif
  mocks.notification.mockResolvedValue({ supported, authorized: notif, connected: notifConn, requested: false, phase: 'off' })
  mocks.recent.mockResolvedValue({ supported, recoveryAvailable: opts.controlNotif ?? false, phase: 'off' })
  mocks.launcher.mockResolvedValue({ supported, recoveryAvailable: opts.controlNotif ?? false, phase: 'off' })
  mocks.wallpaper.mockResolvedValue({ supported, prepared: opts.wallpaperPrepared ?? false, phase: 'off', current: {} })
}

beforeEach(() => {
  vi.clearAllMocks()
  setDevicePermissions({ supported: true, accessibility: true, dnd: true, notif: true, controlNotif: true, wallpaperPrepared: true })
  mocks.controlObserve.mockResolvedValue({ mainEntry: { active: false, withdrawn: false } })
  mocks.app = reactive({
    data: {
      ...emptyData(),
      lockConfigurations: [{ id: 'l1', name: '锁机', minutes: 25, strict: false, whitelist: { source: 'global' } }],
      preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null, protection: defaultProtection() },
    },
    focus: { session: null, elapsedMs: 0 },
    rest: { session: null, remainingMs: 0 },
    lock: { session: null, remainingMs: 0, records: [] },
    lastResult: undefined,
    notify: vi.fn(),
    action: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    startRest: vi.fn(async () => {}),
    mutate: vi.fn(async (change: any) => change(mocks.app.data)),
  })
})

describe('P0: study focus page locking', () => {
  it('locks router navigation to /focus while keeping safety destinations reachable', async () => {
    let studyLocked = true
    const paths = ['/tasks', '/calendar', '/cat', '/statistics', '/settings', '/focus', '/rest', '/permissions', '/help', '/emergency', '/recovery']
    const router = createRouter({
      history: createMemoryHistory(),
      routes: paths.map((path) => ({ path, component: {} })),
    })
    installMainEntryGuard(router, async (path) => path, () => studyLocked)

    for (const blocked of ['/tasks', '/calendar', '/cat', '/statistics', '/settings']) {
      await router.push(blocked)
      expect(router.currentRoute.value.path).toBe('/focus')
    }
    for (const safe of ['/focus', '/rest', '/permissions', '/help', '/emergency', '/recovery']) {
      await router.push(safe)
      expect(router.currentRoute.value.path).toBe(safe)
    }

    studyLocked = false
    await router.push('/tasks')
    expect(router.currentRoute.value.path).toBe('/tasks')
    expect(resolveStudyFocusEntry('/tasks', true)).toBe('/focus')
    expect(resolveStudyFocusEntry('/help', true)).toBe('/help')
  })

  it('replaces FocusView back button with lock when study mode active and allows back when non-study or ended', async () => {
    mocks.app.focus.session = {
      id: 'f1',
      itemId: null,
      themeId: null,
      title: '英语复习',
      themeName: '英语',
      color: '#ef4e36',
      mode: 'countdown',
      targetMs: 1500000,
      startedAt: 1,
      timeZone: 'UTC',
      state: 'running',
      elapsedMs: 0,
      pausedMs: 0,
      anchorMono: 1,
      anchorEpoch: 1,
      bootId: 0,
      segments: [],
      protection: { study: true, source: 'global', whitelist: [] },
    }
    const locked = await mountSSR(FocusView)
    expect(locked.html).toContain('学霸模式进行中，专注页已锁定')
    expect(locked.html).toContain('/help')
    expect(locked.html).toContain('/emergency')
    expect(locked.html).toContain('/recovery')
    locked.state.onBackClick()
    expect(mocks.app.notify).toHaveBeenCalledWith('学霸模式进行中，结束后可返回')
    expect(mocks.router.replace).not.toHaveBeenCalled()

    mocks.app.focus.session.protection.temporaryAccessAllowed = false
    const noTemp = await mountSSR(FocusView)
    expect(noTemp.html).toContain('本轮已关闭临时放行')

    mocks.app.focus.session.protection.study = false
    mocks.app.focus.session.protection.studyLocked = true
    expect(isStudySessionLocked(mocks.app.focus.session)).toBe(true)
    const masterOnlyLocked = await mountSSR(FocusView)
    expect(masterOnlyLocked.html).toContain('学霸模式进行中，专注页已锁定')
    masterOnlyLocked.state.onBackClick()
    expect(mocks.router.replace).not.toHaveBeenCalled()

    mocks.app.focus.session.protection.studyLocked = false
    const normal = await mountSSR(FocusView)
    expect(normal.html).toContain('返回待办，保持计时')
    normal.state.onBackClick()
    expect(mocks.router.replace).toHaveBeenCalledWith('/tasks')

    mocks.router.replace.mockClear()
    mocks.app.focus.session = null
    mocks.app.lastResult = {
      id: 'f1', itemId: null, themeId: null, title: '英语复习', themeName: '英语', color: '#ef4e36',
      mode: 'countdown', targetMs: 1500000, startedAt: 1, endedAt: 1500001, timeZone: 'UTC',
      durationMs: 1500000, pausedMs: 0, segments: [], status: 'completed',
    }
    const ended = await mountSSR(FocusView)
    expect(ended.html).toContain('返回待办')
  })
})

describe('P2: modular protection defaults, custom retention, migration, and backup', () => {
  it('follows the 6 default-on / remember-custom / reset-default rules', () => {
    // Rule 5: first master enable turns on apps & quiet, keeps strict off (D1)
    let p = toggleMasterStudy(defaultProtection(), true)
    expect(p.modules?.master).toBe(true)
    expect(p.modules?.apps.enabled).toBe(true)
    expect(p.modules?.strict.enabled).toBe(false)
    expect(p.modules?.quiet.enabled).toBe(true)
    expect(p.study).toBe(true)
    expect(p.strict).toBe(false)
    expect(p.dnd).toBe(true)
    expect(p.interceptNotifications).toBe(true)

    // Rule 1: enabling strict uses recommended defaults (advanced 3 off, others on)
    p = toggleProtectionModule(p, 'strict', true)
    expect(getModuleSubItems('strict', p.modules?.strict)).toEqual({
      noPauseEnd: true,
      navigation: true,
      antiClose: true,
      hideRecents: false,
      hideLauncher: false,
      wallpaper: false,
    })
    expect(isModuleCustomized('strict', p.modules?.strict)).toBe(false)
    expect(p.strict).toBe(true)
    expect(p.enhancements).toEqual(['navigationHomeRecents', 'preciseAntiClose'])

    // Rule 2: changing a sub-item marks module customized & persists override
    p = setProtectionSubItem(p, 'strict', 'antiClose', false)
    p = setProtectionSubItem(p, 'strict', 'hideRecents', true)
    expect(isModuleCustomized('strict', p.modules?.strict)).toBe(true)
    expect(moduleSummaryText('strict', p)).toBe('已自定义 · 3 项')
    expect(p.enhancements).toEqual(['navigationHomeRecents', 'recentTasksHidden'])

    // Rule 3: turning module off and back on restores custom sub-items
    p = toggleProtectionModule(p, 'strict', false)
    expect(p.strict).toBe(false)
    expect(p.enhancements).toEqual([])
    p = toggleProtectionModule(p, 'strict', true)
    expect(isModuleCustomized('strict', p.modules?.strict)).toBe(true)
    expect(getModuleSubItems('strict', p.modules?.strict).antiClose).toBe(false)
    expect(getModuleSubItems('strict', p.modules?.strict).hideRecents).toBe(true)
    expect(p.enhancements).toEqual(['navigationHomeRecents', 'recentTasksHidden'])

    // Rule 5 continued: toggling master off and on keeps each module's state
    p = toggleMasterStudy(p, false)
    expect(p.study).toBe(false)
    expect(p.strict).toBe(false)
    expect(p.dnd).toBe(false)
    expect(p.interceptNotifications).toBe(false)
    expect(p.enhancements).toEqual([])
    p = toggleMasterStudy(p, true)
    expect(p.modules?.strict.enabled).toBe(true)
    expect(p.enhancements).toEqual(['navigationHomeRecents', 'recentTasksHidden'])

    // Rule 4: reset default clears custom and restores recommended values
    p = resetProtectionModuleDefault(p, 'strict')
    expect(isModuleCustomized('strict', p.modules?.strict)).toBe(false)
    expect(moduleSummaryText('strict', p)).toBe('默认 · 3 项')
    expect(p.enhancements).toEqual(['navigationHomeRecents', 'preciseAntiClose'])
  })

  it('migrates all legacy flat preference combinations without altering effective protection', () => {
    const legacyCases: ProtectionPreferences[] = [
      defaultProtection(),
      {
        study: true,
        strict: false,
        dnd: false,
        interceptNotifications: false,
        globalWhitelist: ['com.example.docs'],
        enhancements: [],
      },
      {
        study: false,
        strict: true,
        dnd: true,
        interceptNotifications: false,
        globalWhitelist: [],
        enhancements: ['wallpaperProtection', 'lockMainInterfaceRestricted'],
      },
      {
        study: true,
        strict: true,
        dnd: false,
        interceptNotifications: true,
        globalWhitelist: ['a.b'],
        enhancements: ['navigationHomeRecents', 'launcherIconHidden', 'lockMainInterfaceRestricted'],
      },
    ]

    for (const legacy of legacyCases) {
      const migrated = migrateProtectionPreferences(legacy)
      const resolved = resolveEffectiveProtection(migrated)
      expect(resolved.study).toBe(legacy.study)
      expect(resolved.strict).toBe(legacy.strict)
      expect(resolved.dnd).toBe(legacy.dnd)
      expect(resolved.interceptNotifications).toBe(legacy.interceptNotifications)
      expect(resolved.globalWhitelist).toEqual(legacy.globalWhitelist)
      expect([...resolved.enhancements].sort()).toEqual([...legacy.enhancements].sort())
    }
  })

  it('round-trips modular preferences through backup and rejects corrupted modules', () => {
    const data = emptyData()
    let p = toggleMasterStudy(defaultProtection(), true)
    p = toggleProtectionModule(p, 'strict', true)
    p = setProtectionSubItem(p, 'strict', 'hideLauncher', true)
    p.globalWhitelist = ['org.example.reader']
    data.preferences.protection = p

    const exported = makeBackup(data)
    const restored = readBackup(exported).data
    expect(restored.preferences.protection).toEqual(p)

    const corrupted = JSON.parse(exported)
    corrupted.data.preferences.protection.modules.strict.custom.unknownKey = true
    expect(() => readBackup(JSON.stringify(corrupted))).toThrow('保护设置损坏')
  })
})

describe('P1 & P3: redesigned StudyModeSheet, LockView move, and permission center', () => {
  it('shows single unsupported notice on home view, keeps modules dimmed when master is off, and removes lockMainInterfaceRestricted from study sheet', async () => {
    setDevicePermissions({ supported: false })
    const { html, state } = await mountSSR(StudyModeSheet, { open: true })
    await state.refresh()

    // Master + 3 modules + permissions row on home view
    expect(html).toContain('学霸模式')
    expect(html).toContain('应用限制')
    expect(html).toContain('严格模式')
    expect(html).toContain('免打扰')
    expect(html).toContain('授权与权限')
    expect(html).toContain('modules-dimmed')
    expect(html).not.toContain('锁机时限制主界面入口')
    expect(state.masterSubtitle).toBe('仅 Android 可用')
    expect(html.match(/仅 Android 可用/g)?.length ?? 0).toBe(0)

    const lockRender = await mountSSR(LockView)
    expect(lockRender.html).toContain('锁机时限制主界面入口')
  })

  it('lists only permissions required by enabled sub-items and highlights missing grants honestly', async () => {
    let p = toggleMasterStudy(defaultProtection(), true)
    p = toggleProtectionModule(p, 'strict', true)
    p = setProtectionSubItem(p, 'strict', 'hideLauncher', true)
    mocks.app.data.preferences.protection = p

    setDevicePermissions({
      supported: true,
      accessibility: true,
      dnd: false,
      notif: true,
      notifConnected: false,
      controlNotif: false,
    })

    const perms = collectRequiredPermissions(p, {
      protection: await mocks.protection(),
      dnd: await mocks.dnd(),
      notification: await mocks.notification(),
      recentTasks: await mocks.recent(),
      launcher: await mocks.launcher(),
      wallpaper: await mocks.wallpaper(),
    })

    expect(perms.map((item) => item.id)).toEqual([
      'accessibility',
      'dnd',
      'notificationListener',
      'controlNotification',
    ])
    expect(perms.find((item) => item.id === 'accessibility')?.ready).toBe(true)
    expect(perms.find((item) => item.id === 'dnd')?.ready).toBe(false)
    expect(perms.find((item) => item.id === 'notificationListener')?.ready).toBe(false)
    expect(perms.find((item) => item.id === 'controlNotification')?.ready).toBe(false)

    // Turning off sound & hideLauncher removes DND and controlNotification from the checklist
    p = setProtectionSubItem(p, 'quiet', 'sound', false)
    p = setProtectionSubItem(p, 'strict', 'hideLauncher', false)
    const narrowed = collectRequiredPermissions(p, {
      protection: await mocks.protection(),
      dnd: await mocks.dnd(),
      notification: await mocks.notification(),
      recentTasks: await mocks.recent(),
      launcher: await mocks.launcher(),
      wallpaper: await mocks.wallpaper(),
    })
    expect(narrowed.map((item) => item.id)).toEqual(['accessibility', 'notificationListener'])

    const sheet = await mountSSR(StudyModeSheet, { open: true })
    await sheet.state.refresh()
    expect(sheet.state.missingPermissions.length).toBeGreaterThan(0)
  })
})

describe('QA blocker regressions (Blockers #1, #2, #3, P1, P2, P3)', () => {
  it('Blocker #1: legacy StrictModeSetting stays synced with modules and SettingsView routes strict/sound/notifications through StudyModeSheet', async () => {
    let p = toggleMasterStudy(defaultProtection(), true, { quietDefault: false })
    p = toggleProtectionModule(p, 'strict', false)
    mocks.app.data.preferences.protection = p

    // Toggling legacy StrictModeSetting keeps modules.strict and flat strict in lockstep
    const strictComp = await mountSSR(StrictModeSetting)
    await strictComp.state.change({ target: { checked: true } })
    expect(mocks.app.data.preferences.protection.strict).toBe(true)
    expect(resolveEffectiveProtection(mocks.app.data.preferences.protection).strict).toBe(true)
    await strictComp.state.change({ target: { checked: false } })
    expect(mocks.app.data.preferences.protection.strict).toBe(false)
    expect(resolveEffectiveProtection(mocks.app.data.preferences.protection).strict).toBe(false)

    // Direct syncLegacyFlatMutation helper preserves alignment
    const synced = syncLegacyFlatMutation(p, (flat) => {
      flat.strict = true
    })
    expect(synced.strict).toBe(true)
    expect(resolveEffectiveProtection(synced).strict).toBe(true)

    // SettingsView no longer mounts standalone legacy strict/dnd/notification toggles
    const settingsRender = await mountSSR(SettingsView)
    expect(settingsRender.html).toContain('学霸模式')
    expect(settingsRender.html).not.toContain('默认倒计时严格模式')
  })

  it('Blocker #2: legacy DND-only user keeps focusLock=false across migration, whitelist save, and backup round-trip', async () => {
    const legacyDndOnly: ProtectionPreferences = {
      study: false,
      strict: false,
      dnd: true,
      interceptNotifications: false,
      globalWhitelist: ['com.example.existing'],
      enhancements: [],
    }
    const migrated = migrateProtectionPreferences(legacyDndOnly)
    expect(migrated.modules?.focusLock).toBe(false)
    expect(isMasterFocusLockActive(migrated)).toBe(false)
    expect(migrated.dnd).toBe(true)
    expect(migrated.study).toBe(false)

    // Saving global whitelist in StudyModeSheet must NOT turn on focus-page locking
    mocks.app.data.preferences.protection = legacyDndOnly
    const sheet = await mountSSR(StudyModeSheet, { open: true })
    await sheet.state.saveApps(['com.example.existing', 'com.example.notes'])
    const saved = mocks.app.data.preferences.protection
    expect(saved.globalWhitelist).toEqual(['com.example.existing', 'com.example.notes'])
    expect(isMasterFocusLockActive(saved)).toBe(false)
    expect(saved.dnd).toBe(true)
    expect(saved.study).toBe(false)

    // Backup round-trip preserves focusLock=false
    const data = emptyData()
    data.preferences.protection = saved
    const restored = readBackup(makeBackup(data)).data
    expect(restored.preferences.protection?.modules?.focusLock).toBe(false)
    expect(isMasterFocusLockActive(restored.preferences.protection)).toBe(false)

    // Explicitly toggling master study ON clears focusLock and activates focus-page lock
    const enabled = toggleMasterStudy(saved, true)
    expect(isMasterFocusLockActive(enabled)).toBe(true)
  })

  it('Blocker #3 & P3: first master enable skips ungranted/unsupported optional capabilities so "稍后处理" never blocks start, and shows unified checklist when accessibility is missing', async () => {
    // Case A: Accessibility missing -> unified P3 checklist (NOT single-purpose old popup)
    setDevicePermissions({ supported: true, accessibility: false, dnd: false, notif: false })
    const unauthSheet = await mountSSR(StudyModeSheet, { open: true })
    await unauthSheet.state.refresh()
    await unauthSheet.state.toggleStudy({ target: { checked: true } })
    expect(mocks.app.data.preferences.protection.study).toBe(false)
    expect(unauthSheet.state.permissionHelp).toBe(true)
    expect(unauthSheet.state.onboardingPermissions.map((i: any) => i.id)).toEqual([
      'accessibility',
      'dnd',
      'notificationListener',
    ])

    // Case B: Accessibility ready, DND + Notifications missing -> enable succeeds without ungranted DND/Notifications
    setDevicePermissions({ supported: true, accessibility: true, dnd: false, notif: false })
    const sheet = await mountSSR(StudyModeSheet, { open: true })
    await sheet.state.refresh()
    await sheet.state.toggleStudy({ target: { checked: true } })
    const afterEnable = mocks.app.data.preferences.protection
    expect(afterEnable.study).toBe(true)
    expect(afterEnable.modules?.master).toBe(true)
    expect(afterEnable.dnd).toBe(false)
    expect(afterEnable.interceptNotifications).toBe(false)
    expect(afterEnable.modules?.quiet.enabled).toBe(false)
    expect(sheet.state.guideOpen).toBe(true)
    expect(sheet.state.optionalMissingForGuide.length).toBe(2)

    // Case C: Android 7-9 (DND unsupported, Notifications authorized) -> sound=false, intercept=true
    mocks.app.data.preferences.protection = defaultProtection()
    setDevicePermissions({ supported: true, accessibility: true, dnd: false, notif: true })
    mocks.dnd.mockResolvedValue({ supported: false, permissionGranted: false, requested: false, phase: 'unsupported' })
    const api28Sheet = await mountSSR(StudyModeSheet, { open: true })
    await api28Sheet.state.refresh()
    await api28Sheet.state.toggleStudy({ target: { checked: true } })
    const api28Prefs = mocks.app.data.preferences.protection
    expect(api28Prefs.study).toBe(true)
    expect(api28Prefs.dnd).toBe(false)
    expect(api28Prefs.interceptNotifications).toBe(true)
    expect(api28Prefs.modules?.quiet.enabled).toBe(true)
    expect(api28Prefs.modules?.quiet.custom?.sound).toBe(false)
    expect(api28Sheet.state.guideOpen).toBe(false)
  })

  it('P1: toggling a module while master is OFF does not auto-enable master or skip first-enable recommended defaults', () => {
    let p = defaultProtection()
    p = toggleProtectionModule(p, 'strict', true)
    expect(p.modules?.master).toBe(false)
    expect(p.modules?.initialized).toBe(false)
    expect(p.modules?.strict.enabled).toBe(true)
    // Effective flat fields remain OFF while master is OFF
    expect(p.strict).toBe(false)
    expect(p.study).toBe(false)
    expect(p.enhancements).toEqual([])

    // Now turning master ON applies first-enable recommended defaults (apps + quiet) AND preserves pre-enabled strict
    p = toggleMasterStudy(p, true)
    expect(p.modules?.master).toBe(true)
    expect(p.modules?.initialized).toBe(true)
    expect(p.modules?.apps.enabled).toBe(true)
    expect(p.modules?.quiet.enabled).toBe(true)
    expect(p.modules?.strict.enabled).toBe(true)
    expect(p.study).toBe(true)
    expect(p.strict).toBe(true)
    expect(p.dnd).toBe(true)
    expect(p.interceptNotifications).toBe(true)
  })
})
