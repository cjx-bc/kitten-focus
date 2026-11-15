import { Capacitor, registerPlugin } from '@capacitor/core'

export interface NotificationStatus {
  supported: boolean
  authorized: boolean
  connected: boolean
  requested: boolean
  active: boolean
  phase: string
  sessionId: string
  deadlineEpoch: number
  pendingCount: number
  restoredCount: number
  absentCount: number
  presentCount: number
  snoozedCount: number
  releaseRequestedCount: number
  releaseFailedCount: number
  leaseDurationMs: number
  recoveryPending: boolean
  error: string
  reason: string
}
interface NotificationBridge {
  getNotificationStatus(): Promise<NotificationStatus>
  openNotificationAccessSettings(): Promise<void>
  rebindNotificationListener(): Promise<void>
}
const plugin = registerPlugin<NotificationBridge>('CatFocus')
const unsupported: NotificationStatus = {
  supported: false, authorized: false, connected: false, requested: false, active: false,
  phase: 'unsupported', sessionId: '', deadlineEpoch: 0, pendingCount: 0, restoredCount: 0,
  absentCount: 0, presentCount: 0, snoozedCount: 0, releaseRequestedCount: 0, releaseFailedCount: 0, leaseDurationMs: 0, recoveryPending: false, error: '', reason: '需要 Android 8 或更新系统的本机版本',
}
export const notificationDriver = {
  read: () => Capacitor.isNativePlatform() ? plugin.getNotificationStatus() : Promise.resolve({ ...unsupported }),
  openSettings: () => Capacitor.isNativePlatform() ? plugin.openNotificationAccessSettings() : Promise.resolve(),
  rebind: () => Capacitor.isNativePlatform() ? plugin.rebindNotificationListener() : Promise.resolve(),
}
