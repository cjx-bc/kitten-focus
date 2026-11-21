import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { emptyData, type FocusItem, type FocusSnapshot, type Theme } from '../src/domain/model'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  replace: vi.fn(),
  syncReminders: vi.fn(),
  focusStart: vi.fn(),
  focusAction: vi.fn(),
  restRead: vi.fn(),
  restStart: vi.fn(),
  restExit: vi.fn(),
  lockStart: vi.fn(),
  lockRead: vi.fn(),
  lockFinish: vi.fn(),
  protectionApps: vi.fn(),
  protectionStatus: vi.fn(),
  permissionStatus: vi.fn(),
}))

vi.mock('../src/platform/bridge', () => ({
  repository: {
    load: (...args: unknown[]) => mocks.load(...args),
    save: (...args: unknown[]) => mocks.save(...args),
    replace: (...args: unknown[]) => mocks.replace(...args),
  },
  syncReminders: (...args: unknown[]) => mocks.syncReminders(...args),
  focusDriver: {
    start: (...args: unknown[]) => mocks.focusStart(...args),
    action: (...args: unknown[]) => mocks.focusAction(...args),
  },
  restDriver: {
    read: (...args: unknown[]) => mocks.restRead(...args),
    start: (...args: unknown[]) => mocks.restStart(...args),
    exit: (...args: unknown[]) => mocks.restExit(...args),
  },
  lockDriver: {
    start: (...args: unknown[]) => mocks.lockStart(...args),
    read: (...args: unknown[]) => mocks.lockRead(...args),
    finish: (...args: unknown[]) => mocks.lockFinish(...args),
  },
  protectionDriver: {
    apps: (...args: unknown[]) => mocks.protectionApps(...args),
    status: (...args: unknown[]) => mocks.protectionStatus(...args),
  },
  permissionStatus: (...args: unknown[]) => mocks.permissionStatus(...args),
}))

function theme(id: string, name: string, order: number, collapsed = false): Theme {
  return { id, name, color: '#ef4e36', order, collapsed }
}

function item(id: string, themeId: string, title: string, order: number): FocusItem {
  return { id, themeId, title, note: '', mode: 'countdown', minutes: 25, order }
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  vi.useFakeTimers()
  mocks.load.mockResolvedValue(emptyData())
  mocks.save.mockResolvedValue(undefined)
  mocks.replace.mockResolvedValue(undefined)
  mocks.syncReminders.mockResolvedValue(undefined)
  mocks.focusAction.mockResolvedValue({ session: null, elapsedMs: 0 } satisfies FocusSnapshot)
  mocks.restRead.mockResolvedValue({ session: null, remainingMs: 0 })
  mocks.lockRead.mockResolvedValue({ session: null, remainingMs: 0, records: [] })
  mocks.protectionApps.mockResolvedValue([])
  mocks.protectionStatus.mockResolvedValue({ supported: false })
  mocks.permissionStatus.mockResolvedValue({ notifications: false, exactAlarms: false })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('task and theme ordering, saving, and deletion fixes', () => {
  it('keeps moved theme order when saving a stale theme form snapshot or cancelling', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    const data = emptyData()
    data.themes.push(theme('t1', 'A', 0), theme('t2', 'B', 1))
    mocks.load.mockResolvedValueOnce(data)
    await app.init()

    const staleCopy = { ...app.themes[1]! }
    await app.move('theme', 't2', -1)
    expect(app.themes.map((t) => t.id)).toEqual(['t2', 't1'])

    await app.saveTheme({ ...staleCopy, name: 'B-改名', color: '#698caa' })
    expect(app.themes.map((t) => [t.id, t.name, t.color])).toEqual([
      ['t2', 'B-改名', '#698caa'],
      ['t1', 'A', '#ef4e36'],
    ])

    await app.move('theme', 't1', -1)
    expect(app.themes.map((t) => t.id)).toEqual(['t1', 't2'])
    app.dispose()
  })

  it('preserves collapsed state when saving a stale theme copy and applies both queued toggles', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    const data = emptyData()
    data.themes.push(theme('t1', '英语', 0, false))
    mocks.load.mockResolvedValueOnce(data)
    await app.init()

    const staleCopy = { ...app.themes[0]! }
    await app.toggleThemeCollapsed('t1')
    expect(app.themes[0]?.collapsed).toBe(true)

    await app.saveTheme({ ...staleCopy, name: '英语精读' })
    expect(app.themes[0]?.name).toBe('英语精读')
    expect(app.themes[0]?.collapsed).toBe(true)

    const firstTap = app.toggleThemeCollapsed('t1')
    const secondTap = app.toggleThemeCollapsed('t1')
    await Promise.all([firstTap, secondTap])
    expect(mocks.save.mock.calls.slice(-2).map(([snapshot]) => snapshot.themes[0].collapsed))
      .toEqual([false, true])
    expect(app.themes[0]?.collapsed).toBe(true)
    app.dispose()
  })

  it('assigns strictly increasing order after deleting an earlier theme', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    const data = emptyData()
    data.themes.push(
      { ...theme('t0', '已删除', 0), deleted: true },
      theme('t1', '英语', 1),
    )
    mocks.load.mockResolvedValueOnce(data)
    await app.init()

    await app.saveTheme(theme('t2', '数学', 0))
    expect(app.themes.map((t) => [t.id, t.order])).toEqual([
      ['t1', 1],
      ['t2', 2],
    ])
    app.dispose()
  })

  it('keeps moved item order when saving a stale item snapshot, appends when moving theme, and clears removed whitelist', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    const data = emptyData()
    data.themes.push(theme('t1', '英语', 0), theme('t2', '数学', 1))
    data.items.push(
      item('i1', 't1', 'X', 0),
      { ...item('i2', 't1', 'Y', 1), whitelist: { source: 'custom', packages: ['com.dict'] } },
      item('i3', 't2', 'Z', 0),
    )
    mocks.load.mockResolvedValueOnce(data)
    await app.init()

    const staleCopy = structuredClone(app.items.find((i) => i.id === 'i2')!)
    await app.move('item', 'i2', -1)
    expect(app.items.filter((i) => i.themeId === 't1').map((i) => i.id)).toEqual(['i2', 'i1'])

    delete staleCopy.whitelist
    await app.saveItem({ ...staleCopy, title: 'Y-新版', minutes: 45 })
    const updated = app.items.find((i) => i.id === 'i2')!
    expect(updated.title).toBe('Y-新版')
    expect(updated.minutes).toBe(45)
    expect(updated.whitelist).toBeUndefined()
    expect(app.items.filter((i) => i.themeId === 't1').map((i) => i.id)).toEqual(['i2', 'i1'])

    await app.saveItem({ ...updated, themeId: 't2' })
    expect(app.items.filter((i) => i.themeId === 't2').map((i) => i.id)).toEqual(['i3', 'i2'])
    app.dispose()
  })

  it('validates target theme on removeTheme, moves children in display order, and clears event links when deleting', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    const data = emptyData()
    data.themes.push(theme('t1', '英语', 0), theme('t2', '数学', 1), theme('t3', '历史', 2))
    data.items.push(
      item('i1', 't1', '听力', 0),
      item('i2', 't1', '背单词', 1),
      item('i3', 't2', '刷题', 0),
      item('i4', 't3', '年表', 0),
    )
    data.events.push({
      id: 'e1',
      title: '背年表',
      start: '2026-11-21T09:00',
      end: '2026-11-21T10:00',
      allDay: false,
      note: '',
      repeat: 'none',
      weekdays: [],
      until: '',
      itemId: 'i4',
      reminderMinutes: null,
    })
    mocks.load.mockResolvedValueOnce(data)
    await app.init()

    await app.move('item', 'i2', -1)
    await expect(app.removeTheme('t1', 't1')).rejects.toThrow('目标主题不存在')
    await expect(app.removeTheme('t1', 'missing')).rejects.toThrow('目标主题不存在')
    expect(app.themes.some((t) => t.id === 't1')).toBe(true)

    await app.removeTheme('t1', 't2')
    expect(app.themes.some((t) => t.id === 't1')).toBe(false)
    expect(app.items.filter((i) => i.themeId === 't2').map((i) => i.id)).toEqual(['i3', 'i2', 'i1'])

    await app.removeTheme('t3', null)
    expect(app.items.some((i) => i.id === 'i4')).toBe(false)
    expect(app.data.events[0]?.itemId).toBeNull()
    app.dispose()
  })

  it('creates theme and item atomically via saveItemWithNewTheme and rolls back if item validation fails', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    await app.init()

    await expect(
      app.saveItemWithNewTheme(
        { name: '英语', color: '#ef4e36' },
        item('i1', '', '   ', 0),
      ),
    ).rejects.toThrow('请填写待办名称')
    expect(app.themes).toHaveLength(0)
    expect(app.items).toHaveLength(0)

    await app.saveItemWithNewTheme(
      { name: '英语', color: '#ef4e36' },
      item('i1', '', '背单词', 0),
    )
    expect(app.themes).toHaveLength(1)
    expect(app.items).toHaveLength(1)
    expect(app.items[0]?.themeId).toBe(app.themes[0]?.id)

    await app.saveItemWithNewTheme(
      { name: '词汇', color: '#7b9a80' },
      { ...app.items[0]!, title: '精背单词' },
    )
    expect(app.themes).toHaveLength(2)
    expect(app.items).toHaveLength(1)
    expect(app.items[0]?.title).toBe('精背单词')
    expect(app.items[0]?.themeId).toBe(app.themes[1]?.id)
    app.dispose()
  })
})
