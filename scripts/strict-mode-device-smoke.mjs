// Real WebView UI and native strict guards, using only the isolated QA package.
import assert from 'node:assert/strict'
import { emptyData } from '../src/domain/model.ts'
import { connectQa, until, delay } from './lib/android-qa.mjs'

let qa = await connectQa({ output: 'artifacts/focus-control/api36/strict-device' })
const results = []
const click = label => qa.evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(el =>
    el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)});
  if (!button) throw new Error('Missing QA control: ' + ${JSON.stringify(label)});
  button.click();
})()`)
const text = () => qa.evaluate('document.body.innerText')
const reloadTasks = async () => {
  await qa.evaluate("location.hash = '#/tasks'")
  await qa.send('Page.reload')
  await until(() => qa.evaluate('!!document.querySelector(".study-entry")'), 'tasks ready')
}
let restoreNotificationPermission = false
try {
  const existing = await qa.native('observeControl')
  assert(!existing.focus.session, 'Previous focus must be completed before this test')
  await qa.native('restAction', { action: 'exit' })
  restoreNotificationPermission = !(await qa.native('permissions')).notifications
  if (restoreNotificationPermission)
    qa.command('shell', 'pm', 'grant', qa.appId, 'android.permission.POST_NOTIFICATIONS')
  const data = emptyData()
  data.themes = [{ id: 'strict-theme', name: '设备验证', color: '#ef4e36', order: 0, collapsed: false }]
  data.items = [
    { id: 'strict-minute', themeId: 'strict-theme', title: '严格一分钟', note: '', mode: 'countdown', minutes: 1, order: 0 },
    { id: 'strict-stopwatch', themeId: 'strict-theme', title: '普通正计时', note: '', mode: 'stopwatch', minutes: 1, order: 1 },
  ]
  data.preferences.sound = false
  data.preferences.vibration = false
  data.preferences.protection = { study: false, strict: true, interceptNotifications: false, dnd: false, globalWhitelist: [], enhancements: [] }
  await qa.native('replaceData', { data })
  await reloadTasks()
  assert.equal(await qa.evaluate('document.querySelectorAll(".tabbar a").length'), 5)
  await click('开始严格一分钟')
  await until(() => qa.evaluate('!!document.querySelector("dialog[open][aria-label=\'开始专注\']")'), 'strict confirmation')
  assert((await text()).includes('开始后不可暂停或提前结束'))
  await qa.screenshot('01-start-confirmation')
  await click('暂不开始')
  assert.equal((await qa.native('observeControl')).owner, null)
  await click('开始严格一分钟')
  await until(() => qa.evaluate('!!document.querySelector("dialog[open][aria-label=\'开始专注\']")'), 'second strict confirmation')
  await qa.evaluate('[...document.querySelectorAll("dialog[open][aria-label=\'开始专注\'] button")].find(el => el.textContent.trim() === "开始专注").click()')
  await until(() => qa.evaluate('location.hash === "#/focus" && !!document.querySelector(".focus-clock")'), 'strict focus page')
  const started = await qa.native('observeControl')
  const id = started.focus.session.id
  assert.equal(started.focus.session.strictMode, true)
  assert.equal((await qa.native('protectionStatus')).active, false)
  assert.equal(await qa.evaluate('document.querySelectorAll(".pause-control,.end-control").length'), 0)
  results.push({ scenario: 'confirmed-strict-countdown-independent-from-app-restriction', passed: true })
  for (const action of ['pause', 'finish', 'cancel', 'resume']) {
    await assert.rejects(() => qa.native('focusAction', { action }), /严格/)
  }
  await assert.rejects(() => qa.native('replaceData', { data }))
  results.push({ scenario: 'all-native-mutation-and-replacement-bypasses-rejected', passed: true })
  qa.command('shell', 'input', 'keyevent', 'KEYCODE_BACK')
  await until(() => qa.evaluate('location.hash === "#/tasks"'), 'Android back preserves focus')
  assert.equal((await qa.native('observeControl')).focus.session.id, id)
  qa.command('shell', 'cmd', 'statusbar', 'expand-notifications')
  // This QA AVD is 540x960. Its running chronometer prevents UiAutomator's idle
  // wait, so retain an actual shade screenshot and use its inspected title point.
  assert(qa.command('shell', 'wm', 'size').includes('540x960'), 'Reinspect notification tap coordinates for a different display')
  await until(() => qa.command('shell', 'cmd', 'notification', 'list').includes(qa.appId + '|40|'), 'ongoing focus notification')
  await delay(2200)
  qa.command('shell', 'screencap', '-p', '/data/local/tmp/qa-strict-shade.png')
  qa.command('pull', '/data/local/tmp/qa-strict-shade.png', 'artifacts/focus-control/api36/strict-device/03-notification-shade.png')
  qa.command('shell', 'input', 'tap', '200', '490')
  await until(() => qa.evaluate('location.hash === "#/focus"'), 'real notification click returns to focus')
  await qa.send('Page.reload')
  await until(() => qa.evaluate('!!document.querySelector(".focus-clock")'), 'WebView reload')
  assert.equal((await qa.native('observeControl')).focus.session.id, id)
  await qa.screenshot('02-running-strict')
  qa.command('shell', 'input', 'keyevent', 'KEYCODE_HOME')
  qa.close()
  // A stopped process is restarted without a timer mutation or data clearing.
  const adbArgs = ['shell', 'am', 'force-stop', qa.appId]
  qa.command(...adbArgs)
  qa = await connectQa({ output: 'artifacts/focus-control/api36/strict-device' })
  await until(async () => (await qa.native('observeControl')).focus.session?.id === id, 'cold re-entry preserves strict session')
  results.push({ scenario: 'Android-back-real-notification-click-reload-and-process-reentry-preserve-session', passed: true })
  await until(async () => (await qa.native('focusAction', { action: 'read' })).session === null, 'natural strict completion', 75000)
  const completed = await qa.native('observeControl')
  assert.equal(completed.owner, 'rest')
  assert.equal(completed.rest.session.record.id, id)
  assert.equal(completed.rest.session.record.status, 'completed')
  const loaded = (await qa.native('loadData')).data
  assert.equal(loaded.records.filter(record => record.id === id).length, 1)
  assert(completed.rest.remainingMs > 285000 && completed.rest.remainingMs <= 300000)
  results.push({ scenario: 'natural-completion-writes-once-and-starts-five-minute-rest', passed: true })
  await qa.native('restAction', { action: 'exit' })
  await reloadTasks()
  await click('开始普通正计时')
  await until(async () => (await text()).includes('严格模式不适用'), 'stopwatch non-applicability prompt')
  await qa.evaluate('[...document.querySelectorAll("dialog[open][aria-label=\'开始专注\'] button")].find(el => el.textContent.trim() === "开始专注").click()')
  await until(() => qa.evaluate('!!document.querySelector(".pause-control")'), 'normal stopwatch controls')
  await qa.native('focusAction', { action: 'pause' })
  assert.equal((await qa.native('observeControl')).focus.session.state, 'paused')
  await qa.native('focusAction', { action: 'resume' })
  await qa.native('focusAction', { action: 'finish' })
  await qa.native('restAction', { action: 'exit' })
  results.push({ scenario: 'strict-preference-keeps-stopwatch-pausable-and-finishable', passed: true })
  qa.save('results.json', { serial: qa.serial, appId: qa.appId, results })
  console.log(JSON.stringify({ serial: qa.serial, results }))
} finally {
  if (restoreNotificationPermission)
    qa.command('shell', 'pm', 'revoke', qa.appId, 'android.permission.POST_NOTIFICATIONS')
  qa.close()
}
