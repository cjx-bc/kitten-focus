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
