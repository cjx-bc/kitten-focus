// Actual Android Settings departure/launcher return; diagnostic refresh remains product driven.
import assert from 'node:assert/strict'
import { connectQa, until } from './lib/android-qa.mjs'
import { capturePrivateBaseline } from './lib/qa-private-baseline.mjs'
import { defaultProtection } from '../src/domain/model.ts'

const output = process.env.QA_OUTPUT || 'artifacts/focus-control/api36/permission-return'
let qa = await connectQa({ port: 9266, output })
const privateBaseline = await capturePrivateBaseline(qa, { port: 9266, output }); qa = privateBaseline.qa
const native = (...args) => qa.native(...args), command = (...args) => qa.command(...args)
const service = qa.appId + '/com.xiaomao.focus.FocusAccessibilityService'
const baseline = { data: (await native('loadData')).data,
  services: command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
  enabled: command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim() }
const others = baseline.services === 'null' ? [] : baseline.services.split(':').filter(value => value && value !== service)
const secure = (key, value) => command('shell', 'settings', value === 'null' ? 'delete' : 'put', 'secure', key, ...(value === 'null' ? [] : [value]))
const row = () => qa.evaluate('document.querySelector("[data-capability=applications]")?.innerText || ""')
const click = label => qa.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled); if (!b) throw new Error('Missing enabled ' + ${JSON.stringify(label)}); b.click() })()`)
async function systemDeparture() {
  await qa.evaluate('document.querySelector("[data-capability=applications] button").click()')
  await until(() => qa.evaluate('[...document.querySelectorAll("dialog[open] button")].some(b => b.textContent.trim() === "前往系统授权")'), 'actual permission purpose Sheet')
  await click('前往系统授权')
  await until(() => /topResumedActivity=.*com\.android\.settings/.test(command('shell', 'dumpsys', 'activity', 'activities')), 'actual system authorization screen')
}
async function launcherReturn() {
  command('shell', 'input', 'keyevent', 'HOME')
  command('shell', 'monkey', '-p', qa.appId, '-c', 'android.intent.category.LAUNCHER', '1')
  await until(() => /topResumedActivity=.*com\.xiaomao\.focus\.qa/.test(command('shell', 'dumpsys', 'activity', 'activities')), 'real launcher returns to the app')
  assert.equal(await qa.evaluate('location.hash'), '#/permissions', 'The mounted diagnostics survive the actual Settings round trip')
}
qa.save('baseline.json', baseline)
try {
  assert.equal((await native('observeControl')).owner, null, 'Only run with idle QA data')
  assert.equal((await native('getLauncherStatus')).componentState, 0, 'Real launcher return requires the unmodified default alias')
  secure('enabled_accessibility_services', others.length ? others.join(':') : 'null')
  if (!others.length) secure('accessibility_enabled', '0')
  await until(async () => !(await native('protectionStatus')).connected, 'QA accessibility actually disconnected')
  const data = structuredClone(baseline.data)
  data.preferences.protection = { ...defaultProtection(), ...data.preferences.protection, study: true }
  await native('replaceData', { data }); await qa.evaluate("location.hash = '#/permissions'"); await qa.send('Page.reload')
  await until(() => qa.evaluate('!!document.querySelector("[data-capability=applications]")'), 'mounted diagnostics are available')
  await qa.evaluate('document.querySelector("[data-capability=applications]").open = true')
  await until(() => row().then(text => text.includes('未连接') && text.includes('未就绪')), 'mounted diagnostic initially reports missing authorization and connection')
  qa.save('before.json', { native: await native('protectionStatus'), text: await row() }); await qa.screenshot('01-unavailable')

  await systemDeparture()
  secure('enabled_accessibility_services', [...others, service].join(':')); secure('accessibility_enabled', '1')
  await until(() => command('shell', 'dumpsys', 'accessibility').includes(service), 'system exposes the selected QA accessibility service')
  await launcherReturn()
  await until(async () => { const value = await native('protectionStatus'); return value.authorized && value.connected }, 'native actually authorized and bound after return')
  await until(() => row().then(text => text.includes('已就绪') && text.includes('已连接') && !text.includes('未连接')), 'product automatically refreshes positive authorization and connection without reload/recheck')
  qa.save('authorized.json', { native: await native('protectionStatus'), text: await row() }); await qa.screenshot('02-returned-authorized')

  await systemDeparture()
  secure('enabled_accessibility_services', others.length ? others.join(':') : 'null')
  if (!others.length) secure('accessibility_enabled', '0')
  await launcherReturn()
  await until(async () => !(await native('protectionStatus')).connected, 'native actually disconnected after revocation')
  await until(() => row().then(text => text.includes('未连接') && text.includes('未就绪') && !text.includes('保护中')), 'product automatically refreshes revoked authorization and connection')
  qa.save('revoked.json', { native: await native('protectionStatus'), text: await row() }); await qa.screenshot('03-returned-revoked')
  const result = { passed: true, scenario: 'real-purpose-Sheet-Settings-launcher-return-refreshes-authorized-and-revoked-state', permissionChange: 'ADB changes only the QA service fixture while the actual Settings screen is foreground', refresh: 'No reload, manual recheck or native mutation after launcher return' }
  qa.save('results.json', result); console.log(JSON.stringify(result))
} catch (error) { qa.save('failure.json', { message: error.stack, native: await native('protectionStatus'), text: await row() }); await qa.screenshot('failure'); throw error }
finally {
  command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
  await native('replaceData', { data: baseline.data }); await qa.evaluate("location.hash = '#/tasks'"); await qa.send('Page.reload')
  secure('enabled_accessibility_services', baseline.services); secure('accessibility_enabled', baseline.enabled)
  assert.deepEqual((await native('loadData')).data, baseline.data, 'Exact QA baseline restored')
  qa = await privateBaseline.restore(qa)
  qa.close()
}
