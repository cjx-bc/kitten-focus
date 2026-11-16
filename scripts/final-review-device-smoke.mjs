// Final review regressions through real QA UI, bridge and Android Settings.
import assert from 'node:assert/strict'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, until } from './lib/android-qa.mjs'

const qa = await connectQa({ port: 9265, output: 'artifacts/focus-control/api36/final-review' })
const { native, evaluate, command } = qa
const baseline = {
  data: (await native('loadData')).data,
  services: command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
  enabled: command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim(),
}
const results = []
const text = () => evaluate('document.body.innerText')
const click = label => evaluate(`(() => {
  const root = document.querySelector('dialog[open]') || document;
  const el = [...root.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)});
  if (!el) throw new Error('Missing button: ' + ${JSON.stringify(label)}); el.click();
})()`)
const toggle = label => evaluate(`(() => {
  const el = [...document.querySelectorAll('dialog[open] label')].find(el => el.textContent.trim() === ${JSON.stringify(label)});
  if (!el) throw new Error('Missing switch: ' + ${JSON.stringify(label)}); el.querySelector('input').click();
})()`)
async function reload(path) {
  command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
  await evaluate(`location.hash = ${JSON.stringify('#' + path)}`)
  await qa.send('Page.reload')
}
async function seed(data, path) { await native('replaceData', { data }); await reload(path) }
const foreground = () => command('shell', 'dumpsys', 'activity', 'activities')
try {
  assert.equal((await native('observeControl')).owner, null)
  assert.equal((await native('previewRecovery')).pending, false)
  for (const [id, values] of [
    ['notifications', { interceptNotifications: true }],
    ['dnd', { dnd: true }],
    ['mainEntry', { enhancements: ['lockMainInterfaceRestricted'] }],
  ]) {
    const data = emptyData(); data.preferences.protection = { ...defaultProtection(), ...values }
    await seed(data, '/tasks'); await click('自由专注'); await click('开始专注')
    await until(() => evaluate(`!!document.querySelector('.start-capabilities [data-capability="${id}"]')`), id + ' alone opens confirmation')
    assert((await text()).includes('本轮所选保护'))
    assert.equal((await native('observeControl')).owner, null)
    await qa.screenshot('focus-' + id + '-prestart')
    await click('暂不开始')
    results.push({ scenario: id + '-only-focus-shows-selected-capability-before-ownership', passed: true })
  }

  const data = emptyData(); data.preferences.protection = defaultProtection()
  await seed(data, '/lock'); await click('新建锁机配置')
  await evaluate(`(() => {
    const name = document.querySelector('dialog[open] input[maxlength]'); name.value='Independent review'; name.dispatchEvent(new Event('input',{bubbles:true}));
    const minutes = document.querySelector('dialog[open] input[type=number]'); minutes.value='1'; minutes.dispatchEvent(new Event('input',{bubbles:true}));
  })()`)
  await toggle('使用独立增强选项'); await toggle('锁机时限制主界面入口'); await click('保存配置')
  await until(() => evaluate('!document.querySelector("dialog[open]")'), 'saved independent preset')
  let saved = (await native('loadData')).data.lockConfigurations[0]
  assert.deepEqual(saved.enhancements, ['lockMainInterfaceRestricted'])
  await click('编辑'); await toggle('锁机时限制主界面入口'); await click('保存配置')
  await until(() => evaluate('!document.querySelector("dialog[open]")'), 'saved explicit empty preset')
  saved = (await native('loadData')).data.lockConfigurations[0]
  assert.deepEqual(saved.enhancements, [])
  await click('编辑'); await toggle('锁机时限制主界面入口'); await click('保存配置')
  await until(() => evaluate('!document.querySelector("dialog[open]")'), 'resaved independent preset')

  const own = qa.appId + '/com.xiaomao.focus.FocusAccessibilityService'
  const services = baseline.services === 'null' ? [] : baseline.services.split(':').filter(Boolean)
  command('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...new Set([...services, own])].join(':'))
  command('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1')
  await until(async () => (await native('protectionStatus')).connected, 'actual accessibility connection')
  await click('开始')
  await until(() => evaluate("!!document.querySelector('.start-capabilities [data-capability=mainEntry]')"), 'lock selected capability summary')
  await qa.screenshot('lock-preset-prestart')
  await click('确认开始锁机')
  await until(async () => (await native('observeControl')).owner === 'lock', 'lock owner')
  assert.deepEqual((await native('observeControl')).lock.session.originalEnhancedProtectionSettings, ['lockMainInterfaceRestricted'])
  results.push({ scenario: 'real-lock-editor-persists-independent-and-explicit-empty-and-freezes-at-start', passed: true })

  // The fresh instrumentation fixture clears the process-local exception. Prove
  // Settings is blocked before opening this actual authorization route.
  command('shell', 'am', 'start', '-a', 'android.settings.SETTINGS')
  await until(() => /topResumedActivity=.*FocusBlockActivity/.test(foreground()), 'Settings initially restricted')
  command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
  await native('openNotificationAccessSettings')
  await until(() => /topResumedActivity=.*com.android.settings/.test(foreground()), 'actual notification authorization remains foreground')
  qa.save('authorization-foreground.json', { activity: foreground(), owner: (await native('observeControl')).owner })
  assert.equal((await native('observeControl')).owner, 'lock')
  results.push({ scenario: 'ordinary-lock-with-anti-close-off-allows-actual-notification-authorization', passed: true })
  await native('lockAction', { action: 'finish', confirmed: true })
  qa.save('results.json', { serial: qa.serial, appId: qa.appId, results })
  console.log(JSON.stringify(results))
} finally {
  await native('lockAction', { action: 'finish', confirmed: true }).catch(() => {})
  if (baseline.data) await native('replaceData', { data: baseline.data })
  for (const [key, value] of [['enabled_accessibility_services', baseline.services], ['accessibility_enabled', baseline.enabled]])
    command('shell', 'settings', value === 'null' ? 'delete' : 'put', 'secure', key, ...(value === 'null' ? [] : [value]))
  qa.close()
}
