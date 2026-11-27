import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import path from 'node:path'
import { startStaticServer, type StaticServer } from './helpers/staticServer'
import { CdpPage, type CatFocusStubOptions } from './helpers/cdpBrowser'
import { auditModals } from './helpers/uxAudit'

describe('Calendar, Statistics, Cat Placeholder & Settings/Backup (UF1, UF6, UF7, UF8)', () => {
  let server: StaticServer
  let page: CdpPage | undefined

  async function openPage(catFocusStub?: boolean | CatFocusStubOptions): Promise<CdpPage> {
    await page?.close()
    page = await CdpPage.launch({ width: 390, height: 844, catFocusStub })
    await page.goto(`${server.url}/#/focus`, true)
    page.clearErrors()
    return page
  }

  async function openCalendarOverflowMenu(p: CdpPage): Promise<void> {
    await p.evaluate(() => {
      const btns = [...document.querySelectorAll('.page-header button')]
      const menuBtn = btns.find((b) => {
        const aria = (b.getAttribute('aria-label') ?? '').trim()
        const text = (b.textContent ?? '').trim()
        return (
          aria.includes('视图与设置') ||
          aria.includes('更多') ||
          aria.includes('菜单') ||
          text === '•••' ||
          text === '⋯' ||
          text === '...'
        )
      }) as HTMLElement | undefined
      if (!menuBtn) throw new Error('Calendar overflow menu button not found')
      menuBtn.click()
    })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1, { label: 'calendar menu sheet' })
  }

  async function toggleMonthGrid(p: CdpPage): Promise<void> {
    const hasInlineToggle = await p.evaluate(() => !!document.querySelector('.calendar-month button[aria-expanded]'))
    if (hasInlineToggle) {
      await p.clickByRoleOrText({ selector: '.calendar-month button[aria-expanded]' })
      return
    }
    await openCalendarOverflowMenu(p)
    await p.evaluate(() => {
      const dlg = document.querySelector('dialog[open]')
      const btn = [...(dlg?.querySelectorAll('button') ?? [])].find((b) =>
        (b.textContent ?? '').includes('月历'),
      ) as HTMLElement | undefined
      if (!btn) throw new Error('Month toggle option not found in calendar menu')
      btn.click()
    })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
  }

  async function switchToTimetable(p: CdpPage): Promise<void> {
    const hasInlineTabs = await p.evaluate(() => !!document.querySelector('.calendar-tabs button'))
    if (hasInlineTabs) {
      await p.clickByRoleOrText({ text: '课表', selector: '.calendar-tabs button' })
      return
    }
    await openCalendarOverflowMenu(p)
    await p.evaluate(() => {
      const dlg = document.querySelector('dialog[open]')
      const btn = [...(dlg?.querySelectorAll('button') ?? [])].find((b) =>
        (b.textContent ?? '').includes('课表'),
      ) as HTMLElement | undefined
      if (!btn) throw new Error('Timetable option not found in calendar menu')
      btn.click()
    })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
  }

  async function openBackupSheetIfPresent(p: CdpPage): Promise<boolean> {
    const hasBackupRow = await p.evaluate(() => (document.body.innerText ?? '').includes('本地备份与恢复'))
    if (!hasBackupRow) return false
    await p.clickByRoleOrText({ text: '本地备份与恢复' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1, { label: 'backup sheet open' })
    return true
  }

  beforeAll(async () => {
    server = await startStaticServer({ rootDir: path.resolve(process.cwd(), 'dist') })
  })

  afterAll(async () => {
    await page?.close()
    page = undefined
    await server?.close()
  })

  beforeEach(async () => {
    await page?.close()
    page = undefined
  })

  it('supports Calendar week strip, 42-day month grid, overlap conflict without nested modals, plan vs actual, and linked task focus (UF6)', async () => {
    const p = await openPage({
      supported: true,
      authorized: true,
      connected: true,
      initialData: {
        schemaVersion: 1,
        themes: [{ id: 't1', name: '高数', color: '#ef4e36', order: 0, collapsed: false }],
        items: [{ id: 'i1', themeId: 't1', title: '极限刷题', note: '', mode: 'countdown', minutes: 25, order: 0 }],
        records: [],
        deletedRecordIds: [],
        events: [],
        eventExceptions: [],
        semesters: [],
        courses: [],
        courseExceptions: [],
        preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null },
      },
    })

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '时间轴' })
    await p.waitFor(() => window.location.hash.includes('/calendar'))

    // Expand month grid -> verify 42 day cells
    await toggleMonthGrid(p)
    const dayCellCount = await p.evaluate(() => document.querySelectorAll('.month-grid button').length)
    expect(dayCellCount).toBe(42)

    // Add first event linked to subtask 极限刷题
    await p.clickByRoleOrText({ text: '添加日程' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.fillByLabel('日程名称', '高数自习', { withinOpenDialog: true })
    await p.fillByLabel('关联待办', '极限刷题', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存日程', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    expect(await p.evaluate(() => document.body.innerText)).toContain('高数自习')

    // Add overlapping event -> MUST NOT produce nested <dialog open>
    await p.clickByRoleOrText({ text: '添加日程' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.fillByLabel('日程名称', '英语听力', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存日程', withinOpenDialog: true })

    // Wait briefly for conflict confirmation or inline conflict prompt
    await new Promise((r) => setTimeout(r, 150))
    const modalCheck = await auditModals(p)
    expect(modalCheck.violations).toEqual([])

    const hasConfirm = await p.evaluate(() => (document.body.innerText ?? '').includes('仍然保存'))
    if (hasConfirm) {
      await p.clickByRoleOrText({ text: '仍然保存' })
      await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    }
    expect(await p.evaluate(() => document.body.innerText)).toContain('英语听力')

    // Switch Plan / Actual (before any focus record)
    await p.clickByRoleOrText({ text: '实际', selector: '.mini-switch button' })
    expect(await p.evaluate(() => document.body.innerText)).toContain('今天还没有专注记录')
    await p.clickByRoleOrText({ text: '计划', selector: '.mini-switch button' })

    // Open linked event detail -> click 开始关联待办的专注 -> cleanly closes sheet and enters /focus!
    await p.clickByRoleOrText({ text: '高数自习', selector: '.timeline-card' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    expect(await p.evaluate(() => document.querySelector('dialog[open]')?.textContent ?? '')).toContain('开始关联待办的专注')
    await p.clickByRoleOrText({ text: '开始关联待办的专注', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/focus'), { label: 'linked task focus started' })
    expect((await auditModals(p)).violations).toEqual([])
    expect(await p.evaluate(() => document.querySelectorAll('dialog[open]').length)).toBe(0)
    expect(await p.evaluate(() => document.body.innerText)).toContain('极限刷题')

    // End focus early -> verify 极限刷题 appears in Calendar 实际 timeline
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await p.waitFor(() => (document.body.innerText ?? '').includes('左滑放弃'))
    await p.clickByRoleOrText({ name: '放弃专注' })
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => /挂了|提前结束/.test(document.body.innerText ?? ''))
    await p.clickByRoleOrText({ text: '返回首页' })
    await p.waitFor(() => window.location.hash.includes('/focus'))
    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '时间轴' })
    await p.waitFor(() => window.location.hash.includes('/calendar'))
    await p.clickByRoleOrText({ text: '实际', selector: '.mini-switch button' })
    expect(await p.evaluate(() => document.body.innerText)).toContain('极限刷题')

    p.assertNoErrors('Calendar schedule, conflict & linked task focus')
  })

  it('supports Calendar Timetable semester creation, Monday validation, course creation, and single-week adjustment (UF6)', async () => {
    const p = await openPage()
    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '时间轴' })
    await p.waitFor(() => window.location.hash.includes('/calendar'))
    await switchToTimetable(p)

    // Open semester setup
    await p.clickByRoleOrText({ text: '设置学期' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)

    // Reject non-Monday start date (2026-11-22 is Sunday)
    await p.fillByLabel('第一教学周的周一', '2026-11-22', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存并设为当前学期', withinOpenDialog: true })
    await p.waitFor(() => (document.querySelector('dialog[open]')?.textContent ?? '').includes('周一'), {
      label: 'Monday validation error',
    })

    // Valid Monday start date (2026-11-16 is Monday)
    await p.fillByLabel('第一教学周的周一', '2026-11-16', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存并设为当前学期', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    // Add a course
    await p.clickByRoleOrText({ text: '添加课程' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.fillByLabel('课程名称', '线性代数', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存课程', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    expect(await p.evaluate(() => document.body.innerText)).toContain('线性代数')

    // Open course detail -> 仅本次调课
    await p.clickByRoleOrText({ text: '线性代数', selector: '.course-block' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '仅本次调课', withinOpenDialog: true })
    expect((await auditModals(p)).violations).toEqual([])
    await p.pressKey('Escape')

    p.assertNoErrors('Calendar timetable & courses')
  })

  it('verifies Statistics 5 periods, midnight split, < 1 min (15s) record, — empty average, and record detail delete without nested modals (UF7)', async () => {
    const now = new Date()
    const day1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 50, 0, 0)
    const day2End = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 20, 0, 0)
    const day1ShortStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 0, 0, 0)
    const day1ShortEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 0, 15, 0)

    // Seed a midnight-spanning complete record (23:50 Day1 -> 00:20 Day2) and a short 15s record on Day1
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'

    const p = await openPage({
      supported: true,
      authorized: true,
      connected: true,
      initialData: {
        schemaVersion: 1,
        themes: [{ id: 't1', name: '数学', color: '#ef4e36', order: 0, collapsed: false }],
        items: [
          { id: 'i1', themeId: 't1', title: '跨零点刷题', note: '', mode: 'countdown', minutes: 30, order: 0 },
          { id: 'i2', themeId: 't1', title: '短时测试', note: '', mode: 'stopwatch', minutes: 25, order: 1 },
        ],
        records: [
          {
            id: 'r-midnight',
            itemId: 'i1',
            themeId: 't1',
            title: '跨零点刷题',
            themeName: '数学',
            color: '#ef4e36',
            mode: 'countdown',
            targetMs: 30 * 60000,
            startedAt: day1.getTime(),
            endedAt: day2End.getTime(),
            timeZone: tz,
            durationMs: 30 * 60000,
            pausedMs: 0,
            segments: [{ start: day1.getTime(), end: day2End.getTime() }],
            status: 'completed',
          },
          {
            id: 'r-short-15s',
            itemId: 'i2',
            themeId: 't1',
            title: '短时测试',
            themeName: '数学',
            color: '#ef4e36',
            mode: 'stopwatch',
            targetMs: 25 * 60000,
            startedAt: day1ShortStart.getTime(),
            endedAt: day1ShortEnd.getTime(),
            timeZone: tz,
            durationMs: 15000,
            pausedMs: 0,
            segments: [{ start: day1ShortStart.getTime(), end: day1ShortEnd.getTime() }],
            status: 'completed',
          },
        ],
        deletedRecordIds: [],
        events: [],
        eventExceptions: [],
        semesters: [],
        courses: [],
        courseExceptions: [],
        preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null },
      },
    })
    await p.navigateHash('#/statistics')
    await p.waitFor(() => window.location.hash.includes('/statistics'))

    // Today (Day 2): 20分钟 from midnight split, 0 次 started today, and average === '—'
    const day2Text = await p.evaluate(() => document.body.innerText)
    expect(day2Text).toContain('20分钟')
    expect(day2Text).toContain('—')

    // Switch to Day 1 -> 10分钟, and record list includes < 1 min (15秒) record!
    await p.clickByRoleOrText({ name: '上一个统计周期' })
    const day1Text = await p.evaluate(() => document.body.innerText)
    expect(day1Text).toContain('10分钟')

    // Inspect < 1 min 15秒 record inside records sheet
    await p.clickByRoleOrText({ name: '查看专注记录' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    const listText = await p.evaluate(() => document.querySelector('dialog[open]')?.textContent ?? '')
    expect(listText).toContain('短时测试')
    expect(listText).toContain('15秒')
    await p.clickByRoleOrText({ text: '短时测试', withinOpenDialog: true })
    await p.waitFor(() => (document.querySelector('dialog[open]')?.textContent ?? '').includes('15秒'))
    expect((await auditModals(p)).violations).toEqual([])
    await p.pressKey('Escape')
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    // Switch all 5 periods: 日 / 周 / 月 / 年 / 累计
    for (const periodLabel of ['周', '月', '年', '累计', '日']) {
      await p.clickByRoleOrText({ text: periodLabel, exact: true, selector: '.period-tabs button' })
    }
    await p.clickByRoleOrText({ text: '累计', exact: true, selector: '.period-tabs button' })
    const navDisabledInAll = await p.evaluate(() => ({
      prev: (document.querySelector('[aria-label="上一个统计周期"]') as HTMLButtonElement | null)?.disabled,
      next: (document.querySelector('[aria-label="下一个统计周期"]') as HTMLButtonElement | null)?.disabled,
    }))
    expect(navDisabledInAll.prev).toBe(true)
    expect(navDisabledInAll.next).toBe(true)

    // Distribution toggle: 主题 / 待办
    await p.clickByRoleOrText({ text: '待办', exact: true, selector: '.stats-page button' })

    // Open records -> select record -> delete record -> MUST NOT produce nested <dialog open>
    await p.clickByRoleOrText({ name: '查看专注记录' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '跨零点刷题', withinOpenDialog: true })
    await p.waitFor(() => (document.querySelector('dialog[open]')?.textContent ?? '').includes('删除记录'))
    await p.clickByRoleOrText({ text: '删除记录', withinOpenDialog: true })
    await new Promise((r) => setTimeout(r, 120))
    expect((await auditModals(p)).violations).toEqual([])

    const confirmBtnExists = await p.evaluate(() => (document.body.innerText ?? '').includes('确认'))
    if (confirmBtnExists) {
      await p.clickByRoleOrText({ text: '确认' })
    }
    await p.waitFor(() => !(document.body.innerText ?? '').includes('30 分钟') || document.querySelectorAll('dialog[open]').length === 0)

    p.assertNoErrors('Statistics periods, midnight split, 15s record & record delete')
  })

  it('verifies Statistics v2 earlyCount, duration/count toggle, mean-line trend chart, and 365 single-canvas heatmap scrub & keyboard inspection (CF-09)', async () => {
    const now = new Date()
    const todayStart1 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0)
    const todayEnd1 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 25, 0, 0)
    const todayStart2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0, 0)
    const todayEnd2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 15, 0, 0)
    const yesterdayEarlyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 15, 0, 0, 0)
    const yesterdayEarlyEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 15, 10, 0, 0)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'

    const pad2 = (n: number) => String(n).padStart(2, '0')
    const toDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    const todayKey = toDateKey(todayStart1)
    const yesterdayKey = toDateKey(yesterdayEarlyStart)

    const p = await openPage({
      supported: true,
      authorized: true,
      connected: true,
      initialData: {
        schemaVersion: 1,
        themes: [
          { id: 't1', name: '数学', color: '#ef4e36', order: 0, collapsed: false },
          { id: 't2', name: '英语', color: '#698caa', order: 1, collapsed: false },
        ],
        items: [
          { id: 'i1', themeId: 't1', title: '高数刷题', note: '', mode: 'countdown', minutes: 25, order: 0 },
          { id: 'i2', themeId: 't2', title: '背单词', note: '', mode: 'countdown', minutes: 25, order: 1 },
        ],
        records: [
          {
            id: 'r-today-1',
            itemId: 'i1',
            themeId: 't1',
            title: '高数刷题',
            themeName: '数学',
            color: '#ef4e36',
            mode: 'countdown',
            targetMs: 25 * 60000,
            startedAt: todayStart1.getTime(),
            endedAt: todayEnd1.getTime(),
            timeZone: tz,
            durationMs: 25 * 60000,
            pausedMs: 0,
            segments: [{ start: todayStart1.getTime(), end: todayEnd1.getTime() }],
            status: 'completed',
          },
          {
            id: 'r-today-2',
            itemId: 'i2',
            themeId: 't2',
            title: '背单词',
            themeName: '英语',
            color: '#698caa',
            mode: 'countdown',
            targetMs: 25 * 60000,
            startedAt: todayStart2.getTime(),
            endedAt: todayEnd2.getTime(),
            timeZone: tz,
            durationMs: 15 * 60000,
            pausedMs: 0,
            segments: [{ start: todayStart2.getTime(), end: todayEnd2.getTime() }],
            status: 'early',
          },
          {
            id: 'r-yest-early',
            itemId: 'i2',
            themeId: 't2',
            title: '背单词',
            themeName: '英语',
            color: '#698caa',
            mode: 'countdown',
            targetMs: 25 * 60000,
            startedAt: yesterdayEarlyStart.getTime(),
            endedAt: yesterdayEarlyEnd.getTime(),
            timeZone: tz,
            durationMs: 10 * 60000,
            pausedMs: 0,
            segments: [{ start: yesterdayEarlyStart.getTime(), end: yesterdayEarlyEnd.getTime() }],
            status: 'early',
          },
        ],
        deletedRecordIds: [],
        events: [],
        eventExceptions: [],
        semesters: [],
        courses: [],
        courseExceptions: [],
        preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null },
      },
    })

    await p.navigateHash('#/statistics')
    await p.waitFor(() => window.location.hash.includes('/statistics'))

    // Overview includes 提前结束次数 (1 today) & non-zero mean summary
    const dayOverviewText = await p.evaluate(() => document.body.innerText)
    expect(dayOverviewText).toContain('提前结束次数')
    expect(dayOverviewText).toContain('40分钟')
    expect(dayOverviewText).toContain('非零均值 20分钟')

    // Toggle 按时长 <-> 按次数: trend and distribution switch cleanly
    await p.clickByRoleOrText({ text: '按次数', exact: true, selector: '.metric-tabs button' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('专注次数趋势'))
    const countModeText = await p.evaluate(() => document.body.innerText)
    expect(countModeText).toContain('次数分布')
    expect(countModeText).toContain('1 次')
    expect(countModeText).toContain('50.0%')
    expect(countModeText).toContain('非零均值 1 次')

    await p.clickByRoleOrText({ text: '按时长', exact: true, selector: '.metric-tabs button' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('专注时长趋势'))

    // Switch to 年视图 -> verify single-canvas 365-day heatmap (no hundreds of button cells, >= 48px tall)
    await p.clickByRoleOrText({ text: '年', exact: true, selector: '.period-tabs button' })
    await p.waitFor(() => !!document.querySelector('.heatmap-canvas'))

    const heatmapMeta = await p.evaluate(() => {
      const canvas = document.querySelector('.heatmap-canvas') as HTMLCanvasElement | null
      const stage = document.querySelector('.heatmap-stage')
      const readout = document.querySelector('.heatmap-footer')
      if (!canvas || !stage || !readout) return null
      const r = canvas.getBoundingClientRect()
      return {
        width: r.width,
        height: r.height,
        buttonCountInsideStage: stage.querySelectorAll('button').length,
        date: readout.getAttribute('data-heatmap-date'),
        count: readout.getAttribute('data-heatmap-count'),
        ms: readout.getAttribute('data-heatmap-ms'),
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      }
    })
    expect(heatmapMeta).not.toBeNull()
    expect(heatmapMeta!.height).toBeGreaterThanOrEqual(48)
    expect(heatmapMeta!.width).toBeGreaterThanOrEqual(200)
    expect(heatmapMeta!.buttonCountInsideStage).toBe(0)
    expect(heatmapMeta!.date).toBe(todayKey)
    expect(heatmapMeta!.count).toBe('2')
    expect(heatmapMeta!.ms).toBe(String(40 * 60000))

    // Keyboard ArrowLeft steps to yesterday
    await p.evaluate(() => {
      const canvas = document.querySelector('.heatmap-canvas') as HTMLCanvasElement
      canvas.focus()
    })
    await p.pressKey('ArrowLeft')
    await p.waitFor(
      (targetKey: unknown) =>
        document.querySelector('.heatmap-footer')?.getAttribute('data-heatmap-date') === String(targetKey),
      { args: [yesterdayKey], label: 'heatmap keyboard ArrowLeft to yesterday' },
    )
    const afterArrowLeft = await p.evaluate(() => ({
      date: document.querySelector('.heatmap-footer')?.getAttribute('data-heatmap-date'),
      count: document.querySelector('.heatmap-footer')?.getAttribute('data-heatmap-count'),
      ms: document.querySelector('.heatmap-footer')?.getAttribute('data-heatmap-ms'),
    }))
    expect(afterArrowLeft).toEqual({
      date: yesterdayKey,
      count: '1',
      ms: String(10 * 60000),
    })

    // Pointer drag scrub across the canvas selects an earlier date and updates readout
    const box = await p.evaluate(() => {
      const canvas = document.querySelector('.heatmap-canvas') as HTMLCanvasElement
      canvas.scrollIntoView({ block: 'center' })
      const r = canvas.getBoundingClientRect()
      return { left: r.left, top: r.top, width: r.width, height: r.height }
    })
    const startX = Math.round(box.left + box.width * 0.85)
    const midY = Math.round(box.top + box.height * 0.5)
    const endX = Math.round(box.left + box.width * 0.25)
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX, y: midY })
    await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: midY, button: 'left', clickCount: 1 })
    await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: endX, y: midY, button: 'left' })
    await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: endX, y: midY, button: 'left', clickCount: 1 })
    await new Promise((r) => setTimeout(r, 120))

    const afterScrubDate = await p.evaluate(() =>
      document.querySelector('.heatmap-footer')?.getAttribute('data-heatmap-date'),
    )
    expect(afterScrubDate).toBeTruthy()
    expect(afterScrubDate! < yesterdayKey).toBe(true)

    p.assertNoErrors('Statistics v2 CF-09')
  })

  it('renders Cat tab placeholder strictly as 小猫还未入驻 (UF1)', async () => {
    const p = await openPage()
    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '农场' })
    await p.waitFor(() => window.location.hash.includes('/cat'))
    const catText = await p.evaluate(() => (document.querySelector('main')?.innerText ?? '').trim())
    expect(catText).toBe('小猫还未入驻')
    p.assertNoErrors('Cat tab placeholder')
  })

  it('persists Settings defaults, rejects corrupt backup JSON, and blocks backup restore during active focus (UF8)', async () => {
    const p = await openPage()
    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '我的' })
    await p.waitFor(() => window.location.hash.includes('/settings'))

    // Change default minutes to 45 and reload
    await p.clickByRoleOrText({ text: '默认专注时长' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '45 分钟', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存设置', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    // Verify 轻看护 switch defaults to true, shows 1-line exemption help, and persists toggle
    const leaveSwitchBefore = await p.evaluate(() => {
      const text = document.body.innerText ?? ''
      const row = [...document.querySelectorAll('.settings-row.switch')].find((el) =>
        (el.textContent ?? '').includes('轻看护'),
      )
      const input = row?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      return { hasTitle: text.includes('轻看护'), hasHelp: text.includes('熄屏锁屏与通话不受影响'), checked: input?.checked ?? false }
    })
    expect(leaveSwitchBefore).toEqual({ hasTitle: true, hasHelp: true, checked: true })

    await p.evaluate(() => {
      const row = [...document.querySelectorAll('.settings-row.switch')].find((el) =>
        (el.textContent ?? '').includes('轻看护'),
      )
      const input = row?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      input?.click()
    })

    await p.reload(true)
    expect(await p.evaluate(() => document.body.innerText)).toContain('45 分钟')
    const leaveCheckedAfterReload = await p.evaluate(() => {
      const row = [...document.querySelectorAll('.settings-row.switch')].find((el) =>
        (el.textContent ?? '').includes('轻看护'),
      )
      return (row?.querySelector('input[type="checkbox"]') as HTMLInputElement | null)?.checked
    })
    expect(leaveCheckedAfterReload).toBe(false)

    // Reject corrupt JSON backup without opening restore confirmation or overwriting
    const openedBackupSheet = await openBackupSheetIfPresent(p)
    await p.setFileInput('input[type="file"]', 'corrupt-backup.json', '{ invalid json !!!')
    await new Promise((r) => setTimeout(r, 150))
    expect(await p.evaluate(() => document.body.innerText)).not.toContain('确认恢复此备份')
    if (openedBackupSheet) {
      await p.pressKey('Escape')
      await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    } else {
      expect(await p.evaluate(() => document.querySelectorAll('dialog[open]').length)).toBe(0)
    }
    expect(await p.evaluate(() => document.body.innerText)).toContain('45 分钟')

    // Start active focus -> return to settings -> attempt 从备份恢复 -> blocked!
    await p.navigateHash('#/tasks')
    await p.clickByRoleOrText({ text: '开始 45 分钟专注' })
    await p.waitFor(() => window.location.hash.includes('/focus'))
    await p.clickByRoleOrText({ name: '返回待办，保持计时' })
    await p.waitFor(() => window.location.hash.includes('/tasks'))

    await p.navigateHash('#/settings')
    await openBackupSheetIfPresent(p)
    await p.clickByRoleOrText({ text: '从备份恢复' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('请先结束当前专注或锁机，再恢复备份'), {
      label: 'active-session backup block',
    })

    p.assertNoErrors('Settings & backup guards')
  })
})
