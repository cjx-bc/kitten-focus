// Combined real application restriction + app-owned Android sound rule recovery.
import assert from 'node:assert/strict'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'

const qa = await connectQa({ output: 'artifacts/focus-control/api36/recovery-device' })
const { native, evaluate, command } = qa
const results = []
let grantedDnd = false
const click = label => evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(el =>
    el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)});
  if (!button) throw new Error('Missing QA control: ' + ${JSON.stringify(label)});
  button.click();
})()`)
const body = () => evaluate('document.body.innerText')
const foreground = () => command('shell', 'dumpsys', 'activity', 'activities')
const openSettings = () => command('shell', 'am', 'start', '-a', 'android.settings.SETTINGS')
const main = () => command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
async function checkBlocked(blocked) {
  openSettings()
  await until(() => blocked ? /topResumedActivity=.*FocusBlockActivity/.test(foreground())
    : /topResumedActivity=.*com.android.settings/.test(foreground()), blocked ? 'actual Settings block' : 'Settings released')
  await delay(350)
  assert.equal(/topResumedActivity=.*FocusBlockActivity/.test(foreground()), blocked)
}
try {
  assert.equal((await native('observeControl')).focus.session, null, 'Finish previous QA focus before this scenario')
  await native('restAction', { action: 'exit' })
  grantedDnd = !(await native('getDndStatus')).permissionGranted
  if (grantedDnd) command('shell', 'cmd', 'notification', 'allow_dnd', qa.appId)
  const data = emptyData()
  data.preferences.sound = false
  data.preferences.vibration = false
  data.preferences.protection = { ...defaultProtection(), study: true, strict: true, dnd: true,
    globalWhitelist: ['com.android.chrome'] }
  await native('replaceData', { data })
  await qa.send('Page.reload')
  await until(() => evaluate('!!document.querySelector(".tabbar")'), 'initialized original UI')
  await until(async () => (await native('protectionStatus')).connected, 'real accessibility connection')
  const now = Date.now(), session = { id: 'recovery-real-' + now, itemId: null, themeId: null,
    title: '组合恢复设备验证', themeName: '自由专注', color: '#222222', mode: 'countdown', targetMs: 60000,
    startedAt: now, timeZone: 'UTC', state: 'running', elapsedMs: 0, pausedMs: 0,
    anchorMono: now, anchorEpoch: now, bootId: 0, segments: [] }
  await native('startFocus', { session, strictModeConfirmed: true })
  await until(async () => (await native('getDndStatus')).phase === 'active', 'actual Android sound rule')
  const activeSound = await native('getDndStatus')
  assert.equal(activeSound.ruleActive, true)
  await checkBlocked(true)
  main()
  await evaluate("location.hash = '#/recovery'")
  await until(() => evaluate('!!document.querySelector("dialog[open][aria-label=\'保护帮助与故障恢复\']")'), 'recovery UI')
  await until(async () => (await body()).includes('应用使用限制 · 待撤销') && (await body()).includes('声音'), 'combined recovery preview')
  const preview = await native('previewRecovery')
  assert.equal(preview.steps.filter(step => step.status === 'active').length, 2)
  await qa.screenshot('01-combined-preview')
  await click('取消，保持现状')
  assert.deepEqual(await native('previewRecovery'), preview)
  assert.equal((await native('getDndStatus')).phase, 'active')
  await checkBlocked(true)
  results.push({ scenario: 'cancel-preview-keeps-real-application-and-sound-effects', passed: true })
  main()
  await click('查看本轮恢复项目')
  await until(() => evaluate('[...document.querySelectorAll("button")].some(b => b.textContent === "确认撤销以上本轮保护" && !b.disabled)'), 'recovery ready')
  await click('确认撤销以上本轮保护')
  await until(async () => (await body()).includes('本次恢复已完成'), 'actual UI recovery result')
  const recovered = await native('previewRecovery')
  assert.equal(recovered.pending, false)
  assert(recovered.steps.every(step => step.status === 'restored'))
  assert.equal((await native('getDndStatus')).phase, 'withdrawn')
  const active = (await native('observeControl')).focus.session
  assert.equal(active.id, session.id)
  assert.equal(active.state, 'running')
  assert.equal(active.strictMode, true)
  assert.deepEqual((await native('loadData')).data.preferences, data.preferences)
  for (const action of ['pause', 'finish', 'cancel'])
    await assert.rejects(() => native('focusAction', { action }), /严格/)
  await qa.screenshot('02-combined-restored')
  await click('完成')
  await checkBlocked(false)
  results.push({ scenario: 'confirm-withdraws-both-real-effects-keeps-strict-timer-and-preferences', passed: true })
  main()
  await evaluate("location.hash = '#/focus'")
  await qa.send('Page.reload')
  await until(() => evaluate('!!document.querySelector(".focus-clock")'), 'recreated focus UI')
  assert.equal((await native('protectionStatus')).active, false)
  assert.equal((await native('getDndStatus')).phase, 'withdrawn')
  await checkBlocked(false)
  results.push({ scenario: 'UI-recreation-and-service-events-do-not-reapply-withdrawn-effects', passed: true })
  main()
  await until(async () => (await native('focusAction', { action: 'read' })).session === null, 'strict natural completion', 75000)
  assert.equal((await native('observeControl')).owner, 'rest')
  assert.equal((await native('loadData')).data.records.filter(record => record.id === session.id).length, 1)
  await native('restAction', { action: 'exit' })
  results.push({ scenario: 'withdrawn-strict-round-still-completes-once-and-enters-rest', passed: true })
  qa.save('results.json', { serial: qa.serial, appId: qa.appId, activeSound, results })
  console.log(JSON.stringify({ serial: qa.serial, results }))
} finally {
  await native('restoreDnd').catch(() => {})
  if (grantedDnd && !(await native('getDndStatus')).recoveryPending)
    command('shell', 'cmd', 'notification', 'disallow_dnd', qa.appId)
  qa.close()
}
