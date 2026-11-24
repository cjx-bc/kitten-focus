const ENGINEERING_IDENTIFIERS = [
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
  'AccessibilityService',
  'NotificationListener',
  'SQLite',
  'Capacitor',
]

const TELEMETRY_PATTERNS = [
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
  '另有 .* 条原通知当前仍在正常显示',
  '独立效果核验',
  '恢复责任',
  '本轮请求',
  '当前执行',
  '启动器缓存',
  '未核实本机设备管理身份',
  '监听未连接',
  '重连通知监听',
  '滚动租期',
  '释放失败',
  '本轮记账',
  '原壁纸状态',
  '待准备原壁纸状态',
  '本轮快照',
  '原生检查拦截',
  '普通管理员',
  '设备所有者',
  '资料所有者',
  '升级恢复副本',
]

const TASKS_HEADER_STATE_PILLS = ['已撤销', '状态异常', '已失效', '待连接', '待生效', '检查中', '不支持']

const GLOSSARY_AVOID_TERMS = [
  '大主题模块',
  '子日程',
  '番茄数',
  '番茄钟',
  '待办完成',
  '本次专注已完成',
  '后台诊断',
  '临时待办',
  '设备所有者模式',
  '设备所有者权限',
  '锁定系统密码',
  '应用限制模式',
  '系统冻结',
  '自然年度周数',
  '正计时手动结束',
  '小猫代发原应用消息',
  '清空拦截日志',
  '允许名单',
  '经验值',
  '金币',
  '小猫物品',
  '成长形态',
]

const EXPECTED_PALETTE = {
  white: 'rgb(255, 255, 255)',
  surface: 'rgb(245, 245, 245)',
  ink: 'rgb(34, 34, 34)',
  muted: 'rgb(115, 115, 120)',
  line: 'rgb(234, 234, 234)',
  accent: 'rgb(239, 78, 54)',
}

export async function runScreenUxAudit(
  cdp,
  {
    label = 'screen',
    isPrimaryStudentScreen = true,
    strictCss = true,
    checkInputSchemeA = false,
    checkScreenBudget = true,
  } = {},
) {
  const errorCountBefore = cdp.getErrors().length
  const config = JSON.stringify({
    isPrimaryStudentScreen,
    checkInputSchemeA,
    engineeringIdentifiers: ENGINEERING_IDENTIFIERS,
    telemetryPatterns: TELEMETRY_PATTERNS,
    tasksHeaderStatePills: TASKS_HEADER_STATE_PILLS,
    glossaryAvoidTerms: GLOSSARY_AVOID_TERMS,
    expectedPalette: EXPECTED_PALETTE,
  })

  const raw = await cdp.evaluate(`(async () => {
    const cfg = ${config};
    const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
    const route = (location.hash || '#/').replace(/^#/, '');
    const openDialogs = [...document.querySelectorAll('dialog[open]')];
    const activeDialog = openDialogs.at(-1) || null;
    const scope = activeDialog || document.querySelector('main') || document.body;

    const isVisible = (el) => {
      if (!el || el.classList?.contains('sr-only')) return false;
      if (el.closest('[inert]') || el.closest('[aria-hidden="true"]')) return false;
      const details = el.closest('details:not([open])');
      if (details && !el.closest('summary')) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0.5 && rect.height > 0.5;
    };

    // 1. Nested modal check
    const nestedModals = {
      openDialogCount: openDialogs.length,
      dialogs: openDialogs.map((d) => d.getAttribute('aria-label') || norm(d.querySelector('h2')?.innerText) || 'dialog'),
      passed: openDialogs.length <= 1,
    };

    // 2. Primary CTA & first-glance decision controls budget
    const interactiveInScope = [...scope.querySelectorAll('button, a[href], summary, input, select, [role="button"], [role="switch"]')].filter(
      (el) => isVisible(el) && !el.closest('.tabbar'),
    );

    const primaryCtaElements = interactiveInScope.filter((el) => {
      if (el.matches('input, select, summary, .chip, .color-swatch, .study-entry, .study-entry *, .study-chip, .study-chip *, [role="switch"], [aria-pressed]')) return false;
      if (el.closest('.segmented, .mini-distribution, .mini-switch, .study-entry, .study-capsule, .study-chip, .chip-row, .calendar-tabs, .week-strip')) return false;
      const labelText = norm(el.innerText);
      if (labelText.startsWith('学霸模式')) return false;
      const style = getComputedStyle(el);
      const isPrimaryClass = el.classList.contains('primary') || el.getAttribute('data-ux-role') === 'primary-cta' || el.getAttribute('data-primary-cta') === 'true';
      const isDarkSolidPill =
        style.backgroundColor === cfg.expectedPalette.ink &&
        style.color === cfg.expectedPalette.white &&
        parseFloat(style.borderTopLeftRadius) >= 24 &&
        labelText.length > 0;
      return isPrimaryClass || isDarkSolidPill;
    });

    const countedDecisions = new Set();
    const markCounted = (el) => {
      countedDecisions.add(el);
      for (const child of el.querySelectorAll('*')) countedDecisions.add(child);
    };

    const visibleSegmentedGroups = [...scope.querySelectorAll('.segmented, [role="tablist"], [data-decision-group]')].filter((el) => {
      if (!isVisible(el) || countedDecisions.has(el)) return false;
      markCounted(el);
      return true;
    });

    const visibleStudyCapsules = [...scope.querySelectorAll('.study-entry, .study-capsule')].filter((el) => {
      if (!isVisible(el) || countedDecisions.has(el)) return false;
      markCounted(el);
      return true;
    });

    const visibleSwitches = [...scope.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="switch"], select')].filter((el) => {
      if (!isVisible(el) || countedDecisions.has(el)) return false;
      if (el.closest('.item-list, .month-grid, .timetable-grid')) return false;
      markCounted(el);
      return true;
    });

    const topBarDecisionControls = [...scope.querySelectorAll('.page-header .actions button, .page-header > button, .focus-controls button, .rest-actions button, .add-theme, .free-focus')].filter(
      (el) => {
        if (!isVisible(el) || countedDecisions.has(el)) return false;
        const lbl = norm(el.getAttribute('aria-label') || el.innerText);
        if (lbl === '关闭' || lbl.startsWith('返回待办')) return false;
        markCounted(el);
        return true;
      },
    );

    const allTopBarDecisions = [...visibleStudyCapsules, ...topBarDecisionControls];
    const firstGlanceDecisionCount = visibleSwitches.length + visibleSegmentedGroups.length + allTopBarDecisions.length;
    const screenBudget = {
      scopeTag: activeDialog ? 'dialog' : 'main',
      primaryCtaCount: primaryCtaElements.length,
      primaryCtas: primaryCtaElements.map((el) => norm(el.getAttribute('aria-label') || el.innerText)),
      switchesCount: visibleSwitches.length,
      segmentedGroupCount: visibleSegmentedGroups.length,
      topBarDecisionCount: allTopBarDecisions.length,
      topBarDecisions: allTopBarDecisions.map((el) => norm(el.getAttribute('aria-label') || el.innerText)),
      decisionControlsCount: firstGlanceDecisionCount,
      passedPrimaryCta: primaryCtaElements.length <= 1,
      passedDecisionBudget: visibleSwitches.length <= 4 && firstGlanceDecisionCount <= 4,
    };

    // 3. Copy & glossary hygiene
    const scopeText = norm(scope.innerText || '');
    const bodyText = norm(document.body.innerText || '');
    const headerEl = scope.querySelector('.page-header');
    const headerText = headerEl ? norm(headerEl.innerText) : '';

    const matchedEngineeringIds = cfg.isPrimaryStudentScreen
      ? cfg.engineeringIdentifiers.filter((id) => scopeText.includes(id))
      : [];

    const matchedTelemetry = cfg.isPrimaryStudentScreen
      ? cfg.telemetryPatterns.filter((pattern) => new RegExp(pattern).test(scopeText))
      : [];

    const unsupportedMatches = (scopeText.match(/本机不支持|仅 Android 可用/g) || []).length;
    const repeatedUnsupported = cfg.isPrimaryStudentScreen && unsupportedMatches > 1 ? unsupportedMatches : 0;

    const matchedTasksHeaderPills =
      cfg.isPrimaryStudentScreen && route.startsWith('/tasks') && !activeDialog
        ? cfg.tasksHeaderStatePills.filter((pill) => headerText.includes(pill))
        : [];

    const matchedGlossaryAvoid = cfg.glossaryAvoidTerms.filter((term) => bodyText.includes(term));

    const copyHygiene = {
      matchedEngineeringIds,
      matchedTelemetry,
      repeatedUnsupported,
      matchedTasksHeaderPills,
      matchedGlossaryAvoid,
      passed:
        matchedEngineeringIds.length === 0 &&
        matchedTelemetry.length === 0 &&
        repeatedUnsupported === 0 &&
        matchedTasksHeaderPills.length === 0 &&
        matchedGlossaryAvoid.length === 0,
    };

    // 4. brand-spec.md computed CSS audit
    const appShell = document.querySelector('.app-shell');
    const vv = window.visualViewport;
    const vvScale = vv && Number.isFinite(vv.scale) ? vv.scale : 1;
    const vvCssWidth = vv && Number.isFinite(vv.width) && Number.isFinite(vv.scale) ? vv.width * vv.scale : Infinity;
    const scrollWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0,
      appShell?.scrollWidth || 0,
    );
    const innerWidth = Math.min(
      window.innerWidth || Infinity,
      document.documentElement.clientWidth || Infinity,
      vvCssWidth || Infinity,
    );
    const appShellOverflow = Boolean(appShell && appShell.scrollWidth > appShell.clientWidth + 0.5);
    const dialogOverflow = Boolean(activeDialog && activeDialog.scrollWidth > activeDialog.clientWidth + 0.5);
    const viewportScaledDown = vvScale < 0.99;
    const overflowPassed = !viewportScaledDown && !appShellOverflow && !dialogOverflow && scrollWidth <= innerWidth + 0.5;

    const probeColor = (cssVarName) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(' + cssVarName + ')';
      probe.style.position = 'fixed';
      probe.style.visibility = 'hidden';
      document.body.appendChild(probe);
      const val = getComputedStyle(probe).color;
      probe.remove();
      return val;
    };

    const observedPalette = {
      white: appShell ? getComputedStyle(appShell).backgroundColor : probeColor('--white'),
      surface: probeColor('--surface'),
      ink: probeColor('--ink'),
      muted: probeColor('--muted'),
      line: probeColor('--line'),
      accent: probeColor('--accent'),
    };
    const paletteViolations = [];
    for (const [token, expected] of Object.entries(cfg.expectedPalette)) {
      if (observedPalette[token] !== expected) {
        paletteViolations.push({ token, expected, actual: observedPalette[token] });
      }
    }

    const expectedMargin = innerWidth <= 340 ? 16 : 24;
    const pageEl = document.querySelector('.page, .focus-page, .rest-page');
    let pageMargins = { present: Boolean(pageEl), left: null, right: null, expected: expectedMargin, passed: true };
    if (pageEl) {
      const ps = getComputedStyle(pageEl);
      const left = parseFloat(ps.paddingLeft);
      const right = parseFloat(ps.paddingRight);
      pageMargins = {
        present: true,
        left,
        right,
        expected: expectedMargin,
        passed: Math.abs(left - expectedMargin) <= 0.5 && Math.abs(right - expectedMargin) <= 0.5,
      };
    }

    const cardRadiusViolations = [];
    const cardSelector = '.card, .record, .task-card, .stats-overview, .notice, .sheet, .capability, .help-contents, .timeline-card, .master-card, .lock-result, .settings-group, .recovery-step, .module-card';
    const cardCandidates = [
      ...(scope.matches?.(cardSelector) ? [scope] : []),
      ...scope.querySelectorAll(cardSelector),
    ].filter(isVisible);
    for (const card of cardCandidates) {
      const cs = getComputedStyle(card);
      const radii = [
        parseFloat(cs.borderTopLeftRadius),
        parseFloat(cs.borderTopRightRadius),
        parseFloat(cs.borderBottomLeftRadius),
        parseFloat(cs.borderBottomRightRadius),
      ];
      if (radii.some((r) => Math.abs(r - 20) > 0.5)) {
        cardRadiusViolations.push({
          className: card.className,
          borderRadius: cs.borderRadius,
        });
      }
    }

    const touchTargetViolations = [];
    const targetCandidates = [...document.querySelectorAll('button, a[href], summary, select, input:not([type="hidden"]), [role="button"], [role="switch"]')].filter((el) => {
      if (activeDialog && !activeDialog.contains(el)) return false;
      if (el.disabled) return false;
      return isVisible(el);
    });
    for (const el of targetCandidates) {
      let measureEl = el;
      if ((el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio'))) {
        const lbl = el.closest('label');
        if (lbl && isVisible(lbl)) measureEl = lbl;
      }
      const rect = measureEl.getBoundingClientRect();
      const isNarrowCalendarCell = innerWidth <= 350 && Boolean(measureEl.closest('.week-strip, .month-grid'));
      const minWidth = isNarrowCalendarCell ? 42 : 47.5;
      if (rect.width < minWidth || rect.height < 47.5) {
        touchTargetViolations.push({
          tag: measureEl.tagName,
          label: norm(measureEl.getAttribute('aria-label') || measureEl.innerText).slice(0, 40),
          className: measureEl.className || '',
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        });
      }
    }

    const fontSizeViolations = [];
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const checkedFontEls = new Set();
    let textNode;
    while ((textNode = walker.nextNode())) {
      if (!norm(textNode.textContent)) continue;
      const el = textNode.parentElement;
      if (!el || checkedFontEls.has(el) || !isVisible(el)) continue;
      checkedFontEls.add(el);
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 11.9) {
        fontSizeViolations.push({
          tag: el.tagName,
          text: norm(el.innerText).slice(0, 30),
          fontSize: fs,
        });
      }
    }

    const timerEls = [...scope.querySelectorAll('[role="timer"], .focus-clock, .rest-clock, .number')].filter(isVisible);
    const timerTypographyViolations = [];
    for (const el of timerEls) {
      const ts = getComputedStyle(el);
      const hasNunito = /nunito/i.test(ts.fontFamily);
      const hasTabular = /tabular-nums/i.test(ts.fontVariantNumeric);
      if (!hasNunito || !hasTabular) {
        timerTypographyViolations.push({
          className: el.className,
          fontFamily: ts.fontFamily,
          fontVariantNumeric: ts.fontVariantNumeric,
        });
      }
    }

    let inputSchemeA = { checked: false, violations: [] };
    if (cfg.checkInputSchemeA) {
      const inputs = [...scope.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="hidden"]), textarea, select')].filter(
        (el) => isVisible(el) && !el.disabled,
      );
      if (inputs.length > 0) {
        inputSchemeA.checked = true;
        const target = inputs[0];
        const beforeRect = target.getBoundingClientRect();
        const beforeStyle = getComputedStyle(target);
        if (beforeStyle.backgroundColor !== 'rgb(245, 245, 245)') {
          inputSchemeA.violations.push('Default input background expected rgb(245, 245, 245), got ' + beforeStyle.backgroundColor);
        }
        const bw = parseFloat(beforeStyle.borderTopWidth);
        if (Number.isNaN(bw) || Math.abs(bw - 1.5) > 0.5) {
          inputSchemeA.violations.push('Default input borderWidth expected ~1.5px, got ' + beforeStyle.borderTopWidth);
        }
        if (beforeStyle.borderTopColor !== 'rgb(236, 236, 238)') {
          inputSchemeA.violations.push('Default input borderColor expected rgb(236, 236, 238), got ' + beforeStyle.borderTopColor);
        }
        target.focus();
        await new Promise((r) => requestAnimationFrame(r));
        const afterRect = target.getBoundingClientRect();
        const afterStyle = getComputedStyle(target);
        if (afterStyle.backgroundColor !== 'rgb(255, 255, 255)') {
          inputSchemeA.violations.push('Focused input background expected rgb(255, 255, 255), got ' + afterStyle.backgroundColor);
        }
        if (afterStyle.borderTopColor !== 'rgb(131, 131, 136)') {
          inputSchemeA.violations.push('Focused input borderColor expected rgb(131, 131, 136), got ' + afterStyle.borderTopColor);
        }
        if (afterStyle.outlineColor === 'rgb(239, 78, 54)' && parseFloat(afterStyle.outlineWidth) > 0) {
          inputSchemeA.violations.push('Focused input must not show #EF4E36 outline ring');
        }
        if (Math.abs(afterRect.width - beforeRect.width) > 0.5 || Math.abs(afterRect.height - beforeRect.height) > 0.5) {
          inputSchemeA.violations.push('Focused input changed dimensions');
        }
        target.blur();
      }
    }

    const cssPassed =
      overflowPassed &&
      paletteViolations.length === 0 &&
      pageMargins.passed &&
      cardRadiusViolations.length === 0 &&
      touchTargetViolations.length === 0 &&
      fontSizeViolations.length === 0 &&
      timerTypographyViolations.length === 0 &&
      inputSchemeA.violations.length === 0;

    return {
      route,
      nestedModals,
      screenBudget,
      copyHygiene,
      css: {
        overflow: {
          scrollWidth,
          innerWidth: Math.round(innerWidth * 100) / 100,
          rawInnerWidth: window.innerWidth,
          clientWidth: document.documentElement.clientWidth,
          visualViewportScale: Math.round(vvScale * 1000) / 1000,
          appShellOverflow,
          dialogOverflow,
          passed: overflowPassed,
        },
        palette: { observed: observedPalette, violations: paletteViolations, passed: paletteViolations.length === 0 },
        pageMargins,
        cardRadius: { violations: cardRadiusViolations, passed: cardRadiusViolations.length === 0 },
        touchTargets: { count: targetCandidates.length, violations: touchTargetViolations, passed: touchTargetViolations.length === 0 },
        fontSizes: { violations: fontSizeViolations, passed: fontSizeViolations.length === 0 },
        timerTypography: { checkedCount: timerEls.length, violations: timerTypographyViolations, passed: timerTypographyViolations.length === 0 },
        inputSchemeA: { ...inputSchemeA, passed: inputSchemeA.violations.length === 0 },
        passed: cssPassed,
      },
    };
  })()`)

  const allErrors = cdp.getErrors()
  const newJsErrors = allErrors.slice(errorCountBefore)

  const budgetPassed = !checkScreenBudget || (raw.screenBudget.passedPrimaryCta && raw.screenBudget.passedDecisionBudget)
  const uxPassed = raw.nestedModals.passed && budgetPassed && raw.copyHygiene.passed
  const cssGatePassed = strictCss ? raw.css.passed : true
  const jsGatePassed = newJsErrors.length === 0

  return {
    label,
    timestamp: new Date().toISOString(),
    route: raw.route,
    strictCss,
    passed: uxPassed && cssGatePassed && jsGatePassed,
    gates: {
      nestedModals: raw.nestedModals.passed,
      primaryCtaBudget: !checkScreenBudget || raw.screenBudget.passedPrimaryCta,
      decisionBudget: !checkScreenBudget || raw.screenBudget.passedDecisionBudget,
      copyHygiene: raw.copyHygiene.passed,
      brandSpecCss: raw.css.passed,
      cssGateEnforced: strictCss,
      zeroJsErrors: jsGatePassed,
    },
    nestedModals: raw.nestedModals,
    screenBudget: raw.screenBudget,
    copyHygiene: raw.copyHygiene,
    css: raw.css,
    newJsErrors,
  }
}
