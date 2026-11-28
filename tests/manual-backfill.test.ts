import { describe, expect, it, vi } from 'vitest'
import type { FocusItem, FocusRecord, Theme } from '../src/domain/model'
import { buildManualFocusRecord } from '../src/domain/manualBackfill'
import { projectPetDomain } from '../src/domain/pet'
import { statistics } from '../src/domain/statistics'
import { makeBackup, readBackup } from '../src/domain/backup'
import { emptyData } from '../src/domain/model'

const themes: Theme[] = [
  { id: 't1', name: '数学', color: '#ef4e36', order: 0, collapsed: false },
]
const items: FocusItem[] = [
  { id: 'i1', themeId: 't1', title: '高数刷题', note: '', mode: 'countdown', minutes: 25, order: 0 },
  { id: 'i-del', themeId: 't1', title: '已删除待办', note: '', mode: 'countdown', minutes: 25, order: 1, deleted: true },
]

describe('manual backfill validation & domain isolation', () => {
  const now = new Date('2026-11-27T15:00:00').getTime()

  it('rejects invalid dates, inverted/zero times, future end times, deleted items, and >100 code-point notes', () => {
    expect(() =>
      buildManualFocusRecord({
        itemId: null,
        date: '2026-02-30',
        startTime: '09:00',
        endTime: '09:30',
        items,
        themes,
        now,
      }),
    ).toThrow()

    expect(() =>
      buildManualFocusRecord({
        itemId: null,
        date: '2026-11-27',
        startTime: '10:30',
        endTime: '10:00',
        items,
        themes,
        now,
      }),
    ).toThrow('结束时间必须晚于开始时间')

    expect(() =>
      buildManualFocusRecord({
        itemId: null,
        date: '2026-11-27',
        startTime: '10:00',
        endTime: '10:00',
        items,
        themes,
        now,
      }),
    ).toThrow('结束时间必须晚于开始时间')

    expect(() =>
      buildManualFocusRecord({
        itemId: null,
        date: '2026-11-27',
        startTime: '14:30',
        endTime: '15:05',
        items,
        themes,
        now,
      }),
    ).toThrow('不能晚于当前时刻')

    expect(() =>
      buildManualFocusRecord({
        itemId: null,
        date: '2026-11-28',
        startTime: '09:00',
        endTime: '09:30',
        items,
        themes,
        now,
      }),
    ).toThrow('不能晚于当前时刻')

    expect(() =>
      buildManualFocusRecord({
        itemId: 'i-del',
        date: '2026-11-27',
        startTime: '09:00',
        endTime: '09:30',
        items,
        themes,
        now,
      }),
    ).toThrow('不存在或已删除')

    expect(() =>
      buildManualFocusRecord({
        itemId: null,
        date: '2026-11-27',
        startTime: '09:00',
        endTime: '09:30',
        note: '😀'.repeat(101),
        items,
        themes,
        now,
      }),
    ).toThrow('复盘小结最多 100 字')
  })

  it('builds valid manual FocusRecord for free focus and linked FocusItem, surviving backup round-trip', () => {
    const note100 = '😀'.repeat(100)
    const freeRec = buildManualFocusRecord({
      id: 'manual-free',
      itemId: null,
      date: '2026-11-27',
      startTime: '09:00',
      endTime: '09:45',
      note: note100,
      items,
      themes,
      timeZone: 'Asia/Shanghai',
      now,
    })

    expect(freeRec.source).toBe('manual')
    expect(freeRec.status).toBe('completed')
    expect(freeRec.title).toBe('自由专注')
    expect(freeRec.themeName).toBe('自由专注')
    expect(freeRec.durationMs).toBe(45 * 60_000)
    expect(freeRec.pausedMs).toBe(0)
    expect(freeRec.segments).toEqual([{ start: freeRec.startedAt, end: freeRec.endedAt }])
    expect(freeRec.note).toBe(note100)

    const itemRec = buildManualFocusRecord({
      id: 'manual-item',
      itemId: 'i1',
      date: '2026-11-27',
      startTime: '10:00',
      endTime: '11:00',
      note: '补记一小时刷题',
      items,
      themes,
      timeZone: 'Asia/Shanghai',
      now,
    })
    expect(itemRec.itemId).toBe('i1')
    expect(itemRec.themeId).toBe('t1')
    expect(itemRec.title).toBe('高数刷题')
    expect(itemRec.themeName).toBe('数学')
    expect(itemRec.color).toBe('#ef4e36')
    expect(itemRec.source).toBe('manual')
    expect(itemRec.durationMs).toBe(60 * 60_000)

    const data = emptyData()
    data.themes = themes
    data.items = items.filter((i) => !i.deleted)
    data.records = [freeRec, itemRec]
    const roundTripped = readBackup(makeBackup(data)).data
    expect(roundTripped.records).toHaveLength(2)
    expect(roundTripped.records[0]?.source).toBe('manual')
  })

  it('isolates manual backfill from pet affection, peakAffection, farm count, streaks, and unlocks while counting in stats & weeklyFourColorMatrix', () => {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const timerStart = new Date('2026-11-26T09:00:00').getTime()
    const timerRecord: FocusRecord = {
      id: 'timer-1',
      itemId: 'i1',
      themeId: 't1',
      title: '高数刷题',
      themeName: '数学',
      color: '#ef4e36',
      mode: 'countdown',
      targetMs: 25 * 60_000,
      startedAt: timerStart,
      endedAt: timerStart + 25 * 60_000,
      timeZone: localTz,
      durationMs: 25 * 60_000,
      pausedMs: 0,
      segments: [{ start: timerStart, end: timerStart + 25 * 60_000 }],
      status: 'completed',
      animalId: 'black-cat',
      skinId: 'default',
      source: 'timer',
    }

    const beforeProj = projectPetDomain({
      records: [timerRecord],
      timeZone: localTz,
      now,
    })

    const manualRec = buildManualFocusRecord({
      id: 'manual-2h',
      itemId: 'i1',
      date: '2026-11-27',
      startTime: '10:00',
      endTime: '12:00',
      note: '图书馆忘记开计时',
      items,
      themes,
      now,
    })

    const afterProj = projectPetDomain({
      records: [timerRecord, manualRec],
      timeZone: localTz,
      now,
    })

    expect(afterProj.affection).toBe(beforeProj.affection)
    expect(afterProj.peakAffection).toBe(beforeProj.peakAffection)
    expect(afterProj.totalRaised).toBe(beforeProj.totalRaised)
    expect(afterProj.raisedByAnimal).toEqual(beforeProj.raisedByAnimal)
    expect(afterProj.currentStreakDays).toBe(beforeProj.currentStreakDays)
    expect(afterProj.maxConsecutiveDays).toBe(beforeProj.maxConsecutiveDays)
    expect(afterProj.unlockedAnimals).toEqual(beforeProj.unlockedAnimals)
    expect(afterProj.unlockedSkins).toEqual(beforeProj.unlockedSkins)
    expect(afterProj.weekFarmSlice('2026-11-23').weekTotalCount).toBe(
      beforeProj.weekFarmSlice('2026-11-23').weekTotalCount,
    )

    // Statistics includes manual duration while excluding manual entries from session counts
    const stat = statistics([timerRecord, manualRec], '2026-11-23', '2026-11-29')
    expect(stat.totalMs).toBe((25 + 120) * 60_000)
    expect(stat.count).toBe(1)
    expect(stat.averageMs).toBe(25 * 60_000)
    expect(stat.dailyCounts).toEqual([['2026-11-26', 1]])

    // Weekly four-color matrix marks manual hours on Friday (index 4)
    const matrix = afterProj.weeklyFourColorMatrix('2026-11-23')
    expect(matrix[4]![10]).toMatchObject({ date: '2026-11-27', hour: 10, state: 'manual' })
    expect(matrix[4]![11]).toMatchObject({ date: '2026-11-27', hour: 11, state: 'manual' })
  })
})

describe('exportPngFile', () => {
  it('rejects non-PNG data URLs', async () => {
    const { exportPngFile } = await import('../src/platform/exportPng')
    await expect(exportPngFile('data:text/plain;base64,abc', 'grid.png')).rejects.toThrow('无效的 PNG')
  })

  it('triggers anchor download on web platforms', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:weekly-grid-1')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const click = vi.fn()
    const remove = vi.fn()
    const anchor = { href: '', download: '', click, remove } as unknown as HTMLAnchorElement
    const createElement = vi.fn(() => anchor)
    const appendChild = vi.fn()
    vi.stubGlobal('document', {
      createElement,
      body: { appendChild },
    })

    const { exportPngFile } = await import('../src/platform/exportPng')
    await exportPngFile('data:image/png;base64,iVBORw0KGgo=', 'weekly-grid.png')

    expect(createElement).toHaveBeenCalledWith('a')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blobArg = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(blobArg).toBeInstanceOf(Blob)
    expect(blobArg.type).toBe('image/png')
    expect(anchor.download).toBe('weekly-grid.png')
    expect(anchor.href).toBe('blob:weekly-grid-1')
    expect(click).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('calls native exportBase64File when available and falls back to anchor download if unimplemented', async () => {
    vi.resetModules()
    const exportBase64File = vi.fn().mockResolvedValueOnce(undefined)
    vi.doMock('../src/platform/bridge', () => ({ native: true }))
    vi.doMock('../src/platform/catFocusPlugin', () => ({
      getCatFocusPlugin: () => ({ exportBase64File }),
    }))

    const { exportPngFile } = await import('../src/platform/exportPng')
    await exportPngFile('data:image/png;base64,iVBORw0KGgo=', 'native-grid.png')
    expect(exportBase64File).toHaveBeenCalledWith({
      base64: 'iVBORw0KGgo=',
      name: 'native-grid.png',
      mimeType: 'image/png',
    })

    exportBase64File.mockRejectedValueOnce(new Error('Unimplemented stub method: CatFocus.exportBase64File'))
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fallback-grid-1')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.fn()
    const remove = vi.fn()
    const anchor = { href: '', download: '', click, remove } as unknown as HTMLAnchorElement
    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn() },
    })

    await exportPngFile('data:image/png;base64,iVBORw0KGgo=', 'fallback-grid.png')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(anchor.download).toBe('fallback-grid.png')
    expect(anchor.href).toBe('blob:fallback-grid-1')
    expect(click).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)

    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.doUnmock('../src/platform/bridge')
    vi.doUnmock('../src/platform/catFocusPlugin')
    vi.resetModules()
  })
})
