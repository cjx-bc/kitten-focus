// Thin drivers for real QA WebView controls; no Vue/store access or replacement app logic.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { emptyData } from '../../src/domain/model.ts'
import { connectQa, until } from './android-qa.mjs'

export async function runQaUi({ output, port }, exercise) {
  const qa = await connectQa({ output, port })
  const results = [], startedAt = new Date().toISOString()
  let baseline, fixtureInstalled = false, failure, cleanupCompleted = false
  const ui = {
    qa, results,
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
    }
    assert.match(identity.installedApkSha256, /^[a-f0-9]{64}$/)
    const data = emptyData()
    data.preferences.sound = false; data.preferences.vibration = false
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
        await qa.native('replaceData', { data: baseline })
        await qa.send('Page.reload')
        assert.deepEqual((await qa.native('loadData')).data, baseline, 'Restore exact QA business baseline')
      }
      cleanupCompleted = true
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'UI acceptance and QA restoration failed') : error
    }
    qa.save('results.json', { ...identity, startedAt, finishedAt: new Date().toISOString(),
      complete: !failure, cleanupCompleted, results,
      ...(failure ? { failure: failure.message } : {}) })
    qa.close()
  }
  if (failure) throw failure
}
