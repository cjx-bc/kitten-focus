import { Capacitor } from '@capacitor/core'
import { getCatFocusPlugin } from './catFocusPlugin'

export interface DndStatus {
  supported: boolean
  permissionGranted: boolean
  requested: boolean
  phase: string
  sessionId: string
  ruleEnabled: boolean
  ruleActive: boolean | null
  verified: boolean
  globalFilter: number
  recoveryPending: boolean
  error: string
}
interface DndBridge {
  getDndStatus(): Promise<DndStatus>
  openDndSettings(): Promise<void>
  restoreDnd(): Promise<DndStatus>
}
const plugin = getCatFocusPlugin<DndBridge>()
const unsupported: DndStatus = {
  supported: false, permissionGranted: false, requested: false, phase: 'unsupported',
  sessionId: '', ruleEnabled: false, ruleActive: null, verified: false,
  globalFilter: 0, recoveryPending: false, error: '',
}
export const dndDriver = {
  read: () => Capacitor.isNativePlatform() ? plugin.getDndStatus() : Promise.resolve({ ...unsupported }),
  openSettings: () => Capacitor.isNativePlatform() ? plugin.openDndSettings() : Promise.resolve(),
  restore: () => Capacitor.isNativePlatform() ? plugin.restoreDnd() : Promise.resolve({ ...unsupported }),
}
