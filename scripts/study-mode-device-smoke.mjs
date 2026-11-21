// Runs only on a dedicated QA APK; observes real foreground apps through Android.
import assert from 'node:assert/strict'
import { emptyData } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'

let qa = await connectQa({ output: 'artifacts/focus-control/api36/study-device' })
const results = []
const foreground = () => qa.command('shell', 'dumpsys', 'activity', 'activities')
const launch = (...args) => qa.command('shell', 'am', 'start', ...args)
const click = label => qa.evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(el =>
    el.getAttribute('aria-label') === ${JSON.stringify(label)}
      || el.getAttribute('aria-label')?.startsWith(${JSON.stringify(label)} + '，')
      || el.textContent.trim() === ${JSON.stringify(label)}
      || el.firstElementChild?.textContent.trim() === ${JSON.stringify(label)});
  if (!button) throw new Error('Missing QA control: ' + ${JSON.stringify(label)});
  button.click();
})()`)
try {
  await qa.native('focusAction', { action: 'finish' })
  await qa.native('restAction', { action: 'exit' })
  const data = emptyData()
  data.preferences.sound = false
  data.preferences.vibration = false
  data.preferences.protection = { study: true, strict: false, interceptNotifications: false,
    dnd: false, globalWhitelist: ['com.android.chrome'], enhancements: [] }
  await qa.native('replaceData', { data })
  await qa.evaluate("location.hash = '#/tasks'")
  await qa.send('Page.reload', {})
  await until(() => qa.evaluate("location.hash === '#/tasks' && !!document.querySelector('.study-entry')"), 'tasks study entry')
  await until(async () => (await qa.native('protectionStatus')).connected, 'real accessibility service')
  await click('学霸模式')
  await until(() => qa.evaluate('!!document.querySelector("dialog[open]")'), 'study Sheet')
  const homeText = await qa.evaluate('document.body.innerText')
  assert(homeText.includes('应用限制') && homeText.includes('严格模式') && homeText.includes('免打扰') && homeText.includes('授权与权限'))
  await qa.evaluate('document.querySelector("dialog[open] .module-nav").click()')
  await until(() => qa.evaluate('document.body.innerText.includes("允许使用的应用")'), 'apps detail view')
  await qa.screenshot('01-study-sheet')
  await click('返回学霸模式')
  await until(() => qa.evaluate('document.body.innerText.includes("授权与权限")'), 'study home view')
  await click('完成')
  const now = Date.now()
  const session = { id: 'actual-study-' + now, itemId: null, themeId: null,
    title: 'API36 学霸模式设备验证', themeName: '自由专注', color: '#222222',
    mode: 'stopwatch', targetMs: 60000, startedAt: now, timeZone: 'UTC',
    state: 'running', elapsedMs: 0, pausedMs: 0, anchorMono: now, anchorEpoch: now,
    bootId: 0, segments: [] }
  await qa.native('startFocus', { session })
  assert.equal((await qa.native('protectionStatus')).active, true)
  await until(() => qa.evaluate('location.hash === "#/focus" && !!document.querySelector("button[aria-label=\'学霸模式进行中，专注页已锁定\']")'), 'study focus locked UI')
  await qa.evaluate('document.querySelector("button[aria-label=\'学霸模式进行中，专注页已锁定\']").click()')
  await qa.evaluate('location.hash = "#/tasks"')
  await until(() => qa.evaluate('location.hash === "#/focus"'), 'router guard locks focus page')
  results.push({ scenario: 'study-focus-page-locked-until-end', passed: true })

  // Android system KEYCODE_BACK must NOT leave #/focus while study mode is locked
  qa.command('shell', 'input', 'keyevent', 'KEYCODE_BACK')
  await delay(500)
  assert.equal(await qa.evaluate('location.hash'), '#/focus')
  assert(foreground().includes(qa.appId))
  results.push({ scenario: 'android-back-button-blocked-on-study-focus', passed: true })

  launch('-a', 'android.intent.action.VIEW', '-d', 'about:blank', '-p', 'com.android.chrome')
  await until(() => foreground().includes('topResumedActivity') && foreground().includes('com.android.chrome'), 'allowed Chrome')
  await delay(400)
  assert(!foreground().match(/topResumedActivity=.*FocusBlockActivity/))
  results.push({ scenario: 'whitelisted-application-opens', passed: true })
  launch('-a', 'android.settings.SETTINGS')
  await until(() => /topResumedActivity=.*FocusBlockActivity/.test(foreground()), 'real native block page')
  qa.command('shell', 'uiautomator', 'dump', '/data/local/tmp/qa-study-block.xml')
  const blockText = qa.command('shell', 'cat', '/data/local/tmp/qa-study-block.xml')
  assert(blockText.includes('API36 学霸模式设备验证'))
  results.push({ scenario: 'non-whitelisted-application-blocked-with-current-item', passed: true })
  await qa.native('focusAction', { action: 'pause' })
  launch('-a', 'android.settings.SETTINGS')
  await until(() => /topResumedActivity=.*FocusBlockActivity/.test(foreground()), 'paused block remains')
  assert.equal((await qa.native('protectionStatus')).active, true)
  results.push({ scenario: 'normal-pause-keeps-application-limit', passed: true })

  // Process recreation (am force-stop + cold relaunch) must restore locked #/focus
  const prevAppId = qa.appId
  qa.command('shell', 'am', 'force-stop', prevAppId)
  qa.close()
  await delay(800)
  qa = await connectQa({ output: 'artifacts/focus-control/api36/study-device' })
  await until(() => qa.evaluate('location.hash === "#/focus" && !!document.querySelector("button[aria-label=\'学霸模式进行中，专注页已锁定\']")'), 'recreated app restores locked focus page')
  results.push({ scenario: 'process-recreation-restores-study-focus-lock', passed: true })

  await qa.native('focusAction', { action: 'finish' })
  assert.equal((await qa.native('observeControl')).owner, 'rest')
  assert.equal((await qa.native('protectionStatus')).active, false)
  launch('-a', 'android.settings.SETTINGS')
  await until(() => /topResumedActivity=.*com.android.settings/.test(foreground()), 'rest releases app limit')
  await delay(350)
  assert(!foreground().match(/topResumedActivity=.*FocusBlockActivity/))
  results.push({ scenario: 'normal-end-and-rest-release-app-limit', passed: true })
  await qa.native('restAction', { action: 'exit' })
  launch('-n', qa.appId + '/com.xiaomao.focus.MainActivity')
  await until(() => qa.evaluate('location.hash === "#/tasks"'), 'tasks reachable after finish and rest exit')
  results.push({ scenario: 'post-finish-unlocks-tasks', passed: true })
  await qa.screenshot('02-after-rest')
  qa.save('results.json', { serial: qa.serial, appId: qa.appId, results })
  console.log(JSON.stringify({ serial: qa.serial, results }))
} finally {
  qa.close()
}
