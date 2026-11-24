import { describe, expect, it } from 'vitest'
import {
  ACCESSIBILITY_CLASS,
  DEFAULT_APP_ID,
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
} from '../scripts/lib/android-dev-install.mjs'

describe('android-dev-install helpers', () => {
  it('parses CLI flags and validates appId', () => {
    expect(parseCliArgs([])).toEqual({
      serial: '',
      apk: '',
      appId: DEFAULT_APP_ID,
      skipBuild: false,
      grantOnly: false,
      noLaunch: false,
      noToggleAccessibility: false,
      help: false,
    })

    expect(
      parseCliArgs([
        '-s',
        'ABC123',
        '--apk=releases/app.apk',
        '--app-id',
        'com.xiaomao.focus.qa',
        '--skip-build',
        '--no-launch',
        '--no-toggle-accessibility',
      ]),
    ).toEqual({
      serial: 'ABC123',
      apk: 'releases/app.apk',
      appId: 'com.xiaomao.focus.qa',
      skipBuild: true,
      grantOnly: false,
      noLaunch: true,
      noToggleAccessibility: true,
      help: false,
    })

    expect(parseCliArgs(['--grant-only', '--help']).grantOnly).toBe(true)
    expect(parseCliArgs(['-h']).help).toBe(true)
    expect(() => parseCliArgs(['--unknown'])).toThrow(/未知参数/)
    expect(() => parseCliArgs(['--serial'])).toThrow(/缺少参数值/)
    expect(() => parseCliArgs(['--app-id', 'invalid_pkg'])).toThrow(/无效的包名/)
  })

  it('parses adb devices -l output and selects devices safely', () => {
    const raw = [
      'List of devices attached',
      '* daemon started successfully',
      'emulator-5580          device product:sdk_gphone64 model:sdk_gphone64 device:emu64xa transport_id:1',
      '8X9999AABBCC           device usb:1-2 product:PKB110 model:OPPO_Find_X8 device:OP5D0BL1 transport_id:2',
      'UNAUTH01               unauthorized usb:1-3 transport_id:3',
      '',
    ].join('\n')

    const parsed = parseAdbDevices(raw)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toMatchObject({ serial: 'emulator-5580', state: 'device', isEmulator: true })
    expect(parsed[1]).toMatchObject({
      serial: '8X9999AABBCC',
      state: 'device',
      model: 'OPPO_Find_X8',
      isEmulator: false,
    })
    expect(parsed[2]).toMatchObject({ serial: 'UNAUTH01', state: 'unauthorized', isEmulator: false })

    expect(selectDevice(parsed, '8X9999AABBCC').model).toBe('OPPO_Find_X8')
    expect(() => selectDevice(parsed, '')).toThrow(/多台在线设备/)
    expect(() => selectDevice(parsed, 'MISSING')).toThrow(/未找到指定设备/)
    expect(() => selectDevice(parsed, 'UNAUTH01')).toThrow(/允许 USB 调试/)
    expect(selectDevice([parsed[1]], '')).toMatchObject({ serial: '8X9999AABBCC' })
    expect(() => selectDevice([parsed[2]], '')).toThrow(/允许 USB 调试/)
    expect(() => selectDevice([], '')).toThrow(/未检测到已连接的 Android 设备/)
  })

  it('merges colon-delimited secure setting lists without losing other apps', () => {
    const empty = mergeColonList('null\n', 'com.xiaomao.focus', ACCESSIBILITY_CLASS)
    expect(empty.alreadyPresent).toBe(false)
    expect(empty.others).toEqual([])
    expect(empty.merged).toBe(`com.xiaomao.focus/${ACCESSIBILITY_CLASS}`)
    expect(empty.withoutOwn).toBe('')

    const withOthersAndShort = mergeColonList(
      'com.other.a/.ServiceA:com.xiaomao.focus/.FocusAccessibilityService:com.other.b/com.other.b.ServiceB',
      'com.xiaomao.focus',
      ACCESSIBILITY_CLASS,
    )
    expect(withOthersAndShort.alreadyPresent).toBe(true)
    expect(withOthersAndShort.others).toEqual([
      'com.other.a/.ServiceA',
      'com.other.b/com.other.b.ServiceB',
    ])
    expect(withOthersAndShort.merged).toBe(
      `com.other.a/.ServiceA:com.other.b/com.other.b.ServiceB:com.xiaomao.focus/${ACCESSIBILITY_CLASS}`,
    )
    expect(withOthersAndShort.withoutOwn).toBe(
      'com.other.a/.ServiceA:com.other.b/com.other.b.ServiceB',
    )

    const qaList = mergeColonList(
      `com.xiaomao.focus/${ACCESSIBILITY_CLASS}:com.xiaomao.focus.qa/${ACCESSIBILITY_CLASS}`,
      'com.xiaomao.focus.qa',
      ACCESSIBILITY_CLASS,
    )
    expect(qaList.alreadyPresent).toBe(true)
    expect(qaList.others).toEqual([`com.xiaomao.focus/${ACCESSIBILITY_CLASS}`])
    expect(qaList.withoutOwn).toBe(`com.xiaomao.focus/${ACCESSIBILITY_CLASS}`)

    const nls = mergeColonList('', 'com.xiaomao.focus', NOTIFICATION_LISTENER_CLASS)
    expect(nls.merged).toBe(`com.xiaomao.focus/${NOTIFICATION_LISTENER_CLASS}`)
  })

  it('builds SDK-aware grant plans', () => {
    const api28 = buildGrantPlan(28, 'com.xiaomao.focus').map((s) => s.id)
    expect(api28).toEqual([
      'batteryOptimization',
      'installUnknownApps',
      'notificationListener',
      'accessibilityService',
    ])

    const api31 = buildGrantPlan(31, 'com.xiaomao.focus').map((s) => s.id)
    expect(api31).toContain('exactAlarm')
    expect(api31).toContain('dndAccess')
    expect(api31).not.toContain('restrictedSettings')
    expect(api31).not.toContain('postNotifications')

    const api33 = buildGrantPlan(33, 'com.xiaomao.focus').map((s) => s.id)
    expect(api33).toContain('restrictedSettings')
    expect(api33).toContain('postNotifications')

    const api36Qa = buildGrantPlan(36, 'com.xiaomao.focus.qa')
    expect(api36Qa).toHaveLength(8)
    expect(api36Qa.find((s) => s.id === 'postNotifications')?.args).toContain('com.xiaomao.focus.qa')
    expect(buildGrantPlan(Number.NaN, 'com.xiaomao.focus')).toHaveLength(8)
  })

  it('detects OPPO permission monitoring errors and classifies install failures safely', () => {
    expect(
      isOppoPermissionMonitoringError(
        'SecurityException: Permission denial: writing to settings requires:android.permission.WRITE_SECURE_SETTINGS',
      ),
    ).toBe(true)
    expect(isOppoPermissionMonitoringError('Success')).toBe(false)

    expect(classifyInstallError('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]')).toContain('签名不一致')
    expect(classifyInstallError('Failure [INSTALL_FAILED_USER_RESTRICTED]')).toContain('USB 安装')
    expect(classifyInstallError('Failure [INSTALL_FAILED_VERSION_DOWNGRADE]')).toContain('versionCode')
    expect(classifyInstallError('Operation not allowed')).toContain('禁止权限监控')
  })

  it('detects authorizing devices and parses read-only Android permission outputs safely', () => {
    expect(hasAuthorizingDevice([{ serial: 'a5775ecd', state: 'authorizing' }], 'a5775ecd')).toBe(true)
    expect(hasAuthorizingDevice([{ serial: 'a5775ecd', state: 'device' }], 'a5775ecd')).toBe(false)
    expect(hasAuthorizingDevice([{ serial: 'a5775ecd', state: 'authorizing' }], '')).toBe(true)
    expect(
      hasAuthorizingDevice(
        [
          { serial: 'a5775ecd', state: 'device' },
          { serial: 'other', state: 'authorizing' },
        ],
        '',
      ),
    ).toBe(false)

    const dumpsysPkg = `
      User 0: ceDataInode=453160 installed=true
        runtime permissions:
          android.permission.POST_NOTIFICATIONS: granted=true, flags=[ USER_SET ]
      User 999: ceDataInode=0 installed=false
        runtime permissions:
          android.permission.POST_NOTIFICATIONS: granted=false, flags=[]
    `
    expect(isRuntimePermissionGranted(dumpsysPkg, 'android.permission.POST_NOTIFICATIONS', 0)).toBe(true)
    expect(isRuntimePermissionGranted(dumpsysPkg, 'android.permission.POST_NOTIFICATIONS', 999)).toBe(false)

    expect(
      isAppOpAllowed('ACCESS_RESTRICTED_SETTINGS: allow; time=+43m ago; rejectTime=+2d ago', 'ACCESS_RESTRICTED_SETTINGS'),
    ).toBe(true)
    expect(isAppOpAllowed('Uid mode: SCHEDULE_EXACT_ALARM: allow', 'SCHEDULE_EXACT_ALARM')).toBe(true)
    expect(isAppOpAllowed('Uid mode: SCHEDULE_EXACT_ALARM: default', 'SCHEDULE_EXACT_ALARM')).toBe(false)
    expect(isAppOpAllowed('No operations.', 'REQUEST_INSTALL_PACKAGES')).toBe(false)

    const whitelist = `user,com.xiaomao.focus.qa,10740\nuser,com.xiaomao.focus,10739\n`
    expect(isBatteryWhitelistPresent(whitelist, 'com.xiaomao.focus')).toBe(true)
    expect(isBatteryWhitelistPresent('user,com.xiaomao.focus.qa,10740\n', 'com.xiaomao.focus')).toBe(false)

    const dumpsysNotif = `
      Condition providers:
        Allowed condition providers:
          com.xiaomao.focus:com.google.android.gms (user: 0 isPrimary: true)
          com.google.android.gms (user: 10 isPrimary: true)
        Approved uids for user 0: [10739]
    `
    expect(isDndAccessGranted(dumpsysNotif, 'com.xiaomao.focus', 0)).toBe(true)
    expect(isDndAccessGranted(dumpsysNotif, 'com.other.app', 0)).toBe(false)
    expect(isDndAccessGranted(dumpsysNotif, 'com.xiaomao.focus', 10)).toBe(false)
  })
})
