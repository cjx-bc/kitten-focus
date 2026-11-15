// Representative T22 combination, not a substitute for wallpaper/notification coverage.
import assert from 'node:assert/strict'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, until } from './lib/android-qa.mjs'

const output = process.env.QA_OUTPUT || 'artifacts/focus-control/api36/entry-combination'
let qa = await connectQa({ port: 9264, output })
const native = (...args) => qa.native(...args), command = (...args) => qa.command(...args)
const baseline = { data: (await native('loadData')).data,
  services: command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
  enabled: command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim(),
  notifications: /android.permission.POST_NOTIFICATIONS: granted=true/.test(command('shell', 'dumpsys', 'package', qa.appId)) }
const service = qa.appId + '/com.xiaomao.focus.FocusAccessibilityService'
const others = baseline.services === 'null' ? [] : baseline.services.split(':').filter(value => value && value !== service)
const services = [...others, service].join(':')
const secure = (key, value) => command('shell', 'settings', value === 'null' ? 'delete' : 'put', 'secure', key, ...(value === 'null' ? [] : [value]))
const queryAlias = () => command('shell', 'cmd', 'package', 'query-activities', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', qa.appId).includes('LauncherAlias')
const click = label => qa.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)} && !button.disabled); if (!button) throw new Error('Missing enabled button ' + ${JSON.stringify(label)}); button.click() })()`)
async function rebind() {
  secure('enabled_accessibility_services', others.length ? others.join(':') : 'null')
  secure('enabled_accessibility_services', services); secure('accessibility_enabled', '1')
  await until(async () => (await native('protectionStatus')).connected, 'actual accessibility reconnected')
}
qa.save('baseline.json', baseline)
try {
  assert.equal((await native('observeControl')).owner, null)
  assert.equal((await native('getLauncherStatus')).componentState, 0)
  command('shell', 'pm', 'grant', qa.appId, 'android.permission.POST_NOTIFICATIONS')
  await rebind()
  const data = emptyData(); data.preferences.sound = false; data.preferences.vibration = false
  data.preferences.protection = { ...defaultProtection(), enhancements: ['lockMainInterfaceRestricted', 'launcherIconHidden', 'recentTasksHidden'] }
  data.lockConfigurations = [{ id: 'entry-combination', name: '组合入口严格锁机验证', minutes: 1, strict: true, whitelist: { source: 'global' } }]
  await native('replaceData', { data }); await qa.evaluate("location.hash = '#/tasks'"); await qa.send('Page.reload')
  await until(() => qa.evaluate('!!document.querySelector(".tabbar") && !document.querySelector(".boot")'), 'fixture initialized in the real app store')
  const started = (await native('startLock', { configurationId: 'entry-combination', strictLockConfirmed: true })).session
  await qa.evaluate("location.hash = '#/tasks'")
  await until(() => qa.evaluate("location.hash === '#/lock'"), 'combined main interface restriction')
  await until(async () => (await native('getLauncherStatus')).verified && (await native('getRecentTasksStatus')).verified, 'combined real alias and AppTask effects')
  assert.equal(queryAlias(), false)
  qa.save('active.json', { control: await native('observeControl'), launcher: await native('getLauncherStatus'), recentTasks: await native('getRecentTasksStatus') })
  qa.save('active-system-tasks.json', command('shell', 'dumpsys', 'activity', 'recents'))
  await qa.screenshot('01-three-protections-active-strict-lock')
  await qa.evaluate("location.hash = '#/recovery'")
  await until(() => qa.evaluate('[...document.querySelectorAll("dialog[open] button")].some(button => button.textContent.trim() === "确认撤销以上本轮保护" && !button.disabled)'), 'combined actual recovery confirmation')
  const preview = await native('previewRecovery')
  for (const capability of ['lockMainInterfaceRestricted', 'launcherIconHidden', 'recentTasksHidden']) assert(preview.steps.some(step => step.capability === capability && step.status !== 'restored'))
  await click('确认撤销以上本轮保护')
  await until(() => qa.evaluate('document.body.innerText.includes("本次恢复已完成")'), 'combined UI restoration completed')
  await click('完成')
  assert.equal(queryAlias(), true)
  assert.equal((await native('getRecentTasksStatus')).phase, 'withdrawn')
  await qa.evaluate("location.hash = '#/tasks'"); await until(() => qa.evaluate("location.hash === '#/tasks'"), 'recovery opens the business interface')
  await rebind(); await qa.send('Page.reload')
  await until(() => qa.evaluate("location.hash === '#/tasks' && !!document.querySelector('.tabbar')"), 'rebind and reload preserve withdrawal')
  const current = (await native('observeControl')).lock.session
  for (const key of ['id', 'startedAt', 'targetMs', 'strictMode']) assert.equal(current[key], started[key], 'same strict lock ' + key)
  assert.equal((await native('getLauncherStatus')).componentState, 0)
  assert.equal((await native('getRecentTasksStatus')).phase, 'withdrawn')
  await assert.rejects(() => native('lockAction', { action: 'finish', confirmed: true }), /严格/)
  await qa.screenshot('02-all-three-withdrawn-same-strict-clock')
  await until(async () => !(await native('lockAction', { action: 'read' })).session, 'strict combination naturally expires', 75000)
  assert.equal((await native('observeControl')).owner, null)
  assert.equal((await native('loadData')).data.records.length, 0)
  qa.save('results.json', { passed: true, started, recovered: current, observed: await native('observeControl'), limits: ['This representative combination does not cover wallpaper, notification interception or real OEM behavior', 'Single-capability Launcher3 drawer/overview evidence is recorded by their separate device scripts'] })
  console.log('PASS strict lock + main interface restriction + hidden launcher alias + hidden own AppTask; shared UI recovery and reconnect preserve the same strict deadline')
} catch (error) {
  qa.save('failure.json', { message: error.stack }); throw error
} finally {
  if (qa.closed) qa = await connectQa({ port: 9264, output })
  if ((await native('observeControl')).lock.session) await until(async () => !(await native('lockAction', { action: 'read' })).session, 'cleanup natural strict expiry', 75000)
  const preview = await native('previewRecovery'); if (preview.pending) await native('confirmRecovery', { revision: preview.revision })
  await native('replaceData', { data: baseline.data })
  secure('enabled_accessibility_services', baseline.services); secure('accessibility_enabled', baseline.enabled)
  command('shell', 'pm', baseline.notifications ? 'grant' : 'revoke', qa.appId, 'android.permission.POST_NOTIFICATIONS')
  qa.close()
}
