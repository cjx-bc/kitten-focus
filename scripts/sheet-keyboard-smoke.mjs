// Runs against an installed app on a dedicated emulator; leaves business data untouched.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { emptyData } from '../src/domain/model.ts'

const root = resolve(import.meta.dirname, '..')
const serial = process.env.ANDROID_SERIAL || '127.0.0.1:16416'
assert(/^(?:emulator-\d+|127\.0\.0\.1:\d+)$/.test(serial), 'Use a dedicated emulator')
const adb = process.env.ADB || resolve(root, '.tools/android-sdk/platform-tools/adb.exe')
const evidence = resolve(root, process.env.KEYBOARD_EVIDENCE_DIR || 'artifacts/sheet-keyboard')
mkdirSync(evidence, { recursive: true })
const command = (...args) =>
  execFileSync(adb, ['-s', serial, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
  })
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
async function until(action, label, timeout = 15000) {
  const start = Date.now()
  let lastError
  while (Date.now() - start < timeout) {
    try {
      const value = await action()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(150)
  }
  throw new Error('Timeout: ' + label + (lastError ? ': ' + lastError.message : ''))
}
const imeShown = () => /mInputShown=true/.test(command('shell', 'dumpsys', 'input_method'))
const originalKeyboard = command(
  'shell',
  'settings',
  'get',
  'secure',
  'show_ime_with_hard_keyboard',
).trim()
const originalRotation = command('shell', 'settings', 'get', 'system', 'user_rotation').trim()
const originalAutoRotate = command(
  'shell',
  'settings',
  'get',
  'system',
  'accelerometer_rotation',
).trim()
let socket,
  next = 0,
  originalData
const pending = new Map()
const errors = []
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++next
    const timer = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 30000)
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timer)
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
async function snapshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(resolve(evidence, name + '.png'), Buffer.from(result.data, 'base64'))
  writeFileSync(
    resolve(evidence, name + '-device.png'),
    execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true }),
  )
}
const geometry = () =>
  evaluate(`(() => {
  const sheet = document.querySelector('dialog[open]'), rect = sheet.getBoundingClientRect(), header = sheet.querySelector('header').getBoundingClientRect();
  return {top:rect.top,bottom:rect.bottom,height:rect.height,headerTop:header.top,innerHeight,visualHeight:visualViewport.height,visualTop:visualViewport.offsetTop,scrollY,dialogScroll:sheet.scrollTop,active:document.activeElement?.tagName};
})()`)
async function hideKeyboard() {
  if (imeShown()) command('shell', 'input', 'keyevent', 'KEYCODE_BACK')
  await until(() => !imeShown(), 'keyboard hidden')
  await delay(350)
}
async function tapField(selector) {
  const point = await evaluate(
    `(() => {const field=document.querySelector(${JSON.stringify(selector)});field.scrollIntoView({block:'nearest'});const r=field.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  )
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await until(imeShown, 'software keyboard shown')
  await delay(500)
}
try {
  command('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
  command(
    'shell',
    'settings',
    'put',
    'system',
    'user_rotation',
    process.env.KEYBOARD_ROTATION || '0',
  )
  await delay(500)
  command('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1')
  command('shell', 'am', 'start', '-n', 'com.xiaomao.focus/.MainActivity')
  const pid = await until(
    () => command('shell', 'pidof', 'com.xiaomao.focus').trim().split(' ')[0],
    'app process',
  )
  command('forward', 'tcp:9227', 'localabstract:webview_devtools_remote_' + pid)
  const target = await until(async () => {
    try {
      return (await (await fetch('http://127.0.0.1:9227/json')).json()).find((t) =>
        t.url.includes('localhost'),
      )
    } catch {
      return null
    }
  }, 'WebView')
  socket = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost:\d+/, '127.0.0.1:9227'))
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.id && pending.has(data.id)) {
      const callback = pending.get(data.id)
      pending.delete(data.id)
      data.error ? callback.reject(new Error(data.error.message)) : callback.resolve(data.result)
    } else if (data.method === 'Runtime.exceptionThrown')
      errors.push(data.params.exceptionDetails.text)
  }
  await send('Runtime.enable')
  await send('Page.enable')
  const loaded = await evaluate('window.Capacitor.nativePromise("CatFocus","loadData",{})')
  originalData = loaded.data || emptyData()
  if (!loaded.data?.items?.length) {
    const data = structuredClone(originalData)
    data.themes.push({
      id: 'keyboard-test-theme',
      name: '输入法验证',
      color: '#737378',
      order: 0,
      collapsed: false,
    })
    data.items.push({
      id: 'keyboard-test-item',
      themeId: 'keyboard-test-theme',
      title: '弹窗位置验证',
      note: '',
      mode: 'countdown',
      minutes: 25,
      order: 0,
    })
    await evaluate(
      `window.Capacitor.nativePromise('CatFocus','saveData',{data:${JSON.stringify(data)}})`,
    )
    await send('Page.reload')
    await until(() => evaluate('!!document.querySelector(".task-text")'), 'seeded test item')
  }
  await evaluate('location.hash="/tasks"')
  await until(() => evaluate('!!document.querySelector(".tasks-page")'), 'tasks page')
  await hideKeyboard()
  await evaluate(
    `document.querySelectorAll('dialog[open]').forEach(e=>e.dispatchEvent(new Event('cancel',{cancelable:true})))`,
  )
  await until(
    () => evaluate('!!document.querySelector(".task-text")'),
    'existing reusable test item',
  )
  await evaluate('document.querySelector(".task-text").click()')
  await until(
    () => evaluate('document.querySelector("dialog[open] h2")?.textContent === "编辑待办"'),
    'edit item dialog',
  )
  await evaluate(`(()=>{if(!document.querySelector('dialog[open] input[type=number]'))[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent.trim()==='倒计时').click()})()`)
  await hideKeyboard()
  await evaluate(
    'document.activeElement?.blur(); document.querySelector("dialog[open]").scrollTop=0',
  )
  const before = await geometry()
  await snapshot('01-before-keyboard')
  await tapField('dialog[open] input')
  await delay(1000)
  writeFileSync(resolve(evidence, 'ime-shown.txt'), command('shell', 'dumpsys', 'input_method'))
  writeFileSync(resolve(evidence, 'window-shown.txt'), command('shell', 'dumpsys', 'window'))
  const keyboard = await geometry()
  assert(
    before.innerHeight - keyboard.innerHeight > 100,
    'A real software keyboard must resize the viewport',
  )
  await snapshot('02-with-keyboard')
  await hideKeyboard()
  const after = await geometry()
  await snapshot('03-after-keyboard')
  const movement = Math.abs(before.top - keyboard.top)
  const report = { before, keyboard, after, movement, errors }
  writeFileSync(resolve(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  assert(movement <= 2, `Edit dialog moved ${movement}px when the software keyboard opened`)
  assert(Math.abs(before.top - after.top) <= 2, 'Dialog moved after hiding keyboard')
  const fields = []
  for (const selector of ['dialog[open] input[type=number]', 'dialog[open] textarea']) {
    await tapField(selector)
    const state = await geometry()
    const input = await evaluate(
      `(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();const h=document.querySelector('.sheet-header').getBoundingClientRect();return{top:r.top,bottom:r.bottom,headerBottom:h.bottom}})()`,
    )
    console.log(JSON.stringify({ selector, state, input }))
    await snapshot(selector.endsWith('textarea') ? '04-note-keyboard' : '04-number-keyboard')
    assert(Math.abs(before.top - state.top) <= 2, 'Dialog moved while switching input fields')
    assert(
      input.bottom <= state.visualHeight + 2 && input.top >= input.headerBottom - 2,
      'Focused field must stay above the keyboard and below the header',
    )
    assert.equal(state.scrollY, 0, 'Background page scrolled while editing')
    fields.push({ selector, state, input })
    if (selector.endsWith('textarea'))
      await send('Input.insertText', { text: 'keyboard regression note' })
    await snapshot(selector.endsWith('textarea') ? '04-note-keyboard' : '04-number-keyboard')
    await hideKeyboard()
  }
  const expectedNote = await evaluate('document.querySelector("dialog[open] textarea").value')
  const expectedTitle = await evaluate('document.querySelector("dialog[open] input").value')
  await evaluate(
    `[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent.trim()==='保存待办').click()`,
  )
  await until(() => evaluate('!document.querySelector("dialog[open]")'), 'saved item')
  await send('Page.reload')
  await until(() => evaluate('!!document.querySelector(".task-text")'), 'saved page reloaded')
  const saved = await evaluate('window.Capacitor.nativePromise("CatFocus","loadData",{})')
  assert(
    saved.data.items.some((item) => item.title === expectedTitle && item.note === expectedNote),
    'Edited note did not persist',
  )
  report.fields = fields
  report.savePersisted = true
  writeFileSync(resolve(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log('Title, numeric input, note, keyboard dismissal and persisted save passed.')
  assert.equal(errors.length, 0, 'JavaScript runtime errors')
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await hideKeyboard().catch(() => {})
    await evaluate(
      `document.querySelectorAll('dialog[open]').forEach(e=>e.dispatchEvent(new Event('cancel',{cancelable:true})))`,
    ).catch(() => {})
    if (originalData) {
      await evaluate(
        `window.Capacitor.nativePromise('CatFocus','saveData',{data:${JSON.stringify(originalData)}})`,
      )
      await send('Page.reload')
    }
    socket.close()
  }
  if (originalKeyboard === 'null')
    command('shell', 'settings', 'delete', 'secure', 'show_ime_with_hard_keyboard')
  else
    command('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', originalKeyboard)
  command('shell', 'settings', 'put', 'system', 'user_rotation', originalRotation)
  command('shell', 'settings', 'put', 'system', 'accelerometer_rotation', originalAutoRotate)
  try {
    command('forward', '--remove', 'tcp:9227')
  } catch {
    /* App may not have started. */
  }
}
