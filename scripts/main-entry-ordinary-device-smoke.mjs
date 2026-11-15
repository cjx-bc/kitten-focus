// Narrow real-UI supplement to the separately executed strict/cold-start groups.
import assert from 'node:assert/strict'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, until } from './lib/android-qa.mjs'

const qa = await connectQa({ port: 9266, output: process.env.QA_OUTPUT || 'artifacts/focus-control/api36/main-entry-ordinary' })
const { command, native, evaluate } = qa
const baseline = { data: (await native('loadData')).data,
  services: command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
  enabled: command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim() }
const service = qa.appId + '/com.xiaomao.focus.FocusAccessibilityService'
const others = baseline.services === 'null' ? [] : baseline.services.split(':').filter(value => value && value !== service)
const route = async path => { await evaluate(`location.hash = ${JSON.stringify('#' + path)}`); await until(() => evaluate(`location.hash === ${JSON.stringify('#' + path)}`), 'route ' + path) }
const click = label => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)} && !button.disabled); if (!button) throw new Error('Missing enabled ' + ${JSON.stringify(label)}); button.click() })()`)
qa.save('baseline.json', baseline)
try {
  assert.equal((await native('observeControl')).owner, null)
  command('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...others, service].join(':'))
  command('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1')
  await until(async () => (await native('protectionStatus')).connected, 'actual service bound')
  const data = emptyData(); data.preferences.sound = false; data.preferences.vibration = false
  data.preferences.protection = { ...defaultProtection(), enhancements: [] }
  data.lockConfigurations = [{ id: 'ordinary-entry', name: '普通锁机入口验证', minutes: 1, strict: false, whitelist: { source: 'global' } }]
  await native('replaceData', { data }); await evaluate("location.hash = '#/tasks'"); await qa.send('Page.reload')
  await until(() => evaluate('!!document.querySelector(".tabbar") && !document.querySelector(".boot")'), 'fixture loaded into app store')
  await native('startLock', { configurationId: 'ordinary-entry' })
  await route('/settings'); await native('lockAction', { action: 'finish', confirmed: true })
  data.preferences.protection.enhancements = ['lockMainInterfaceRestricted']
  await native('saveData', { data }); await native('startLock', { configurationId: 'ordinary-entry' })
  await evaluate("location.hash = '#/tasks'"); await until(() => evaluate("location.hash === '#/lock'"), 'selected ordinary lock redirects business')
  await until(() => evaluate('[...document.querySelectorAll("button")].some(button => button.textContent.trim() === "提前解除")'), 'ordinary lock controls rendered')
  await click('提前解除')
  await until(() => evaluate('[...document.querySelectorAll("dialog[open] button")].some(button => button.textContent.trim() === "确认解除" && !button.disabled)'), 'ordinary unlock confirmation rendered')
  await click('确认解除'); await until(async () => (await native('observeControl')).owner === null, 'actual ordinary unlock')
  await route('/settings'); await qa.screenshot('ordinary-confirmed-unlock-restores-settings')
  qa.save('results.json', { passed: true, scenario: 'unselected ordinary lock allows business; selected next round redirects; real confirmation unlock restores business', observation: await native('observeControl') })
  console.log('PASS real ordinary lock UI: unselected business, selected intercept, confirmed unlock and restored settings')
} catch (error) { qa.save('failure.json', { message: error.stack }); throw error }
finally {
  await native('lockAction', { action: 'finish', confirmed: true })
  await native('replaceData', { data: baseline.data })
  for (const [key, value] of [['enabled_accessibility_services', baseline.services], ['accessibility_enabled', baseline.enabled]]) command('shell', 'settings', value === 'null' ? 'delete' : 'put', 'secure', key, ...(value === 'null' ? [] : [value]))
  qa.close()
}
