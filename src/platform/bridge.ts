import { Capacitor } from '@capacitor/core'
import { openDB } from 'idb'
import { getCatFocusPlugin } from './catFocusPlugin'
import type {
  ActiveFocus,
  AppData,
  ControlSnapshot,
  FocusRecord,
  FocusSnapshot,
  RestSession,
  RestSnapshot,
  ProtectionStatus,
  ProtectionApp,
  RecoverySnapshot,
  LockSnapshot,
  TemporaryAccessRequest,
  TemporaryAccessResult,
  RecentTasksStatus,
  LauncherStatus,
  WallpaperStatus,
  KeepAliveGuide,
  DeviceAdminStatus,
} from '../domain/model'
import { emptyData, effectiveWhitelist } from '../domain/model'
import { isMasterFocusLockActive, resolveEffectiveProtection } from '../domain/protectionModules'
import { elapsed, settle } from '../domain/focus'
import { makeRest, readRest, resolveRestDurationMs, REST_DURATION_MS } from '../domain/rest'

export type ProtectionSettingsTarget = 'usageStats' | 'overlay' | 'accessibility'

export interface SystemPermissions {
  notifications: boolean
  exactAlarms: boolean
  batteryOptimizationIgnored?: boolean
  foregroundServiceActive?: boolean
}

interface NativeBridge {
  resolveMainEntry(options: { path: string }): Promise<{ path: string }>
  startLock(options: { configurationId: string; strictLockConfirmed: boolean }): Promise<LockSnapshot>
  lockAction(options: { action: 'read' | 'finish'; confirmed: boolean }): Promise<LockSnapshot>
  loadData(): Promise<{ data: AppData | null }>
  saveData(options: { data: AppData }): Promise<void>
  replaceData(options: { data: AppData }): Promise<void>
  startFocus(options: {
    session: ActiveFocus
    strictModeConfirmed?: boolean
  }): Promise<FocusSnapshot>
  focusAction(options: { action: 'read' | 'pause' | 'resume' | 'finish' | 'cancel' }): Promise<FocusSnapshot>
  startRest(options: { recordId: string }): Promise<RestSnapshot>
  restAction(options: { action: 'read' | 'exit' }): Promise<RestSnapshot>
  grantTemporaryAccess(options: TemporaryAccessRequest): Promise<TemporaryAccessResult>
  observeControl(): Promise<ControlSnapshot>
  getRecentTasksStatus(): Promise<RecentTasksStatus>
  getLauncherStatus(): Promise<LauncherStatus>
  getWallpaperStatus(): Promise<WallpaperStatus>
  prepareWallpaper(options: { limitsAccepted: boolean; originalMatches: boolean }): Promise<WallpaperStatus>
  requestWallpaperPicker(options: { restoreOriginal: boolean }): Promise<WallpaperStatus>
  importWallpaperOriginal(options: { lockSource: boolean }): Promise<WallpaperStatus>
  confirmWallpaperManualRecovery(options: { acknowledged: boolean }): Promise<WallpaperStatus>
  openWallpaperSettings(): Promise<void>
  consumeFocusReturn(): Promise<{ requested: boolean }>
  consumeLockReturn(): Promise<{ requested: boolean }>
  protectionStatus(): Promise<ProtectionStatus>
  listProtectionApps(): Promise<{ apps: ProtectionApp[] }>
  openProtectionSettings(options?: { target?: ProtectionSettingsTarget }): Promise<void>
  previewRecovery(): Promise<RecoverySnapshot>
  confirmRecovery(options: { revision: string }): Promise<RecoverySnapshot>
  consumeRecoveryReturn(): Promise<{ requested: boolean }>
  exportFile(options: { text: string; name: string }): Promise<void>
  importFile(): Promise<{ text: string }>
  permissions(): Promise<SystemPermissions>
  requestNotifications(): Promise<{ notifications: boolean }>
  openAlarmSettings(): Promise<void>
  openBatteryOptimizationSettings(): Promise<void>
  syncReminders(): Promise<void>
  setFocusOverlayState(options: { route: string }): Promise<{ ok: boolean }>
  getKeepAliveGuide(): Promise<KeepAliveGuide>
  openKeepAliveSettings(options: { target: 'battery' | 'autostart' | 'appDetails' }): Promise<{ opened: boolean }>
  getDeviceAdminStatus(): Promise<DeviceAdminStatus>
  requestDeviceAdmin(): Promise<{ opened: boolean }>
  deactivateDeviceAdmin(): Promise<DeviceAdminStatus>
  addListener?(
    eventName: string,
    listenerFunc: (data: { path?: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>
}
export const native = Capacitor.isNativePlatform()
const plugin = getCatFocusPlugin<NativeBridge>()
export const resolveMainEntry = async (path: string): Promise<string> => native ? (await plugin.resolveMainEntry({ path })).path : path
export const lockDriver = {
  async start(configurationId: string, strictLockConfirmed = false): Promise<LockSnapshot> {
    if (!native) throw new Error('独立锁机仅支持 Android 本机版本，请在手机上开始')
    return plugin.startLock({ configurationId, strictLockConfirmed })
  },
  async read(): Promise<LockSnapshot> {
    return native ? plugin.lockAction({ action: 'read', confirmed: false }) : { session: null, remainingMs: 0, records: [] }
  },
  async finish(confirmed: boolean): Promise<LockSnapshot> {
    if (!native) throw new Error('独立锁机仅支持 Android 本机版本')
    return plugin.lockAction({ action: 'finish', confirmed })
  },
}
const database = () =>
  openDB('xiaomao-focus', 1, {
    upgrade(db) {
      db.createObjectStore('kv')
    },
  })
let browserSession: ActiveFocus | null = null
let initialized = false
const clock = () => ({ epoch: Date.now(), mono: Date.now(), boot: 0 })
async function webReadFocus() {
  const db = await database()
  if (!initialized) {
    browserSession = (await db.get('kv', 'active')) || null
    initialized = true
  }
  return db
}
export const repository = {
  async load(): Promise<AppData> {
    if (native) return (await plugin.loadData()).data || emptyData()
    const db = await database()
    return (await db.get('kv', 'data')) || emptyData()
  },
  async save(data: AppData) {
    const payload = JSON.parse(JSON.stringify(data)) as AppData
    if (native) return plugin.saveData({ data: payload })
    const db = await database()
    await db.put('kv', payload, 'data')
  },
  async replace(data: AppData) {
    if (native) return plugin.replaceData({ data })
    const db = await webReadFocus()
    if (browserSession) throw new Error('请先结束当前专注')
    const tx = db.transaction('kv', 'readwrite')
    await tx.store.put(data, 'data')
    await tx.store.delete('active')
    await tx.store.delete('rest')
    await tx.done
    browserSession = null
    initialized = true
  },
}
export const focusDriver = {
  async start(session: ActiveFocus, strictModeConfirmed = false): Promise<FocusSnapshot> {
    if (native) return plugin.startFocus({ session, strictModeConfirmed })
    const db = await webReadFocus()
    const loadedData: AppData = (await db.get('kv', 'data')) || emptyData()
    const preferredProtection = loadedData.preferences.protection
      ? resolveEffectiveProtection(loadedData.preferences.protection)
      : undefined
    if (preferredProtection?.enhancements?.includes('launcherIconHidden'))
      throw new Error('桌面图标隐藏仅支持 Android 本机版本，请关闭此选项后继续')
    if (preferredProtection?.enhancements?.includes('recentTasksHidden'))
      throw new Error('最近任务卡隐藏仅支持 Android 本机版本，请关闭此选项后继续')
    if (preferredProtection?.enhancements?.includes('wallpaperProtection'))
      throw new Error('壁纸辅助保护仅支持 Android 本机版本，请关闭此选项后继续')
    if (preferredProtection?.enhancements?.some(value => ['navigationHomeRecents', 'preciseAntiClose'].includes(value)))
      throw new Error('所选增强保护仅支持 Android 本机版本，请关闭此增强后继续')
    if (preferredProtection?.study)
      throw new Error('应用限制仅支持 Android 本机版本，请关闭学霸模式后继续')
    if (preferredProtection?.interceptNotifications)
      throw new Error('通知拦截与释放仅支持 Android 本机版本，请关闭此选项后继续')
    if (preferredProtection?.dnd)
      throw new Error('声音免打扰辅助仅支持 Android 本机版本，请关闭此选项后继续')
    if (browserSession) throw new Error('请先结束当前专注')
    if ((await restDriver.read()).session?.state === 'running')
      throw new Error('请先退出休息，再开始新的专注')
    await restDriver.exit()
    const strictMode = preferredProtection?.strict === true && session.mode === 'countdown'
    if (strictMode && !strictModeConfirmed)
      throw new Error('请先确认严格倒计时：开始后不能暂停、取消或提前结束')
    const protectionSnapshot: ActiveFocus['protection'] = {
      study: false,
      ...effectiveWhitelist(loadedData, session.itemId),
    }
    if (isMasterFocusLockActive(preferredProtection)) {
      protectionSnapshot.studyLocked = true
    }
    browserSession = {
      ...session,
      strictMode,
      protection: protectionSnapshot,
      anchorMono: Date.now(),
      bootId: 0,
    }
    await db.put('kv', browserSession, 'active')
    return { session: browserSession, elapsedMs: 0 }
  },
  async action(action: 'read' | 'pause' | 'resume' | 'finish' | 'cancel'): Promise<FocusSnapshot> {
    if (native) return plugin.focusAction({ action })
    const db = await webReadFocus()
    if (!browserSession) return { session: null, elapsedMs: 0 }
    if (
      action !== 'read' &&
      browserSession.strictMode &&
      browserSession.mode === 'countdown' &&
      elapsed(browserSession, clock()) < browserSession.targetMs
    )
      throw new Error('严格倒计时不能暂停、取消或提前结束')
    const result = settle(browserSession, clock(), action)
    const tx = db.transaction('kv', 'readwrite')
    if (action === 'cancel' && !result.session && !result.record) {
      await tx.store.delete('active')
      await tx.done
      browserSession = null
      return { session: null, elapsedMs: 0 }
    }
    await tx.store.put(result.session, 'active')
    const data: AppData = (await tx.store.get('data')) || emptyData()
    if (result.record) {
      if (
        !data.deletedRecordIds.includes(result.record.id) &&
        !data.records.some((r) => r.id === result.record!.id)
      ) {
        data.records.push(result.record)
        await tx.store.put(data, 'data')
      }
    }
    if (result.record?.status === 'completed' && data.preferences?.autoRest === true) {
      const restDurationMs = resolveRestDurationMs(data.preferences.restMinutes)
      const rest = makeRest(result.record, result.record.endedAt, restDurationMs)
      await tx.store.put(readRest(rest, Date.now()).session, 'rest')
    }
    await tx.done
    browserSession = result.session
    return result
  },
}
export const restDriver = {
  async read(): Promise<RestSnapshot> {
    if (native) return plugin.restAction({ action: 'read' })
    const db = await database()
    const stored: RestSession | null = (await db.get('kv', 'rest')) || null
    const snapshot = readRest(stored, Date.now())
    if (stored?.state === 'running' && snapshot.session?.state === 'completed')
      await db.put('kv', snapshot.session, 'rest')
    return snapshot
  },
  async start(record: FocusRecord): Promise<RestSnapshot> {
    if (native) return plugin.startRest({ recordId: record.id })
    const db = await webReadFocus()
    if (browserSession) throw new Error('请先结束当前专注')
    const existing = await restDriver.read()
    if (existing.session?.record.id === record.id) return existing
    if (existing.session?.state === 'running') throw new Error('已有一段休息正在进行')
    const data: AppData = (await db.get('kv', 'data')) || emptyData()
    const restDurationMs = resolveRestDurationMs(data.preferences?.restMinutes)
    const session = makeRest(record, Date.now(), restDurationMs)
    await db.put('kv', session, 'rest')
    return { session, remainingMs: session.endsAt - session.startedAt }
  },
  async exit(): Promise<RestSnapshot> {
    if (native) return plugin.restAction({ action: 'exit' })
    const db = await database()
    await db.delete('kv', 'rest')
    return { session: null, remainingMs: 0 }
  },
}
export const controlDriver = {
  // Observation deliberately leaves lifecycle work to focusAction/restAction.
  async observe(): Promise<ControlSnapshot> {
    if (native) return plugin.observeControl()
    const db = await webReadFocus()
    const now = clock()
    const session = browserSession ? structuredClone(browserSession) : null
    const rest: RestSession | null = (await db.get('kv', 'rest')) || null
    const interrupted = !!session && (session.bootId !== now.boot || now.mono < session.anchorMono)
    const elapsedMs = session ? (interrupted ? session.elapsedMs : elapsed(session, now)) : 0
    const restDurationMs = rest?.durationMs && rest.durationMs > 0 ? rest.durationMs : REST_DURATION_MS
    const remainingMs =
      rest?.state === 'running'
        ? Math.max(0, Math.min(restDurationMs, rest.endsAt - now.epoch))
        : 0
    return {
      owner: session ? 'focus' : rest?.state === 'running' ? 'rest' : null,
      focus: { session, elapsedMs },
      rest: { session: rest, remainingMs },
      needsReconcile:
        interrupted ||
        !!(session?.mode === 'countdown' && elapsedMs >= session.targetMs) ||
        !!(rest?.state === 'running' && remainingMs === 0),
    }
  },
}
export async function exportFile(text: string, name: string) {
  if (native) return plugin.exportFile({ text, name })
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
export const importNativeFile = () => plugin.importFile()
export const permissionStatus = (): Promise<SystemPermissions> =>
  native
    ? plugin.permissions()
    : Promise.resolve({
        notifications: false,
        exactAlarms: false,
        batteryOptimizationIgnored: false,
        foregroundServiceActive: false,
      })
export const requestNotifications = () =>
  native ? plugin.requestNotifications() : Promise.resolve({ notifications: false })
export const openAlarmSettings = () => plugin.openAlarmSettings()
export const openBatteryOptimizationSettings = () =>
  native ? plugin.openBatteryOptimizationSettings() : Promise.resolve()
export const syncReminders = () => (native ? plugin.syncReminders() : Promise.resolve())

export const protectionDriver = {
  async wallpaper(): Promise<WallpaperStatus> {
    return native ? plugin.getWallpaperStatus() : {
      supported: false, requested: false, preferenceEnabled: false, phase: 'unsupported', selected: false,
      lockSelected: false, active: false, verified: false, prepared: false, pickerOpen: false,
      recoveryPending: false, withdrawn: false, current: {}, error: '壁纸辅助仅支持 Android 本机版本',
      forceStopImmune: false, cropVerified: false, providerSettingsVerified: false,
    }
  },
  async prepareWallpaper(limitsAccepted: boolean, originalMatches: boolean): Promise<WallpaperStatus> {
    if (!native) throw new Error('请在 Android 本机版本保存原壁纸')
    return plugin.prepareWallpaper({ limitsAccepted, originalMatches })
  },
  async wallpaperPicker(restoreOriginal = false): Promise<WallpaperStatus> {
    if (!native) throw new Error('请在 Android 本机版本确认系统壁纸')
    return plugin.requestWallpaperPicker({ restoreOriginal })
  },
  async importWallpaperOriginal(lockSource = false): Promise<WallpaperStatus> {
    if (!native) throw new Error('请在 Android 文件选择器中提供原图')
    return plugin.importWallpaperOriginal({ lockSource })
  },
  async confirmWallpaperManualRecovery(acknowledged: boolean): Promise<WallpaperStatus> {
    if (!native) throw new Error('请在 Android 本机版本核对原壁纸')
    return plugin.confirmWallpaperManualRecovery({ acknowledged })
  },
  async openWallpaperSettings(): Promise<void> {
    if (!native) throw new Error('请在 Android 本机版本打开壁纸设置')
    return plugin.openWallpaperSettings()
  },
  async launcher(): Promise<LauncherStatus> {
    return native ? plugin.getLauncherStatus() : {
      supported: false, requested: false, preferenceEnabled: false, recoveryAvailable: false, recoveryReachable: false,
      phase: 'unsupported', active: false, verified: false, recoveryPending: false,
      componentState: -1, launcherResolved: false, launcherCacheVerified: false,
      error: '桌面图标隐藏仅支持 Android 本机版本',
    }
  },
  async recentTasks(): Promise<RecentTasksStatus> {
    return native ? plugin.getRecentTasksStatus() : {
      supported: false, requested: false, preferenceEnabled: false, recoveryAvailable: false,
      phase: 'unsupported', active: false, verified: false, recoveryPending: false,
      error: '最近任务卡隐藏仅支持 Android 本机版本',
    }
  },
  async status(): Promise<ProtectionStatus> {
    if (native) return plugin.protectionStatus()
    return { supported: false, authorized: false, connected: false, active: false,
      preferenceEnabled: false, state: 'unsupported', reason: '应用限制仅支持 Android 本机版本', effectiveWhitelist: [],
      engine: 'none', usageStatsGranted: false, overlayGranted: false, accessibilityAuthorized: false, accessibilityConnected: false,
      antiClose: { supported: false, authorized: false, connected: false, active: false, preferenceEnabled: false,
        requested: false, state: 'unsupported', reason: '精确防关闭仅支持 Android 本机无障碍服务', lastReturnedAt: null,
        lastTarget: null, identity: {}, systemUninstallBlocked: false, policyReason: '浏览器不具备设备管理身份', supportScope: 'Android 本机' },
      navigation: { supported: false, authorized: false, connected: false, active: false, preferenceEnabled: false,
        requested: false, state: 'unsupported', reason: '桌面与最近任务限制仅支持 Android 本机无障碍服务',
        lastReturnedAt: null, lastTarget: null } }
  },
  async apps(): Promise<ProtectionApp[]> {
    return native ? (await plugin.listProtectionApps()).apps : []
  },
  async openSettings(target?: ProtectionSettingsTarget) {
    if (native) await plugin.openProtectionSettings(target ? { target } : undefined)
  },
}

export const consumeFocusReturn = async () => native ? (await plugin.consumeFocusReturn()).requested : false
export const consumeLockReturn = async () => native ? (await plugin.consumeLockReturn()).requested : false
export const consumeRecoveryReturn = async () => native ? (await plugin.consumeRecoveryReturn()).requested : false
export const recoveryDriver = {
  async preview(): Promise<RecoverySnapshot> {
    return native ? plugin.previewRecovery() : { supported: false, revision: '', steps: [], pending: false }
  },
  async confirm(revision: string): Promise<RecoverySnapshot> {
    if (!native) throw new Error('故障恢复仅支持 Android 本机版本')
    return plugin.confirmRecovery({ revision })
  },
}

export const temporaryAccessDriver = {
  async grant(options: TemporaryAccessRequest): Promise<TemporaryAccessResult> {
    if (!native) throw new Error('临时放行仅支持 Android 本机版本')
    return plugin.grantTemporaryAccess(options)
  },
}

export const syncFocusOverlayState = async (route: string): Promise<void> => {
  if (!native || typeof plugin.setFocusOverlayState !== 'function') return
  await plugin.setFocusOverlayState({ route }).catch(() => {})
}

export const onNativeOverlayEvent = async (handlers: {
  onNavigate?: (path: string) => void
  onSessionChanged?: () => void
}): Promise<() => void> => {
  if (!native || typeof plugin.addListener !== 'function') return () => {}
  const handles: Array<{ remove: () => Promise<void> }> = []
  if (handlers.onNavigate) {
    handles.push(
      await plugin.addListener('overlayNavigate', (data) => {
        if (data?.path) handlers.onNavigate?.(data.path)
      }),
    )
  }
  if (handlers.onSessionChanged) {
    handles.push(
      await plugin.addListener('sessionChanged', () => {
        handlers.onSessionChanged?.()
      }),
    )
  }
  return () => {
    for (const h of handles) void h.remove().catch(() => {})
  }
}

export const keepAliveDriver = {
  async guide(): Promise<KeepAliveGuide> {
    if (native && typeof plugin.getKeepAliveGuide === 'function') {
      return plugin.getKeepAliveGuide()
    }
    return {
      brand: 'generic',
      brandLabel: '标准 Android',
      foregroundServiceActive: false,
      batteryOptimizationIgnored: false,
      hasAutoStartSurface: false,
      autoStartHint: '在系统应用详情中允许后台运行与电池不受限制（如设备提供自启动开关请一并打开）。',
      recentLockHint: '打开最近任务 → 长按或点击小猫专注卡片菜单，选择「锁定 / 保持打开」（若系统支持）。',
      hideRecentsConflict: false,
    }
  },
  async openSettings(target: 'battery' | 'autostart' | 'appDetails'): Promise<boolean> {
    if (!native || typeof plugin.openKeepAliveSettings !== 'function') return false
    return (await plugin.openKeepAliveSettings({ target })).opened
  },
}

export const deviceAdminDriver = {
  async status(): Promise<DeviceAdminStatus> {
    if (native && typeof plugin.getDeviceAdminStatus === 'function') {
      return plugin.getDeviceAdminStatus()
    }
    return {
      supported: false,
      active: false,
      preferenceEnabled: false,
      state: 'unsupported',
      reason: '防卸载保护仅支持 Android 本机版本',
    }
  },
  async requestActivation(): Promise<boolean> {
    if (!native || typeof plugin.requestDeviceAdmin !== 'function') return false
    return (await plugin.requestDeviceAdmin()).opened
  },
  async deactivate(): Promise<DeviceAdminStatus> {
    if (native && typeof plugin.deactivateDeviceAdmin === 'function') {
      return plugin.deactivateDeviceAdmin()
    }
    return {
      supported: false,
      active: false,
      preferenceEnabled: false,
      state: 'unsupported',
      reason: '防卸载保护仅支持 Android 本机版本',
    }
  },
}
