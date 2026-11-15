// Dedicated QA APK only: real native picker, real Settings launch and automatic expiry.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyData } from '../src/domain/model.ts'
import { connectQa, until, delay } from './lib/android-qa.mjs'

const output = 'artifacts/focus-control/api36/t07-device'
const evidence = resolve(output)
mkdirSync(evidence, { recursive: true })
let qa
let originalServices, originalEnabled
const results = []
const adb = process.env.ADB, serial = process.env.ANDROID_SERIAL
assert(adb && serial === 'emulator-5580', 'Use the explicitly leased official emulator')
const command = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
const service = 'com.xiaomao.focus.qa/com.xiaomao.focus.FocusAccessibilityService'
const secure = (key, value) => value ? command('shell', 'settings', 'put', 'secure', key, value)
  : command('shell', 'settings', 'delete', 'secure', key)
const foreground = () => command('shell', 'dumpsys', 'activity', 'activities')
const screenshot = name => writeFileSync(resolve(evidence, name + '.png'), execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true }))
const dump = name => {
  command('shell', 'uiautomator', 'dump', '/data/local/tmp/qa-t07.xml')
  const xml = command('shell', 'cat', '/data/local/tmp/qa-t07.xml')
  if (name) writeFileSync(resolve(evidence, name + '.xml'), xml)
  return xml
}
const tap = (label, prefix = false) => {
  const nodes = [...dump().matchAll(/<node\b[^>]*>/g)].map(match => match[0])
  const node = nodes.find(value => {
    const text = value.match(/\btext="([^"]*)"/)?.[1]
    return prefix ? text?.startsWith(label) : text === label
  })
  assert(node, 'Missing native control: ' + label)
  const bounds = node.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  assert(bounds, 'Native control has no touch bounds')
  command('shell', 'input', 'tap', String(Math.round((+bounds[1] + +bounds[3]) / 2)), String(Math.round((+bounds[2] + +bounds[4]) / 2)))
}
try {
  originalServices = command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim()
  originalEnabled = command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim()
  const others = originalServices === 'null' ? [] : originalServices.split(':').filter(value => value && value !== service)
  secure('enabled_accessibility_services', others.join(':'))
  secure('enabled_accessibility_services', [...others, service].join(':'))
  secure('accessibility_enabled', '1')
  qa = await connectQa({ port: 9247, output })
  const { native } = qa
  await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
  const data = emptyData()
  data.preferences.sound = false; data.preferences.vibration = false
  data.preferences.protection = { study: true, strict: false, dnd: false,
    interceptNotifications: false, globalWhitelist: ['com.android.chrome'], enhancements: [] }
  await native('replaceData', { data })
  await until(async () => (await native('protectionStatus')).connected, 'real accessibility service connection')
  const now = Date.now()
  await native('startFocus', { session: { id: 't07-device-' + now, itemId: null, themeId: null,
    title: 'T07 临时放行验证', themeName: '设备验证', color: '#222222', mode: 'stopwatch',
    targetMs: 900000, startedAt: now, timeZone: 'UTC', state: 'running', elapsedMs: 0,
    pausedMs: 0, anchorMono: now, anchorEpoch: now, bootId: 0, segments: [] } })
  await qa.evaluate("location.hash = '#/focus'")
  await qa.send('Page.reload')
  await until(() => qa.evaluate('!!document.querySelector(".temporary-summary")'), 'timer temporary-access summary')
  assert((await qa.evaluate('document.body.innerText')).includes('临时放行剩余 3 次'))
  await qa.screenshot('01-timer-summary')
  command('shell', 'am', 'start', '-a', 'android.settings.SETTINGS')
  await until(() => /topResumedActivity=.*FocusBlockActivity/.test(foreground()), 'actual blocked Settings')
  screenshot('02-blocked-app'); dump('02-blocked-app')
  tap('临时打开 ', true)
  await delay(250)
  const picker = dump('03-duration-picker')
  for (const label of ['1 分钟', '3 分钟', '5 分钟']) assert(picker.includes(label))
  screenshot('03-duration-picker')
  tap('取消')
  assert.equal((await native('observeControl')).focus.session.temporaryAccess.used, 0)
  results.push({ scenario: 'cancel-does-not-spend', passed: true })
  tap('临时打开 ', true); await delay(200); tap('打开应用')
  await until(() => /topResumedActivity=.*com.android.settings/.test(foreground()), 'real original Settings app reopened')
  await delay(350)
  let state = (await native('observeControl')).focus.session.temporaryAccess
  assert.equal(state.used, 1); assert.equal(state.targetPackage, 'com.android.settings')
  assert(state.remainingMs > 45000 && state.remainingMs <= 60000)
  const grantedAt = Date.now()
  screenshot('04-original-app-opened')
  results.push({ scenario: 'one-minute-grant-opens-original-app', passed: true, state })
  console.log('Real Settings opened with one-minute native grant; waiting for automatic reblock.')
  await until(() => /topResumedActivity=.*FocusBlockActivity/.test(foreground()), 'automatic native reblock at original deadline', 70000)
  const elapsed = Date.now() - grantedAt
  state = (await native('observeControl')).focus.session.temporaryAccess
  assert.equal(state.used, 1); assert.equal(state.remainingMs, 0); assert.equal(state.targetPackage, null)
  assert(elapsed >= 45000 && elapsed <= 65000, 'Unexpected native expiration timing: ' + elapsed)
  screenshot('05-expired-app-reblocked'); dump('05-expired-app-reblocked')
  results.push({ scenario: 'automatic-reblock-without-another-user-launch', passed: true, elapsedMs: elapsed, state })
  const finalData = (await native('loadData')).data
  assert.deepEqual(finalData.preferences.protection.globalWhitelist, ['com.android.chrome'])
  results.push({ scenario: 'permanent-whitelist-unchanged', passed: true })
  qa.save('results.json', { serial, appId: qa.appId, results })
  console.log(JSON.stringify({ serial, results }))
} finally {
  if (qa) {
    try { await qa.native('focusAction', { action: 'finish' }); await qa.native('restAction', { action: 'exit' }) }
    finally { qa.close() }
  }
  if (originalServices !== undefined) secure('enabled_accessibility_services', originalServices === 'null' ? '' : originalServices)
  if (originalEnabled !== undefined) secure('accessibility_enabled', originalEnabled === 'null' ? '0' : originalEnabled)
}
