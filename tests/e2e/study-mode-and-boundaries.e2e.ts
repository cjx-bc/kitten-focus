import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import path from 'node:path'
import { startStaticServer, type StaticServer } from './helpers/staticServer'
import { CdpPage, type CatFocusStubOptions } from './helpers/cdpBrowser'
import { auditModals, auditScreenBudget, auditForbiddenStrings } from './helpers/uxAudit'

describe('Study Mode, ADR-0004 Boundaries & Independent Lock (UF5, UF8, UF9)', () => {
  let server: StaticServer
  let page: CdpPage | undefined

  async function openPage(catFocusStub: boolean | CatFocusStubOptions = { supported: true, authorized: true, connected: true }): Promise<CdpPage> {
    await page?.close()
    page = await CdpPage.launch({ width: 390, height: 844, catFocusStub })
    await page.goto(`${server.url}/#/tasks`, true)
    page.clearErrors()
    return page
  }

  async function openStudyModeSheet(p: CdpPage): Promise<void> {
    const clicked = await p.evaluate(() => {
      // M2 dual-zone capsule config button or pre-M2 .study-entry button
      const candidates = [
        ...document.querySelectorAll('.page-header button[aria-haspopup="dialog"]'),
        ...document.querySelectorAll('.study-entry-config, .study-config'),
        ...document.querySelectorAll('.page-header button'),
      ]
      const configBtn = candidates.find((el) => {
        const aria = (el.getAttribute('aria-label') ?? '').trim()
        const text = (el.textContent ?? '').trim()
        return (
          el.getAttribute('aria-haspopup') === 'dialog' ||
          aria.includes('配置学霸') ||
          aria.includes('设置学霸') ||
          aria.includes('学霸模式设置') ||
          text === '⚙'
        )
      }) as HTMLElement | undefined
      if (configBtn) {
        configBtn.click()
        return true
      }
      const fallback = document.querySelector('.study-entry') as HTMLElement | null
      if (fallback) {
        fallback.click()
        return true
      }
      return false
    })
    expect(clicked).toBe(true)
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1, { label: 'StudyModeSheet open' })
  }

  async function clickStudyModeBack(p: CdpPage): Promise<void> {
    await p.evaluate(() => {
      const dlg = document.querySelector('dialog[open]')
      if (!dlg) throw new Error('No open dialog for StudyMode back')
      const btns = [...dlg.querySelectorAll('button')]
      const backBtn = btns.find((b) => {
        const aria = (b.getAttribute('aria-label') ?? '').trim()
        const text = (b.textContent ?? '').replace(/\s+/g, ' ').trim()
        return (
          b.classList.contains('detail-back') ||
          aria.startsWith('返回') ||
          (b.closest('.sheet-header') !== null && !b.classList.contains('close') && !aria.startsWith('关闭') && text.includes('学霸模式')) ||
          text.includes('返回学霸模式')
        )
      }) as HTMLElement | undefined
      if (!backBtn) throw new Error('StudyMode back button not found')
      backBtn.click()
    })
    await new Promise((r) => setTimeout(r, 120))
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

  it('enforces Study Mode 1+3+1 home budget, recommended defaults, whitelist editing, and zero nested modals across all drill-downs (UF5, UF10)', async () => {
    const p = await openPage()
    await openStudyModeSheet(p)

    // Home screen budget: <= 1 primary CTA, <= 4 first-glance decisions, 0 nested modals, 0 telemetry leaks
    expect((await auditModals(p)).violations).toEqual([])
    const homeBudget = await auditScreenBudget(p)
    expect(homeBudget.violations).toEqual([])
    expect((await auditForbiddenStrings(p, { isPrimaryScreen: true })).violations).toEqual([])

    const homeText = await p.evaluate(() => document.querySelector('dialog[open]')?.textContent ?? '')
    expect(homeText).toContain('学霸模式')
    expect(homeText).toContain('应用限制')
    expect(homeText).toContain('严格模式')
    expect(homeText).toContain('免打扰')
    expect(homeText).toMatch(/权限与使用帮助|授权与权限/)
    // lockMainInterfaceRestricted must NEVER be inside StudyModeSheet
    expect(homeText).not.toContain('锁机时限制主界面入口')
    expect(homeText).not.toContain('锁机时限制返回主页')

    // Enable Study Mode master switch -> recommended defaults
    await p.clickByRoleOrText({ text: '学霸模式', selector: '.master-card label.switch', withinOpenDialog: true })
    await p.waitFor(() => {
      const inputs = [...document.querySelectorAll('dialog[open] input[type="checkbox"]')] as HTMLInputElement[]
      return inputs[0]?.checked === true
    })

    // Drill into 应用限制 -> open 白名单 -> MUST NOT create nested <dialog open>
    await p.clickByRoleOrText({ text: '应用限制', selector: '.module-nav', withinOpenDialog: true })
    expect((await auditModals(p)).violations).toEqual([])

    const wlBtnText = await p.evaluate(() => {
      const t = document.querySelector('dialog[open]')?.textContent ?? ''
      return t.includes('白名单应用') ? '白名单应用' : '允许使用的应用（白名单）'
    })
    await p.clickByRoleOrText({ text: wlBtnText, withinOpenDialog: true })
    // Check zero nested <dialog open>!
    expect((await auditModals(p)).violations).toEqual([])

    // Select 微信 in whitelist editor and confirm (确认 or 确认白名单)
    await p.clickByRoleOrText({ text: '微信', selector: 'label.app-choice', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '确认', withinOpenDialog: true })
    await new Promise((r) => setTimeout(r, 120))

    // Back to home -> drill into 严格模式
    await clickStudyModeBack(p)
    await p.clickByRoleOrText({ text: '严格模式', selector: '.module-nav', withinOpenDialog: true })
    expect((await auditModals(p)).violations).toEqual([])

    const coreStrictText = await p.evaluate(() => document.querySelector('dialog[open]')?.textContent ?? '')
    expect(coreStrictText).toContain('倒计时不可暂停、不可提前结束')
    expect(coreStrictText).toContain('限制桌面与最近任务')
    expect(coreStrictText).toContain('精确防关闭')

    // Expand 进阶防绕过 if collapsed (ux-spec.md §5.3)
    const hasAdvancedDisclosure = await p.evaluate(() => {
      const dlg = document.querySelector('dialog[open]')
      const summary = [...(dlg?.querySelectorAll('summary, button') ?? [])].find((el) =>
        (el.textContent ?? '').includes('进阶防绕过'),
      )
      return !!summary
    })
    if (hasAdvancedDisclosure) {
      await p.clickByRoleOrText({ text: '进阶防绕过', withinOpenDialog: true })
    }
    const fullStrictText = await p.evaluate(() => document.querySelector('dialog[open]')?.textContent ?? '')
    expect(fullStrictText).toContain('隐藏最近任务卡片')
    expect(fullStrictText).toContain('隐藏桌面图标')
    expect(fullStrictText).toContain('壁纸辅助保护')

    await clickStudyModeBack(p)
    await p.clickByRoleOrText({ text: '免打扰', selector: '.module-nav', withinOpenDialog: true })
    expect((await auditModals(p)).violations).toEqual([])
    await clickStudyModeBack(p)

    const permEntryText = await p.evaluate(() => {
      const t = document.querySelector('dialog[open]')?.textContent ?? ''
      return t.includes('权限与使用帮助') ? '权限与使用帮助' : '授权与权限'
    })
    await p.clickByRoleOrText({ text: permEntryText, withinOpenDialog: true })
    expect((await auditModals(p)).violations).toEqual([])

    p.assertNoErrors('StudyModeSheet drill-downs')
  })

  it('shows platform unsupported notice at most once in non-Android browser mode (UF5, UF10)', async () => {
    const p = await openPage(false)
    await openStudyModeSheet(p)

    const stringsAudit = await auditForbiddenStrings(p, { isPrimaryScreen: true })
    expect(stringsAudit.repeatedUnsupportedCount).toBeLessThanOrEqual(1)
    expect(stringsAudit.violations).toEqual([])

    p.assertNoErrors('non-Android StudyModeSheet')
  })

  it('locks /focus during active Study Mode, blocks non-safe routes, allows /help /emergency /recovery /permissions, and recovers cleanly (UF9, UF8)', async () => {
    const p = await openPage()

    // Enable Study Mode
    await openStudyModeSheet(p)
    await p.clickByRoleOrText({ text: '学霸模式', selector: '.master-card label.switch', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '完成', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    // Start free focus
    await p.clickByRoleOrText({ text: '开始 25 分钟专注' })
    const hasConfirm = await p.evaluate(() => document.querySelectorAll('dialog[open]').length > 0)
    if (hasConfirm) {
      const btnText = await p.evaluate(() => {
        const t = document.querySelector('dialog[open]')?.textContent ?? ''
        return t.includes('确认开始') ? '确认开始' : '开始专注'
      })
      await p.clickByRoleOrText({ text: btnText, withinOpenDialog: true })
    }
    await p.waitFor(() => window.location.hash.includes('/focus'), { label: 'Study Mode focus active' })

    // Back icon is locked and clicking it shows toast 学霸模式进行中，结束后可返回
    await p.clickByRoleOrText({ name: '学霸模式进行中，专注页已锁定' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('学霸模式进行中，结束后可返回'), {
      label: 'study lock toast',
    })
    expect(await p.currentHashPath()).toBe('/focus')

    // Android hardware backButton also stays on /focus
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { dispatchAppEvent: (e: string, p: unknown) => void } }).__catFocusStub.dispatchAppEvent(
        'backButton',
        {},
      )
    })
    await new Promise((r) => setTimeout(r, 150))
    expect(await p.currentHashPath()).toBe('/focus')

    // Non-safe routes redirect back to /focus
    for (const blocked of ['#/tasks', '#/settings', '#/cat', '#/lock']) {
      await p.navigateHash(blocked)
      await p.waitFor(() => window.location.hash.includes('/focus'), { label: `redirect from ${blocked}` })
    }

    // Safe paths (/help, /emergency, /permissions) are reachable & return to /focus
    await p.navigateHash('#/help')
    expect(await p.currentHashPath()).toBe('/help')
    expect(await p.evaluate(() => document.body.innerText)).toContain('保护帮助')
    await p.clickByRoleOrText({ text: '返回专注计时' })
    expect(await p.currentHashPath()).toBe('/focus')

    await p.navigateHash('#/emergency')
    expect(await p.currentHashPath()).toBe('/emergency')
    expect(await p.evaluate(() => !!document.querySelector('a[href="tel:"]'))).toBe(true)
    await p.clickByRoleOrText({ text: '返回专注计时' })
    expect(await p.currentHashPath()).toBe('/focus')

    await p.navigateHash('#/permissions')
    expect(await p.currentHashPath()).toBe('/permissions')
    await p.clickByRoleOrText({ text: '返回专注计时' })
    expect(await p.currentHashPath()).toBe('/focus')

    // Recovery: supports BOTH ux-spec.md §5.8 inline /recovery rendering AND pre-M3 auto-dialog, plus open-recovery event
    await p.navigateHash('#/recovery')
    expect(await p.currentHashPath()).toBe('/recovery')
    await new Promise((r) => setTimeout(r, 200))
    expect((await auditModals(p)).violations).toEqual([])

    const autoOpenedDialog = await p.evaluate(() => document.querySelectorAll('dialog[open]').length === 1)
    if (autoOpenedDialog) {
      await p.clickByRoleOrText({ text: '取消，保持现状', withinOpenDialog: true })
      await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
      await p.clickByRoleOrText({ text: '查看本轮恢复项目' })
      await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
      await p.clickByRoleOrText({ text: '确认撤销以上本轮保护', withinOpenDialog: true })
      await p.waitFor(() => (document.querySelector('dialog[open]')?.textContent ?? '').includes('已恢复'))
      await p.clickByRoleOrText({ text: '完成', withinOpenDialog: true })
      await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    } else {
      // M3 inline /recovery rendering (docs/ux-spec.md §5.8)
      await p.waitFor(() => (document.body.innerText ?? '').includes('停止应用限制'), {
        label: 'inline recovery list',
      })
      await p.clickByRoleOrText({ text: '确认撤销以上本轮保护' })
      await p.waitFor(() => (document.body.innerText ?? '').includes('已恢复'), {
        label: 'inline recovery restored',
      })
    }

    await p.clickByRoleOrText({ text: '返回专注计时' })
    await p.waitFor(() => window.location.hash.includes('/focus'))
    expect(await p.currentHashPath()).toBe('/focus')

    // Verify open-recovery custom event opens RecoverySheet as a single modal without nesting
    await p.evaluate(() => window.dispatchEvent(new Event('open-recovery')))
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1, { label: 'open-recovery sheet' })
    expect((await auditModals(p)).violations).toEqual([])
    await p.pressKey('Escape')
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    // Finish active focus
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await p.waitFor(() => (document.body.innerText ?? '').includes('左滑放弃'))
    await p.clickByRoleOrText({ name: '放弃专注' })
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => /挂了|提前结束/.test(document.body.innerText ?? ''))

    p.assertNoErrors('ADR-0004 study-lock and safe exits')
  })

  it('supports Independent Lock (/lock), places lockMainInterfaceRestricted in LockView, and keeps lock records out of Focus Statistics (UF9)', async () => {
    const p = await openPage()
    await p.navigateHash('#/settings')
    await p.clickByRoleOrText({ text: '独立锁机' })
    await p.waitFor(() => window.location.hash.includes('/lock'))

    const hasLockAdvanced = await p.evaluate(() => {
      const el = [...document.querySelectorAll('summary, button')].find((node) =>
        (node.textContent ?? '').includes('锁机高级设置'),
      )
      return !!el
    })
    if (hasLockAdvanced) {
      await p.clickByRoleOrText({ text: '锁机高级设置' })
    }
    const lockPageText = await p.evaluate(() => document.body.innerText)
    expect(lockPageText).toMatch(/锁机时限制(主界面入口|返回主页)/)

    // Create new lock configuration
    await p.clickByRoleOrText({ text: '新建锁机配置' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.fillByLabel('锁机名称', '考前自习锁机', { withinOpenDialog: true })
    await p.fillByLabel('锁机时长（分钟）', '20', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存配置', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    // Start normal lock (accepts both .secondary per ux-spec.md §5.7 and .primary pre-M3)
    await p.clickByRoleOrText({ text: '开始', selector: '.lock-configuration button' })
    await new Promise((r) => setTimeout(r, 150))
    const hasStartDialog = await p.evaluate(() => document.querySelectorAll('dialog[open]').length === 1)
    if (hasStartDialog) {
      await p.clickByRoleOrText({ text: '确认开始锁机', withinOpenDialog: true })
    }
    await p.waitFor(() => (document.body.innerText ?? '').includes('普通锁机进行中'))

    // Early unlock
    await p.clickByRoleOrText({ text: '提前解除' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '确认解除', withinOpenDialog: true })
    await p.waitFor(() => (document.body.innerText ?? '').includes('本轮锁机已解除'))

    // Verify lock records do NOT pollute Focus Statistics
    await p.navigateHash('#/statistics')
    await p.waitFor(() => window.location.hash.includes('/statistics'))
    const statsText = await p.evaluate(() => document.body.innerText)
    expect(statsText).toContain('0秒')
    expect(statsText).toContain('—')

    p.assertNoErrors('Independent lock isolation')
  })

  it('distinguishes 独立空名单 vs 跟随全局 and keeps active round protection snapshot isolated across preference edits (UF5)', async () => {
    const p = await openPage({
      supported: true,
      authorized: true,
      connected: true,
      initialData: {
        schemaVersion: 1,
        themes: [{ id: 't1', name: '高数', color: '#ef4e36', order: 0, collapsed: false }],
        items: [
          {
            id: 'i-global',
            themeId: 't1',
            title: '跟随全局任务',
            note: '',
            mode: 'countdown',
            minutes: 25,
            order: 0,
            whitelist: { source: 'global' },
          },
          {
            id: 'i-empty-custom',
            themeId: 't1',
            title: '独立空名单任务',
            note: '',
            mode: 'countdown',
            minutes: 25,
            order: 1,
            whitelist: { source: 'custom', packages: [] },
          },
        ],
        records: [],
        deletedRecordIds: [],
        events: [],
        eventExceptions: [],
        semesters: [],
        courses: [],
        courseExceptions: [],
        preferences: {
          defaultMinutes: 25,
          sound: true,
          vibration: true,
          activeSemesterId: null,
          protection: {
            study: true,
            strict: false,
            interceptNotifications: false,
            dnd: false,
            globalWhitelist: ['com.tencent.mm'],
            enhancements: [],
            modules: {
              master: true,
              initialized: true,
              apps: { enabled: true, custom: { restrict: true, temporaryAccess: true } },
              strict: { enabled: false, custom: {} },
              quiet: { enabled: false, custom: {} },
            },
          },
        },
      },
    })

    // Start 独立空名单任务 -> snapshot must have source: 'custom' and whitelist: [] (NOT com.tencent.mm)
    await p.clickByRoleOrText({ name: '开始独立空名单任务' })
    await p.waitFor(() => window.location.hash.includes('/focus'), {
      label: 'entered /focus for 独立空名单任务',
    })
    const initialRoundSnapshot = await p.evaluate(() => {
      const stub = (window as unknown as { __catFocusStub: { getState: () => { focusSession: { protection: { source: string; whitelist: string[]; study: boolean } } } } }).__catFocusStub
      return stub.getState().focusSession.protection
    })
    expect(initialRoundSnapshot.source).toBe('custom')
    expect(initialRoundSnapshot.whitelist).toEqual([])
    expect(initialRoundSnapshot.study).toBe(true)

    // While round is active, mutate global preferences via CatFocus.saveData and reload so Pinia syncs -> active round snapshot MUST NOT mutate mid-round!
    await p.evaluate(async () => {
      const cap = (window as unknown as { Capacitor: { nativePromise: (p: string, m: string, o?: unknown) => Promise<unknown> } }).Capacitor
      const loaded = (await cap.nativePromise('CatFocus', 'loadData')) as { data: { preferences: { protection: { globalWhitelist: string[] } } } }
      loaded.data.preferences.protection.globalWhitelist = ['com.eg.android.AlipayGphone']
      await cap.nativePromise('CatFocus', 'saveData', { data: loaded.data })
    })
    await p.reload(true)
    await p.waitFor(() => window.location.hash.includes('/focus'), {
      label: 'stayed on /focus after reload during active Study Mode round',
    })
    const stillIsolated = await p.evaluate(() => {
      const stub = (window as unknown as { __catFocusStub: { getState: () => { focusSession: { protection: { source: string; whitelist: string[] } } } } }).__catFocusStub
      return stub.getState().focusSession.protection
    })
    expect(stillIsolated.source).toBe('custom')
    expect(stillIsolated.whitelist).toEqual([])

    // End round -> start 跟随全局任务 -> next round picks up updated globalWhitelist
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await p.waitFor(() => (document.body.innerText ?? '').includes('左滑放弃'))
    await p.clickByRoleOrText({ name: '放弃专注' })
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => /挂了|提前结束/.test(document.body.innerText ?? ''))
    await p.clickByRoleOrText({ text: '返回首页' })
    await p.navigateHash('#/tasks')
    await p.waitFor(() => window.location.hash.includes('/tasks'))

    await p.clickByRoleOrText({ name: '开始跟随全局任务' })
    await p.waitFor(() => window.location.hash.includes('/focus'))
    const nextRoundSnapshot = await p.evaluate(() => {
      const stub = (window as unknown as { __catFocusStub: { getState: () => { focusSession: { protection: { source: string; whitelist: string[] } } } } }).__catFocusStub
      return stub.getState().focusSession.protection
    })
    expect(nextRoundSnapshot.source).toBe('global')
    expect(nextRoundSnapshot.whitelist).toEqual(['com.eg.android.AlipayGphone'])

    p.assertNoErrors('custom empty whitelist vs global and round isolation')
  })

  it('enforces Focus <-> Independent Lock mutual exclusion in both directions (UF9)', async () => {
    const p = await openPage({
      supported: true,
      authorized: true,
      connected: true,
      initialData: {
        schemaVersion: 1,
        themes: [],
        items: [],
        records: [],
        deletedRecordIds: [],
        events: [],
        eventExceptions: [],
        semesters: [],
        courses: [],
        courseExceptions: [],
        lockConfigurations: [
          { id: 'lock-1', name: '晚自习锁机', minutes: 20, strict: false, whitelist: { source: 'global' } },
        ],
        preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null },
      },
    })

    // 1. Start non-Study-Mode focus -> visit /lock -> lock start is blocked
    await p.clickByRoleOrText({ text: '开始 25 分钟专注' })
    await p.waitFor(() => window.location.hash.includes('/focus'))
    await p.navigateHash('#/lock')
    await p.waitFor(() => window.location.hash.includes('/lock'))
    const lockWhileFocus = await p.evaluate(() => ({
      text: document.body.innerText,
      startDisabled: (document.querySelector('.lock-configuration button:last-of-type') as HTMLButtonElement | null)?.disabled,
    }))
    expect(lockWhileFocus.text).toContain('已有专注正在进行')
    expect(lockWhileFocus.startDisabled).toBe(true)

    // End focus cleanly
    await p.navigateHash('#/focus')
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await p.waitFor(() => (document.body.innerText ?? '').includes('左滑放弃'))
    await p.clickByRoleOrText({ name: '放弃专注' })
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => /挂了|提前结束/.test(document.body.innerText ?? ''))

    // 2. Start Independent Lock -> visit /tasks -> focus start is blocked
    await p.navigateHash('#/lock')
    await p.clickByRoleOrText({ text: '开始', selector: '.lock-configuration button' })
    await new Promise((r) => setTimeout(r, 120))
    if (await p.evaluate(() => document.querySelectorAll('dialog[open]').length === 1)) {
      await p.clickByRoleOrText({ text: '确认开始锁机', withinOpenDialog: true })
    }
    await p.waitFor(() => (document.body.innerText ?? '').includes('普通锁机进行中'))

    await p.navigateHash('#/tasks')
    await p.waitFor(() => window.location.hash.includes('/tasks'))
    const tasksWhileLock = await p.evaluate(() => document.body.innerText)
    expect(tasksWhileLock).toContain('锁机进行中')

    // Cleanly unlock
    await p.navigateHash('#/lock')
    await p.clickByRoleOrText({ text: '提前解除' })
    await p.clickByRoleOrText({ text: '确认解除', withinOpenDialog: true })
    await p.waitFor(() => (document.body.innerText ?? '').includes('本轮锁机已解除'))

    p.assertNoErrors('focus and independent lock mutual exclusion')
  })
})
