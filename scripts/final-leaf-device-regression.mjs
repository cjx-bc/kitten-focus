// Explicitly leased QA device only. A complete private baseline surrounds each phase.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa } from './lib/android-qa.mjs'
import { capturePrivateBaseline } from './lib/qa-private-baseline.mjs'

const phase = process.argv[2]
assert(['study', 'legacy', 'scroll', 'original', 'lifecycle'].includes(phase), 'Choose study, legacy, scroll, original or lifecycle')
const project = 'E:/codexseeson/fanqiezhong'
const output = process.env.QA_EVIDENCE_ROOT || join(project, 'artifacts/focus-control/final-leaf', phase)
const port = 9276
let qa = await connectQa({ output, port })
const system = () => Object.fromEntries(['enabled_accessibility_services', 'accessibility_enabled', 'enabled_notification_listeners']
  .map(key => [key, qa.command('shell', 'settings', 'get', 'secure', key).trim()]))
const before = system(), baseline = await capturePrivateBaseline(qa, { output, port })
qa = baseline.qa
let passed = false
const groups = []
const command = (program, args, cwd) => new Promise((resolve, reject) => {
  const process = spawn(program, args, { cwd, env: globalThis.process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  process.stdout.on('data', data => globalThis.process.stdout.write(data))
  process.stderr.on('data', data => globalThis.process.stderr.write(data))
  process.on('error', reject)
  process.on('exit', code => code === 0 ? resolve() : reject(new Error(program + ' failed: ' + code)))
})
const plan = async group => {
  let value = ''
  const child = spawn('python', ['scripts/final-native-plan.py', '--group', group], { windowsHide: true })
  child.stdout.on('data', data => { value += data })
  await new Promise((resolve, reject) => { child.on('exit', code => code === 0 ? resolve() : reject(new Error('Source plan failed'))); child.on('error', reject) })
  return JSON.parse(value)
}
try {
  const fixture = emptyData(); fixture.preferences.sound = false; fixture.preferences.vibration = false; fixture.preferences.protection = defaultProtection()
  await qa.native('replaceData', { data: fixture })
  await qa.send('Page.reload'); qa.close()
  if (['study', 'legacy', 'scroll'].includes(phase)) {
    for (const group of phase !== 'study' ? ['legacy-ui'] : ['study-policy', 'study-denied', 'study-enabled', 'legacy-ui']) {
      const source = await plan(group)
      if (phase === 'scroll') {
        source.entries = source.entries.filter(entry => entry.selector.endsWith('.ScrollLayoutTest'))
        source.className = source.entries.map(entry => entry.selector).join(',')
        source.expectedTests = source.entries.reduce((sum, entry) => sum + entry.tests.length, 0)
      }
      groups.push(source)
      await command('python', ['scripts/run-final-study-tests.py', '--group', group, '--output', join(output, group), ...(phase === 'scroll' ? ['--scroll-only'] : [])])
    }
  } else {
    const group = phase === 'original' ? 'notification-original' : 'notification-lifecycle'
    const source = await plan(group)
    groups.push(source)
    const args = [join(project, 'scripts/notification-device-test.py'), '--output', output, '--classes', source.className,
      '--expected-tests', String(source.expectedTests), '--timeout', phase === 'lifecycle' ? '540' : '180']
    if (phase === 'lifecycle') args.push('--lifecycle')
    if (process.env.QA_OBSERVED_NOTIFICATION_TAP) {
      assert.equal(process.env.QA_OBSERVED_NOTIFICATION_TAP, '200,420')
      args.push('--observed-tap', '200,420')
    }
    await command('python', args, project)
    const raw = readFileSync(join(output, 'instrumentation.txt'), 'utf8')
    assert(!/INSTRUMENTATION_STATUS_CODE: -[34]\b/.test(raw), 'Zero skipped device cases required')
  }
  passed = true
} finally {
  qa = await connectQa({ output, port })
  assert.equal((await qa.native('observeControl')).owner, null, 'Retain failed active fixture for inspection')
  assert.equal((await qa.native('previewRecovery')).pending, false, 'Retain unresolved system duty for inspection')
  assert.deepEqual(system(), before, 'System listeners and accessibility settings exactly restored')
  qa = await baseline.restore(qa)
  qa.save('leaf-summary.json', { phase, passed, zeroSkips: passed, cleanupCompleted: true,
    groups: groups.map(group => ({ group: group.group, expectedTests: group.expectedTests, className: group.className })),
    note: 'Notification original and lifecycle each include the same 22 FocusNotificationTest cases; count those once.' })
  qa.close()
}
