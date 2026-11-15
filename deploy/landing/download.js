const main = document.getElementById('download-main')
const secondary = document.getElementById('download-secondary')
const backup = document.getElementById('backup-download')
const status = document.getElementById('download-status')
const progress = document.getElementById('download-progress')
const cancel = document.getElementById('cancel-download')
let release = null,
  controller = null

function approvedUrl(address, version) {
  const github = `https://github.com/cjx-bc/kitten-focus/releases/download/v${version}/xiaomao-focus-${version}-debug.apk`
  if (address === github || address === 'https://gh-proxy.com/' + github) return true
  return /^https:\/\/(?:download-focus\.linma\.asia|47\.251\.9\.162)\/releases\/[a-zA-Z0-9._-]+\.apk$/.test(
    address,
  )
}

async function loadRelease() {
  const response = await fetch('/updates/stable.json', {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('版本信息暂时无法读取')
  const data = await response.json(),
    next = data.release
  if (
    !next ||
    next.applicationId !== 'com.xiaomao.focus' ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(next.versionName) ||
    !approvedUrl(next.url, next.versionName) ||
    !/^[0-9a-f]{64}$/.test(next.sha256) ||
    next.size <= 0 ||
    next.size > 268435456
  )
    throw new Error('版本信息不完整')
  next.downloadUrls = next.downloadUrls || [
    next.url,
    next.url.replace('https://download-focus.linma.asia', 'https://47.251.9.162'),
  ]
  if (
    !Array.isArray(next.downloadUrls) ||
    !next.downloadUrls.length ||
    next.downloadUrls.length > 4 ||
    next.downloadUrls.some((url) => !approvedUrl(url, next.versionName))
  )
    throw new Error('下载线路无效')
  release = next
  main.href = next.downloadUrls[0]
  secondary.href = next.downloadUrls[0]
  backup.href =
    next.downloadUrls.find((url) => url.startsWith('https://download-focus.linma.asia/')) ||
    next.downloadUrls[next.downloadUrls.length - 1]
  const githubLink = document.getElementById('github-download')
  if (githubLink) githubLink.href = next.url
  document
    .querySelectorAll('[data-version]')
    .forEach((e) => (e.textContent = `v${next.versionName}`))
  document
    .querySelectorAll('[data-size]')
    .forEach((e) => (e.textContent = `${(next.size / 1048576).toFixed(1)} MB`))
  document.getElementById('release-notes').textContent = next.notes
  return next
}

async function transfer(url, expected) {
  const timeout = setTimeout(() => controller?.abort('timeout'), 20000)
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) throw new TypeError('下载线路暂时无法连接')
    const reader = response.body.getReader(),
      chunks = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.length
      if (received > expected.size) throw new Error('安装包大小不一致，请稍后重试')
      chunks.push(value)
      progress.value = Math.round((received / expected.size) * 100)
      status.textContent = `正在下载 ${progress.value}%`
    }
    if (received !== expected.size) throw new Error('安装包大小不一致，请稍后重试')
    const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' })
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (hash !== expected.sha256) throw new Error('安装包校验失败，请稍后重试')
    return blob
  } finally {
    clearTimeout(timeout)
  }
}

async function download(event) {
  if (!window.crypto?.subtle || !window.AbortSignal?.timeout) return
  event.preventDefault()
  if (controller) return
  main.setAttribute('aria-disabled', 'true')
  controller = new AbortController()
  cancel.hidden = false
  progress.hidden = false
  status.textContent = '正在准备下载…'
  try {
    const current = release || (await loadRelease())
    let blob, lastError
    for (let route = 0; route < current.downloadUrls.length; route++) {
      if (route) {
        controller = new AbortController()
        status.textContent = '正在尝试备用下载线路…'
      }
      try {
        blob = await transfer(current.downloadUrls[route], current)
        break
      } catch (error) {
        lastError = error
        const reason = controller.signal.reason
        if (reason === 'cancelled' || !(error instanceof TypeError || reason === 'timeout'))
          throw error
      }
    }
    if (!blob) throw lastError || new Error('下载线路暂时无法使用')
    const objectUrl = URL.createObjectURL(blob),
      anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = current.url.split('/').pop()
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    status.textContent = '安装包已校验，请在浏览器下载列表中打开安装。'
  } catch (error) {
    status.textContent =
      controller?.signal.reason === 'cancelled'
        ? '已取消下载。'
        : '下载未完成。请重试，或使用下方的“备用下载”。'
  } finally {
    controller = null
    main.removeAttribute('aria-disabled')
    cancel.hidden = true
    progress.hidden = true
  }
}
main.addEventListener('click', download)
secondary.addEventListener('click', download)
cancel.addEventListener('click', () => controller?.abort('cancelled'))
loadRelease().catch(() => {
  status.textContent = '版本信息暂时无法读取，仍可直接下载安装包。'
})
