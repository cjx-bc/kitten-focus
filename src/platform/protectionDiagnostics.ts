import type { ProtectionPreferences } from '../domain/model'
import { defaultProtection } from '../domain/model'
import { controlDriver, native, protectionDriver, recoveryDriver } from './bridge'
import { dndDriver } from './dnd'
import { notificationDriver } from './notifications'

export type ProtectionEntryState = 'off' | 'authorization' | 'ready' | 'protecting' | 'failed'
export const protectionStateLabels: Record<ProtectionEntryState, string> = {
  off: '未开启', authorization: '待授权', ready: '已就绪', protecting: '保护中', failed: '保护失效',
}
export interface CapabilityDiagnostic {
  id: string
  title: string
  selected: boolean
  supported: boolean
  authorized: boolean | null
  connected: boolean | null
  requested: boolean | null
  verified: boolean | null
  active: boolean | null
  recoveryPending: boolean | null
  state: ProtectionEntryState
  phase: string
  reason: string
  effect: string
  settings?: 'accessibility' | 'notifications' | 'dnd' | 'controlNotification'
}
export interface ProtectionDiagnostics {
  state: ProtectionEntryState
  capabilities: CapabilityDiagnostic[]
  identity: string
}
const failurePhases = ['failed', 'error', 'restoration_failed', 'recovery_pending', 'disconnected', 'inactive', 'missing', 'user_disabled', 'user_modified']
const withdrawnPhases = ['recovered', 'withdrawn', 'restored', 'released', 'user_choice_preserved', 'declined']

function entryState(row: CapabilityDiagnostic): ProtectionEntryState {
  if (row.recoveryPending && (!row.requested || withdrawnPhases.includes(row.phase))) return 'failed'
  if (withdrawnPhases.includes(row.phase)) return 'off'
  if (!row.selected && !row.requested) return 'off'
  if (!row.supported || failurePhases.includes(row.phase)) return 'failed'
  if (row.authorized === false || row.connected === false) return row.requested ? 'failed' : 'authorization'
  if (row.active) return 'protecting'
  return 'ready'
}

/** Read-only aggregation: a failing OS module must not hide results from other capabilities. */
export async function readProtectionDiagnostics(saved: Partial<ProtectionPreferences>): Promise<ProtectionDiagnostics> {
  const preferences = { ...defaultProtection(), ...saved }
  const [protection, control, notifications, dnd, recentTasks, launcher, recovery, wallpaper] = await Promise.allSettled([
    protectionDriver.status(), controlDriver.observe(), notificationDriver.read(), dndDriver.read(),
    protectionDriver.recentTasks(), protectionDriver.launcher(), recoveryDriver.preview(),
    protectionDriver.wallpaper(),
  ])
  const rows: CapabilityDiagnostic[] = []
  function add(id: string, title: string, selected: boolean, values: Partial<CapabilityDiagnostic>) {
    const row: CapabilityDiagnostic = { id, title, selected, supported: true, authorized: null, connected: null,
      requested: false, verified: null, active: false, recoveryPending: false, state: 'off', phase: 'off', reason: '', effect: '', ...values }
    row.state = entryState(row); rows.push(row)
  }
  function unavailable(id: string, title: string, selected: boolean, result: PromiseRejectedResult) {
    add(id, title, selected, { phase: 'failed', requested: null, active: null, recoveryPending: null, reason: `检查失败：${result.reason instanceof Error ? result.reason.message : String(result.reason)}。请重新检查；未确认保护效果。` })
    rows[rows.length - 1]!.state = 'failed'
  }
  const enhanced = (key: string) => preferences.enhancements.includes(key)
  const observation = control.status === 'fulfilled' ? control.value : undefined
  const session = observation?.owner === 'lock' ? observation.lock?.session : observation?.focus.session
  if (protection.status === 'fulfilled') {
    const value = protection.value
    add('applications', '学霸模式与锁机应用限制', preferences.study, {
      supported: value.supported, authorized: value.authorized, connected: value.connected,
      requested: control.status === 'rejected' ? null : session?.protection?.study === true, active: value.active, phase: value.state, reason: value.reason,
      settings: 'accessibility', effect: value.active ? '原生应用限制执行器正在运行；具体应用与厂商行为仍以实际设备为准。' : '当前没有执行应用限制。',
    })
    for (const [id, title, key, capability] of [
      ['navigation', '限制桌面与最近任务', 'navigationHomeRecents', value.navigation],
      ['antiClose', '精确防关闭', 'preciseAntiClose', value.antiClose],
    ] as const) {
      add(id, title, enhanced(key), capability ? {
        supported: capability.supported, authorized: capability.authorized, connected: capability.connected,
        requested: capability.requested, active: capability.active, verified: !!capability.lastReturnedAt, phase: capability.state,
        reason: capability.reason, settings: 'accessibility',
        effect: capability.lastReturnedAt ? `已观察到本轮返回：${new Date(capability.lastReturnedAt).toLocaleTimeString()}。这不是系统防强停或防卸载保证。` : '尚未观察到本轮实际返回；授权或执行器就绪不代表已验证拦截。',
      } : { supported: false, reason: '当前版本未返回此能力状态，不能确认支持或效果。' })
    }
  } else {
    unavailable('applications', '学霸模式与锁机应用限制', preferences.study, protection)
    unavailable('navigation', '限制桌面与最近任务', enhanced('navigationHomeRecents'), protection)
    unavailable('antiClose', '精确防关闭', enhanced('preciseAntiClose'), protection)
  }
  if (notifications.status === 'fulfilled') {
    const value = notifications.value
    add('notifications', '通知拦截与释放', preferences.interceptNotifications, {
      supported: value.supported, authorized: value.authorized, connected: value.connected, requested: value.requested,
      active: value.active, verified: value.snoozedCount > 0, recoveryPending: value.recoveryPending && !value.active,
      phase: value.phase, reason: value.error || value.reason, settings: 'notifications',
      effect: `系统核实暂缓 ${value.snoozedCount} 条；待核实 ${value.pendingCount} 条；已观察原通知恢复 ${value.restoredCount} 条；已撤回或不存在 ${value.absentCount} 条；释放失败 ${value.releaseFailedCount} 条。不存在不等于已恢复。`,
    })
  } else unavailable('notifications', '通知拦截与释放', preferences.interceptNotifications, notifications)
  if (dnd.status === 'fulfilled') {
    const value = dnd.value
    add('dnd', '声音免打扰辅助', preferences.dnd, {
      supported: value.supported, authorized: value.permissionGranted, requested: value.requested,
      active: value.phase === 'active' && value.ruleActive === true, verified: value.verified, recoveryPending: value.recoveryPending,
      phase: value.phase, reason: value.error || (!value.supported ? '需要 Android 10 或更新系统的本机版本。' : value.phase === 'requested' ? '声音规则已请求，系统尚未确认激活。' : '独立声音规则减少通知声音和振动；通知仍可显示，其他勿扰规则也可能影响结果。'),
      settings: 'dnd', effect: value.ruleActive === true ? '系统已确认小猫声音规则激活；本页不验证实际声学效果。' : value.ruleActive === false ? '系统确认小猫声音规则当前未激活。' : '系统尚未提供独立规则激活核验。',
    })
  } else unavailable('dnd', '声音免打扰辅助', preferences.dnd, dnd)
  for (const [id, title, key, result] of [
    ['recentTasks', '隐藏最近任务卡片', 'recentTasksHidden', recentTasks],
    ['launcher', '隐藏桌面图标', 'launcherIconHidden', launcher],
  ] as const) {
    if (result.status === 'rejected') { unavailable(id, title, enhanced(key), result); continue }
    const value = result.value
    add(id, title, enhanced(key), { supported: value.supported, requested: value.requested, active: value.active,
      verified: value.verified, recoveryPending: value.recoveryPending, phase: value.phase,
      authorized: id === 'launcher' ? value.recoveryAvailable : null,
      settings: id === 'launcher' ? 'controlNotification' : undefined,
      reason: value.error || (id === 'launcher' ? '隐藏前需要可达的控制通知与恢复入口；系统组件状态不代表启动器缓存已刷新。' : '只隐藏小猫自己的任务卡片，保留原状态用于恢复；不保证免于系统强停。'),
      effect: value.verified ? '系统状态已核验；桌面与最近任务的实际显示仍受系统或启动器影响。' : '尚未核验本轮系统更改。',
    })
  }
  if (control.status === 'fulfilled') {
    const main = observation?.mainEntry
    add('mainEntry', '锁机时限制主界面入口', enhanced('lockMainInterfaceRestricted'), {
      supported: native && !!main, requested: main?.requested, active: main?.active,
      phase: main?.withdrawn ? 'withdrawn' : observation?.needsReconcile ? 'failed' : main?.active ? 'active' : 'off',
      reason: '仅用于独立锁机。普通启动与业务导航进入控制页；权限、帮助、紧急及故障恢复始终可达。',
      effect: main?.active ? '原生入口策略正在限制业务路由。' : '当前普通入口未受此项限制。',
    })
    const strict = session?.strictMode === true && (observation?.owner === 'lock' || observation?.focus.session?.mode === 'countdown')
    add('strict', '严格计时约束', preferences.strict, { requested: strict, active: strict && !observation?.needsReconcile,
      phase: strict && observation?.needsReconcile ? 'failed' : 'off', verified: strict,
      reason: '严格模式只约束倒计时；独立锁机使用各自的严格选项。正计时仍可主动正常结束。',
      effect: strict ? '本轮会话已保存严格约束，暂停、取消和提前结束会被拒绝。' : '本轮没有严格计时约束。',
    })
  } else {
    unavailable('mainEntry', '锁机时限制主界面入口', enhanced('lockMainInterfaceRestricted'), control)
    unavailable('strict', '严格计时约束', preferences.strict, control)
  }
  if (wallpaper.status === 'fulfilled') {
    const value = wallpaper.value
    add('wallpaper', '壁纸辅助保护', enhanced('wallpaperProtection'), { supported: value.supported,
      requested: value.requested, verified: value.verified, active: value.active, recoveryPending: value.recoveryPending,
      phase: value.phase, reason: value.error || '先保存可恢复的原状态，再经 Android 确认选择；原动态组件恢复仍需系统确认。裁剪与私有设置不能保证。',
      effect: value.selected ? '系统观察到小猫主屏动态壁纸；实际服务关联与普通进程重连需设备证据，不代表防强停。' : '系统未观察到小猫主屏动态壁纸。预览与本轮请求不等于选择成功。',
    })
  } else unavailable('wallpaper', '壁纸辅助保护', enhanced('wallpaperProtection'), wallpaper)
  if (recovery.status === 'fulfilled') {
    const ids: Record<string, string> = { applicationRestriction: 'applications', navigationRestriction: 'navigation',
      preciseAntiClose: 'antiClose', lockMainInterfaceRestricted: 'mainEntry', notificationInterception: 'notifications',
      soundDnd: 'dnd', recentTasksHidden: 'recentTasks', launcherIconHidden: 'launcher', wallpaperProtection: 'wallpaper' }
    for (const step of recovery.value.steps) {
      const row = rows.find(value => value.id === ids[step.capability])
      if (!row || step.status === 'restored') continue
      row.recoveryPending = true
      row.reason += ` 恢复项目：${step.reason}`
      if (step.status === 'failed') { row.phase = 'restoration_failed'; row.active = false }
      row.state = entryState(row)
    }
  } else unavailable('recovery', '恢复清单检查', false, recovery)
  const identity = protection.status === 'fulfilled' ? protection.value.antiClose?.identity : undefined
  return {
    state: rows.some(row => row.state === 'failed') ? 'failed' : rows.some(row => row.state === 'authorization') ? 'authorization'
      : rows.some(row => row.state === 'protecting') ? 'protecting' : rows.some(row => row.state === 'ready') ? 'ready' : 'off',
    capabilities: rows,
    identity: !native || !identity || identity.unknown ? '未核实本机设备管理身份，不能据此判断系统策略能力。'
      : `普通管理员：${identity.ordinaryAdmin ? '已激活' : '未激活'}；设备所有者：${identity.deviceOwner ? '是' : '否'}；资料所有者：${identity.profileOwner ? '是' : '否'}。当前精确防关闭只使用普通无障碍，不施加系统防卸载策略。`,
  }
}
