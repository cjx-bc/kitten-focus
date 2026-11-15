import { connectQa } from './lib/android-qa.mjs'
import { verifyOfflineHelp } from './lib/help-device-acceptance.mjs'

const qa = await connectQa({ port: 9265, output: process.env.QA_OUTPUT || 'artifacts/focus-control/api36/help' })
try {
  const result = await verifyOfflineHelp(qa)
  qa.save('results.json', result)
  console.log(JSON.stringify(result))
} finally { qa.close() }
