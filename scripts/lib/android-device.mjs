import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function androidDevice(root) {
  const file = resolve(root, '.cache/android-test-device.json')
  const configured = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  return {
    adb: process.env.ADB || configured.adb || resolve(root, '.tools/android-sdk/platform-tools/adb.exe'),
    serial: process.env.ANDROID_SERIAL || configured.serial,
  }
}
