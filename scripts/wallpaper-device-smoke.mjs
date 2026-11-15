// Actual product bridge + Android SAF/live wallpaper UI; never targets user0.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'

const argv = process.argv.slice(2)
const arg = (name, fallback = '') => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback
if (argv.includes('--help')) {
  console.log('Exclusive device lease required. --user <created-secondary-id> --action configure|import|prepare|start-select|start-cancel|finish|exit-rest|recover|restore-live|inspect [--image-name source.png] [--lock-source] [--target home|both] [--output directory]')
  process.exit(0)
}
const user = Number(arg('--user')), action = arg('--action'), target = arg('--target', 'home')
assert(Number.isInteger(user) && user > 0, 'Only the recorded disposable secondary Android user is allowed')
assert(['configure', 'import', 'prepare', 'start-select', 'start-cancel', 'finish', 'exit-rest', 'recover', 'restore-live', 'inspect'].includes(action), 'Choose a documented action')
assert(['home', 'both'].includes(target), 'Target must be home or both')
const adb = process.env.ADB || 'D:/KittenFocus-Android/sdk/platform-tools/adb.exe'
const serial = process.env.ANDROID_SERIAL || 'emulator-5580'
assert.equal(serial, 'emulator-5580', 'Only the approved official QA emulator')
const raw = (...args) => execFileSync(adb, ['-s', serial, ...args], { windowsHide: true, timeout: 30000 })
assert.equal(raw('shell', 'am', 'get-current-user').toString().trim(), String(user), 'Switch to the recorded disposable user before running')
process.env.ADB = adb; process.env.ANDROID_SERIAL = serial; process.env.ANDROID_APP_ID = 'com.xiaomao.focus.qa'
const output = resolve(arg('--output', 'artifacts/focus-control/t17-product'))
mkdirSync(output, { recursive: true })
const qa = await connectQa({ port: 9274, output })
const native = qa.native, command = qa.command
const main = () => command('shell', 'am', 'start', '--user', String(user), '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
const dump = () => {
  command('shell', 'uiautomator', 'dump', '--compressed', '/data/local/tmp/kitten-t17-window.xml')
  return command('shell', 'cat', '/data/local/tmp/kitten-t17-window.xml')
}
const unescape = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
function tapText(text) {
  const nodes = [...dump().matchAll(/<node\b[^>]*>/g)].map(match => match[0])
  const node = nodes.find(row => [...row.matchAll(/(?:text|content-desc)="([^"]*)"/g)].some(attr => unescape(attr[1]) === text))
  if (!node) return false
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  if (!bounds || +bounds[3] <= +bounds[1] || +bounds[4] <= +bounds[2]) return false
  command('shell', 'input', 'tap', String(Math.round((+bounds[1] + +bounds[3]) / 2)), String(Math.round((+bounds[2] + +bounds[4]) / 2)))
  return true
}
const tap = text => until(() => tapText(text), 'actual Android control ' + text, 15000)
function evidence(name) {
  writeFileSync(resolve(output, name + '-wallpaper.txt'), command('shell', 'dumpsys', 'wallpaper'))
  writeFileSync(resolve(output, name + '.png'), raw('exec-out', 'screencap', '-p'))
}
async function selectWallpaper() {
  evidence(action + '-picker')
  await tap('Set wallpaper')
  await tap(target === 'both' ? 'Home screen and lock screen' : 'Home screen')
  await delay(500); main()
}
try {
  const before = await native('getWallpaperStatus')
  qa.save(action + '-before.json', before)
  if (action === 'configure') {
    assert.equal((await native('observeControl')).owner, null, 'Finish the previous disposable fixture first')
    assert.equal((await native('previewRecovery')).pending, false, 'Resolve old responsibilities before preparation')
    const data = (await native('loadData')).data || emptyData()
    qa.save('provided-user-business-baseline.json', data)
    data.preferences.sound = false; data.preferences.vibration = false
    data.preferences.protection = { ...defaultProtection(), enhancements: ['wallpaperProtection'] }
    await native('saveData', { data }); await qa.send('Page.reload')
    await until(() => qa.evaluate('!!document.querySelector(".tabbar")'), 'initialized product with saved preferences')
  } else if (action === 'import') {
    const name = arg('--image-name'); assert(name && !name.includes('/') && !name.includes('\\'), 'Supply the actual filename already present in this user Downloads')
    const result = native('importWallpaperOriginal', { lockSource: argv.includes('--lock-source') })
    await delay(500)
    if (!tapText(name)) {
      await tap('Show roots'); await tap('Downloads'); await tap(name)
    }
    await result; main()
  } else if (action === 'prepare') {
    // This action is the test operator's explicit acknowledgement for the saved known fixture.
    await native('prepareWallpaper', { limitsAccepted: true, originalMatches: true })
    assert.equal((await native('getWallpaperStatus')).prepared, true)
  } else if (action.startsWith('start-')) {
    assert.equal((await native('observeControl')).owner, null)
    const now = Date.now(), session = { id: 'wallpaper-product-' + now, itemId: null, themeId: null,
      themeName: '自由专注', title: '壁纸会话设备验证', color: '#476957', mode: 'stopwatch', targetMs: 600000,
      startedAt: now, timeZone: 'UTC', state: 'running', elapsedMs: 0, pausedMs: 0,
      anchorMono: now, anchorEpoch: now, bootId: 0, segments: [] }
    await native('startFocus', { session }); qa.save('started-session.json', session)
    if (action === 'start-select') {
      await selectWallpaper()
      await until(async () => (await native('getWallpaperStatus')).active, 'actual selected service associated with existing round')
    } else {
      evidence('cancel-picker'); command('shell', 'input', 'keyevent', 'BACK'); await delay(400); main()
      const after = await native('getWallpaperStatus')
      assert.equal(after.phase, 'declined'); assert.equal(after.active, false)
      assert.deepEqual(after.current, before.current)
    }
  } else if (action === 'finish') {
    const observation = await native('observeControl')
    if (observation.owner === 'lock') await native('lockAction', { action: 'finish', confirmed: true })
    else await native('focusAction', { action: 'finish' })
  } else if (action === 'exit-rest') {
    await native('restAction', { action: 'exit' })
  } else if (action === 'recover') {
    const preview = await native('previewRecovery'); qa.save('recovery-preview.json', preview)
    await native('confirmRecovery', { revision: preview.revision })
  } else if (action === 'restore-live') {
    await native('requestWallpaperPicker', { restoreOriginal: true }); await selectWallpaper()
  }
  const after = await native('getWallpaperStatus')
  qa.save(action + '-after.json', { user, serial, status: after, control: await native('observeControl'), recovery: await native('previewRecovery') })
  evidence(action + '-after')
  console.log(JSON.stringify({ user, action, phase: after.phase, active: after.active, recoveryPending: after.recoveryPending, output }))
} finally { qa.close() }
