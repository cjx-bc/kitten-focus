import { native } from './bridge'
import { getCatFocusPlugin } from './catFocusPlugin'

interface ExportBase64Plugin {
  exportBase64File?: (options: {
    base64: string
    name: string
    mimeType: string
  }) => Promise<void>
}

const PNG_DATA_PREFIX = 'data:image/png;base64,'

function isUnimplementedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  if (code === 'UNIMPLEMENTED') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /unimplemented|not implemented/i.test(msg)
}

/**
 * Exports a PNG data URL via Android SAF (when native exportBase64File is present)
 * or browser anchor download.
 */
export async function exportPngFile(dataUrl: string, fileName: string): Promise<void> {
  if (!dataUrl.startsWith(PNG_DATA_PREFIX)) {
    throw new Error('无效的 PNG 图片数据')
  }
  const base64 = dataUrl.slice(PNG_DATA_PREFIX.length)
  if (native) {
    const plugin = getCatFocusPlugin<ExportBase64Plugin>()
    if (typeof plugin.exportBase64File === 'function') {
      try {
        await plugin.exportBase64File({ base64, name: fileName, mimeType: 'image/png' })
        return
      } catch (err) {
        if (!isUnimplementedError(err)) throw err
      }
    }
  }
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
