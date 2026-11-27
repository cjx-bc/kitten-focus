import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export interface BrowserErrorEntry {
  source: 'exception' | 'console' | 'log'
  text: string
  url?: string
  lineNumber?: number
}

export interface CatFocusStubOptions {
  supported?: boolean
  authorized?: boolean
  connected?: boolean
  dndSupported?: boolean
  dndGranted?: boolean
  notificationSupported?: boolean
  notificationAuthorized?: boolean
  notificationConnected?: boolean
  wallpaperSupported?: boolean
  wallpaperPrepared?: boolean
  apps?: Array<{
    packageName: string
    name: string
    icon?: string | null
    system?: boolean
    installed?: boolean
    fixed?: boolean
  }>
  initialData?: Record<string, unknown> | null
  recoveryShouldFailStep?: boolean
}

export interface ClickOptions {
  role?: string
  name?: string
  text?: string
  exact?: boolean
  selector?: string
  index?: number
  withinOpenDialog?: boolean
}

export interface FillOptions {
  withinOpenDialog?: boolean
  selector?: string
}

interface CdpMessage {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown }
}

const DEFAULT_BROWSER_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((p): p is string => typeof p === 'string' && p.length > 0)

export function findBrowserExecutable(): string {
  for (const candidate of DEFAULT_BROWSER_PATHS) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(`No Chromium/Edge executable found. Checked: ${DEFAULT_BROWSER_PATHS.join(', ')}`)
}

function buildCatFocusStubScript(options: CatFocusStubOptions = {}): string {
  const cfg = {
    supported: options.supported ?? true,
    authorized: options.authorized ?? true,
    connected: options.connected ?? true,
    dndSupported: options.dndSupported ?? true,
    dndGranted: options.dndGranted ?? true,
    notificationSupported: options.notificationSupported ?? true,
    notificationAuthorized: options.notificationAuthorized ?? true,
    notificationConnected: options.notificationConnected ?? true,
    wallpaperSupported: options.wallpaperSupported ?? true,
    wallpaperPrepared: options.wallpaperPrepared ?? false,
    apps: options.apps ?? [
      { packageName: 'com.xiaomao.focus', name: '小猫专注', icon: null, system: false, installed: true, fixed: true },
      { packageName: 'com.tencent.mm', name: '微信', icon: null, system: false, installed: true, fixed: false },
      { packageName: 'com.eg.android.AlipayGphone', name: '支付宝', icon: null, system: false, installed: true, fixed: false },
      { packageName: 'com.android.settings', name: '设置', icon: null, system: true, installed: true, fixed: false },
    ],
    initialData: options.initialData ?? null,
    recoveryShouldFailStep: options.recoveryShouldFailStep ?? false,
  }

  return `(() => {
    const STORAGE_KEY = '__kitten_focus_native_stub_v1__';
    const initialCfg = ${JSON.stringify(cfg)};
    const defaultData = () => ({
      schemaVersion: 1,
      lockConfigurations: [],
      themes: [],
      items: [],
      records: [],
      deletedRecordIds: [],
      events: [],
      eventExceptions: [],
      semesters: [],
      courses: [],
      courseExceptions: [],
      preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null },
    });

    function loadPersisted() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch {}
      return {
        data: initialCfg.initialData ? JSON.parse(JSON.stringify(initialCfg.initialData)) : defaultData(),
        focusSession: null,
        lastFinished: null,
        clockOffsetMs: 0,
        restSession: null,
        lockSession: null,
        lockRecords: [],
        mainEntryRestricted: false,
        focusReturnRequested: false,
        lockReturnRequested: false,
        recoveryReturnRequested: false,
        recoveryRevision: 'rev-1',
        recoverySteps: [],
        permissions: { notifications: true, exactAlarms: true, batteryOptimizationIgnored: false, foregroundServiceActive: false },
        cfg: initialCfg,
      };
    }

    const state = loadPersisted();
    function persist() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    }

    const appListeners = { appStateChange: [], backButton: [] };
    let cbSeq = 1;

    function clone(v) {
      return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    }

    function computeFocusElapsed() {
      const s = state.focusSession;
      if (!s) return 0;
      const now = Date.now() + state.clockOffsetMs;
      if (s.state === 'paused') return s.elapsedMs;
      return Math.max(0, s.elapsedMs + Math.max(0, now - s.anchorMono));
    }

    function computeRestRemaining() {
      const r = state.restSession;
      if (!r || r.state !== 'running') return 0;
      const now = Date.now() + state.clockOffsetMs;
      return Math.max(0, r.endsAt - now);
    }

    function computeLockRemaining() {
      const l = state.lockSession;
      if (!l) return 0;
      const now = Date.now() + state.clockOffsetMs;
      return Math.max(0, l.startedAt + l.targetMs - now);
    }

    function protectionPrefs() {
      return (state.data && state.data.preferences && state.data.preferences.protection) || {};
    }

    function resolveEffective(prefs) {
      const m = prefs.modules;
      if (!m) return prefs;
      const master = !!m.master;
      const apps = m.apps || { enabled: false, custom: {} };
      const strict = m.strict || { enabled: false, custom: {} };
      const quiet = m.quiet || { enabled: false, custom: {} };
      const enhancements = [];
      if (strict.enabled) {
        if (strict.custom?.navigation) enhancements.push('navigationHomeRecents');
        if (strict.custom?.antiClose) enhancements.push('preciseAntiClose');
        if (strict.custom?.hideRecents) enhancements.push('recentTasksHidden');
        if (strict.custom?.hideLauncher) enhancements.push('launcherIconHidden');
        if (strict.custom?.wallpaper) enhancements.push('wallpaperProtection');
        if (strict.custom?.strictSettings) enhancements.push('strictSettingsGuard');
        if (strict.custom?.deviceAdmin) enhancements.push('deviceAdminAntiUninstall');
        if (strict.custom?.rebootResume) enhancements.push('rebootResumeLock');
      }
      return {
        study: master && apps.enabled && apps.custom?.restrict !== false,
        strict: strict.enabled && strict.custom?.noPauseEnd !== false,
        dnd: quiet.enabled && !!quiet.custom?.sound,
        interceptNotifications: quiet.enabled && !!quiet.custom?.intercept,
        globalWhitelist: prefs.globalWhitelist || [],
        enhancements,
      };
    }

    function effectiveWhitelistForItem(itemId) {
      const item = (state.data.items || []).find((i) => i.id === itemId && !i.deleted);
      if (item && item.whitelist && item.whitelist.source === 'custom') {
        return { source: 'custom', whitelist: [...new Set(item.whitelist.packages || [])] };
      }
      return { source: 'global', whitelist: [...new Set((protectionPrefs().globalWhitelist) || [])] };
    }

    function makeStatus() {
      const c = state.cfg;
      const ready = c.supported && c.authorized && c.connected;
      return {
        supported: c.supported,
        authorized: c.authorized,
        connected: c.connected,
        active: !!(state.focusSession?.protection?.study || state.lockSession),
        preferenceEnabled: !!protectionPrefs().study,
        state: !c.supported ? 'unsupported' : !c.authorized ? 'authorization' : ready ? (state.focusSession?.protection?.study ? 'protecting' : 'ready') : 'failed',
        reason: !c.supported ? '仅 Android 可用' : ready ? '已就绪' : '需要无障碍权限',
        effectiveWhitelist: [...new Set(protectionPrefs().globalWhitelist || [])],
        navigation: {
          supported: c.supported,
          authorized: c.authorized,
          connected: c.connected,
          active: false,
          preferenceEnabled: false,
          requested: false,
          state: ready ? 'ready' : 'authorization',
          reason: ready ? '已就绪' : '需要无障碍权限',
          lastReturnedAt: null,
          lastTarget: null,
        },
        antiClose: {
          supported: c.supported,
          authorized: c.authorized,
          connected: c.connected,
          active: false,
          preferenceEnabled: false,
          requested: false,
          state: ready ? 'ready' : 'authorization',
          reason: ready ? '已就绪' : '需要无障碍权限',
          lastReturnedAt: null,
          lastTarget: null,
          identity: { accessibility: c.authorized },
          systemUninstallBlocked: false,
          policyReason: '无障碍服务身份',
          supportScope: 'Android 本机',
        },
      };
    }

    function buildRecoverySteps() {
      const steps = [];
      const f = state.focusSession;
      const l = state.lockSession;
      if (f && f.protection) {
        if (f.protection.study && !f.protection.applicationsWithdrawn) {
          steps.push({ sessionId: f.id, capability: 'applications', title: '停止应用限制', status: 'active', reason: '本轮正在运行', retryable: true });
        }
        if ((f.protection.enhancements || []).includes('navigationHomeRecents') && !f.protection.navigationWithdrawn) {
          steps.push({ sessionId: f.id, capability: 'navigation', title: '恢复桌面与最近任务', status: 'active', reason: '本轮正在运行', retryable: true });
        }
        if ((f.protection.enhancements || []).includes('preciseAntiClose') && !f.protection.antiCloseWithdrawn) {
          steps.push({ sessionId: f.id, capability: 'antiClose', title: '解除防关闭拦截', status: 'active', reason: '本轮正在运行', retryable: true });
        }
      }
      if (l) {
        steps.push({ sessionId: l.id, capability: 'applications', title: '停止锁机应用限制', status: 'active', reason: '锁机正在运行', retryable: true });
      }
      return steps;
    }

    const catFocusHandlers = {
      async resolveMainEntry({ path }) {
        if (state.lockSession && state.mainEntryRestricted) {
          return { path: '/lock' };
        }
        return { path };
      },
      async loadData() {
        return { data: clone(state.data) };
      },
      async saveData({ data }) {
        state.data = clone(data);
        persist();
      },
      async replaceData({ data }) {
        if (state.focusSession || state.lockSession) {
          throw new Error('请先结束当前专注或锁机');
        }
        state.data = clone(data);
        state.focusSession = null;
        state.restSession = null;
        persist();
      },
      async startFocus({ session, strictModeConfirmed }) {
        if (state.focusSession) throw new Error('请先结束当前专注');
        if (state.lockSession) throw new Error('已有锁机正在进行');
        if (state.restSession && state.restSession.state === 'running') throw new Error('请先退出休息，再开始新的专注');
        const prefs = protectionPrefs();
        const eff = resolveEffective(prefs);
        const masterOn = !!(prefs.modules ? prefs.modules.master : prefs.study);
        const strictMode = !!eff.strict && session.mode === 'countdown';
        if (strictMode && !strictModeConfirmed) {
          throw new Error('请先确认严格倒计时：开始后不能暂停、取消或提前结束');
        }
        const wl = effectiveWhitelistForItem(session.itemId);
        const now = Date.now() + state.clockOffsetMs;
        const nextSession = {
          ...clone(session),
          strictMode,
          state: 'running',
          elapsedMs: 0,
          pausedMs: 0,
          anchorMono: now,
          anchorEpoch: now,
          bootId: 0,
          segments: [{ start: now, end: now }],
          temporaryAccess: { used: 0, remainingUses: 3, targetPackage: null, targetLabel: null, remainingMs: 0, expiresAt: null },
          protection: {
            study: !!eff.study,
            studyLocked: masterOn,
            enhancements: eff.enhancements || [],
            temporaryAccessAllowed: prefs.modules?.apps?.custom?.temporaryAccess !== false,
            ...wl,
          },
        };
        state.focusSession = nextSession;
        state.lastFinished = null;
        state.restSession = null;
        persist();
        return { session: clone(nextSession), elapsedMs: 0 };
      },
      async focusAction({ action }) {
        const s = state.focusSession;
        if (!s) return { session: null, elapsedMs: 0, ...(state.lastFinished ? { record: clone(state.lastFinished) } : {}) };
        const now = Date.now() + state.clockOffsetMs;
        let el = computeFocusElapsed();
        if (s.mode === 'countdown' && el >= s.targetMs) {
          el = s.targetMs;
          const record = {
            id: s.id,
            itemId: s.itemId,
            themeId: s.themeId,
            title: s.title,
            themeName: s.themeName,
            color: s.color,
            mode: s.mode,
            targetMs: s.targetMs,
            startedAt: s.startedAt,
            endedAt: now,
            timeZone: s.timeZone,
            durationMs: s.targetMs,
            pausedMs: s.pausedMs || 0,
            segments: [{ start: s.startedAt, end: s.startedAt + s.targetMs }],
            status: 'completed',
            animalId: s.animalId || 'black-cat',
            skinId: s.skinId || 'default',
            source: 'timer',
          };
          state.focusSession = null;
          const prefs = (state.data && state.data.preferences) || {};
          if (prefs.autoRest === true) {
            const restMs = (Number.isInteger(prefs.restMinutes) && prefs.restMinutes >= 1 && prefs.restMinutes <= 60 ? prefs.restMinutes : 5) * 60000;
            state.restSession = { durationMs: restMs, record, startedAt: now, endsAt: now + restMs, state: 'running' };
          }
          persist();
          return { session: null, elapsedMs: s.targetMs, record: clone(record) };
        }
        if (action === 'read') {
          return { session: clone(s), elapsedMs: el };
        }
        if (s.strictMode && s.mode === 'countdown' && el < s.targetMs) {
          throw new Error('严格倒计时不能暂停、取消或提前结束');
        }
        if (action === 'cancel') {
          if (el >= 10000) {
            throw new Error('已超过 10 秒无责取消时间，请左滑放弃');
          }
          state.focusSession = null;
          persist();
          return { session: null, elapsedMs: 0 };
        }
        if (action === 'pause' && s.state === 'running') {
          s.elapsedMs = el;
          s.state = 'paused';
          s.anchorMono = now;
          persist();
          return { session: clone(s), elapsedMs: el };
        }
        if (action === 'resume' && s.state === 'paused') {
          s.pausedMs = (s.pausedMs || 0) + Math.max(0, now - s.anchorMono);
          s.state = 'running';
          s.anchorMono = now;
          persist();
          return { session: clone(s), elapsedMs: s.elapsedMs };
        }
        if (action === 'finish' || action === 'fail_leave') {
          const failLeave = action === 'fail_leave';
          const status = failLeave ? 'early' : (s.mode === 'stopwatch' ? 'completed' : el >= s.targetMs ? 'completed' : 'early');
          const record = {
            id: s.id,
            itemId: s.itemId,
            themeId: s.themeId,
            title: s.title,
            themeName: s.themeName,
            color: s.color,
            mode: s.mode,
            targetMs: s.targetMs,
            startedAt: s.startedAt,
            endedAt: now,
            timeZone: s.timeZone,
            durationMs: el,
            pausedMs: s.pausedMs || 0,
            segments: [{ start: s.startedAt, end: s.startedAt + el }],
            status,
            animalId: s.animalId || 'black-cat',
            skinId: s.skinId || 'default',
            source: 'timer',
            ...(status === 'early' ? { failReason: failLeave ? 'left_app' : 'manual_giveup' } : {}),
          };
          state.focusSession = null;
          state.lastFinished = record;
          const prefs = (state.data && state.data.preferences) || {};
          if (status === 'completed' && prefs.autoRest === true) {
            const restMs = (Number.isInteger(prefs.restMinutes) && prefs.restMinutes >= 1 && prefs.restMinutes <= 60 ? prefs.restMinutes : 5) * 60000;
            state.restSession = { durationMs: restMs, record, startedAt: now, endsAt: now + restMs, state: 'running' };
          }
          persist();
          return { session: null, elapsedMs: el, record: clone(record) };
        }
        return { session: clone(s), elapsedMs: el };
      },
      async startRest({ recordId }) {
        if (state.focusSession) throw new Error('请先结束当前专注');
        const record = (state.data.records || []).find((r) => r.id === recordId) || {
          id: recordId,
          itemId: null,
          themeId: null,
          title: '专注',
          themeName: '自由专注',
          color: '#222222',
          mode: 'countdown',
          targetMs: 1500000,
          startedAt: Date.now() - 60000,
          endedAt: Date.now(),
          timeZone: 'Asia/Shanghai',
          durationMs: 60000,
          pausedMs: 0,
          segments: [],
          status: 'early',
        };
        const now = Date.now() + state.clockOffsetMs;
        const prefs = (state.data && state.data.preferences) || {};
        const restMs = (Number.isInteger(prefs.restMinutes) && prefs.restMinutes >= 1 && prefs.restMinutes <= 60 ? prefs.restMinutes : 5) * 60000;
        state.restSession = { durationMs: restMs, record: clone(record), startedAt: now, endsAt: now + restMs, state: 'running' };
        persist();
        return { session: clone(state.restSession), remainingMs: restMs };
      },
      async restAction({ action }) {
        if (action === 'exit') {
          state.restSession = null;
          persist();
          return { session: null, remainingMs: 0 };
        }
        const r = state.restSession;
        if (!r) return { session: null, remainingMs: 0 };
        const rem = computeRestRemaining();
        if (r.state === 'running' && rem === 0) {
          r.state = 'completed';
          persist();
        }
        return { session: clone(r), remainingMs: rem };
      },
      async startLock({ configurationId, strictLockConfirmed }) {
        if (state.focusSession) throw new Error('已有专注正在进行');
        if (state.restSession?.state === 'running') throw new Error('请先退出休息');
        const cfgItem = (state.data.lockConfigurations || []).find((c) => c.id === configurationId);
        if (!cfgItem) throw new Error('锁机配置不存在');
        if (cfgItem.strict && !strictLockConfirmed) throw new Error('请确认严格锁机');
        const enhancements = cfgItem.enhancements !== undefined ? cfgItem.enhancements : (protectionPrefs().enhancements || []);
        state.mainEntryRestricted = enhancements.includes('lockMainInterfaceRestricted');
        const wl = cfgItem.whitelist?.source === 'custom'
          ? { source: 'custom', whitelist: [...cfgItem.whitelist.packages] }
          : { source: 'global', whitelist: [...(protectionPrefs().globalWhitelist || [])] };
        const now = Date.now() + state.clockOffsetMs;
        state.lockSession = {
          id: 'lock-' + now,
          configurationId: cfgItem.id,
          title: cfgItem.name,
          targetMs: cfgItem.minutes * 60000,
          startedAt: now,
          strictMode: !!cfgItem.strict,
          protection: {
            study: true,
            enhancements,
            ...wl,
          },
        };
        persist();
        return { session: clone(state.lockSession), remainingMs: state.lockSession.targetMs, records: clone(state.lockRecords) };
      },
      async lockAction({ action, confirmed }) {
        const l = state.lockSession;
        if (!l) return { session: null, remainingMs: 0, records: clone(state.lockRecords) };
        const rem = computeLockRemaining();
        if (rem === 0 || (action === 'finish' && confirmed)) {
          if (action === 'finish' && rem > 0 && l.strictMode) {
            throw new Error('严格锁机不能暂停、取消或提前解除');
          }
          const now = Date.now() + state.clockOffsetMs;
          const status = rem === 0 ? 'completed' : 'early';
          state.lockRecords.unshift({
            id: l.id,
            configurationId: l.configurationId,
            title: l.title,
            targetMs: l.targetMs,
            startedAt: l.startedAt,
            endedAt: now,
            durationMs: Math.max(0, l.targetMs - rem),
            status,
          });
          state.lockSession = null;
          state.mainEntryRestricted = false;
          persist();
          return { session: null, remainingMs: 0, records: clone(state.lockRecords) };
        }
        return { session: clone(l), remainingMs: rem, records: clone(state.lockRecords) };
      },
      async observeControl() {
        const focusEl = computeFocusElapsed();
        const restRem = computeRestRemaining();
        const lockRem = computeLockRemaining();
        return {
          owner: state.focusSession ? 'focus' : state.restSession?.state === 'running' ? 'rest' : state.lockSession ? 'lock' : null,
          focus: { session: clone(state.focusSession), elapsedMs: focusEl },
          rest: { session: clone(state.restSession), remainingMs: restRem },
          lock: { session: clone(state.lockSession), remainingMs: lockRem, records: clone(state.lockRecords) },
          mainEntry: { requested: state.mainEntryRestricted, active: state.mainEntryRestricted && !!state.lockSession, withdrawn: false },
          recentTasks: await catFocusHandlers.getRecentTasksStatus(),
          launcher: await catFocusHandlers.getLauncherStatus(),
          wallpaper: await catFocusHandlers.getWallpaperStatus(),
          needsReconcile: false,
        };
      },
      async protectionStatus() {
        return makeStatus();
      },
      async listProtectionApps() {
        return { apps: clone(state.cfg.apps) };
      },
      async openProtectionSettings() {},
      async getDndStatus() {
        return {
          supported: state.cfg.dndSupported,
          permissionGranted: state.cfg.dndGranted,
          requested: false,
          phase: 'idle',
          sessionId: '',
          ruleEnabled: false,
          ruleActive: null,
          verified: false,
          globalFilter: 0,
          recoveryPending: false,
          error: '',
        };
      },
      async openDndSettings() {},
      async restoreDnd() {
        return catFocusHandlers.getDndStatus();
      },
      async getNotificationStatus() {
        return {
          supported: state.cfg.notificationSupported,
          authorized: state.cfg.notificationAuthorized,
          connected: state.cfg.notificationConnected,
          requested: false,
          active: false,
          phase: 'idle',
          sessionId: '',
          deadlineEpoch: 0,
          pendingCount: 0,
          restoredCount: 0,
          absentCount: 0,
          presentCount: 0,
          snoozedCount: 0,
          releaseRequestedCount: 0,
          releaseFailedCount: 0,
          leaseDurationMs: 0,
          recoveryPending: false,
          error: '',
          reason: state.cfg.notificationConnected ? '监听已连接' : '监听未连接',
        };
      },
      async openNotificationAccessSettings() {},
      async rebindNotificationListener() {},
      async getRecentTasksStatus() {
        return {
          supported: state.cfg.supported,
          requested: false,
          preferenceEnabled: false,
          recoveryAvailable: true,
          phase: 'off',
          active: false,
          verified: false,
          recoveryPending: false,
          error: '',
        };
      },
      async getLauncherStatus() {
        return {
          supported: state.cfg.supported,
          requested: false,
          preferenceEnabled: false,
          recoveryAvailable: true,
          recoveryReachable: true,
          phase: 'off',
          active: false,
          verified: false,
          recoveryPending: false,
          componentState: 1,
          launcherResolved: true,
          launcherCacheVerified: false,
          error: '',
        };
      },
      async getWallpaperStatus() {
        return {
          supported: state.cfg.wallpaperSupported,
          requested: false,
          preferenceEnabled: false,
          phase: state.cfg.wallpaperPrepared ? 'ready' : 'idle',
          selected: false,
          lockSelected: false,
          active: false,
          verified: false,
          prepared: state.cfg.wallpaperPrepared,
          pickerOpen: false,
          recoveryPending: false,
          withdrawn: false,
          current: {},
          error: '',
          forceStopImmune: false,
          cropVerified: false,
          providerSettingsVerified: false,
        };
      },
      async prepareWallpaper({ limitsAccepted, originalMatches }) {
        if (limitsAccepted && originalMatches) state.cfg.wallpaperPrepared = true;
        persist();
        return catFocusHandlers.getWallpaperStatus();
      },
      async requestWallpaperPicker() { return catFocusHandlers.getWallpaperStatus(); },
      async importWallpaperOriginal() {
        state.cfg.wallpaperPrepared = true;
        persist();
        return catFocusHandlers.getWallpaperStatus();
      },
      async confirmWallpaperManualRecovery() { return catFocusHandlers.getWallpaperStatus(); },
      async openWallpaperSettings() {},
      async previewRecovery() {
        if (!state.recoverySteps.length) {
          state.recoverySteps = buildRecoverySteps();
        }
        return {
          supported: state.cfg.supported,
          revision: state.recoveryRevision,
          steps: clone(state.recoverySteps),
          pending: state.recoverySteps.some((s) => s.status === 'active' || s.status === 'failed'),
        };
      },
      async confirmRecovery({ revision }) {
        if (revision !== state.recoveryRevision) {
          throw new Error('恢复列表已变化，请重新查看后再确认');
        }
        if (!state.recoverySteps.length) {
          state.recoverySteps = buildRecoverySteps();
        }
        state.recoverySteps = state.recoverySteps.map((step, idx) => {
          if (state.cfg.recoveryShouldFailStep && idx === 0 && step.status === 'active') {
            return { ...step, status: 'failed', reason: '系统暂未释放，可重试', retryable: true };
          }
          if (step.status === 'active' || step.status === 'failed') {
            if (state.focusSession?.protection) {
              if (step.capability === 'applications') state.focusSession.protection.applicationsWithdrawn = true;
              if (step.capability === 'navigation') state.focusSession.protection.navigationWithdrawn = true;
              if (step.capability === 'antiClose') state.focusSession.protection.antiCloseWithdrawn = true;
            }
            return { ...step, status: 'restored', reason: '本轮已撤销，下轮再按设置开启', retryable: false };
          }
          return step;
        });
        persist();
        return {
          supported: state.cfg.supported,
          revision: state.recoveryRevision,
          steps: clone(state.recoverySteps),
          pending: state.recoverySteps.some((s) => s.status === 'active' || s.status === 'failed'),
        };
      },
      async grantTemporaryAccess({ targetPackage }) {
        return {
          status: 'granted',
          reason: '已临时放行',
          replayed: false,
          state: { used: 1, remainingUses: 2, targetPackage, targetLabel: targetPackage, remainingMs: 60000, expiresAt: Date.now() + 60000 },
        };
      },
      async consumeFocusReturn() { const v = state.focusReturnRequested; state.focusReturnRequested = false; persist(); return { requested: v }; },
      async consumeLockReturn() { const v = state.lockReturnRequested; state.lockReturnRequested = false; persist(); return { requested: v }; },
      async consumeRecoveryReturn() { const v = state.recoveryReturnRequested; state.recoveryReturnRequested = false; persist(); return { requested: v }; },
      async exportFile() {},
      async importFile() { return { text: '{}' }; },
      async permissions() { return clone(state.permissions); },
      async requestNotifications() { state.permissions.notifications = true; persist(); return clone(state.permissions); },
      async openAlarmSettings() {},
      async openBatteryOptimizationSettings() {},
      async syncReminders() {},
      async setFocusOverlayState() { return { ok: true }; },
      async getKeepAliveGuide() {
        return {
          brand: 'generic',
          brandLabel: '标准 Android',
          foregroundServiceActive: !!state.focusSession || !!state.lockSession,
          batteryOptimizationIgnored: !!state.permissions.batteryOptimizationIgnored,
          hasAutoStartSurface: false,
          autoStartHint: '在系统应用详情中允许后台运行与电池不受限制。',
          recentLockHint: '打开最近任务 → 点击小猫专注卡片菜单并锁定。',
          hideRecentsConflict: resolveEffective(protectionPrefs()).enhancements.includes('recentTasksHidden'),
        };
      },
      async openKeepAliveSettings() { return { opened: true }; },
      async getDeviceAdminStatus() {
        return { supported: !!state.cfg.supported, active: false, preferenceEnabled: false, state: 'off', reason: '' };
      },
      async requestDeviceAdmin() { return { opened: true }; },
      async deactivateDeviceAdmin() {
        return { supported: !!state.cfg.supported, active: false, preferenceEnabled: false, state: 'off', reason: '' };
      },
      async removeListener() {},
    };

    const appUpdateHandlers = {
      async status() {
        return {
          currentVersion: '0.2.9',
          currentCode: 209,
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
        };
      },
      async check() { return appUpdateHandlers.status(); },
      async download() { return appUpdateHandlers.status(); },
      async cancel() { return appUpdateHandlers.status(); },
      async installPermission() {},
      async install() {},
      async backups() { return { backups: [] }; },
      async exportBackup() { return { text: '{}' }; },
      async restoreBackup() {},
    };

    const appHandlers = {
      async minimizeApp() {},
      async removeListener({ eventName, callbackId }) {
        if (appListeners[eventName]) {
          appListeners[eventName] = appListeners[eventName].filter((item) => item.id !== callbackId);
        }
      },
    };

    const catFocusMethods = [
      ...Object.keys(catFocusHandlers).map((name) => ({ name, rtype: 'promise' })),
      { name: 'addListener', rtype: 'addListener' },
    ];
    const appUpdateMethods = Object.keys(appUpdateHandlers).map((name) => ({ name, rtype: 'promise' }));
    const appMethods = [
      { name: 'addListener', rtype: 'addListener' },
      { name: 'removeListener', rtype: 'promise' },
      { name: 'minimizeApp', rtype: 'promise' },
    ];

    window.androidBridge = window.androidBridge || {};
    window.Capacitor = {
      PluginHeaders: [
        { name: 'CatFocus', methods: catFocusMethods },
        { name: 'AppUpdates', methods: appUpdateMethods },
        { name: 'App', methods: appMethods },
      ],
      nativePromise(pluginName, methodName, options) {
        if (pluginName === 'CatFocus' && catFocusHandlers[methodName]) {
          return Promise.resolve().then(() => catFocusHandlers[methodName](options || {}));
        }
        if (pluginName === 'AppUpdates' && appUpdateHandlers[methodName]) {
          return Promise.resolve().then(() => appUpdateHandlers[methodName](options || {}));
        }
        if (pluginName === 'App' && appHandlers[methodName]) {
          return Promise.resolve().then(() => appHandlers[methodName](options || {}));
        }
        return Promise.reject(new Error('Unimplemented stub method: ' + pluginName + '.' + methodName));
      },
      nativeCallback(pluginName, methodName, options, callback) {
        if (pluginName === 'App' && methodName === 'addListener') {
          const id = String(cbSeq++);
          const eventName = options && options.eventName;
          if (eventName && appListeners[eventName]) {
            appListeners[eventName].push({ id, callback });
          }
          return Promise.resolve(id);
        }
        return Promise.resolve(String(cbSeq++));
      },
    };

    window.__catFocusStub = {
      getState: () => clone(state),
      patchConfig(patch) { Object.assign(state.cfg, patch); persist(); },
      advanceFocusMs(ms) { state.clockOffsetMs += ms; persist(); },
      advanceRestMs(ms) { state.clockOffsetMs += ms; persist(); },
      advanceLockMs(ms) { state.clockOffsetMs += ms; persist(); },
      async triggerLeaveFail() { return catFocusHandlers.focusAction({ action: 'fail_leave' }); },
      dispatchAppEvent(eventName, payload) {
        for (const item of appListeners[eventName] || []) {
          item.callback(payload);
        }
      },
    };
  })();`
}

export class CdpPage {
  private proc: ChildProcessWithoutNullStreams
  private ws: WebSocket
  private userDataDir: string
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>()
  private errors: BrowserErrorEntry[] = []
  private closed = false

  private constructor(proc: ChildProcessWithoutNullStreams, ws: WebSocket, userDataDir: string) {
    this.proc = proc
    this.ws = ws
    this.userDataDir = userDataDir

    this.ws.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data)
      const msg = JSON.parse(raw) as CdpMessage
      if (typeof msg.id === 'number') {
        const entry = this.pending.get(msg.id)
        if (!entry) return
        this.pending.delete(msg.id)
        if (msg.error) {
          entry.reject(new Error(`CDP error ${msg.error.code ?? ''}: ${msg.error.message ?? 'Unknown'}`))
        } else {
          entry.resolve(msg.result)
        }
        return
      }
      if (msg.method) {
        const set = this.listeners.get(msg.method)
        if (set) {
          for (const handler of set) handler(msg.params ?? {})
        }
      }
    })

    this.on('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails as
        | { text?: string; url?: string; lineNumber?: number; exception?: { description?: string } }
        | undefined
      const desc = details?.exception?.description ?? details?.text ?? 'Uncaught runtime exception'
      this.errors.push({
        source: 'exception',
        text: desc,
        url: details?.url,
        lineNumber: details?.lineNumber,
      })
    })

    this.on('Log.entryAdded', (params) => {
      const entry = params.entry as { level?: string; text?: string; url?: string; lineNumber?: number } | undefined
      if (entry?.level === 'error') {
        this.errors.push({
          source: 'log',
          text: entry.text ?? 'Browser log error',
          url: entry.url,
          lineNumber: entry.lineNumber,
        })
      }
    })

    this.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        const args = (params.args as Array<{ value?: unknown; description?: string }> | undefined) ?? []
        const text = args.map((a) => a.description ?? (a.value !== undefined ? String(a.value) : '')).join(' ').trim()
        this.errors.push({
          source: 'console',
          text: text || 'console.error called',
        })
      }
    })
  }

  static async launch(options: {
    width?: number
    height?: number
    reducedMotion?: boolean
    catFocusStub?: boolean | CatFocusStubOptions
    initScript?: string
  } = {}): Promise<CdpPage> {
    const exe = findBrowserExecutable()
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitten-e2e-'))
    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--mute-audio',
      '--overscroll-history-navigation=0',
      'about:blank',
    ]

    const proc = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let wsEndpoint = ''
    try {
      wsEndpoint = await new Promise<string>((resolve, reject) => {
        let buffer = ''
        let settled = false
        const activePortFile = path.join(userDataDir, 'DevToolsActivePort')

        const cleanup = () => {
          clearTimeout(timer)
          clearInterval(pollTimer)
          proc.stderr.off('data', onData)
          proc.off('exit', onExit)
        }

        const finishResolve = (endpoint: string) => {
          if (settled) return
          settled = true
          cleanup()
          resolve(endpoint)
        }

        const finishReject = (err: Error) => {
          if (settled) return
          settled = true
          cleanup()
          reject(err)
        }

        const tryResolveEndpoint = (candidate: string | undefined) => {
          if (!candidate) return false
          try {
            const parsedUrl = new URL(candidate)
            const port = Number(parsedUrl.port)
            if (Number.isInteger(port) && port >= 1 && port <= 65535 && parsedUrl.pathname.startsWith('/devtools/browser/')) {
              finishResolve(candidate)
              return true
            }
          } catch {}
          return false
        }

        const timer = setTimeout(() => {
          finishReject(new Error(`Timed out waiting for browser DevTools port. Output:\n${buffer}`))
        }, 15000)

        const pollTimer = setInterval(() => {
          if (settled || !fs.existsSync(activePortFile)) return
          try {
            const raw = fs.readFileSync(activePortFile, 'utf8')
            const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
            if (lines.length >= 2 && /^\d+$/.test(lines[0]!) && lines[1]!.startsWith('/devtools/browser/')) {
              tryResolveEndpoint(`ws://127.0.0.1:${lines[0]!}${lines[1]!}`)
            }
          } catch {}
        }, 100)

        const onData = (chunk: Buffer) => {
          buffer += chunk.toString('utf8')
          const match = buffer.match(
            /DevTools listening on (ws:\/\/(?:\[[^\]]+\]|[^:\s/]+):(\d+)\/devtools\/browser\/[^\r\n\s]+)\r?\n/,
          )
          if (match?.[1]) {
            tryResolveEndpoint(match[1])
          }
        }

        const onExit = (code: number | null) => {
          finishReject(new Error(`Browser exited early with code ${code}. Output:\n${buffer}`))
        }

        proc.stderr.on('data', onData)
        proc.once('exit', onExit)
      })

      const parsed = new URL(wsEndpoint)
      const port = Number(parsed.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid DevTools port in endpoint "${wsEndpoint}"`)
      }
      const debugOrigin = `http://${parsed.host}`

      let targets: Array<{ type?: string; webSocketDebuggerUrl?: string }> = []
      let lastFetchError: unknown = null
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const listRes = await fetch(`${debugOrigin}/json/list`)
          if (listRes.ok) {
            targets = (await listRes.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>
            lastFetchError = null
            break
          }
          lastFetchError = new Error(`HTTP ${listRes.status} from ${debugOrigin}/json/list`)
        } catch (err) {
          lastFetchError = err
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      if (lastFetchError) {
        throw lastFetchError
      }

      let pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (!pageTarget) {
        const newRes = await fetch(`${debugOrigin}/json/new?about:blank`, { method: 'PUT' })
        pageTarget = (await newRes.json()) as { type?: string; webSocketDebuggerUrl?: string }
      }
      if (!pageTarget?.webSocketDebuggerUrl) {
        throw new Error('Could not find CDP page target WebSocket URL')
      }

      const ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), 10000)
        ws.addEventListener('open', () => {
          clearTimeout(timer)
          resolve()
        })
        ws.addEventListener('error', () => {
          clearTimeout(timer)
          reject(new Error('WebSocket connection failed'))
        })
      })

      const page = new CdpPage(proc, ws, userDataDir)
      await page.send('Page.enable')
      await page.send('Runtime.enable')
      await page.send('DOM.enable')
      await page.send('Log.enable')
      await page.send('Page.bringToFront').catch(() => {})
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})

      await page.setViewport(options.width ?? 390, options.height ?? 844)
      if (options.reducedMotion !== undefined) {
        await page.setReducedMotion(options.reducedMotion)
      }
      if (options.catFocusStub) {
        const stubOpts = options.catFocusStub === true ? {} : options.catFocusStub
        await page.addInitScript(buildCatFocusStubScript(stubOpts))
      }
      if (options.initScript) {
        await page.addInitScript(options.initScript)
      }
      return page
    } catch (error) {
      await CdpPage.forceKillAndClean(proc, userDataDir)
      throw error
    }
  }

  private static waitForExit(proc: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
    if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        proc.off('exit', onExit)
        resolve(false)
      }, timeoutMs)
      const onExit = () => {
        clearTimeout(timer)
        resolve(true)
      }
      proc.once('exit', onExit)
    })
  }

  private static async forceKillAndClean(
    proc: ChildProcessWithoutNullStreams,
    userDataDir: string,
    waitedGraceful = false,
  ): Promise<void> {
    const exited = waitedGraceful ? await CdpPage.waitForExit(proc, 1500) : false
    if (!exited && proc.exitCode === null && proc.signalCode === null) {
      try {
        if (process.platform === 'win32' && proc.pid) {
          try {
            execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
          } catch {}
        }
        if (!proc.killed) proc.kill('SIGKILL')
      } catch {}
      await CdpPage.waitForExit(proc, 2000)
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        if (!fs.existsSync(userDataDir)) return
        fs.rmSync(userDataDir, { recursive: true, force: true })
        if (!fs.existsSync(userDataDir)) return
      } catch {}
      await new Promise((r) => setTimeout(r, 150))
    }
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  }

  on(event: string, handler: (params: Record<string, unknown>) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler)
    return () => set?.delete(handler)
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.closed) return Promise.reject(new Error(`CDP session closed before ${method}`))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP call timed out: ${method}`))
      }, 15000)
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v as T)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
      })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async addInitScript(source: string): Promise<void> {
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source })
  }

  async setViewport(width: number, height: number, deviceScaleFactor = 2): Promise<void> {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: true,
    })
    await this.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5,
    })
  }

  async setReducedMotion(reduce: boolean): Promise<void> {
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }],
    })
  }

  async evaluate<T = unknown>(fnOrExpr: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
    const expression =
      typeof fnOrExpr === 'string'
        ? fnOrExpr
        : `(${fnOrExpr.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`

    const res = await this.send<{
      result?: { value?: T; description?: string; type?: string }
      exceptionDetails?: { text?: string; exception?: { description?: string } }
    }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })

    if (res.exceptionDetails) {
      const msg = res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? 'Evaluation error'
      throw new Error(`Browser evaluation failed: ${msg}`)
    }
    return res.result?.value as T
  }

  async waitFor<T>(
    predicate: string | ((...args: unknown[]) => T),
    opts: { timeoutMs?: number; intervalMs?: number; args?: unknown[]; label?: string } = {},
  ): Promise<NonNullable<T>> {
    const timeoutMs = opts.timeoutMs ?? 10000
    const intervalMs = opts.intervalMs ?? 80
    const deadline = Date.now() + timeoutMs
    let lastError: unknown
    while (Date.now() < deadline) {
      try {
        const val = await this.evaluate(predicate, ...(opts.args ?? []))
        if (val) return val as NonNullable<T>
      } catch (e) {
        lastError = e
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    throw new Error(
      `Timed out waiting for condition${opts.label ? ` (${opts.label})` : ''} after ${timeoutMs}ms${
        lastError ? `: ${String(lastError)}` : ''
      }`,
    )
  }

  async goto(url: string, waitForAppReady = true): Promise<void> {
    await this.send('Page.navigate', { url })
    await this.waitFor(() => document.readyState === 'complete', { timeoutMs: 15000, label: 'document.readyState' })
    if (waitForAppReady) {
      await this.waitFor(
        () => {
          const boot = document.querySelector('.boot')
          const shell = document.querySelector('.app-shell')
          return !!shell && !boot
        },
        { timeoutMs: 15000, label: 'Vue app shell ready' },
      )
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  async reload(waitForAppReady = true): Promise<void> {
    await this.send('Page.reload', { ignoreCache: true })
    await new Promise((r) => setTimeout(r, 80))
    await this.waitFor(() => document.readyState === 'complete', { timeoutMs: 15000, label: 'document.readyState after reload' })
    if (waitForAppReady) {
      await this.waitFor(
        () => {
          const boot = document.querySelector('.boot')
          const shell = document.querySelector('.app-shell')
          return !!shell && !boot
        },
        { timeoutMs: 15000, label: 'Vue app shell ready after reload' },
      )
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  async navigateHash(hashPath: string): Promise<void> {
    const normalized = hashPath.startsWith('#') ? hashPath : `#${hashPath}`
    await this.evaluate((targetHash: unknown) => {
      window.location.hash = String(targetHash)
    }, normalized)
    await new Promise((r) => setTimeout(r, 150))
  }

  async currentHashPath(): Promise<string> {
    return this.evaluate(() => {
      const h = window.location.hash || '#/'
      return h.startsWith('#') ? h.slice(1) : h
    })
  }

  async clickPoint(x: number, y: number): Promise<void> {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    await new Promise((r) => setTimeout(r, 90))
  }

  async touchTap(x: number, y: number): Promise<void> {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    })
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await new Promise((r) => setTimeout(r, 90))
  }

  async touchSwipe(x1: number, y1: number, x2: number, y2: number, steps = 8): Promise<void> {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: x1, y: y1 }],
    })
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      await this.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(x1 + (x2 - x1) * t), y: Math.round(y1 + (y2 - y1) * t) }],
      })
      await new Promise((r) => setTimeout(r, 16))
    }
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await new Promise((r) => setTimeout(r, 120))
  }

  async pressKey(key: string): Promise<void> {
    const keyMap: Record<string, { code: string; windowsVirtualKeyCode: number }> = {
      Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
      Enter: { code: 'Enter', windowsVirtualKeyCode: 13 },
      Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
    }
    const meta = keyMap[key] ?? { code: key, windowsVirtualKeyCode: 0 }
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code: meta.code,
      windowsVirtualKeyCode: meta.windowsVirtualKeyCode,
    })
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: meta.code,
      windowsVirtualKeyCode: meta.windowsVirtualKeyCode,
    })
    await new Promise((r) => setTimeout(r, 120))
  }

  async clickByRoleOrText(opts: ClickOptions): Promise<void> {
    const point = await this.waitFor<{ x: number; y: number; tag: string } | null>(
      (rawOpts: unknown) => {
        const o = rawOpts as ClickOptions
        const dialogs = [...document.querySelectorAll('dialog[open]')]
        const root: ParentNode = o.withinOpenDialog && dialogs.length ? dialogs[dialogs.length - 1]! : document
        const selector =
          o.selector ??
          (o.role === 'link'
            ? 'a[href], [role="link"]'
            : o.role === 'button'
              ? 'button, [role="button"], summary'
              : o.role
                ? `[role="${o.role}"]`
                : 'button, a[href], summary, [role="button"], [role="link"], label.switch')

        const isVisible = (el: Element): boolean => {
          const rect = el.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return false
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
          if (el.closest('[inert], [aria-hidden="true"]')) return false
          return true
        }

        const candidates = [...root.querySelectorAll(selector)].filter(isVisible)
        const matches = candidates.filter((el) => {
          const ariaLabel = (el.getAttribute('aria-label') ?? '').trim()
          const innerText = ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
          if (o.name !== undefined) {
            return o.exact ? ariaLabel === o.name : ariaLabel.includes(o.name)
          }
          if (o.text !== undefined) {
            return o.exact ? innerText === o.text || ariaLabel === o.text : innerText.includes(o.text) || ariaLabel.includes(o.text)
          }
          return true
        })

        const chosen = matches[o.index ?? 0]
        if (!chosen) return null
        chosen.scrollIntoView({ block: 'center', inline: 'center' })
        const r = chosen.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return null
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), tag: chosen.tagName }
      },
      { args: [opts], timeoutMs: 8000, label: `clickByRoleOrText(${JSON.stringify(opts)})` },
    )
    await this.clickPoint(point.x, point.y)
  }

  async fillByLabel(label: string, value: string, opts: FillOptions = {}): Promise<void> {
    const info = await this.waitFor<{
      x: number
      y: number
      tag: string
      type: string
    } | null>(
      (rawLabel: unknown, rawOpts: unknown) => {
        const targetLabel = String(rawLabel)
        const o = rawOpts as FillOptions
        const dialogs = [...document.querySelectorAll('dialog[open]')]
        const root: ParentNode = o.withinOpenDialog && dialogs.length ? dialogs[dialogs.length - 1]! : document

        const isVisible = (el: Element): boolean => {
          const rect = el.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return false
          const cs = getComputedStyle(el)
          return cs.display !== 'none' && cs.visibility !== 'hidden'
        }

        let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null = null
        if (o.selector) {
          const el = root.querySelector(o.selector)
          if (el && isVisible(el)) control = el as HTMLInputElement
        }
        if (!control) {
          const fields = [...root.querySelectorAll('input, textarea, select')].filter(isVisible) as Array<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          >
          for (const f of fields) {
            const aria = (f.getAttribute('aria-label') ?? '').trim()
            const ph = (f.getAttribute('placeholder') ?? '').trim()
            const wrappingLabel = f.closest('label')
            const labelEl = f.id ? root.querySelector(`label[for="${CSS.escape(f.id)}"]`) : null
            const labelText = ((wrappingLabel ?? labelEl)?.textContent ?? '').replace(/\s+/g, ' ').trim()
            if (aria.includes(targetLabel) || labelText.includes(targetLabel) || ph.includes(targetLabel)) {
              control = f
              break
            }
          }
        }
        if (!control) return null
        control.scrollIntoView({ block: 'center', inline: 'center' })
        control.focus()
        const r = control.getBoundingClientRect()
        return {
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          tag: control.tagName,
          type: (control as HTMLInputElement).type || '',
        }
      },
      { args: [label, opts], timeoutMs: 8000, label: `fillByLabel(${label})` },
    )

    if (info.tag === 'SELECT' || info.type === 'date' || info.type === 'time' || info.type === 'datetime-local') {
      await this.evaluate(
        (rawLabel: unknown, rawValue: unknown, rawOpts: unknown) => {
          const targetLabel = String(rawLabel)
          const val = String(rawValue)
          const o = rawOpts as FillOptions
          const dialogs = [...document.querySelectorAll('dialog[open]')]
          const root: ParentNode = o.withinOpenDialog && dialogs.length ? dialogs[dialogs.length - 1]! : document
          const fields = [...root.querySelectorAll('input, textarea, select')] as Array<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          >
          const control = o.selector
            ? (root.querySelector(o.selector) as HTMLInputElement | HTMLSelectElement | null)
            : fields.find((f) => {
                const aria = (f.getAttribute('aria-label') ?? '').trim()
                const wrappingLabel = f.closest('label')
                const labelEl = f.id ? root.querySelector(`label[for="${CSS.escape(f.id)}"]`) : null
                const labelText = ((wrappingLabel ?? labelEl)?.textContent ?? '').replace(/\s+/g, ' ').trim()
                return aria.includes(targetLabel) || labelText.includes(targetLabel)
              })
          if (!control) throw new Error('Control disappeared during fillByLabel')
          if (control.tagName === 'SELECT') {
            const sel = control as HTMLSelectElement
            const opt = [...sel.options].find((oItem) => oItem.value === val || oItem.text.includes(val))
            sel.value = opt ? opt.value : val
          } else {
            control.value = val
          }
          control.dispatchEvent(new Event('input', { bubbles: true }))
          control.dispatchEvent(new Event('change', { bubbles: true }))
        },
        label,
        value,
        opts,
      )
      await new Promise((r) => setTimeout(r, 80))
      return
    }

    await this.clickPoint(info.x, info.y)
    await this.evaluate((rawLabel: unknown, rawValue: unknown, rawOpts: unknown) => {
      const targetLabel = String(rawLabel)
      const val = String(rawValue)
      const o = rawOpts as FillOptions
      const dialogs = [...document.querySelectorAll('dialog[open]')]
      const root: ParentNode = o.withinOpenDialog && dialogs.length ? dialogs[dialogs.length - 1]! : document
      const fields = [...root.querySelectorAll('input, textarea, select')] as Array<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
      const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
      const control =
        active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
          ? active
          : o.selector
            ? (root.querySelector(o.selector) as HTMLInputElement | HTMLTextAreaElement | null)
            : fields.find((f) => {
                const aria = (f.getAttribute('aria-label') ?? '').trim()
                const wrappingLabel = f.closest('label')
                const labelEl = f.id ? root.querySelector(`label[for="${CSS.escape(f.id)}"]`) : null
                const labelText = ((wrappingLabel ?? labelEl)?.textContent ?? '').replace(/\s+/g, ' ').trim()
                return aria.includes(targetLabel) || labelText.includes(targetLabel)
              })
      if (control && 'value' in control) {
        control.focus()
        control.value = ''
        control.dispatchEvent(new Event('input', { bubbles: true }))
      }
      void val
    }, label, value, opts)
    await this.send('Input.insertText', { text: value })
    await this.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await new Promise((r) => setTimeout(r, 100))
  }

  async setFileInput(selector: string, filename: string, content: string): Promise<void> {
    const filePath = path.join(this.userDataDir, filename)
    fs.writeFileSync(filePath, content, 'utf8')
    const doc = await this.send<{ root: { nodeId: number } }>('DOM.getDocument', { depth: -1 })
    const found = await this.send<{ nodeId: number }>('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector,
    })
    if (!found.nodeId) throw new Error(`File input not found: ${selector}`)
    await this.send('DOM.setFileInputFiles', {
      nodeId: found.nodeId,
      files: [filePath],
    })
    await new Promise((r) => setTimeout(r, 150))
  }

  getUserDataDir(): string {
    return this.userDataDir
  }

  getErrors(): BrowserErrorEntry[] {
    return [...this.errors]
  }

  clearErrors(): void {
    this.errors = []
  }

  assertNoErrors(context = 'page'): void {
    if (this.errors.length > 0) {
      throw new Error(
        `Browser JS/console errors detected during ${context}:\n${this.errors
          .map((e) => `[${e.source}] ${e.text}${e.url ? ` (${e.url}:${e.lineNumber ?? 0})` : ''}`)
          .join('\n')}`,
      )
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    try {
      if (this.ws.readyState === WebSocket.OPEN) {
        await Promise.race([
          this.send('Browser.close').catch(() => {}),
          new Promise((r) => setTimeout(r, 1500)),
        ])
      }
    } catch {}
    this.closed = true
    try {
      this.ws.close()
    } catch {}
    for (const [, entry] of this.pending) {
      entry.reject(new Error('CDP session closed'))
    }
    this.pending.clear()
    await CdpPage.forceKillAndClean(this.proc, this.userDataDir, true)
  }
}
