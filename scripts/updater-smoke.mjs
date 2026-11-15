// Only run on an isolated emulator. Installs 0.1.4, seeds test data, and upgrades it.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { emptyData, defaultPeriods } from '../src/domain/model.ts'

const root = resolve(import.meta.dirname, '..')
const serial = process.env.ANDROID_SERIAL || '127.0.0.1:16416'
assert(
  /^(?:emulator-\d+|127\.0\.0\.1:\d+)$/.test(serial),
  'Use a dedicated local emulator, not a personal phone',
)
const adb = process.env.ADB || resolve(root, '.tools/android-sdk/platform-tools/adb.exe')
const command = (...args) =>
  execFileSync(adb, ['-s', serial, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  })
const evidence = resolve(root, 'artifacts/updater')
mkdirSync(evidence, { recursive: true })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(action, label, timeout = 25000) {
  const start = Date.now()
  let error
  while (Date.now() - start < timeout) {
    try {
      const value = await action()
      if (value) return value
    } catch (e) {
      error = e
    }
    await delay(200)
  }
  throw new Error(`Timeout: ${label}: ${error || ''}`)
}

let socket,
  nextId = 0
const pending = new Map(),
  runtimeErrors = []
async function connect() {
  command('shell', 'am', 'start', '-n', 'com.xiaomao.focus/.MainActivity')
  const pid = await until(
    () => command('shell', 'pidof', 'com.xiaomao.focus').trim().split(' ')[0],
    'app process',
  )
  await until(
    () => command('shell', 'cat', '/proc/net/unix').includes('webview_devtools_remote_' + pid),
    'debug WebView',
  )
  command('forward', 'tcp:9225', 'localabstract:webview_devtools_remote_' + pid)
  const target = await until(async () => {
    const targets = await (await fetch('http://127.0.0.1:9225/json')).json()
    return targets.find((t) => t.url.includes('localhost'))
  }, 'page target')
  socket = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost:\d+/, '127.0.0.1:9225'))
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  socket.onmessage = (event) => {
    const packet = JSON.parse(event.data)
    if (packet.id && pending.has(packet.id)) {
      const callback = pending.get(packet.id)
      pending.delete(packet.id)
      packet.error
        ? callback.reject(new Error(packet.error.message))
        : callback.resolve(packet.result)
    } else if (packet.method === 'Runtime.exceptionThrown')
      runtimeErrors.push(packet.params.exceptionDetails.text)
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await until(() => evaluate("document.querySelectorAll('.tabbar a').length===5"), 'app ready')
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error('CDP command timed out: ' + method))
    }, 30000)
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const native = (plugin, method, options = {}) =>
  evaluate(
    `window.Capacitor.nativePromise(${JSON.stringify(plugin)},${JSON.stringify(method)},${JSON.stringify(options)})`,
  )
const click = async (label) => {
  await evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)}||e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim().startsWith(${JSON.stringify(label)}));if(!e)throw new Error('Missing button '+${JSON.stringify(label)});if(e.disabled)throw new Error('Button disabled');e.click()})()`,
  )
  await delay(200)
}
async function screenshot(name) {
  const picture = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(resolve(evidence, name + '.png'), Buffer.from(picture.data, 'base64'))
}
async function waitText(text) {
  return until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`), text)
}
function dumpWindow(path) {
  try {
    command('shell', 'uiautomator', 'dump', path)
  } catch (error) {
    if (!String(error.stdout).includes('dumped to:')) throw error
  }
  return command('shell', 'cat', path)
}

const data = emptyData(),
  now = Date.now()
data.themes = [
  { id: 'upgrade-theme', name: '升级保留英语', color: '#737378', order: 0, collapsed: false },
]
data.items = [
  {
    id: 'upgrade-item',
    themeId: 'upgrade-theme',
    title: '升级保留背单词',
    note: '升级前的备注',
    mode: 'stopwatch',
    minutes: 45,
    order: 0,
  },
]
data.records = [
  {
    id: 'upgrade-record',
    itemId: 'upgrade-item',
    themeId: 'upgrade-theme',
    title: '升级保留背单词',
    themeName: '升级保留英语',
    color: '#737378',
    mode: 'stopwatch',
    targetMs: 2700000,
    startedAt: now - 300000,
    endedAt: now - 120000,
    timeZone: 'Asia/Shanghai',
    durationMs: 180000,
    pausedMs: 0,
    segments: [{ start: now - 300000, end: now - 120000 }],
    status: 'completed',
  },
]
data.events = [
  {
    id: 'upgrade-event',
    title: '升级保留复习日程',
    start: '2026-11-16T10:00',
    end: '2026-11-16T11:00',
    allDay: false,
    note: '原日程',
    repeat: 'none',
    weekdays: [],
    until: '',
    itemId: 'upgrade-item',
    reminderMinutes: null,
  },
]
data.semesters = [
  {
    id: 'upgrade-semester',
    name: '升级保留学期',
    startDate: '2026-09-07',
    weeks: 20,
    periods: defaultPeriods(),
  },
]
data.courses = [
  {
    id: 'upgrade-course',
    semesterId: 'upgrade-semester',
    title: '升级保留课程',
    weekday: 1,
    firstPeriod: 1,
    lastPeriod: 2,
    firstWeek: 1,
    lastWeek: 20,
    parity: 'all',
    room: 'A101',
    teacher: '测试教师',
    color: '#737378',
    reminderMinutes: null,
  },
]
data.preferences = {
  defaultMinutes: 45,
  sound: false,
  vibration: false,
  activeSemesterId: 'upgrade-semester',
}

try {
  console.log('Installing old 0.1.4; emulator must not contain personal data')
  command('install', '-r', resolve(root, 'releases/xiaomao-focus-0.1.4-debug.apk'))
  await connect()
  const before = (await native('CatFocus', 'loadData')).data
  assert(!before || before.items.length === 0, 'Refusing to replace existing non-test data')
  await native('CatFocus', 'saveData', { data })
  await send('Page.reload')
  await waitText('升级保留英语')
  socket.close()

  console.log('Cover-installing updater bootstrap 0.2.0')
  command('install', '-r', resolve(evidence, 'kitten-focus-0.2.0-qa.apk'))
  await connect()
  assert.deepEqual(
    (await native('CatFocus', 'loadData')).data,
    data,
    'Bootstrap must preserve all business data',
  )
  let state = await until(
    async () => {
      const state = await native('AppUpdates', 'status')
      return state.release ? state : null
    },
    'daily HTTPS update check',
    45000,
  )
  assert.equal(state.release.versionCode, 7)
  assert.equal(state.currentCode, 6)
  assert(
    await evaluate("!!document.querySelector('.nav-update-dot')"),
    'Daily check should only add a badge',
  )

  const active = {
    id: 'upgrade-active',
    itemId: null,
    themeId: null,
    title: '更新阻止测试',
    themeName: '自由专注',
    color: '#222222',
    mode: 'stopwatch',
    targetMs: 60000,
    startedAt: Date.now(),
    timeZone: 'UTC',
    state: 'running',
    elapsedMs: 0,
    pausedMs: 0,
    segments: [],
  }
  await native('CatFocus', 'startFocus', { session: active })
  await native('CatFocus', 'focusAction', { action: 'pause' })
  await assert.rejects(() => native('AppUpdates', 'download', { allowMetered: true }), /专注/)
  const finished = await native('CatFocus', 'focusAction', { action: 'finish' })
  // Remove only this explicitly created test record, keeping the pre-upgrade fixture exact.
  if (finished.record) {
    const updated = (await native('CatFocus', 'loadData')).data
    updated.records = updated.records.filter((r) => r.id !== finished.record.id)
    updated.deletedRecordIds.push(finished.record.id)
    await native('CatFocus', 'saveData', { data: updated })
    data.deletedRecordIds.push(finished.record.id)
  }
  await send('Page.reload')
  await waitText('升级保留英语')
  await evaluate('document.querySelector(\'.tabbar a[href="#/settings"]\').click()')
  await waitText('检查更新')
  await click('检查更新')
  await waitText('立即更新')
  await screenshot('01-update-offer')
  await click('立即更新')
  if ((await native('AppUpdates', 'status')).metered) {
    await waitText('使用流量下载')
    await click('使用流量下载')
  }
  command(
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.MAIN',
    '-c',
    'android.intent.category.HOME',
  )
  state = await until(
    async () => {
      const state = await native('AppUpdates', 'status')
      if (state.phase === 'failed') throw new Error(state.message)
      return state.phase === 'ready' ? state : null
    },
    'background DownloadManager and APK verification',
    60000,
  )
  command('shell', 'am', 'start', '-n', 'com.xiaomao.focus/.MainActivity')
  await waitText('安装更新')
  await screenshot('02-download-ready')
  if (!state.canInstall) {
    await click('允许安装更新')
    await delay(500)
    const permissionXml = dumpWindow('/sdcard/kitten-permission.xml')
    writeFileSync(resolve(evidence, 'source-permission.xml'), permissionXml)
    assert(
      /安装未知应用|Install unknown apps/.test(permissionXml),
      'First update must guide to source permission',
    )
    const toggle = [...permissionXml.matchAll(/<node\b[^>]*>/g)].find(
      ([node]) => /checkable="true"/.test(node) && /clickable="true"/.test(node),
    )?.[0]
    const toggleBounds = toggle?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    assert(toggleBounds, 'Source-permission switch must be visible')
    command(
      'shell',
      'input',
      'tap',
      String(Math.round((+toggleBounds[1] + +toggleBounds[3]) / 2)),
      String(Math.round((+toggleBounds[2] + +toggleBounds[4]) / 2)),
    )
    command('shell', 'input', 'keyevent', '4')
    command('shell', 'am', 'start', '-n', 'com.xiaomao.focus/.MainActivity')
    await until(async () => (await native('AppUpdates', 'status')).canInstall, 'source permission')
    await waitText('安装更新')
  }
  await click('安装更新')
  await delay(700)
  const snapshots = (await native('AppUpdates', 'backups')).backups
  assert(
    snapshots.some((b) => b.from === 6 && b.to === 7),
    'Recovery copy must exist before installation',
  )
  const xml = dumpWindow('/sdcard/kitten-upgrade-window.xml')
  writeFileSync(resolve(evidence, 'installer.xml'), xml)
  const install = [...xml.matchAll(/<node\b[^>]*>/g)].find(
    ([node]) => /text="(?:安装|更新|Install|Update)"/.test(node) && /enabled="true"/.test(node),
  )?.[0]
  assert(install, 'System install confirmation button missing; inspect installer.xml')
  const bounds = install.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  assert(bounds)
  command(
    'shell',
    'input',
    'tap',
    String(Math.round((+bounds[1] + +bounds[3]) / 2)),
    String(Math.round((+bounds[2] + +bounds[4]) / 2)),
  )
  socket.close()
  await until(
    () => command('shell', 'dumpsys', 'package', 'com.xiaomao.focus').includes('versionCode=7 '),
    'system-confirmed upgrade',
    60000,
  )
  await connect()
  assert.deepEqual(
    (await native('CatFocus', 'loadData')).data,
    data,
    'In-app update must preserve all business data',
  )
  state = await native('AppUpdates', 'status')
  assert.equal(state.currentCode, 7)
  assert.equal(state.release, null)
  await evaluate('document.querySelector(\'.tabbar a[href="#/settings"]\').click()')
  await waitText('0.2.1-qa')
  await screenshot('03-updated-settings')
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'))
  writeFileSync(
    resolve(evidence, 'upgrade-report.json'),
    JSON.stringify(
      {
        passed: [
          '0.1.4 to bootstrap cover-install',
          'all business data retained',
          'daily HTTPS check',
          'badge without modal',
          'paused focus blocks download',
          'in-app offer',
          'metered confirmation if required',
          'background download',
          'APK verification',
          'source permission guidance',
          'backup before install',
          'system installer confirmation',
          '0.2.0 to 0.2.1-qa installation',
          'post-upgrade data equality',
        ],
        runtimeErrors,
        installed: state.currentVersion,
        backups: (await native('AppUpdates', 'backups')).backups,
      },
      null,
      2,
    ),
  )
  console.log('Full in-app update and exact data-retention smoke passed.')
} finally {
  socket?.close()
  command('forward', '--remove', 'tcp:9225')
}
