import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import path from 'node:path'
import { startStaticServer, type StaticServer } from './helpers/staticServer'
import { CdpPage, type CatFocusStubOptions } from './helpers/cdpBrowser'
import { auditModals, auditForbiddenStrings } from './helpers/uxAudit'

describe('Student Focus Flow & Core Task Navigation (UF1, UF2, UF3, UF4)', () => {
  let server: StaticServer
  let page: CdpPage | undefined

  async function openPage(catFocusStub: boolean | CatFocusStubOptions = true, route = '/'): Promise<CdpPage> {
    await page?.close()
    page = await CdpPage.launch({ width: 390, height: 844, catFocusStub })
    await page.goto(`${server.url}/#${route}`, true)
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

  it('boots / directly to /focus with 5-tab icon-only bottom bar and supports tab switching (UF1)', async () => {
    const p = await openPage()
    expect(await p.currentHashPath()).toBe('/focus')

    const navTabs = await p.evaluate(() => {
      const links = [...document.querySelectorAll('nav.tabbar a')]
      return links.map((a) => ({
        label: a.getAttribute('aria-label') ?? '',
        current: a.getAttribute('aria-current'),
        text: (a.textContent ?? '').trim(),
      }))
    })

    expect(navTabs).toHaveLength(5)
    expect(navTabs.map((t) => t.label.replace('，有新版本', ''))).toEqual(['专注', '时间轴', '农场', '统计', '我的'])
    expect(navTabs[0]?.current).toBe('page')
    for (const t of navTabs) {
      expect(t.text).toBe('')
    }

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '时间轴' })
    expect(await p.currentHashPath()).toBe('/calendar')

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '农场' })
    expect(await p.currentHashPath()).toBe('/cat')

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '统计' })
    expect(await p.currentHashPath()).toBe('/statistics')

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '我的' })
    expect(await p.currentHashPath()).toBe('/settings')

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '专注' })
    expect(await p.currentHashPath()).toBe('/focus')

    p.assertNoErrors('5-tab navigation')
  })

  it('supports non-looping horizontal swipe across 5 tabs, isolates clock drag zone, and suppresses swipe when dialog open (UF1)', async () => {
    const p = await openPage()
    expect(await p.currentHashPath()).toBe('/focus')

    // Dragging on clock drag zone changes duration and MUST NOT swipe tabs
    const clockBox = await p.evaluate(() => {
      const r = document.querySelector('.clock-drag-zone')!.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    await p.touchSwipe(clockBox.x, clockBox.y, clockBox.x + 40, clockBox.y, 10)
    expect(await p.currentHashPath()).toBe('/focus')
    expect(await p.evaluate(() => document.querySelector('.standby-clock')?.textContent?.trim())).toBe('35:00')

    // Swipe right at leftmost /focus -> stays on /focus
    await p.touchSwipe(140, 200, 280, 200)
    expect(await p.currentHashPath()).toBe('/focus')

    // Swipe left across all 5 tabs (starting from empty header/top area outside clock drag zone)
    await p.touchSwipe(280, 120, 140, 120)
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

    p.assertNoErrors('tab swipe and clock drag isolation')
  })

  it('supports standby pet bounce, 10s regret cancel without record, left-swipe give-up, and early settlement note (#32)', async () => {
    const p = await openPage()

    // Tap black cat -> bubble appears, no modal opens
    await p.clickByRoleOrText({ name: '轻点小黑猫互动' })
    await p.waitFor(() => (document.querySelector('.pet-bubble')?.textContent ?? '').trim().length > 0, {
      label: 'pet bubble visible',
    })
    expect(await p.evaluate(() => document.querySelectorAll('dialog[open]').length)).toBe(0)

    // Quick minute buttons & stopwatch toggle
    await p.clickByRoleOrText({ text: '45', exact: true, selector: '.quick-chip' })
    expect(await p.evaluate(() => document.querySelector('.standby-clock')?.textContent?.trim())).toBe('45:00')
    await p.clickByRoleOrText({ text: '25', exact: true, selector: '.quick-chip' })
    expect(await p.evaluate(() => document.querySelector('.standby-clock')?.textContent?.trim())).toBe('25:00')

    // Start countdown -> <10s regret window shows 取消 -> cancel leaves 0 records
    await p.clickByRoleOrText({ text: '开始专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('专注进行中'))
    await p.clickByRoleOrText({ text: '取消', exact: true })
    await p.waitFor(() => (document.body.innerText ?? '').includes('开始专注'), { label: 'returned to standby on cancel' })
    const recordsAfterCancel = await p.evaluate(() => {
      const stub = (window as unknown as { __catFocusStub: { getState: () => { data: { records: unknown[] } } } }).__catFocusStub
      return stub.getState().data.records.length
    })
    expect(recordsAfterCancel).toBe(0)

    // Start again -> advance 12s -> left-swipe give-up -> early settlement with failed cat & note chip
    await p.clickByRoleOrText({ text: '开始专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('专注进行中'))
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await p.waitFor(() => (document.body.innerText ?? '').includes('左滑放弃'), { label: 'slider visible after 10s' })

    const thumb = await p.evaluate(() => {
      const r = document.querySelector('.giveup-thumb')!.getBoundingClientRect()
      const track = document.querySelector('.giveup-track')!.getBoundingClientRect()
      return {
        x1: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        x2: Math.round(track.left + 8),
      }
    })
    await p.touchSwipe(thumb.x1, thumb.y, thumb.x2, thumb.y, 10)
    await p.waitFor(() => (document.body.innerText ?? '').includes('完蛋！你的小黑猫挂了'), { label: 'early failure settlement' })
    expect(await p.evaluate(() => document.body.innerText)).toContain('好感 -5')

    await p.clickByRoleOrText({ text: '走神了', selector: '.note-chips button' })
    await p.clickByRoleOrText({ text: '返回首页' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('开始专注'))

    const savedNotes = await p.evaluate(() => {
      const stub = (window as unknown as { __catFocusStub: { getState: () => { data: { records: Array<{ note?: string; status: string }> } } } }).__catFocusStub
      return stub.getState().data.records
    })
    expect(savedNotes).toHaveLength(1)
    expect(savedNotes[0]?.status).toBe('early')
    expect(savedNotes[0]?.note).toBe('走神了')

    p.assertNoErrors('pet tap, 10s regret cancel, and left-swipe give-up')
  })

  it('manages themes and reusable subtasks via /focus -> /tasks without checkboxes or nested modals (UF2)', async () => {
    const p = await openPage()

    // Open task selector sheet on /focus -> navigate to /tasks
    await p.clickByRoleOrText({ text: '自由专注', selector: '.task-pill' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '管理全部待办', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/tasks'), { label: 'navigated to /tasks' })

    // Empty state -> create first task with new theme
    await p.clickByRoleOrText({ text: '创建第一个待办' })
    expect((await auditModals(p)).violations).toEqual([])

    await p.fillByLabel('待办名称', '极限刷题', { withinOpenDialog: true })
    await p.fillByLabel('所属主题', '高数', { withinOpenDialog: true })

    // Validate empty/invalid minute rejection before saving valid item
    await p.fillByLabel('专注时长（分钟）', '0', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '仅保存', withinOpenDialog: true })
    await new Promise((r) => setTimeout(r, 100))
    expect(await p.evaluate(() => document.querySelectorAll('dialog[open]').length)).toBe(1)

    // Restore valid 25 min and save
    await p.fillByLabel('专注时长（分钟）', '25', { withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '仅保存', withinOpenDialog: true })
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
    await p.clickByRoleOrText({ text: '仅保存', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    // Delete theme 英语 -> move 背单词 to 高数
    await p.clickByRoleOrText({ name: '编辑主题英语' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '删除主题', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '移到其他主题', withinOpenDialog: true })
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
    await p.clickByRoleOrText({
      text: '删除主题',
      selector: 'dialog[open] button.danger-button, dialog[open] button.primary, dialog[open] button.danger',
      withinOpenDialog: true,
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
    await p.clickByRoleOrText({ text: '更多设置', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '独立白名单', selector: 'dialog[open] label', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '编辑独立白名单', withinOpenDialog: true })
    expect((await auditModals(p)).violations).toEqual([])
    await p.pressKey('Escape')
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0, { label: 'edit closed' })

    // Complete a short stopwatch focus on 极限刷题 -> settlement screen -> rest -> exit rest to /focus
    await p.clickByRoleOrText({ name: '编辑极限刷题' })
    await p.clickByRoleOrText({ text: '正计时', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存待办', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    await p.clickByRoleOrText({ name: '开始极限刷题' })
    await p.waitFor(() => window.location.hash.includes('/focus'), { label: 'entered focus' })
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await p.waitFor(() => !!document.querySelector('[aria-label="结束专注"]'))
    await p.clickByRoleOrText({ name: '结束专注' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => (document.body.innerText ?? '').includes('本次专注正常结束'), { label: 'completed settlement' })
    await p.clickByRoleOrText({ text: '休息 5 分钟' })
    await p.waitFor(() => window.location.hash.includes('/rest'), { label: 'manual rest entered' })
    await p.clickByRoleOrText({ text: '退出休息' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '退出休息', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/focus'))

    // Return to /tasks via selector -> delete theme 高数 -> historical record remains in Statistics
    await p.clickByRoleOrText({ text: '自由专注', selector: '.task-pill' })
    await p.clickByRoleOrText({ text: '管理全部待办', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/tasks'))
    await p.clickByRoleOrText({ name: '编辑主题高数' })
    await p.clickByRoleOrText({ text: '删除主题', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '一并删除这 2 个待办', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '删除主题和 2 个待办', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    await p.clickByRoleOrText({ name: '返回专注' })
    await p.waitFor(() => window.location.hash.includes('/focus'))

    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '统计' })
    await p.waitFor(() => window.location.hash.includes('/statistics'))
    const statsText = await p.evaluate(() => document.body.innerText)
    expect(statsText).toContain('1')

    p.assertNoErrors('theme and subtask CRUD')
  })

  it('starts normal task focus in <= 2 steps without blocking StrictStartConfirmation even when strict is off & study/quiet prefs exist (UF3)', async () => {
    const p = await openPage(
      {
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
      },
      '/tasks',
    )

    await p.clickByRoleOrText({ name: '开始极限刷题' })
    await new Promise((r) => setTimeout(r, 300))

    const openDialogs = await p.evaluate(() => document.querySelectorAll('dialog[open]').length)
    expect(openDialogs).toBe(0)
    expect(await p.currentHashPath()).toBe('/focus')

    p.assertNoErrors('frictionless focus start')
  })

  it('runs pause/resume/end -> completed settlement screen -> 5-min rest flow -> exit confirmation & return to /focus (UF3, UF4)', async () => {
    const p = await openPage()

    // Select stopwatch and start in 2 clicks on /focus standby
    await p.clickByRoleOrText({ text: '正计时', selector: '.quick-chip' })
    await p.clickByRoleOrText({ text: '开始专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('正计时专注'), { label: 'stopwatch started' })

    const stringsOnFocus = await auditForbiddenStrings(p, { isPrimaryScreen: true })
    expect(stringsOnFocus.violations).toEqual([])

    // Advance past 10s so stopwatch shows 暂停 & 结束专注
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await p.waitFor(() => !!document.querySelector('[aria-label="结束专注"]'))

    // Pause and resume
    await p.clickByRoleOrText({ name: '暂停专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('已暂停'), { label: 'paused state' })
    await new Promise((r) => setTimeout(r, 250))
    await p.clickByRoleOrText({ name: '继续专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('专注进行中'), { label: 'resumed state' })

    // End: cancel first, then confirm
    await p.clickByRoleOrText({ name: '结束专注' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '继续专注', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    expect(await p.currentHashPath()).toBe('/focus')

    await p.clickByRoleOrText({ name: '结束专注' })
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => (document.body.innerText ?? '').includes('本次专注正常结束'), { label: 'completed result' })

    // Enter 5-minute rest
    await p.clickByRoleOrText({ text: '休息 5 分钟' })
    await p.waitFor(() => window.location.hash.includes('/rest'), { label: 'entered rest view' })
    const restText = await p.evaluate(() => document.body.innerText)
    expect(restText).toContain('休息中')
    expect(restText).toContain('5 分钟')

    // Attempt exit while running -> cancel keeps rest running -> confirm exits to /focus
    await p.clickByRoleOrText({ text: '退出休息' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '继续休息', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    expect(await p.currentHashPath()).toBe('/rest')

    await p.clickByRoleOrText({ text: '退出休息' })
    await p.clickByRoleOrText({ text: '退出休息', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/focus'), { label: 'exited rest to focus' })

    p.assertNoErrors('focus and rest lifecycle')
  })

  it('enforces strict countdown non-pauseable/non-finishable rules and auto-rest when autoRest=true, while stopwatch bypasses strictMode (UF3, UF4)', async () => {
    const p = await openPage(
      {
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
            autoRest: true,
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
      },
      '/tasks',
    )

    // 1. Stopwatch MUST bypass strictMode -> directly enters /focus with pause & cancel/end available
    await p.clickByRoleOrText({ name: '开始自由阅读' })
    await p.waitFor(() => window.location.hash.includes('/focus'), { label: 'stopwatch started despite strictMode' })
    expect(await p.evaluate(() => document.querySelectorAll('dialog[open]').length)).toBe(0)
    expect(await p.evaluate(() => !!document.querySelector('[aria-label="暂停专注"]'))).toBe(true)

    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(12000)
    })
    await p.waitFor(() => !!document.querySelector('[aria-label="结束专注"]'))
    await p.clickByRoleOrText({ name: '暂停专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('已暂停'))
    await p.clickByRoleOrText({ name: '结束专注' })
    await p.clickByRoleOrText({ text: '结束专注', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/rest'))
    await p.clickByRoleOrText({ text: '退出休息' })
    await p.clickByRoleOrText({ text: '退出休息', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/focus'))

    // 2. Countdown with unacknowledged strictMode via task selector -> confirmation dialog and locks pause/cancel/give-up
    await p.clickByRoleOrText({ text: '自由专注', selector: '.task-pill' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ name: '开始极限刷题', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1, { label: 'strict confirm dialog' })
    await p.clickByRoleOrText({ text: '确认开始', withinOpenDialog: true })
    await p.waitFor(() => (document.body.innerText ?? '').includes('严格倒计时'), { label: 'strict focus running' })

    // Pause, cancel and give-up controls must NOT be available in strict countdown
    const controlsPresent = await p.evaluate(() => ({
      pause: !!document.querySelector('[aria-label="暂停专注"]'),
      end: !!document.querySelector('[aria-label="结束专注"]'),
      giveup: !!document.querySelector('[aria-label="放弃专注"]'),
      bodyText: document.body.innerText,
    }))
    expect(controlsPresent.pause).toBe(false)
    expect(controlsPresent.end).toBe(false)
    expect(controlsPresent.giveup).toBe(false)
    expect(controlsPresent.bodyText).toContain('严格倒计时')

    // Fast-forward 25 min via native stub -> autoRest=true transitions to /rest automatically on completion
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

  it('persists custom restMinutes (5/10/15/20), autoRest, pomodoroLoop, and keepScreenOn toggle; loops focus on natural rest expiry and stops on manual exit (#34)', async () => {
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

    // 1. Configure 计时与休息 (15 分钟, autoRest=true, pomodoroLoop=true) & toggle 屏幕常亮 in /settings
    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '我的' })
    await p.waitFor(() => window.location.hash.includes('/settings'))

    await p.clickByRoleOrText({ text: '计时与休息' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    expect((await auditModals(p)).violations).toEqual([])
    await p.clickByRoleOrText({ text: '15 分钟', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '自动进入休息', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '番茄循环', withinOpenDialog: true })
    await p.clickByRoleOrText({ text: '保存设置', withinOpenDialog: true })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)

    // Toggle 屏幕常亮 off and verify persistence across reload, then restore true
    await p.clickByRoleOrText({ text: '屏幕常亮' })
    await p.reload(true)
    const afterReload = await p.evaluate(() => {
      const stub = (window as unknown as { __catFocusStub: { getState: () => { data: { preferences: Record<string, unknown> } } } }).__catFocusStub
      return {
        body: document.body.innerText,
        prefs: stub.getState().data.preferences,
      }
    })
    expect(afterReload.body).toContain('15 分钟')
    expect(afterReload.prefs.restMinutes).toBe(15)
    expect(afterReload.prefs.autoRest).toBe(true)
    expect(afterReload.prefs.pomodoroLoop).toBe(true)
    expect(afterReload.prefs.keepScreenOn).toBe(false)
    await p.clickByRoleOrText({ text: '屏幕常亮' })

    // 2. Start focus on 极限刷题 -> complete 25m -> 1.5s harvest -> /rest (15 分钟)
    await p.clickByRoleOrText({ selector: 'nav.tabbar a', name: '专注' })
    await p.waitFor(() => window.location.hash.includes('/focus'))
    await p.clickByRoleOrText({ text: '自由专注', selector: '.task-pill' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ name: '开始极限刷题', withinOpenDialog: true })
    await p.waitFor(() => (document.body.innerText ?? '').includes('专注进行中'))

    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(
        25 * 60000 + 500,
      )
    })
    await p.waitFor(() => (document.body.innerText ?? '').includes('休息 15 分钟'), {
      timeoutMs: 5000,
      label: 'harvest toast/settlement shows 15m rest',
    })
    await p.waitFor(() => window.location.hash.includes('/rest'), {
      timeoutMs: 8000,
      label: 'auto-rest entered after harvest',
    })
    expect(await p.evaluate(() => document.body.innerText)).toContain('15 分钟')

    // 3. Natural rest completion at 15m -> pomodoroLoop automatically starts next round of 极限刷题!
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceRestMs: (ms: number) => void } }).__catFocusStub.advanceRestMs(
        15 * 60000 + 500,
      )
    })
    await p.waitFor(() => window.location.hash.includes('/focus'), {
      timeoutMs: 8000,
      label: 'pomodoroLoop returned to /focus',
    })
    await p.waitFor(() => (document.body.innerText ?? '').includes('专注进行中'), {
      timeoutMs: 5000,
      label: 'pomodoroLoop started next focus',
    })
    expect(await p.evaluate(() => document.body.innerText)).toContain('极限刷题')

    // 4. Complete round 2 -> auto-rest -> manual 退出休息 MUST stop the loop (stay on standby /focus)
    await p.evaluate(() => {
      ;(window as unknown as { __catFocusStub: { advanceFocusMs: (ms: number) => void } }).__catFocusStub.advanceFocusMs(
        25 * 60000 + 500,
      )
    })
    await p.waitFor(() => window.location.hash.includes('/rest'), { timeoutMs: 8000, label: 'round 2 auto-rest' })
    await p.clickByRoleOrText({ text: '退出休息' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1)
    await p.clickByRoleOrText({ text: '退出休息', withinOpenDialog: true })
    await p.waitFor(() => window.location.hash.includes('/focus') && (document.body.innerText ?? '').includes('开始专注'), {
      label: 'manual rest exit returns to standby without looping',
    })

    // Confirm rest time was never added to focus records (still 2 x 25m = 50m)
    const recordsCount = await p.evaluate(() => {
      const stub = (window as unknown as { __catFocusStub: { getState: () => { data: { records: Array<{ durationMs: number }> } } } }).__catFocusStub
      return stub.getState().data.records.map((r) => r.durationMs)
    })
    expect(recordsCount).toEqual([25 * 60000, 25 * 60000])

    p.assertNoErrors('custom rest, autoRest, pomodoroLoop, and keepScreenOn E2E')
  })
})
