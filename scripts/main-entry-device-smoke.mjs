// Real launcher/Activity intents, WebView hash navigation and visible recovery UI. QA only.
import assert from 'node:assert/strict'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, until } from './lib/android-qa.mjs'

let qa = await connectQa({ port: 9256, output: 'artifacts/focus-control/api36/main-entry' })
const native = (...args) => qa.native(...args), evaluate = expression => qa.evaluate(expression)
const command = (...args) => qa.command(...args), observe = () => native('observeControl')
const baseline = { data: (await native('loadData')).data,
  services: command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
  enabled: command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim() }
const results = []
const text = () => evaluate('document.body.innerText')
const click = label => evaluate(`(() => { const el = [...document.querySelectorAll('button,a')].find(el => el.textContent.trim() === ${JSON.stringify(label)}); if (!el) throw new Error('Missing ' + ${JSON.stringify(label)}); el.click(); })()`)
async function route(path) { await evaluate(`location.hash = ${JSON.stringify('#' + path)}`) }
async function at(path) { await until(() => evaluate(`location.hash === ${JSON.stringify('#' + path)}`), 'visible route ' + path) }
async function ordinaryStart() { command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity'); await at('/lock') }
try {
  assert.equal((await observe()).owner, null, 'Finish previous QA scenario first')
  const services = baseline.services === 'null' ? [] : baseline.services.split(':').filter(Boolean)
  command('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...new Set([...services, qa.appId + '/com.xiaomao.focus.FocusAccessibilityService'])].join(':'))
  command('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1')
  await until(async () => (await native('protectionStatus')).connected, 'actual accessibility bound')
  const data = emptyData()
  data.preferences.sound = false; data.preferences.vibration = false
  data.preferences.protection = { ...defaultProtection(), enhancements: ['lockMainInterfaceRestricted'] }
  data.lockConfigurations = [{ id: 'routing-lock', name: '入口限制验证', minutes: 1, strict: true, whitelist: { source: 'global' } }]
  await native('replaceData', { data }); await qa.send('Page.reload')
  await until(() => evaluate('!!document.querySelector(".tabbar")'), 'original five-tab UI')
  assert.equal(await evaluate('document.querySelectorAll(".tabbar a").length'), 5)
  const started = (await native('startLock', { configurationId: 'routing-lock', strictLockConfirmed: true })).session
  for (const path of ['/tasks', '/statistics', '/settings', '/calendar', '/cat']) { await route(path); await at('/lock') }
  for (const path of ['/permissions', '/help', '/emergency', '/recovery']) { await route(path); await at(path); await until(() => text().then(value => value.includes('返回锁机控制')), 'safety page content') }
  await click('取消，保持现状')
  await route('/help'); await at('/help')
  command('shell', 'input', 'keyevent', '3')
  command('shell', 'monkey', '-p', qa.appId, '-c', 'android.intent.category.LAUNCHER', '1')
  await at('/lock')
  await route('/help'); await at('/help'); await ordinaryStart()
  qa.close(); command('shell', 'am', 'force-stop', qa.appId)
  qa = await connectQa({ port: 9256, output: 'artifacts/focus-control/api36/main-entry' }); await at('/lock')
  assert.equal((await observe()).lock.session.id, started.id)
  await qa.screenshot('01-launcher-and-hash-restricted')
  results.push({ scenario: 'real-launcher-warm-explicit-activity-cold-process-start-and-business-hashes-all-return-lock-safety-pages-reachable', passed: true })

  const edited = (await native('loadData')).data; edited.preferences.protection.enhancements = []
  await native('saveData', { data: edited }); await route('/settings'); await at('/lock')
  await route('/permissions'); await at('/permissions'); await click('前往无障碍授权')
  await until(() => /topResumedActivity=.*(?:Settings|Accessibility)/.test(command('shell', 'dumpsys', 'activity', 'activities')), 'actual Android authorization Activity')
  await ordinaryStart(); await route('/recovery'); await at('/recovery')
  await until(() => text().then(value => value.includes('锁机主界面入口限制 · 待撤销')), 'routing restoration registered')
  await click('取消，保持现状'); await route('/tasks'); await at('/lock')
  await route('/recovery'); await at('/recovery')
  await until(() => text().then(value => value.includes('确认撤销以上本轮保护')), 'recovery ready')
  await click('确认撤销以上本轮保护')
  await until(() => text().then(value => value.includes('本次恢复已完成')), 'confirmed restoration result')
  await click('完成'); await route('/tasks'); await at('/tasks')
  const recovered = (await observe()).lock.session
  assert.equal(recovered.id, started.id); assert.equal(recovered.startedAt, started.startedAt); assert.equal(recovered.targetMs, started.targetMs); assert.equal(recovered.strictMode, true)
  await assert.rejects(() => native('lockAction', { action: 'finish', confirmed: true }), /严格/)
  await qa.send('Page.reload'); await at('/tasks')
  command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
  await at('/tasks')
  await qa.screenshot('02-recovery-reopens-business-retains-strict-lock')
  results.push({ scenario: 'preference-edits-next-round-real-permission-cancel-and-confirm-recovery-durable-across-reload-same-strict-lock-id-deadline', passed: true })
  await until(async () => (await native('lockAction', { action: 'read' })).session === null, 'strict natural expiry', 75000)
  await route('/statistics'); await at('/statistics'); assert.equal((await observe()).owner, null)
  assert.equal((await native('loadData')).data.records.length, 0)
  results.push({ scenario: 'natural-lock-expiry-restores-business-without-focus-record-or-rest', passed: true })

  edited.lockConfigurations[0].strict = false
  await native('saveData', { data: edited }); await native('startLock', { configurationId: 'routing-lock' }); await route('/settings'); await at('/settings')
  await native('lockAction', { action: 'finish', confirmed: true })
  edited.preferences.protection.enhancements = ['lockMainInterfaceRestricted']; await native('saveData', { data: edited })
  await native('startLock', { configurationId: 'routing-lock' }); await route('/tasks'); await at('/lock')
  await click('提前解除'); await click('确认解除'); await until(async () => (await observe()).owner === null, 'ordinary UI unlock')
  await route('/settings'); await at('/settings')
  results.push({ scenario: 'unselected-lock-allows-business-next-selected-ordinary-lock-intercepts-and-confirmed-end-restores', passed: true })

  if (process.argv.includes('--reboot')) {
    await native('startLock', { configurationId: 'routing-lock' }); await route('/tasks'); await at('/lock')
    qa.close(); command('reboot'); command('wait-for-device')
    await until(() => command('shell', 'getprop', 'sys.boot_completed').trim() === '1', 'actual boot', 180000)
    qa = await connectQa({ port: 9256, output: 'artifacts/focus-control/api36/main-entry' })
    await until(async () => (await native('lockAction', { action: 'read' })).session === null, 'boot settles interrupted lock')
    await route('/tasks'); await at('/tasks'); assert.equal((await observe()).owner, null)
    results.push({ scenario: 'actual-device-reboot-interrupts-lock-and-restores-ordinary-entry', passed: true })
  }
  qa.save('results.json', { serial: qa.serial, appId: qa.appId, rebootExecuted: process.argv.includes('--reboot'), results })
  console.log(JSON.stringify({ serial: qa.serial, results }))
} finally {
  await native('lockAction', { action: 'finish', confirmed: true }).catch(() => {})
  if ((await observe()).lock.session?.strictMode) await until(async () => !(await native('lockAction', { action: 'read' })).session, 'cleanup strict expiry', 75000)
  if (baseline.data) await native('replaceData', { data: baseline.data })
  for (const [key, value] of [['enabled_accessibility_services', baseline.services], ['accessibility_enabled', baseline.enabled]])
    command('shell', 'settings', value === 'null' ? 'delete' : 'put', 'secure', key, ...(value === 'null' ? [] : [value]))
  qa.close()
}
