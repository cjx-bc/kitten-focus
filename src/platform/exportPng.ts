import { Capacitor } from '@capacitor/core'
import { getCatFocusPlugin } from './catFocusPlugin'

interface ExportBase64Bridge {
  exportBase64File(options: { base64: string; name: string; mimeType: string }): Promise<void>
}

const plugin = getCatFocusPlugin<ExportBase64Bridge>()

function extractBase64Payload(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
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
 * Exports a PNG data URL to disk using Web `<a download>` or Android SAF (`ACTION_CREATE_DOCUMENT`)
 * without requesting storage or gallery permissions.
 */
export async function exportPngFile(dataUrl: string, fileName: string): Promise<void> {
  const base64 = extractBase64Payload(dataUrl)
  if (!base64) throw new Error('导出图片数据为空')

  if (Capacitor.isNativePlatform()) {
    await plugin.exportBase64File({ base64, name: fileName, mimeType: 'image/png' })
    return
  }

  const url = URL.createObjectURL(base64ToPngBlob(base64))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
