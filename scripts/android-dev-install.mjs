import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ACCESSIBILITY_CLASS,
  NOTIFICATION_LISTENER_CLASS,
  buildGrantPlan,
  classifyInstallError,
  hasAuthorizingDevice,
  isAppOpAllowed,
  isBatteryWhitelistPresent,
  isDndAccessGranted,
  isOppoPermissionMonitoringError,
  isRuntimePermissionGranted,
  mergeColonList,
  parseAdbDevices,
  parseCliArgs,
  selectDevice,
} from './lib/android-dev-install.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const IS_WIN = process.platform === 'win32'
const ERROR_OUTPUT_PATTERN =
  /(?:SecurityException|Permission denial|Operation not allowed|IllegalArgumentException|Unknown command|\bError:)/i

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

function resolveAdb() {
  if (process.env.ADB && process.env.ADB.trim()) {
    return process.env.ADB.trim()
  }
  const exe = IS_WIN ? 'adb.exe' : 'adb'
  const localAdb = resolve(ROOT, '.tools/android-sdk/platform-tools', exe)
  if (existsSync(localAdb)) return localAdb
  if (process.env.ANDROID_HOME) {
    const sdkAdb = resolve(process.env.ANDROID_HOME, 'platform-tools', exe)
    if (existsSync(sdkAdb)) return sdkAdb
  }
  return 'adb'
}

function printHelp() {
  console.log(`小猫专注 · 真机调试一键安装与自动授权工具

用法:
  npm.cmd run android:dev-install [-- 选项]   构建前端/APK，覆盖安装并自动授予全部调试权限
  npm.cmd run android:install     [-- 选项]   跳过构建，直接安装现有 APK 并自动授权
  npm.cmd run android:grant       [-- 选项]   仅对手机上已安装的应用重新恢复全部权限

常用选项:
  -s, --serial <id>               指定目标设备序列号（多台设备时必填，也可用 ANDROID_SERIAL）
      --apk <path>                指定待安装的 APK 路径（指定后自动跳过构建）
      --app-id <id>               指定包名（默认 com.xiaomao.focus，QA 包可传 com.xiaomao.focus.qa）
      --skip-build                跳过前端构建、cap sync 与 Gradle 打包
      --grant-only                仅执行权限授予，不构建也不安装 APK
      --no-launch                 完成后不自动拉起 MainActivity
      --no-toggle-accessibility   仅确保无障碍列表包含本应用，不执行先移除再恢复的重启重连动作
  -h, --help                      显示本帮助信息

OPPO / ColorOS 一次性前置设置:
  1. 手机开启「开发者选项 → USB 调试」（如弹出 USB 安装确认请一并允许）
  2. 在「开发者选项」底部开启「禁止权限监控」（只需开一次，避免 ADB 授权被系统拦截）`)
}

function runBuildCommand(label, winCommand, posixCmd, posixArgs, cwd) {
  console.log(`\n==> ${label}`)
  const res = IS_WIN
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', winCommand], {
        cwd,
        stdio: 'inherit',
        windowsHide: true,
      })
    : spawnSync(posixCmd, posixArgs, {
        cwd,
        stdio: 'inherit',
      })
  if (res.error) {
    throw new Error(`${label} 启动失败: ${res.error.message}`)
  }
  if (res.status !== 0) {
    throw new Error(`${label} 执行失败（退出码 ${res.status ?? 'unknown'}）`)
  }
}

function runAdbRaw(adb, args, timeout = 30000) {
  const res = spawnSync(adb, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (res.error) {
    throw new Error(`无法执行 adb (${adb}): ${res.error.message}`)
  }
  const stdout = String(res.stdout ?? '').trim()
  const stderr = String(res.stderr ?? '').trim()
  const output = [stdout, stderr].filter(Boolean).join('\n').trim()
  return {
    status: res.status ?? 1,
    stdout,
    stderr,
    output,
  }
}

function runShellChecked(adb, serial, args, timeout = 30000) {
  const res = runAdbRaw(adb, ['-s', serial, ...args], timeout)
  const ok = res.status === 0 && !ERROR_OUTPUT_PATTERN.test(res.output)
  return { ...res, ok }
}

function readProp(adb, serial, key) {
  const res = runAdbRaw(adb, ['-s', serial, 'shell', 'getprop', key], 10000)
  return res.status === 0 ? res.stdout.trim() : ''
}

function formatError(err) {
  return err instanceof Error ? err.message : String(err)
}

function printOppoChecklist() {
  console.log(`
OPPO / ColorOS 一次性前置设置提示:
  1. 打开手机「设置」→「系统设置」（或「其他设置」）→「开发者选项」
  2. 滑到底部开启「禁止权限监控」（只需开启一次，允许通过 ADB 恢复安全设置）
  3. 确认后重新运行：npm.cmd run android:grant`)
}

function readPackageDump(adb, serial, appId, cache) {
  if (!cache.packageDump) {
    cache.packageDump = runAdbRaw(adb, ['-s', serial, 'shell', 'dumpsys', 'package', appId], 20000)
  }
  return cache.packageDump
}

function readNotificationDump(adb, serial, cache) {
  if (!cache.notificationDump) {
    let res = runAdbRaw(adb, ['-s', serial, 'shell', 'dumpsys', 'notification', '--noredact'], 20000)
    if (res.status !== 0 || /Unknown option/i.test(res.output)) {
      res = runAdbRaw(adb, ['-s', serial, 'shell', 'dumpsys', 'notification'], 20000)
    }
    cache.notificationDump = res
  }
  return cache.notificationDump
}

function isStepAlreadyGranted(adb, serial, step, opts, cache) {
  const appOpByStep = {
    restrictedSettings: 'ACCESS_RESTRICTED_SETTINGS',
    exactAlarm: 'SCHEDULE_EXACT_ALARM',
    installUnknownApps: 'REQUEST_INSTALL_PACKAGES',
  }
  if (appOpByStep[step.id]) {
    const opName = appOpByStep[step.id]
    const res = runAdbRaw(adb, ['-s', serial, 'shell', 'cmd', 'appops', 'get', opts.appId, opName], 10000)
    return res.status === 0 && isAppOpAllowed(res.output, opName)
  }
  if (step.id === 'postNotifications') {
    const res = readPackageDump(adb, serial, opts.appId, cache)
    return res.status === 0 && isRuntimePermissionGranted(res.stdout, 'android.permission.POST_NOTIFICATIONS')
  }
  if (step.id === 'batteryOptimization') {
    const res = runAdbRaw(adb, ['-s', serial, 'shell', 'dumpsys', 'deviceidle', 'whitelist'], 15000)
    return res.status === 0 && isBatteryWhitelistPresent(res.stdout, opts.appId)
  }
  if (step.id === 'dndAccess') {
    const res = readNotificationDump(adb, serial, cache)
    return res.status === 0 && isDndAccessGranted(res.stdout, opts.appId)
  }
  return false
}

async function waitAndSelectDevice(adb, explicitSerial, timeoutMs = 8000) {
  runAdbRaw(adb, ['start-server'], 15000)
  const deadline = Date.now() + timeoutMs
  while (true) {
    const devicesRes = runAdbRaw(adb, ['devices', '-l'], 15000)
    if (devicesRes.status !== 0) {
      throw new Error(`adb devices 执行失败: ${devicesRes.output}`)
    }
    const devices = parseAdbDevices(devicesRes.stdout)
    if (!hasAuthorizingDevice(devices, explicitSerial) || Date.now() >= deadline) {
      return selectDevice(devices, explicitSerial)
    }
    await sleep(250)
  }
}

async function executeGrantStep(adb, serial, step, opts, cache = {}) {
  if (step.kind === 'adb') {
    let alreadyGranted = false
    try {
      alreadyGranted = isStepAlreadyGranted(adb, serial, step, opts, cache)
    } catch {
      alreadyGranted = false
    }
    if (alreadyGranted) {
      return {
        id: step.id,
        label: step.label,
        ok: true,
        detail: '已具备（跳过写入）',
        permissionMonitoringBlocked: false,
      }
    }
    const res = runShellChecked(adb, serial, step.args)
    return {
      id: step.id,
      label: step.label,
      ok: res.ok,
      detail: res.ok ? '已授予' : res.output || `退出码 ${res.status}`,
      permissionMonitoringBlocked: !res.ok && isOppoPermissionMonitoringError(res.output),
    }
  }

  if (step.kind === 'notificationListener') {
    const readRes = runShellChecked(adb, serial, ['shell', 'settings', 'get', 'secure', 'enabled_notification_listeners'])
    if (readRes.ok && mergeColonList(readRes.stdout, opts.appId, NOTIFICATION_LISTENER_CLASS).alreadyPresent) {
      return {
        id: step.id,
        label: step.label,
        ok: true,
        detail: '已具备（跳过写入）',
        permissionMonitoringBlocked: false,
      }
    }

    const primary = runShellChecked(adb, serial, step.args)
    if (primary.ok) {
      return {
        id: step.id,
        label: step.label,
        ok: true,
        detail: '已授予（cmd notification）',
        permissionMonitoringBlocked: false,
      }
    }

    if (readRes.ok) {
      const merged = mergeColonList(readRes.stdout, opts.appId, NOTIFICATION_LISTENER_CLASS)
      const putRes = runShellChecked(adb, serial, [
        'shell',
        'settings',
        'put',
        'secure',
        'enabled_notification_listeners',
        merged.merged,
      ])
      if (putRes.ok) {
        return {
          id: step.id,
          label: step.label,
          ok: true,
          detail: '已授予（secure settings）',
          permissionMonitoringBlocked: false,
        }
      }
      const errOut = putRes.output || primary.output
      return {
        id: step.id,
        label: step.label,
        ok: false,
        detail: errOut || '写入通知监听列表失败',
        permissionMonitoringBlocked:
          isOppoPermissionMonitoringError(primary.output) || isOppoPermissionMonitoringError(errOut),
      }
    }

    const combinedErr = primary.output || readRes.output
    return {
      id: step.id,
      label: step.label,
      ok: false,
      detail: combinedErr || '开启通知使用权失败',
      permissionMonitoringBlocked:
        isOppoPermissionMonitoringError(primary.output) || isOppoPermissionMonitoringError(readRes.output),
    }
  }

  if (step.kind === 'accessibilityService') {
    const readRes = runShellChecked(adb, serial, ['shell', 'settings', 'get', 'secure', 'enabled_accessibility_services'])
    if (!readRes.ok) {
      return {
        id: step.id,
        label: step.label,
        ok: false,
        detail: readRes.output || '读取无障碍服务列表失败',
        permissionMonitoringBlocked: isOppoPermissionMonitoringError(readRes.output),
      }
    }

    const merged = mergeColonList(readRes.stdout, opts.appId, ACCESSIBILITY_CLASS)
    if (merged.alreadyPresent && opts.noToggleAccessibility) {
      const enabledRes = runShellChecked(adb, serial, ['shell', 'settings', 'get', 'secure', 'accessibility_enabled'])
      if (enabledRes.ok && enabledRes.stdout.trim() === '1') {
        return {
          id: step.id,
          label: step.label,
          ok: true,
          detail: '已具备（跳过写入，保留其他无障碍服务）',
          permissionMonitoringBlocked: false,
        }
      }
    }
    const putList = runShellChecked(adb, serial, [
      'shell',
      'settings',
      'put',
      'secure',
      'enabled_accessibility_services',
      merged.merged,
    ])
    const putEnabled = putList.ok
      ? runShellChecked(adb, serial, ['shell', 'settings', 'put', 'secure', 'accessibility_enabled', '1'])
      : { ok: false, output: '' }

    if (!putList.ok || !putEnabled.ok) {
      const errOut = putList.output || putEnabled.output || '写入无障碍设置失败'
      return {
        id: step.id,
        label: step.label,
        ok: false,
        detail: errOut,
        permissionMonitoringBlocked: isOppoPermissionMonitoringError(errOut),
      }
    }

    if (merged.alreadyPresent && !opts.noToggleAccessibility) {
      try {
        if (merged.withoutOwn === '') {
          runAdbRaw(adb, ['-s', serial, 'shell', 'settings', 'delete', 'secure', 'enabled_accessibility_services'])
        } else {
          runAdbRaw(adb, [
            '-s',
            serial,
            'shell',
            'settings',
            'put',
            'secure',
            'enabled_accessibility_services',
            merged.withoutOwn,
          ])
        }
        await sleep(350)
      } finally {
        const restoreList = runShellChecked(adb, serial, [
          'shell',
          'settings',
          'put',
          'secure',
          'enabled_accessibility_services',
          merged.merged,
        ])
        const restoreEnabled = runShellChecked(adb, serial, [
          'shell',
          'settings',
          'put',
          'secure',
          'accessibility_enabled',
          '1',
        ])
        if (!restoreList.ok || !restoreEnabled.ok) {
          throw new Error(restoreList.output || restoreEnabled.output || '重连后恢复无障碍列表失败')
        }
      }
      return {
        id: step.id,
        label: step.label,
        ok: true,
        detail: '已刷新重连（保留其他无障碍服务）',
        permissionMonitoringBlocked: false,
      }
    }

    return {
      id: step.id,
      label: step.label,
      ok: true,
      detail: '已开启（保留其他无障碍服务）',
      permissionMonitoringBlocked: false,
    }
  }

  return {
    id: step.id,
    label: step.label,
    ok: false,
    detail: `不支持的步骤类型: ${step.kind}`,
    permissionMonitoringBlocked: false,
  }
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    return
  }

  const adb = resolveAdb()

  if (!opts.grantOnly && !opts.skipBuild && !opts.apk) {
    runBuildCommand('1/3 构建前端与类型检查', 'npm.cmd run build', 'npm', ['run', 'build'], ROOT)
    runBuildCommand('2/3 同步到 Android 工程', 'npx.cmd cap sync android', 'npx', ['cap', 'sync', 'android'], ROOT)
    runBuildCommand(
      '3/3 构建 Debug APK',
      'gradlew.bat :app:assembleDebug --console=plain',
      './gradlew',
      [':app:assembleDebug', '--console=plain'],
      resolve(ROOT, 'android'),
    )
  }

  const target = await waitAndSelectDevice(adb, opts.serial || process.env.ANDROID_SERIAL)

  const manufacturer = readProp(adb, target.serial, 'ro.product.manufacturer') || 'Unknown'
  const model = readProp(adb, target.serial, 'ro.product.model') || target.model || target.serial
  const androidRelease = readProp(adb, target.serial, 'ro.build.version.release') || '?'
  const sdkInt = Number.parseInt(readProp(adb, target.serial, 'ro.build.version.sdk'), 10)
  console.log(
    `\n目标设备: ${manufacturer} ${model} (${target.serial}) · Android ${androidRelease} (API ${Number.isFinite(sdkInt) ? sdkInt : '未知'}) · 包名 ${opts.appId}`,
  )

  if (!opts.grantOnly) {
    const apkPath = opts.apk
      ? resolve(process.cwd(), opts.apk)
      : resolve(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk')
    if (!existsSync(apkPath)) {
      throw new Error(`未找到 APK 文件: ${apkPath}（可先运行 npm.cmd run android:dev-install 构建，或用 --apk 指定路径）`)
    }
    console.log(`\n==> 覆盖安装 APK: ${apkPath}`)
    const installRes = runAdbRaw(adb, ['-s', target.serial, 'install', '-r', '-g', apkPath], 120000)
    const installFailed = installRes.status !== 0 || /\bFailure\s*\[/i.test(installRes.output)
    if (installFailed) {
      console.error(`\n[安装失败] ${classifyInstallError(installRes.output)}`)
      if (installRes.output) {
        console.error(`原始输出:\n${installRes.output}`)
      }
      process.exitCode = 1
      return
    }
    console.log('APK 安装成功（保留本地数据与存储）。')
  } else {
    const pmCheck = runAdbRaw(adb, ['-s', target.serial, 'shell', 'pm', 'path', opts.appId], 15000)
    if (pmCheck.status !== 0 || !pmCheck.stdout.includes('package:')) {
      throw new Error(`设备上尚未安装 ${opts.appId}，请先运行 npm.cmd run android:install 或 android:dev-install`)
    }
  }

  console.log('\n==> 自动授予调试权限与无障碍/通知服务...')
  const plan = buildGrantPlan(sdkInt, opts.appId)
  const results = []
  const precheckCache = {}
  for (const step of plan) {
    try {
      const outcome = await executeGrantStep(adb, target.serial, step, opts, precheckCache)
      results.push(outcome)
    } catch (err) {
      const msg = formatError(err)
      results.push({
        id: step.id,
        label: step.label,
        ok: false,
        detail: msg,
        permissionMonitoringBlocked: isOppoPermissionMonitoringError(msg),
      })
    }
  }

  if (!opts.noLaunch) {
    await sleep(300)
    const launchRes = runShellChecked(adb, target.serial, [
      'shell',
      'am',
      'start',
      '-n',
      `${opts.appId}/com.xiaomao.focus.MainActivity`,
    ])
    results.push({
      id: 'launch',
      label: '启动应用 (MainActivity)',
      ok: launchRes.ok,
      detail: launchRes.ok ? '已启动' : launchRes.output || '启动失败',
      permissionMonitoringBlocked: false,
    })
  }

  console.log('\n执行结果汇总:')
  for (const item of results) {
    const badge = item.ok ? '[OK]' : '[WARN]'
    console.log(`  ${badge.padEnd(6)} ${item.label} -> ${item.detail}`)
  }

  const anyFailed = results.some((item) => !item.ok)
  const monitoringBlocked = results.some((item) => item.permissionMonitoringBlocked)
  const isOppoFamily = /oppo|oneplus|realme/i.test(manufacturer)

  if (monitoringBlocked || (anyFailed && isOppoFamily)) {
    printOppoChecklist()
  }

  if (anyFailed) {
    process.exitCode = 1
  } else {
    console.log('\n全部授权与启动流程已完成。')
  }
}

main().catch((err) => {
  console.error(`\n[失败] ${formatError(err)}`)
  process.exitCode = 1
})
