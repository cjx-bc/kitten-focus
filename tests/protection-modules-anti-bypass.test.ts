import { describe, expect, it } from 'vitest'
import { defaultProtection, emptyData } from '../src/domain/model'
import {
  getModuleSubItems,
  migrateProtectionPreferences,
  moduleSummaryText,
  resolveEffectiveProtection,
  setProtectionSubItem,
  syncLegacyFlatMutation,
  toggleMasterStudy,
  toggleProtectionModule,
} from '../src/domain/protectionModules'
import { collectRequiredPermissions } from '../src/domain/studyPermissions'
import { makeBackup, readBackup } from '../src/domain/backup'

describe('anti-bypass folded options & backup compatibility', () => {
  it('defaults strictSettings, deviceAdmin, and rebootResume to false and maps enhancements cleanly', () => {
    let p = toggleMasterStudy(defaultProtection(), true, { quietDefault: false })
    p = toggleProtectionModule(p, 'strict', true)

    const initialSub = getModuleSubItems('strict', p.modules?.strict)
    expect(initialSub.strictSettings).toBe(false)
    expect(initialSub.deviceAdmin).toBe(false)
    expect(initialSub.rebootResume).toBe(false)
    expect(moduleSummaryText('strict', p)).toBe('默认 · 3 项')

    p = setProtectionSubItem(p, 'strict', 'strictSettings', true)
    p = setProtectionSubItem(p, 'strict', 'deviceAdmin', true)
    p = setProtectionSubItem(p, 'strict', 'rebootResume', true)

    const eff = resolveEffectiveProtection(p)
    expect(eff.enhancements).toContain('strictSettingsGuard')
    expect(eff.enhancements).toContain('deviceAdminAntiUninstall')
    expect(eff.enhancements).toContain('rebootResumeLock')

    const mutated = syncLegacyFlatMutation(p, (flat) => {
      flat.enhancements = flat.enhancements.filter((item) => item !== 'deviceAdminAntiUninstall')
    })
    const migrated = migrateProtectionPreferences(mutated)
    expect(getModuleSubItems('strict', migrated.modules?.strict).deviceAdmin).toBe(false)
    expect(getModuleSubItems('strict', migrated.modules?.strict).strictSettings).toBe(true)
    expect(getModuleSubItems('strict', migrated.modules?.strict).rebootResume).toBe(true)
  })

  it('roundtrips folded strict sub-keys through backup validation', () => {
    const data = emptyData()
    let p = toggleMasterStudy(defaultProtection(), true, { quietDefault: false })
    p = toggleProtectionModule(p, 'strict', true)
    p = setProtectionSubItem(p, 'strict', 'strictSettings', true)
    p = setProtectionSubItem(p, 'strict', 'deviceAdmin', true)
    p = setProtectionSubItem(p, 'strict', 'rebootResume', true)
    data.preferences.protection = p

    const restored = readBackup(makeBackup(data)).data
    const sub = getModuleSubItems('strict', restored.preferences.protection?.modules?.strict)
    expect(sub.strictSettings).toBe(true)
    expect(sub.deviceAdmin).toBe(true)
    expect(sub.rebootResume).toBe(true)
  })

  it('attributes strictSettings to accessibility without blocking focus start on keep-alive or deviceAdmin', () => {
    let p = toggleMasterStudy(defaultProtection(), true, { quietDefault: false })
    p = toggleProtectionModule(p, 'apps', false)
    p = toggleProtectionModule(p, 'strict', true)
    p = setProtectionSubItem(p, 'strict', 'strictSettings', true)
    p = setProtectionSubItem(p, 'strict', 'deviceAdmin', true)
    p = setProtectionSubItem(p, 'strict', 'rebootResume', true)

    const perms = collectRequiredPermissions(p, {
      protection: {
        supported: true,
        authorized: false,
        connected: false,
        active: false,
        preferenceEnabled: false,
        state: 'authorization',
        reason: '',
        effectiveWhitelist: [],
        engine: 'none',
        usageStatsGranted: false,
        overlayGranted: false,
        accessibilityAuthorized: false,
        accessibilityConnected: false,
      },
      dnd: null,
      notification: null,
    })

    const accessItem = perms.find((item) => item.id === 'accessibility')
    expect(accessItem?.usedBy).toContain('严格模式 · 严格权限目录防撤权')
    expect(perms.some((item) => String(item.id).includes('deviceAdmin'))).toBe(false)
    expect(perms.some((item) => String(item.id).includes('keepAlive'))).toBe(false)
  })
})
