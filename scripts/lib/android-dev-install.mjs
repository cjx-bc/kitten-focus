export const DEFAULT_APP_ID = 'com.xiaomao.focus'
export const ACCESSIBILITY_CLASS = 'com.xiaomao.focus.FocusAccessibilityService'
export const NOTIFICATION_LISTENER_CLASS = 'com.xiaomao.focus.FocusNotificationListener'

const APP_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/
const EMULATOR_SERIAL_PATTERN = /^(?:emulator-\d+|127\.0\.0\.1:\d+)$/

export function parseCliArgs(argv) {
  const opts = {
    serial: '',
    apk: '',
    appId: DEFAULT_APP_ID,
    skipBuild: false,
    grantOnly: false,
    noLaunch: false,
    noToggleAccessibility: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      opts.help = true
      continue
    }
    if (arg === '--skip-build') {
      opts.skipBuild = true
      continue
    }
    if (arg === '--grant-only') {
      opts.grantOnly = true
      continue
    }
    if (arg === '--no-launch') {
      opts.noLaunch = true
      continue
    }
    if (arg === '--no-toggle-accessibility') {
      opts.noToggleAccessibility = true
      continue
    }

    const readValue = (flagName) => {
      const next = argv[i + 1]
      if (!next || next.startsWith('-')) {
        throw new Error(`选项 ${flagName} 缺少参数值`)
      }
      i += 1
      return next
    }

    if (arg === '--serial' || arg === '-s') {
      opts.serial = readValue(arg)
      continue
    }
    if (arg.startsWith('--serial=')) {
      const val = arg.slice('--serial='.length)
      if (!val) throw new Error('选项 --serial 缺少参数值')
      opts.serial = val
      continue
    }
    if (arg === '--apk') {
      opts.apk = readValue(arg)
      continue
    }
    if (arg.startsWith('--apk=')) {
      const val = arg.slice('--apk='.length)
      if (!val) throw new Error('选项 --apk 缺少参数值')
      opts.apk = val
      continue
    }
    if (arg === '--app-id') {
      opts.appId = readValue(arg)
      continue
    }
    if (arg.startsWith('--app-id=')) {
      const val = arg.slice('--app-id='.length)
      if (!val) throw new Error('选项 --app-id 缺少参数值')
      opts.appId = val
      continue
    }

    throw new Error(`未知参数: ${arg}（运行 --help 查看可用选项）`)
  }

  if (!APP_ID_PATTERN.test(opts.appId)) {
    throw new Error(`无效的包名 (--app-id): ${opts.appId}`)
  }

  return opts
}

export function parseAdbDevices(output) {
  if (!output) return []
  const devices = []
  for (const rawLine of String(output).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('List of devices') || line.startsWith('*')) continue
    const tokens = line.split(/\s+/)
    if (tokens.length < 2) continue
    const serial = tokens[0]
    const state = tokens[1]
    let model = ''
    let device = ''
    let product = ''
    for (const token of tokens.slice(2)) {
      const idx = token.indexOf(':')
      if (idx <= 0) continue
      const key = token.slice(0, idx)
      const val = token.slice(idx + 1)
      if (key === 'model') model = val
      else if (key === 'device') device = val
      else if (key === 'product') product = val
    }
    devices.push({
      serial,
      state,
      model,
      device,
      product,
      isEmulator: EMULATOR_SERIAL_PATTERN.test(serial),
    })
  }
  return devices
}

export function selectDevice(devices, explicitSerial) {
  const target = typeof explicitSerial === 'string' ? explicitSerial.trim() : ''
  if (target) {
    const match = devices.find((d) => d.serial === target)
    if (!match) {
      throw new Error(`未找到指定设备 ${target}，请检查 USB 连接或运行 adb devices 确认序列号。`)
    }
    if (match.state === 'unauthorized') {
      throw new Error(`设备 ${target} 未授权 USB 调试，请在手机弹窗点击「允许 USB 调试」。`)
    }
    if (match.state !== 'device') {
      throw new Error(`设备 ${target} 当前状态为 ${match.state}，无法执行安装或授权。`)
    }
    return match
  }

  const online = devices.filter((d) => d.state === 'device')
  if (online.length === 1) return online[0]

  if (online.length === 0) {
    const unauthorized = devices.filter((d) => d.state === 'unauthorized')
    if (unauthorized.length > 0) {
      const names = unauthorized.map((d) => d.serial).join(', ')
      throw new Error(`检测到未授权设备 (${names})，请在手机屏幕点击「允许 USB 调试」后重试。`)
    }
    throw new Error('未检测到已连接的 Android 设备。请用数据线连接手机，并在「开发者选项」中开启「USB 调试」。')
  }

  const summary = online
    .map((d) => `  - ${d.serial}${d.model ? ` (${d.model})` : ''}`)
    .join('\n')
  throw new Error(`检测到多台在线设备，请使用 --serial <id> 或环境变量 ANDROID_SERIAL 指定一台：\n${summary}`)
}

export function mergeColonList(rawValue, packageName, serviceClassName) {
  const ownComponent = `${packageName}/${serviceClassName}`
  const shortName = serviceClassName.split('.').pop()
  const shortComponent = `${packageName}/.${shortName}`
  const isOwn = (entry) => entry === ownComponent || entry === shortComponent

  const existing = String(rawValue ?? '')
    .split(':')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== 'null')

  const alreadyPresent = existing.some(isOwn)
  const others = existing.filter((entry) => !isOwn(entry))

  return {
    existing,
    others,
    alreadyPresent,
    ownComponent,
    merged: [...others, ownComponent].join(':'),
    withoutOwn: others.join(':'),
  }
}

export function buildGrantPlan(sdkInt, appId = DEFAULT_APP_ID) {
  const effectiveSdk = Number.isFinite(sdkInt) && sdkInt > 0 ? sdkInt : 35
  const steps = [
    {
      id: 'restrictedSettings',
      label: '解除受限设置 (ACCESS_RESTRICTED_SETTINGS)',
      minSdk: 33,
      kind: 'adb',
      args: ['shell', 'appops', 'set', appId, 'ACCESS_RESTRICTED_SETTINGS', 'allow'],
    },
    {
      id: 'postNotifications',
      label: '通知权限 (POST_NOTIFICATIONS)',
      minSdk: 33,
      kind: 'adb',
      args: ['shell', 'pm', 'grant', appId, 'android.permission.POST_NOTIFICATIONS'],
    },
    {
      id: 'exactAlarm',
      label: '准时闹钟提醒 (SCHEDULE_EXACT_ALARM)',
      minSdk: 31,
      kind: 'adb',
      args: ['shell', 'appops', 'set', appId, 'SCHEDULE_EXACT_ALARM', 'allow'],
    },
    {
      id: 'batteryOptimization',
      label: '后台运行不限制 (电池优化白名单)',
      minSdk: 23,
      kind: 'adb',
      args: ['shell', 'dumpsys', 'deviceidle', 'whitelist', `+${appId}`],
    },
    {
      id: 'installUnknownApps',
      label: '允许安装应用内更新 (REQUEST_INSTALL_PACKAGES)',
      minSdk: 26,
      kind: 'adb',
      args: ['shell', 'appops', 'set', appId, 'REQUEST_INSTALL_PACKAGES', 'allow'],
    },
    {
      id: 'dndAccess',
      label: '勿扰权限 (DND Policy Access)',
      minSdk: 29,
      kind: 'adb',
      args: ['shell', 'cmd', 'notification', 'allow_dnd', appId],
    },
    {
      id: 'notificationListener',
      label: '通知使用权 (NotificationListener)',
      minSdk: 26,
      kind: 'notificationListener',
      args: ['shell', 'cmd', 'notification', 'allow_listener', `${appId}/${NOTIFICATION_LISTENER_CLASS}`],
    },
    {
      id: 'accessibilityService',
      label: '无障碍服务 (FocusAccessibilityService)',
      minSdk: 24,
      kind: 'accessibilityService',
      args: [
        'shell',
        'settings',
        'put',
        'secure',
        'enabled_accessibility_services',
        `${appId}/${ACCESSIBILITY_CLASS}`,
      ],
    },
  ]

  return steps.filter((step) => effectiveSdk >= step.minSdk)
}

export function isOppoPermissionMonitoringError(output) {
  return typeof output === 'string' &&
    /WRITE_SECURE_SETTINGS|SecurityException|Permission denial|Operation not allowed/i.test(output)
}

export function classifyInstallError(output) {
  const text = String(output ?? '').trim()
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES/i.test(text)) {
    return '签名不一致导致无法直接覆盖安装（INSTALL_FAILED_UPDATE_INCOMPATIBLE）。为避免丢失本地专注数据，脚本不会自动卸载；请先在应用「我的 → 本地备份与恢复」导出备份，再手动卸载旧版后重试。'
  }
  if (/INSTALL_FAILED_USER_RESTRICTED|INSTALL_FAILED_ABORTED/i.test(text)) {
    return '安装被手机系统拦截或超时未确认（INSTALL_FAILED_USER_RESTRICTED）。请解锁手机并留意屏幕上的 USB 安装确认弹窗，或在 OPPO「开发者选项」中开启 USB 安装相关开关。'
  }
  if (/INSTALL_FAILED_VERSION_DOWNGRADE/i.test(text)) {
    return '目标 APK 的 versionCode 低于手机已安装版本（INSTALL_FAILED_VERSION_DOWNGRADE），无法降级覆盖；请提高 versionCode 后重新构建。'
  }
  if (isOppoPermissionMonitoringError(text)) {
    return '系统拒绝写入安全设置或修改应用权限。请在 OPPO 手机「设置 → 系统设置（或 其他设置）→ 开发者选项」底部开启「禁止权限监控」，然后重新运行 npm.cmd run android:grant。'
  }
  return text || '安装失败，请检查 USB 连接和设备日志。'
}
