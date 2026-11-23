import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pickFreePort } from './device-bridge.mjs'

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function until(fn, label, timeout = 15000, interval = 180) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await fn()
      if (value) return value
    } catch (err) {
      lastError = err
    }
    await delay(interval)
  }
  throw new Error(`Timeout waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`)
}

async function fetchJsonWithTimeout(url, timeoutMs = 2500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function formatRemoteArg(arg) {
  if (!arg) return ''
  if (Object.hasOwn(arg, 'value')) return String(arg.value)
  if (arg.description) return arg.description
  if (arg.unserializableValue) return arg.unserializableValue
  return arg.type || ''
}

export async function connectWebViewCdp(
  bridge,
  {
    packageName = 'com.xiaomao.focus.qa',
    activity = 'com.xiaomao.focus.MainActivity',
    port,
    launch = true,
    user,
    timeout = 25000,
    waitForCapacitor = true,
  } = {},
) {
  bridge.verifyOnline()
  const pkgInfo = bridge.getInstalledPackageInfo(packageName)

  if (launch) {
    bridge.wakeupAndLaunch(packageName, { activity, user })
  }

  const localPort = await pickFreePort(port || 9237)
  let forwarded = false
  let discoveredPid = null
  let discoveryMethod = 'unknown'

  const cleanupForward = () => {
    if (forwarded) {
      bridge.removeForward(localPort)
      forwarded = false
    }
  }

  try {
    const socketResult = await until(
      async () => {
        const pids = bridge.findAppPids(packageName, user)
        if (!pids.length) {
          if (launch) {
            bridge.wakeupAndLaunch(packageName, { activity, user })
          }
          return null
        }

        const unixProbe = bridge.readProcNetUnix()
        const pidEntries = pids.map((pid) => {
          const socketName = `webview_devtools_remote_${pid}`
          const pidPattern = new RegExp(`(?:^|\\s)@?webview_devtools_remote_${pid}(?:\\s|$)`)
          const listedInUnix = unixProbe.readable && pidPattern.test(unixProbe.text)
          return { pid, socketName, listedInUnix }
        })
        // Prioritize PIDs matched in /proc/net/unix first, then probe remaining candidate PIDs
        // via direct adb forward so OEM SELinux partial /proc/net/unix reads never block discovery.
        pidEntries.sort((a, b) => Number(b.listedInUnix) - Number(a.listedInUnix))

        for (const { pid, socketName, listedInUnix } of pidEntries) {
          try {
            cleanupForward()
            bridge.forward(localPort, `localabstract:${socketName}`)
            forwarded = true
            const pages = await fetchJsonWithTimeout(`http://127.0.0.1:${localPort}/json`, 2500)
            if (Array.isArray(pages) && pages.length > 0) {
              discoveredPid = pid
              discoveryMethod = listedInUnix ? 'proc-net-unix' : 'direct-forward-fallback'
              return { pid, pages }
            }
            cleanupForward()
          } catch {
            cleanupForward()
          }
        }
        return null
      },
      `WebView DevTools socket for ${packageName} (debuggable=${pkgInfo.debuggable})`,
      user === undefined ? timeout : Math.max(timeout, 45000),
      250,
    )

    const pages = socketResult.pages
    const page =
      pages.find((p) => typeof p.url === 'string' && (p.url.includes('localhost') || p.url.includes('127.0.0.1'))) ||
      pages.find((p) => p.type === 'page') ||
      pages[0]

    if (!page?.webSocketDebuggerUrl) {
      const hint =
        pkgInfo.debuggable === false
          ? 'Target APK is not debuggable (FLAG_DEBUGGABLE=false). Build/install a debuggable APK or enable webContentsDebuggingEnabled.'
          : 'WebView page has no webSocketDebuggerUrl (another DevTools session may already be attached).'
      throw new Error(`Unable to attach WebView CDP for ${packageName}: ${hint}`)
    }

    const wsUrl = new URL(page.webSocketDebuggerUrl)
    wsUrl.hostname = '127.0.0.1'
    wsUrl.port = String(localPort)

    const socket = new WebSocket(wsUrl.toString())
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 10000)
      socket.onopen = () => {
        clearTimeout(timer)
        resolve()
      }
      socket.onerror = (err) => {
        clearTimeout(timer)
        reject(new Error(`WebSocket connection failed: ${err?.message || 'error'}`))
      }
    })

    let nextId = 0
    const pending = new Map()
    const eventListeners = new Map()
    const collectedErrors = []

    const emitEvent = (method, params) => {
      const handlers = eventListeners.get(method)
      if (handlers) {
        for (const fn of handlers) {
          try {
            fn(params)
          } catch {
            // Keep CDP dispatch loop healthy.
          }
        }
      }
    }

    socket.onmessage = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.id) {
        const req = pending.get(msg.id)
        if (!req) return
        pending.delete(msg.id)
        clearTimeout(req.timer)
        if (msg.error) req.reject(new Error(`CDP ${req.method} error: ${msg.error.message}`))
        else req.resolve(msg.result)
        return
      }
      if (msg.method) {
        if (msg.method === 'Runtime.exceptionThrown') {
          const ex = msg.params?.exceptionDetails
          collectedErrors.push({
            kind: 'Runtime.exceptionThrown',
            timestamp: new Date().toISOString(),
            message: ex?.exception?.description || ex?.text || 'Uncaught exception',
            url: ex?.url || '',
            lineNumber: ex?.lineNumber ?? null,
            columnNumber: ex?.columnNumber ?? null,
          })
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
          const text = (msg.params.args || []).map(formatRemoteArg).join(' ').trim()
          collectedErrors.push({
            kind: 'Runtime.consoleAPICalled',
            timestamp: new Date().toISOString(),
            message: text || 'console.error()',
            url: msg.params.stackTrace?.callFrames?.[0]?.url || '',
          })
        } else if (msg.method === 'Log.entryAdded' && msg.params?.entry?.level === 'error') {
          const entry = msg.params.entry
          collectedErrors.push({
            kind: 'Log.entryAdded',
            timestamp: new Date().toISOString(),
            message: entry.text || 'Log error',
            source: entry.source || '',
            url: entry.url || '',
          })
        }
        emitEvent(msg.method, msg.params)
      }
    }

    socket.onclose = () => {
      for (const [id, req] of pending.entries()) {
        clearTimeout(req.timer)
        req.reject(new Error(`CDP socket closed while waiting for ${req.method}`))
        pending.delete(id)
      }
    }

    const rawSend = (method, params = {}, cmdTimeout = 20000) =>
      new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) {
          reject(new Error(`CDP socket is not open (state=${socket.readyState})`))
          return
        }
        const id = ++nextId
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`CDP timeout after ${cmdTimeout}ms: ${method}`))
        }, cmdTimeout)
        pending.set(id, { method, resolve, reject, timer })
        socket.send(JSON.stringify({ id, method, params }))
      })

    const send = async (method, params = {}, cmdTimeout = 20000) => {
      if (method !== 'Page.reload') return rawSend(method, params, cmdTimeout)
      const marker = `ux-e2e-reload-${Date.now()}-${nextId}`
      await rawSend('Runtime.evaluate', {
        expression: `window.__uxE2eReloadMarker = ${JSON.stringify(marker)}`,
      })
      const result = await rawSend(method, params, cmdTimeout)
      await until(
        async () => {
          const state = await rawSend('Runtime.evaluate', {
            expression: `window.__uxE2eReloadMarker !== ${JSON.stringify(marker)} && document.readyState === 'complete' && !!document.querySelector('.app-shell') && !document.querySelector('.boot') && !!window.Capacitor?.nativePromise`,
            returnByValue: true,
          })
          return !state.exceptionDetails && state.result?.value === true
        },
        'WebView document and Capacitor initialization after reload',
        45000,
      )
      return result
    }

    await send('Runtime.enable')
    await send('Log.enable')
    await send('Page.enable')
    await send('DOM.enable')

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (res.exceptionDetails) {
        const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Evaluation failed'
        throw new Error(desc)
      }
      return res.result?.value
    }

    if (waitForCapacitor) {
      await until(
        () =>
          evaluate(
            `document.readyState === 'complete' && !!document.querySelector('.app-shell') && !document.querySelector('.boot') && !!window.Capacitor?.nativePromise`,
          ),
        'Capacitor app boot',
        45000,
      )
    }

    const native = (method, options = {}) =>
      evaluate(`window.Capacitor.nativePromise('CatFocus', ${JSON.stringify(method)}, ${JSON.stringify(options)})`)

    const screenshot = async (filePath) => {
      const res = await send('Page.captureScreenshot', { format: 'png' })
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, Buffer.from(res.data, 'base64'))
      return filePath
    }

    const tapPoint = async (x, y) => {
      const px = Math.round(x)
      const py = Math.round(y)
      await send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: px, y: py, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
      })
      await delay(30)
      await send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      await delay(80)
    }

    const swipeHorizontal = async (direction = 'left') => {
      const box = await evaluate(`(() => {
        const main = document.querySelector('main') || document.body;
        const r = main.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width || window.innerWidth, height: r.height || window.innerHeight };
      })()`)
      const y = Math.round(box.top + box.height * 0.45)
      const startX = Math.round(box.left + box.width * (direction === 'left' ? 0.82 : 0.18))
      const endX = Math.round(box.left + box.width * (direction === 'left' ? 0.18 : 0.82))
      const steps = 8
      await send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
      })
      for (let i = 1; i <= steps; i++) {
        const x = Math.round(startX + ((endX - startX) * i) / steps)
        await send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }],
        })
        await delay(16)
      }
      await send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      await delay(180)
    }

    const locateControl = async ({ role = 'any', name, text, exact = false, index = 0, allowDisabled = false } = {}) => {
      const payload = JSON.stringify({ role, name: name ?? null, text: text ?? null, exact, index, allowDisabled })
      const located = await evaluate(`(() => {
        const opts = ${payload};
        const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
        const isVisible = (el) => {
          if (!el || el.closest('[inert]') || el.closest('[aria-hidden="true"]')) return false;
          const details = el.closest('details:not([open])');
          if (details && !el.closest('summary')) return false;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const dialogs = [...document.querySelectorAll('dialog[open]')];
        const scopeRoots = dialogs.length
          ? [dialogs.at(-1)]
          : [document.querySelector('main'), document.querySelector('nav')].filter(Boolean);
        const roots = scopeRoots.length ? scopeRoots : [document.body];
        const selectorByRole = {
          button: 'button, [role="button"], summary',
          link: 'a[href], [role="link"]',
          tab: '[role="tab"], nav a[href]',
          switch: 'input[type="checkbox"], [role="switch"]',
          checkbox: 'input[type="checkbox"]',
          radio: 'input[type="radio"]',
          textbox: 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea',
          combobox: 'select, [role="combobox"]',
          any: 'button, a[href], summary, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"]',
        };
        const sel = selectorByRole[opts.role] || selectorByRole.any;
        const candidates = [];
        const seen = new Set();
        for (const root of roots) {
          for (const el of root.querySelectorAll(sel)) {
            if (seen.has(el)) continue;
            seen.add(el);
            if (!isVisible(el)) continue;
            if (!opts.allowDisabled && (el.disabled || el.getAttribute('aria-disabled') === 'true')) continue;
            candidates.push(el);
          }
        }
        const getLabelText = (el) => {
          const aria = norm(el.getAttribute('aria-label'));
          if (aria) return aria;
          if (el.labels && el.labels.length) {
            return norm([...el.labels].map((l) => l.innerText || l.textContent).join(' '));
          }
          const parentLabel = el.closest('label');
          if (parentLabel) return norm(parentLabel.innerText || parentLabel.textContent);
          return '';
        };
        const matches = [];
        for (const el of candidates) {
          const aria = norm(el.getAttribute('aria-label'));
          const labelTxt = getLabelText(el);
          const inner = norm(el.innerText || el.textContent);
          const placeholder = norm(el.getAttribute('placeholder'));
          const needle = opts.name !== null ? norm(opts.name) : opts.text !== null ? norm(opts.text) : '';
          let ok = false;
          if (!needle) {
            ok = true;
          } else if (opts.exact) {
            ok = aria === needle || inner === needle || labelTxt === needle || placeholder === needle;
          } else {
            ok =
              aria.includes(needle) ||
              inner.includes(needle) ||
              labelTxt.startsWith(needle) ||
              labelTxt.includes(needle) ||
              placeholder.includes(needle);
          }
          if (ok) {
            matches.push({ el, aria, inner, labelTxt });
          }
        }
        if (!matches.length) return { found: false, candidateCount: candidates.length };
        const chosen = matches[opts.index] || matches[0];
        const el = chosen.el;
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        const parentLabel = el.closest('label');
        const hitTestable = Boolean(
          hit && (hit === el || el.contains(hit) || hit.contains(el) || (parentLabel && parentLabel.contains(hit))),
        );
        return {
          found: true,
          hitTestable,
          tag: el.tagName,
          type: el.getAttribute('type') || '',
          aria: chosen.aria,
          inner: chosen.inner,
          labelTxt: chosen.labelTxt,
          x: cx,
          y: cy,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        };
      })()`)
      return located
    }

    const tapByRoleOrText = async (matcher) => {
      const target = typeof matcher === 'string' ? { name: matcher } : matcher
      const info = await until(
        async () => {
          const res = await locateControl(target)
          return res?.found ? res : null
        },
        `control ${JSON.stringify(target)}`,
        matcher.timeout || 10000,
      )
      if (!info.hitTestable) {
        throw new Error(`Control ${JSON.stringify(target)} found at (${info.x}, ${info.y}) but obscured from hit-testing`)
      }
      await tapPoint(info.x, info.y)
      return info
    }

    const fillByLabel = async (labelOrLabels, value, { exact = false } = {}) => {
      const candidates = Array.isArray(labelOrLabels) ? labelOrLabels : [labelOrLabels]
      const strValue = String(value)
      let matchedLabel = candidates[0]
      const info = await until(
        async () => {
          for (const candidate of candidates) {
            const res = await locateControl({ role: 'any', name: candidate, exact })
            if (res?.found) {
              matchedLabel = candidate
              return res
            }
          }
          return null
        },
        `input field "${candidates.join('" or "')}"`,
        10000,
      )
      const label = matchedLabel

      const isSelect = info.tag === 'SELECT'
      const inputType = (info.type || '').toLowerCase()
      if (isSelect) {
        const applied = await evaluate(`(() => {
          const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
          const dialogs = [...document.querySelectorAll('dialog[open]')];
          const scope = dialogs.at(-1) || document.querySelector('main') || document.body;
          const labels = [...scope.querySelectorAll('label')];
          const row = labels.find((l) => norm(l.innerText || l.textContent).includes(${JSON.stringify(label)}));
          const sel = row?.control || row?.querySelector('select') || [...scope.querySelectorAll('select')].find((s) => norm(s.getAttribute('aria-label')).includes(${JSON.stringify(label)}));
          if (!sel) return false;
          const opt = [...sel.options].find((o) => o.value === ${JSON.stringify(strValue)} || norm(o.textContent).includes(${JSON.stringify(strValue)}));
          if (!opt) return false;
          sel.focus();
          sel.value = opt.value;
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        })()`)
        if (!applied) throw new Error(`Option "${strValue}" not found in select "${label}"`)
        return info
      }

      if (inputType === 'date' || inputType === 'time' || inputType === 'datetime-local') {
        await evaluate(`(() => {
          const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
          const dialogs = [...document.querySelectorAll('dialog[open]')];
          const scope = dialogs.at(-1) || document.querySelector('main') || document.body;
          const el = [...scope.querySelectorAll('input')].find((i) => {
            const aria = norm(i.getAttribute('aria-label'));
            const lbl = i.closest('label') ? norm(i.closest('label').innerText) : '';
            return aria.includes(${JSON.stringify(label)}) || lbl.includes(${JSON.stringify(label)});
          });
          if (!el) throw new Error('Missing temporal input');
          el.focus();
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(strValue)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        })()`)
        return info
      }

      // Tap real coordinates to focus input, select/clear, then insert UTF-8 text via CDP Input.insertText.
      await tapPoint(info.x, info.y)
      const currentLen = await evaluate(`(() => {
        const active = document.activeElement;
        if (!active || !('value' in active)) return -1;
        try { active.select(); } catch {}
        return String(active.value || '').length;
      })()`)
      if (currentLen < 0) {
        // Fallback focus if touch did not focus activeElement directly.
        await evaluate(`(() => {
          const hit = document.elementFromPoint(${info.x}, ${info.y});
          const input = hit?.closest('label')?.querySelector('input,textarea') || hit;
          input?.focus();
          try { input?.select(); } catch {}
        })()`)
      }
      // Clear using Backspace key events (select() may not select all on input[type=number] on some Android WebViews).
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
      const remaining = await evaluate(`String(document.activeElement?.value || '').length`)
      for (let i = 0; i < remaining; i++) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
      }
      if (strValue.length > 0) {
        await send('Input.insertText', { text: strValue })
      }
      await delay(60)
      const observedValue = await evaluate(`String(document.activeElement?.value ?? '')`)
      if (observedValue !== strValue) {
        throw new Error(`Input "${label}" expected "${strValue}" after CDP insertText, got "${observedValue}"`)
      }
      return info
    }

    const waitForText = (needle, waitTimeout = 12000) =>
      until(
        async () => {
          const bodyText = await evaluate('document.body.innerText || ""')
          return bodyText.includes(needle)
        },
        `text "${needle}"`,
        waitTimeout,
      )

    const waitForRoute = (hashPath, waitTimeout = 12000) =>
      until(
        async () => {
          const ready = await evaluate(`(() => {
            const p = ${JSON.stringify(hashPath)};
            const h = location.hash || '';
            if (h !== '#' + p && !h.startsWith('#' + p + '?')) return false;
            const tabLink = document.querySelector('.tabbar a[href="#' + p + '"]');
            if (tabLink) {
              return tabLink.getAttribute('aria-current') === 'page' && (document.querySelector('main')?.children.length || 0) > 0;
            }
            if (['/focus', '/rest', '/lock', '/permissions', '/help', '/emergency', '/recovery'].includes(p)) {
              return !!document.querySelector('.app-shell.fullscreen') && (document.querySelector('main')?.children.length || 0) > 0;
            }
            return true;
          })()`)
          return ready === true
        },
        `route #${hashPath}`,
        waitTimeout,
      )

    const navigateRoute = async (hashPath) => {
      await evaluate(`location.hash = ${JSON.stringify('#' + hashPath)}`)
      await waitForRoute(hashPath)
      await delay(120)
    }

    const waitForDialogOpen = (waitTimeout = 10000) =>
      until(() => evaluate('document.querySelectorAll("dialog[open]").length >= 1'), 'dialog open', waitTimeout)

    const waitForDialogClosed = (waitTimeout = 10000) =>
      until(() => evaluate('document.querySelectorAll("dialog[open]").length === 0'), 'dialog closed', waitTimeout)

    const getErrors = () => [...collectedErrors]
    const clearErrors = () => {
      collectedErrors.length = 0
    }

    const close = () => {
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close()
        }
      } catch {
        // Ignore close error.
      }
      cleanupForward()
    }

    return {
      packageName,
      serial: bridge.serial,
      pid: discoveredPid,
      discoveryMethod,
      localPort,
      targetUrl: page.url,
      pkgInfo,
      send,
      evaluate,
      native,
      reload: () => send('Page.reload'),
      screenshot,
      tapPoint,
      swipeHorizontal,
      locateControl,
      tapByRoleOrText,
      fillByLabel,
      waitForText,
      waitForRoute,
      navigateRoute,
      waitForDialogOpen,
      waitForDialogClosed,
      waitUntil: until,
      getErrors,
      clearErrors,
      get closed() {
        return socket.readyState >= 2
      },
      close,
    }
  } catch (err) {
    cleanupForward()
    throw err
  }
}
