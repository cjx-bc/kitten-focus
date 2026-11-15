// Dedicated QA data only. UI edits feed the public bridge and real foreground control.
import assert from 'node:assert/strict'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'

const qa = await connectQa({ port: 9238, output: 'artifacts/focus-control/api36/item-whitelists' })
const { native, evaluate, command } = qa
const results = []
const observe = () => native('observeControl')
const policy = async () => (await observe()).focus.session?.protection
const foreground = () => command('shell', 'dumpsys', 'activity', 'activities')
const launchMain = () => command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
const click = label => evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(el =>
    el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)});
  if (!button) throw new Error('Missing QA control: ' + ${JSON.stringify(label)});
  button.click();
})()`)
async function tasks() {
  launchMain()
  await evaluate("location.hash = '#/tasks'")
  await qa.send('Page.reload', {})
  await until(() => evaluate("!!document.querySelector('[aria-label=\"编辑待办Reading\"]')"), 'persisted Reading item')
}
async function editReading(source, packages = []) {
  await click('编辑待办Reading')
  await until(() => evaluate("!!document.querySelector('dialog[open] input[name=item-whitelist]')"), 'item configuration')
  await evaluate(`document.querySelectorAll('dialog[open] input[name=item-whitelist]')[${source === 'custom' ? 1 : 0}].click()`)
  if (source === 'custom') {
    await until(() => evaluate("[...document.querySelectorAll('dialog[open] button')].some(b=>b.textContent.includes('编辑独立白名单'))"), 'independent editor button')
    await evaluate("[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.includes('编辑独立白名单')).click()")
    await until(() => evaluate("!!document.querySelector('.app-choices') && ![...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='确认白名单')?.disabled"), 'installed application list')
    await evaluate("[...document.querySelectorAll('dialog[open]')].find(d=>d.querySelector('.app-choices')).querySelector('.switch input').click()")
    await evaluate(`(() => {
      const wanted = ${JSON.stringify(packages)};
      for (const row of document.querySelectorAll('.app-choice')) {
        const input = row.querySelector('input');
        if (input.disabled) continue;
        const selected = wanted.some(name => row.textContent.includes(name));
        if (input.checked !== selected) input.click();
      }
    })()`)
    await click('确认白名单')
    await until(() => evaluate("!document.querySelector('.app-choices')"), 'list draft confirmed')
  }
  await click('保存待办')
  await until(() => evaluate("!document.querySelector('dialog[open]')"), 'item saved')
}
async function begin(title, expectedSource) {
  await click('开始' + title)
  await until(() => evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='按此规则开始')"), 'start confirmation')
  const text = await evaluate('document.body.innerText')
  assert(text.includes(expectedSource === 'custom' ? '子待办独立白名单' : '跟随全局白名单'))
  await click('按此规则开始')
  await until(async () => (await observe()).focus.session?.title === title, 'native item focus')
  assert.equal((await policy()).source, expectedSource)
}
async function external(packageName, blocked) {
  if (packageName === 'com.android.settings') command('shell', 'am', 'start', '-a', 'android.settings.SETTINGS')
  else command('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'about:blank', '-p', packageName)
  await until(() => blocked ? /topResumedActivity=.*FocusBlockActivity/.test(foreground())
    : new RegExp('topResumedActivity=.*' + packageName.replaceAll('.', '\\.')).test(foreground()), packageName + (blocked ? ' blocked' : ' allowed'))
  await delay(350)
  assert.equal(/topResumedActivity=.*FocusBlockActivity/.test(foreground()), blocked)
}
async function finish() {
  await native('focusAction', { action: 'finish' })
  await native('restAction', { action: 'exit' })
  await tasks()
}
try {
  await native('focusAction', { action: 'finish' })
  await native('restAction', { action: 'exit' })
  const data = emptyData()
  data.preferences = { ...data.preferences, sound: false, vibration: false,
    protection: { ...defaultProtection(), study: true, globalWhitelist: ['com.android.settings'] } }
  data.themes.push({ id: 'study', name: 'Study', color: '#ef4e36', order: 0, collapsed: false })
  for (const [order, title] of ['Reading', 'Math'].entries()) data.items.push({
    id: title.toLowerCase(), themeId: 'study', title, note: '', mode: 'stopwatch', minutes: 25, order,
  })
  await native('replaceData', { data })
  await tasks()
  await until(async () => (await native('protectionStatus')).connected, 'actual accessibility connection')
  await editReading('custom', ['com.android.chrome'])
  const saved = (await native('loadData')).data
  assert.deepEqual(saved.items[0].whitelist, { source: 'custom', packages: ['com.android.chrome'] })
  await begin('Reading', 'custom')
  assert.deepEqual((await policy()).whitelist, ['com.android.chrome', qa.appId])
  await external('com.android.chrome', false)
  await external('com.android.settings', true)
  command('shell', 'uiautomator', 'dump', '/data/local/tmp/qa-item-block.xml')
  assert(command('shell', 'cat', '/data/local/tmp/qa-item-block.xml').includes('Reading'))
  results.push({ scenario: 'edit-save-start-independent-list-controls-real-apps', passed: true })

  saved.preferences.protection.globalWhitelist = ['com.android.settings', 'missing.latest.global']
  await native('saveData', { data: saved })
  await tasks()
  await editReading('global')
  assert.deepEqual((await policy()).whitelist, ['com.android.chrome', qa.appId])
  await external('com.android.settings', true)
  results.push({ scenario: 'global-edit-and-restore-following-leave-current-round-frozen', passed: true })
  await finish()
  await begin('Reading', 'global')
  assert.deepEqual((await policy()).whitelist, ['com.android.settings', 'missing.latest.global', qa.appId])
  await external('com.android.settings', false)
  await external('com.android.chrome', true)
  results.push({ scenario: 'restored-following-uses-latest-global-next-round', passed: true })
  await finish()
  await begin('Math', 'global')
  assert.deepEqual((await policy()).whitelist, ['com.android.settings', 'missing.latest.global', qa.appId])
  results.push({ scenario: 'second-legacy-item-inherits-global', passed: true })
  await finish()
  await editReading('custom', [])
  assert.deepEqual((await native('loadData')).data.items[0].whitelist, { source: 'custom', packages: [] })
  await begin('Reading', 'custom')
  assert.deepEqual((await policy()).whitelist, [qa.appId])
  await external('com.android.chrome', true)
  await external('com.android.settings', true)
  results.push({ scenario: 'saved-empty-independent-list-only-keeps-fixed-exceptions', passed: true })
  await finish()
  await qa.screenshot('after-item-whitelist-matrix')
  qa.save('results.json', { serial: qa.serial, appId: qa.appId, results })
  console.log(JSON.stringify({ serial: qa.serial, results }))
} finally {
  await native('focusAction', { action: 'finish' }).catch(() => {})
  await native('restAction', { action: 'exit' }).catch(() => {})
  qa.close()
}
