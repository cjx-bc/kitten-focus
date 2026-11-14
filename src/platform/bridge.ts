import { Capacitor, registerPlugin } from '@capacitor/core'
import { openDB } from 'idb'
import type { ActiveFocus, AppData, FocusSnapshot } from '../domain/model'
import { emptyData } from '../domain/model'
import { settle } from '../domain/focus'

interface NativeBridge {
  loadData(): Promise<{ data: AppData | null }>
  saveData(options: { data: AppData }): Promise<void>
  replaceData(options: { data: AppData }): Promise<void>
  startFocus(options: { session: ActiveFocus }): Promise<FocusSnapshot>
  focusAction(options: { action: 'read' | 'pause' | 'resume' | 'finish' }): Promise<FocusSnapshot>
  exportFile(options: { text: string; name: string }): Promise<void>
  importFile(): Promise<{ text: string }>
  permissions(): Promise<{ notifications: boolean; exactAlarms: boolean }>
  requestNotifications(): Promise<{ notifications: boolean }>
  openAlarmSettings(): Promise<void>
  syncReminders(): Promise<void>
}
export const native = Capacitor.isNativePlatform()
const plugin = registerPlugin<NativeBridge>('CatFocus')
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
    const db = await database()
    const tx = db.transaction('kv', 'readwrite')
    await tx.store.put(data, 'data')
    await tx.store.delete('active')
    await tx.done
    browserSession = null
    initialized = true
  },
}
export const focusDriver = {
  async start(session: ActiveFocus): Promise<FocusSnapshot> {
    if (native) return plugin.startFocus({ session })
    const db = await webReadFocus()
    if (browserSession) throw new Error('请先结束当前专注')
    browserSession = { ...session, anchorMono: Date.now(), bootId: 0 }
    await db.put('kv', browserSession, 'active')
    return { session: browserSession, elapsedMs: 0 }
  },
  async action(action: 'read' | 'pause' | 'resume' | 'finish'): Promise<FocusSnapshot> {
    if (native) return plugin.focusAction({ action })
    const db = await webReadFocus()
    if (!browserSession) return { session: null, elapsedMs: 0 }
    const result = settle(browserSession, clock(), action)
    browserSession = result.session
    await db.put('kv', browserSession, 'active')
    return result
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
