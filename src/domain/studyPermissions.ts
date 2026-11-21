import type {
  LauncherStatus,
  ProtectionPreferences,
  ProtectionStatus,
  RecentTasksStatus,
  WallpaperStatus,
} from './model'
import { getModuleSubItems, migrateProtectionPreferences } from './protectionModules'
import type { DndStatus } from '../platform/dnd'
import type { NotificationStatus } from '../platform/notifications'

export type StudyPermissionId =
  | 'accessibility'
  | 'dnd'
  | 'notificationListener'
  | 'controlNotification'
  | 'wallpaperBaseline'

export interface LivePermissionStates {
  protection?: ProtectionStatus | null
  dnd?: DndStatus | null
  notification?: NotificationStatus | null
  recentTasks?: RecentTasksStatus | null
  launcher?: LauncherStatus | null
  wallpaper?: WallpaperStatus | null
}

export interface RequiredPermissionItem {
  id: StudyPermissionId
  title: string
  level: 'required' | 'optional'
  usedBy: string[]
  purpose: string
  supported: boolean
  authorized: boolean
  connected: boolean
  ready: boolean
  statusText: string
  actionLabel: string
}

export function collectRequiredPermissions(
  prefs: Partial<ProtectionPreferences> | undefined,
  live: LivePermissionStates,
): RequiredPermissionItem[] {
  const migrated = migrateProtectionPreferences(prefs)
  const modules = migrated.modules!
  const masterOn = Boolean(modules.master)

  const appsOn = masterOn && modules.apps.enabled
  const strictOn = masterOn && modules.strict.enabled
  const quietOn = masterOn && modules.quiet.enabled

  const appsSub = getModuleSubItems('apps', modules.apps)
  const strictSub = getModuleSubItems('strict', modules.strict)
  const quietSub = getModuleSubItems('quiet', modules.quiet)

  const list: RequiredPermissionItem[] = []

  // 1. Accessibility
  const accessUsers: string[] = []
  if (appsOn && appsSub.restrict) accessUsers.push('应用限制 · 限制白名单外应用')
  if (strictOn && strictSub.navigation) accessUsers.push('严格模式 · 限制桌面与最近任务')
  if (strictOn && strictSub.antiClose) accessUsers.push('严格模式 · 精确防关闭')
  if (accessUsers.length > 0) {
    const p = live.protection
    const supported = Boolean(p?.supported)
    const authorized = Boolean(p?.authorized)
    const connected = Boolean(p?.connected)
    const ready = supported && authorized && connected
    const statusText = !p
      ? '检查中'
      : !supported
        ? '本机不支持'
        : !authorized
          ? '未授权 · 未生效'
          : !connected
            ? '已授权 · 服务未连接'
            : '已就绪'
    list.push({
      id: 'accessibility',
      title: '无障碍服务',
      level: 'required',
      usedBy: accessUsers,
      purpose: '识别当前前台应用与桌面/最近任务窗口，不读取其他应用正文。',
      supported,
      authorized,
      connected,
      ready,
      statusText,
      actionLabel: authorized && !connected ? '检查服务连接' : '前往系统设置',
    })
  }

  // 2. DND permission
  if (quietOn && quietSub.sound) {
    const d = live.dnd
    const supported = Boolean(d?.supported)
    const authorized = Boolean(d?.permissionGranted)
    const ready = supported && authorized
    const statusText = !d
      ? '检查中'
      : !supported
        ? '本机不支持'
        : authorized
          ? '已就绪'
          : '未授权 · 未生效'
    list.push({
      id: 'dnd',
      title: '勿扰权限',
      level: 'optional',
      usedBy: ['免打扰 · 静音与振动'],
      purpose: '减少通知声音与振动干扰，保留来电、闹钟与媒体。',
      supported,
      authorized,
      connected: authorized,
      ready,
      statusText,
      actionLabel: '前往勿扰设置',
    })
  }

  // 3. Notification Listener
  if (quietOn && quietSub.intercept) {
    const n = live.notification
    const supported = Boolean(n?.supported)
    const authorized = Boolean(n?.authorized)
    const connected = Boolean(n?.connected)
    const ready = supported && authorized && connected
    const statusText = !n
      ? '检查中'
      : !supported
        ? '本机不支持'
        : !authorized
          ? '未授权 · 未生效'
          : !connected
            ? '已授权 · 监听未连接'
            : '已就绪'
    list.push({
      id: 'notificationListener',
      title: '通知使用权',
      level: 'optional',
      usedBy: ['免打扰 · 拦截通知'],
      purpose: '专注期间暂缓白名单外通知并在结束后请求释放，不保存正文。',
      supported,
      authorized,
      connected,
      ready,
      statusText,
      actionLabel: authorized && !connected ? '重连通知监听' : '前往通知访问',
    })
  }

  // 4. Control Notification (for hideRecents / hideLauncher)
  const controlUsers: string[] = []
  if (strictOn && strictSub.hideRecents) controlUsers.push('严格模式 · 隐藏最近任务卡片')
  if (strictOn && strictSub.hideLauncher) controlUsers.push('严格模式 · 隐藏桌面图标')
  if (controlUsers.length > 0) {
    const r = live.recentTasks
    const l = live.launcher
    const refStatus = strictSub.hideLauncher ? (l ?? r) : (r ?? l)
    const supported = Boolean(refStatus?.supported)
    const authorized = Boolean(refStatus?.recoveryAvailable)
    const ready = supported && authorized
    const statusText = !refStatus
      ? '检查中'
      : !supported
        ? '本机不支持'
        : authorized
          ? '已就绪'
          : '未开启通知 · 未生效'
    list.push({
      id: 'controlNotification',
      title: '通知权限（恢复入口）',
      level: 'optional',
      usedBy: controlUsers,
      purpose: '隐藏桌面图标或任务卡后，需要通过控制通知返回小猫与故障恢复页。',
      supported,
      authorized,
      connected: authorized,
      ready,
      statusText,
      actionLabel: '允许通知',
    })
  }

  // 5. Wallpaper baseline
  if (strictOn && strictSub.wallpaper) {
    const w = live.wallpaper
    const supported = Boolean(w?.supported)
    const authorized = Boolean(w?.prepared)
    const ready = supported && authorized
    const statusText = !w
      ? '检查中'
      : !supported
        ? '本机不支持'
        : authorized
          ? '原状态已保存'
          : '待保存原状态'
    list.push({
      id: 'wallpaperBaseline',
      title: '壁纸原状态与确认',
      level: 'optional',
      usedBy: ['严格模式 · 壁纸辅助保护'],
      purpose: '先保存可恢复的原壁纸基线，开始后由系统选择器确认更换。',
      supported,
      authorized,
      connected: authorized,
      ready,
      statusText,
      actionLabel: '前往准备原状态',
    })
  }

  return list
}
