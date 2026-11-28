import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FocusRecord } from '../src/domain/model'
import { projectPetDomain } from '../src/domain/pet'

function makeFocusRecord(overrides: Partial<FocusRecord> & { id: string }): FocusRecord {
  const startedAt = overrides.startedAt ?? Date.parse('2026-11-23T09:00:00+08:00')
  const durationMs = overrides.durationMs ?? 25 * 60_000
  const endedAt = overrides.endedAt ?? startedAt + durationMs
  return {
    itemId: null,
    themeId: null,
    title: '高数刷题',
    themeName: '高数',
    color: '#ef4e36',
    mode: 'countdown',
    targetMs: durationMs,
    startedAt,
    endedAt,
    timeZone: 'Asia/Shanghai',
    durationMs,
    pausedMs: 0,
    segments: [{ start: startedAt, end: endedAt }],
    status: 'completed',
    ...overrides,
  }
}

describe('exportPngFile', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('triggers a Blob image/png download link on web', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
      registerPlugin: vi.fn(() => ({})),
    }))

    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:farm-png-1')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const click = vi.fn()
    const anchor = { href: '', download: '', click }
    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'a') return anchor
        throw new Error(`Unexpected tag ${tag}`)
      }),
    })

    const { exportPngFile } = await import('../src/platform/exportPng')
    // 1x1 transparent PNG base64
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    await exportPngFile(dataUrl, '一周农场-2026-11-23.png')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blobArg = (createObjectURL.mock.calls[0] as unknown[] | undefined)?.[0] as Blob
    expect(blobArg).toBeInstanceOf(Blob)
    expect(blobArg.type).toBe('image/png')
    expect(anchor.href).toBe('blob:farm-png-1')
    expect(anchor.download).toBe('一周农场-2026-11-23.png')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('invokes CatFocus.exportBase64File with raw base64 and image/png on native Android', async () => {
    const exportBase64File = vi.fn(async () => {})
    const registerPlugin = vi.fn(() => ({ exportBase64File }))
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true },
      registerPlugin,
    }))

    const { exportPngFile } = await import('../src/platform/exportPng')
    const rawBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    await exportPngFile(`data:image/png;base64,${rawBase64}`, '一周农场-2026-11-23.png')

    expect(registerPlugin).toHaveBeenCalledWith('CatFocus')
    expect(exportBase64File).toHaveBeenCalledTimes(1)
    expect(exportBase64File).toHaveBeenCalledWith({
      base64: rawBase64,
      name: '一周农场-2026-11-23.png',
      mimeType: 'image/png',
    })
  })
})

describe('weekFarmSlice and renderWeeklyFarmCard', () => {
  it('excludes manual backfill and early/interrupted records while capping instances at 36', () => {
    const mon = Date.parse('2026-11-23T08:00:00+08:00')
    const records: FocusRecord[] = []
    // 10 sessions * 100m (4 litter each => 40 raised, 1000m total)
    for (let i = 0; i < 10; i++) {
      records.push(
        makeFocusRecord({
          id: `valid-${i}`,
          startedAt: mon + i * 7_200_000,
          durationMs: 100 * 60_000,
          animalId: i % 2 === 0 ? 'black-cat' : 'yellow-chick',
          skinId: i % 2 === 0 ? 'cow' : 'chestnut',
        }),
      )
    }
    // Manual backfill, early finish, interrupted, and <5m must all be excluded from farm
    records.push(makeFocusRecord({ id: 'manual-1', startedAt: mon + 1000, durationMs: 180 * 60_000, source: 'manual' }))
    records.push(makeFocusRecord({ id: 'early-1', startedAt: mon + 2000, durationMs: 40 * 60_000, status: 'early' }))
    records.push(makeFocusRecord({ id: 'interrupted-1', startedAt: mon + 3000, durationMs: 40 * 60_000, status: 'interrupted' }))
    records.push(makeFocusRecord({ id: 'short-3m', startedAt: mon + 4000, durationMs: 3 * 60_000, status: 'completed' }))

    const proj = projectPetDomain({ records, timeZone: 'Asia/Shanghai', now: mon })
    const slice = proj.weekFarmSlice('2026-11-23')
    expect(slice.weekTotalCount).toBe(40)
    expect(slice.totalDurationMs).toBe(1000 * 60_000)
    expect(slice.instances).toHaveLength(36)
    expect(slice.instances.some((inst) => inst.recordId === 'manual-1' || inst.recordId === 'early-1')).toBe(false)
  })

  it('synthesizes a weekly check-in PNG with date range, total duration, exact count, and sampled animals', async () => {
    const { formatWeekRangeLabel, renderWeeklyFarmCard } = await import('../src/domain/farmCard')
    expect(formatWeekRangeLabel('2026-11-23', '2026-11-29')).toBe('11 月 23 日–29 日')
    expect(formatWeekRangeLabel('2026-11-30', '2026-12-06')).toBe('11 月 30 日–12 月 6 日')

    const drawnTexts: string[] = []
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn((text: string) => drawnTexts.push(String(text))),
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
    }
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toDataURL: vi.fn(() => 'data:image/png;base64,QUJD'),
    } as unknown as HTMLCanvasElement

    const dataUrl = renderWeeklyFarmCard(fakeCanvas, {
      weekStartDate: '2026-11-23',
      weekEndDate: '2026-11-29',
      weekTotalCount: 40,
      totalDurationMs: 125 * 60_000,
      instances: [
        {
          id: 'r1#0',
          recordId: 'r1',
          animalId: 'black-cat',
          skinId: 'cow',
          title: '高数刷题',
          startedAt: Date.parse('2026-11-23T09:00:00+08:00'),
          durationMs: 25 * 60_000,
          indexInRecord: 0,
        },
        {
          id: 'r2#0',
          recordId: 'r2',
          animalId: 'yellow-chick',
          skinId: 'chestnut',
          title: '背单词',
          startedAt: Date.parse('2026-11-24T09:00:00+08:00'),
          durationMs: 100 * 60_000,
          indexInRecord: 0,
        },
      ],
    })

    expect(dataUrl).toBe('data:image/png;base64,QUJD')
    expect(fakeCanvas.width).toBe(1080)
    expect(fakeCanvas.height).toBe(1350)
    expect(drawnTexts.some((t) => t.includes('11 月 23 日–29 日'))).toBe(true)
    expect(drawnTexts.some((t) => t.includes('40'))).toBe(true)
    expect(drawnTexts.some((t) => t.includes('2小时5分'))).toBe(true)
    expect(ctx.ellipse.mock.calls.length + ctx.arc.mock.calls.length).toBeGreaterThan(0)

    drawnTexts.length = 0
    renderWeeklyFarmCard(fakeCanvas, {
      weekStartDate: '2026-12-28',
      weekEndDate: '2027-01-03',
      weekTotalCount: 1,
      totalDurationMs: 25 * 60_000,
      instances: [],
    })
    expect(drawnTexts).toContain('2026 年 12 月 28 日–2027 年 1 月 3 日')
    expect(drawnTexts.some((t) => t.includes('2026 年 · 2026 年'))).toBe(false)
  })
})

describe('CatView Weekly Farm UI', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders empty state on a week with no raised animals and navigates to /focus', async () => {
    const { createSSRApp, h, reactive } = await import('vue')
    const { renderToString } = await import('@vue/server-renderer')
    const { emptyData } = await import('../src/domain/model')
    const { weekStart, dateKey } = await import('../src/domain/dates')

    const router = { push: vi.fn(), replace: vi.fn() }
    const emptyPet = { version: 1 as const, selectedAnimalId: 'black-cat' as const, selectedSkins: {}, lastSelectedItemId: null, retroCutoffAt: null }
    const appStore = reactive({
      data: {
        ...emptyData(),
        pet: emptyPet,
      },
      petProjection: projectPetDomain({ records: [], pet: emptyPet }),
      notify: vi.fn(),
    })

    vi.doMock('../src/stores/app', () => ({ useApp: () => appStore }))
    vi.doMock('vue-router', () => ({ useRouter: () => router }))

    const { default: CatView } = await import('../src/views/CatView.vue')
    const html = await renderToString(createSSRApp({ render: () => h(CatView) }))
    expect(html).toContain('一周农场')
    expect(html).toContain('本周还没有养大的小动物')
    expect(html).toContain('去专注')
    expect(html).toContain('cottage-count')
    expect(html).not.toContain('小猫还未入驻')
    expect(weekStart(dateKey())).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('renders sampled <= 36 animals with exact cottage total, steps weeks, and shows selected source record details', async () => {
    const { createSSRApp, h, reactive } = await import('vue')
    const { renderToString } = await import('@vue/server-renderer')
    const { emptyData } = await import('../src/domain/model')
    const { addDays, dateKey, weekStart } = await import('../src/domain/dates')

    const thisWeekStart = weekStart(dateKey())
    const prevWeekStart = addDays(thisWeekStart, -7)
    const thisWeekMonMs = Date.parse(`${thisWeekStart}T09:00:00`)
    const prevWeekMonMs = Date.parse(`${prevWeekStart}T10:00:00`)

    // 10 sessions of 100m => 40 animals raised in current week (capped at 36 rendered, cottage shows 40)
    const records: FocusRecord[] = Array.from({ length: 10 }, (_, i) =>
      makeFocusRecord({
        id: `cw-${i}`,
        title: `本周高数-${i}`,
        startedAt: thisWeekMonMs + i * 3_600_000,
        durationMs: 100 * 60_000,
        animalId: i % 2 === 0 ? 'black-cat' : 'yellow-chick',
        skinId: i % 2 === 0 ? 'cow' : 'chestnut',
        note: `复盘-${i}`,
      }),
    )
    // Previous week record
    records.push(
      makeFocusRecord({
        id: 'pw-1',
        title: '上周英语阅读',
        startedAt: prevWeekMonMs,
        durationMs: 25 * 60_000,
        animalId: 'white-goose',
        skinId: 'default',
        note: '词汇量提升',
      }),
    )

    const pet = { version: 1 as const, selectedAnimalId: 'black-cat' as const, selectedSkins: {}, lastSelectedItemId: null, retroCutoffAt: null }
    const appStore = reactive({
      data: {
        ...emptyData(),
        records,
        pet,
      },
      petProjection: projectPetDomain({ records, pet }),
      notify: vi.fn(),
    })

    vi.doMock('../src/stores/app', () => ({ useApp: () => appStore }))
    vi.doMock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

    const { default: CatView } = await import('../src/views/CatView.vue')
    let setupState: any
    const app = createSSRApp({ render: () => h(CatView) })
    app.mixin({
      created() {
        const internal = (this as any).$
        if (internal?.type === CatView) setupState = internal.setupState
      },
    })
    const html = await renderToString(app)

    expect(html).toContain('>40<')
    const animalButtonMatches = html.match(/class="[^"]*farm-animal-btn[^"]*"/g) ?? []
    expect(animalButtonMatches.length).toBe(36)

    // Step to previous week and tap the white-goose instance
    setupState.stepWeek(-1)
    expect(setupState.weekSlice.weekTotalCount).toBe(1)
    expect(setupState.weekSlice.instances[0]?.animalId).toBe('white-goose')
    setupState.tapAnimal(setupState.weekSlice.instances[0])
    expect(setupState.selectedRecord?.title).toBe('上周英语阅读')
    expect(setupState.selectedRecord?.note).toBe('词汇量提升')
  })
})
