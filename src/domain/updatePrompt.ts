export const UPDATE_PROMPT_DISMISSED_KEY = 'xiaomao-update-prompt-dismissed-code'

export interface UpdatePromptContext {
  native: boolean
  ready: boolean
  releaseCode: number | null
  promptedCode: number | null
  dismissedCode: number | null
  hasActiveSession: boolean
  isFullscreenRoute: boolean
  hasOpenDialog: boolean
  recoveryOpen: boolean
  strictConfirmationOpen: boolean
}

/** Reads the highest versionCode explicitly dismissed by the user ("稍后再说"). */
export function readDismissedUpdateCode(
  storage?: Pick<Storage, 'getItem'> | null,
): number | null {
  try {
    const store = storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : storage
    const raw = store?.getItem(UPDATE_PROMPT_DISMISSED_KEY)
    if (!raw || !raw.trim()) return null
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

/** Remembers a dismissed versionCode so subsequent launches stay quiet until a newer build arrives. */
export function saveDismissedUpdateCode(
  code: number,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  if (!Number.isInteger(code) || code <= 0) return
  try {
    const store = storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : storage
    store?.setItem(UPDATE_PROMPT_DISMISSED_KEY, String(code))
  } catch {
    // Ignore storage unavailability in restricted contexts.
  }
}

/** Ensures the launch update sheet shows only when idle on a main tab with zero open dialogs. */
export function shouldAutoPromptUpdate(ctx: UpdatePromptContext): boolean {
  return (
    ctx.native &&
    ctx.ready &&
    ctx.releaseCode !== null &&
    ctx.releaseCode > 0 &&
    ctx.releaseCode !== ctx.promptedCode &&
    (ctx.dismissedCode === null || ctx.releaseCode > ctx.dismissedCode) &&
    !ctx.hasActiveSession &&
    !ctx.isFullscreenRoute &&
    !ctx.hasOpenDialog &&
    !ctx.recoveryOpen &&
    !ctx.strictConfirmationOpen
  )
}
