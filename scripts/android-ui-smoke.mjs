import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..'),
  adb = process.env.ADB || resolve(root, '.tools/android-sdk/platform-tools/adb.exe'),
  serial = process.env.ANDROID_SERIAL || '127.0.0.1:16384'
const evidence = resolve(root, 'artifacts/android-ui')
mkdirSync(evidence, { recursive: true })
const command = (...args) =>
  execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label, timeout = 20000) {
  const start = Date.now()
  let error
  while (Date.now() - start < timeout) {
    try {
      const value = await fn()
      if (value) return value
    } catch (e) {
      error = e
    }
    await delay(200)
  }
  throw new Error(`Timeout: ${label}: ${error || ''}`)
}
console.log('Installing the local debug APK on', serial)
command('install', '-r', resolve(root, 'android/app/build/outputs/apk/debug/app-debug.apk'))
command('shell', 'am', 'start', '-n', 'com.xiaomao.focus/.MainActivity')
await until(() => command('shell', 'pidof', 'com.xiaomao.focus').trim(), 'app process')
const pid = command('shell', 'pidof', 'com.xiaomao.focus').trim().split(' ')[0]
await until(
  () => command('shell', 'cat', '/proc/net/unix').includes('webview_devtools_remote_' + pid),
  'WebView debugging',
)
command('forward', 'tcp:9225', 'localabstract:webview_devtools_remote_' + pid)
const targets = await until(async () => {
  const response = await fetch('http://127.0.0.1:9225/json')
  const targets = await response.json()
  return targets.length ? targets : null
}, 'WebView page')
const target = targets.find((t) => t.url.includes('localhost')) || targets[0]
const socket = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost:\d+/, '127.0.0.1:9225'))
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = reject
})
let nextId = 0
const pending = new Map(),
  errors = []
socket.onmessage = (event) => {
  const packet = JSON.parse(event.data)
  if (packet.id) {
    const value = pending.get(packet.id)
    if (value) {
      pending.delete(packet.id)
      packet.error ? value.reject(new Error(packet.error.message)) : value.resolve(packet.result)
    }
  } else if (packet.method === 'Runtime.exceptionThrown')
    errors.push(packet.params.exceptionDetails.text)
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
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
const native = (method, options = {}) =>
  evaluate(
    `window.Capacitor.nativePromise('CatFocus',${JSON.stringify(method)},${JSON.stringify(options)})`,
  )
const text = () => evaluate('document.body.innerText')
const click = async (label) => {
  await evaluate(
    `(()=>{const button=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)}||e.getAttribute('aria-label')===${JSON.stringify(label)});if(!button)throw new Error('Missing button: '+${JSON.stringify(label)});button.click();})()`,
  )
  await delay(200)
}
const fill = async (label, value) => {
  await evaluate(
    `(()=>{const label=[...document.querySelectorAll('label')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(label)}));if(!label)throw new Error('Missing field '+${JSON.stringify(label)});const input=label.querySelector('input,textarea,select');const prototype=input instanceof HTMLSelectElement?HTMLSelectElement.prototype:input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  )
}
const waitText = (value) => until(async () => (await text()).includes(value), value)
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(resolve(evidence, name + '.png'), Buffer.from(result.data, 'base64'))
}
try {
  await send('Runtime.enable')
  await send('Page.enable')
  await waitText('待办')
  const initial = await native('loadData')
  assert.equal(
    initial.data?.items?.length || 0,
    0,
    'Use a clean test installation, not personal app data',
  )
  console.log('Creating a theme and reusable item through Vue UI')
  await click('新建主题')
  await fill('主题名称', '联调英语')
  await click('保存主题')
  await waitText('联调英语')
  await click('在联调英语下添加待办')
  await fill('待办名称', '联调背单词')
  await click('正计时')
  await click('保存待办')
  await waitText('联调背单词')
  await screenshot('01-tasks')
  await click('开始联调背单词')
  await waitText('正计时专注')
  await delay(400)
  await click('暂停专注')
  let state = await native('focusAction', { action: 'read' })
  assert.equal(state.session.state, 'paused')
  const paused = state.elapsedMs
  await delay(400)
  assert.equal((await native('focusAction', { action: 'read' })).elapsedMs, paused)
  console.log('Pause persisted in SQLite; reloading the WebView')
  await send('Page.reload')
  await waitText('已暂停')
  state = await native('focusAction', { action: 'read' })
  assert.equal(state.session.state, 'paused')
  await click('继续专注')
  await delay(300)
  await screenshot('02-focus')
  const before = (await native('focusAction', { action: 'read' })).elapsedMs
  command(
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.MAIN',
    '-c',
    'android.intent.category.HOME',
  )
  await delay(1400)
  command('shell', 'am', 'start', '-n', 'com.xiaomao.focus/.MainActivity')
  await delay(300)
  const after = (await native('focusAction', { action: 'read' })).elapsedMs
  assert(after - before >= 1200, 'Background time must continue')
  await evaluate('window.confirm=()=>true')
  await click('结束专注')
  await waitText('本次专注已完成')
  await screenshot('03-result')
  let loaded = (await native('loadData')).data
  assert.equal(loaded.records.length, 1)
  assert.equal(loaded.items.length, 1)
  assert.equal(loaded.records[0].status, 'completed')
  assert.equal(
    loaded.records[0].durationMs,
    loaded.records[0].segments.reduce((sum, s) => sum + s.end - s.start, 0),
    'Segment sum must match duration',
  )
  await click('返回待办')
  await waitText('联调背单词')
  console.log('Reusable item, native timer and statistics record agree')
  await evaluate(`location.hash='/calendar'`)
  await waitText('日程')
  await click('添加日程')
  await fill('日程名称', '联调复习计划')
  await click('保存日程')
  await waitText('联调复习计划')
  await screenshot('04-calendar')
  await click('课表')
  await click('设置学期')
  await fill('学期名称', '联调学期')
  await click('保存并设为当前学期')
  await waitText('添加课程')
  await click('添加课程')
  await fill('课程名称', '联调高等数学')
  await click('保存课程')
  await waitText('联调高等数学')
  await screenshot('05-timetable')
  await evaluate(`location.hash='/statistics'`)
  await waitText('专注分布')
  await screenshot('06-statistics')
  await evaluate(`location.hash='/cat'`)
  await waitText('小猫还未入驻')
  assert((await text()).includes('小猫还未入驻'))
  await screenshot('07-cat')
  await evaluate(`location.hash='/settings'`)
  await waitText('导出备份')
  await screenshot('08-settings')
  const dimensions = await evaluate(
    '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})',
  )
  assert(dimensions.scrollWidth <= dimensions.width, 'Unexpected horizontal overflow')
  loaded = (await native('loadData')).data
  assert.equal(loaded.events.length, 1)
  assert.equal(loaded.semesters.length, 1)
  assert.equal(loaded.courses.length, 1)
  assert.equal(errors.length, 0, errors.join('\n'))
  writeFileSync(
    resolve(evidence, 'report.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        serial,
        platform: 'Android 15 emulator',
        passed: [
          'Vue theme/item creation',
          'Java bridge and SQLite persistence',
          'pause/resume and WebView reload',
          'background timing',
          'finish and segment-duration consistency',
          'reusable item retention',
          'calendar event',
          'semester and course',
          'statistics route',
          'cat placeholder',
          'settings route',
          'no horizontal overflow',
        ],
        runtimeErrors: errors,
      },
      null,
      2,
    ),
  )
  console.log('Android UI smoke passed. Evidence:', evidence)
} finally {
  socket.close()
}
