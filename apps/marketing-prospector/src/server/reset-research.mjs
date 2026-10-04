import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { getDatabasePath, resetResearchWorkspace } from './db.ts'

if (process.argv.slice(2).join(' ') !== '--confirm-research-reset') {
  throw new Error('Stop the application first. Usage: pnpm --filter marketing-prospector reset-research --confirm-research-reset')
}
const path = getDatabasePath()
const root = join(dirname(path), 'backups')
mkdirSync(root, { recursive: true, mode: 0o700 })
const result = resetResearchWorkspace(path, {
  confirmed: true,
  backupDirectory: join(root, `research-reset-${new Date().toISOString().replaceAll(':', '-')}`),
})
console.log(JSON.stringify(result, null, 2))
console.log('Research cleared; spending and unresolved reservations remain in budget.sqlite. Keep the app stopped until the community-only build is ready.')
