import { getDatabasePath } from './db.ts'
import { restorePreviousWorkspace } from './restore-workspace.ts'

const [backupPath, confirmation, ...extra] = process.argv.slice(2)
if (!backupPath || confirmation !== '--confirm-previous-build-restore' || extra.length) {
  throw new Error('Stop all app builds first. Usage: pnpm --filter marketing-prospector restore-previous-workspace /absolute/backup/prospects.sqlite --confirm-previous-build-restore')
}
console.log(JSON.stringify(restorePreviousWorkspace(getDatabasePath(), backupPath, true), null, 2))
console.log('Previous research restored with current spending/reservations. Keep budget.sqlite. Restore and use the previous BUILD; the new build intentionally rejects old research schemas.')
