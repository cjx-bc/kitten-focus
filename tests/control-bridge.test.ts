import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ActiveFocus } from '../src/domain/model'

// IndexedDB is the external storage boundary. Return copies, as IndexedDB does.
const storage = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb', () => {
  const store = {
    get: async (key: string) => structuredClone(storage.get(key)),
    put: async (value: unknown, key: string) => {
      storage.set(key, structuredClone(value))
    },
    delete: async (key: string) => {
      storage.delete(key)
    },
  }
  return {
    openDB: async () => ({
      get: async (_name: string, key: string) => store.get(key),
      put: async (_name: string, value: unknown, key: string) => store.put(value, key),
      delete: async (_name: string, key: string) => store.delete(key),
      transaction: () => ({ store, done: Promise.resolve() }),
    }),
  }
})

beforeEach(() => {
  storage.clear()
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-15T08:00:00Z'))
})
afterEach(() => vi.useRealTimers())

function session(mode: ActiveFocus['mode'] = 'countdown'): ActiveFocus {
  return {
    id: 'focus-one',
    itemId: null,
    themeId: null,
    title: '自由专注',
    themeName: '自由专注',
    color: '#222222',
    mode,
    targetMs: 60000,
    startedAt: Date.now(),
    timeZone: 'UTC',
    state: 'running',
    elapsedMs: 0,
    pausedMs: 0,
    anchorMono: Date.now(),
    anchorEpoch: Date.now(),
    bootId: 0,
    segments: [],
  }
}

it('rejects saved task-card hiding on the browser before creating a session', async () => {
  const { focusDriver, controlDriver, repository } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  const data = emptyData()
  data.preferences.protection = { ...defaultProtection(), enhancements: ['recentTasksHidden'] }
  await repository.save(data)
  await expect(focusDriver.start(session())).rejects.toThrow('最近任务')
  expect((await controlDriver.observe()).owner).toBeNull()
  expect((await repository.load()).preferences.protection?.enhancements).toEqual(['recentTasksHidden'])
})

it('observes an expired countdown without settling it or creating a rest or record', async () => {
  const { focusDriver, controlDriver, repository } = await import('../src/platform/bridge')
  await focusDriver.start(session())
  vi.advanceTimersByTime(90000)

  for (let i = 0; i < 3; i++) {
    const observed = await controlDriver.observe()
    expect(observed).toMatchObject({
      owner: 'focus',
      needsReconcile: true,
      focus: { session: { id: 'focus-one', state: 'running', elapsedMs: 0 }, elapsedMs: 60000 },
      rest: { session: null, remainingMs: 0 },
    })
    expect((await repository.load()).records).toEqual([])
  }

  const settled = await focusDriver.action('read')
  expect(settled.record).toMatchObject({ id: 'focus-one', status: 'completed', durationMs: 60000 })
  expect((await controlDriver.observe()).rest.remainingMs).toBe(270000)
  expect((await repository.load()).records).toHaveLength(1)
})

it('keeps paused focus ownership and excludes paused time before passing ownership to rest', async () => {
  const { focusDriver, restDriver, controlDriver, repository } =
    await import('../src/platform/bridge')
  await focusDriver.start(session('stopwatch'))
  vi.advanceTimersByTime(12000)
  await focusDriver.action('pause')
  vi.advanceTimersByTime(25000)
  expect(await controlDriver.observe()).toMatchObject({
    owner: 'focus',
    needsReconcile: false,
    focus: { session: { state: 'paused' }, elapsedMs: 12000 },
  })
  await expect(focusDriver.start({ ...session(), id: 'another' })).rejects.toThrow()
  await focusDriver.action('resume')
  vi.advanceTimersByTime(8000)
  expect((await focusDriver.action('finish')).record).toMatchObject({
    status: 'completed',
    durationMs: 20000,
    pausedMs: 25000,
  })
  expect(await controlDriver.observe()).toMatchObject({
    owner: 'rest',
    needsReconcile: false,
    rest: { remainingMs: 300000 },
  })
  await expect(focusDriver.start({ ...session(), id: 'another' })).rejects.toThrow()
  await restDriver.exit()
  expect((await controlDriver.observe()).owner).toBeNull()
  expect((await repository.load()).records).toHaveLength(1)
})
it('refuses requested application protection on the browser rather than starting unprotected', async () => {
  const { focusDriver, repository, controlDriver } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  const data = emptyData()
  data.preferences.protection = { ...defaultProtection(), study: true }
  await repository.save(data)
  await expect(focusDriver.start(session())).rejects.toThrow('Android')
  expect((await controlDriver.observe()).owner).toBeNull()
})

it('refuses precise anti-close outside Android instead of silently ignoring its selected option', async () => {
  const { focusDriver, repository, controlDriver } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  const data = emptyData()
  data.preferences.protection = { ...defaultProtection(), enhancements: ['preciseAntiClose'] }
  await repository.save(data)
  await expect(focusDriver.start(session())).rejects.toThrow('Android')
  expect((await controlDriver.observe()).owner).toBeNull()
})

it('starts from the saved item whitelist and preserves its snapshot across later global and item edits', async () => {
  const { focusDriver, controlDriver, repository } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  const data = emptyData()
  data.preferences.protection = { ...defaultProtection(), globalWhitelist: ['global.tool'] }
  data.items.push({ id: 'reading', themeId: 'study', title: '阅读', note: '', mode: 'countdown', minutes: 25,
    order: 0, whitelist: { source: 'custom', packages: ['reader.tool'] } })
  await repository.save(data)
  const request = { ...session(), itemId: 'reading', protection: { study: true, source: 'global' as const, whitelist: ['forged.tool'] } }
  expect((await focusDriver.start(request)).session?.protection).toEqual({ study: false, source: 'custom', whitelist: ['reader.tool'] })
  data.preferences.protection.globalWhitelist = ['new.global.tool']
  data.items[0]!.whitelist = { source: 'global' }
  await repository.save(data)
  expect((await controlDriver.observe()).focus.session?.protection).toEqual({ study: false, source: 'custom', whitelist: ['reader.tool'] })
  await focusDriver.action('finish')
  expect((await focusDriver.start(request)).session?.protection).toEqual({ study: false, source: 'global', whitelist: ['new.global.tool'] })
})

it('keeps an empty independent whitelist distinct from another item and legacy or free focus', async () => {
  const { focusDriver, repository } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  const data = emptyData()
  data.preferences.protection = { ...defaultProtection(), globalWhitelist: ['global.tool'] }
  data.items.push({ id: 'reading', themeId: 'study', title: 'Reading', note: '', mode: 'countdown', minutes: 25,
    order: 0, whitelist: { source: 'custom', packages: [] } },
    { id: 'math', themeId: 'study', title: 'Math', note: '', mode: 'countdown', minutes: 25, order: 1 })
  await repository.save(data)
  expect((await focusDriver.start({ ...session(), itemId: 'reading' })).session?.protection).toEqual({ study: false, source: 'custom', whitelist: [] })
  await focusDriver.action('finish')
  expect((await focusDriver.start({ ...session(), itemId: 'math' })).session?.protection).toEqual({ study: false, source: 'global', whitelist: ['global.tool'] })
  await focusDriver.action('finish')
  expect((await focusDriver.start(session())).session?.protection).toEqual({ study: false, source: 'global', whitelist: ['global.tool'] })
})
it('rejects requested native navigation enhancement in the browser instead of silently discarding it', async () => {
  const { repository, focusDriver } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  const data = emptyData()
  data.preferences.protection = { ...defaultProtection(), enhancements: ['navigationHomeRecents'] }
  await repository.save(data)
  await expect(focusDriver.start(session())).rejects.toThrow(/Android/)
})


it('refuses launcher icon hiding outside Android and reports its unsupported recovery status', async () => {
  const { focusDriver, repository, controlDriver, protectionDriver } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  const data = emptyData()
  data.preferences.protection = { ...defaultProtection(), enhancements: ['launcherIconHidden'] }
  await repository.save(data)
  await expect(focusDriver.start(session())).rejects.toThrow('Android')
  expect((await controlDriver.observe()).owner).toBeNull()
  expect(await protectionDriver.launcher()).toMatchObject({ supported: false, phase: 'unsupported', verified: false, recoveryReachable: false })
})

it('refuses dnd, notification interception, and wallpaper protection outside Android', async () => {
  const { focusDriver, repository, controlDriver } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  for (const protection of [
    { ...defaultProtection(), dnd: true },
    { ...defaultProtection(), interceptNotifications: true },
    { ...defaultProtection(), enhancements: ['wallpaperProtection'] },
  ]) {
    const data = emptyData()
    data.preferences.protection = protection
    await repository.save(data)
    await expect(focusDriver.start(session())).rejects.toThrow('Android')
    expect((await controlDriver.observe()).owner).toBeNull()
  }
})

it('marks studyLocked in browser session when master study mode is enabled without app restriction', async () => {
  const { focusDriver, repository } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  const { toggleMasterStudy, toggleProtectionModule } = await import('../src/domain/protectionModules')
  const data = emptyData()
  let protection = toggleMasterStudy(defaultProtection(), true, { quietDefault: false })
  protection = toggleProtectionModule(protection, 'apps', false)
  protection = toggleProtectionModule(protection, 'strict', true)
  // Turn off Android-only enhancements in browser preview so browser can run strict countdown
  const { setProtectionSubItem } = await import('../src/domain/protectionModules')
  protection = setProtectionSubItem(protection, 'strict', 'navigation', false)
  protection = setProtectionSubItem(protection, 'strict', 'antiClose', false)
  data.preferences.protection = protection
  await repository.save(data)
  const started = await focusDriver.start(session('countdown'), true)
  expect(started.session?.strictMode).toBe(true)
  expect(started.session?.protection?.study).toBe(false)
  expect(started.session?.protection?.studyLocked).toBe(true)
})

it('Blocker #1: normal countdown confirmed when strict module is off allows early finish even if stale flat strict was true', async () => {
  const { focusDriver, repository } = await import('../src/platform/bridge')
  const { emptyData, defaultProtection } = await import('../src/domain/model')
  const { toggleMasterStudy, toggleProtectionModule } = await import('../src/domain/protectionModules')
  const data = emptyData()
  let protection = toggleMasterStudy(defaultProtection(), true, { quietDefault: false })
  protection = toggleProtectionModule(protection, 'apps', false)
  protection = toggleProtectionModule(protection, 'strict', false)
  // Simulate corrupted/stale flat strict=true while modules.strict.enabled=false
  protection.strict = true
  data.preferences.protection = protection
  await repository.save(data)

  const started = await focusDriver.start(session('countdown'), true)
  expect(started.session?.strictMode).toBe(false)
  const finished = await focusDriver.action('finish')
  expect(finished.session).toBeNull()
})

it('Blocker #2: legacy migrated preference with focusLock=false does not lock focus page in browser session', async () => {
  const { focusDriver, repository } = await import('../src/platform/bridge')
  const { emptyData } = await import('../src/domain/model')
  const { migrateProtectionPreferences } = await import('../src/domain/protectionModules')
  const { isStudySessionLocked } = await import('../src/navigation/mainEntry')
  const data = emptyData()
  // Legacy strict-only (no Android-only capabilities) so browser can start it
  data.preferences.protection = migrateProtectionPreferences({
    study: false,
    strict: true,
    dnd: false,
    interceptNotifications: false,
    globalWhitelist: [],
    enhancements: [],
  })
  expect(data.preferences.protection.modules?.focusLock).toBe(false)
  await repository.save(data)

  const started = await focusDriver.start(session('countdown'), true)
  expect(started.session?.strictMode).toBe(true)
  expect(isStudySessionLocked(started.session)).toBe(false)
})
