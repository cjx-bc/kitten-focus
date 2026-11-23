import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { startStaticServer, type StaticServer } from './helpers/staticServer'
import { CdpPage } from './helpers/cdpBrowser'
import {
  auditModals,
  auditScreenBudget,
  auditForbiddenStrings,
  auditBrandSpec,
  auditInputSchemeA,
  auditReducedMotion,
} from './helpers/uxAudit'

function buildCompliantFixtureHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UX Audit Self-Check Fixture</title>
  <style>
    :root {
      --white: #ffffff;
      --surface: #f5f5f5;
      --ink: #222222;
      --muted: #737378;
      --line: #eaeaea;
      --accent: #ef4e36;
      --focus: #838388;
      --field-line: #ececee;
      --radius: 20px;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--white); color: var(--ink); font-family: sans-serif; font-size: 15px; }
    .app-shell { width: 100%; background: var(--white); }
    .page { padding: 16px 24px; }
    .card { background: var(--surface); border-radius: 20px; padding: 20px; }
    .number { font-family: Nunito, sans-serif; font-variant-numeric: tabular-nums; font-size: 48px; }
    .primary, .secondary {
      min-height: 50px;
      min-width: 120px;
      border: 0;
      border-radius: 100px;
      padding: 13px 24px;
      font-size: 15px;
      transition: opacity 180ms ease;
    }
    .primary { background: var(--ink); color: var(--white); }
    .secondary { background: var(--surface); color: var(--ink); }
    .muted { color: var(--muted); font-size: 12px; }
    input[type="text"] {
      width: 100%;
      min-height: 48px;
      border: 1.5px solid var(--field-line);
      border-radius: 12px;
      background: var(--surface);
      color: var(--ink);
      padding: 12px 14px;
      font-size: 15px;
      outline: none;
    }
    input[type="text"]:focus {
      background: var(--white);
      border-color: var(--focus);
    }
    .switch { display: flex; align-items: center; justify-content: space-between; min-height: 50px; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <main class="page">
      <h1>待办</h1>
      <div class="card">
        <div class="number" role="timer">25:00</div>
        <p class="muted">今日专注时长</p>
        <label>
          待办名称
          <input type="text" placeholder="例如：背单词" />
        </label>
        <label class="switch">
          <span>声音提示</span>
          <input type="checkbox" />
        </label>
        <button type="button" class="primary">开始专注</button>
      </div>
    </main>
  </div>
</body>
</html>`
}

describe('E2E Harness & UX Audit Detectors Self-Check', () => {
  let server: StaticServer
  let page: CdpPage

  beforeAll(async () => {
    server = await startStaticServer({
      fixtures: {
        '/index.html': buildCompliantFixtureHtml(),
      },
    })
    page = await CdpPage.launch({ width: 390, height: 844 })
  })

  afterAll(async () => {
    await page?.close()
    await server?.close()
  })

  it('passes all UX, modal, string, brand-spec, Input Scheme A, and reduced-motion audits on compliant fixture HTML', async () => {
    await page.setReducedMotion(false)
    await page.goto(server.url, true)
    page.clearErrors()

    const modals = await auditModals(page)
    expect(modals.violations).toEqual([])
    expect(modals.openDialogCount).toBe(0)

    const budget = await auditScreenBudget(page)
    expect(budget.violations).toEqual([])
    expect(budget.primaryCtaCount).toBe(1)
    expect(budget.decisionCount).toBeLessThanOrEqual(4)

    const strings = await auditForbiddenStrings(page, { isPrimaryScreen: true, checkTasksHeaderBadges: true })
    expect(strings.violations).toEqual([])

    const brand = await auditBrandSpec(page)
    expect(brand.violations).toEqual([])
    expect(brand.tokens.muted).toBe('rgb(115, 115, 120)')
    expect(brand.scrollWidth).toBeLessThanOrEqual(brand.innerWidth)

    const schemeA = await auditInputSchemeA(page)
    expect(schemeA.testedCount).toBe(1)
    expect(schemeA.violations).toEqual([])

    await page.setReducedMotion(true)
    const reduced = await auditReducedMotion(page)
    expect(reduced.violations).toEqual([])

    page.assertNoErrors('compliant fixture')
  })

  it('detects nested <dialog open> modals', async () => {
    await page.goto(server.url, true)
    await page.evaluate(() => {
      const d1 = document.createElement('dialog')
      d1.setAttribute('open', '')
      d1.textContent = '外层弹窗'
      const d2 = document.createElement('dialog')
      d2.setAttribute('open', '')
      d2.textContent = '内层弹窗'
      document.body.append(d1, d2)
    })
    const modals = await auditModals(page)
    expect(modals.openDialogCount).toBe(2)
    expect(modals.violations.some((v) => v.code === 'NESTED_MODAL')).toBe(true)
  })

  it('detects > 1 primary CTA and > 4 first-glance decisions', async () => {
    await page.goto(server.url, true)
    await page.evaluate(() => {
      const card = document.querySelector('.card')!
      const secondCta = document.createElement('button')
      secondCta.className = 'primary'
      secondCta.textContent = '第二个主按钮'
      card.appendChild(secondCta)

      for (let i = 1; i <= 4; i++) {
        const label = document.createElement('label')
        label.className = 'switch'
        label.innerHTML = `<span>开关 ${i}</span><input type="checkbox" />`
        card.appendChild(label)
      }
    })
    const budget = await auditScreenBudget(page)
    expect(budget.primaryCtaCount).toBe(2)
    expect(budget.decisionCount).toBeGreaterThan(4)
    expect(budget.violations.some((v) => v.code === 'TOO_MANY_PRIMARY_CTAS')).toBe(true)
    expect(budget.violations.some((v) => v.code === 'TOO_MANY_DECISIONS')).toBe(true)
  })

  it('detects raw engineering identifiers and GLOSSARY _Avoid_ synonyms', async () => {
    await page.goto(server.url, true)
    await page.evaluate(() => {
      const p = document.createElement('p')
      p.textContent = 'needsReconcile runtime-only 今日番茄数：2'
      document.querySelector('.card')!.appendChild(p)
    })
    const strings = await auditForbiddenStrings(page, { isPrimaryScreen: true })
    const foundTerms = strings.matches.map((m) => m.term)
    expect(foundTerms).toContain('needsReconcile')
    expect(foundTerms).toContain('runtime-only')
    expect(foundTerms).toContain('番茄数')
    expect(strings.violations.length).toBeGreaterThanOrEqual(3)
  })

  it('detects < 48px touch targets, < 12px fonts, wrong --muted, wrong card radius, and horizontal overflow', async () => {
    await page.goto(server.url, true)
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muted', '#66666b')
      const card = document.querySelector('.card') as HTMLElement
      card.style.borderRadius = '16px'

      const tinyBtn = document.createElement('button')
      tinyBtn.textContent = '小按钮'
      tinyBtn.style.width = '36px'
      tinyBtn.style.height = '36px'
      tinyBtn.style.fontSize = '10px'
      card.appendChild(tinyBtn)

      const wideBox = document.createElement('div')
      wideBox.style.width = '900px'
      wideBox.style.height = '10px'
      wideBox.textContent = '溢出测试'
      card.appendChild(wideBox)
    })
    const brand = await auditBrandSpec(page)
    const codes = brand.violations.map((v) => v.code)
    expect(codes).toContain('TOKEN_MUTED')
    expect(codes).toContain('BAD_CARD_RADIUS')
    expect(codes).toContain('SMALL_TOUCH_TARGET')
    expect(codes).toContain('SMALL_FONT_SIZE')
    expect(codes).toContain('HORIZONTAL_OVERFLOW')
  })

  it('detects Input Scheme A focus violations and uncaught JS errors', async () => {
    await page.goto(server.url, true)
    page.clearErrors()
    await page.evaluate(() => {
      const style = document.createElement('style')
      style.textContent = 'input[type="text"]:focus { outline: 2px solid #ef4e36 !important; padding: 20px !important; }'
      document.head.appendChild(style)
    })
    const schemeA = await auditInputSchemeA(page)
    expect(schemeA.violations.some((v) => v.code === 'INPUT_SCHEME_A')).toBe(true)

    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('Synthetic uncaught E2E self-check exception')
      }, 10)
    })
    await new Promise((r) => setTimeout(r, 80))
    expect(page.getErrors().length).toBeGreaterThanOrEqual(1)
    expect(() => page.assertNoErrors('selfcheck')).toThrow(/Synthetic uncaught E2E self-check exception/)
    page.clearErrors()
  })

  it('returns 400 Bad Request on malformed URI (/%%ZZ) without crashing staticServer', async () => {
    const rawResponse = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: server.port }, () => {
        socket.write('GET /%ZZ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
      })
      let data = ''
      socket.on('data', (chunk) => {
        data += chunk.toString('utf8')
      })
      socket.on('end', () => resolve(data))
      socket.on('error', reject)
    })
    expect(rawResponse).toContain('400 Bad Request')

    const okRes = await fetch(server.url)
    expect(okRes.status).toBe(200)
  })

  it('validates uxAudit false-positive and false-negative fixes (2-theme TasksView, disabled input, opacity:0/offscreen/svg, 不支持 badge, StudyMode links, overflowing dialog, card classes)', async () => {
    await page.goto(server.url, true)

    // 1. Compliant 2-theme TasksView + [data-primary-cta="true"] + disabled input + hidden opacity:0 / offscreen / svg
    await page.evaluate(() => {
      document.body.innerHTML = `
        <div class="app-shell">
          <main class="page">
            <header class="page-header">
              <h1>待办</h1>
              <button type="button" class="secondary" style="min-width:48px;min-height:48px">学霸模式 · 开</button>
              <button type="button" class="secondary" style="min-width:48px;min-height:48px">自由专注</button>
              <button type="button" class="secondary" style="min-width:48px;min-height:48px">新建主题</button>
            </header>
            <section>
              <button type="button" aria-label="收起主题英语" style="min-width:48px;min-height:48px">英语</button>
              <div class="theme-actions">
                <button type="button" aria-label="在英语下添加待办" style="min-width:48px;min-height:48px">+</button>
                <button type="button" aria-label="编辑主题英语" style="min-width:48px;min-height:48px">...</button>
              </div>
            </section>
            <section>
              <button type="button" aria-label="收起主题数学" style="min-width:48px;min-height:48px">数学</button>
              <div class="theme-actions">
                <button type="button" aria-label="在数学下添加待办" style="min-width:48px;min-height:48px">+</button>
                <button type="button" aria-label="编辑主题数学" style="min-width:48px;min-height:48px">...</button>
              </div>
            </section>
            <div class="card">
              <button type="button" data-primary-cta="true" style="min-width:120px;min-height:50px">唯一主按钮</button>
              <input type="text" disabled aria-label="禁用输入" style="min-height:48px;font-size:15px" />
              <div style="opacity:0">
                <button type="button" class="primary" style="width:20px;height:20px;font-size:8px">OpacityParent</button>
              </div>
              <div style="position:fixed;left:-9999px">
                <button type="button" class="primary" style="width:20px;height:20px;font-size:8px">Offscreen</button>
              </div>
              <svg width="40" height="20"><text x="0" y="12" style="font-size:8px">99</text></svg>
            </div>
          </main>
        </div>`
    })

    const budget = await auditScreenBudget(page)
    expect(budget.violations).toEqual([])
    expect(budget.primaryCtaCount).toBe(1)
    expect(budget.decisionCount).toBe(3)

    const brand = await auditBrandSpec(page, { checkTimers: false })
    expect(brand.violations).toEqual([])

    const schemeA = await auditInputSchemeA(page)
    expect(schemeA.testedCount).toBe(0)
    expect(schemeA.violations).toEqual([])

    // 2. StudyModeSheet home allowance: 1 quiet 权限与使用帮助 link passes, extra .permissions-entry + .help-links fails
    await page.evaluate(() => {
      const dlg = document.createElement('dialog')
      dlg.setAttribute('open', '')
      dlg.className = 'sheet'
      dlg.innerHTML = `
        <div class="master-card"><label class="switch"><span>学霸模式</span><input type="checkbox" /></label></div>
        <div class="modules-list">
          <div class="module-row"><button type="button" class="module-nav">应用限制</button><label class="switch"><input type="checkbox" /></label></div>
          <div class="module-row"><button type="button" class="module-nav">严格模式</button><label class="switch"><input type="checkbox" /></label></div>
          <div class="module-row"><button type="button" class="module-nav">免打扰</button><label class="switch"><input type="checkbox" /></label></div>
        </div>
        <button type="button">权限与使用帮助</button>
        <button type="button" class="primary">完成</button>`
      document.body.appendChild(dlg)
    })
    const compliantStudy = await auditScreenBudget(page)
    expect(compliantStudy.violations).toEqual([])

    await page.evaluate(() => {
      const dlg = document.querySelector('dialog[open]')!
      const extra = document.createElement('button')
      extra.className = 'permissions-entry'
      extra.textContent = '授权与权限'
      dlg.appendChild(extra)
    })
    const bloatedStudy = await auditScreenBudget(page)
    expect(bloatedStudy.violations.some((v) => v.code === 'TOO_MANY_DECISIONS')).toBe(true)

    // 3. Catch 不支持 in TasksView header, overflowing <dialog open>, unlisted .module-card radius, standalone checkbox & small input font
    await page.evaluate(() => {
      document.querySelector('dialog[open]')?.remove()
      const header = document.querySelector('.page-header')!
      const badge = document.createElement('span')
      badge.textContent = '学霸模式 · 不支持'
      header.appendChild(badge)

      const dlg = document.createElement('dialog')
      dlg.setAttribute('open', '')
      dlg.className = 'sheet'
      dlg.style.width = '300px'
      dlg.style.overflowX = 'auto'
      dlg.style.borderRadius = '20px'
      dlg.innerHTML = `
        <div style="width:600px;height:10px">宽内容</div>
        <div class="module-card" style="border-radius:10px;padding:12px">模块卡</div>
        <input type="checkbox" style="width:20px;height:20px" />
        <input type="text" placeholder="小字输入框" style="font-size:10px;min-height:48px" />`
      document.body.appendChild(dlg)
    })

    const strAudit = await auditForbiddenStrings(page, { isPrimaryScreen: true, checkTasksHeaderBadges: true })
    expect(strAudit.matches.some((m) => m.category === 'tasks-header-state' && m.term === '不支持')).toBe(true)

    const dlgBrand = await auditBrandSpec(page, { checkTimers: false })
    const dlgCodes = dlgBrand.violations.map((v) => v.code)
    expect(dlgCodes).toContain('HORIZONTAL_OVERFLOW')
    expect(dlgCodes).toContain('BAD_CARD_RADIUS')
    expect(dlgCodes).toContain('SMALL_TOUCH_TARGET')
    expect(dlgCodes).toContain('SMALL_FONT_SIZE')
  })

  it('cleanly closes Chrome processes and deletes kitten-e2e-* temp dirs across 5 consecutive launch/goto/close cycles', async () => {
    const cycleDirs: string[] = []
    try {
      for (let i = 0; i < 5; i++) {
        const p = await CdpPage.launch({ width: 390, height: 844 })
        const dirPath = p.getUserDataDir()
        cycleDirs.push(dirPath)
        await p.goto(server.url, true)
        await p.close()
        expect(fs.existsSync(dirPath)).toBe(false)
      }

      if (process.platform === 'win32') {
        const patterns = cycleDirs.map((d) => `$_.CommandLine -like '*${path.basename(d)}*'`).join(' -or ')
        const psOut = execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { ${patterns} } | Select-Object -ExpandProperty ProcessId`,
          ],
          { encoding: 'utf8' },
        ).trim()
        expect(psOut).toBe('')
      }
    } finally {
      for (const dirPath of cycleDirs) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true })
        } catch {}
      }
    }
  })
})
