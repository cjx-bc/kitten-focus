// Isolated QA application only. Real WebView UI, CatFocus bridge and Android foreground effects.
import assert from 'node:assert/strict'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'

const qa = await connectQa({ port: 9249, output: 'artifacts/focus-control/api36/ordinary-lock' })
const { native, evaluate, command } = qa
const observe = () => native('observeControl')
const baseline = {
  services: command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
  enabled: command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim(),
  data: (await native('loadData')).data,
}
const results = []
const click = label => evaluate(`(() => {
  const el = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)});
  if (!el) throw new Error('Missing control: ' + ${JSON.stringify(label)}); el.click();
})()`)
const text = () => evaluate('document.body.innerText')
const page = async () => {
  command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
  await evaluate("location.hash = '#/lock'")
  await qa.send('Page.reload')
  await until(() => evaluate("document.querySelector('h1')?.textContent === '独立锁机'"), 'lock page')
}
const foreground = () => command('shell', 'dumpsys', 'activity', 'activities')
async function external(packageName, blocked) {
  if (packageName === 'com.android.settings') command('shell', 'am', 'start', '-a', 'android.settings.SETTINGS')
  else command('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'about:blank', '-p', packageName)
  await until(() => blocked ? /topResumedActivity=.*FocusBlockActivity/.test(foreground())
    : new RegExp('topResumedActivity=.*' + packageName.replaceAll('.', '\\.')).test(foreground()), packageName + (blocked ? ' blocked' : ' allowed'))
}
async function start() {
  await click('开始'); await until(() => text().then(t => t.includes('确认开始锁机')), 'start confirmation')
  await click('确认开始锁机'); await until(async () => (await observe()).owner === 'lock', 'lock owner')
  await until(() => text().then(t => t.includes('提前解除')), 'active control')
}
try {
  const owner = (await observe()).owner
  assert.equal(owner, null, 'Finish previous QA scenario before this smoke')
  const data = emptyData()
  data.preferences.protection = { ...defaultProtection(), globalWhitelist: ['com.android.settings'] }
  await native('replaceData', { data })
  const own = qa.appId + '/com.xiaomao.focus.FocusAccessibilityService'
  const services = baseline.services === 'null' ? [] : baseline.services.split(':').filter(Boolean)
  command('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...new Set([...services, own])].join(':'))
  command('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1')
  await until(async () => (await native('protectionStatus')).connected, 'actual accessibility connection')
  await page(); await click('新建锁机配置')
  await until(() => evaluate("!!document.querySelector('dialog[open] input[maxlength]')"), 'config sheet')
  await evaluate(`(() => {
    const name = document.querySelector('dialog[open] input[maxlength]'); name.value = 'Reading lock'; name.dispatchEvent(new Event('input',{bubbles:true}));
    const minutes = document.querySelector('dialog[open] input[type=number]'); minutes.value = '1'; minutes.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('dialog[open] input[type=checkbox]').click();
  })()`)
  await click('编辑独立白名单 · 1 个应用')
  await until(() => evaluate("!!document.querySelector('.app-choices input')"), 'installed apps')
  await evaluate("document.querySelector('.app-choices').closest('form').querySelector('.switch input').click()")
  await evaluate("document.querySelectorAll('.app-choice input:checked:not(:disabled)').forEach(el=>el.click())")
  await click('确认白名单'); await click('保存配置')
  await until(() => evaluate("!document.querySelector('dialog[open]')"), 'saved config')
  const saved = (await native('loadData')).data.lockConfigurations[0]
  assert.deepEqual(saved.whitelist, { source: 'custom', packages: [] })
  await start()
  assert.deepEqual((await observe()).lock.session.protection.whitelist, [qa.appId])
  await external('com.android.chrome', true)
  command('shell', 'uiautomator', 'dump', '/data/local/tmp/qa-lock-block.xml')
  assert(command('shell', 'cat', '/data/local/tmp/qa-lock-block.xml').includes('Reading lock'))
  command('shell', 'input', 'keyevent', '4')
  await until(() => evaluate("location.hash === '#/lock'"), 'block return to lock')
  await click('提前解除'); await click('继续锁机')
  assert.equal((await observe()).owner, 'lock')
  await click('提前解除'); await click('确认解除')
  await until(async () => (await observe()).owner === null, 'confirmed early unlock')
  assert.equal((await native('lockAction', {action:'read'})).records[0].status, 'early')
  assert.equal((await native('loadData')).data.records.length, 0)
  assert.equal((await observe()).rest.session, null)
  results.push({scenario:'UI-save-empty-custom-start-real-block-cancel-confirm-return-lock-no-focus-rest',passed:true})

  await click('编辑')
  await until(() => evaluate("!!document.querySelector('dialog[open] input[type=checkbox]')"), 'edit persisted config')
  await evaluate("document.querySelector('dialog[open] input[type=checkbox]').click()")
  await click('保存配置'); await until(() => evaluate("!document.querySelector('dialog[open]')"), 'follow global saved')
  await page(); await start()
  assert.deepEqual((await observe()).lock.session.protection.whitelist, ['com.android.settings',qa.appId])
  await external('com.android.settings', false); await external('com.android.chrome', true)
  await page(); await qa.screenshot('ordinary-lock-running')
  console.log('Waiting for one-minute ordinary lock expiry')
  await until(async () => (await observe()).owner === null, 'automatic ordinary lock expiry', 75000)
  await until(() => text().then(t => t.includes('本轮锁机已到期')), 'independent expiry result')
  const final = await native('lockAction',{action:'read'})
  assert.equal(final.records[0].status, 'completed'); assert.equal(final.records[0].durationMs, 60000)
  assert.equal((await native('loadData')).data.records.length, 0); assert.equal((await observe()).rest.session,null)
  assert.equal((await native('previewRecovery')).pending,false)
  await external('com.android.chrome',false)
  command('shell','am','start','-n',qa.appId+'/com.xiaomao.focus.MainActivity','--ez','returnToLock','true')
  await until(() => evaluate("location.hash === '#/lock'"), 'native lock result return')
  await qa.screenshot('ordinary-lock-independent-result')
  results.push({scenario:'UI-reuse-follow-global-real-allow-block-auto-expiry-cleanup-independent-result',passed:true})
  qa.save('results.json',{serial:qa.serial,appId:qa.appId,results})
  console.log(JSON.stringify({serial:qa.serial,results}))
} finally {
  await native('lockAction',{action:'finish',confirmed:true}).catch(()=>{})
  if (baseline.data) await native('replaceData',{data:baseline.data}).catch(()=>{})
  for(const [key,value] of [['enabled_accessibility_services',baseline.services],['accessibility_enabled',baseline.enabled]])
    command('shell','settings',value === 'null' ? 'delete' : 'put','secure',key,...(value === 'null' ? [] : [value]))
  qa.close()
}
