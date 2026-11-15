// Runs only on a dedicated QA APK; observes real foreground apps through Android.
import assert from 'node:assert/strict'
import { emptyData } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'

const qa = await connectQa({ output: 'artifacts/focus-control/api36/study-device' })
const { native, evaluate, command } = qa
const results = []
const foreground = () => command('shell', 'dumpsys', 'activity', 'activities')
const launch = (...args) => command('shell', 'am', 'start', ...args)
const click = label => evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(el =>
    el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)});
  if (!button) throw new Error('Missing QA control: ' + ${JSON.stringify(label)});
  button.click();
})()`)
try {
  await native('focusAction', { action: 'finish' })
  await native('restAction', { action: 'exit' })
  const data = emptyData()
  data.preferences.sound = false
  data.preferences.vibration = false
  data.preferences.protection = { study: true, strict: false, interceptNotifications: false,
    dnd: false, globalWhitelist: ['com.android.chrome'], enhancements: [] }
  await native('replaceData', { data })
  await qa.send('Page.reload', {})
  await until(async () => (await evaluate('document.body.innerText')).includes('待办'), 'tasks screen')
  await until(async () => (await native('protectionStatus')).connected, 'real accessibility service')
  await click('学霸模式')
  await until(() => evaluate('!!document.querySelector("dialog[open]")'), 'study Sheet')
  assert((await evaluate('document.body.innerText')).includes('全局白名单'))
  await qa.screenshot('01-study-sheet')
  await click('完成')
  const now = Date.now()
  const session = { id: 'actual-study-' + now, itemId: null, themeId: null,
    title: 'API36 学霸模式设备验证', themeName: '自由专注', color: '#222222',
    mode: 'stopwatch', targetMs: 60000, startedAt: now, timeZone: 'UTC',
    state: 'running', elapsedMs: 0, pausedMs: 0, anchorMono: now, anchorEpoch: now,
    bootId: 0, segments: [] }
  await native('startFocus', { session })
  assert.equal((await native('protectionStatus')).active, true)
  launch('-a', 'android.intent.action.VIEW', '-d', 'about:blank', '-p', 'com.android.chrome')
  await until(() => foreground().includes('topResumedActivity') && foreground().includes('com.android.chrome'), 'allowed Chrome')
  await delay(400)
  assert(!foreground().match(/topResumedActivity=.*FocusBlockActivity/))
  results.push({ scenario: 'whitelisted-application-opens', passed: true })
  launch('-a', 'android.settings.SETTINGS')
  await until(() => /topResumedActivity=.*FocusBlockActivity/.test(foreground()), 'real native block page')
  command('shell', 'uiautomator', 'dump', '/data/local/tmp/qa-study-block.xml')
  const blockText = command('shell', 'cat', '/data/local/tmp/qa-study-block.xml')
  assert(blockText.includes('API36 学霸模式设备验证'))
  results.push({ scenario: 'non-whitelisted-application-blocked-with-current-item', passed: true })
  await native('focusAction', { action: 'pause' })
  launch('-a', 'android.settings.SETTINGS')
  await until(() => /topResumedActivity=.*FocusBlockActivity/.test(foreground()), 'paused block remains')
  assert.equal((await native('protectionStatus')).active, true)
  results.push({ scenario: 'normal-pause-keeps-application-limit', passed: true })
  await native('focusAction', { action: 'finish' })
  assert.equal((await native('observeControl')).owner, 'rest')
  assert.equal((await native('protectionStatus')).active, false)
  launch('-a', 'android.settings.SETTINGS')
  await until(() => /topResumedActivity=.*com.android.settings/.test(foreground()), 'rest releases app limit')
  await delay(350)
  assert(!foreground().match(/topResumedActivity=.*FocusBlockActivity/))
  results.push({ scenario: 'normal-end-and-rest-release-app-limit', passed: true })
  await native('restAction', { action: 'exit' })
  launch('-n', qa.appId + '/com.xiaomao.focus.MainActivity')
  await qa.screenshot('02-after-rest')
  qa.save('results.json', { serial: qa.serial, appId: qa.appId, results })
  console.log(JSON.stringify({ serial: qa.serial, results }))
} finally {
  qa.close()
}
