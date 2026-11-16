// QA fixture preservation only. Product assertions still use the public CatFocus bridge.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectQa, until } from './android-qa.mjs'
import { androidDevice } from './android-device.mjs'

export async function capturePrivateBaseline(qa, { port, output }) {
  assert.equal((await qa.native('observeControl')).owner, null, 'Preserve only an idle QA baseline')
  assert.equal((await qa.native('previewRecovery')).pending, false, 'Resolve preceding QA duties first')
  const data = (await qa.native('loadData')).data
  const { adb } = androidDevice(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  const execute = (...args) => execFileSync(adb, ['-s', qa.serial, ...args], { windowsHide: true, timeout: 30000, maxBuffer: 64 * 1024 * 1024 })
  const hashes = () => execute('shell', `run-as ${qa.appId} sh -c 'find databases shared_prefs -type f | sort | xargs sha256sum'`).toString('utf8').trim()
  const digest = value => createHash('sha256').update(value).digest('hex')
  const apk = qa.command('shell', 'pm', 'path', qa.appId).trim().split('\n').find(line => line.startsWith('package:'))?.slice(8).trim()
  const installedApkSha256 = qa.command('shell', 'sha256sum', apk).trim().split(/\s+/)[0]
  if (process.env.QA_EXPECTED_APK_SHA256) assert.equal(installedApkSha256, process.env.QA_EXPECTED_APK_SHA256.toLowerCase())
  qa.close(); qa.command('shell', 'am', 'force-stop', qa.appId)
  const archive = execute('exec-out', 'run-as', qa.appId, 'tar', 'cf', '-', 'databases', 'shared_prefs')
  const originals = hashes(), directory = mkdtempSync(join(tmpdir(), 'kitten-entry-baseline-'))
  writeFileSync(join(directory, 'private-baseline.tar'), archive)
  qa = await connectQa({ port, output })
  const summary = { installedApkSha256, privateDigest: digest(originals), sourceScope: process.env.QA_INSTALLED_SOURCE_SCOPE || 'Installed APK hash identifies product; runner checkout may contain later fixture edits' }
  qa.save('private-baseline-identity.json', summary)
  return { qa, data, summary, async restore(current) {
    assert.equal((await current.native('observeControl')).owner, null, 'Finish own session before private restoration')
    assert.equal((await current.native('previewRecovery')).pending, false, 'Resolve own OS duties before private restoration')
    current.close(); current.command('shell', 'am', 'force-stop', current.appId)
    const originalPaths = new Set(originals.split('\n').map(line => line.trim().split(/\s+/).at(-1)))
    for (const path of hashes().split('\n').map(line => line.trim().split(/\s+/).at(-1)).filter(path => !originalPaths.has(path))) {
      assert(/^(?:databases|shared_prefs)\/[A-Za-z0-9._-]+$/.test(path), 'Refuse unexpected fixture path')
      current.command('shell', 'run-as', current.appId, 'rm', '-f', path)
    }
    execFileSync(adb, ['-s', current.serial, 'exec-in', 'run-as', current.appId, 'tar', 'xf', '-'], { input: archive, windowsHide: true, timeout: 30000 })
    await until(() => hashes() === originals, 'private files restored byte for byte', 15000)
    const restoredDigest = digest(hashes())
    current = await connectQa({ port, output })
    assert.deepEqual((await current.native('loadData')).data, data, 'Public QA baseline exactly restored')
    await current.native('syncReminders')
    current.save('private-baseline-restored.json', { ...summary, restoredDigest, cleanupCompleted: true })
    rmSync(directory, { recursive: true })
    return current
  } }
}
