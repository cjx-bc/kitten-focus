// Real Launcher3 icon, real notification taps, and the existing CatFocus bridge. QA APK only.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'
import { androidDevice } from './lib/android-device.mjs'

const output = 'artifacts/focus-control/api36/launcher'
const directory = resolve(output); mkdirSync(directory, { recursive: true })
const { adb, serial } = androidDevice(resolve(import.meta.dirname, '..'))
assert.equal(serial, 'emulator-5580', 'Requires the explicitly leased QA emulator')
let qa = await connectQa({ port: 9263, output })
const appId = qa.appId, alias = appId + '/com.xiaomao.focus.LauncherAlias'
const command = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
const native = (...args) => qa.native(...args)
const baseline = (await native('loadData')).data
const originalPermission = /android.permission.POST_NOTIFICATIONS: granted=true/.test(command('shell', 'dumpsys', 'package', appId))
const label = '小猫专注 QA'
const screen = name => writeFileSync(resolve(directory, name + '.png'), execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true }))
const dump = name => {
  const remote = '/data/local/tmp/qa-launcher.xml'
  command('shell', 'rm', '-f', remote)
  command('shell', 'uiautomator', 'dump', remote)
  const xml = command('shell', 'cat', remote)
  if (name) writeFileSync(resolve(directory, name + '.xml'), xml)
  return xml
}
const tapNative = text => {
  const node = [...dump().matchAll(/<node\b[^>]*>/g)].map(row => row[0]).find(row => row.includes('text="' + text + '"'))
  assert(node, 'Actual native control absent: ' + text)
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  assert(bounds, 'Native control has no bounds')
  command('shell', 'input', 'tap', String(Math.round((+bounds[1] + +bounds[3]) / 2)), String(Math.round((+bounds[2] + +bounds[4]) / 2)))
}
const front = () => command('shell', 'am', 'start', '-n', appId + '/com.xiaomao.focus.MainActivity')
const query = () => command('shell', 'cmd', 'package', 'query-activities', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', appId)
async function drawer(name, visible) {
  command('shell', 'input', 'keyevent', 'HOME'); await delay(400)
  command('shell', 'input', 'swipe', '270', '850', '270', '170', '400'); await delay(900)
  let xml
  await until(() => { xml = dump(); return xml.includes(label) === visible }, 'actual launcher icon ' + name, 12000)
  writeFileSync(resolve(directory, name + '.xml'), xml); screen(name)
  assert.equal(query().includes('LauncherAlias'), visible, 'PackageManager launcher result')
  front()
}
const session = () => ({ id: 'launcher-device-' + Date.now(), itemId: null, themeId: null,
  title: '图标恢复设备验证', themeName: '自由专注', color: '#222222', mode: 'stopwatch', targetMs: 60000,
  startedAt: Date.now(), timeZone: 'UTC', state: 'running', elapsedMs: 0, pausedMs: 0, segments: [] })
const data = emptyData(); data.preferences.sound = false; data.preferences.vibration = false
const configure = async enabled => {
  data.preferences.protection = { ...defaultProtection(), enhancements: enabled ? ['launcherIconHidden'] : [] }
  await native('replaceData', { data })
  await qa.send('Page.reload')
  await until(() => qa.evaluate('!!document.querySelector(".tabbar") && !document.querySelector(".boot")'), 'fixture loaded into app store')
}
const results = []
try {
  assert.equal((await native('observeControl')).owner, null, 'Finish preceding QA session first')
  await native('restAction', { action: 'exit' })
  assert(query().includes('LauncherAlias'), 'Baseline own launcher alias must resolve; do not overwrite a preexisting disabled component')
  assert.equal((await native('getLauncherStatus')).componentState, 0, 'Preserve exact existing baseline; fixture expects default')
  await configure(false); await drawer('01-original-visible', true)
  await native('startFocus', { session: session() }); await drawer('02-default-off-visible', true)
  await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
  qa.close(); command('shell', 'pm', 'revoke', appId, 'android.permission.POST_NOTIFICATIONS')
  qa = await connectQa({ port: 9263, output }) // Runtime permission revocation may kill the app process.
  await configure(true)
  await assert.rejects(() => native('startFocus', { session: session() }), /通知/)
  assert(query().includes('LauncherAlias')); assert.equal((await native('observeControl')).owner, null)
  results.push('permission-denied-never-hides')
  command('shell', 'pm', 'grant', appId, 'android.permission.POST_NOTIFICATIONS')
  await native('startFocus', { session: session() })
  await until(async () => (await native('getLauncherStatus')).verified, 'actual disabled alias and recovery notification')
  await native('focusAction', { action: 'pause' }) // Static shade permits UiAutomator to reach idle.
  await drawer('03-enabled-hidden', false)
  qa.save('hidden-status.json', await native('getLauncherStatus'))
  // Exercise the actual notification content and recovery action; never send PendingIntents programmatically.
  await qa.evaluate("location.hash = '#/settings'")
  command('shell', 'cmd', 'statusbar', 'expand-notifications'); await delay(1000); screen('04-control-notification')
  tapNative('图标恢复设备验证')
  await until(() => qa.evaluate("location.hash === '#/focus'"), 'actual control notification returns to focus')
  command('shell', 'cmd', 'statusbar', 'expand-notifications'); await delay(1000)
  // Expand the target card if its action is initially collapsed.
  if (!dump().includes('text="帮助与故障恢复"')) {
    const xml = dump(); const expand = [...xml.matchAll(/<node\b[^>]*>/g)].map(row => row[0]).find(row => row.includes('expand_button') && row.includes('clickable="true"'))
    assert(expand, 'Expand the actual QA control notification for its recovery action')
    const b = expand.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    command('shell', 'input', 'tap', String(Math.round((+b[1] + +b[3]) / 2)), String(Math.round((+b[2] + +b[4]) / 2)))
    await delay(400)
  }
  screen('05-recovery-notification-action'); tapNative('帮助与故障恢复')
  await until(() => qa.evaluate('document.body.innerText.includes("自身桌面启动入口")'), 'actual notification recovery sheet')
  await qa.screenshot('06-recovery-reachable')
  await qa.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent === '确认撤销以上本轮保护'); if (!b || b.disabled) throw new Error('Recovery confirmation unavailable'); b.click() })()`)
  await until(async () => (await native('getLauncherStatus')).phase === 'withdrawn', 'confirmed original component restoration')
  await drawer('07-recovered-visible', true)
  await native('focusAction', { action: 'resume' }); await native('focusAction', { action: 'read' })
  assert.equal((await native('getLauncherStatus')).componentState, 0)
  await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
  results.push('real-icon-hide-notification-control-and-recovery-restores-default')
  await native('startFocus', { session: session() }); await until(async () => (await native('getLauncherStatus')).active, 'next round hides')
  await native('focusAction', { action: 'finish' }); assert.equal((await native('observeControl')).owner, 'rest')
  await drawer('08-normal-end-visible', true); await native('restAction', { action: 'exit' })
  results.push('normal-end-and-rest-restore')
  // Force-stop is an explicit adversarial process-death case; manual enabled MainActivity remains the recovery path.
  await native('startFocus', { session: session() }); await until(async () => (await native('getLauncherStatus')).active, 'process-death round hides')
  qa.close(); command('shell', 'am', 'force-stop', appId)
  qa = await connectQa({ port: 9263, output }); await native('focusAction', { action: 'read' })
  const preview = await native('previewRecovery'); await native('confirmRecovery', { revision: preview.revision })
  await drawer('09-process-recovery-visible', true)
  await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
  results.push('process-death-retains-original-and-enabled-recovery-target')
  qa.save('results.json', { appId, serial, results, pending: ['real-reboot', 'real-package-upgrade'], launcherCacheClaim: 'Only these Launcher3 screenshots verify cache behavior on this emulator' })
  console.log(JSON.stringify({ appId, results, pending: ['real-reboot', 'real-package-upgrade'] }))
} finally {
  try {
    const preview = await native('previewRecovery'); await native('confirmRecovery', { revision: preview.revision })
    await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
    await native('replaceData', { data: baseline })
    assert.equal((await native('getLauncherStatus')).componentState, 0)
  } finally {
    if (!originalPermission) command('shell', 'pm', 'revoke', appId, 'android.permission.POST_NOTIFICATIONS')
    qa.close()
  }
}
