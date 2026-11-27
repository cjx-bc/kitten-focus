import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import path from 'node:path'
import { startStaticServer, type StaticServer } from './helpers/staticServer'
import { CdpPage, type CatFocusStubOptions } from './helpers/cdpBrowser'
import {
  auditBrandSpec,
  auditForbiddenStrings,
  auditModals,
  auditScreenBudget,
} from './helpers/uxAudit'

describe('Offline White Noise Controls, Budgets & Persistence (#36)', () => {
  let server: StaticServer
  let page: CdpPage | undefined

  async function openPage(catFocusStub: boolean | CatFocusStubOptions = true): Promise<CdpPage> {
    await page?.close()
    page = await CdpPage.launch({ width: 390, height: 844, catFocusStub })
    await page.goto(`${server.url}/#/focus`, true)
    page.clearErrors()
    return page
  }

  beforeAll(async () => {
    server = await startStaticServer({ rootDir: path.resolve(process.cwd(), 'dist') })
  })

  afterAll(async () => {
    await page?.close()
    page = undefined
    await server?.close()
  })

  beforeEach(async () => {
    await page?.close()
    page = undefined
  })

  it('opens single-layer white noise sheet from standby & running headers, persists track and volume, and syncs native noisy pause', async () => {
    const p = await openPage()

    // Standby budget and brand check with white noise trigger in top-right header
    const standbyBudget = await auditScreenBudget(p)
    expect(standbyBudget.violations).toEqual([])
    const standbyBrand = await auditBrandSpec(p)
    expect(standbyBrand.violations).toEqual([])

    // Open white noise sheet from standby header
    await p.clickByRoleOrText({ name: '白噪音' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1, {
      label: 'white noise sheet open from standby',
    })
    expect((await auditModals(p)).violations).toEqual([])
    expect((await auditScreenBudget(p)).violations).toEqual([])
    expect((await auditBrandSpec(p)).violations).toEqual([])
    expect((await auditForbiddenStrings(p, { isPrimaryScreen: false })).violations).toEqual([])

    const sheetText = await p.evaluate(() => document.querySelector('dialog[open]')?.textContent ?? '')
    for (const label of ['关闭', '雨声', '鸟鸣', '溪流', '篝火', '海浪', '60%']) {
      expect(sheetText).toContain(label)
    }
    expect(sheetText).not.toContain('结束提示音')

    // Select 雨声 and adjust volume slider to 80%
    await p.clickByRoleOrText({ text: '雨声', withinOpenDialog: true })
    await p.evaluate(() => {
      const slider = document.querySelector('dialog[open] input[type="range"]') as HTMLInputElement | null
      if (!slider) throw new Error('missing volume slider')
      slider.value = '80'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await p.waitFor(() => (document.querySelector('dialog[open]')?.textContent ?? '').includes('80%'), {
      label: 'volume percent updated to 80%',
    })

    // Close sheet and reload same browser context -> preference persists across restarts
    await p.pressKey('Escape')
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 0)
    await p.goto(`${server.url}/#/focus`, true)

    const persisted = await p.evaluate(() => {
      const stub = (window as unknown as {
        __catFocusStub: { getState: () => { data: { preferences: { whiteNoise?: string; whiteNoiseVolume?: number } } } }
      }).__catFocusStub
      return stub.getState().data.preferences
    })
    expect(persisted.whiteNoise).toBe('rain')
    expect(persisted.whiteNoiseVolume).toBe(0.8)

    // Start focus -> running header exposes white noise button, single-layer sheet switches track to 海浪
    await p.clickByRoleOrText({ text: '开始专注' })
    await p.waitFor(() => (document.body.innerText ?? '').includes('专注进行中'))
    expect((await auditScreenBudget(p)).violations).toEqual([])
    expect((await auditBrandSpec(p)).violations).toEqual([])

    await p.clickByRoleOrText({ name: '白噪音' })
    await p.waitFor(() => document.querySelectorAll('dialog[open]').length === 1, {
      label: 'white noise sheet open during running focus',
    })
    expect((await auditModals(p)).violations).toEqual([])
    await p.clickByRoleOrText({ text: '海浪', withinOpenDialog: true })
    await p.waitFor(
      () =>
        document
          .querySelector('dialog[open] button[aria-checked="true"]')
          ?.textContent?.trim() === '海浪',
      { label: 'waves selected while running' },
    )

    // Simulate native ACTION_AUDIO_BECOMING_NOISY -> whiteNoisePaused event syncs UI back to 关闭
    await p.evaluate(() => {
      ;(
        window as unknown as {
          __catFocusStub: { dispatchCatFocusEvent: (name: string, payload: unknown) => void }
        }
      ).__catFocusStub.dispatchCatFocusEvent('whiteNoisePaused', {
        reason: 'becoming_noisy',
        track: 'waves',
      })
    })
    await p.waitFor(
      () =>
        document
          .querySelector('dialog[open] button[aria-checked="true"]')
          ?.textContent?.trim() === '关闭',
      { label: 'white noise synced to off after becoming noisy' },
    )

    p.assertNoErrors('white noise standby, running, persistence, and becoming noisy sync')
  })
})
