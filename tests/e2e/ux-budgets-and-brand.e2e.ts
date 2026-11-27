import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import { startStaticServer, type StaticServer } from './helpers/staticServer'
import { CdpPage } from './helpers/cdpBrowser'
import {
  auditModals,
  auditScreenBudget,
  auditForbiddenStrings,
  auditBrandSpec,
  auditInputSchemeA,
  auditReducedMotion,
} from './helpers/uxAudit'

function makeSampleInitialData() {
  const now = Date.now()
  return {
    schemaVersion: 1,
    themes: [{ id: 't1', name: '高数', color: '#ef4e36', order: 0, collapsed: false }],
    items: [{ id: 'i1', themeId: 't1', title: '极限刷题', note: '', mode: 'countdown', minutes: 25, order: 0 }],
    records: [
      {
        id: 'rec-1',
        itemId: 'i1',
        themeId: 't1',
        title: '极限刷题',
        themeName: '高数',
        color: '#ef4e36',
        mode: 'countdown',
        targetMs: 25 * 60000,
        startedAt: now - 30 * 60000,
        endedAt: now - 5 * 60000,
        timeZone: 'Asia/Shanghai',
        durationMs: 25 * 60000,
        pausedMs: 0,
        segments: [{ start: now - 30 * 60000, end: now - 5 * 60000 }],
        status: 'completed',
      },
    ],
    deletedRecordIds: [],
    events: [
      {
        id: 'ev-1',
        title: '早读复习',
        start: '2026-11-22T09:00',
        end: '2026-11-22T10:00',
        allDay: false,
        note: '',
        repeat: 'none',
        weekdays: [],
        until: '',
        itemId: 'i1',
        reminderMinutes: null,
      },
    ],
    eventExceptions: [],
    semesters: [],
    courses: [],
    courseExceptions: [],
    lockConfigurations: [
      { id: 'l1', name: '晚自习锁机', minutes: 45, strict: false, whitelist: { source: 'global' } },
    ],
    preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null },
  }
}

describe('Comprehensive UX Budgets & brand-spec.md Visual Gate (UF10, Tier 2 & Tier 4)', () => {
  let server: StaticServer
  let page: CdpPage

  beforeAll(async () => {
    server = await startStaticServer({ rootDir: path.resolve(process.cwd(), 'dist') })
    page = await CdpPage.launch({
      width: 390,
      height: 844,
      catFocusStub: {
        supported: true,
        authorized: true,
        connected: true,
        initialData: makeSampleInitialData(),
      },
    })
  })

  afterAll(async () => {
    await page?.close()
    await server?.close()
  })

  const PRIMARY_TAB_ROUTES = ['/focus', '/calendar', '/cat', '/statistics', '/settings'] as const
  const SECONDARY_ROUTES = ['/tasks', '/lock', '/permissions', '/help', '/emergency', '/recovery'] as const
  const VIEWPORTS = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ] as const

  for (const vp of VIEWPORTS) {
    it(`passes brand-spec.md computed CSS, overflow, touch targets, and font sizes across tabbed & secondary routes at ${vp.width}x${vp.height}`, async () => {
      await page.setViewport(vp.width, vp.height)
      const failures: string[] = []

      for (const routePath of [...PRIMARY_TAB_ROUTES, ...SECONDARY_ROUTES]) {
        await page.goto(`${server.url}/#${routePath}`, true)
        const modals = await auditModals(page)
        if (modals.violations.length) {
          failures.push(`${routePath} (${vp.width}x${vp.height}): ${modals.violations.map((v) => v.message).join('; ')}`)
        }
        const brand = await auditBrandSpec(page, {
          checkPageMargins: true,
          checkCards: true,
          checkTimers: true,
        })
        if (brand.violations.length) {
          failures.push(`${routePath} (${vp.width}x${vp.height}): ${brand.violations.map((v) => v.message).join('; ')}`)
        }
      }

      page.assertNoErrors(`brand-spec audit ${vp.width}x${vp.height}`)
      expect(failures).toEqual([])
    })
  }

  it('passes single-screen UX budgets (<=1 CTA, <=4 decisions) and forbidden string hygiene on all primary student views', async () => {
    await page.setViewport(390, 844)
    const failures: string[] = []

    for (const routePath of ['/focus', '/calendar', '/cat', '/statistics', '/tasks']) {
      await page.goto(`${server.url}/#${routePath}`, true)
      const budget = await auditScreenBudget(page)
      if (budget.violations.length) {
        failures.push(`${routePath} budget: ${budget.violations.map((v) => v.message).join('; ')}`)
      }
      const strings = await auditForbiddenStrings(page, {
        isPrimaryScreen: true,
        checkTasksHeaderBadges: routePath === '/tasks' || routePath === '/focus',
      })
      if (strings.violations.length) {
        failures.push(`${routePath} strings: ${strings.violations.map((v) => v.message).join('; ')}`)
      }
    }

    // Root /settings forbidden engineering strings check (ux-spec.md §1.1 R1-B & §2.3.2)
    await page.goto(`${server.url}/#/settings`, true)
    const settingsStrings = await auditForbiddenStrings(page, { isPrimaryScreen: true })
    if (settingsStrings.violations.length) {
      failures.push(`/settings strings: ${settingsStrings.violations.map((v) => v.message).join('; ')}`)
    }

    // Active /focus screen audit (countdown <10s and >=10s)
    await page.goto(`${server.url}/#/tasks`, true)
    await page.clickByRoleOrText({ name: '开始极限刷题' })
    await page.waitFor(() => window.location.hash.includes('/focus'))

    const focusBudget = await auditScreenBudget(page)
    if (focusBudget.violations.length) {
      failures.push(`/focus active budget: ${focusBudget.violations.map((v) => v.message).join('; ')}`)
    }
    const focusStrings = await auditForbiddenStrings(page, { isPrimaryScreen: true })
    if (focusStrings.violations.length) {
      failures.push(`/focus active strings: ${focusStrings.violations.map((v) => v.message).join('; ')}`)
    }
    const focusBrand = await auditBrandSpec(page)
    if (focusBrand.violations.length) {
      failures.push(`/focus active brand: ${focusBrand.violations.map((v) => v.message).join('; ')}`)
    }

    // Advance past 10s regret window so left-swipe track appears and audit again
    await page.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await page.waitFor(() => (document.body.innerText ?? '').includes('左滑放弃'))
    const sliderBudget = await auditScreenBudget(page)
    if (sliderBudget.violations.length) {
      failures.push(`/focus slider budget: ${sliderBudget.violations.map((v) => v.message).join('; ')}`)
    }
    const sliderBrand = await auditBrandSpec(page)
    if (sliderBrand.violations.length) {
      failures.push(`/focus slider brand: ${sliderBrand.violations.map((v) => v.message).join('; ')}`)
    }

    // End focus early -> audit settlement screen -> complete a stopwatch -> enter /rest -> audit /rest
    await page.clickByRoleOrText({ name: '放弃专注' })
    await page.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await page.waitFor(() => /挂了|提前结束/.test(document.body.innerText ?? ''))
    const earlyStrings = await auditForbiddenStrings(page, { isPrimaryScreen: true })
    if (earlyStrings.violations.length) {
      failures.push(`/focus early strings: ${earlyStrings.violations.map((v) => v.message).join('; ')}`)
    }
    const earlyBrand = await auditBrandSpec(page)
    if (earlyBrand.violations.length) {
      failures.push(`/focus early brand: ${earlyBrand.violations.map((v) => v.message).join('; ')}`)
    }
    await page.clickByRoleOrText({ text: '返回首页' })
    await page.waitFor(() => (document.body.innerText ?? '').includes('开始专注'))

    // Start stopwatch -> finish -> completed settlement -> rest
    await page.clickByRoleOrText({ text: '正计时', selector: '.quick-chip' })
    await page.clickByRoleOrText({ text: '开始专注' })
    await page.waitFor(() => (document.body.innerText ?? '').includes('正计时专注'))
    await page.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await page.waitFor(() => !!document.querySelector('[aria-label="结束专注"]'))
    await page.clickByRoleOrText({ name: '结束专注' })
    await page.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await page.waitFor(() => (document.body.innerText ?? '').includes('本次专注正常结束'))
    await page.clickByRoleOrText({ text: '休息 5 分钟' })
    await page.waitFor(() => window.location.hash.includes('/rest'))

    const restBudget = await auditScreenBudget(page)
    if (restBudget.violations.length) {
      failures.push(`/rest budget: ${restBudget.violations.map((v) => v.message).join('; ')}`)
    }
    const restStrings = await auditForbiddenStrings(page, { isPrimaryScreen: true })
    if (restStrings.violations.length) {
      failures.push(`/rest strings: ${restStrings.violations.map((v) => v.message).join('; ')}`)
    }
    const restBrand = await auditBrandSpec(page)
    if (restBrand.violations.length) {
      failures.push(`/rest brand: ${restBrand.violations.map((v) => v.message).join('; ')}`)
    }

    // Exit rest cleanly -> returns to /focus
    await page.clickByRoleOrText({ text: '退出休息' })
    await page.clickByRoleOrText({ text: '退出休息', withinOpenDialog: true })
    await page.waitFor(() => window.location.hash.includes('/focus'))

    page.assertNoErrors('primary student views UX budget')
    expect(failures).toEqual([])
  })

  it('enforces Input Scheme A focus styling (#F5F5F5/#ECECEE -> #FFFFFF/#838388, no #EF4E36 ring, invariant box size) across sheets', async () => {
    await page.setViewport(390, 844)
    await page.goto(`${server.url}/#/tasks`, true)

    // Test 新建主题 sheet
    await page.clickByRoleOrText({ name: '新建主题' })
    await page.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    const themeInputs = await auditInputSchemeA(page)
    expect(themeInputs.testedCount).toBeGreaterThanOrEqual(1)
    expect(themeInputs.violations).toEqual([])
    await page.pressKey('Escape')

    // Test Calendar 添加日程 sheet
    await page.goto(`${server.url}/#/calendar`, true)
    await page.clickByRoleOrText({ name: '添加日程' })
    await page.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    const eventInputs = await auditInputSchemeA(page)
    expect(eventInputs.testedCount).toBeGreaterThanOrEqual(2)
    expect(eventInputs.violations).toEqual([])
    await page.pressKey('Escape')

    // Test Settings 默认专注时长 sheet
    await page.goto(`${server.url}/#/settings`, true)
    await page.clickByRoleOrText({ text: '默认专注时长' })
    await page.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    const durationInputs = await auditInputSchemeA(page)
    expect(durationInputs.testedCount).toBeGreaterThanOrEqual(1)
    expect(durationInputs.violations).toEqual([])
    await page.pressKey('Escape')

    page.assertNoErrors('Input Scheme A')
  })

  it('disables transitions and animations under prefers-reduced-motion: reduce', async () => {
    await page.setReducedMotion(true)
    await page.goto(`${server.url}/#/tasks`, true)

    const reducedMain = await auditReducedMotion(page)
    expect(reducedMain.violations).toEqual([])

    await page.clickByRoleOrText({ name: '新建主题' })
    await page.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    const reducedSheet = await auditReducedMotion(page)
    expect(reducedSheet.violations).toEqual([])
    await page.pressKey('Escape')

    await page.setReducedMotion(false)
    page.assertNoErrors('reduced motion')
  })
})
