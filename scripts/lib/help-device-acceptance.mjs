import assert from 'node:assert/strict'
import { until } from './android-qa.mjs'

/** Bundled help in the actual Android WebView; only this CDP target goes offline. */
export async function verifyOfflineHelp(qa) {
  await qa.send('Network.enable')
  await qa.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  try {
    await qa.evaluate("location.hash = '#/help'")
    await until(() => qa.evaluate('document.querySelectorAll(".help-section").length === 8'), 'eight bundled help sections offline')
    const sections = await qa.evaluate('[...document.querySelectorAll(".help-section")].map(section => ({id: section.id, title: section.querySelector("h2").textContent, paragraphs: section.querySelectorAll("p").length}))')
    assert(sections.every(section => section.paragraphs > 0), 'Every help topic has actual text')
    assert.equal(await qa.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, 'Help fits the actual device width')
    // Native key events activate the existing accessible contents link.
    await qa.evaluate('document.querySelector(".help-contents a:last-child").focus()')
    await qa.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await qa.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await until(() => qa.evaluate('document.activeElement?.id === "help-recovery" && scrollY > 0'), 'keyboard contents activation focuses and scrolls to recovery')
    await qa.screenshot('help-offline-scrolled-recovery')
    await qa.evaluate("location.hash = '#/permissions'")
    await until(() => qa.evaluate('document.querySelectorAll("[data-capability]").length === 10'), 'ten actual capability diagnostics offline')
    await qa.evaluate('document.querySelectorAll("[data-capability]").forEach(row => row.open = true)')
    const diagnostics = await qa.evaluate('[...document.querySelectorAll("[data-capability]")].map(row => ({id: row.dataset.capability, text: row.innerText}))')
    assert(diagnostics.every(row => row.text.includes('下一轮偏好') && row.text.includes('本轮请求') && row.text.includes('恢复责任')))
    assert.equal(await qa.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, 'Diagnostics fit the actual device width')
    await qa.evaluate('document.querySelector("[data-capability=wallpaper]").scrollIntoView({block:"center"})')
    await qa.screenshot('help-offline-diagnostics-bottom')
    qa.save('help-offline.json', { sections, diagnostics, offline: 'Only QA WebView CDP network disabled', keyboard: 'Enter activated contents link and focused recovery', width: await qa.evaluate('innerWidth') })
    return { scenario: 'android-offline-help-eight-full-sections-ten-diagnostics-keyboard-focus-and-scroll', passed: true }
  } finally {
    await qa.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  }
}
