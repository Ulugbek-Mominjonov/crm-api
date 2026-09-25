import 'reflect-metadata'
import { config as loadDotenv } from 'dotenv'
import { runInvariantsJob } from './invariants.job'

/** `npm run job:invariants -w apps/api` — natija stdout'da (JSON), chiqish kodi 0/1 */
loadDotenv({ path: ['.env.local', '.env'], quiet: true })
runInvariantsJob()
  .then(({ exitCode, ...result }) => {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = exitCode
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
