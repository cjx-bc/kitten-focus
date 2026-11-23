import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  readDismissedUpdateCode,
  saveDismissedUpdateCode,
  shouldAutoPromptUpdate,
  UPDATE_PROMPT_DISMISSED_KEY,
  type UpdatePromptContext,
} from '../src/domain/updatePrompt'

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  check: vi.fn(),
}))

vi.mock('../src/platform/bridge', () => ({
  native: true,
}))

vi.mock('../src/platform/updates', () => ({
  initialUpdateState: () => ({
    currentVersion: '0.2.12',
    currentCode: 18,
    release: null,
    downloadRelease: null,
    checkedAt: 0,
    checkError: '',
    phase: 'idle',
    received: 0,
    total: 0,
    message: '',
    metered: false,
    canInstall: false,
  }),
  updatesDriver: {
    status: (...args: unknown[]) => mocks.status(...args),
    check: (...args: unknown[]) => mocks.check(...args),
    download: vi.fn(),
    cancel: vi.fn(),
    installPermission: vi.fn(),
    install: vi.fn(),
    backups: vi.fn(),
    exportBackup: vi.fn(),
    restoreBackup: vi.fn(),
  },
}))

import { useUpdates } from '../src/stores/updates'

function baseContext(overrides: Partial<UpdatePromptContext> = {}): UpdatePromptContext {
  return {
    native: true,
    ready: true,
    releaseCode: 19,
    promptedCode: null,
    dismissedCode: null,
    hasActiveSession: false,
    isFullscreenRoute: false,
    hasOpenDialog: false,
    recoveryOpen: false,
    strictConfirmationOpen: false,
    ...overrides,
  }
}

describe('launch update auto-check & non-intrusive prompt guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.status.mockReset()
    mocks.check.mockReset()
  })

  it('allows prompt on idle native main tabs with no open dialogs', () => {
    expect(shouldAutoPromptUpdate(baseContext())).toBe(true)
    expect(shouldAutoPromptUpdate(baseContext({ dismissedCode: 18, releaseCode: 19 }))).toBe(true)
  })

  it('blocks prompt across web, active sessions, fullscreen routes, open dialogs, dismissed versions, and duplicates', () => {
    expect(shouldAutoPromptUpdate(baseContext({ native: false }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ ready: false }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ releaseCode: null }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ promptedCode: 19 }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ dismissedCode: 19, releaseCode: 19 }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ dismissedCode: 20, releaseCode: 19 }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ hasActiveSession: true }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ isFullscreenRoute: true }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ hasOpenDialog: true }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ recoveryOpen: true }))).toBe(false)
    expect(shouldAutoPromptUpdate(baseContext({ strictConfirmationOpen: true }))).toBe(false)
  })

  it('persists and validates dismissed versionCode across launches (Option A)', () => {
    const map = new Map<string, string>()
    const memoryStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v)
      },
    }

    expect(readDismissedUpdateCode(memoryStorage)).toBeNull()
    saveDismissedUpdateCode(19, memoryStorage)
    expect(map.get(UPDATE_PROMPT_DISMISSED_KEY)).toBe('19')
    expect(readDismissedUpdateCode(memoryStorage)).toBe(19)

    saveDismissedUpdateCode(0, memoryStorage)
    expect(readDismissedUpdateCode(memoryStorage)).toBe(19)

    map.set(UPDATE_PROMPT_DISMISSED_KEY, 'not-a-number')
    expect(readDismissedUpdateCode(memoryStorage)).toBeNull()

    map.set(UPDATE_PROMPT_DISMISSED_KEY, '19.5')
    expect(readDismissedUpdateCode(memoryStorage)).toBeNull()
  })

  it('triggers updatesDriver.check(false) during init and marks startupChecked', async () => {
    const updated = {
      currentVersion: '0.2.12',
      currentCode: 18,
      release: {
        applicationId: 'com.xiaomao.focus',
        versionName: '0.2.13',
        versionCode: 19,
        minSdk: 24,
        url: 'https://github.com/cjx-bc/kitten-focus/releases/download/v0.2.13/xiaomao-focus-0.2.13-debug.apk',
        size: 4865000,
        sha256: 'a'.repeat(64),
        notes: '每次启动自动检查更新',
      },
      downloadRelease: null,
      checkedAt: 12345,
      checkError: '',
      phase: 'idle',
      received: 0,
      total: 0,
      message: '',
      metered: false,
      canInstall: false,
    }
    mocks.status.mockResolvedValue({ ...updated, release: null })
    mocks.check.mockResolvedValue(updated)

    const store = useUpdates()
    expect(store.startupChecked).toBe(false)
    await store.init()

    expect(mocks.status).toHaveBeenCalledTimes(1)
    expect(mocks.check).toHaveBeenCalledWith(false)
    expect(store.startupChecked).toBe(true)
    expect(store.hasUpdate).toBe(true)
    expect(store.state.release?.versionCode).toBe(19)
  })
})
