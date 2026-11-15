// Original settings UI + real JSON parser + real native replaceData.
// File export is captured at its public OS-file IPC boundary, not a private Vue method.
import assert from 'node:assert/strict'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, until } from './lib/android-qa.mjs'

const qa = await connectQa({ port: 9248, output: 'artifacts/focus-control/api36/backup-device' })
const { native, evaluate } = qa
const original = (await native('loadData')).data
const results = []
const click = label => evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === ${JSON.stringify(label)});
  if (!button) throw new Error('Missing visible control: ' + ${JSON.stringify(label)});
  button.click();
})()`)
const text = () => evaluate('document.body.innerText')
const restoreReady = () => until(() => evaluate('[...document.querySelectorAll("dialog[open] button")].some(button => button.textContent.trim() === "确认恢复此备份" && !button.disabled)'), 'enabled restoration confirmation')
const importJson = value => evaluate(`(() => {
  const input = document.querySelector('input[aria-label="选择小猫专注备份"]');
  const files = new DataTransfer();
  files.items.add(new File([${JSON.stringify(value)}], 'backup-fixture.json', { type: 'application/json' }));
  input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
})()`)
try {
  assert.equal((await native('observeControl')).owner, null, 'Finish QA controls and rest before backup scenario')
  const fixture = emptyData()
  fixture.preferences.protection = { ...defaultProtection(), strict: true,
    globalWhitelist: ['org.example.missing'], enhancements: [] }
  fixture.lockConfigurations = [
    { id: 'backup-global', name: '全局备份', minutes: 5, strict: true, whitelist: { source: 'global' } },
    { id: 'backup-empty', name: '空名单备份', minutes: 15, whitelist: { source: 'custom', packages: [] } },
  ]
  await native('replaceData', { data: fixture })
  await qa.send('Page.reload')
  await until(() => evaluate('!!document.querySelector(".tabbar")'), 'original UI ready')
  await evaluate("location.hash = '#/settings'")
  await until(() => evaluate("!!document.querySelector('input[aria-label=\"选择小猫专注备份\"]')"), 'backup UI')
  await evaluate(`(() => {
    const original = window.Capacitor.nativePromise.bind(window.Capacitor);
    window.__backupExport = null;
    window.Capacitor.nativePromise = (plugin, method, options, ...rest) => {
      if (plugin === 'CatFocus' && method === 'exportFile') { window.__backupExport = options; return Promise.resolve({}); }
      return original(plugin, method, options, ...rest);
    };
  })()`)
  await click('导出备份')
  const exported = await until(() => evaluate('window.__backupExport'), 'public export file IPC')
  const backup = JSON.parse(exported.text)
  assert.deepEqual(backup.data.lockConfigurations, fixture.lockConfigurations)
  assert.equal(backup.data.preferences.protection.strict, true)
  results.push({ scenario: 'settings-export-serializes-reusable-config-at-public-file-IPC', passed: true })
  const changed = emptyData(); changed.preferences.defaultMinutes = 45
  await native('replaceData', { data: changed })
  await importJson(exported.text)
  await until(async () => (await text()).includes('确认恢复此备份'), 'real JSON parsed and confirmation shown')
  await restoreReady()
  await qa.screenshot('01-valid-confirmation')
  assert.equal((await native('loadData')).data.preferences.defaultMinutes, 45, 'Preview does not overwrite data')
  await click('确认恢复此备份')
  await until(async () => (await native('loadData')).data.lockConfigurations?.length === 2, 'native restoration')
  assert.equal((await native('observeControl')).owner, null)
  assert.deepEqual((await native('loadData')).data.lockConfigurations, fixture.lockConfigurations)
  results.push({ scenario: 'settings-import-validates-confirms-and-restores-without-reactivation', passed: true })
  const restored = (await native('loadData')).data
  await importJson('{invalid-json')
  await until(async () => (await text()).includes('不是有效的 JSON'), 'visible malformed file error')
  assert.deepEqual((await native('loadData')).data, restored)
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "确认恢复此备份")'), false)
  await qa.screenshot('02-malformed-original-retained')
  results.push({ scenario: 'malformed-file-cannot-reuse-previous-preview-or-overwrite-data', passed: true })
  const malicious = JSON.parse(exported.text)
  malicious.data.active = { id: 'forged-lock', kind: 'lock', targetMs: 999999999 }
  malicious.data.preferences.authorized = true
  malicious.data.notificationBody = 'never-persist-this'
  await importJson(JSON.stringify(malicious))
  await until(async () => (await text()).includes('确认恢复此备份'), 'untrusted JSON parsed')
  await restoreReady()
  await click('确认恢复此备份')
  await until(async () => !(await text()).includes('确认恢复此备份'), 'malicious extras safely discarded')
  const safe = (await native('loadData')).data
  assert.equal(safe.active, undefined); assert.equal(safe.notificationBody, undefined)
  assert.equal(safe.preferences.authorized, undefined)
  assert.equal((await native('observeControl')).owner, null)
  results.push({ scenario: 'untrusted-runtime-and-authorization-never-reactivated', passed: true })
  qa.save('result.json', { passed: true, fileBoundary: 'public exportFile IPC capture; import via real File change/parser', results })
  console.log(JSON.stringify({ passed: true, results }, null, 2))
} catch (error) {
  qa.save('failure.json', { message: error.message, visibleErrors: await evaluate('[...document.querySelectorAll(".form-error,[role=alert]")].map(el => el.textContent)'), owner: (await native('observeControl')).owner })
  await qa.screenshot('failure')
  throw error
} finally {
  if (original) await native('replaceData', { data: original })
  await qa.send('Page.reload')
  qa.close()
}
