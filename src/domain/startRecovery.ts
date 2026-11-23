import { defaultProtection, type ProtectionPreferences } from './model'
import { resolveEffectiveProtection } from './protectionModules'
import { native } from '../platform/bridge'
import { readProtectionDiagnostics, type CapabilityDiagnostic } from '../platform/protectionDiagnostics'

export type StartErrorKind = 'recovery' | 'protection' | 'other'

export type ProtectionCapabilityId =
  | 'applications'
  | 'navigation'
  | 'antiClose'
  | 'dnd'
  | 'notifications'
  | 'recentTasks'
  | 'launcher'
  | 'wallpaper'
  | 'mainEntry'
  | 'strict'
  | 'recovery'

const CANCELLED_START_MESSAGE = '已取消开始专注'
const RECOVERY_ERROR_PATTERN =
  /故障恢复|待恢复|待系统释放|恢复责任|仍待处理|恢复项目|恢复状态/
const PROTECTION_ERROR_PATTERN =
  /待授权|未授权|尚未授权|不支持|仅支持\s*Android|未连接|尚未连接|无障碍|通知拦截|通知访问|勿扰|控制通知|开启小猫通知|桌面入口|任务卡|壁纸|原图|关闭此增强|关闭此选项|关闭学霸模式|明确关闭该选项/

export function isCancelledStartError(message: string): boolean {
  return message === CANCELLED_START_MESSAGE || message.includes(CANCELLED_START_MESSAGE)
}

export function classifyStartError(message: string): StartErrorKind {
  if (!message || isCancelledStartError(message)) return 'other'
  if (RECOVERY_ERROR_PATTERN.test(message)) return 'recovery'
  if (PROTECTION_ERROR_PATTERN.test(message)) return 'protection'
  return 'other'
}

function isUnreadyForFocusStart(row: CapabilityDiagnostic): boolean {
  if (row.id === 'strict' || row.id === 'mainEntry') return false
  return (
    !native ||
    !row.supported ||
    row.authorized === false ||
    row.connected === false ||
    !!row.recoveryPending ||
    row.state === 'failed'
  )
}

export async function getUnreadyProtectionIds(
  protection?: ProtectionPreferences,
): Promise<ProtectionCapabilityId[]> {
  const effective = protection ? resolveEffectiveProtection(protection) : defaultProtection()
  try {
    const diagnostics = await readProtectionDiagnostics(effective)
    return diagnostics.capabilities
      .filter((row) => row.selected && isUnreadyForFocusStart(row))
      .map((row) => row.id as ProtectionCapabilityId)
  } catch {
    return []
  }
}
