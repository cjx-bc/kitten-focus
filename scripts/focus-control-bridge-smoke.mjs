// Uses the real WebView -> Capacitor -> Java bridge on an already installed QA APK.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { androidDevice } from './lib/android-device.mjs'

const root = resolve(import.meta.dirname, '..')
const { adb, serial } = androidDevice(root)
const appId = process.env.ANDROID_APP_ID || 'com.xiaomao.focus.qa'
assert(serial && /^(?:emulator-\d+|127\.0\.0\.1:\d+)$/.test(serial), 'Select an emulator explicitly')
assert(appId.endsWith('.qa'), 'This mutating smoke test only runs on the separate QA package')
const evidence = resolve(root, process.env.CONTROL_EVIDENCE_DIR || 'artifacts/focus-control/t01/bridge')
mkdirSync(evidence, { recursive: true })
const command = (...args) => execFileSync(adb, ['-s', serial, ...args], {
  encoding: 'utf8', windowsHide: true, timeout: 30000,
})
const delay = ms => new Promise(done => setTimeout(done, ms))
async function until(fn, label) {
  const end = Date.now() + 15000
  while (Date.now() < end) {
    const value = await fn()
    if (value) return value
    await delay(150)
  }
  throw new Error('Timeout: ' + label)
}
command('shell', 'am', 'start', '-n', appId + '/com.xiaomao.focus.MainActivity')
const pid = await until(() => command('shell', 'pidof', appId).trim().split(' ')[0], 'QA process')
await until(() => command('shell', 'cat', '/proc/net/unix').includes('webview_devtools_remote_' + pid), 'QA WebView')
const port = 9237
command('forward', 'tcp:' + port, 'localabstract:webview_devtools_remote_' + pid)
const pages = await until(async () => {
  const result = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  return result.length ? result : null
}, 'QA WebView page')
const page = pages.find(p => p.url.includes('localhost')) || pages[0]
const socket = new WebSocket(page.webSocketDebuggerUrl.replace(/localhost:\d+/, '127.0.0.1:' + port))
await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject })
let next = 0
const pending = new Map()
socket.onmessage = event => {
  const message = JSON.parse(event.data)
  const request = pending.get(message.id)
  if (!request) return
  pending.delete(message.id)
  clearTimeout(request.timer)
  if (message.error) request.reject(new Error(message.error.message))
  else request.resolve(message.result)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++next
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)) }, 15000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const native = (method, options = {}) => evaluate(
  `window.Capacitor.nativePromise('CatFocus',${JSON.stringify(method)},${JSON.stringify(options)})`,
)
const results = []
try {
  await until(() => evaluate('!!window.Capacitor?.nativePromise'), 'Capacitor bridge')
  const before = await native('observeControl')
  assert.equal(before.owner, null, 'Start with no running QA session')
  const now = Date.now()
  const session = {
    id: 'bridge-smoke-' + now, itemId: null, themeId: null, title: '控制桥接验证',
    themeName: '自由专注', color: '#222222', mode: 'stopwatch', targetMs: 60000,
    startedAt: now, timeZone: 'UTC', state: 'running', elapsedMs: 0, pausedMs: 0,
    anchorMono: now, anchorEpoch: now, bootId: 0, segments: [],
  }
  await native('startFocus', { session })
  assert.equal((await native('observeControl')).owner, 'focus')
  await delay(180)
  const paused = await native('focusAction', { action: 'pause' })
  await delay(180)
  assert.equal((await native('observeControl')).focus.elapsedMs, paused.elapsedMs)
  await native('focusAction', { action: 'resume' })
  await delay(150)
  const ended = await native('focusAction', { action: 'finish' })
  assert.equal(ended.record.status, 'completed')
  assert(ended.record.durationMs >= 250)
  assert(ended.record.pausedMs >= 150)
  const resting = await native('observeControl')
  assert.equal(resting.owner, 'rest')
  assert(resting.rest.remainingMs > 295000 && resting.rest.remainingMs <= 300000)
  await native('restAction', { action: 'exit' })
  assert.equal((await native('observeControl')).owner, null)
  results.push({ scenario: 'real-webview-native-focus-rest-loop', passed: true,
    durationMs: ended.record.durationMs, pausedMs: ended.record.pausedMs })
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(resolve(evidence, 'qa-webview.png'), Buffer.from(shot.data, 'base64'))
  writeFileSync(resolve(evidence, 'results.json'), JSON.stringify({ appId, serial, results }, null, 2))
  console.log(JSON.stringify({ appId, serial, results }))
} finally {
  socket.close()
  command('forward', '--remove', 'tcp:' + port)
}
