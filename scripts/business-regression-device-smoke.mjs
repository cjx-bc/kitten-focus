// Final A01/A18 old-business acceptance. Real QA UI, Java timer, and SQLite only.
// Default includes the full five-minute rest; there is deliberately no shortened-clock mode.
import assert from 'node:assert/strict'
import { runQaUi } from './lib/qa-ui-fixture.mjs'
import { delay, until } from './lib/android-qa.mjs'
const detailsOnly = process.argv.includes('--details-only')

await runQaUi({ port: 9245, output: 'artifacts/focus-control/api36/final-business-regression' }, async ui => {
  const { qa } = ui
  const title = '回归可复用阅读', theme = '回归学习', eventTitle = '回归阅读安排'
  const observe = () => qa.native('observeControl')
  const load = async () => (await qa.native('loadData')).data
  const tabs = [['/tasks', '待办'], ['/calendar', '日历'], ['/cat', '小猫'], ['/statistics', '统计'], ['/settings', '我的']]
  for (const [path, label] of tabs) {
    await qa.evaluate(`document.querySelector('.tabbar a[href="#${path}"]').click()`)
    await until(() => qa.evaluate(`location.hash === '#${path}' && !!document.querySelector('.tabbar a[aria-current="page"]')`), label)
    const nav = await qa.evaluate(`([...document.querySelectorAll('.tabbar a')].map(a => ({
      path: a.getAttribute('href'), label: a.getAttribute('aria-label'), text: a.textContent.trim(), icon: !!a.querySelector('svg'), current: a.getAttribute('aria-current')
    })))`)
    assert.deepEqual(nav.map(a => a.path), tabs.map(([p]) => '#' + p))
    assert(nav.every(a => a.icon && a.text === ''), 'Original five tabs remain icon-only')
    assert(nav.find(a => a.current === 'page').label.startsWith(label))
    assert(await qa.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'No horizontal page overflow')
    await qa.screenshot('01-tab-' + path.slice(1))
  }
  ui.pass('original-five-icon-only-tabs-in-original-order-and-no-horizontal-overflow')
  await ui.route('/tasks')
  await ui.click('新建主题'); await ui.fill('主题名称', theme); await ui.click('保存主题'); await ui.closedSheet()
  await ui.click('在' + theme + '下添加待办'); await ui.fill('待办名称', title)
  await ui.click('正计时'); await ui.click('保存待办'); await ui.closedSheet()
  const item = (await load()).items.find(i => i.title === title)
  assert(item && !Object.hasOwn(item, 'completed'), 'Reusable item has no completion state')
  await qa.screenshot('02-created-theme-and-item')

  async function finishDialog(accept, name) {
    assert(await qa.evaluate(`!!document.querySelector('[aria-label="结束专注"]')`))
    await ui.click('结束专注')
    await ui.waitText('结束本次专注？')
    assert(await qa.evaluate(`!!document.querySelector('dialog[open]')`))
    await qa.screenshot(name)
    await ui.click(accept ? '结束专注' : '继续专注')
    await ui.closedSheet()
  }
  await ui.click('开始' + title)
  await until(() => qa.evaluate('!!document.querySelector(".focus-clock")'), 'original focus screen')
  const sessionId = (await observe()).focus.session.id
  assert.equal(await qa.evaluate('document.querySelectorAll(".tabbar").length'), 0)
  assert.equal(await qa.evaluate('document.querySelectorAll(".focus-controls .pause-control,.focus-controls .end-control").length'), 2)
  await delay(1500)
  await ui.click('暂停专注')
  await until(async () => (await observe()).focus.session?.state === 'paused', 'native pause')
  const paused = (await observe()).focus.elapsedMs
  await delay(1200)
  assert.equal((await observe()).focus.elapsedMs, paused, 'Paused time is excluded')
  await qa.send('Page.reload')
  await ui.waitText('已暂停')
  assert.equal((await observe()).focus.session.id, sessionId)
  await ui.click('继续专注')
  await until(async () => (await observe()).focus.session?.state === 'running', 'native resume')
  const beforeBackground = (await observe()).focus.elapsedMs
  qa.command('shell', 'input', 'keyevent', 'KEYCODE_HOME')
  await delay(1500)
  qa.command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
  assert((await observe()).focus.elapsedMs >= beforeBackground + 1000, 'Background time continues')
  await qa.screenshot('03-original-focus')
  await finishDialog(false, '04-finish-cancel')
  assert.equal((await observe()).focus.session.id, sessionId, 'Cancel keeps the same running focus')
  await finishDialog(true, '05-finish-confirm')
  await until(async () => (await observe()).owner === 'rest', 'normal stopwatch finish automatically enters rest')
  await ui.waitText('休息一下')
  const rest = (await observe()).rest.session
  assert.equal(rest.endsAt - rest.startedAt, 300000, 'Existing rest is exactly five minutes')
  assert.equal(rest.record.status, 'completed')
  assert.equal(rest.record.itemId, item.id)
  assert(rest.record.durationMs > 0 && rest.record.pausedMs >= 1000)
  assert.equal(await qa.evaluate('document.querySelectorAll(".tabbar").length'), 0)
  await qa.screenshot('06-five-minute-rest')
  ui.pass('UI-creation-pause-reload-resume-background-and-real-finish-confirmation-create-one-record')
  const recordAtRestStart = (await load()).records
  assert.equal(recordAtRestStart.length, 1)
  assert.equal((await load()).items[0].id, item.id)
  async function restExitDialog(accept) {
    await ui.click('退出休息')
    await ui.waitText('退出休息？')
    await ui.click(accept ? '退出休息' : '继续休息')
    if (!accept) await ui.closedSheet()
  }
  await restExitDialog(false)
  assert.equal((await observe()).rest.session.startedAt, rest.startedAt, 'Cancel exit preserves the same rest deadline')
  if (!detailsOnly) console.log('Waiting for the real five-minute rest deadline; no clock replacement')
  const waitStarted = Date.now()
  let heartbeat = Date.now()
  while (!detailsOnly && (await observe()).rest.session?.state !== 'completed') {
    assert(Date.now() - waitStarted < 325000, 'Real rest failed to complete at its fixed deadline')
    await delay(1000)
    if (Date.now() - heartbeat > 30000) {
      console.log('Rest remaining ms: ' + (await observe()).rest.remainingMs)
      heartbeat = Date.now()
    }
  }
  if (!detailsOnly) {
  await ui.waitText('休息结束')
  await delay(2000)
  assert.equal((await observe()).focus.session, null, 'Rest never automatically starts another focus')
  assert.deepEqual((await load()).records, recordAtRestStart, 'Rest does not add focus time or duplicate records')
  await qa.screenshot('07-rest-completed-no-auto-focus')
  ui.pass('real-five-minute-rest-cancel-exit-completes-without-extra-statistics-or-auto-next-round', { waitedMs: Date.now() - waitStarted })
  await ui.click('返回待办'); await ui.waitText(title)
  } else {
    console.log('Details-only continuation: full rest evidence belongs to the separate timed-phase result; this run does not claim timed acceptance')
    await restExitDialog(true)
  }
  await until(() => qa.evaluate(`location.hash === '#/tasks' && !!document.querySelector('.tabbar') && !!document.querySelector('[aria-label="编辑待办${title}"]')`), 'tasks after rest exit settled')

  // Reuse the SAME item as an ordinary countdown; early end offers manual rest.
  await ui.click('编辑待办' + title); await ui.click('倒计时'); await ui.fill('专注时长（分钟）', '1')
  await ui.click('保存待办'); await ui.closedSheet(); await ui.click('开始' + title)
  await until(() => qa.evaluate('!!document.querySelector(".focus-clock")'), 'reused item countdown')
  await delay(1500); await finishDialog(true, '08-early-finish-confirm')
  await ui.waitText('本次专注已结束')
  assert.equal((await observe()).rest.session, null, 'Early finish requires manual rest')
  await ui.click('休息 5 分钟'); await ui.waitText('休息一下')
  assert.equal((await observe()).rest.session.endsAt - (await observe()).rest.session.startedAt, 300000)
  await restExitDialog(true)
  await until(() => qa.evaluate('location.hash === "#/tasks"'), 'confirmed manual rest exit')
  const records = (await load()).records
  assert.equal(records.length, 2)
  assert.deepEqual(new Set(records.map(r => r.status)), new Set(['completed', 'early']))
  assert(records.every(r => r.itemId === item.id && r.durationMs > 0))
  assert.equal((await load()).items.length, 1)
  await qa.screenshot('09-item-remains-reusable')
  ui.pass('same-item-reused-early-finish-manual-rest-confirmed-exit-and-two-independent-records')

  await ui.route('/calendar'); await ui.click('添加日程'); await ui.fill('日程名称', eventTitle)
  await ui.fill('关联待办（选填）', item.id); await ui.click('保存日程'); await ui.closedSheet()
  await ui.waitText(eventTitle)
  const event = (await load()).events.find(e => e.title === eventTitle)
  assert.equal(event.itemId, item.id)
  await qa.screenshot('10-calendar-linked-plan')
  await ui.click('实际')
  await until(() => qa.evaluate('document.querySelectorAll(".actual-card").length === 2'), 'two real calendar records')
  assert((await ui.text()).includes('正常结束') && (await ui.text()).includes('提前结束'))
  await qa.screenshot('11-calendar-actual-records')
  await ui.route('/statistics'); await ui.click('累计')
  const count = await qa.evaluate(`([...document.querySelectorAll('.overview-grid > div')].find(el => el.querySelector('span')?.textContent === '专注次数')?.querySelector('strong')?.textContent)`)
  assert.equal(count?.replace(/\s/g, ''), '2次')
  await ui.click('待办')
  await until(() => qa.evaluate(`document.querySelector('.legend-list')?.textContent.includes(${JSON.stringify(title)})`), 'reusable item statistics')
  await qa.screenshot('12-statistics-real-item-totals')
  await ui.click('查看专注记录')
  assert.equal(await qa.evaluate('document.querySelectorAll("dialog[open] .record").length'), 2)
  await qa.screenshot('13-two-records')
  await ui.click('关闭'); await ui.closedSheet()
  assert.deepEqual((await load()).records, records, 'Calendar/statistics browsing does not mutate records')
  ui.pass('calendar-linked-plan-and-actual-records-statistics-count-and-item-group-use-real-history')
  await ui.route('/calendar'); await ui.click('课表'); await ui.click('设置学期')
  await ui.fill('学期名称', '回归学期'); await ui.click('保存并设为当前学期'); await ui.closedSheet()
  await ui.click('添加课程'); await ui.fill('课程名称', '回归数学'); await ui.click('保存课程'); await ui.closedSheet()
  assert.equal((await load()).semesters.length, 1); assert.equal((await load()).courses.length, 1)
  await qa.screenshot('14-original-timetable')
  await ui.route('/settings'); await ui.waitText('导出备份')
  await qa.screenshot('15-original-settings')
  ui.pass('original-semester-course-and-settings-entries-remain-reachable')
})
