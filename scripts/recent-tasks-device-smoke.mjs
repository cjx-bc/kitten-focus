// Isolated QA app. Screenshots/XML of actual launcher overview supplement AppTask flags.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, until, delay } from './lib/android-qa.mjs'
import { androidDevice } from './lib/android-device.mjs'

const output = 'artifacts/focus-control/api36/recent-tasks'
const qa = await connectQa({ port: 9255, output })
const { command, native } = qa
const { adb, serial } = androidDevice(resolve(import.meta.dirname, '..'))
const directory = resolve(import.meta.dirname, '..', output)
mkdirSync(directory, { recursive: true })
const baseline = (await native('loadData')).data
const permission = /android.permission.POST_NOTIFICATIONS: granted=true/.test(command('shell', 'dumpsys', 'package', qa.appId))
const observe = () => native('observeControl')
const front = () => command('shell', 'am', 'start', '-n', qa.appId + '/com.xiaomao.focus.MainActivity')
const label = process.env.RECENTS_QA_LABEL || '小猫专注'
async function replaceFixture(data) {
  await native('replaceData', { data })
  await qa.send('Page.reload')
  await until(() => qa.evaluate('!!document.querySelector(".tabbar") && !document.querySelector(".boot")'), 'fixture loaded into the real app store')
}

async function overview(name, visible) {
  command('shell', 'input', 'keyevent', '3'); await delay(400)
  command('shell', 'input', 'keyevent', '187'); await delay(900)
  const remote = '/data/local/tmp/qa-recents.xml'
  command('shell', 'uiautomator', 'dump', remote)
  const xml = command('shell', 'cat', remote)
  writeFileSync(resolve(directory, name + '.xml'), xml)
  writeFileSync(resolve(directory, name + '.png'), execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true }))
  writeFileSync(resolve(directory, name + '-tasks.txt'), command('shell', 'dumpsys', 'activity', 'recents'))
  // A failure is evidence to inspect, never a reason to claim a successful Android effect.
  assert.equal(xml.includes(label), visible, `Actual overview card ${name}; inspect screenshot/XML if another installed app has the same label`)
}
function session() {
  return { id: 'recent-tasks-' + Date.now(), itemId: null, themeId: null, title: '任务卡真实界面验证', themeName: '自由专注',
    color: '#222222', mode: 'stopwatch', targetMs: 60000, startedAt: Date.now(), timeZone: 'UTC', state: 'running',
    elapsedMs: 0, pausedMs: 0, segments: [] }
}
try {
  assert.equal((await observe()).owner, null, 'Finish preceding QA work first')
  command('shell', 'pm', 'grant', qa.appId, 'android.permission.POST_NOTIFICATIONS')
  const data = emptyData(); data.preferences.protection = { ...defaultProtection(), enhancements: [] }
  await replaceFixture(data); front()
  await overview('01-original-visible', true); front()
  await native('startFocus', { session: session() }); await delay(300)
  assert.equal((await native('getRecentTasksStatus')).requested, false)
  await overview('02-disabled-visible', true); front()
  await native('focusAction', { action: 'finish' }); await native('restAction', { action: 'exit' })
  data.preferences.protection.enhancements = ['recentTasksHidden']
  await replaceFixture(data); await native('startFocus', { session: session() })
  await until(async () => {
    await native('focusAction', { action: 'read' })
    return (await native('getRecentTasksStatus')).phase === 'active'
  }, 'verified own-task exclusion')
  qa.save('active.json', await observe())
  await overview('03-enabled-hidden', false); front()
  await native('focusAction', { action: 'pause' }); await overview('04-paused-hidden', false); front()
  const preview = await native('previewRecovery'); qa.save('recovery-before.json', preview)
  assert(preview.steps.some(step => step.capability === 'recentTasksHidden' && step.status === 'active'))
  await native('confirmRecovery', { revision: preview.revision })
  assert.equal((await native('getRecentTasksStatus')).phase, 'withdrawn')
  await overview('05-recovered-visible', true); front()
  await native('focusAction', { action: 'resume' }); await native('focusAction', { action: 'read' })
  assert.equal((await native('getRecentTasksStatus')).phase, 'withdrawn', 'Explicit recovery must not re-hide this round')
  await native('focusAction', { action: 'finish' })
  assert.equal((await observe()).owner, 'rest')
  await native('restAction', { action: 'exit' })
  await native('startFocus', { session: session() }); await native('focusAction', { action: 'read' })
  await until(async () => (await native('getRecentTasksStatus')).active, 'next round hiding')
  await native('focusAction', { action: 'finish' })
  assert.equal((await native('getRecentTasksStatus')).phase, 'restored')
  await overview('06-finished-visible', true); front()
  qa.save('final.json', { control: await observe(), recentTasks: await native('getRecentTasksStatus') })
  console.log('PASS actual overview: disabled, enabled, pause, explicit recovery, no reactivation, next round and finish/rest')
} finally {
  front()
  const current = await observe()
  if (current.owner === 'focus') await native('focusAction', { action: 'finish' })
  await native('restAction', { action: 'exit' })
  const recovery = await native('previewRecovery')
  if (recovery.pending) await native('confirmRecovery', { revision: recovery.revision })
  if (baseline) await native('replaceData', { data: baseline })
  if (!permission) command('shell', 'pm', 'revoke', qa.appId, 'android.permission.POST_NOTIFICATIONS')
  qa.close()
}
