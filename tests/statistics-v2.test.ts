import { describe, expect, it } from 'vitest'
import { statistics, yearlyHeatmap } from '../src/domain/statistics'
import type { FocusRecord } from '../src/domain/model'

function makeRecord(overrides: Partial<FocusRecord> & { startIso: string; endIso: string }): FocusRecord {
  const { startIso, endIso, ...rest } = overrides
  const startedAt = Date.parse(startIso)
  const endedAt = Date.parse(endIso)
  return {
    id: `rec-${startedAt}`,
    itemId: 'i1',
    themeId: 't1',
    title: '高数刷题',
    themeName: '数学',
    color: '#ef4e36',
    mode: 'countdown',
    targetMs: 25 * 60_000,
    startedAt,
    endedAt,
    timeZone: 'UTC',
    durationMs: endedAt - startedAt,
    pausedMs: 0,
    segments: [{ start: startedAt, end: endedAt }],
    status: 'completed',
    ...rest,
  }
}

describe('statistics v2 (earlyCount, count aggregation, midnight consistency, yearlyHeatmap)', () => {
  it('counts earlyCount, dailyCounts, hourCounts, and category counts consistently with midnight timezone splits', () => {
    const completedDay1 = makeRecord({
      id: 'c1',
      startIso: '2026-11-14T23:50:00+08:00',
      endIso: '2026-11-15T00:20:00+08:00',
      timeZone: 'Asia/Shanghai',
      itemId: 'i1',
      themeId: 't1',
      title: '跨零点高数',
      themeName: '数学',
      status: 'completed',
    })
    const earlyDay1 = makeRecord({
      id: 'e1',
      startIso: '2026-11-14T09:00:00+08:00',
      endIso: '2026-11-14T09:10:00+08:00',
      timeZone: 'Asia/Shanghai',
      itemId: 'i2',
      themeId: 't2',
      title: '背单词',
      themeName: '英语',
      color: '#698caa',
      status: 'early',
    })
    const interruptedDay2 = makeRecord({
      id: 'int2',
      startIso: '2026-11-15T14:00:00+08:00',
      endIso: '2026-11-15T14:05:00+08:00',
      timeZone: 'Asia/Shanghai',
      itemId: null,
      themeId: null,
      title: '自由专注',
      themeName: '自由专注',
      color: '#222222',
      status: 'interrupted',
    })

    const records = [completedDay1, earlyDay1, interruptedDay2]

    // Day 1: 2 started sessions (1 completed spanning midnight -> 10m on Day1, 1 early -> 10m on Day1)
    const day1 = statistics(records, '2026-11-14', '2026-11-14', 'theme')
    expect(day1.totalMs).toBe(20 * 60_000)
    expect(day1.count).toBe(2)
    expect(day1.earlyCount).toBe(1)
    expect(day1.dailyCounts).toEqual([['2026-11-14', 2]])
    expect(day1.hourCounts[9]).toBe(1)
    expect(day1.hourCounts[23]).toBe(1)
    expect(day1.hourCounts[0]).toBe(0)
    expect(day1.categories).toEqual([
      { id: 't1', name: '数学', color: '#ef4e36', ms: 10 * 60_000, count: 1 },
      { id: 't2', name: '英语', color: '#698caa', ms: 10 * 60_000, count: 1 },
    ])

    // Day 2: 20m spillover from completedDay1 (count 0 for t1!) + 5m interruptedDay2 (count 1 for free)
    const day2 = statistics(records, '2026-11-15', '2026-11-15', 'theme')
    expect(day2.totalMs).toBe(25 * 60_000)
    expect(day2.count).toBe(1)
    expect(day2.earlyCount).toBe(0)
    expect(day2.dailyCounts).toEqual([['2026-11-15', 1]])
    expect(day2.hourCounts[14]).toBe(1)
    expect(day2.categories).toEqual([
      { id: 't1', name: '数学', color: '#ef4e36', ms: 20 * 60_000, count: 0 },
      { id: 'free', name: '自由专注', color: '#222222', ms: 5 * 60_000, count: 1 },
    ])

    // Item grouping across full 2-day window
    const twoDaysByItem = statistics(records, '2026-11-14', '2026-11-15', 'item')
    expect(twoDaysByItem.count).toBe(3)
    expect(twoDaysByItem.earlyCount).toBe(1)
    expect(twoDaysByItem.dailyCounts).toEqual([
      ['2026-11-14', 2],
      ['2026-11-15', 1],
    ])
    expect(twoDaysByItem.categories).toEqual([
      { id: 'i1', name: '跨零点高数', color: '#ef4e36', ms: 30 * 60_000, count: 1 },
      { id: 'i2', name: '背单词', color: '#698caa', ms: 10 * 60_000, count: 1 },
      { id: 'free', name: '自由专注', color: '#222222', ms: 5 * 60_000, count: 1 },
    ])
  })

  it('builds a 365-day yearlyHeatmap ending on anchorDate with intensity levels 0..4', () => {
    const rLow = makeRecord({
      id: 'y-low',
      startIso: '2026-11-25T10:00:00Z',
      endIso: '2026-11-25T10:15:00Z', // 15m
    })
    const rMid = makeRecord({
      id: 'y-mid',
      startIso: '2026-11-26T10:00:00Z',
      endIso: '2026-11-26T10:50:00Z', // 50m
    })
    const rPeak1 = makeRecord({
      id: 'y-peak-1',
      startIso: '2026-11-27T09:00:00Z',
      endIso: '2026-11-27T10:00:00Z', // 60m
    })
    const rPeak2 = makeRecord({
      id: 'y-peak-2',
      startIso: '2026-11-27T15:00:00Z',
      endIso: '2026-11-27T16:00:00Z', // +60m = 120m total, count 2
    })
    const rTooOld = makeRecord({
      id: 'y-old',
      startIso: '2025-11-27T10:00:00Z',
      endIso: '2025-11-27T11:00:00Z', // 366 days before 2026-11-27 -> excluded
    })

    const map = yearlyHeatmap([rLow, rMid, rPeak1, rPeak2, rTooOld], '2026-11-27')
    expect(map.from).toBe('2025-11-28')
    expect(map.to).toBe('2026-11-27')
    expect(map.days).toHaveLength(365)
    expect(map.days[0]?.date).toBe('2025-11-28')
    expect(map.days[364]?.date).toBe('2026-11-27')
    expect(map.maxMs).toBe(120 * 60_000)
    expect(map.maxCount).toBe(2)

    const emptyDay = map.days.find((d) => d.date === '2026-11-24')
    const lowDay = map.days.find((d) => d.date === '2026-11-25')
    const midDay = map.days.find((d) => d.date === '2026-11-26')
    const peakDay = map.days.find((d) => d.date === '2026-11-27')

    expect(emptyDay).toEqual({ date: '2026-11-24', ms: 0, count: 0, level: 0 })
    expect(lowDay).toEqual({ date: '2026-11-25', ms: 15 * 60_000, count: 1, level: 1 })
    expect(midDay).toEqual({ date: '2026-11-26', ms: 50 * 60_000, count: 1, level: 2 })
    expect(peakDay).toEqual({ date: '2026-11-27', ms: 120 * 60_000, count: 2, level: 4 })

    // Count metric mode scales intensity by session count
    const countMap = yearlyHeatmap([rLow, rMid, rPeak1, rPeak2], '2026-11-27', 'count')
    expect(countMap.days.find((d) => d.date === '2026-11-25')?.level).toBe(2) // 1 / 2 = 0.5 -> level 2
    expect(countMap.days.find((d) => d.date === '2026-11-27')?.level).toBe(4) // 2 / 2 = 1.0 -> level 4
  })

  it('handles empty records cleanly in yearlyHeatmap', () => {
    const map = yearlyHeatmap([], '2026-11-27')
    expect(map.days).toHaveLength(365)
    expect(map.maxMs).toBe(0)
    expect(map.maxCount).toBe(0)
    expect(map.days.every((d) => d.ms === 0 && d.count === 0 && d.level === 0)).toBe(true)
  })
})
