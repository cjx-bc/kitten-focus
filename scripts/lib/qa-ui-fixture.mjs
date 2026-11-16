// Thin drivers for real QA WebView controls; no Vue/store access or replacement app logic.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyData, defaultProtection } from '../../src/domain/model.ts'
import { connectQa, until } from './android-qa.mjs'
import { androidDevice } from './android-device.mjs'

export async function runQaUi({ output, port }, exercise) {
  output = process.env.QA_EVIDENCE_ROOT ? join(process.env.QA_EVIDENCE_ROOT, output.split('/').at(-1)) : output
  let qa = await connectQa({ output, port })
  const results = [], startedAt = new Date().toISOString()
  let baseline, fixtureInstalled = false, failure, cleanupCompleted = false
  let privateArchive, privateHashes, privateDirectory, systemBefore
  const digest = value => createHash('sha256').update(value).digest('hex')
  const { adb } = androidDevice(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  const privateCommand = (...args) => execFileSync(adb, ['-s', qa.serial, ...args], { windowsHide: true, timeout: 30000, maxBuffer: 64 * 1024 * 1024 })
  const fileHashes = () => privateCommand('shell', `run-as ${qa.appId} sh -c 'find databases shared_prefs -type f | sort | xargs sha256sum'`).toString('utf8').trim()
  const systemState = () => ({
    accessibility: qa.command('shell', 'settings', 'get', 'secure', 'enabled_accessibility_services').trim(),
    accessibilityEnabled: qa.command('shell', 'settings', 'get', 'secure', 'accessibility_enabled').trim(),
    listeners: qa.command('shell', 'settings', 'get', 'secure', 'enabled_notification_listeners').trim(),
    wallpaperIds: qa.command('shell', 'dumpsys', 'wallpaper').split('\n').filter(line => /mWallpaperId=|mWhich=|mWallpaperComponent=/.test(line)).map(line => line.trim()),
  })
  const ui = {
    get qa() { return qa }, results,
    text: () => qa.evaluate('document.body.innerText'),
    click: label => qa.evaluate(`(() => {
      const dialogs = [...document.querySelectorAll('dialog[open]')];
      const scope = dialogs.at(-1) || document;
      const button = [...scope.querySelectorAll('button')].find(el =>
        el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)});
      if (!button || button.disabled) throw new Error('Missing/enabled QA control: ' + ${JSON.stringify(label)});
      button.click();
    })()`),
    fill: (label, value) => qa.evaluate(`(() => {
      const dialogs = [...document.querySelectorAll('dialog[open]')];
      const scope = dialogs.at(-1) || document;
      const row = [...scope.querySelectorAll('label')].find(el => el.textContent.trim().startsWith(${JSON.stringify(label)}));
      const input = row?.querySelector('input,textarea,select');
      if (!input) throw new Error('Missing QA field: ' + ${JSON.stringify(label)});
      const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(String(value))});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`),
    waitText: value => until(async () => (await ui.text()).includes(value), value),
    route: async path => {
      await qa.evaluate(`location.hash = ${JSON.stringify('#' + path)}`)
      await until(() => qa.evaluate(`location.hash === ${JSON.stringify('#' + path)}`), path)
      await until(() => qa.evaluate(`!!document.querySelector('.tabbar a[href="#${path}"][aria-current="page"]')`), path + ' Vue navigation settled')
    },
    closedSheet: () => until(() => qa.evaluate('!document.querySelector("dialog[open]")'), 'sheet closed'),
    pass: (scenario, evidence = {}) => {
      results.push({ scenario, passed: true, ...evidence })
      qa.save('results.json', { startedAt, complete: false, cleanupCompleted: false, results })
      console.log('PASS ' + scenario)
    },
  }
  let identity
  try {
    const state = await qa.native('observeControl')
    assert.equal(state.owner, null, 'Finish existing QA focus/lock/rest before this fixture')
    assert.equal((await qa.native('previewRecovery')).pending, false, 'Resolve existing QA recovery duty first')
    baseline = (await qa.native('loadData')).data
    const apkPath = qa.command('shell', 'pm', 'path', qa.appId).trim().split('\n').find(line => line.startsWith('package:'))?.slice(8).trim()
    assert(apkPath, 'Installed QA APK identity must be available')
    identity = {
      serial: qa.serial, appId: qa.appId,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8', windowsHide: true }).trim(),
      installedApkSha256: qa.command('shell', 'sha256sum', apkPath).trim().split(/\s+/)[0],
      api: qa.command('shell', 'getprop', 'ro.build.version.sdk').trim(),
      installedSourceScope: process.env.QA_INSTALLED_SOURCE_SCOPE || 'installed APK identity is authoritative; sourceCommit identifies runner checkout only',
    }
    assert.match(identity.installedApkSha256, /^[a-f0-9]{64}$/)
    if (process.env.QA_EXPECTED_APK_SHA256) assert.equal(identity.installedApkSha256, process.env.QA_EXPECTED_APK_SHA256)
    systemBefore = systemState()
    qa.close()
    qa.command('shell', 'am', 'force-stop', qa.appId)
    privateArchive = privateCommand('exec-out', 'run-as', qa.appId, 'tar', 'cf', '-', 'databases', 'shared_prefs')
    privateHashes = fileHashes()
    privateDirectory = mkdtempSync(join(tmpdir(), 'kitten-qa-ui-baseline-'))
    writeFileSync(join(privateDirectory, 'private-baseline.tar'), privateArchive)
    qa = await connectQa({ output, port })
    identity.privateBaselineDigest = digest(privateHashes)
    const data = emptyData()
    data.preferences.sound = false; data.preferences.vibration = false
    data.preferences.protection = defaultProtection()
    await qa.native('replaceData', { data })
    fixtureInstalled = true
    await ui.route('/tasks')
    // Reload ONCE after replacement so Pinia cannot persist the prior QA preferences.
    await qa.send('Page.reload')
    await until(() => qa.evaluate('!!document.querySelector(".study-entry")'), 'initialized fixture')
    await exercise(ui)
  } catch (error) {
    failure = error
    await qa.screenshot('failure').catch(() => {})
  } finally {
    try {
      if (fixtureInstalled) {
        await qa.native('focusAction', { action: 'finish' })
        await qa.native('restAction', { action: 'exit' })
        assert.equal((await qa.native('observeControl')).owner, null)
        assert.equal((await qa.native('previewRecovery')).pending, false)
      }
      if (privateArchive) {
        // Close all SQLite/prefs users before restoring our exact idle baseline.
        qa.close()
        qa.command('shell', 'am', 'force-stop', qa.appId)
        const originalPaths = new Set(privateHashes.split('\n').map(line => line.trim().split(/\s+/).at(-1)))
        const currentPaths = fileHashes().split('\n').map(line => line.trim().split(/\s+/).at(-1))
        for (const path of currentPaths.filter(path => !originalPaths.has(path))) {
          assert(/^(?:databases|shared_prefs)\/[A-Za-z0-9._-]+$/.test(path), 'Refuse unexpected fixture file path')
          qa.command('shell', 'run-as', qa.appId, 'rm', '-f', path)
        }
        execFileSync(adb, ['-s', qa.serial, 'exec-in', 'run-as', qa.appId, 'tar', 'xf', '-'], { input: privateArchive, windowsHide: true, timeout: 30000 })
        // adb exec-in can close its input transport before the remote extraction finishes.
        await until(() => fileHashes() === privateHashes, 'all private baseline files restored after adb input drain', 15000)
        assert.equal(fileHashes(), privateHashes, 'All QA database and preference file bytes restored before restart')
        identity.privateBaselineRestoredDigest = digest(fileHashes())
        qa = await connectQa({ output, port })
        assert.deepEqual((await qa.native('loadData')).data, baseline, 'Restore exact QA public business baseline')
        assert.deepEqual(systemState(), systemBefore, 'System authorization and wallpaper identifiers unchanged')
        await qa.native('syncReminders')
        rmSync(privateDirectory, { recursive: true })
        privateDirectory = null
      }
      cleanupCompleted = true
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'UI acceptance and QA restoration failed') : error
      if (privateDirectory) console.error('Private QA recovery archive retained locally: ' + privateDirectory)
    }
    qa.save('results.json', { ...identity, startedAt, finishedAt: new Date().toISOString(),
      complete: !failure, cleanupCompleted, results,
      ...(failure ? { failure: failure.message, failureDetails: failure instanceof AggregateError ? failure.errors.map(error => error.stack) : failure.stack } : {}) })
    if (!qa.closed) qa.close()
  }
  if (failure) throw failure
}
