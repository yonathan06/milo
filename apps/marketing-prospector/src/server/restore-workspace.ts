import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { getBudgetPath } from './db.ts'

// Operational rollback only: never used to decode old research in the new app.
// Run while ALL builds are stopped. Keep the durable budget file untouched.
export function restorePreviousWorkspace(path: string, backupPath: string, confirmed: boolean): { savedCurrentPath: string } {
  if (!confirmed) throw new Error('Explicit previous-build restore confirmation is required')
  path = resolve(path)
  backupPath = resolve(backupPath)
  const budgetPath = getBudgetPath(path)
  if (!existsSync(budgetPath)) throw new Error('Durable budget storage is missing; restore must not reset allowance')
  if (existsSync(`${backupPath}-wal`)) throw new Error('Use a stopped, consistent SQLite backup, not a live database')
  const temporary = join(dirname(path), `restore-${randomUUID()}.sqlite`)
  const savedCurrentPath = `${path}.before-restore-${randomUUID()}`
  copyFileSync(backupPath, temporary)
  let restored: DatabaseSync | undefined
  try {
    restored = new DatabaseSync(temporary)
    restored.exec('PRAGMA foreign_keys = ON')
    if (!restored.prepare("SELECT 1 FROM main.sqlite_schema WHERE type='table' AND name='usage_ledger'").get()) {
      throw new Error('Previous-build backup must contain its historical usage_ledger')
    }
    restored.prepare('ATTACH DATABASE ? AS current_budget').run(budgetPath)
    // A missing old charge cannot safely be explained away as a reset.
    const missing = restored.prepare('SELECT old.id FROM main.usage_ledger old LEFT JOIN current_budget.usage_ledger current ON current.id=old.id WHERE current.id IS NULL').all()
    if (missing.length) throw new Error('Backup charges are absent from durable budget history; reconcile before restoring')
    restored.exec(`BEGIN IMMEDIATE;
      DELETE FROM main.usage_ledger;
      INSERT INTO main.usage_ledger(id,month,provider,run_id,operation,credits,cost_micros,status,created_at)
        SELECT id,month,provider,NULL,operation,credits,cost_micros,status,created_at FROM current_budget.usage_ledger;`)
    if (restored.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok'
      || restored.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Restored workspace failed validation')
    restored.exec('COMMIT')
    restored.close()
    restored = undefined
    if (existsSync(path)) {
      const current = new DatabaseSync(path)
      try {
        const active = current.prepare("SELECT count(*) n FROM runs WHERE status IN ('queued','planning','running')").get()
        if (Number(active?.n)) throw new Error('Research is active; stop it before restoring')
        current.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        current.prepare('VACUUM INTO ?').run(savedCurrentPath)
      } finally { current.close() }
    }
    // Both copies are closed and checkpointed before atomic file replacement.
    rmSync(`${path}-wal`, { force: true })
    rmSync(`${path}-shm`, { force: true })
    renameSync(temporary, path)
    return { savedCurrentPath }
  } finally {
    restored?.close()
    rmSync(temporary, { force: true })
  }
}
