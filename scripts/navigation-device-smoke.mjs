// Real QA WebView bridge plus external Android input: accessibility is not suppressed by instrumentation.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyData, defaultProtection } from '../src/domain/model.ts'
import { connectQa, delay, until } from './lib/android-qa.mjs'

const output = 'artifacts/focus-control/api36/t14-device'
const qa = await connectQa({ port: 9254, output })
const { native, evaluate, command } = qa
const evidence = resolve(output)
mkdirSync(evidence, { recursive: true })
const baseline = {
  services: command('shell','settings','get','secure','enabled_accessibility_services').trim(),
  enabled: command('shell','settings','get','secure','accessibility_enabled').trim(),
  overlays: command('shell','cmd','overlay','list'),
  data: (await native('loadData')).data,
}
const originalNavbar = baseline.overlays.split('\n').map(s=>s.trim()).find(s=>s.startsWith('[x]') && s.includes('navbar.'))?.slice(4).trim()
assert(originalNavbar, 'Record the original navbar before changing navigation mode')
const service = qa.appId + '/com.xiaomao.focus.FocusAccessibilityService'
const others = baseline.services === 'null' ? [] : baseline.services.split(':').filter(s=>s && s !== service)
const secure = (key,value) => command('shell','settings',value === 'null' || !value ? 'delete' : 'put','secure',key,...(value === 'null' || !value ? [] : [value]))
const observe = () => native('observeControl')
const foreground = () => command('shell','dumpsys','activity','activities').split('\n').find(s=>s.includes('topResumedActivity=')) || ''
const screenshot = name => writeFileSync(resolve(evidence,name+'.png'),execFileSync(process.env.ADB,['-s',qa.serial,'exec-out','screencap','-p'],{windowsHide:true}))
const results = []
const own = () => command('shell','am','start','-n',qa.appId+'/com.xiaomao.focus.MainActivity')
async function start(mode='countdown') {
  const now = Date.now()
  await native('startFocus',{session:{id:'t14-device-'+now,itemId:null,themeId:null,title:'T14 导航限制验证',themeName:'设备验证',color:'#222222',mode,targetMs:120000,startedAt:now,timeZone:'UTC',state:'running',elapsedMs:0,pausedMs:0,segments:[]}})
  await evaluate("location.hash='#/focus'")
  await qa.send('Page.reload')
  await until(()=>evaluate("document.body.innerText.includes('导航限制验证')"),'native timer UI')
  assert.equal((await observe()).navigation.state,'armed')
}
async function returns(label,args) {
  const before = (await observe()).navigation.lastReturnedAt || 0
  command('shell','input',...args)
  const state = await until(async()=>{
    const navigation = (await observe()).navigation
    return navigation.active && navigation.lastReturnedAt > before && foreground().includes('MainActivity') ? navigation : null
  },label+' actual return',7000)
  screenshot(label)
  results.push({scenario:label,passed:true,navigation:state,foreground:foreground()})
  console.log(label,JSON.stringify(state))
  await delay(600)
}
try {
  assert.equal((await observe()).owner,null,'Finish prior QA session first')
  const data = emptyData()
  data.preferences.sound=false; data.preferences.vibration=false
  data.preferences.protection={...defaultProtection(),enhancements:['navigationHomeRecents']}
  await native('replaceData',{data})
  secure('enabled_accessibility_services',others.join(':'))
  secure('enabled_accessibility_services',[...others,service].join(':'))
  secure('accessibility_enabled','1')
  await until(async()=>(await native('protectionStatus')).connected,'actual accessibility service')
  command('shell','cmd','overlay','enable-exclusive','--category','com.android.internal.systemui.navbar.threebutton')
  await delay(1000)
  await start()
  await returns('01-button-home',['keyevent','KEYCODE_HOME'])
  await native('focusAction',{action:'pause'})
  await returns('02-button-recents-paused',['keyevent','KEYCODE_APP_SWITCH'])
  command('shell','am','start','-a','android.intent.action.DIAL','-d','tel:')
  await until(()=>!foreground().includes(qa.appId),'actual dialer allowed')
  screenshot('03-dialer-allowed')
  results.push({scenario:'dialer-remains-reachable',passed:true,foreground:foreground()})
  await native('openProtectionSettings')
  await until(()=>foreground().includes('com.android.settings'),'authorization window allowed')
  screenshot('04-authorization-allowed')
  results.push({scenario:'necessary-authorization-remains-reachable',passed:true,foreground:foreground()})
  own(); await native('focusAction',{action:'resume'})
  command('shell','cmd','overlay','enable-exclusive','--category','com.android.internal.systemui.navbar.gestural')
  await delay(1600)
  const dimensions = command('shell','wm','size').match(/([0-9]+)x([0-9]+)/)
  const x=String(Math.floor(+dimensions[1]/2)), y=String(+dimensions[2]-2), homeY=String(Math.floor(+dimensions[2]/3)), recentY=String(Math.floor(+dimensions[2]/2))
  await returns('05-gesture-home',['swipe',x,y,x,homeY,'220'])
  await returns('06-gesture-overview',['swipe',x,y,x,recentY,'1000'])
  const recovery = await native('previewRecovery')
  assert(recovery.steps.some(s=>s.capability==='navigationRestriction'))
  await native('confirmRecovery',{revision:recovery.revision})
  assert.equal((await observe()).navigation.state,'recovered')
  command('shell','input','keyevent','KEYCODE_HOME'); await delay(1500)
  assert(!foreground().includes(qa.appId),'Home remains open after recovery')
  screenshot('07-home-after-recovery')
  assert.equal((await observe()).focus.session.state,'running')
  results.push({scenario:'recovery-preserves-timer-and-releases-home',passed:true,foreground:foreground()})
  own(); await native('focusAction',{action:'finish'})
  await start('stopwatch')
  await returns('08-new-round-home',['keyevent','KEYCODE_HOME'])
  await native('focusAction',{action:'finish'})
  assert.equal((await observe()).owner,'rest')
  command('shell','input','keyevent','KEYCODE_HOME'); await delay(1500)
  assert(!foreground().includes(qa.appId),'Home remains open during rest')
  assert.equal((await native('previewRecovery')).pending,false)
  screenshot('09-rest-released-home')
  results.push({scenario:'normal-end-rest-releases-navigation-duty',passed:true,foreground:foreground()})
  qa.save('results.json',{serial:qa.serial,appId:qa.appId,api:command('shell','getprop','ro.build.version.sdk').trim(),identity:'ordinary-accessibility',results})
  console.log(JSON.stringify({serial:qa.serial,results}))
} catch(error) {
  qa.save('failure.json',{message:error.message,results,navigation:(await observe()).navigation,foreground:foreground()})
  screenshot('failure')
  throw error
} finally {
  own()
  await native('focusAction',{action:'finish'}).catch(()=>{})
  await native('restAction',{action:'exit'}).catch(()=>{})
  const recovery = await native('previewRecovery').catch(()=>null)
  if(recovery?.pending) await native('confirmRecovery',{revision:recovery.revision}).catch(()=>{})
  if(baseline.data) await native('replaceData',{data:baseline.data}).catch(()=>{})
  command('shell','cmd','overlay','enable-exclusive','--category',originalNavbar)
  secure('enabled_accessibility_services',baseline.services); secure('accessibility_enabled',baseline.enabled)
  qa.save('restored-baseline.json',{services:command('shell','settings','get','secure','enabled_accessibility_services').trim(),enabled:command('shell','settings','get','secure','accessibility_enabled').trim(),navbar:command('shell','cmd','overlay','list').split('\n').map(s=>s.trim()).filter(s=>s.startsWith('[x]')&&s.includes('navbar.'))})
  qa.close()
}
