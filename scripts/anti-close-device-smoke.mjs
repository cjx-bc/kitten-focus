// Run only with the coordinator's emulator lease. Opens destructive settings, never confirms destructive actions.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'

const output = process.env.T18_OUTPUT || 'artifacts/focus-control/api36/t18-device'
const selected = new Set((process.env.T18_SCENARIOS || '').split(',').filter(Boolean))
const qa = await connectQa({ port: 9258, output })
const { command, native, evaluate } = qa
if ((await native('observeControl')).owner !== null) { qa.close(); throw new Error('Prior QA round must finish before this isolated test') }
const baseline = {
  data: (await native('loadData')).data,
  services: command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
  enabled: command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim(),
}
const results = []
const service = qa.appId + '/com.xiaomao.focus.FocusAccessibilityService'
const secure = (key, value) => command('shell', 'settings', !value || value === 'null' ? 'delete' : 'put', 'secure', key, ...(!value || value === 'null' ? [] : [value]))
const foreground = () => command('shell', 'dumpsys', 'activity', 'activities').split('\n').find(line => line.includes('topResumedActivity=')) || ''
const own = () => command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
// API36 reuses SpaActivity across different app targets. Clear that Settings task so
// the prior other-app page cannot masquerade as the requested own-app destination.
const appInfo = pkg => command('shell', 'am', 'start', '-f', '0x10008000', '-a', 'android.settings.APPLICATION_DETAILS_SETTINGS', '-d', 'package:' + pkg)
const screenshot = name => writeFileSync(resolve(output, name + '.png'), execFileSync(process.env.ADB, ['-s', qa.serial, 'exec-out', 'screencap', '-p'], { windowsHide: true }))
const status = async () => (await native('observeControl')).antiClose
async function scenario(name, fn) {
  if (selected.size && !selected.has(name.split('-')[0])) return
  try { const evidence = await fn(); screenshot(name); results.push({ name, passed: true, evidence }); }
  catch (error) { screenshot(name + '-failed'); results.push({ name, passed: false, error: error.message, foreground: foreground(), antiClose: await status() }); }
  qa.save('results.json', results)
}
async function returned(name, open) {
  const before = (await status()).lastReturnedAt || 0
  const timeline = [], started = Date.now()
  await open()
  try {
    return await until(async () => {
      const anti = await status(), top = foreground()
      const focus = command('shell', 'dumpsys', 'window').split('\n').find(line => line.includes('mCurrentFocus=')) || ''
      timeline.push({ elapsedMs: Date.now() - started, state: anti.state, lastTarget: anti.lastTarget, lastReturnedAt: anti.lastReturnedAt, top, focus })
      return anti.lastReturnedAt > before && anti.active && top.includes('MainActivity') ? anti : null
    }, name + ' observed return', 7000)
  } finally { qa.save('return-timeline-' + name.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json', timeline) }
}
try {
  qa.save('baseline.json', { services: baseline.services, enabled: baseline.enabled, appId: qa.appId,
    apkSha256: createHash('sha256').update(readFileSync('android/app/build/outputs/apk/debug/app-debug.apk')).digest('hex') })
  const others = baseline.services === 'null' ? [] : baseline.services.split(':').filter(value => value && value !== service)
  secure('enabled_accessibility_services', others.join(':'))
  // Inspect only deliberate system Settings while protection is inactive. Never use
  // UiAutomator during the active round: it suppresses the real accessibility service.
  command('shell', 'am', 'start', '-a', 'android.settings.ACCESSIBILITY_SETTINGS')
  await delay(1500)
  command('shell', 'uiautomator', 'dump', '/sdcard/t18-accessibility-list.xml')
  const list = command('shell', 'cat', '/sdcard/t18-accessibility-list.xml')
  const ownRow = [...list.matchAll(/<node\b[^>]*>/g)].map(match => match[0]).find(node => node.includes('text="小猫专注 QA"') && node.includes('package="com.android.settings"'))
  assert(ownRow, 'Actual Settings accessibility list contains the exact isolated QA service')
  const bounds = ownRow.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  assert(bounds, 'QA service row has observed bounds')
  const serviceTap = [Math.round((+bounds[1] + +bounds[3]) / 2), Math.round((+bounds[2] + +bounds[4]) / 2)]
  qa.save('accessibility-navigation.json', { serviceTap, source: 'inactive actual Settings accessibility list' })
  appInfo(qa.appId); await delay(1500)
  command('shell', 'uiautomator', 'dump', '/sdcard/t18-own-app-info.xml')
  const ownInfo = command('shell', 'cat', '/sdcard/t18-own-app-info.xml')
  assert(ownInfo.includes('text="小猫专注 QA"') && ownInfo.includes('text="Force stop"'), 'Inactive own app-info destination actually rendered')
  screenshot('00-own-app-info-before-round')
  own()
  secure('enabled_accessibility_services', [...others, service].join(':')); secure('accessibility_enabled', '1')
  await until(async () => (await native('protectionStatus')).connected, 'Actual service connection')
  const data = emptyData(); data.preferences.sound = false; data.preferences.vibration = false
  data.preferences.protection = { ...defaultProtection(), enhancements: ['preciseAntiClose'] }
  await native('replaceData', { data })
  await evaluate('location.reload()')
  await until(() => evaluate('!!window.Capacitor?.nativePromise'), 'Reloaded isolated app')
  await until(() => evaluate('!!document.querySelector("main") && !document.querySelector(".boot, .error-banner")'), 'Seeded data initialized in real app')
  const now = Date.now()
  await native('startFocus', { session: { id: 't18-' + now, itemId: null, themeId: null, title: '精确防关闭设备验证',
    themeName: '设备验证', color: '#222222', mode: 'countdown', targetMs: 120000, startedAt: now,
    timeZone: 'UTC', state: 'running', elapsedMs: 0, pausedMs: 0, segments: [] } })
  await evaluate("location.hash='#/focus'")
  assert.equal((await status()).state, 'armed')
  await scenario('01-unrelated-settings-allowed', async () => {
    command('shell', 'am', 'start', '-a', 'android.settings.WIFI_SETTINGS')
    await until(() => foreground().includes('com.android.settings'), 'Normal settings'); await delay(1800)
    assert(foreground().includes('com.android.settings')); return { foreground: foreground() }
  })
  await scenario('02-other-app-info-allowed', async () => {
    appInfo('com.android.settings'); await until(() => foreground().includes('com.android.settings'), 'Other app info'); await delay(1800)
    assert(foreground().includes('com.android.settings')); return { foreground: foreground() }
  })
  await scenario('03-own-force-stop-uninstall-page', () => returned('Own force stop/uninstall controls', () => appInfo(qa.appId)))
  await delay(1600)
  await scenario('04-own-uninstall-confirmation', () => returned('Own uninstall', () => command('shell', 'am', 'start', '-a', 'android.intent.action.DELETE', '-d', 'package:' + qa.appId)))
  await delay(1600)
  await scenario('05-own-accessibility-details', () => returned('Own accessibility', async () => {
    command('shell', 'am', 'start', '-a', 'android.settings.ACCESSIBILITY_SETTINGS')
    await delay(1000)
    command('shell', 'input', 'tap', ...serviceTap.map(String))
  }))
  await scenario('06-real-dialer-allowed', async () => {
    const dialer = command('shell', 'cmd', 'role', 'get-role-holders', 'android.app.role.DIALER').trim().split('\n')[0]
    assert(dialer); command('shell', 'am', 'start', '-a', 'android.intent.action.DIAL', '-d', 'tel:')
    await until(() => foreground().includes(dialer), 'Actual dialer exception'); await delay(1600)
    assert(foreground().includes(dialer)); return { foreground: foreground() }
  })
  own()
  await scenario('07-necessary-authorization-allowed', async () => {
    await native('openProtectionSettings'); await until(() => foreground().includes('com.android.settings'), 'Authorization settings'); await delay(1600)
    assert(foreground().includes('com.android.settings')); return { foreground: foreground() }
  })
  own()
  await scenario('08-recovery-withdrawal-preserves-timer', async () => {
    const preview = await native('previewRecovery'); assert(preview.steps.some(step => step.capability === 'preciseAntiClose'))
    await native('confirmRecovery', { revision: preview.revision }); const snapshot = await native('observeControl')
    assert.equal(snapshot.owner, 'focus'); assert.equal(snapshot.antiClose.state, 'recovered')
    secure('enabled_accessibility_services', others.join(':')); secure('enabled_accessibility_services', [...others, service].join(':'))
    await until(async () => (await status()).connected, 'Service reconnection')
    assert.equal((await status()).state, 'recovered'); return await status()
  })
} finally {
  try {
    own(); const observed = await native('observeControl')
    if (observed.owner === 'focus') await native('focusAction', { action: 'finish' })
    if ((await native('observeControl')).owner === 'rest') await native('restAction', { action: 'exit' })
    await native('replaceData', { data: baseline.data })
    secure('enabled_accessibility_services', baseline.services); secure('accessibility_enabled', baseline.enabled)
    qa.save('restored-baseline.json', { owner: (await native('observeControl')).owner,
      services: command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
      enabled: command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim() })
  } finally { qa.close() }
}
console.log(JSON.stringify(results, null, 2))
if (results.some(result => !result.passed)) process.exitCode = 1
