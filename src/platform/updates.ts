import { registerPlugin } from '@capacitor/core'
import { version } from '../../package.json'
import { native } from './bridge'

export interface AppRelease {
  applicationId: string
  versionName: string
  versionCode: number
  minSdk: number
  url: string
  downloadUrls?: string[]
  size: number
  sha256: string
  notes: string
}
export interface UpdateState {
  currentVersion: string
  currentCode: number
  release: AppRelease | null
  downloadRelease: AppRelease | null
  checkedAt: number
  checkError: string
  phase: 'idle' | 'downloading' | 'ready' | 'failed'
  received: number
  total: number
  message: string
  metered: boolean
  canInstall: boolean
}
export interface UpgradeBackup {
  id: string
  createdAt: number
  from: number
  to: number
}
interface UpdatesBridge {
  status(): Promise<UpdateState>
  check(options: { force: boolean }): Promise<UpdateState>
  download(options: { allowMetered: boolean }): Promise<UpdateState>
  cancel(): Promise<UpdateState>
  installPermission(): Promise<void>
  install(): Promise<void>
  backups(): Promise<{ backups: UpgradeBackup[] }>
  exportBackup(options: { id: string }): Promise<{ text: string }>
  restoreBackup(options: { id: string }): Promise<void>
}
const plugin = registerPlugin<UpdatesBridge>('AppUpdates')
export const initialUpdateState = (): UpdateState => ({
  currentVersion: version,
  currentCode: 0,
  release: null,
  downloadRelease: null,
  checkedAt: 0,
  checkError: '',
  phase: 'idle',
  received: 0,
  total: 0,
  message: '',
  metered: false,
  canInstall: false,
})
export const updatesDriver = {
  status: () => (native ? plugin.status() : Promise.resolve(initialUpdateState())),
  check: (force: boolean) =>
    native ? plugin.check({ force }) : Promise.resolve(initialUpdateState()),
  download: (allowMetered: boolean) => plugin.download({ allowMetered }),
  cancel: () => plugin.cancel(),
  installPermission: () => plugin.installPermission(),
  install: () => plugin.install(),
  backups: () => (native ? plugin.backups() : Promise.resolve({ backups: [] })),
  exportBackup: (id: string) => plugin.exportBackup({ id }),
  restoreBackup: (id: string) => plugin.restoreBackup({ id }),
}
