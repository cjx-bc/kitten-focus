// Isolated QA app: real configuration UI, public CatFocus bridge and Android effects.
import assert from 'node:assert/strict'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, until } from './lib/android-qa.mjs'

const qa = await connectQa({ port: 9252, output: 'artifacts/focus-control/api36/strict-lock' })
const { native, evaluate, command } = qa
const observe = () => native('observeControl')
const baseline = {
  services: command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
  enabled: command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim(),
  notifications: /android.permission.POST_NOTIFICATIONS: granted=true/.test(command('shell', 'dumpsys', 'package', qa.appId)),
  data: (await native('loadData')).data,
}
const click = label => evaluate(`(() => {
  const el = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)});
  if (!el) throw new Error('Missing control: ' + ${JSON.stringify(label)}); el.click();
})()`)
const text = () => evaluate('document.body.innerText')
const rejected = async (method, options) => assert.rejects(native(method, options), undefined, method + ' must be rejected')
async function page() {
  command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
  await evaluate("location.hash = '#/lock'")
  await qa.send('Page.reload')
  await until(() => evaluate("document.querySelector('h1')?.textContent === '独立锁机'"), 'lock page')
}
async function chrome(blocked) {
  command('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'about:blank', '-p', 'com.android.chrome')
  await until(() => {
    const activities = command('shell', 'dumpsys', 'activity', 'activities')
    return blocked ? /topResumedActivity=.*FocusBlockActivity/.test(activities)
      : /topResumedActivity=.*com.android.chrome/.test(activities)
  }, blocked ? 'Chrome blocked by strict lock' : 'Chrome allowed after recovery')
}
let id, startedAt
try {
  assert.equal((await observe()).owner, null, 'Finish previous QA work before this smoke')
  const data = emptyData()
  data.preferences.protection = { ...defaultProtection(), globalWhitelist: ['com.android.settings'] }
  await native('replaceData', { data })
  const own = qa.appId + '/com.xiaomao.focus.FocusAccessibilityService'
  const services = baseline.services === 'null' ? [] : baseline.services.split(':').filter(Boolean)
  command('shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', [...new Set([...services, own])].join(':'))
  command('shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1')
  command('shell', 'pm', 'grant', qa.appId, 'android.permission.POST_NOTIFICATIONS')
  await until(async () => (await native('protectionStatus')).connected, 'actual accessibility connection')
  await page(); await click('新建锁机配置')
  await until(() => evaluate("!!document.querySelector('dialog[open] input[maxlength]')"), 'configuration form')
  await evaluate(`(() => {
    const name = document.querySelector('dialog[open] input[maxlength]'); name.value = 'Strict reading'; name.dispatchEvent(new Event('input',{bubbles:true}));
    const minutes = document.querySelector('dialog[open] input[type=number]'); minutes.value = '1'; minutes.dispatchEvent(new Event('input',{bubbles:true}));
    [...document.querySelectorAll('dialog[open] label')].find(el => el.textContent.trim() === '严格锁机').querySelector('input').click();
  })()`)
  await click('保存配置'); await until(() => evaluate("!document.querySelector('dialog[open]')"), 'configuration saved')
  let saved = (await native('loadData')).data.lockConfigurations[0]
  assert.equal(saved.strict, true)
  await page(); await click('开始')
  await until(() => text().then(t => t.includes('开始严格锁机') && t.includes('不能暂停、取消或提前解除')), 'explicit strict start rules')
  await qa.screenshot('strict-lock-start-confirmation')
  await click('暂不开始'); assert.equal((await observe()).owner, null)
  await rejected('startLock', { configurationId: saved.id, strictLockConfirmed: false, strictMode: false })
  await click('开始'); await until(() => text().then(t => t.includes('确认开始锁机')), 'reused start confirmation')
  await click('确认开始锁机')
  await until(async () => (await observe()).owner === 'lock', 'strict native owner')
  const initial = (await observe()).lock.session
  assert.equal(initial.strictMode, true); id = initial.id; startedAt = initial.startedAt
  await until(() => text().then(t => t.includes('严格锁机进行中')), 'strict running page')
  assert.equal(await evaluate("[...document.querySelectorAll('button')].some(el => /^(暂停|取消锁机|提前解除|确认解除)$/.test(el.textContent.trim()))"), false)
  await chrome(true)
  command('shell', 'uiautomator', 'dump', '/data/local/tmp/qa-strict-lock-block.xml')
  const block = command('shell', 'cat', '/data/local/tmp/qa-strict-lock-block.xml')
  assert(block.includes('Strict reading')); assert.equal(block.includes('临时打开'), false)
  assert(block.includes('严格锁机保护中'))
  command('shell', 'input', 'keyevent', '4')
  await until(() => evaluate("location.hash === '#/lock'"), 'block return to same lock')
  // Current preference edits cannot turn off the saved native rule or extend its deadline.
  const edited = (await native('loadData')).data
  edited.lockConfigurations[0].strict = false; edited.lockConfigurations[0].minutes = 2
  await native('saveData', { data: edited })
  for (const phase of ['before-recovery', 'after-recovery']) {
    for (const action of ['pause', 'resume', 'cancel', 'finish']) {
      await rejected('lockAction', { action, confirmed: true })
      await rejected('focusAction', { action })
    }
    await rejected('startLock', { configurationId: saved.id, strictLockConfirmed: true })
    await rejected('startFocus', { session: {} })
    await rejected('startRest', { recordId: 'forged' })
    await rejected('replaceData', { data: edited })
    const current = (await observe()).lock.session
    assert.equal(current.id, id); assert.equal(current.strictMode, true); assert.equal(current.targetMs, 60000)
    assert.equal(current.startedAt, startedAt)
    if (phase === 'before-recovery') {
      await click('帮助与故障恢复')
      await until(() => text().then(t => t.includes('确认撤销以上本轮保护')), 'recovery reachable')
      assert((await text()).includes('严格锁机'))
      await click('取消，保持现状'); assert.equal((await native('protectionStatus')).active, true)
      await click('帮助与故障恢复'); await until(() => text().then(t => t.includes('确认撤销以上本轮保护')), 'recovery confirmation')
      await click('确认撤销以上本轮保护')
      await until(async () => (await observe()).lock.session.protection.applicationsWithdrawn === true, 'real application protection withdrawn')
      await until(() => text().then(t => t.includes('本次恢复已完成')), 'recovery reports success')
      await click('完成'); await chrome(false); await page()
    }
  }
  // Tap the actual control notification, using its unchanged original package identity.
  command('shell', 'cmd', 'statusbar', 'expand-notifications')
  command('shell', 'uiautomator', 'dump', '/data/local/tmp/qa-strict-lock-notification.xml')
  const shade = command('shell', 'cat', '/data/local/tmp/qa-strict-lock-notification.xml')
  const title = [...shade.matchAll(/<node\b[^>]*>/g)].map(match => match[0]).find(node => /text="Strict reading"/.test(node))
  assert(title, 'Strict lock control notification is visible')
  const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(title)
  command('shell', 'input', 'tap', String(Math.round((Number(bounds[1]) + Number(bounds[3])) / 2)), String(Math.round((Number(bounds[2]) + Number(bounds[4])) / 2)))
  await until(() => evaluate("location.hash === '#/lock'"), 'actual notification return')
  assert.equal((await observe()).lock.session.id, id)
  await qa.send('Page.reload'); await until(() => text().then(t => t.includes('严格锁机进行中')), 'WebView recreation keeps strict lock')
  await qa.screenshot('strict-lock-recovered-running')
  console.log('Waiting for the original one-minute strict deadline')
  await until(async () => (await observe()).owner === null, 'automatic strict lock expiry', 75000)
  await until(() => text().then(t => t.includes('本轮锁机已到期')), 'independent strict result')
  const records = (await native('lockAction', { action: 'read' })).records
  const record = records.find(row => row.id === id)
  assert.equal(record.status, 'completed'); assert.equal(record.durationMs, 60000)
  assert.equal(record.endedAt, startedAt + 60000)
  assert.equal((await native('loadData')).data.records.length, 0)
  assert.equal((await observe()).rest.session, null); assert.equal((await native('previewRecovery')).pending, false)
  await qa.screenshot('strict-lock-completed')
  qa.save('results.json', { serial: qa.serial, appId: qa.appId, id, passed: true,
    scenarios: ['UI-save-reload-explicit-start-cancel-ack', 'real-block-no-escape-controls', 'native-forbidden-controls-before-and-after-recovery',
      'recovery-cancel-real-withdrawal-same-session', 'actual-control-notification-return-WebView-recreation', 'original-deadline-no-focus-statistics-or-rest'] })
  console.log('Strict lock real UI/bridge/OS scenario passed')
} finally {
  if (id) await until(async () => { await native('lockAction', { action: 'read' }); return (await observe()).owner === null }, 'settle QA strict lock before restore', 90000).catch(() => {})
  if (baseline.data) await native('replaceData', { data: baseline.data }).catch(() => {})
  for (const [key, value] of [['enabled_accessibility_services', baseline.services], ['accessibility_enabled', baseline.enabled]])
    command('shell', 'settings', value === 'null' ? 'delete' : 'put', 'secure', key, ...(value === 'null' ? [] : [value]))
  if (!baseline.notifications) command('shell', 'pm', 'revoke', qa.appId, 'android.permission.POST_NOTIFICATIONS')
  qa.close()
}
