import type { CdpPage } from './cdpBrowser'

export interface UxViolation {
  code: string
  message: string
  details?: unknown
}

export interface ModalAuditResult {
  openDialogCount: number
  violations: UxViolation[]
}

export interface ScreenBudgetResult {
  scope: 'dialog' | 'main'
  primaryCtaCount: number
  decisionCount: number
  primaryCtaLabels: string[]
  decisionLabels: string[]
  violations: UxViolation[]
}

export interface ForbiddenStringResult {
  matches: Array<{ category: string; term: string }>
  repeatedUnsupportedCount: number
  violations: UxViolation[]
}

export interface BrandSpecAuditResult {
  tokens: {
    white: string
    surface: string
    ink: string
    muted: string
    line: string
    accent: string
  }
  scrollWidth: number
  innerWidth: number
  smallTouchTargets: Array<{ label: string; width: number; height: number }>
  smallFonts: Array<{ text: string; fontSize: number }>
  badCardRadii: Array<{ label: string; borderRadius: string }>
  badPageMargins: Array<{ label: string; paddingLeft: string; paddingRight: string }>
  badTimers: Array<{ label: string; fontFamily: string; fontVariantNumeric: string }>
  violations: UxViolation[]
}

export interface InputSchemeAResult {
  testedCount: number
  failures: Array<{ label: string; reason: string }>
  violations: UxViolation[]
}

export interface ReducedMotionResult {
  mediaMatches: boolean
  offendingElements: Array<{ label: string; transitionDuration: string; animationDuration: string }>
  violations: UxViolation[]
}

export const ALWAYS_FORBIDDEN_IDENTIFIERS = [
  'needsReconcile',
  'launcherCacheVerified',
  'applicationsWithdrawn',
  'navigationWithdrawn',
  'antiCloseWithdrawn',
  'temporaryAccessAllowed',
  'studyLocked',
  'runtime-only',
  'forceStopImmune',
  'cropVerified',
  'providerSettingsVerified',
  'recoveryPending',
  'ordinaryAdmin',
  'deviceOwner',
  'profileOwner',
  'lastAssociation',
  'processToken',
  'bootCount',
  'anchorMono',
  'anchorEpoch',
  'schemaVersion',
  'lockMainInterfaceRestricted',
  'navigationHomeRecents',
  'preciseAntiClose',
  'recentTasksHidden',
  'launcherIconHidden',
  'wallpaperProtection',
] as const

export const GLOSSARY_AVOID_TERMS = [
  '大主题模块',
  '子日程',
  '番茄数',
  '番茄钟',
  '待办完成',
  '本次专注已完成',
  '后台诊断',
  '临时待办',
  '计划时长',
  '总跨度',
  '设备所有者模式',
  '设备所有者权限',
  '关闭屏幕',
  '锁定系统密码',
  '应用限制模式',
  '系统冻结',
  '删除消息',
  '隐藏所有通知',
  '小猫代发原应用消息',
  '清空拦截日志',
  '全部应用',
  '屏蔽名单',
  '自然年度周数',
  '正计时手动结束',
  '经验值',
  '金币',
  '小猫物品',
  '成长形态',
  '等级',
  '主宠',
  '装备宠物',
  '猫窝商店',
  '家园等级',
  '系统强锁',
  '无障碍拦截',
  '修改历史记录时长',
  '待办备注',
  '赛季通行证',
  '排行榜头衔',
] as const

export const PRIMARY_DIAGNOSTIC_TELEMETRY = [
  '本轮已停止新拦截',
  '等待系统释放并核实原通知',
  '待核实',
  '已观察原通知恢复',
  '已撤回或当前不存在',
  '不存在不等于已恢复',
  '释放请求不等于已经恢复',
  '有限租期到期后仍需重连核实',
  '系统核实暂缓',
  '最长 60 秒的滚动租期',
  '本轮声音辅助已主动撤销',
  '小猫规则已移除，本轮不会自动重建',
  '监听未连接，保护失效',
  '重连通知监听',
  '滚动租期',
  '独立效果核验',
  '恢复责任',
  '本轮记账',
  '原壁纸状态',
  '待准备原壁纸状态',
  '本轮快照',
  '原生检查拦截',
  '普通管理员',
  '设备所有者',
  '资料所有者',
  '升级恢复副本',
  '本轮请求',
  '当前执行',
  '启动器缓存',
  '未核实本机设备管理身份',
] as const

export const TASKS_HEADER_STATE_BADGES = [
  '已撤销',
  '状态异常',
  '已失效',
  '待连接',
  '待生效',
  '检查中',
  '不支持',
] as const

export async function auditModals(page: CdpPage): Promise<ModalAuditResult> {
  const openDialogCount = await page.evaluate(() => document.querySelectorAll('dialog[open]').length)
  const violations: UxViolation[] = []
  if (openDialogCount > 1) {
    violations.push({
      code: 'NESTED_MODAL',
      message: `Expected at most 1 open <dialog>, found ${openDialogCount}`,
      details: { openDialogCount },
    })
  }
  return { openDialogCount, violations }
}

export async function auditScreenBudget(page: CdpPage): Promise<ScreenBudgetResult> {
  const raw = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('dialog[open]')]
    const isDialog = dialogs.length > 0
    const root: Element = isDialog
      ? dialogs[dialogs.length - 1]!
      : (document.querySelector('main') ?? document.body)

    const isVisible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      if (el.closest('[inert], [aria-hidden="true"]')) return false
      const detailsParent = el.closest('details:not([open])')
      if (detailsParent && !el.closest('summary')) return false
      let cur: Element | null = el
      while (cur) {
        const cs = getComputedStyle(cur)
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
          return false
        }
        if (cs.position === 'fixed') {
          const r = cur === el ? rect : cur.getBoundingClientRect()
          if (
            r.right <= 0 ||
            r.left >= window.innerWidth ||
            r.bottom <= 0 ||
            r.top >= window.innerHeight
          ) {
            return false
          }
          if (rect.right <= 0 || rect.left >= window.innerWidth) {
            return false
          }
        }
        cur = cur.parentElement
      }
      return true
    }

    const labelOf = (el: Element): string => {
      const aria = (el.getAttribute('aria-label') ?? '').trim()
      const txt = ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
      return aria || txt || el.tagName.toLowerCase()
    }

    // Primary CTAs inside active root
    const primaryEls = [
      ...root.querySelectorAll('.primary, [data-ux-role="primary-cta"], [data-primary-cta="true"]'),
    ].filter(isVisible)
    const primarySet = new Set<Element>(primaryEls)
    const primaryCtaLabels = primaryEls.map(labelOf)

    // Decision controls / switches at first glance inside active root
    const decisionLabels: string[] = []
    const counted = new Set<Element>()

    // 1. Segmented controls count as 1 decision group each
    const isStatsPage = Boolean(root.querySelector('.stats-page'))
    for (const seg of root.querySelectorAll('.segmented, .mini-switch, .period-tabs, .mini-distribution, [data-decision-group]')) {
      if (!isVisible(seg)) continue
      // Distribution switcher in StatisticsView lives in its own section below the first-glance trend (ux-spec.md §5.5.1)
      if (isStatsPage && seg.classList.contains('mini-distribution') && seg.closest('.stats-card')) {
        counted.add(seg)
        for (const child of seg.querySelectorAll('*')) counted.add(child)
        continue
      }
      counted.add(seg)
      for (const child of seg.querySelectorAll('*')) counted.add(child)
      decisionLabels.push(labelOf(seg))
    }

    // 2. Standalone switches / checkboxes / radios / selects
    const radioGroups = new Set<string>()
    for (const input of root.querySelectorAll('input[type="checkbox"], input[type="radio"], select, [role="switch"]')) {
      if (!isVisible(input) || counted.has(input)) continue
      // Skip if inside a list of user-created task cards or calendar grid cells
      if (input.closest('.item-list, .month-grid, .timetable-grid')) continue
      if (input instanceof HTMLInputElement && input.type === 'radio' && input.name) {
        if (radioGroups.has(input.name)) continue
        radioGroups.add(input.name)
      }
      counted.add(input)
      const labelParent = input.closest('label')
      decisionLabels.push(labelOf(labelParent ?? input))
    }

    // 3. Explicit top-level decision buttons / module rows / non-tabbar action links not already counted
    const isStudyModeHome = isDialog && !!root.querySelector('.master-card') && !!root.querySelector('.modules-list')
    let studyHelpAllowanceUsed = false
    for (const el of root.querySelectorAll('button, [role="button"], a[href]')) {
      if (!isVisible(el) || counted.has(el)) continue
      if (el.closest('.tabbar')) continue
      if (primarySet.has(el)) continue
      // Exclude sheet close/back icons, theme collapse/reorder/add-item/more icons, item cards, calendar day cells
      const aria = (el.getAttribute('aria-label') ?? '').trim()
      if (
        aria.startsWith('关闭') ||
        aria.startsWith('返回') ||
        aria.startsWith('收起主题') ||
        aria.startsWith('展开主题') ||
        aria.startsWith('编辑') ||
        aria.startsWith('开始') ||
        /^在.+下添加待办$/.test(aria) ||
        el.closest('.theme-actions') ||
        el.classList.contains('close') ||
        el.classList.contains('detail-back') ||
        el.classList.contains('task-main') ||
        el.classList.contains('task-more') ||
        el.classList.contains('module-nav') ||
        el.closest('.item-list, .month-grid, .week-strip, .timetable-grid, .record-list, .chip-row, .color-picker, .timeline, .all-day-list')
      ) {
        continue
      }
      // Also avoid double-counting a button that wraps or sits next to a switch in .module-row
      if (el.closest('.module-row')) continue
      // StudyModeSheet home allows 1 status link inside master-card and at most 1 quiet "权限与使用帮助" link (ux-spec.md §5.3)
      if (isStudyModeHome && el.closest('.master-card') && el.classList.contains('status-action')) continue
      if (
        isStudyModeHome &&
        !studyHelpAllowanceUsed &&
        !el.classList.contains('permissions-entry') &&
        /^权限与使用帮助/.test(labelOf(el))
      ) {
        studyHelpAllowanceUsed = true
        continue
      }
      counted.add(el)
      decisionLabels.push(labelOf(el))
    }

    return {
      scope: isDialog ? ('dialog' as const) : ('main' as const),
      primaryCtaCount: primaryEls.length,
      decisionCount: decisionLabels.length,
      primaryCtaLabels,
      decisionLabels,
    }
  })

  const violations: UxViolation[] = []
  if (raw.primaryCtaCount > 1) {
    violations.push({
      code: 'TOO_MANY_PRIMARY_CTAS',
      message: `Expected <= 1 primary CTA in ${raw.scope}, found ${raw.primaryCtaCount}: ${raw.primaryCtaLabels.join(', ')}`,
      details: raw,
    })
  }
  if (raw.decisionCount > 4) {
    violations.push({
      code: 'TOO_MANY_DECISIONS',
      message: `Expected <= 4 first-glance decisions in ${raw.scope}, found ${raw.decisionCount}: ${raw.decisionLabels.join(', ')}`,
      details: raw,
    })
  }

  return { ...raw, violations }
}

export async function auditForbiddenStrings(
  page: CdpPage,
  options: { isPrimaryScreen?: boolean; checkTasksHeaderBadges?: boolean } = {},
): Promise<ForbiddenStringResult> {
  const isPrimaryScreen = options.isPrimaryScreen ?? true
  const checkTasksHeaderBadges = options.checkTasksHeaderBadges ?? false

  const raw = await page.evaluate(
    (payload: unknown) => {
      const { ids, avoidTerms, diagTelemetry, tasksBadges, primary, checkTasks } = payload as {
        ids: string[]
        avoidTerms: string[]
        diagTelemetry: string[]
        tasksBadges: string[]
        primary: boolean
        checkTasks: boolean
      }
      const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim()
      const matches: Array<{ category: string; term: string }> = []

      for (const term of ids) {
        if (text.includes(term)) matches.push({ category: 'internal-id', term })
      }
      for (const term of avoidTerms) {
        if (text.includes(term)) matches.push({ category: 'glossary-avoid', term })
      }
      if (primary) {
        for (const term of diagTelemetry) {
          if (text.includes(term)) matches.push({ category: 'diagnostic-telemetry', term })
        }
        if (/另有\s*\d+\s*条原通知当前仍在正常显示/.test(text)) {
          matches.push({ category: 'diagnostic-telemetry', term: '另有 .* 条原通知当前仍在正常显示' })
        }
      }
      if (checkTasks) {
        const header = document.querySelector('.page-header')
        const headerText = ((header as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim()
        for (const badge of tasksBadges) {
          if (headerText.includes(badge)) matches.push({ category: 'tasks-header-state', term: badge })
        }
      }

      const unsupportedMatches = text.match(/(!\s*本机不支持|本机不支持|仅 Android 可用)/g)
      const repeatedUnsupportedCount = unsupportedMatches ? unsupportedMatches.length : 0

      return { matches, repeatedUnsupportedCount }
    },
    {
      ids: [...ALWAYS_FORBIDDEN_IDENTIFIERS],
      avoidTerms: [...GLOSSARY_AVOID_TERMS],
      diagTelemetry: [...PRIMARY_DIAGNOSTIC_TELEMETRY],
      tasksBadges: [...TASKS_HEADER_STATE_BADGES],
      primary: isPrimaryScreen,
      checkTasks: checkTasksHeaderBadges,
    },
  )

  const violations: UxViolation[] = []
  for (const m of raw.matches) {
    violations.push({
      code: 'FORBIDDEN_STRING',
      message: `Forbidden ${m.category} string visible in UI: "${m.term}"`,
      details: m,
    })
  }
  if (isPrimaryScreen && raw.repeatedUnsupportedCount > 1) {
    violations.push({
      code: 'REPEATED_UNSUPPORTED_NOTICE',
      message: `Platform unsupported notice repeated ${raw.repeatedUnsupportedCount} times on primary screen`,
      details: { count: raw.repeatedUnsupportedCount },
    })
  }

  return { ...raw, violations }
}

export async function auditBrandSpec(
  page: CdpPage,
  options: { checkPageMargins?: boolean; checkCards?: boolean; checkTimers?: boolean } = {},
): Promise<BrandSpecAuditResult> {
  const checkPageMargins = options.checkPageMargins ?? true
  const checkCards = options.checkCards ?? true
  const checkTimers = options.checkTimers ?? true

  const raw = await page.evaluate((optsRaw: unknown) => {
    const opts = optsRaw as { checkPageMargins: boolean; checkCards: boolean; checkTimers: boolean }

    const resolveTokenColor = (cssVar: string): string => {
      const probe = document.createElement('div')
      probe.style.color = `var(${cssVar})`
      probe.style.display = 'none'
      document.body.appendChild(probe)
      const resolved = getComputedStyle(probe).color
      probe.remove()
      return resolved
    }

    const tokens = {
      white: resolveTokenColor('--white'),
      surface: resolveTokenColor('--surface'),
      ink: resolveTokenColor('--ink'),
      muted: resolveTokenColor('--muted'),
      line: resolveTokenColor('--line'),
      accent: resolveTokenColor('--accent'),
    }

    const appShell = document.querySelector('.app-shell') as HTMLElement | null
    const openDialogs = [...document.querySelectorAll('dialog[open]')]
    const activeDialog = openDialogs.length ? (openDialogs[openDialogs.length - 1] as HTMLElement) : null
    const scrollWidth = Math.max(
      document.documentElement.scrollWidth,
      appShell?.scrollWidth ?? 0,
    )
    const innerWidth = document.documentElement.clientWidth || window.innerWidth
    const dialogOverflow = activeDialog ? activeDialog.scrollWidth > activeDialog.clientWidth + 1 : false
    const appShellOverflow = appShell ? appShell.scrollWidth > appShell.clientWidth + 1 : false
    const vvScale = window.visualViewport?.scale ?? 1
    const viewportScaled = vvScale < 0.99

    const isVisible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      if (el.closest('[inert], [aria-hidden="true"]')) return false
      const detailsParent = el.closest('details:not([open])')
      if (detailsParent && !el.closest('summary')) return false
      let cur: Element | null = el
      while (cur) {
        const cs = getComputedStyle(cur)
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
          return false
        }
        if (cs.position === 'fixed') {
          const r = cur === el ? rect : cur.getBoundingClientRect()
          if (
            r.right <= 0 ||
            r.left >= window.innerWidth ||
            r.bottom <= 0 ||
            r.top >= window.innerHeight
          ) {
            return false
          }
          if (rect.right <= 0 || rect.left >= window.innerWidth) {
            return false
          }
        }
        cur = cur.parentElement
      }
      return true
    }

    const labelOf = (el: Element): string => {
      const aria = (el.getAttribute('aria-label') ?? '').trim()
      const txt = ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
      return (aria || txt || el.tagName.toLowerCase()).slice(0, 40)
    }

    // Touch targets >= 48px
    const smallTouchTargets: Array<{ label: string; width: number; height: number }> = []
    const interactiveSelectors = [
      'button',
      'a[href]',
      'select',
      'summary',
      'textarea',
      '[role="button"]',
      'input:not([type="file"]):not([type="hidden"])',
      'label.switch',
    ].join(',')

    const scopeRoot: ParentNode = activeDialog ?? document
    const checkedTargets = new Set<Element>()

    for (const el of scopeRoot.querySelectorAll(interactiveSelectors)) {
      if (!isVisible(el)) continue
      if (el.classList.contains('sr-only')) continue
      let target: Element = el
      if (
        el instanceof HTMLInputElement &&
        (el.type === 'checkbox' || el.type === 'radio')
      ) {
        const wrapLabel = el.closest('label')
        if (wrapLabel && isVisible(wrapLabel)) {
          target = wrapLabel
        }
      }
      if (checkedTargets.has(target)) continue
      checkedTargets.add(target)
      const rect = target.getBoundingClientRect()
      const isNarrowCalendarCell =
        innerWidth <= 350 && Boolean(target.closest('.week-strip, .month-grid'))
      const minWidth = isNarrowCalendarCell ? 42 : 47.5
      if (rect.width < minWidth || rect.height < 47.5) {
        smallTouchTargets.push({
          label: labelOf(target),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        })
      }
    }

    // Font sizes >= 12px for all visible non-empty text (and input/textarea/select)
    const smallFonts: Array<{ text: string; fontSize: number }> = []
    const walker = document.createTreeWalker(scopeRoot === document ? document.body : scopeRoot, NodeFilter.SHOW_TEXT)
    const checkedEls = new Set<Element>()
    let node: Node | null = walker.nextNode()
    while (node) {
      const txt = (node.textContent ?? '').trim()
      const parent = node.parentElement
      if (
        txt &&
        parent &&
        !parent.closest('svg') &&
        !checkedEls.has(parent) &&
        isVisible(parent) &&
        !parent.classList.contains('sr-only')
      ) {
        checkedEls.add(parent)
        const fs = parseFloat(getComputedStyle(parent).fontSize)
        if (Number.isFinite(fs) && fs < 11.9) {
          smallFonts.push({ text: txt.slice(0, 30), fontSize: Math.round(fs * 10) / 10 })
        }
      }
      node = walker.nextNode()
    }
    for (const field of scopeRoot.querySelectorAll(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]):not([type="color"]), textarea, select',
    )) {
      if (checkedEls.has(field) || !isVisible(field) || field.classList.contains('sr-only')) continue
      checkedEls.add(field)
      const fs = parseFloat(getComputedStyle(field).fontSize)
      if (Number.isFinite(fs) && fs < 11.9) {
        const sample = (
          (field as HTMLInputElement).value ||
          field.getAttribute('placeholder') ||
          field.getAttribute('aria-label') ||
          field.tagName
        ).slice(0, 30)
        smallFonts.push({ text: sample, fontSize: Math.round(fs * 10) / 10 })
      }
    }

    // Card & sheet border-radius === 20px (docs/ux-spec.md C3)
    const badCardRadii: Array<{ label: string; borderRadius: string }> = []
    if (opts.checkCards) {
      const cardSelectors =
        '.card, .record, .task-card, .stats-overview, .notice, .sheet, .capability, .help-contents, .timeline-card, .master-card, .lock-result, .settings-group, .recovery-step, .module-card, [data-ux-card]'
      for (const card of scopeRoot.querySelectorAll(cardSelectors)) {
        if (!isVisible(card)) continue
        const br = getComputedStyle(card).borderRadius
        if (br !== '20px') {
          badCardRadii.push({ label: labelOf(card), borderRadius: br })
        }
      }
      if (activeDialog && activeDialog.matches(cardSelectors) && isVisible(activeDialog)) {
        const br = getComputedStyle(activeDialog).borderRadius
        if (br !== '20px') {
          badCardRadii.push({ label: labelOf(activeDialog), borderRadius: br })
        }
      }
    }

    // Page inline margins === 24px (16px on ultra-narrow viewports <= 340px per docs/ux-spec.md C3)
    const expectedMargin = innerWidth <= 340 ? 16 : 24
    const badPageMargins: Array<{ label: string; paddingLeft: string; paddingRight: string }> = []
    if (opts.checkPageMargins && !openDialogs.length) {
      for (const pageEl of document.querySelectorAll('.page, .focus-page, .rest-page')) {
        if (!isVisible(pageEl)) continue
        const cs = getComputedStyle(pageEl)
        if (
          Math.abs(parseFloat(cs.paddingLeft) - expectedMargin) > 0.5 ||
          Math.abs(parseFloat(cs.paddingRight) - expectedMargin) > 0.5
        ) {
          badPageMargins.push({
            label: pageEl.className,
            paddingLeft: cs.paddingLeft,
            paddingRight: cs.paddingRight,
          })
        }
      }
    }

    // Timer Nunito typography
    const badTimers: Array<{ label: string; fontFamily: string; fontVariantNumeric: string }> = []
    if (opts.checkTimers) {
      for (const t of scopeRoot.querySelectorAll('.focus-clock, .rest-clock, [role="timer"], .number')) {
        if (!isVisible(t)) continue
        const cs = getComputedStyle(t)
        const hasNunito = cs.fontFamily.toLowerCase().includes('nunito')
        const hasTabular = cs.fontVariantNumeric.includes('tabular-nums')
        if (!hasNunito || !hasTabular) {
          badTimers.push({
            label: labelOf(t),
            fontFamily: cs.fontFamily,
            fontVariantNumeric: cs.fontVariantNumeric,
          })
        }
      }
    }

    return {
      tokens,
      scrollWidth,
      innerWidth,
      dialogOverflow,
      appShellOverflow,
      viewportScaled,
      dialogScrollWidth: activeDialog?.scrollWidth ?? 0,
      dialogClientWidth: activeDialog?.clientWidth ?? 0,
      vvScale,
      smallTouchTargets,
      smallFonts,
      badCardRadii,
      badPageMargins,
      badTimers,
    }
  }, { checkPageMargins, checkCards, checkTimers })

  const violations: UxViolation[] = []
  if (raw.tokens.white !== 'rgb(255, 255, 255)') {
    violations.push({ code: 'TOKEN_WHITE', message: `--white expected rgb(255, 255, 255), got ${raw.tokens.white}` })
  }
  if (raw.tokens.surface !== 'rgb(245, 245, 245)') {
    violations.push({ code: 'TOKEN_SURFACE', message: `--surface expected rgb(245, 245, 245), got ${raw.tokens.surface}` })
  }
  if (raw.tokens.ink !== 'rgb(34, 34, 34)') {
    violations.push({ code: 'TOKEN_INK', message: `--ink expected rgb(34, 34, 34), got ${raw.tokens.ink}` })
  }
  if (raw.tokens.muted !== 'rgb(115, 115, 120)') {
    violations.push({ code: 'TOKEN_MUTED', message: `--muted expected rgb(115, 115, 120) (#737378), got ${raw.tokens.muted}` })
  }
  if (raw.tokens.line !== 'rgb(234, 234, 234)') {
    violations.push({ code: 'TOKEN_LINE', message: `--line expected rgb(234, 234, 234), got ${raw.tokens.line}` })
  }
  if (raw.tokens.accent !== 'rgb(239, 78, 54)') {
    violations.push({ code: 'TOKEN_ACCENT', message: `--accent expected rgb(239, 78, 54), got ${raw.tokens.accent}` })
  }
  if (raw.scrollWidth > raw.innerWidth || raw.dialogOverflow || raw.appShellOverflow || raw.viewportScaled) {
    violations.push({
      code: 'HORIZONTAL_OVERFLOW',
      message: `Horizontal overflow: scrollWidth=${raw.scrollWidth}/${raw.innerWidth}, dialog=${raw.dialogScrollWidth}/${raw.dialogClientWidth}, vvScale=${raw.vvScale}`,
    })
  }
  if (raw.smallTouchTargets.length > 0) {
    violations.push({
      code: 'SMALL_TOUCH_TARGET',
      message: `${raw.smallTouchTargets.length} touch target(s) < 48px: ${raw.smallTouchTargets
        .slice(0, 5)
        .map((t) => `${t.label}(${t.width}x${t.height})`)
        .join(', ')}`,
      details: raw.smallTouchTargets,
    })
  }
  if (raw.smallFonts.length > 0) {
    violations.push({
      code: 'SMALL_FONT_SIZE',
      message: `${raw.smallFonts.length} text element(s) < 12px: ${raw.smallFonts
        .slice(0, 5)
        .map((f) => `"${f.text}"(${f.fontSize}px)`)
        .join(', ')}`,
      details: raw.smallFonts,
    })
  }
  if (raw.badCardRadii.length > 0) {
    violations.push({
      code: 'BAD_CARD_RADIUS',
      message: `${raw.badCardRadii.length} card(s) borderRadius !== 20px: ${raw.badCardRadii
        .slice(0, 5)
        .map((c) => `${c.label}(${c.borderRadius})`)
        .join(', ')}`,
      details: raw.badCardRadii,
    })
  }
  if (raw.badPageMargins.length > 0) {
    violations.push({
      code: 'BAD_PAGE_MARGIN',
      message: `Page horizontal margin expected 24px: ${raw.badPageMargins
        .map((m) => `${m.label}(L:${m.paddingLeft}, R:${m.paddingRight})`)
        .join(', ')}`,
      details: raw.badPageMargins,
    })
  }
  if (raw.badTimers.length > 0) {
    violations.push({
      code: 'BAD_TIMER_FONT',
      message: `Timer/number typography expected Nunito + tabular-nums: ${raw.badTimers
        .map((t) => `${t.label}(${t.fontFamily} / ${t.fontVariantNumeric})`)
        .join(', ')}`,
      details: raw.badTimers,
    })
  }

  return { ...raw, violations }
}

export async function auditInputSchemeA(page: CdpPage): Promise<InputSchemeAResult> {
  const raw = await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('dialog[open]')]
    const root: ParentNode = dialogs.length ? dialogs[dialogs.length - 1]! : document
    const isVisible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return false
      if (el.closest('[inert], [aria-hidden="true"]')) return false
      const detailsParent = el.closest('details:not([open])')
      if (detailsParent && !el.closest('summary')) return false
      let cur: Element | null = el
      while (cur) {
        const cs = getComputedStyle(cur)
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
          return false
        }
        cur = cur.parentElement
      }
      return true
    }

    const controls = [
      ...root.querySelectorAll(
        'input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="file"]):not([type="hidden"]), textarea, select',
      ),
    ].filter((el) => isVisible(el) && !el.matches(':disabled')) as Array<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >

    const failures: Array<{ label: string; reason: string }> = []
    for (const el of controls) {
      const label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName).slice(0, 30)
      el.blur()
      const beforeCs = getComputedStyle(el)
      const beforeRect = el.getBoundingClientRect()
      if (beforeCs.backgroundColor !== 'rgb(245, 245, 245)') {
        failures.push({ label, reason: `default bg ${beforeCs.backgroundColor} !== rgb(245, 245, 245)` })
      }
      const bw = parseFloat(beforeCs.borderTopWidth)
      if (beforeCs.borderTopColor !== 'rgb(236, 236, 238)' || !Number.isFinite(bw) || bw < 1 || bw > 2) {
        failures.push({
          label,
          reason: `default border ${beforeCs.borderTopWidth} ${beforeCs.borderTopColor} !== ~1.5px rgb(236, 236, 238)`,
        })
      }

      el.focus()
      const afterCs = getComputedStyle(el)
      const afterRect = el.getBoundingClientRect()
      if (afterCs.backgroundColor !== 'rgb(255, 255, 255)') {
        failures.push({ label, reason: `focused bg ${afterCs.backgroundColor} !== rgb(255, 255, 255)` })
      }
      if (afterCs.borderTopColor !== 'rgb(131, 131, 136)') {
        failures.push({ label, reason: `focused border ${afterCs.borderTopColor} !== rgb(131, 131, 136)` })
      }
      if (
        afterCs.outlineColor === 'rgb(239, 78, 54)' ||
        afterCs.boxShadow.includes('239, 78, 54')
      ) {
        failures.push({ label, reason: `focused ring uses forbidden #EF4E36` })
      }
      if (
        Math.abs(afterRect.width - beforeRect.width) >= 0.5 ||
        Math.abs(afterRect.height - beforeRect.height) >= 0.5
      ) {
        failures.push({
          label,
          reason: `focus changed box size (${beforeRect.width}x${beforeRect.height} -> ${afterRect.width}x${afterRect.height})`,
        })
      }
      el.blur()
    }

    return { testedCount: controls.length, failures }
  })

  const violations: UxViolation[] = raw.failures.map((f) => ({
    code: 'INPUT_SCHEME_A',
    message: `Input Scheme A failure on ${f.label}: ${f.reason}`,
    details: f,
  }))
  return { ...raw, violations }
}

export async function auditReducedMotion(page: CdpPage): Promise<ReducedMotionResult> {
  const raw = await page.evaluate(() => {
    const mediaMatches = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const offendingElements: Array<{ label: string; transitionDuration: string; animationDuration: string }> = []
    for (const el of document.querySelectorAll('button, a, .sheet, .toast, .rest-phase > i')) {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      const cs = getComputedStyle(el)
      const td = cs.transitionDuration
      const ad = cs.animationDuration
      if ((td && td !== '0s') || (ad && ad !== '0s')) {
        offendingElements.push({
          label: ((el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.tagName) + '').trim().slice(0, 30),
          transitionDuration: td,
          animationDuration: ad,
        })
      }
    }
    return { mediaMatches, offendingElements }
  })

  const violations: UxViolation[] = []
  if (!raw.mediaMatches) {
    violations.push({ code: 'REDUCED_MOTION_MEDIA', message: 'prefers-reduced-motion: reduce media query did not match' })
  }
  if (raw.offendingElements.length > 0) {
    violations.push({
      code: 'REDUCED_MOTION_ACTIVE_ANIMATION',
      message: `${raw.offendingElements.length} element(s) still animate under prefers-reduced-motion: reduce`,
      details: raw.offendingElements,
    })
  }
  return { ...raw, violations }
}
