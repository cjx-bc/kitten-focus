import type { ProtectionPreferences, ProtectionStatus } from './model'
import { migrateProtectionPreferences, resolveEffectiveProtection } from './protectionModules'

export interface StudyCapsuleDisplay {
  text: '学霸模式 · 关' | '学霸模式 · 开' | '学霸模式 · 待授权'
  tone: 'off' | 'enabled' | 'warning'
  masterOn: boolean
}

export function capabilityToggleDisabled(selected: boolean, supported: boolean | undefined, busy: boolean) {
  // Unsupported saved selections must still be switchable off.
  return busy || (!selected && supported !== true)
}

export function studyCapsuleDisplay(
  protection?: Partial<ProtectionPreferences> | null,
  status?: ProtectionStatus | null,
): StudyCapsuleDisplay {
  const migrated = migrateProtectionPreferences(protection ?? undefined)
  const masterOn = Boolean(migrated.modules?.master)
  if (!masterOn) return { text: '学霸模式 · 关', tone: 'off', masterOn: false }

  const effective = resolveEffectiveProtection(migrated)
  const needsAccessibility =
    effective.study ||
    effective.enhancements.includes('navigationHomeRecents') ||
    effective.enhancements.includes('preciseAntiClose')

  if (needsAccessibility && status?.supported === true && (!status.authorized || !status.connected)) {
    return { text: '学霸模式 · 待授权', tone: 'warning', masterOn: true }
  }
  return { text: '学霸模式 · 开', tone: 'enabled', masterOn: true }
}

export function studyDisplay(selected: boolean, requested: boolean, withdrawn: boolean,
  status: ProtectionStatus | null, readFailed = false) {
  if (withdrawn || (requested && status?.state === 'recovered')) return { text: '已撤销', tone: 'off' }
  if (!selected && !requested) return { text: '未开启', tone: 'off' }
  if (readFailed) return { text: '状态异常', tone: 'warning' }
  if (!status) return { text: '检查中', tone: 'off' }
  if (!status.supported) return { text: '不支持', tone: 'warning' }
  if (requested && status.active && status.state === 'protecting') return { text: '保护中', tone: 'enabled' }
  if (status.state === 'failed' || (requested && (!status.authorized || !status.connected))) return { text: '已失效', tone: 'warning' }
  if (!status.authorized) return { text: '待授权', tone: 'warning' }
  if (!status.connected) return { text: '待连接', tone: 'warning' }
  if (requested) return { text: '待生效', tone: 'off' }
  return { text: '已开启', tone: 'enabled' }
}
