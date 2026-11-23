import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectWebViewCdp, until } from './webview-cdp.mjs'

export function defaultProtection() {
  return {
    study: false,
    strict: false,
    interceptNotifications: false,
    dnd: false,
    globalWhitelist: [],
    enhancements: [],
  }
}

export function createCleanAppData() {
  return {
    schemaVersion: 1,
    themes: [],
    items: [],
    records: [],
    deletedRecordIds: [],
    events: [],
    eventExceptions: [],
    semesters: [],
    courses: [],
    courseExceptions: [],
    preferences: {
      defaultMinutes: 25,
      sound: false,
      vibration: false,
      activeSemesterId: null,
      protection: defaultProtection(),
    },
  }
}

export function assertPackageSafety({ packageName = 'com.xiaomao.focus.qa', allowNonQa = false, dryRun = false }) {
  if (!packageName || typeof packageName !== 'string') {
    throw new Error('Target package name must be a non-empty string.')
  }
  if (!packageName.endsWith('.qa') && !allowNonQa && !dryRun) {
    throw new Error(
      `Safety guard: refusing to mutate non-.qa package "${packageName}". Pass --allow-non-qa to opt in, or use --dry-run for read-only inspection.`,
    )
  }
}

export function probeRunAsCapability(bridge, packageName) {
  try {
    const lsOut = bridge.shell(`run-as ${packageName} sh -c "ls -d databases shared_prefs"`, { timeout: 25000 })
    const hasTar = (() => {
      try {
        const tarOut = bridge.shell(`run-as ${packageName} sh -c "command -v tar"`, { timeout: 15000 }).trim()
        return Boolean(tarOut)
      } catch {
        return false
      }
    })()
    return {
      supported: hasTar,
      lsReadable: true,
      hasTar,
      mode: hasTar ? 'run-as-tar' : 'bridge-fallback',
      detail: lsOut.trim().slice(0, 300),
    }
  } catch (err) {
    return {
      supported: false,
      lsReadable: false,
      hasTar: false,
      mode: 'bridge-fallback',
      detail: err.message,
    }
  }
}

export function readDeviceSystemState(bridge) {
  const safeGet = (cmd) => {
    try {
      return bridge.shell(cmd, { timeout: 8000 }).trim()
    } catch {
      return ''
    }
  }
  const wallpaperLines = safeGet(['dumpsys', 'wallpaper'])
    .split(/\r?\n/)
    .filter((line) => /mWallpaperId=|mWhich=|mWallpaperComponent=/.test(line))
    .map((line) => line.trim())

  return {
    accessibility: safeGet(['settings', 'get', 'secure', 'enabled_accessibility_services']),
    accessibilityEnabled: safeGet(['settings', 'get', 'secure', 'accessibility_enabled']),
    listeners: safeGet(['settings', 'get', 'secure', 'enabled_notification_listeners']),
    wallpaperIds: wallpaperLines,
  }
}

function listPrivateHashes(bridge, packageName) {
  const out = bridge
    .shell(`run-as ${packageName} sh -c 'find databases shared_prefs -type f 2>/dev/null | sort | xargs sha256sum'`, {
      timeout: 30000,
    })
    .trim()
  return out
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex')
}

export function analyzeLogcatForFatals(entries, packageName) {
  const escapedPkg = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const anrRegex = new RegExp(`ANR in\\s+${escapedPkg}|ANR in\\s+com\\.xiaomao\\.focus\\b`, 'i')
  const matched = []

  for (const entry of entries) {
    const raw = entry.raw || `${entry.timestamp || ''} ${entry.level || ''} ${entry.tag || ''}: ${entry.message || ''}`
    const tag = entry.tag || ''
    const level = entry.level || ''
    const msg = entry.message || raw

    const isFatalException = /FATAL EXCEPTION/i.test(msg)
    const isFatalSignal = /Fatal signal\s+\d+/i.test(msg) || /SIGSEGV|SIGABRT/i.test(msg)
    const isAnr = anrRegex.test(raw)
    const isAndroidRuntimeCrash =
      (tag === 'AndroidRuntime' && (level === 'E' || level === 'F' || /FATAL|Exception|Error/i.test(msg))) ||
      /\b[EF]\s+AndroidRuntime:/.test(raw)

    if (isFatalException || isFatalSignal || isAnr || isAndroidRuntimeCrash) {
      matched.push({
        timestamp: entry.timestamp || '',
        level,
        tag: tag || (/\b[EF]\s+AndroidRuntime:/.test(raw) ? 'AndroidRuntime' : ''),
        message: msg,
        reason: isFatalException
          ? 'FATAL EXCEPTION'
          : isFatalSignal
            ? 'Fatal signal'
            : isAnr
              ? 'ANR'
              : 'AndroidRuntime error',
      })
    }
  }

  return {
    ok: matched.length === 0,
    fatalCount: matched.length,
    fatals: matched,
  }
}

export async function createBaselineManager(
  bridge,
  cdp,
  { packageName = 'com.xiaomao.focus.qa', allowNonQa = false, port, noRestore = false } = {},
) {
  assertPackageSafety({ packageName, allowNonQa, dryRun: false })

  const runAsProbe = probeRunAsCapability(bridge, packageName)
  const logcatBookmark = bridge.getDeviceLogcatBookmark()
  const systemBefore = readDeviceSystemState(bridge)

  const controlBefore = await cdp.native('observeControl')
  assert.equal(
    controlBefore.owner,
    null,
    `Expected idle control state before baseline capture, got owner="${controlBefore.owner}". Finish active focus/rest/lock first.`,
  )
  const recoveryBefore = await cdp.native('previewRecovery')
  assert.equal(
    recoveryBefore.pending,
    false,
    'Expected no pending recovery duty before baseline capture.',
  )

  const baselineLoad = await cdp.native('loadData')
  const baselineData = baselineLoad.data

  let mode = runAsProbe.mode
  let privateArchive = null
  let privateHashes = ''
  let privateDigest = null
  let tempDir = null
  let activeCdp = cdp

  if (mode === 'run-as-tar') {
    try {
      activeCdp.close()
      bridge.forceStop(packageName)
      privateArchive = bridge.adb(['exec-out', 'run-as', packageName, 'tar', 'cf', '-', 'databases', 'shared_prefs'], {
        rawBuffer: true,
        timeout: 45000,
      })
      privateHashes = listPrivateHashes(bridge, packageName)
      privateDigest = sha256Text(privateHashes)
      tempDir = mkdtempSync(join(tmpdir(), 'kitten-ux-e2e-baseline-'))
      writeFileSync(join(tempDir, 'private-baseline.tar'), privateArchive)
      activeCdp = await connectWebViewCdp(bridge, {
        packageName,
        port,
        launch: true,
        timeout: 35000,
      })
    } catch (err) {
      // If tar/exec-out fails on an OEM build despite ls succeeding, degrade safely to bridge-fallback.
      mode = 'bridge-fallback'
      privateArchive = null
      runAsProbe.fallbackReason = err.message
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true })
        tempDir = null
      }
      if (activeCdp.closed) {
        activeCdp = await connectWebViewCdp(bridge, {
          packageName,
          port,
          launch: true,
          timeout: 35000,
        })
      }
    }
  }

  async function installCleanFixture() {
    const cleanData = createCleanAppData()
    await activeCdp.native('replaceData', { data: cleanData })
    await activeCdp.navigateRoute('/tasks')
    await activeCdp.reload()
    await activeCdp.waitForRoute('/tasks')
    return activeCdp
  }

  async function ensureIdleControl(targetCdp) {
    let state = await targetCdp.native('observeControl')
    if (state.owner === 'focus') {
      await targetCdp.native('focusAction', { action: 'finish' }).catch(() => {})
    } else if (state.owner === 'lock') {
      await targetCdp.native('lockAction', { action: 'finish' }).catch(() => {})
    }
    state = await targetCdp.native('observeControl')
    if (state.owner === 'rest') {
      await targetCdp.native('restAction', { action: 'exit' }).catch(() => {})
    }
  }

  async function restore(currentCdp) {
    activeCdp = currentCdp || activeCdp
    try {
      if (noRestore) {
        const state = await activeCdp.native('observeControl').catch(() => ({ owner: 'unknown' }))
        const logcat = bridge.collectLogcatSince(logcatBookmark)
        const fatalCheck = analyzeLogcatForFatals(logcat.entries, packageName)
        return {
          restored: false,
          skipped: true,
          mode,
          controlOwnerAfter: state.owner,
          logcatSource: logcat.source,
          logcatEntryCount: logcat.entries.length,
          fatalCheck,
          logcatEntries: logcat.entries,
        }
      }

      await ensureIdleControl(activeCdp).catch(() => {})

      if (mode === 'run-as-tar' && privateArchive) {
        // forceStop + tar restore clears any remaining strict session safely.
        activeCdp.close()
        bridge.forceStop(packageName)

        const originalPaths = new Set(
          privateHashes
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => line.trim().split(/\s+/).at(-1)),
        )
        const currentHashes = listPrivateHashes(bridge, packageName)
        const currentPaths = currentHashes
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => line.trim().split(/\s+/).at(-1))

        for (const path of currentPaths) {
          if (!originalPaths.has(path) && /^(?:databases|shared_prefs)\/[A-Za-z0-9._-]+$/.test(path)) {
            bridge.shell(['run-as', packageName, 'rm', '-f', path], { timeout: 10000 })
          }
        }

        bridge.adb(['exec-in', 'run-as', packageName, 'tar', 'xf', '-'], {
          input: privateArchive,
          timeout: 45000,
        })
        await until(() => listPrivateHashes(bridge, packageName) === privateHashes, 'private baseline tar extraction', 30000, 500)

        activeCdp = await connectWebViewCdp(bridge, {
          packageName,
          port,
          launch: true,
          timeout: 35000,
        })
        const reloadedData = (await activeCdp.native('loadData')).data
        assert.deepEqual(reloadedData, baselineData, 'Public CatFocus baseline data restored after tar restore')
        await activeCdp.native('syncReminders')
      } else {
        const beforeRestoreState = await activeCdp.native('observeControl')
        assert.equal(beforeRestoreState.owner, null, `Control owner must be null before restore, got ${beforeRestoreState.owner}`)
        await activeCdp.native('replaceData', { data: baselineData })
        await activeCdp.native('syncReminders')
        await activeCdp.reload()
        const reloadedData = (await activeCdp.native('loadData')).data
        assert.deepEqual(reloadedData, baselineData, 'Public CatFocus baseline data restored via bridge fallback')
      }

      const afterRestoreState = await activeCdp.native('observeControl')
      assert.equal(afterRestoreState.owner, null, 'Control owner must remain null after baseline restore')
      const systemAfter = readDeviceSystemState(bridge)
      const logcat = bridge.collectLogcatSince(logcatBookmark)
      const fatalCheck = analyzeLogcatForFatals(logcat.entries, packageName)

      return {
        restored: true,
        skipped: false,
        mode,
        privateDigest,
        controlOwnerAfter: afterRestoreState.owner,
        systemUnchanged: JSON.stringify(systemAfter) === JSON.stringify(systemBefore),
        logcatSource: logcat.source,
        logcatEntryCount: logcat.entries.length,
        fatalCheck,
        logcatEntries: logcat.entries,
        cdp: activeCdp,
      }
    } finally {
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true })
        tempDir = null
      }
    }
  }

  return {
    mode,
    runAsProbe,
    logcatBookmark,
    privateDigest,
    get cdp() {
      return activeCdp
    },
    installCleanFixture,
    restore,
    collectLogcatReport() {
      const logcat = bridge.collectLogcatSince(logcatBookmark)
      const fatalCheck = analyzeLogcatForFatals(logcat.entries, packageName)
      return {
        source: logcat.source,
        entryCount: logcat.entries.length,
        fatalCheck,
        entries: logcat.entries,
      }
    },
  }
}
