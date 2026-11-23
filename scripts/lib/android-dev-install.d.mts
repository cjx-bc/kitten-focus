export const DEFAULT_APP_ID: string
export const ACCESSIBILITY_CLASS: string
export const NOTIFICATION_LISTENER_CLASS: string

export interface CliOptions {
  serial: string
  apk: string
  appId: string
  skipBuild: boolean
  grantOnly: boolean
  noLaunch: boolean
  noToggleAccessibility: boolean
  help: boolean
}

export interface AdbDevice {
  serial: string
  state: string
  model: string
  device: string
  product: string
  isEmulator: boolean
}

export interface ColonListMergeResult {
  existing: string[]
  others: string[]
  alreadyPresent: boolean
  ownComponent: string
  merged: string
  withoutOwn: string
}

export type GrantStepKind = 'adb' | 'notificationListener' | 'accessibilityService'

export interface GrantStep {
  id: string
  label: string
  minSdk: number
  kind: GrantStepKind
  args: string[]
}

export function parseCliArgs(argv: string[]): CliOptions
export function parseAdbDevices(output: string): AdbDevice[]
export function selectDevice(devices: AdbDevice[], explicitSerial?: string): AdbDevice
export function mergeColonList(
  rawValue: string | null | undefined,
  packageName: string,
  serviceClassName: string,
): ColonListMergeResult
export function buildGrantPlan(sdkInt: number, appId?: string): GrantStep[]
export function isOppoPermissionMonitoringError(output: string): boolean
export function classifyInstallError(output: string): string
