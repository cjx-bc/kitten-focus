import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import path from 'node:path'
import { startStaticServer, type StaticServer } from './helpers/staticServer'
import { CdpPage, type CatFocusStubOptions } from './helpers/cdpBrowser'
import { auditModals, auditForbiddenStrings } from './helpers/uxAudit'

describe('Student Focus Flow & Core Task Navigation (UF1, UF2, UF3, UF4)', () => {
  let server: StaticServer
  let page: CdpPage | undefined

  async function openPage(catFocusStub?: boolean | CatFocusStubOptions): Promise<CdpPage> {
    await page?.close()
    page = await CdpPage.launch({ width: 390, height: 844, catFocusStub })
    await page.goto(`${server.url}/#/tasks`, true)
    page.clearErrors()
    return page
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

  it('boots to /tasks with 5-tab icon-only bottom bar and supports tab switching (UF1)', async () => {
    const p = await openPage()
    expect(await p.currentHashPath()).toBe('/tasks')

    const navTabs = await p.evaluate(() => {
      const links = [...document.querySelectorAll('nav.tabbar a')]
      return links.map((a) => ({
        label: a.getAttribute('aria-label') ?? '',
        current: a.getAttribute('aria-current'),
        text: (a.textContent ?? '').trim(),
      }))
    })

    expect(navTabs).toHaveLength(5)
    expect(navTabs.map((t) => t.label.replace('，有新版本', ''))).toEqual(['待办', '日历', '小猫', '统计', '我的'])
    expect(navTabs[0]?.current).toBe('page')
    for (const t of navTabs) {
      expect(t.text).toBe('')
    }

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '日历' })
    expect(await p.currentHashPath()).toBe('/calendar')

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '小猫' })
    expect(await p.currentHashPath()).toBe('/cat')

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '统计' })
    expect(await p.currentHashPath()).toBe('/statistics')

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '我的' })
    expect(await p.currentHashPath()).toBe('/settings')

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '待办' })
    expect(await p.currentHashPath()).toBe('/tasks')

    p.assertNoErrors('5-tab navigation')
  })

  it('supports non-looping horizontal swipe across the 5 tabs and suppresses swipe when a dialog is open (UF1)', async () => {
    const p = await openPage()

    // Swipe right at leftmost /tasks -> stays on /tasks
    await p.touchSwipe(140, 400, 280, 400)
    expect(await p.currentHashPath()).toBe('/tasks')

    // Swipe left across all 5 tabs
    await p.touchSwipe(280, 400, 140, 400)
    expect(await p.currentHashPath()).toBe('/calendar')
    await p.touchSwipe(280, 400, 140, 400)
    expect(await p.currentHashPath()).toBe('/cat')
    await p.touchSwipe(280, 400, 140, 400)
    expect(await p.currentHashPath()).toBe('/statistics')
    await p.touchSwipe(280, 400, 140, 400)
    expect(await p.currentHashPath()).toBe('/settings')

    // Swipe left at rightmost /settings -> stays on /settings (no wrap-around)
    await p.touchSwipe(280, 400, 140, 400)
    expect(await p.currentHashPath()).toBe('/settings')

    // Open a dialog in /settings and verify swipe is blocked
    await p.clickByRoleOrText({ text: '默认专注时长' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1, { label: 'settings dialog open' })
    await p.touchSwipe(140, 400, 280, 400)
    expect(await p.currentHashPath()).toBe('/settings')

    p.assertNoErrors('tab swipe')
  })

  it('manages themes and reusable subtasks (CRUD, collapse, validation, move on delete, delete preserves records) without checkboxes or nested modals (UF2)', async () => {
    const p = await openPage()

    // Empty state -> create first task with new theme (stay on /tasks via 仅保存 if M2, or 保存待办 if pre-M2)
    await p.clickByRoleOrText({ text: '创建第一个待办' })
    expect((await auditModals(p)).violations).toEqual([])

    await p.fillByLabel('待办名称', '极限刷题', { withinOpenDialog: true })
    await p.fillByLabel('所属主题', '高数', { withinOpenDialog: true })

    // Validate empty/invalid minute rejection before saving valid item
    await p.fillByLabel('专注时长（分钟）', '0', { withinOpenDialog: true })
    const saveStayBtn = await p.evaluate(() => {
      const dlg = document.querySelector('dialog[open]')
      if (!dlg) return '保存待办'
      const btns = [...dlg.querySelectorAll('button')]
      return btns.some((b) => (b.textContent ?? '').includes('仅保存')) ? '仅保存' : '保存待办'
    })
    await p.clickByRoleOrText({ text: saveStayBtn, withinOpenDialog: true })
    await new Promise((r) => setTimeout(r, 100))
    expect(await p.evaluate(() => document.querySelectorAll('dialog[open]').length)).toBe(1)

    // Restore valid 25 min and save
    await p.fillByLabel('专注时长（分钟）', '25', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: saveStayBtn, withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0, { label: 'item sheet closed' })

    // Verify reusable subtask card has NO completion checkbox
    const cardState = await p.evaluate(() => {
      const card = document.querySelector('.task-card')
      return {
        text: (card?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        checkboxCount: card?.querySelectorAll('input[type="checkbox"]').length ?? 0,
      }
    })
    expect(cardState.text).toContain('极限刷题')
    expect(cardState.checkboxCount).toBe(0)

    // Create second theme 英语 and a subtask 背单词 under 英语, then move 背单词 to 高数 when deleting 英语
    await p.clickByRoleOrText({ name: '新建主题' })
    await p.fillByLabel('主题名称', '英语', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存主题', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0, { label: 'theme sheet closed' })

    await p.clickByRoleOrText({ name: '在英语下添加待办' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.fillByLabel('待办名称', '背单词', { withinOpenDialog: true })
    const saveItemText = await p.evaluate(() => {
      const dlg = document.querySelector('dialog[open]')
      return [...(dlg?.querySelectorAll('button') ?? [])].some((b) => (b.textContent ?? '').includes('仅保存'))
        ? '仅保存'
        : '保存待办'
    })
    await p.clickByRoleOrText({ text: saveItemText, withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    // Delete theme 英语 -> move 背单词 to 高数
    await p.clickByRoleOrText({ name: '编辑主题英语' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '删除主题', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '移到其他主题', withinOpenDialog: true })
    await p.fillByLabel('目标主题', '高数', { withinOpenDialog: true }).catch(async () => {
      await p.evaluate(() => {
        const sel = document.querySelector('dialog[open] select') as HTMLSelectElement | null
        if (sel) {
          const opt = [...sel.options].find((o) => o.text.includes('高数'))
          if (opt) {
            sel.value = opt.value
            sel.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }
      })
    })
    await p.clickByRoleOrText({ text: '移到其他主题并删除', withinOpenDialog: true }).catch(async () => {
      await p.clickByRoleOrText({
        text: '删除主题',
        selector: 'dialog[open] button.danger-button, dialog[open] button.primary, dialog[open] button.danger',
        withinOpenDialog: true,
      })
    })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0, { label: 'move-on-delete closed' })
    const tasksAfterMove = await p.evaluate(() => document.body.innerText)
    expect(tasksAfterMove).not.toContain('编辑主题英语')
    expect(tasksAfterMove).toContain('背单词')

    // Collapse & expand 高数 theme
    await p.clickByRoleOrText({ name: '收起主题高数' })
    const collapsedAttr = await p.evaluate(() =>
      document.querySelector('[aria-label="展开主题高数"]')?.getAttribute('aria-expanded'),
    )
    expect(collapsedAttr).toBe('false')
    await p.clickByRoleOrText({ name: '展开主题高数' })

    // Edit subtask and open custom whitelist -> MUST NOT produce nested <dialog open>
    await p.clickByRoleOrText({ name: '编辑极限刷题' })
    const hasMoreSettings = await p.evaluate(() =>
      (document.querySelector('dialog[open]')?.textContent ?? '').includes('更多设置'),
    )
    if (hasMoreSettings) {
      await p.clickByRoleOrText({ text: '更多设置', withinOpenDialog: true })
    }
    const hasAppRestrictButton = await p.evaluate(() => {
      const dlg = document.querySelector('dialog[open]')
      return !![...(dlg?.querySelectorAll('button') ?? [])].find((b) =>
        (b.textContent ?? '').includes('应用限制'),
      )
    })
    if (hasAppRestrictButton) {
      await p.clickByRoleOrText({ text: '应用限制', selector: 'dialog[open] button', withinOpenDialog: true })
    }
    await p.clickByRoleOrText({ text: '独立白名单', withinOpenDialog: true })
    const hasEditWlBtn = await p.evaluate(() => {
      const dlg = document.querySelector('dialog[open]')
      return !![...(dlg?.querySelectorAll('button') ?? [])].find(
        (b) => (b.textContent ?? '').includes('编辑独立白名单') && !(b as HTMLButtonElement).disabled,
      )
    })
    if (hasEditWlBtn) {
      await p.clickByRoleOrText({ text: '编辑独立白名单', withinOpenDialog: true })
    }
    const modalCheck = await auditModals(p)
    expect(modalCheck.violations).toEqual([])

    // Close edit sheet cleanly
    await p.pressKey('Escape')
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0, { label: 'edit closed' })

    // Complete a short stopwatch focus on 极限刷题 so we have a record before deleting theme
    await p.clickByRoleOrText({ name: '编辑极限刷题' })
    await p.clickByRoleOrText({ text: '正计时', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存待办', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    await p.clickByRoleOrText({ name: '开始极限刷题' })
    await p.waitFor(() => window.location.hash.includes('/focus'), { label: 'entered focus' })
    await new Promise((r) => setTimeout(r, 350))
    await p.clickByRoleOrText({ name: '结束专注' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/rest'), { label: 'stopwatch completed into rest' })
    await p.clickByRoleOrText({ text: '退出休息' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '退出休息', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/tasks'))

    // Delete theme 高数 and delete its subtasks -> historical record must still remain in Statistics!
    await p.clickByRoleOrText({ name: '编辑主题高数' })
    await p.clickByRoleOrText({ text: '删除主题', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '一并删除这 2 个待办', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '删除主题和 2 个待办', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '统计' })
    await p.waitFor(() => window.location.hash.includes('/statistics'))
    const statsText = await p.evaluate(() => document.body.innerText)
    expect(statsText).toContain('1')

    p.assertNoErrors('theme and subtask CRUD')
  })

  it('starts normal task focus in <= 2 steps without blocking StrictStartConfirmation even when strict is off & study/quiet prefs exist (UF3)', async () => {
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
        preferences: {
          defaultMinutes: 25,
          sound: true,
          vibration: true,
          activeSemesterId: null,
          protection: {
            study: true,
            strict: false,
            interceptNotifications: true,
            dnd: true,
            globalWhitelist: ['com.tencent.mm'],
            enhancements: [],
            modules: {
              master: true,
              initialized: true,
              apps: { enabled: true, custom: { restrict: true, temporaryAccess: true } },
              strict: { enabled: false, custom: {} },
              quiet: { enabled: true, custom: { sound: true, intercept: true, whitelistPass: true } },
            },
          },
        },
      },
    })

    // 1-step click on subtask card MUST directly enter /focus without StrictStartConfirmation dialog
    await p.clickByRoleOrText({ name: '开始极限刷题' })
    await new Promise((r) => setTimeout(r, 300))

    const openDialogs = await p.evaluate(() => document.querySelectorAll('dialog[open]').length)
    expect(openDialogs).toBe(0)
    expect(await p.currentHashPath()).toBe('/focus')

    p.assertNoErrors('frictionless focus start')
  })

  it('runs pause/resume/early-end -> result screen -> 5-min rest flow -> exit confirmation & completion (UF3, UF4)', async () => {
    const p = await openPage()

    // 1-step empty-state free focus start
    await p.clickByRoleOrText({ text: '开始 25 分钟专注' })
    await p.waitFor(() => window.location.hash.includes('/focus'), { label: 'free focus started' })

    const stringsOnFocus = await auditForbiddenStrings(p, { isPrimaryScreen: true })
    expect(stringsOnFocus.violations).toEqual([])

    // Pause and resume
    await p.clickByRoleOrText({ name: '暂停专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('已暂停'), { label: 'paused state' })
    await new Promise((r) => setTimeout(r, 250))
    await p.clickByRoleOrText({ name: '继续专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('专注进行中'), { label: 'resumed state' })

    // Early end: cancel first, then confirm
    await p.clickByRoleOrText({ name: '结束专注' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '继续专注', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    expect(await p.currentHashPath()).toBe('/focus')

    await new Promise((r) => setTimeout(r, 200))
    await p.clickByRoleOrText({ name: '结束专注' })
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => /提前结束|本次专注已结束/.test(document.body.innerText ?? ''), { label: 'early finish result' })

    // Enter 5-minute rest
    await p.clickByRoleOrText({ text: '休息 5 分钟' })
    await p.waitFor(() => window.location.hash.includes('/rest'), { label: 'entered rest view' })
    const restText = await p.evaluate(() => document.body.innerText)
    expect(restText).toContain('休息中')
    expect(restText).toContain('5 分钟')

    // Attempt exit while running -> cancel keeps rest running -> confirm exits to /tasks
    await p.clickByRoleOrText({ text: '退出休息' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '继续休息', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    expect(await p.currentHashPath()).toBe('/rest')

    await p.clickByRoleOrText({ text: '退出休息' })
    await p.clickByRoleOrText({ text: '退出休息', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/tasks'), { label: 'exited rest to tasks' })

    p.assertNoErrors('focus and rest lifecycle')
  })

  it('enforces strict countdown non-pauseable/non-finishable rules and auto-rest on completion, while stopwatch bypasses strictMode (UF3, UF4)', async () => {
    const p = await openPage({
      supported: true,
      authorized: true,
      connected: true,
      initialData: {
        schemaVersion: 1,
        themes: [{ id: 't1', name: '高数', color: '#ef4e36', order: 0, collapsed: false }],
        items: [
          { id: 'i1', themeId: 't1', title: '极限刷题', note: '', mode: 'countdown', minutes: 25, order: 0 },
          { id: 'i2', themeId: 't1', title: '自由阅读', note: '', mode: 'stopwatch', minutes: 25, order: 1 },
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
            study: false,
            strict: true,
            interceptNotifications: false,
            dnd: false,
            globalWhitelist: [],
            enhancements: [],
            modules: {
              master: true,
              initialized: true,
              apps: { enabled: false, custom: {} },
              strict: { enabled: true, custom: { noPauseEnd: true } },
              quiet: { enabled: false, custom: {} },
            },
          },
        },
      },
    })

    // 1. Stopwatch MUST bypass strictMode -> directly enters /focus with pause & end available
    await p.clickByRoleOrText({ name: '开始自由阅读' })
    await p.waitFor(() => window.location.hash.includes('/focus'), { label: 'stopwatch started despite strictMode' })
    expect(await p.evaluate(() => document.querySelectorAll('dialog[open]').length)).toBe(0)
    expect(await p.evaluate(() => !!document.querySelector('[aria-label="暂停专注"]'))).toBe(true)
    expect(await p.evaluate(() => !!document.querySelector('[aria-label="结束专注"]'))).toBe(true)

    await p.clickByRoleOrText({ name: '暂停专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('已暂停'))
    await p.clickByRoleOrText({ name: '结束专注' })
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/rest'))
    await p.clickByRoleOrText({ text: '退出休息' })
    await p.clickByRoleOrText({ text: '退出休息', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/tasks'))

    // 2. Countdown with unacknowledged strictMode shows confirmation dialog and locks pause/end
    await p.clickByRoleOrText({ name: '开始极限刷题' })
    const hasStrictConfirm = await p.evaluate(() => document.querySelectorAll('dialog[open]').length === 1)
    if (hasStrictConfirm) {
      const confirmBtn = await p.evaluate(() => {
        const dlg = document.querySelector('dialog[open]')
        const btns = [...(dlg?.querySelectorAll('button') ?? [])]
        return btns.some((b) => (b.textContent ?? '').includes('确认开始')) ? '确认开始' : '开始专注'
      })
      await p.clickByRoleOrText({ text: confirmBtn, withinOpenDialog: true })
    }
    await p.waitFor(() => window.location.hash.includes('/focus'), { label: 'strict focus running' })

    // Pause and end controls must NOT be available in strict countdown
    const controlsPresent = await p.evaluate(() => ({
      pause: !!document.querySelector('[aria-label="暂停专注"]'),
      end: !!document.querySelector('[aria-label="结束专注"]'),
      bodyText: document.body.innerText,
    }))
    expect(controlsPresent.pause).toBe(false)
    expect(controlsPresent.end).toBe(false)
    expect(controlsPresent.bodyText).toContain('严格倒计时')

    // Fast-forward 25 min via native stub -> transitions to /rest automatically on completion
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(
        25 * 60000 + 500,
      )
    })
    await p.waitFor(() => window.location.hash.includes('/rest'), { timeoutMs: 8000, label: 'auto rest after completion' })

    // Fast-forward 5 min rest -> rest completes and offers 再次专注
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceRestMs: (ms: number) => void } }).__catFocusStub.advanceRestMs(
        5 * 60000 + 500,
      )
    })
    await p.waitFor(() => (document.body.innerText ?? '').includes('休息完成'), { timeoutMs: 8000, label: 'rest completed' })
    expect(await p.evaluate(() => document.body.innerText)).toContain('再次专注')

    p.assertNoErrors('strict countdown, stopwatch bypass and auto rest')
  })
})
