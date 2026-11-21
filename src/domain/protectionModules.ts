import {
  defaultProtection,
  type AppsSubKey,
  type ModulePref,
  type ProtectionEnhancementKey,
  type ProtectionModuleKey,
  type ProtectionModules,
  type ProtectionPreferences,
  type QuietSubKey,
  type StrictSubKey,
} from './model'

export const APPS_SUB_KEYS: readonly AppsSubKey[] = ['restrict', 'temporaryAccess']
export const STRICT_SUB_KEYS: readonly StrictSubKey[] = [
  'noPauseEnd',
  'navigation',
  'antiClose',
  'hideRecents',
  'hideLauncher',
  'wallpaper',
]
export const QUIET_SUB_KEYS: readonly QuietSubKey[] = ['sound', 'intercept', 'whitelistPass']

export const RECOMMENDED_MODULE_DEFAULTS = {
  apps: { restrict: true, temporaryAccess: true } as Record<AppsSubKey, boolean>,
  strict: {
    noPauseEnd: true,
    navigation: true,
    antiClose: true,
    hideRecents: false,
    hideLauncher: false,
    wallpaper: false,
  } as Record<StrictSubKey, boolean>,
  quiet: { sound: true, intercept: true, whitelistPass: true } as Record<QuietSubKey, boolean>,
} as const

export const STRICT_ENHANCEMENT_MAP: Record<
  Exclude<StrictSubKey, 'noPauseEnd'>,
  ProtectionEnhancementKey
> = {
  navigation: 'navigationHomeRecents',
  antiClose: 'preciseAntiClose',
  hideRecents: 'recentTasksHidden',
  hideLauncher: 'launcherIconHidden',
  wallpaper: 'wallpaperProtection',
}

const VALID_SUB_KEYS: Record<ProtectionModuleKey, readonly string[]> = {
  apps: APPS_SUB_KEYS,
  strict: STRICT_SUB_KEYS,
  quiet: QUIET_SUB_KEYS,
}

function emptyModules(): ProtectionModules {
  return {
    master: false,
    initialized: false,
    apps: { enabled: false },
    strict: { enabled: false },
    quiet: { enabled: false },
  }
}

function cleanCustom<K extends string>(
  moduleKey: ProtectionModuleKey,
  rawCustom: unknown,
): Partial<Record<K, boolean>> | undefined {
  if (!rawCustom || typeof rawCustom !== 'object' || Array.isArray(rawCustom)) return undefined
  const allowed = VALID_SUB_KEYS[moduleKey]
  const defaults = RECOMMENDED_MODULE_DEFAULTS[moduleKey] as Record<string, boolean>
  const out: Partial<Record<K, boolean>> = {}
  let hasAny = false
  for (const key of allowed) {
    const val = (rawCustom as Record<string, unknown>)[key]
    if (typeof val === 'boolean' && val !== defaults[key]) {
      out[key as K] = val
      hasAny = true
    }
  }
  return hasAny ? out : undefined
}

function cloneModule<K extends string>(
  moduleKey: ProtectionModuleKey,
  mod?: Partial<ModulePref<K>>,
): ModulePref<K> {
  const enabled = Boolean(mod?.enabled)
  const custom = cleanCustom<K>(moduleKey, mod?.custom)
  return custom ? { enabled, custom } : { enabled }
}

function diffFromDefaults<K extends string>(
  moduleKey: ProtectionModuleKey,
  values: Record<K, boolean>,
): Partial<Record<K, boolean>> | undefined {
  const defaults = RECOMMENDED_MODULE_DEFAULTS[moduleKey] as Record<string, boolean>
  const out: Partial<Record<K, boolean>> = {}
  let hasDiff = false
  for (const key of VALID_SUB_KEYS[moduleKey]) {
    if (values[key as K] !== defaults[key]) {
      out[key as K] = values[key as K]
      hasDiff = true
    }
  }
  return hasDiff ? out : undefined
}

export function isMasterFocusLockActive(prefs?: Partial<ProtectionPreferences>): boolean {
  if (!prefs) return false
  if (prefs.study === true) return true
  if (prefs.modules?.master === true && prefs.modules?.focusLock !== false) return true
  return false
}

export function getModuleSubItems(
  moduleKey: 'apps',
  mod?: ModulePref<AppsSubKey>,
): Record<AppsSubKey, boolean>
export function getModuleSubItems(
  moduleKey: 'strict',
  mod?: ModulePref<StrictSubKey>,
): Record<StrictSubKey, boolean>
export function getModuleSubItems(
  moduleKey: 'quiet',
  mod?: ModulePref<QuietSubKey>,
): Record<QuietSubKey, boolean>
export function getModuleSubItems(
  moduleKey: ProtectionModuleKey,
  mod?: ModulePref<string>,
): Record<string, boolean>
export function getModuleSubItems(
  moduleKey: ProtectionModuleKey,
  mod?: ModulePref<string>,
): Record<string, boolean> {
  const defaults = RECOMMENDED_MODULE_DEFAULTS[moduleKey] as Record<string, boolean>
  const result: Record<string, boolean> = { ...defaults }
  if (mod?.custom) {
    for (const key of VALID_SUB_KEYS[moduleKey]) {
      const override = mod.custom[key]
      if (typeof override === 'boolean') result[key] = override
    }
  }
  return result
}

export function isModuleCustomized(
  moduleKey: ProtectionModuleKey,
  mod?: ModulePref<string>,
): boolean {
  if (!mod?.custom) return false
  const defaults = RECOMMENDED_MODULE_DEFAULTS[moduleKey] as Record<string, boolean>
  return VALID_SUB_KEYS[moduleKey].some(
    (key) => typeof mod.custom?.[key] === 'boolean' && mod.custom[key] !== defaults[key],
  )
}

export function migrateProtectionPreferences(
  raw?: Partial<ProtectionPreferences>,
): ProtectionPreferences {
  const base = { ...defaultProtection(), ...raw }
  const globalWhitelist = [
    ...new Set((base.globalWhitelist ?? []).filter((p) => typeof p === 'string' && p.trim())),
  ]
  const rawEnhancements = [...(base.enhancements ?? [])]
  const lockMain = rawEnhancements.includes('lockMainInterfaceRestricted')

  if (raw?.modules) {
    const modules: ProtectionModules = {
      master: Boolean(raw.modules.master),
      initialized: Boolean(raw.modules.initialized ?? raw.modules.master),
      apps: cloneModule('apps', raw.modules.apps),
      strict: cloneModule('strict', raw.modules.strict),
      quiet: cloneModule('quiet', raw.modules.quiet),
    }
    if (typeof raw.modules.focusLock === 'boolean') {
      modules.focusLock = raw.modules.focusLock
    }
    return expandModulesToFlat({
      ...base,
      globalWhitelist,
      enhancements: lockMain ? ['lockMainInterfaceRestricted'] : [],
      modules,
    })
  }

  const enhSet = new Set(rawEnhancements)
  const appsEnabled = Boolean(base.study)
  const strictValues: Record<StrictSubKey, boolean> = {
    noPauseEnd: Boolean(base.strict),
    navigation: enhSet.has('navigationHomeRecents'),
    antiClose: enhSet.has('preciseAntiClose'),
    hideRecents: enhSet.has('recentTasksHidden'),
    hideLauncher: enhSet.has('launcherIconHidden'),
    wallpaper: enhSet.has('wallpaperProtection'),
  }
  const strictEnabled = Object.values(strictValues).some(Boolean)
  const quietValues: Record<QuietSubKey, boolean> = {
    sound: Boolean(base.dnd),
    intercept: Boolean(base.interceptNotifications),
    whitelistPass: true,
  }
  const quietEnabled = Boolean(base.dnd) || Boolean(base.interceptNotifications)
  const master = appsEnabled || strictEnabled || quietEnabled

  const strictCustom = strictEnabled ? diffFromDefaults('strict', strictValues) : undefined
  const quietCustom = quietEnabled ? diffFromDefaults('quiet', quietValues) : undefined

  const modules: ProtectionModules = {
    master,
    initialized: master,
    apps: { enabled: appsEnabled },
    strict: strictCustom
      ? { enabled: strictEnabled, custom: strictCustom }
      : { enabled: strictEnabled },
    quiet: quietCustom
      ? { enabled: quietEnabled, custom: quietCustom }
      : { enabled: quietEnabled },
  }
  // Legacy users who had only DND / notifications / strict (without study: true)
  // must NOT unexpectedly gain focus-page locking on upgrade.
  if (master && !appsEnabled) {
    modules.focusLock = false
  }

  return expandModulesToFlat({
    ...base,
    globalWhitelist,
    enhancements: lockMain ? ['lockMainInterfaceRestricted'] : [],
    modules,
  })
}

function expandModulesToFlat(prefs: ProtectionPreferences): ProtectionPreferences {
  const modules = prefs.modules ?? emptyModules()
  const master = Boolean(modules.master)
  const lockMain = (prefs.enhancements ?? []).includes('lockMainInterfaceRestricted')
  const enhancements: string[] = []
  if (lockMain) enhancements.push('lockMainInterfaceRestricted')

  if (!master) {
    return {
      study: false,
      strict: false,
      dnd: false,
      interceptNotifications: false,
      globalWhitelist: [...prefs.globalWhitelist],
      enhancements,
      modules,
    }
  }

  const apps = getModuleSubItems('apps', modules.apps)
  const strict = getModuleSubItems('strict', modules.strict)
  const quiet = getModuleSubItems('quiet', modules.quiet)

  if (modules.strict.enabled) {
    for (const [subKey, enhKey] of Object.entries(STRICT_ENHANCEMENT_MAP)) {
      if (strict[subKey as Exclude<StrictSubKey, 'noPauseEnd'>]) enhancements.push(enhKey)
    }
  }

  return {
    study: modules.apps.enabled && apps.restrict,
    strict: modules.strict.enabled && strict.noPauseEnd,
    dnd: modules.quiet.enabled && quiet.sound,
    interceptNotifications: modules.quiet.enabled && quiet.intercept,
    globalWhitelist: [...prefs.globalWhitelist],
    enhancements,
    modules,
  }
}

export function resolveEffectiveProtection(
  prefs?: Partial<ProtectionPreferences>,
): ProtectionPreferences {
  if (!prefs?.modules) return migrateProtectionPreferences(prefs)
  return expandModulesToFlat(migrateProtectionPreferences(prefs))
}

export function toggleMasterStudy(
  prefs: Partial<ProtectionPreferences>,
  enabled: boolean,
  options?: {
    appsDefault?: boolean
    strictDefault?: boolean
    quietDefault?: boolean
    quietSubDefaults?: Partial<Record<QuietSubKey, boolean>>
  },
): ProtectionPreferences {
  const current = migrateProtectionPreferences(prefs)
  const modules = structuredClone(current.modules ?? emptyModules())
  if (enabled && !modules.initialized) {
    modules.master = true
    modules.initialized = true
    delete modules.focusLock
    modules.apps = cloneModule('apps', {
      ...modules.apps,
      enabled: modules.apps.enabled || (options?.appsDefault ?? true),
    })
    modules.strict = cloneModule('strict', {
      ...modules.strict,
      enabled: modules.strict.enabled || (options?.strictDefault ?? false),
    })
    const quietEnabled = modules.quiet.enabled || (options?.quietDefault ?? true)
    if (options?.quietSubDefaults && !isModuleCustomized('quiet', modules.quiet)) {
      const mergedQuiet: Record<QuietSubKey, boolean> = {
        ...RECOMMENDED_MODULE_DEFAULTS.quiet,
        ...options.quietSubDefaults,
      }
      const custom = diffFromDefaults('quiet', mergedQuiet)
      modules.quiet = custom ? { enabled: quietEnabled, custom } : { enabled: quietEnabled }
    } else {
      modules.quiet = cloneModule('quiet', { ...modules.quiet, enabled: quietEnabled })
    }
  } else {
    modules.master = enabled
    if (enabled) {
      modules.initialized = true
      delete modules.focusLock
    }
  }
  return expandModulesToFlat({ ...current, modules })
}

export function toggleProtectionModule(
  prefs: Partial<ProtectionPreferences>,
  moduleKey: ProtectionModuleKey,
  enabled: boolean,
): ProtectionPreferences {
  const current = migrateProtectionPreferences(prefs)
  const modules = structuredClone(current.modules ?? emptyModules())
  if (moduleKey === 'apps') {
    modules.apps = cloneModule('apps', { ...modules.apps, enabled })
    if (enabled && modules.master) delete modules.focusLock
  } else if (moduleKey === 'strict') {
    modules.strict = cloneModule('strict', { ...modules.strict, enabled })
  } else {
    modules.quiet = cloneModule('quiet', { ...modules.quiet, enabled })
  }
  return expandModulesToFlat({ ...current, modules })
}

export function setProtectionSubItem(
  prefs: Partial<ProtectionPreferences>,
  moduleKey: ProtectionModuleKey,
  subKey: string,
  value: boolean,
): ProtectionPreferences {
  if (!VALID_SUB_KEYS[moduleKey].includes(subKey)) {
    throw new Error(`未知保护子项: ${moduleKey}.${subKey}`)
  }
  const current = migrateProtectionPreferences(prefs)
  const modules = structuredClone(current.modules ?? emptyModules())
  const mod = modules[moduleKey]
  const nextValues = { ...getModuleSubItems(moduleKey, mod), [subKey]: value }
  const custom = diffFromDefaults(moduleKey, nextValues)
  if (moduleKey === 'apps') {
    modules.apps = custom ? { enabled: mod.enabled, custom } : { enabled: mod.enabled }
  } else if (moduleKey === 'strict') {
    modules.strict = custom ? { enabled: mod.enabled, custom } : { enabled: mod.enabled }
  } else {
    modules.quiet = custom ? { enabled: mod.enabled, custom } : { enabled: mod.enabled }
  }
  return expandModulesToFlat({ ...current, modules })
}

export function resetProtectionModuleDefault(
  prefs: Partial<ProtectionPreferences>,
  moduleKey: ProtectionModuleKey,
): ProtectionPreferences {
  const current = migrateProtectionPreferences(prefs)
  const modules = structuredClone(current.modules ?? emptyModules())
  modules[moduleKey] = { enabled: modules[moduleKey].enabled }
  return expandModulesToFlat({ ...current, modules })
}

export function syncLegacyFlatMutation(
  current: Partial<ProtectionPreferences> | undefined,
  mutateFlat: (flat: ProtectionPreferences) => void,
): ProtectionPreferences {
  const base: ProtectionPreferences = {
    ...defaultProtection(),
    ...current,
    globalWhitelist: [...(current?.globalWhitelist ?? [])],
    enhancements: [...(current?.enhancements ?? [])],
  }
  if (!current?.modules) {
    mutateFlat(base)
    return base
  }
  const before = resolveEffectiveProtection(base)
  const nextFlat: ProtectionPreferences = {
    study: before.study,
    strict: before.strict,
    dnd: before.dnd,
    interceptNotifications: before.interceptNotifications,
    globalWhitelist: [...before.globalWhitelist],
    enhancements: [...before.enhancements],
  }
  mutateFlat(nextFlat)

  let updated = migrateProtectionPreferences(before)
  if (nextFlat.study !== before.study) {
    const mods = structuredClone(updated.modules!)
    if (nextFlat.study) {
      mods.master = true
      mods.initialized = true
      delete mods.focusLock
      mods.apps.enabled = true
      updated = setProtectionSubItem({ ...updated, modules: mods }, 'apps', 'restrict', true)
    } else {
      updated = setProtectionSubItem({ ...updated, modules: mods }, 'apps', 'restrict', false)
    }
  }

  const strictPairs: Array<[StrictSubKey, boolean, boolean]> = [
    ['noPauseEnd', before.strict, nextFlat.strict],
    [
      'navigation',
      before.enhancements.includes('navigationHomeRecents'),
      nextFlat.enhancements.includes('navigationHomeRecents'),
    ],
    [
      'antiClose',
      before.enhancements.includes('preciseAntiClose'),
      nextFlat.enhancements.includes('preciseAntiClose'),
    ],
    [
      'hideRecents',
      before.enhancements.includes('recentTasksHidden'),
      nextFlat.enhancements.includes('recentTasksHidden'),
    ],
    [
      'hideLauncher',
      before.enhancements.includes('launcherIconHidden'),
      nextFlat.enhancements.includes('launcherIconHidden'),
    ],
    [
      'wallpaper',
      before.enhancements.includes('wallpaperProtection'),
      nextFlat.enhancements.includes('wallpaperProtection'),
    ],
  ]
  if (strictPairs.some(([, prev, next]) => prev !== next)) {
    const nextStrictValues: Record<StrictSubKey, boolean> = {
      noPauseEnd: nextFlat.strict,
      navigation: nextFlat.enhancements.includes('navigationHomeRecents'),
      antiClose: nextFlat.enhancements.includes('preciseAntiClose'),
      hideRecents: nextFlat.enhancements.includes('recentTasksHidden'),
      hideLauncher: nextFlat.enhancements.includes('launcherIconHidden'),
      wallpaper: nextFlat.enhancements.includes('wallpaperProtection'),
    }
    const anyStrictOn = Object.values(nextStrictValues).some(Boolean)
    const nextMods = structuredClone(updated.modules!)
    if (anyStrictOn) {
      if (!nextMods.master) {
        nextMods.master = true
        nextMods.initialized = true
        nextMods.focusLock = false
      }
      const custom = diffFromDefaults('strict', nextStrictValues)
      nextMods.strict = custom ? { enabled: true, custom } : { enabled: true }
    } else {
      nextMods.strict = { ...nextMods.strict, enabled: false }
    }
    updated = expandModulesToFlat({ ...updated, modules: nextMods })
  }

  if (
    nextFlat.dnd !== before.dnd ||
    nextFlat.interceptNotifications !== before.interceptNotifications
  ) {
    const nextQuietValues: Record<QuietSubKey, boolean> = {
      ...getModuleSubItems('quiet', updated.modules!.quiet),
      sound: nextFlat.dnd,
      intercept: nextFlat.interceptNotifications,
    }
    const anyQuietOn = nextFlat.dnd || nextFlat.interceptNotifications
    const nextMods = structuredClone(updated.modules!)
    if (anyQuietOn) {
      if (!nextMods.master) {
        nextMods.master = true
        nextMods.initialized = true
        nextMods.focusLock = false
      }
      const custom = diffFromDefaults('quiet', nextQuietValues)
      nextMods.quiet = custom ? { enabled: true, custom } : { enabled: true }
    } else {
      nextMods.quiet = { ...nextMods.quiet, enabled: false }
    }
    updated = expandModulesToFlat({ ...updated, modules: nextMods })
  }

  const hasLockMain = nextFlat.enhancements.includes('lockMainInterfaceRestricted')
  const enh = updated.enhancements.filter((k) => k !== 'lockMainInterfaceRestricted')
  if (hasLockMain) enh.unshift('lockMainInterfaceRestricted')
  return { ...updated, globalWhitelist: [...nextFlat.globalWhitelist], enhancements: enh }
}

export function moduleSummaryText(
  moduleKey: ProtectionModuleKey,
  prefs?: Partial<ProtectionPreferences>,
): string {
  const current = migrateProtectionPreferences(prefs)
  const mod = current.modules?.[moduleKey]
  const prefix = isModuleCustomized(moduleKey, mod) ? '已自定义' : '默认'
  if (moduleKey === 'apps') {
    const count = current.globalWhitelist.length
    if (!mod?.enabled) return `已关闭 · ${count} 个应用`
    return `${prefix} · ${count} 个应用`
  }
  const sub = getModuleSubItems(moduleKey, mod)
  const enabledCount = Object.values(sub).filter(Boolean).length
  if (!mod?.enabled) return `已关闭 · ${prefix}`
  return `${prefix} · ${enabledCount} 项`
}

export function studyActiveSubCount(
  moduleKey: ProtectionModuleKey,
  prefs?: Partial<ProtectionPreferences>,
): number {
  const current = migrateProtectionPreferences(prefs)
  const mod = current.modules?.[moduleKey]
  if (!mod?.enabled) return 0
  return Object.values(getModuleSubItems(moduleKey, mod)).filter(Boolean).length
}
