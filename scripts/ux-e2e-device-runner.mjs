#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDeviceBridge } from './lib/device-bridge.mjs'
import { connectWebViewCdp, delay } from './lib/webview-cdp.mjs'
import {
  assertPackageSafety,
  createBaselineManager,
  probeRunAsCapability,
} from './lib/device-baseline.mjs'
import { runScreenUxAudit } from './lib/ux-compliance-audit.mjs'

const VALID_SUITES = new Set(['all', 'flows', 'ux-audit', 'study', 'calendar', 'settings'])

function printHelp() {
  console.log(`Universal Android Device E2E & UX Compliance Runner (kitten-focus)

Usage:
  node scripts/ux-e2e-device-runner.mjs [options]

Options:
  --device <serial>     Target Android serial (physical OPPO USB/Wi-Fi OR emulator-*)
  --adb <path>          Explicit path to adb binary
  --package <appId>     Target Android application ID (default: com.xiaomao.focus.qa)
  --allow-non-qa        Allow mutating tests on non-.qa packages (e.g. com.xiaomao.focus)
  --apk <path>          Install/reinstall APK via orca emulator install before running
  --suite <name>        all | flows | ux-audit | study | calendar | settings (default: all)
  --port <n>            Local TCP port for adb forward to WebView DevTools (default: 9237)
  --output <dir>        Output directory (default: artifacts/ux-e2e/<timestamp>-<serial>)
  --no-restore          Skip baseline restore at teardown (for forensic inspection)
  --no-strict-css       Record brand-spec CSS violations as warnings without failing exit code
  --strict-css=<bool>   Explicitly set strict CSS enforcement (default: true)
  --dry-run             Probe adb, orca emulator, package, run-as, and WebView CDP without mutating
  --json                Print structured JSON report to stdout (progress logs go to stderr)
  --help, -h            Show this help message
`)
}

function parseCliArgs(argv) {
  const opts = {
    device: undefined,
    adb: undefined,
    packageName: process.env.ANDROID_APP_ID || 'com.xiaomao.focus.qa',
    allowNonQa: false,
    apk: undefined,
    suite: 'all',
    port: 9237,
    output: undefined,
    noRestore: false,
    strictCss: true,
    dryRun: false,
    json: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`)
      return argv[++i]
    }
    if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--device') opts.device = next()
    else if (arg.startsWith('--device=')) opts.device = arg.slice('--device='.length)
    else if (arg === '--adb') opts.adb = next()
    else if (arg.startsWith('--adb=')) opts.adb = arg.slice('--adb='.length)
    else if (arg === '--package') opts.packageName = next()
    else if (arg.startsWith('--package=')) opts.packageName = arg.slice('--package='.length)
    else if (arg === '--allow-non-qa') opts.allowNonQa = true
    else if (arg === '--apk') opts.apk = next()
    else if (arg.startsWith('--apk=')) opts.apk = arg.slice('--apk='.length)
    else if (arg === '--suite') opts.suite = next()
    else if (arg.startsWith('--suite=')) opts.suite = arg.slice('--suite='.length)
    else if (arg === '--port') opts.port = Number(next())
    else if (arg.startsWith('--port=')) opts.port = Number(arg.slice('--port='.length))
    else if (arg === '--output') opts.output = next()
    else if (arg.startsWith('--output=')) opts.output = arg.slice('--output='.length)
    else if (arg === '--no-restore') opts.noRestore = true
    else if (arg === '--no-strict-css') opts.strictCss = false
    else if (arg === '--strict-css') opts.strictCss = true
    else if (arg.startsWith('--strict-css=')) {
      const val = arg.slice('--strict-css='.length).toLowerCase()
      opts.strictCss = val !== 'false' && val !== '0'
    } else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--json') opts.json = true
    else throw new Error(`Unknown CLI option: ${arg}`)
  }

  if (!VALID_SUITES.has(opts.suite)) {
    throw new Error(`Invalid --suite "${opts.suite}". Expected one of: ${[...VALID_SUITES].join(', ')}`)
  }
  if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
    throw new Error(`Invalid --port "${opts.port}"`)
  }
  return opts
}

function makeLogger(jsonMode) {
  return (msg) => {
    const line = `[ux-e2e] ${msg}`
    if (jsonMode) console.error(line)
    else console.log(line)
  }
}

function sanitizeSerialForPath(serial) {
  return String(serial || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_')
}

async function closeAnyOpenDialogs(cdp) {
  for (let i = 0; i < 4; i++) {
    const openCount = await cdp.evaluate('document.querySelectorAll("dialog[open]").length')
    if (openCount === 0) return
    const closed = await cdp
      .tapByRoleOrText({ role: 'button', name: '关闭', timeout: 1500 })
      .then(() => true)
      .catch(() => false)
    if (!closed) {
      await cdp
        .tapByRoleOrText({ role: 'button', name: '取消', timeout: 1500 })
        .catch(async () => {
          await cdp.evaluate(`document.querySelectorAll('dialog[open]').forEach(d => d.close())`)
        })
    }
    await delay(150)
  }
}

async function tapAnyRoleOrText(cdp, matchers, label = 'control', timeout = 10000) {
  const list = matchers.map((m) => (typeof m === 'string' ? { name: m } : m))
  const found = await cdp.waitUntil(
    async () => {
      for (const target of list) {
        const res = await cdp.locateControl(target)
        if (res?.found) return { target, info: res }
      }
      return null
    },
    `${label} (${list.map((m) => m.name || m.text || m.role).join(' | ')})`,
    timeout,
  )
  if (!found.info.hitTestable) {
    throw new Error(`Control ${JSON.stringify(found.target)} found at (${found.info.x}, ${found.info.y}) but obscured from hit-testing`)
  }
  await cdp.tapPoint(found.info.x, found.info.y)
  return found.info
}

async function waitForAnyText(cdp, needles, waitTimeout = 12000) {
  return cdp.waitUntil(
    async () => {
      const bodyText = await cdp.evaluate('document.body.innerText || ""')
      const matched = needles.find((n) => bodyText.includes(n))
      return matched || null
    },
    `any text (${needles.join(' | ')})`,
    waitTimeout,
  )
}

async function openStudyModeSheet(cdp) {
  const explicitConfig = await tapAnyRoleOrText(
    cdp,
    [
      { role: 'button', name: '学霸模式设置' },
      { role: 'button', name: '配置学霸模式' },
      { role: 'button', name: '打开学霸模式' },
    ],
    'study mode settings button',
    1200,
  ).catch(() => null)
  if (explicitConfig) return explicitConfig

  // M2 dual-zone .study-entry capsule: right button opens StudyModeSheet while left toggles.
  const dualZoneRight = await cdp.evaluate(`(() => {
    const entry = document.querySelector('.study-entry, .study-capsule');
    if (!entry) return null;
    const btns = [...entry.querySelectorAll('button')];
    if (btns.length >= 2) {
      const r = btns[btns.length - 1].getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  })()`)
  if (dualZoneRight) {
    await cdp.tapPoint(dualZoneRight.x, dualZoneRight.y)
    return dualZoneRight
  }
  return cdp.tapByRoleOrText({ role: 'button', name: '学霸模式' })
}

async function runDryRun(bridge, opts, outDir, log) {
  log(`Dry-run probe on device=${bridge.serial} package=${opts.packageName}`)
  const deviceInfo = bridge.getDeviceInfo()
  const pkgInfo = bridge.getInstalledPackageInfo(opts.packageName)
  const runAsProbe = probeRunAsCapability(bridge, opts.packageName)

  const cdp = await connectWebViewCdp(bridge, {
    packageName: opts.packageName,
    port: opts.port,
    launch: true,
  })
  try {
    const control = await cdp.native('observeControl')
    const recovery = await cdp.native('previewRecovery')
    const route = await cdp.evaluate('location.hash || "#/"')
    const title = await cdp.evaluate('document.title')
    const viewport = await cdp.evaluate('({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio })')

    const report = {
      ok: true,
      mode: 'dry-run',
      timestamp: new Date().toISOString(),
      suite: opts.suite,
      strictCss: opts.strictCss,
      outputDir: outDir,
      device: deviceInfo,
      package: pkgInfo,
      baselineProbe: {
        runAsSupported: runAsProbe.supported,
        selectedMode: runAsProbe.mode,
        detail: runAsProbe.detail,
      },
      webviewCdp: {
        pid: cdp.pid,
        discoveryMethod: cdp.discoveryMethod,
        localPort: cdp.localPort,
        targetUrl: cdp.targetUrl,
        documentTitle: title,
        currentRoute: route,
        viewport,
      },
      nativeState: {
        controlOwner: control.owner,
        needsReconcile: control.needsReconcile,
        recoveryPending: recovery.pending,
      },
      jsErrorsObserved: cdp.getErrors(),
      executionPlan:
        opts.suite === 'all'
          ? ['flows', 'study', 'calendar', 'settings', 'ux-audit']
          : [opts.suite],
    }
    writeFileSync(resolve(outDir, 'results.json'), JSON.stringify(report, null, 2))
    return report
  } finally {
    cdp.close()
  }
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    return
  }

  const root = resolve(import.meta.dirname, '..')
  const log = makeLogger(opts.json)
  assertPackageSafety({
    packageName: opts.packageName,
    allowNonQa: opts.allowNonQa,
    dryRun: opts.dryRun,
  })

  const bridge = createDeviceBridge({
    root,
    adbPath: opts.adb,
    device: opts.device,
  })

  const timestampTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = resolve(
    root,
    opts.output || `artifacts/ux-e2e/${timestampTag}-${sanitizeSerialForPath(bridge.serial)}`,
  )
  mkdirSync(outDir, { recursive: true })

  if (opts.apk && !opts.dryRun) {
    log(`Installing APK via orca emulator install: ${opts.apk}`)
    bridge.orcaInstall(opts.apk, true)
  }

  if (opts.dryRun) {
    const dryReport = await runDryRun(bridge, opts, outDir, log)
    if (opts.json) console.log(JSON.stringify(dryReport, null, 2))
    else {
      log(`Dry-run succeeded: ${dryReport.device.serial} (${dryReport.device.kind}), CDP=${dryReport.webviewCdp.discoveryMethod}, baseline=${dryReport.baselineProbe.selectedMode}`)
    }
    return
  }

  const startedAt = new Date().toISOString()
  const deviceInfo = bridge.getDeviceInfo()
  const pkgInfo = bridge.getInstalledPackageInfo(opts.packageName)

  let cdp = await connectWebViewCdp(bridge, {
    packageName: opts.packageName,
    port: opts.port,
    launch: true,
  })

  const baseline = await createBaselineManager(bridge, cdp, {
    packageName: opts.packageName,
    allowNonQa: opts.allowNonQa,
    port: opts.port,
    noRestore: opts.noRestore,
  })
  cdp = baseline.cdp

  const scenarios = []
  const uxAudits = []
  const screenshots = []
  let runError = null
  let restoreReport = null

  const recordScenario = (name, passed, details = {}) => {
    scenarios.push({ name, passed, timestamp: new Date().toISOString(), ...details })
    log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
  }

  const auditCheckpoint = async (label, options = {}) => {
    const result = await runScreenUxAudit(cdp, {
      label,
      strictCss: opts.strictCss,
      ...options,
    })
    uxAudits.push(result)
    const shotPath = resolve(outDir, `screen-${String(uxAudits.length).padStart(2, '0')}-${label.replace(/[^A-Za-z0-9_-]/g, '_')}.png`)
    await cdp.screenshot(shotPath).catch(() => {})
    screenshots.push(shotPath)
    return result
  }

  try {
    log(`Installing clean baseline fixture via ${baseline.mode}...`)
    cdp = await baseline.installCleanFixture()
    cdp.clearErrors()

    const shouldRun = (name) => opts.suite === 'all' || opts.suite === name

    if (shouldRun('flows')) {
      log('Running suite: flows (5-tab navigation, Cat placeholder, <=2-step task & free focus, pause/reload/background, rest)')
      const tabs = [
        ['/tasks', '待办'],
        ['/calendar', '日历'],
        ['/cat', '小猫'],
        ['/statistics', '统计'],
        ['/settings', '我的'],
      ]
      for (const [path, label] of tabs) {
        await cdp.tapByRoleOrText({ role: 'tab', name: label })
        await cdp.waitForRoute(path)
        if (path === '/cat') {
          await cdp.waitForText('小猫还未入驻')
          const catText = await cdp.evaluate('(document.querySelector("main")?.innerText || "").trim()')
          assert.equal(catText, '小猫还未入驻', `Expected CatView placeholder "小猫还未入驻", got "${catText}"`)
        }
      }
      recordScenario('five-tab-navigation-and-cat-placeholder', true, { tabs: tabs.map((t) => t[0]) })

      await cdp.tapByRoleOrText({ role: 'tab', name: '待办' })
      await cdp.waitForRoute('/tasks')
      await auditCheckpoint('tasks-empty', { isPrimaryStudentScreen: true })

      // Create first task theme + subtask (supports both empty-state & populated-state flows)
      const hasCreateFirst = (await cdp.locateControl({ role: 'button', name: '创建第一个待办' })).found
      if (hasCreateFirst) {
        await cdp.tapByRoleOrText({ role: 'button', name: '创建第一个待办' })
        await cdp.waitForDialogOpen()
        await cdp.fillByLabel('待办名称', '极限刷题')
        await cdp.fillByLabel(['所属主题', '主题名称', '新主题名称'], '高数')
        await tapAnyRoleOrText(
          cdp,
          [
            { role: 'button', name: '仅保存' },
            { role: 'button', name: '保存待办' },
          ],
          'save first task',
        )
        await cdp.waitForDialogClosed()
      } else {
        await cdp.tapByRoleOrText({ role: 'button', name: '新建主题' })
        await cdp.waitForDialogOpen()
        await cdp.fillByLabel('主题名称', '高数')
        await cdp.tapByRoleOrText({ role: 'button', name: '保存主题' })
        await cdp.waitForDialogClosed()
        await cdp.tapByRoleOrText({ role: 'button', name: '添加待办' })
        await cdp.waitForDialogOpen()
        await cdp.fillByLabel('待办名称', '极限刷题')
        await tapAnyRoleOrText(
          cdp,
          [
            { role: 'button', name: '仅保存' },
            { role: 'button', name: '保存待办' },
          ],
          'save task',
        )
        await cdp.waitForDialogClosed()
      }
      await cdp.waitForText('极限刷题')
      await auditCheckpoint('tasks-populated', { isPrimaryStudentScreen: true })

      // Start task focus and measure step count (must be <= 2 steps)
      let startSteps = 1
      await cdp.tapByRoleOrText({ role: 'button', name: '开始极限刷题' })
      await delay(300)
      const routeAfterTap = await cdp.evaluate('location.hash')
      if (routeAfterTap !== '#/focus') {
        const dialogOpen = await cdp.evaluate('document.querySelectorAll("dialog[open]").length > 0')
        if (dialogOpen) {
          startSteps += 1
          await cdp.tapByRoleOrText({ role: 'button', name: '开始专注' })
        }
      }
      await cdp.waitForRoute('/focus')
      assert(startSteps <= 2, `Task focus start took ${startSteps} steps (expected <= 2)`)
      recordScenario('task-focus-start-within-2-steps', true, { steps: startSteps })

      await auditCheckpoint('focus-running', { isPrimaryStudentScreen: true })

      // Pause -> Reload -> Verify persistence -> Resume -> Background -> End -> Rest
      await delay(1100)
      await cdp.tapByRoleOrText({ role: 'button', name: '暂停专注' })
      await cdp.waitForText('已暂停')
      await cdp.reload()
      await cdp.waitForText('已暂停')
      await cdp.tapByRoleOrText({ role: 'button', name: '继续专注' })
      await cdp.waitForText('专注进行中')

      const elapsedBeforeBg = (await cdp.native('observeControl')).focus.elapsedMs
      if (bridge.orcaPath) bridge.orcaButton('home')
      else bridge.shell(['input', 'keyevent', 'KEYCODE_HOME'])
      await delay(1400)
      bridge.wakeupAndLaunch(opts.packageName)
      await cdp.waitForRoute('/focus')
      const elapsedAfterBg = (await cdp.native('observeControl')).focus.elapsedMs
      assert(elapsedAfterBg >= elapsedBeforeBg + 900, `Background timer did not advance (${elapsedBeforeBg} -> ${elapsedAfterBg})`)
      recordScenario('focus-pause-reload-resume-background', true, { elapsedBeforeBg, elapsedAfterBg })

      // End focus -> verify result & manual 5-min rest -> exit rest
      await cdp.tapByRoleOrText({ role: 'button', name: '结束专注' })
      await cdp.waitForDialogOpen()
      await auditCheckpoint('focus-end-confirm', { isPrimaryStudentScreen: true })
      await cdp.tapByRoleOrText({ role: 'button', name: '结束专注' })
      await cdp.waitForDialogClosed()
      await waitForAnyText(cdp, ['提前结束', '本次专注正常结束', '本次专注已结束'])
      await auditCheckpoint('focus-result', { isPrimaryStudentScreen: true })

      await cdp.tapByRoleOrText({ role: 'button', name: '休息 5 分钟' })
      await cdp.waitForRoute('/rest')
      await cdp.waitForText('休息一下')
      await auditCheckpoint('rest-running', { isPrimaryStudentScreen: true })

      await cdp.tapByRoleOrText({ role: 'button', name: '退出休息' })
      await cdp.waitForDialogOpen()
      await cdp.tapByRoleOrText({ role: 'button', name: '退出休息' })
      await cdp.waitForDialogClosed()
      await cdp.waitForRoute('/tasks')
      recordScenario('focus-end-and-rest-exit', true)

      // Free focus <= 2 steps
      let freeSteps = 0
      await cdp.tapByRoleOrText({ role: 'button', name: '自由专注' })
      freeSteps += 1
      await cdp.waitForDialogOpen()
      await cdp.tapByRoleOrText({ role: 'button', name: '开始专注' })
      freeSteps += 1
      await cdp.waitForRoute('/focus')
      await cdp.waitForText('自由专注')
      assert(freeSteps <= 2, `Free focus start took ${freeSteps} steps (expected <= 2)`)
      await cdp.tapByRoleOrText({ role: 'button', name: '结束专注' })
      await cdp.waitForDialogOpen()
      await cdp.tapByRoleOrText({ role: 'button', name: '结束专注' })
      await cdp.waitForDialogClosed()
      await waitForAnyText(cdp, ['提前结束', '本次专注正常结束', '本次专注已结束'])
      await cdp.tapByRoleOrText({ role: 'button', name: '返回待办' })
      await cdp.waitForRoute('/tasks')
      recordScenario('free-focus-start-within-2-steps', true, { steps: freeSteps })
    }

    if (shouldRun('study')) {
      log('Running suite: study (StudyModeSheet 1+3+1 & zero nested modals)')
      await closeAnyOpenDialogs(cdp)
      await cdp.navigateRoute('/tasks')
      await openStudyModeSheet(cdp)
      await cdp.waitForDialogOpen()
      await auditCheckpoint('study-mode-home', { isPrimaryStudentScreen: true })

      const subviewCandidates = [
        ['应用限制'],
        ['严格模式'],
        ['免打扰'],
        ['权限与使用帮助', '授权与权限'],
      ]
      for (const names of subviewCandidates) {
        await tapAnyRoleOrText(
          cdp,
          names.map((name) => ({ role: 'button', name })),
          `study subview ${names[0]}`,
        )
        await delay(150)
        const dialogCount = await cdp.evaluate('document.querySelectorAll("dialog[open]").length')
        assert.equal(dialogCount, 1, `Nested modal detected in StudyMode subview "${names[0]}" (count=${dialogCount})`)
        await auditCheckpoint(`study-mode-${names[0]}`, {
          isPrimaryStudentScreen: false,
          checkScreenBudget: false,
        })
        await tapAnyRoleOrText(
          cdp,
          [
            { role: 'button', name: '返回' },
            { role: 'button', name: '学霸模式' },
          ],
          'study mode back',
        )
        await delay(150)
      }
      await closeAnyOpenDialogs(cdp)
      await cdp.waitForDialogClosed()
      recordScenario('study-mode-in-sheet-navigation-zero-nested-modals', true)
    }

    if (shouldRun('calendar')) {
      log('Running suite: calendar (schedule, event creation, actuals, timetable, statistics)')
      await closeAnyOpenDialogs(cdp)
      await cdp.tapByRoleOrText({ role: 'tab', name: '日历' }).catch(() => cdp.navigateRoute('/calendar'))
      await cdp.waitForRoute('/calendar')
      await auditCheckpoint('calendar-schedule-plan', { isPrimaryStudentScreen: true })

      await cdp.tapByRoleOrText({ role: 'button', name: '添加日程' })
      await cdp.waitForDialogOpen()
      await cdp.fillByLabel('日程名称', '高等数学复习')
      await cdp.tapByRoleOrText({ role: 'button', name: '保存日程' })
      await cdp.waitForDialogClosed()
      await cdp.waitForText('高等数学复习')

      await cdp.tapByRoleOrText({ role: 'button', name: '实际', exact: true })
      await delay(150)
      await auditCheckpoint('calendar-actual', { isPrimaryStudentScreen: true })

      const directTimetable = await cdp.locateControl({ role: 'button', name: '课表', exact: true })
      if (directTimetable.found) {
        await cdp.tapByRoleOrText({ role: 'button', name: '课表', exact: true })
      } else {
        await tapAnyRoleOrText(
          cdp,
          [
            { role: 'button', name: '日历视图与设置' },
            { role: 'button', name: '更多' },
            { role: 'button', name: '菜单' },
            { role: 'button', name: '•••' },
            { role: 'button', name: '⋯' },
          ],
          'calendar overflow menu',
        )
        await cdp.waitForDialogOpen()
        await tapAnyRoleOrText(
          cdp,
          [
            { role: 'button', name: '切换到课表视图' },
            { role: 'button', name: '课表' },
          ],
          'switch to timetable view',
        )
        await cdp.waitForDialogClosed()
      }
      await delay(150)
      await auditCheckpoint('calendar-timetable', { isPrimaryStudentScreen: true })

      const backToScheduleBtn = await cdp.locateControl({ role: 'button', name: '日程' })
      if (backToScheduleBtn.found) {
        await cdp.tapByRoleOrText({ role: 'button', name: '日程' })
      } else {
        await tapAnyRoleOrText(
          cdp,
          [
            { role: 'button', name: '返回日程' },
            { role: 'button', name: '日历视图与设置' },
            { role: 'button', name: '更多' },
          ],
          'calendar back to schedule',
        )
        const dialogOpen = await cdp.evaluate('document.querySelectorAll("dialog[open]").length > 0')
        if (dialogOpen) {
          await tapAnyRoleOrText(
            cdp,
            [
              { role: 'button', name: '切换到日程视图' },
              { role: 'button', name: '日程' },
            ],
            'switch to schedule view',
          )
          await cdp.waitForDialogClosed()
        }
      }
      await cdp.tapByRoleOrText({ role: 'button', name: '计划', exact: true })
      recordScenario('calendar-schedule-actual-timetable', true)

      // Statistics 5 periods & record sheet
      await cdp.tapByRoleOrText({ role: 'tab', name: '统计' }).catch(() => cdp.navigateRoute('/statistics'))
      await cdp.waitForRoute('/statistics')
      for (const period of ['日', '周', '月', '年', '累计']) {
        await cdp.tapByRoleOrText({ role: 'button', name: period, exact: true })
        await delay(100)
      }
      await auditCheckpoint('statistics-overview', { isPrimaryStudentScreen: true })
      await tapAnyRoleOrText(
        cdp,
        [
          { role: 'button', name: '查看专注记录' },
          { role: 'button', name: '专注记录' },
        ],
        'statistics records button',
      )
      await cdp.waitForDialogOpen()
      const statDialogs = await cdp.evaluate('document.querySelectorAll("dialog[open]").length')
      assert.equal(statDialogs, 1, 'Expected single dialog layer in statistics records')
      await closeAnyOpenDialogs(cdp)
      recordScenario('statistics-periods-and-records', true)
    }

    if (shouldRun('settings')) {
      log('Running suite: settings (progressive disclosure & secondary routes)')
      await closeAnyOpenDialogs(cdp)
      await cdp.tapByRoleOrText({ role: 'tab', name: '我的' }).catch(() => cdp.navigateRoute('/settings'))
      await cdp.waitForRoute('/settings')
      await auditCheckpoint('settings-home', { isPrimaryStudentScreen: true })

      const hasUnifiedBackup = (await cdp.locateControl({ role: 'button', name: '本地备份与恢复' })).found
      if (hasUnifiedBackup) {
        await cdp.tapByRoleOrText({ role: 'button', name: '本地备份与恢复' })
        await cdp.waitForDialogOpen()
        await auditCheckpoint('settings-backup-sheet', { isPrimaryStudentScreen: false })
        await closeAnyOpenDialogs(cdp)
      }

      for (const route of ['/permissions', '/help', '/emergency', '/recovery', '/lock']) {
        await cdp.navigateRoute(route)
        await delay(150)
        await auditCheckpoint(`secondary-${route.slice(1)}`, {
          isPrimaryStudentScreen: false,
          checkScreenBudget: false,
        })
      }
      await cdp.navigateRoute('/tasks')
      recordScenario('progressive-disclosure-secondary-routes-reachable', true)
    }

    if (shouldRun('ux-audit')) {
      log('Running suite: ux-audit (full route & Input Scheme A CSS compliance)')
      await closeAnyOpenDialogs(cdp)
      for (const [route, primary] of [
        ['/tasks', true],
        ['/calendar', true],
        ['/cat', true],
        ['/statistics', true],
        ['/settings', true],
      ]) {
        await cdp.navigateRoute(route)
        await delay(150)
        await auditCheckpoint(`audit-${route.slice(1)}`, {
          isPrimaryStudentScreen: primary,
        })
      }
      await cdp.navigateRoute('/tasks')
      await cdp.tapByRoleOrText({ role: 'button', name: '新建主题' })
      await cdp.waitForDialogOpen()
      await auditCheckpoint('audit-input-scheme-a', {
        isPrimaryStudentScreen: true,
        checkInputSchemeA: true,
        checkScreenBudget: false,
      })
      await closeAnyOpenDialogs(cdp)
      recordScenario('ux-audit-complete-walkthrough', true)
    }
  } catch (err) {
    runError = err
    log(`Failure during test execution: ${err.message}`)
    await cdp.screenshot(resolve(outDir, 'failure.png')).catch(() => {})
  } finally {
    const jsErrors = cdp.getErrors()
    try {
      restoreReport = await baseline.restore(cdp)
      cdp = restoreReport.cdp || cdp
    } catch (restoreErr) {
      runError = runError
        ? new AggregateError([runError, restoreErr], 'Execution and baseline restoration both failed')
        : restoreErr
    } finally {
      if (cdp && !cdp.closed) cdp.close()
    }

    const logcatReport = restoreReport || baseline.collectLogcatReport()
    const logcatEntries = logcatReport.logcatEntries || logcatReport.entries || []
    writeFileSync(
      resolve(outDir, 'logcat.txt'),
      logcatEntries.map((e) => e.raw || `${e.timestamp} ${e.level} ${e.tag}: ${e.message}`).join('\n'),
    )
    writeFileSync(resolve(outDir, 'ux-audit.json'), JSON.stringify(uxAudits, null, 2))

    const failedScenarios = scenarios.filter((s) => !s.passed)
    const failedAudits = uxAudits.filter((a) => !a.passed)
    const fatalCount = logcatReport.fatalCheck?.fatalCount ?? 0
    const overallOk =
      !runError &&
      failedScenarios.length === 0 &&
      failedAudits.length === 0 &&
      jsErrors.length === 0 &&
      fatalCount === 0

    const summaryReport = {
      ok: overallOk,
      startedAt,
      finishedAt: new Date().toISOString(),
      suite: opts.suite,
      strictCss: opts.strictCss,
      outputDir: outDir,
      device: deviceInfo,
      package: pkgInfo,
      baseline: {
        mode: baseline.mode,
        runAsProbe: baseline.runAsProbe,
        privateDigest: baseline.privateDigest,
        restored: restoreReport?.restored ?? false,
        skipped: restoreReport?.skipped ?? false,
        controlOwnerAfter: restoreReport?.controlOwnerAfter ?? null,
        systemUnchanged: restoreReport?.systemUnchanged ?? null,
      },
      scenarios,
      uxAuditSummary: {
        checkpoints: uxAudits.length,
        passedCount: uxAudits.length - failedAudits.length,
        failedCount: failedAudits.length,
        failedLabels: failedAudits.map((a) => ({
          label: a.label,
          gates: a.gates,
          cssViolations: {
            overflow: !a.css.overflow.passed ? a.css.overflow : undefined,
            palette: a.css.palette.violations,
            pageMargins: !a.css.pageMargins.passed ? a.css.pageMargins : undefined,
            cardRadius: a.css.cardRadius.violations,
            touchTargets: a.css.touchTargets.violations,
            fontSizes: a.css.fontSizes.violations,
            timerTypography: a.css.timerTypography.violations,
            inputSchemeA: a.css.inputSchemeA.violations,
          },
          budget: !a.gates.primaryCtaBudget || !a.gates.decisionBudget ? a.screenBudget : undefined,
          copyHygiene: !a.gates.copyHygiene ? a.copyHygiene : undefined,
          nestedModals: !a.gates.nestedModals ? a.nestedModals : undefined,
        })),
      },
      webViewJsErrors: jsErrors,
      logcat: {
        source: logcatReport.logcatSource || logcatReport.source,
        entryCount: logcatEntries.length,
        fatalCheck: logcatReport.fatalCheck,
      },
      screenshots,
      error: runError
        ? {
            message: runError.message,
            stack: runError.stack,
          }
        : null,
    }

    writeFileSync(resolve(outDir, 'results.json'), JSON.stringify(summaryReport, null, 2))

    if (opts.json) {
      console.log(JSON.stringify(summaryReport, null, 2))
    } else {
      log(
        `Finished: ok=${overallOk}, scenarios=${scenarios.length} (failed=${failedScenarios.length}), audits=${uxAudits.length} (failed=${failedAudits.length}), jsErrors=${jsErrors.length}, logcatFatals=${fatalCount}`,
      )
      log(`Artifacts saved to ${outDir}`)
    }

    if (!overallOk) {
      process.exitCode = 1
    }
  }
}

main().catch((err) => {
  console.error(`[ux-e2e] Fatal runner error: ${err.stack || err.message}`)
  process.exitCode = 1
})
