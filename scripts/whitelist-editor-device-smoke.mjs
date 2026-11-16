// A03: real installed-app query + Vue Sheet inputs + persisted public CatFocus data.
import assert from 'node:assert/strict'
import { runQaUi } from './lib/qa-ui-fixture.mjs'
import { until } from './lib/android-qa.mjs'

await runQaUi({ port: 9244, output: 'artifacts/focus-control/api36/final-whitelist-editor' }, async ui => {
  const { qa } = ui
  const missing = 'missing.qa.uninstalled.reader'
  const data = (await qa.native('loadData')).data
  data.preferences.protection.globalWhitelist = [missing]
  await qa.native('saveData', { data })
  await qa.send('Page.reload')
  await until(() => qa.evaluate('!!document.querySelector(".study-entry")'), 'whitelist fixture initialized')
  await qa.evaluate('document.querySelector(".study-entry").click()')
  await until(() => qa.evaluate('!!document.querySelector(".menu-row") && !document.querySelector(".menu-row").disabled'), 'global editor available while study is off')
  assert.equal((await qa.native('loadData')).data.preferences.protection.study, false)
  const editor = 'dialog[open][aria-label="全局白名单"]'
  const open = async () => {
    await qa.evaluate('document.querySelector(".menu-row").click()')
    await until(() => qa.evaluate(`!!document.querySelector('${editor} .app-choice') && !document.querySelector('${editor} button.primary').disabled`), 'real installed apps loaded')
  }
  const row = name => qa.evaluate(`(() => {
    const row = [...document.querySelectorAll('${editor} .app-choice')].find(el => el.querySelector('small')?.textContent.split(' · ').at(-1) === ${JSON.stringify(name)});
    return row ? { text: row.textContent, checked: row.querySelector('input').checked,
      disabled: row.querySelector('input').disabled, icon: !!row.querySelector('img,svg') } : null;
  })()`)
  const select = name => qa.evaluate(`(() => {
    const row = [...document.querySelectorAll('${editor} .app-choice')].find(el => el.querySelector('small')?.textContent.split(' · ').at(-1) === ${JSON.stringify(name)});
    if (!row) throw new Error('Missing application row'); row.querySelector('input').click();
  })()`)
  await open()
  const self = await row(qa.appId)
  assert(self.checked && self.disabled && self.icon && self.text.includes('固定允许'))
  assert((await row(missing)).text.includes('未安装 · 保留选择'))
  assert.equal((await row(missing)).checked, true)
  await select(qa.appId)
  assert.equal((await row(qa.appId)).checked, true)
  ui.pass('study-off-editor-keeps-self-fixed-and-uninstalled-package-identity')
  await qa.screenshot('01-self-and-uninstalled')

  await qa.evaluate(`document.querySelector('${editor} .switch input').click()`)
  const system = await qa.evaluate(`(() => {
    const row = [...document.querySelectorAll('${editor} .app-choice')].find(el => el.textContent.includes('系统应用 · ') && !el.querySelector('input').disabled && !el.querySelector('input').checked);
    if (!row) throw new Error('Fixture requires a real selectable system application');
    return { packageName: row.querySelector('small').textContent.split(' · ').at(-1), name: row.querySelector('.app-label').firstChild.textContent.trim(), icon: !!row.querySelector('img,svg') };
  })()`)
  assert(system.name && system.icon, 'Actual application name and icon are rendered')
  await select(system.packageName)
  await ui.fill('搜索应用', system.packageName)
  assert.equal((await row(system.packageName)).checked, true)
  await ui.fill('搜索应用', system.name)
  assert.equal((await row(system.packageName)).checked, true)
  await ui.fill('搜索应用', 'qa-no-such-app-743195')
  await ui.waitText('没有匹配的应用。已选名单仍保留。')
  assert((await ui.text()).includes('已选 3 个应用')) // missing + selected system + fixed self
  await ui.fill('搜索应用', '')
  await qa.evaluate(`document.querySelector('${editor} .switch input').click()`)
  assert.equal((await row(system.packageName)).checked, true, 'Selected system app survives hiding system apps')
  assert.equal((await row(missing)).checked, true)
  await qa.screenshot('02-filter-keeps-selection')
  await ui.click('取消')
  await until(() => qa.evaluate(`!document.querySelector('${editor}')`), 'draft cancelled')
  assert.deepEqual((await qa.native('loadData')).data.preferences.protection.globalWhitelist, [missing])
  ui.pass('name-and-package-search-empty-result-and-system-filter-retain-draft-cancel-does-not-save')

  await open()
  assert.equal(await row(system.packageName), null, 'Cancelled unselected system row returns to hidden state')
  await qa.evaluate(`document.querySelector('${editor} .switch input').click()`)
  assert.equal((await row(system.packageName)).checked, false)
  await select(system.packageName)
  await ui.click('确认白名单')
  await until(() => qa.evaluate(`!document.querySelector('${editor}')`), 'confirmed persisted selection')
  assert.deepEqual(new Set((await qa.native('loadData')).data.preferences.protection.globalWhitelist), new Set([missing, system.packageName]))
  await open()
  assert.equal((await row(system.packageName)).checked, true)
  assert.equal((await row(missing)).checked, true)
  assert.equal((await row(qa.appId)).disabled, true)
  await qa.screenshot('03-confirmed-selection-reopened')
  ui.pass('confirm-persists-packages-reopen-retains-selection-and-self-is-not-saved-as-editable')
  await ui.click('取消')
  await until(() => qa.evaluate(`!document.querySelector('${editor}')`), 'final list closed')
  await ui.click('完成')
  await ui.closedSheet()
})
