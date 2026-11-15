import { Capacitor, registerPlugin } from '@capacitor/core'
import { openDB } from 'idb'
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
} from '../domain/model'
import { emptyData, effectiveWhitelist } from '../domain/model'
import { elapsed, settle } from '../domain/focus'
import { makeRest, readRest, REST_DURATION_MS } from '../domain/rest'

interface NativeBridge {
  startLock(options: { configurationId: string }): Promise<LockSnapshot>
  lockAction(options: { action: 'read' | 'finish'; confirmed: boolean }): Promise<LockSnapshot>
  loadData(): Promise<{ data: AppData | null }>
  saveData(options: { data: AppData }): Promise<void>
  replaceData(options: { data: AppData }): Promise<void>
  startFocus(options: {
    session: ActiveFocus
    strictModeConfirmed?: boolean
  }): Promise<FocusSnapshot>
  focusAction(options: { action: 'read' | 'pause' | 'resume' | 'finish' }): Promise<FocusSnapshot>
  startRest(options: { recordId: string }): Promise<RestSnapshot>
  restAction(options: { action: 'read' | 'exit' }): Promise<RestSnapshot>
  grantTemporaryAccess(options: TemporaryAccessRequest): Promise<TemporaryAccessResult>
  observeControl(): Promise<ControlSnapshot>
  consumeFocusReturn(): Promise<{ requested: boolean }>
  consumeLockReturn(): Promise<{ requested: boolean }>
  protectionStatus(): Promise<ProtectionStatus>
  listProtectionApps(): Promise<{ apps: ProtectionApp[] }>
  openProtectionSettings(): Promise<void>
  previewRecovery(): Promise<RecoverySnapshot>
  confirmRecovery(options: { revision: string }): Promise<RecoverySnapshot>
  consumeRecoveryReturn(): Promise<{ requested: boolean }>
  exportFile(options: { text: string; name: string }): Promise<void>
  importFile(): Promise<{ text: string }>
  permissions(): Promise<{ notifications: boolean; exactAlarms: boolean }>
  requestNotifications(): Promise<{ notifications: boolean }>
  openAlarmSettings(): Promise<void>
  syncReminders(): Promise<void>
}
export const native = Capacitor.isNativePlatform()
const plugin = registerPlugin<NativeBridge>('CatFocus')
export const lockDriver = {
  async start(configurationId: string): Promise<LockSnapshot> {
    if (!native) throw new Error('独立锁机仅支持 Android 本机版本，请在手机上开始')
    return plugin.startLock({ configurationId })
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
    const preferredProtection = (await repository.load()).preferences.protection
    if (preferredProtection?.enhancements?.includes('navigationHomeRecents'))
      throw new Error('桌面与最近任务限制仅支持 Android 本机版本，请关闭此增强后继续')
    if (preferredProtection?.study)
      throw new Error('应用限制仅支持 Android 本机版本，请关闭学霸模式后继续')
    if (browserSession) throw new Error('请先结束当前专注')
    if ((await restDriver.read()).session?.state === 'running')
      throw new Error('请先退出休息，再开始新的专注')
    await restDriver.exit()
    const data: AppData = (await db.get('kv', 'data')) || emptyData()
    const strictMode = data.preferences.protection?.strict === true && session.mode === 'countdown'
    if (strictMode && !strictModeConfirmed)
      throw new Error('请先确认严格倒计时：开始后不能暂停、取消或提前结束')
    browserSession = { ...session, strictMode, protection: { study: false, ...effectiveWhitelist(data, session.itemId) }, anchorMono: Date.now(), bootId: 0 }
    await db.put('kv', browserSession, 'active')
    return { session: browserSession, elapsedMs: 0 }
  },
  async action(action: 'read' | 'pause' | 'resume' | 'finish'): Promise<FocusSnapshot> {
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
    await tx.store.put(result.session, 'active')
    if (result.record) {
      const data: AppData = (await tx.store.get('data')) || emptyData()
      if (
        !data.deletedRecordIds.includes(result.record.id) &&
        !data.records.some((r) => r.id === result.record!.id)
      ) {
        data.records.push(result.record)
        await tx.store.put(data, 'data')
      }
    }
    if (result.record?.status === 'completed') {
      const rest = makeRest(result.record)
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
    const session = makeRest(record, Date.now())
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
    const remainingMs =
      rest?.state === 'running'
        ? Math.max(0, Math.min(REST_DURATION_MS, rest.endsAt - now.epoch))
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
export const permissionStatus = () =>
  native ? plugin.permissions() : Promise.resolve({ notifications: false, exactAlarms: false })
export const requestNotifications = () =>
  native ? plugin.requestNotifications() : Promise.resolve({ notifications: false })
export const openAlarmSettings = () => plugin.openAlarmSettings()
export const syncReminders = () => (native ? plugin.syncReminders() : Promise.resolve())

export const protectionDriver = {
  async status(): Promise<ProtectionStatus> {
    if (native) return plugin.protectionStatus()
    return { supported: false, authorized: false, connected: false, active: false,
      preferenceEnabled: false, state: 'unsupported', reason: '应用限制仅支持 Android 本机版本', effectiveWhitelist: [],
      navigation: { supported: false, authorized: false, connected: false, active: false, preferenceEnabled: false,
        requested: false, state: 'unsupported', reason: '桌面与最近任务限制仅支持 Android 本机无障碍服务',
        lastReturnedAt: null, lastTarget: null } }
  },
  async apps(): Promise<ProtectionApp[]> {
    return native ? (await plugin.listProtectionApps()).apps : []
  },
  async openSettings() {
    if (native) await plugin.openProtectionSettings()
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
