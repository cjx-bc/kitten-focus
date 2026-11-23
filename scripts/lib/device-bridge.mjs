import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'

const DEFAULT_ORCA_WIN = 'C:\\Users\\33428\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca.exe'

function readDeviceCache(root) {
  const file = resolve(root, '.cache/android-test-device.json')
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

function findOnPath(names) {
  const isWin = process.platform === 'win32'
  const locator = isWin ? 'where.exe' : 'which'
  for (const name of names) {
    try {
      const out = execFileSync(locator, [name], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const first = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && (!isWin || line.toLowerCase().endsWith('.exe')))
      if (first && existsSync(first)) return first
      const anyLine = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
      if (anyLine && existsSync(anyLine)) return anyLine
    } catch {
      // Continue trying candidates.
    }
  }
  return null
}

export function resolveAdbPath(root, explicitAdb) {
  const configured = readDeviceCache(root)
  const isWin = process.platform === 'win32'
  const adbExe = isWin ? 'adb.exe' : 'adb'
  const sdkHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  const candidates = [
    explicitAdb,
    process.env.ADB,
    configured.adb,
    resolve(root, '.tools/android-sdk/platform-tools', adbExe),
    resolve(root, '.tools/android-sdk/platform-tools/adb'),
    sdkHome ? join(sdkHome, 'platform-tools', adbExe) : null,
    sdkHome ? join(sdkHome, 'platform-tools', 'adb') : null,
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  const fromPath = findOnPath([adbExe, 'adb'])
  if (fromPath) return fromPath

  throw new Error(
    'Unable to locate adb binary. Checked --adb, ADB env, .cache/android-test-device.json, .tools/android-sdk/platform-tools, ANDROID_HOME/ANDROID_SDK_ROOT, and PATH.',
  )
}

export function resolveOrcaPath(explicitOrca) {
  const isWin = process.platform === 'win32'
  const localAppData = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Programs', 'orca', 'resources', 'bin', 'orca.exe')
    : null
  const candidates = [
    explicitOrca,
    process.env.ORCA,
    findOnPath(isWin ? ['orca.exe', 'orca'] : ['orca']),
    isWin ? localAppData : null,
    isWin ? DEFAULT_ORCA_WIN : null,
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function parseOrcaJson(stdout, commandLabel) {
  const trimmed = String(stdout || '').trim()
  if (!trimmed) throw new Error(`Empty JSON output from orca ${commandLabel}`)
  const start = trimmed.indexOf('{')
  const jsonText = start >= 0 ? trimmed.slice(start) : trimmed
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(`Invalid JSON from orca ${commandLabel}: ${err.message}\nRaw: ${trimmed.slice(0, 300)}`)
  }
  if (parsed.ok === false) {
    const detail = parsed.error?.message || parsed.message || JSON.stringify(parsed)
    throw new Error(`orca ${commandLabel} failed: ${detail}`)
  }
  return parsed
}

export function listAdbDevices(adbPath) {
  const out = execFileSync(adbPath, ['devices', '-l'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  })
  return out
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/)
      const serial = parts[0]
      const state = parts[1]
      const detail = parts.slice(2).join(' ')
      return { serial, state, detail }
    })
}

export function listOrcaDevices(orcaPath) {
  if (!orcaPath) return []
  try {
    const out = execFileSync(orcaPath, ['emulator', 'devices', '--json'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    })
    const parsed = parseOrcaJson(out, 'emulator devices')
    return Array.isArray(parsed.result) ? parsed.result : []
  } catch {
    return []
  }
}

export function resolveDeviceSerial({ root, adbPath, orcaPath, explicitDevice }) {
  const configured = readDeviceCache(root)
  if (explicitDevice) return explicitDevice
  if (process.env.ANDROID_SERIAL) return process.env.ANDROID_SERIAL
  if (configured.serial) return configured.serial

  const adbOnline = listAdbDevices(adbPath).filter((d) => d.state === 'device')
  const orcaOnline = listOrcaDevices(orcaPath).filter(
    (d) => d.backend === 'android' && (d.state === 'booted' || d.isAvailable),
  )

  if (adbOnline.length === 1) return adbOnline[0].serial
  if (adbOnline.length === 0 && orcaOnline.length === 1) return orcaOnline[0].id

  const choices = adbOnline.map((d) => d.serial)
  if (choices.length > 1) {
    throw new Error(
      `Multiple online Android devices detected (${choices.join(', ')}). Pass --device <serial> or set ANDROID_SERIAL.`,
    )
  }
  throw new Error('No online Android device found via adb devices or orca emulator devices.')
}

export async function isPortAvailable(port) {
  return new Promise((resolvePromise) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolvePromise(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolvePromise(true))
    })
  })
}

export async function pickFreePort(preferredPort = 9237) {
  if (preferredPort && (await isPortAvailable(preferredPort))) {
    return preferredPort
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer()
    server.unref()
    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : preferredPort
      server.close(() => resolvePromise(port))
    })
  })
}

export function createDeviceBridge({ root, adbPath: explicitAdb, orcaPath: explicitOrca, device: explicitDevice } = {}) {
  const workspaceRoot = root || resolve(import.meta.dirname, '../..')
  const adbPath = resolveAdbPath(workspaceRoot, explicitAdb)
  const orcaPath = resolveOrcaPath(explicitOrca)
  const serial = resolveDeviceSerial({
    root: workspaceRoot,
    adbPath,
    orcaPath,
    explicitDevice,
  })

  function adb(args, opts = {}) {
    const {
      encoding = 'utf8',
      timeout = 30000,
      input,
      maxBuffer = 64 * 1024 * 1024,
      rawBuffer = false,
    } = opts
    return execFileSync(adbPath, ['-s', serial, ...args], {
      encoding: rawBuffer ? undefined : encoding,
      input,
      stdio: [input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout,
      maxBuffer,
    })
  }

  function adbRaw(args, opts = {}) {
    return execFileSync(adbPath, args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: opts.timeout || 15000,
      maxBuffer: opts.maxBuffer || 16 * 1024 * 1024,
    })
  }

  function shell(command, opts = {}) {
    if (Array.isArray(command)) {
      return adb(['shell', ...command], opts)
    }
    return adb(['shell', command], opts)
  }

  function verifyOnline() {
    let state = ''
    try {
      state = adb(['get-state'], { timeout: 10000 }).trim()
    } catch (err) {
      throw new Error(`Device "${serial}" is not reachable via adb (${err.message})`)
    }
    if (state !== 'device') {
      throw new Error(`Device "${serial}" adb state is "${state}" (expected "device")`)
    }
    return state
  }

  function orca(subArgs, { timeout = 45000, includeDevice = true } = {}) {
    if (!orcaPath) {
      throw new Error('orca CLI executable not found on PATH or standard install directory.')
    }
    const args = ['emulator', ...subArgs]
    if (includeDevice && !args.includes('--device')) {
      args.push('--device', serial)
    }
    if (!args.includes('--json')) {
      args.push('--json')
    }
    const res = spawnSync(orcaPath, args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout,
      maxBuffer: 32 * 1024 * 1024,
    })
    if (res.error) {
      throw new Error(`orca ${subArgs[0]} failed to spawn: ${res.error.message}`)
    }
    if (res.status !== 0 && !String(res.stdout || '').includes('{')) {
      throw new Error(
        `orca ${subArgs.join(' ')} exited with ${res.status}: ${(res.stderr || res.stdout || '').trim()}`,
      )
    }
    return parseOrcaJson(res.stdout, subArgs[0])
  }

  function orcaDevices() {
    if (!orcaPath) return []
    try {
      const parsed = orca(['devices'], { includeDevice: false, timeout: 15000 })
      return Array.isArray(parsed.result) ? parsed.result : []
    } catch {
      return []
    }
  }

  function orcaAttach(focus = false) {
    const args = ['attach', serial]
    if (focus) args.push('--focus')
    return orca(args, { includeDevice: false, timeout: 30000 })
  }

  function orcaTap(nx, ny) {
    return orca(['tap', String(nx), String(ny)], { timeout: 15000 })
  }

  function orcaType(text) {
    return orca(['type', String(text)], { timeout: 15000 })
  }

  function orcaButton(name) {
    return orca(['button', String(name)], { timeout: 15000 })
  }

  function orcaAx() {
    return orca(['ax'], { timeout: 25000 })
  }

  function orcaLogcat(lines = 400) {
    return orca(['logcat', '--lines', String(lines)], { timeout: 25000 })
  }

  function orcaInstall(apkPath, reinstall = true) {
    const absApk = resolve(workspaceRoot, apkPath)
    if (!existsSync(absApk)) {
      throw new Error(`APK file not found: ${absApk}`)
    }
    const args = ['install', absApk]
    if (reinstall) args.push('--reinstall')
    return orca(args, { timeout: 120000 })
  }

  function orcaLaunch(packageName, activity) {
    const args = ['launch', packageName]
    if (activity) args.push('--activity', activity)
    return orca(args, { timeout: 25000 })
  }

  function orcaExec(command) {
    return orca(['exec', '--command', command], { timeout: 25000 })
  }

  function getDeviceInfo() {
    verifyOnline()
    const prop = (key) => {
      try {
        return shell(['getprop', key], { timeout: 8000 }).trim()
      } catch {
        return ''
      }
    }
    let orcaList = []
    try {
      orcaList = orcaDevices()
    } catch {
      orcaList = []
    }
    const orcaMatch = orcaList.find((d) => d.id === serial) || null
    const isEmulator = /^emulator-\d+$/.test(serial) || prop('ro.kernel.qemu') === '1'
    return {
      serial,
      kind: isEmulator ? 'emulator' : 'physical',
      manufacturer: prop('ro.product.manufacturer'),
      brand: prop('ro.product.brand'),
      model: prop('ro.product.model'),
      androidVersion: prop('ro.build.version.release'),
      sdk: Number(prop('ro.build.version.sdk')) || prop('ro.build.version.sdk'),
      abi: prop('ro.product.cpu.abi'),
      orcaRegistered: Boolean(orcaMatch),
      orcaDevice: orcaMatch,
      adbPath,
      orcaPath,
    }
  }

  function getInstalledPackageInfo(packageName) {
    const pmPathOut = shell(['pm', 'path', packageName], { timeout: 10000 }).trim()
    const apkPaths = pmPathOut
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('package:'))
      .map((line) => line.slice('package:'.length).trim())
    if (!apkPaths.length) {
      throw new Error(`Package "${packageName}" is not installed on device "${serial}".`)
    }
    const primaryApk = apkPaths[0]
    let sha256 = null
    try {
      const hashLine = shell(['sha256sum', primaryApk], { timeout: 15000 }).trim()
      const candidate = hashLine.split(/\s+/)[0]
      if (/^[a-f0-9]{64}$/i.test(candidate)) sha256 = candidate.toLowerCase()
    } catch {
      sha256 = null
    }
    let versionName = ''
    let versionCode = ''
    let debuggable = null
    try {
      const dump = shell(['dumpsys', 'package', packageName], { timeout: 15000 })
      versionName = dump.match(/versionName=([^\s]+)/)?.[1] || ''
      versionCode = dump.match(/versionCode=(\d+)/)?.[1] || ''
      const flagsLine = dump.match(/pkgFlags=\[([^\]]*)\]/)?.[1] || dump.match(/flags=\[([^\]]*)\]/)?.[1] || ''
      if (flagsLine) {
        debuggable = /\bDEBUGGABLE\b/.test(flagsLine)
      }
    } catch {
      // Best effort on OEMs with restricted dumpsys output.
    }
    return {
      packageName,
      apkPath: primaryApk,
      apkPaths,
      sha256,
      versionName,
      versionCode,
      debuggable,
    }
  }

  function findAppPids(packageName, user) {
    const pids = []
    if (user === undefined) {
      try {
        const out = shell(['pidof', packageName], { timeout: 8000 }).trim()
        for (const token of out.split(/\s+/)) {
          if (/^\d+$/.test(token)) pids.push(token)
        }
      } catch {
        // pidof exits 1 when process is not running.
      }
    }
    if (pids.length > 0) return pids

    try {
      const psOut = shell(['ps', '-A', '-o', 'USER,PID,NAME'], { timeout: 10000 })
      for (const line of psOut.split(/\r?\n/).slice(1)) {
        const cols = line.trim().split(/\s+/)
        if (cols.length < 3) continue
        const [procUser, pid, name] = [cols[0], cols[1], cols.at(-1)]
        if (name !== packageName || !/^\d+$/.test(pid)) continue
        if (user !== undefined && !procUser.startsWith(`u${user}_`)) continue
        if (!pids.includes(pid)) pids.push(pid)
      }
    } catch {
      try {
        const psFallback = shell(['ps'], { timeout: 10000 })
        for (const line of psFallback.split(/\r?\n/).slice(1)) {
          const cols = line.trim().split(/\s+/)
          if (cols.length < 2) continue
          const name = cols.at(-1)
          const pid = cols.find((c, idx) => idx > 0 && /^\d+$/.test(c))
          if (name === packageName && pid && !pids.includes(pid)) pids.push(pid)
        }
      } catch {
        // Ignore
      }
    }
    return pids
  }

  function readProcNetUnix() {
    try {
      const text = shell(['cat', '/proc/net/unix'], { timeout: 10000 })
      return { readable: true, text }
    } catch (err) {
      return { readable: false, text: '', error: err.message }
    }
  }

  function forward(localPort, remoteSpec) {
    adb(['forward', `tcp:${localPort}`, remoteSpec], { timeout: 10000 })
  }

  function removeForward(localPort) {
    try {
      adb(['forward', '--remove', `tcp:${localPort}`], { timeout: 8000 })
    } catch {
      // Forward may already be removed.
    }
  }

  function wakeupAndLaunch(packageName, { activity = 'com.xiaomao.focus.MainActivity', user, useOrcaFirst = false } = {}) {
    try {
      shell(['input', 'keyevent', 'WAKEUP'], { timeout: 8000 })
    } catch {
      // Ignore
    }
    try {
      shell(['wm', 'dismiss-keyguard'], { timeout: 8000 })
    } catch {
      // Ignore
    }
    if (useOrcaFirst && orcaPath && user === undefined) {
      try {
        orcaLaunch(packageName, activity)
        return { method: 'orca-launch' }
      } catch {
        // Fall back to direct am start.
      }
    }
    const args = ['am', 'start']
    if (user !== undefined) args.push('--user', String(user))
    args.push('-n', `${packageName}/${activity}`)
    shell(args, { timeout: 15000 })
    return { method: 'adb-am-start' }
  }

  function forceStop(packageName) {
    shell(['am', 'force-stop', packageName], { timeout: 15000 })
  }

  function getDeviceLogcatBookmark() {
    let timestamp = ''
    try {
      timestamp = shell('date "+%m-%d %H:%M:%S.000"', { timeout: 8000 }).trim()
    } catch {
      timestamp = ''
    }
    return {
      deviceTimestamp: timestamp,
      hostIso: new Date().toISOString(),
    }
  }

  function parseThreadtimeLogcat(raw) {
    const entries = []
    for (const line of String(raw || '').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('--------- beginning of')) continue
      const m = trimmed.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+\d+\s+\d+\s+([VDIWEFA])\s+([^:]+):\s*(.*)$/)
      if (m) {
        entries.push({
          timestamp: m[1],
          level: m[2],
          tag: m[3].trim(),
          message: m[4],
          raw: trimmed,
        })
      } else {
        entries.push({ timestamp: '', level: '', tag: '', message: trimmed, raw: trimmed })
      }
    }
    return entries
  }

  function collectLogcatSince(bookmark, { lines = 800 } = {}) {
    if (bookmark?.deviceTimestamp) {
      try {
        const raw = adb(['logcat', '-T', bookmark.deviceTimestamp, '-d', '-v', 'threadtime'], {
          timeout: 20000,
          maxBuffer: 32 * 1024 * 1024,
        })
        return { source: 'adb-logcat-T', entries: parseThreadtimeLogcat(raw) }
      } catch {
        // Fall through to orca emulator logcat.
      }
    }
    if (orcaPath) {
      try {
        const parsed = orcaLogcat(lines)
        const list = Array.isArray(parsed.result) ? parsed.result : []
        const startTs = bookmark?.deviceTimestamp || ''
        const filtered = startTs
          ? list.filter((e) => !e.timestamp || e.timestamp >= startTs)
          : list
        return {
          source: 'orca-logcat',
          entries: filtered.map((e) => ({
            timestamp: e.timestamp || '',
            level: e.level || '',
            tag: e.tag || '',
            message: e.message || '',
            raw: `${e.timestamp || ''} ${e.level || ''} ${e.tag || ''}: ${e.message || ''}`.trim(),
          })),
        }
      } catch {
        // Fall back to adb logcat -d -t
      }
    }
    const raw = adb(['logcat', '-d', '-t', String(lines), '-v', 'threadtime'], {
      timeout: 20000,
      maxBuffer: 32 * 1024 * 1024,
    })
    return {
      source: 'adb-logcat-tail',
      entries: parseThreadtimeLogcat(raw),
    }
  }

  return {
    root: workspaceRoot,
    adbPath,
    orcaPath,
    serial,
    adb,
    adbRaw,
    shell,
    verifyOnline,
    orca,
    orcaDevices,
    orcaAttach,
    orcaTap,
    orcaType,
    orcaButton,
    orcaAx,
    orcaLogcat,
    orcaInstall,
    orcaLaunch,
    orcaExec,
    getDeviceInfo,
    getInstalledPackageInfo,
    findAppPids,
    readProcNetUnix,
    forward,
    removeForward,
    wakeupAndLaunch,
    forceStop,
    getDeviceLogcatBookmark,
    collectLogcatSince,
  }
}
