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

function base64ToPngBlob(base64: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: 'image/png' })
}

/**
 * Exports a PNG data URL via Android SAF (when native exportBase64File is present)
 * with a browser `<a download>` `Blob` fallback.
 */
export async function exportPngFile(dataUrl: string, fileName: string): Promise<void> {
  if (!dataUrl.startsWith(PNG_DATA_PREFIX)) {
    throw new Error('无效的 PNG 图片数据')
  }
  const base64 = dataUrl.slice(PNG_DATA_PREFIX.length)
  if (!base64) {
    throw new Error('导出图片数据为空')
  }

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

  const url = URL.createObjectURL(base64ToPngBlob(base64))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body?.appendChild?.(anchor)
  anchor.click()
  anchor.remove?.()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
