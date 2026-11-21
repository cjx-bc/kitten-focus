import type { Router } from 'vue-router'

export const STUDY_FOCUS_SAFE_PATHS = [
  '/focus',
  '/rest',
  '/permissions',
  '/help',
  '/emergency',
  '/recovery',
] as const

export function isStudyFocusSafePath(path: string): boolean {
  return (STUDY_FOCUS_SAFE_PATHS as readonly string[]).includes(path)
}

export function isStudySessionLocked(
  session: { protection?: { study?: boolean; studyLocked?: boolean } | null } | null | undefined,
): boolean {
  return session?.protection?.study === true || session?.protection?.studyLocked === true
}

export function resolveStudyFocusEntry(path: string, studyLocked: boolean): string {
  return studyLocked && !isStudyFocusSafePath(path) ? '/focus' : path
}

/** Every navigation asks the same native owner that handles Android entry intents. */
export function installMainEntryGuard(
  router: Router,
  resolve: (path: string) => Promise<string>,
  isStudyLocked?: () => boolean,
) {
  router.beforeEach(async (to) => {
    const nativeDestination = await resolve(to.path)
    const destination =
      nativeDestination === to.path && isStudyLocked?.() === true
        ? resolveStudyFocusEntry(to.path, true)
        : nativeDestination
    return destination === to.path ? true : { path: destination, replace: true }
  })
}
