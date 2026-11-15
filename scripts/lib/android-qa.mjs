import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { androidDevice } from './android-device.mjs'

export const delay = ms => new Promise(done => setTimeout(done, ms))
export async function until(fn, label, timeout = 15000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try { const value = await fn(); if (value) return value } catch (error) { last = error }
    await delay(180)
  }
  throw new Error('Timeout: ' + label + (last ? ': ' + last.message : ''))
}

/** Real QA WebView/native bridge. Explicit emulator and separate application required. */
export async function connectQa({ port = 9237, output = 'artifacts/focus-control/qa', launch = true } = {}) {
  const root = resolve(import.meta.dirname, '../..')
  const { adb, serial } = androidDevice(root)
  const appId = process.env.ANDROID_APP_ID || 'com.xiaomao.focus.qa'
  assert(serial && /^(?:emulator-\d+|127\.0\.0\.1:\d+)$/.test(serial), 'Select an emulator explicitly')
  assert(appId.endsWith('.qa'), 'Only the isolated QA application may be mutated')
  const command = (...args) => execFileSync(adb, ['-s', serial, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
  })
  command('shell', 'input', 'keyevent', 'WAKEUP')
  command('shell', 'wm', 'dismiss-keyguard')
  if (launch) command('shell', 'am', 'start', '-n', appId + '/com.xiaomao.focus.MainActivity')
  const pid = await until(() => command('shell', 'pidof', appId).trim().split(' ')[0], 'QA process')
  await until(() => command('shell', 'cat', '/proc/net/unix').includes('webview_devtools_remote_' + pid), 'QA WebView')
  command('forward', 'tcp:' + port, 'localabstract:webview_devtools_remote_' + pid)
  const pages = await until(async () => {
    const result = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    return result.length ? result : null
  }, 'QA page')
  const page = pages.find(p => p.url.includes('localhost')) || pages[0]
  const socket = new WebSocket(page.webSocketDebuggerUrl.replace(/localhost:\d+/, '127.0.0.1:' + port))
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject })
  let next = 0
  const pending = new Map()
  socket.onmessage = event => {
    const message = JSON.parse(event.data), request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id); clearTimeout(request.timer)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  }
  const rawSend = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 15000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const send = async (method, params = {}) => {
    if (method !== 'Page.reload') return rawSend(method, params)
    const marker = 'qa-reload-' + Date.now() + '-' + next
    await rawSend('Runtime.evaluate', {
      expression: `window.__qaReloadDocument = ${JSON.stringify(marker)}`,
    })
    const result = await rawSend(method, params)
    await until(async () => {
      const state = await rawSend('Runtime.evaluate', {
        expression: `window.__qaReloadDocument !== ${JSON.stringify(marker)} && document.readyState === 'complete' && !!document.querySelector('.app-shell') && !document.querySelector('.boot') && !!window.Capacitor?.nativePromise`,
        returnByValue: true,
      })
      return !state.exceptionDetails && state.result?.value === true
    }, 'new QA document and app initialization after reload', 30000)
    return result
  }
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const native = (method, options = {}) => evaluate(
    `window.Capacitor.nativePromise('CatFocus',${JSON.stringify(method)},${JSON.stringify(options)})`,
  )
  const evidence = resolve(root, output)
  mkdirSync(evidence, { recursive: true })
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(resolve(evidence, name + '.png'), Buffer.from(shot.data, 'base64'))
  }
  const save = (name, value) => writeFileSync(resolve(evidence, name), JSON.stringify(value, null, 2))
  await until(() => evaluate('!!window.Capacitor?.nativePromise'), 'Capacitor')
  return { appId, serial, command, send, evaluate, native, screenshot, save,
    get closed() { return socket.readyState >= 2 },
    close() { socket.close(); command('forward', '--remove', 'tcp:' + port) } }
}
