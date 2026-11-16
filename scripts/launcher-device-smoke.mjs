// Real Launcher3 icon, real notification taps, and the existing CatFocus bridge. QA APK only.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'
import { androidDevice } from './lib/android-device.mjs'
import { capturePrivateBaseline } from './lib/qa-private-baseline.mjs'

const output = process.env.QA_OUTPUT || 'artifacts/focus-control/api36/launcher'
const directory = resolve(output); mkdirSync(directory, { recursive: true })
const { adb, serial } = androidDevice(resolve(import.meta.dirname, '..'))
assert.equal(serial, 'emulator-5580', 'Requires the explicitly leased QA emulator')
let qa = await connectQa({ port: 9263, output })
const privateBaseline = await capturePrivateBaseline(qa, { port: 9263, output }); qa = privateBaseline.qa
const phase = process.argv.find(value => value.startsWith('--phase='))?.slice(8) || 'all'
assert(['all', 'notification', 'fallback'].includes(phase), 'Use --phase=notification or --phase=fallback for bounded leaf checks')
const appId = qa.appId, alias = appId + '/com.xiaomao.focus.LauncherAlias'
const command = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
const native = (...args) => qa.native(...args)
const baseline = (await native('loadData')).data
const originalPermission = /android.permission.POST_NOTIFICATIONS: granted=true/.test(command('shell', 'dumpsys', 'package', appId))
qa.save('baseline.json', { data: baseline, originalPermission })
const label = '小猫专注 QA'
const cacheMismatches = []
const replaceApk = process.env.QA_REPLACE_APK
let replacement
if (replaceApk) {
  assert(process.env.QA_AAPT, 'QA_AAPT is required to verify the replacement APK identity before installation')
  const badging = execFileSync(process.env.QA_AAPT, ['dump', 'badging', resolve(replaceApk)], { encoding: 'utf8', windowsHide: true })
  assert.equal(badging.match(/package: name='([^']+)'/)?.[1], appId, 'Replacement must have the exact isolated QA package identity')
  replacement = { path: resolve(replaceApk), sha256: createHash('sha256').update(readFileSync(replaceApk)).digest('hex'), package: badging.split('\n')[0],
    targetVersionCode: Number(badging.match(/versionCode='(\d+)'/)?.[1]) }
}
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
const tapShade = async (text, key) => {
  let observed = process.env[key]
  if (process.argv.includes('--inspect-shade')) {
    const name = key.toLowerCase(), file = resolve(directory, name + '.json')
    assert(!existsSync(file), 'Use a fresh evidence directory for inspected coordinates')
    screen(name + '-awaiting-inspection')
    console.log('INSPECT ' + resolve(directory, name + '-awaiting-inspection.png') + '; write ' + file + ' as {"tap":"x,y"}')
    observed = await until(() => existsSync(file) && JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')).tap, 'inspected real QA notification coordinates', 90000)
  }
  if (!observed) return tapNative(text)
  assert(/^\d+,\d+$/.test(observed), key + ' must be an inspected x,y on this exact QA notification screenshot')
  const [x, y] = observed.split(',').map(Number)
  assert(x > 0 && x < 540 && y > 0 && y < 960, 'Observed tap must be inside the 540x960 fixture')
  screen(key.toLowerCase() + '-before-real-tap')
  command('shell', 'input', 'tap', String(x), String(y))
}
const front = () => command('shell', 'am', 'start', '-n', appId + '/com.xiaomao.focus.MainActivity')
const query = () => command('shell', 'cmd', 'package', 'query-activities', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', appId)
async function drawer(name, visible) {
  const nativeStatus = await native('getLauncherStatus')
  command('shell', 'input', 'keyevent', 'HOME'); await delay(250)
  command('shell', 'input', 'keyevent', 'HOME'); await delay(400)
  await until(() => /topResumedActivity=.*nexuslauncher/.test(command('shell', 'dumpsys', 'activity', 'activities')), 'actual launcher foreground')
  command('shell', 'input', 'swipe', '270', '650', '270', '170', '400'); await delay(900)
  let xml
  try {
    await until(() => { xml = dump(); return xml.includes(':id/apps_view') && xml.includes('text="' + label + '"') === visible }, 'actual launcher drawer icon ' + name, 12000)
  } catch (error) {
    writeFileSync(resolve(directory, name + '-failed.xml'), xml || ''); screen(name + '-failed')
    qa.save(name + '-failed-status.json', { launcherQuery: query(), nativeBeforeHome: nativeStatus })
    if (visible || !process.argv.includes('--continue-cache-limitation') || query().includes('LauncherAlias')) throw error
    cacheMismatches.push({ name, expectedDrawerVisible: false, observedDrawerVisible: true, componentDisabled: true, evidence: name + '-failed.png' })
  }
  writeFileSync(resolve(directory, name + '.xml'), xml); screen(name)
  assert.equal(query().includes('LauncherAlias'), visible, 'PackageManager launcher result')
  front(); await delay(600)
}
const session = () => ({ id: 'launcher-device-' + Date.now(), itemId: null, themeId: null,
  title: '图标恢复设备验证', themeName: '自由专注', color: '#222222', mode: 'stopwatch', targetMs: 60000,
  startedAt: Date.now(), timeZone: 'UTC', state: 'running', elapsedMs: 0, pausedMs: 0, segments: [] })
const data = emptyData(); data.preferences.sound = false; data.preferences.vibration = false
const configure = async enabled => {
  data.preferences.protection = { ...defaultProtection(), enhancements: enabled ? ['launcherIconHidden'] : [] }
  await native('replaceData', { data })
  await qa.evaluate("location.hash = '#/tasks'")
  await qa.send('Page.reload')
  await until(() => qa.evaluate('!!document.querySelector(".tabbar") && !document.querySelector(".boot")'), 'fixture loaded into app store')
}
const results = []
try {
  assert.equal((await native('observeControl')).owner, null, 'Finish preceding QA session first')
  await native('restAction', { action: 'exit' })
  assert(query().includes('LauncherAlias'), 'Baseline own launcher alias must resolve; do not overwrite a preexisting disabled component')
  assert.equal((await native('getLauncherStatus')).componentState, 0, 'Preserve exact existing baseline; fixture expects default')
  if (!process.argv.includes('--upgrade-only')) {
  if (phase === 'all') {
  await configure(false); await drawer('01-original-visible', true)
  await native('startFocus', { session: session() })
  await native('focusAction', { action: 'pause' }) // Keep every UiAutomator shade/drawer read idle.
  await drawer('02-default-off-visible', true)
  await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
  qa.close(); command('shell', 'pm', 'revoke', appId, 'android.permission.POST_NOTIFICATIONS')
  qa = await connectQa({ port: 9263, output }) // Runtime permission revocation may kill the app process.
  await configure(true)
  await assert.rejects(() => native('startFocus', { session: session() }), /通知/)
  assert(query().includes('LauncherAlias')); assert.equal((await native('observeControl')).owner, null)
  results.push('permission-denied-never-hides')
  } else await configure(true)
  command('shell', 'pm', 'grant', appId, 'android.permission.POST_NOTIFICATIONS')
  if (phase !== 'fallback') {
  await native('startFocus', { session: session() })
  await until(async () => (await native('getLauncherStatus')).verified, 'actual disabled alias and recovery notification')
  await native('focusAction', { action: 'pause' }) // Static shade permits UiAutomator to reach idle.
  if (phase === 'all') await drawer('03-enabled-hidden', false)
  qa.save('hidden-status.json', await native('getLauncherStatus'))
  // Exercise the actual notification content and recovery action; never send PendingIntents programmatically.
  await qa.evaluate("location.hash = '#/settings'")
  command('shell', 'cmd', 'statusbar', 'expand-notifications'); await delay(1000); screen('04-control-notification')
  await tapShade('图标恢复设备验证', 'QA_OBSERVED_CONTENT_TAP')
  await until(() => qa.evaluate("location.hash === '#/focus'"), 'actual control notification returns to focus')
  command('shell', 'cmd', 'statusbar', 'expand-notifications'); await delay(1000)
  // Expand the target card if its action is initially collapsed.
  if (!process.argv.includes('--inspect-shade') && !process.env.QA_OBSERVED_RECOVERY_TAP && !dump().includes('text="帮助与故障恢复"')) {
    const xml = dump(); const expand = [...xml.matchAll(/<node\b[^>]*>/g)].map(row => row[0]).find(row => row.includes('expand_button') && row.includes('clickable="true"'))
    assert(expand, 'Expand the actual QA control notification for its recovery action')
    const b = expand.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    command('shell', 'input', 'tap', String(Math.round((+b[1] + +b[3]) / 2)), String(Math.round((+b[2] + +b[4]) / 2)))
    await delay(400)
  }
  screen('05-recovery-notification-action'); await tapShade('帮助与故障恢复', 'QA_OBSERVED_RECOVERY_TAP')
  await until(() => qa.evaluate('document.body.innerText.includes("自身桌面启动入口")'), 'actual notification recovery sheet')
  await qa.screenshot('06-recovery-reachable')
  await qa.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent === '确认撤销以上本轮保护'); if (!b || b.disabled) throw new Error('Recovery confirmation unavailable'); b.click() })()`)
  await until(async () => (await native('getLauncherStatus')).phase === 'withdrawn', 'confirmed original component restoration')
  assert(query().includes('LauncherAlias'), 'Actual restored alias resolves after notification recovery')
  if (phase === 'all') await drawer('07-recovered-visible', true)
  await native('focusAction', { action: 'resume' }); await native('focusAction', { action: 'read' })
  assert.equal((await native('getLauncherStatus')).componentState, 0)
  await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
  results.push('actual-disabled-alias-notification-content-and-recovery-Sheet-restores-default')
  await native('startFocus', { session: session() }); await until(async () => (await native('getLauncherStatus')).active, 'next round hides')
  await native('focusAction', { action: 'finish' }); assert.equal((await native('observeControl')).owner, 'rest')
  assert(query().includes('LauncherAlias'), 'Actual normal-end alias resolves')
  if (phase === 'all') await drawer('08-normal-end-visible', true)
  await native('restAction', { action: 'exit' })
  results.push('normal-end-and-rest-restore')
  }
  if (phase !== 'notification') {
  // Revoking notifications kills the process with its alias hidden. Recover through
  // the actual user-visible Accessibility list and service Settings row, with no
  // explicit app Activity launch or synthetic PendingIntent send.
  await native('startFocus', { session: session() }); await until(async () => (await native('getLauncherStatus')).active, 'process-death round hides')
  await native('focusAction', { action: 'pause' })
  qa.close(); command('shell', 'pm', 'revoke', appId, 'android.permission.POST_NOTIFICATIONS')
  assert(!query().includes('LauncherAlias'), 'Alias remains hidden after the notification permission is revoked')
  command('shell', 'am', 'start', '-a', 'android.settings.ACCESSIBILITY_SETTINGS')
  await delay(600); screen('09-system-accessibility-list'); dump('09-system-accessibility-list')
  const serviceXml = dump()
  const ownService = serviceXml.includes('text="' + label + '"') ? label : '小猫专注'
  tapNative(ownService); await delay(500)
  screen('10-own-service-details'); const detailXml = dump('10-own-service-details')
  assert(detailXml.includes('text="Settings"') || detailXml.includes('text="设置"'), 'System service details expose the app Settings recovery row')
  tapNative(detailXml.includes('text="Settings"') ? 'Settings' : '设置')
  await until(() => command('shell', 'dumpsys', 'activity', 'activities').includes('topResumedActivity') && /topResumedActivity=.*com\.xiaomao\.focus\.qa/.test(command('shell', 'dumpsys', 'activity', 'activities')), 'actual system Settings row opens the application')
  qa = await connectQa({ port: 9263, output, launch: false })
  await until(() => qa.evaluate('!!document.querySelector(".app-shell") && !document.querySelector(".boot")'), 'actual system Settings fallback app initialization', 30000)
  await native('focusAction', { action: 'read' })
  screen('11-system-settings-returned-to-app')
  await qa.evaluate("location.hash = '#/recovery'")
  await until(() => qa.evaluate('!!document.querySelector("dialog[open]") && [...document.querySelectorAll("dialog[open] .recovery-step")].some(step => step.innerText.includes("自身桌面启动入口"))'), 'system Settings fallback reaches the actual registered launcher recovery Sheet')
  await qa.screenshot('11-system-settings-recovery-sheet')
  const fallbackPreview = await native('previewRecovery')
  qa.save('system-settings-fallback-preview.json', { preview: fallbackPreview, launcher: await native('getLauncherStatus'), control: await native('observeControl') })
  if (fallbackPreview.pending) await qa.evaluate(`(() => { const b = [...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === '确认撤销以上本轮保护'); if (!b || b.disabled) throw new Error('Recovery confirmation unavailable'); b.click() })()`)
  else assert.equal(await qa.evaluate('[...document.querySelectorAll("dialog[open] .recovery-step")].some(step => step.innerText.includes("自身桌面启动入口 · 已恢复"))'), true, 'Automatic notification-loss restoration is honestly shown already recovered')
  await until(async () => (await native('getLauncherStatus')).phase === 'withdrawn', 'system Settings fallback UI restores launcher')
  assert(query().includes('LauncherAlias'), 'Actual system Settings fallback restores resolvable alias')
  if (phase === 'all') await drawer('11-process-system-settings-recovery-visible', true)
  await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
  results.push('notification-revocation-process-death-actual-system-accessibility-settings-return-and-recovery')
  }
  }
  if (replacement) {
    if (process.argv.includes('--upgrade-only')) await configure(true)
    const installedBefore = command('shell', 'dumpsys', 'package', appId)
    replacement.previousVersionCode = Number(installedBefore.match(/versionCode=(\d+)/)?.[1])
    assert(Number.isSafeInteger(replacement.previousVersionCode) && replacement.previousVersionCode > 0, 'Observe the actual installed version before replacement')
    qa.save('replacement-identity-before.json', replacement)
    command('shell', 'pm', 'grant', appId, 'android.permission.POST_NOTIFICATIONS')
    const started = (await native('startFocus', { session: session() })).session
    await native('focusAction', { action: 'pause' })
    await until(async () => (await native('getLauncherStatus')).verified, 'replacement round actually hides alias')
    const checkpoint = await native('observeControl')
    qa.save('replacement-before.json', { replacement, control: checkpoint, launcher: await native('getLauncherStatus') })
    qa.close()
    const installed = execFileSync(adb, ['-s', serial, 'install', '-r', replacement.path], { encoding: 'utf8', windowsHide: true, timeout: 90000 })
    assert(installed.includes('Success'), 'The exact QA APK replacement must actually install')
    writeFileSync(resolve(directory, 'replacement-install.txt'), installed)
    await until(() => query().includes('LauncherAlias'), 'package-replaced receiver restores alias before any app Activity launch', 30000)
    command('shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1')
    qa = await connectQa({ port: 9263, output, launch: false })
    replacement.installedVersionCode = Number(command('shell', 'dumpsys', 'package', appId).match(/versionCode=(\d+)/)?.[1])
    assert.equal(replacement.installedVersionCode, replacement.targetVersionCode, 'PackageManager confirms the replacement version')
    replacement.higherVersionInstalled = replacement.installedVersionCode > replacement.previousVersionCode
    await native('focusAction', { action: 'read' })
    const launcher = await native('getLauncherStatus'), rebuilt = await native('observeControl')
    assert.equal(launcher.componentState, 0); assert.equal(launcher.phase, 'withdrawn'); assert.equal(launcher.recoveryPending, false)
    assert.equal(rebuilt.focus.session.id, started.id); assert.equal(rebuilt.focus.session.state, 'paused')
    assert(/android.permission.POST_NOTIFICATIONS: granted=true/.test(command('shell', 'dumpsys', 'package', appId)), 'Package replacement preserves granted runtime permission')
    await qa.send('Page.reload'); await native('focusAction', { action: 'read' })
    assert.equal((await native('getLauncherStatus')).componentState, 0, 'Replacement withdrawal survives WebView recreation')
    qa.save('replacement-after.json', { replacement, control: rebuilt, launcher })
    await drawer('12-package-replacement-restores-visible', true)
    await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
    results.push(replacement.higherVersionInstalled
      ? `actual-version-${replacement.previousVersionCode}-to-${replacement.installedVersionCode}-upgrade-restores-journal-and-keeps-same-paused-round-no-rehide`
      : 'actual-same-package-install-r-package-replaced-restores-journal-and-keeps-same-paused-round-no-rehide')
  }
  const pending = ['real-reboot', ...(replacement?.higherVersionInstalled ? [] : replacement ? ['different-version-code-migration'] : ['real-package-replacement'])]
  qa.save('results.json', { appId, serial, phase, results, replacement, pending, cacheMismatches, passed: cacheMismatches.length === 0, drawerChecked: phase === 'all', retainedEarlierCacheFailure: 'final-entry/launcher-drawer-fixed/03-enabled-hidden-failed.png remains limited; leaf recovery checks do not clear it', launcherCacheClaim: 'Only actual Launcher3 screenshots verify cache behavior on this emulator' })
  console.log(JSON.stringify({ appId, results, pending, cacheMismatches, passed: cacheMismatches.length === 0 }))
} catch (error) {
  qa.save('failure.json', { message: error.stack, results })
  throw error
} finally {
  if (qa.closed) qa = await connectQa({ port: 9263, output })
  try {
    front(); await delay(600)
    const preview = await native('previewRecovery'); await native('confirmRecovery', { revision: preview.revision })
    await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
    await qa.send('Page.reload') // Settle the old store's completed-session write before restoring baseline.
    await native('replaceData', { data: baseline })
    await qa.evaluate("location.hash = '#/tasks'"); await qa.send('Page.reload')
    assert.deepEqual((await native('loadData')).data, baseline, 'Restore the exact preexisting QA business data')
    assert.equal((await native('getLauncherStatus')).componentState, 0)
    qa = await privateBaseline.restore(qa)
  } finally {
    command('shell', 'pm', originalPermission ? 'grant' : 'revoke', appId, 'android.permission.POST_NOTIFICATIONS')
    qa.close()
  }
}
