import { existsSync, mkdirSync } from 'node:fs'
import { researchSchema } from './research-schema.ts'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const RESEARCH_SCHEMA_VERSION = 200
const budgetSchema = `
  CREATE TABLE IF NOT EXISTS budget.usage_ledger (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    provider TEXT NOT NULL,
    run_id TEXT,
    operation TEXT NOT NULL CHECK (operation IN ('reserve','reconcile','release')),
    credits INTEGER NOT NULL CHECK (credits >= 0),
    cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
    status TEXT NOT NULL CHECK (status IN ('reserved','settled','released')),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS budget.usage_month_provider ON usage_ledger(month, provider, status);
`
const ledgerColumns = ['id', 'month', 'provider', 'run_id', 'operation', 'credits', 'cost_micros', 'status', 'created_at'] as const

export function getDatabasePath(): string {
  return resolve(process.env.PROSPECTOR_DATA_DIR ?? '.local', 'prospects.sqlite')
}

export function getBudgetPath(path = getDatabasePath()): string {
  return path === ':memory:' ? ':memory:' : resolve(dirname(resolve(path)), 'budget.sqlite')
}

function connect(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path === ':memory:' ? path : resolve(path))
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  return db
}

function attachBudget(db: DatabaseSync, budgetPath: string): void {
  db.prepare('ATTACH DATABASE ? AS budget').run(budgetPath)
  const version = Number(db.prepare('PRAGMA budget.user_version').get()?.user_version ?? 0)
  if (version !== 0 && version !== 1) throw new Error(`Unsupported budget schema ${version}; do not reset or discard spending records`)
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(budgetSchema)
    db.exec('PRAGMA budget.user_version = 1; COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

function verify(db: DatabaseSync): void {
  if (db.prepare('PRAGMA main.integrity_check').get()?.integrity_check !== 'ok'
    || db.prepare('PRAGMA budget.integrity_check').get()?.integrity_check !== 'ok'
    || db.prepare('PRAGMA main.foreign_key_check').all().length) {
    throw new Error('Workspace failed integrity/foreign-key validation')
  }
}

function initialize(db: DatabaseSync, budgetPath: string): void {
  db.exec(researchSchema)
  db.prepare('INSERT INTO workspace_metadata(singleton, budget_path) VALUES (1, ?)').run(budgetPath)
  db.exec(`PRAGMA main.user_version = ${RESEARCH_SCHEMA_VERSION}`)
  verify(db)
}

// Research never owns the ledger: unqualified usage_ledger statements resolve to
// the attached budget database. There is intentionally no cross-database run FK.
export function openDatabase(path = getDatabasePath()): DatabaseSync {
  const db = connect(path)
  try {
    const version = Number(db.prepare('PRAGMA main.user_version').get()?.user_version ?? 0)
    const tables = db.prepare("SELECT name FROM main.sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
    const fresh = version === 0 && tables.length === 0
    if (!fresh && version !== RESEARCH_SCHEMA_VERSION) {
      throw new Error(`Unsupported research schema ${version}. Stop the app, back up storage, then run pnpm --filter marketing-prospector reset-research --confirm-research-reset. No research migration was performed.`)
    }
    const budgetPath = getBudgetPath(path)
    if (!fresh && path !== ':memory:') {
      const metadata = db.prepare('SELECT budget_path FROM workspace_metadata WHERE singleton = 1').get()
      if (!metadata || metadata.budget_path !== budgetPath || !existsSync(budgetPath)) {
        throw new Error('Durable budget storage is missing or moved; restore budget.sqlite alongside research before continuing. No new allowance was created.')
      }
    }
    attachBudget(db, budgetPath)
    if (fresh) {
      db.exec('BEGIN IMMEDIATE')
      try { initialize(db, budgetPath); db.exec('COMMIT') }
      catch (error) { db.exec('ROLLBACK'); throw error }
    }
    return db
  } catch (error) { db.close(); throw error }
}

// Explicit maintenance only, with the application stopped. Ledger preservation
// commits BEFORE clearing research. A crash between phases leaves a resumable
// import and never releases a reservation or adds a new monthly allowance.
export function resetResearchWorkspace(path: string, options: { confirmed: boolean; backupDirectory: string }): { backupDirectory: string; preservedRecords: number } {
  if (!options.confirmed) throw new Error('Explicit research-reset confirmation is required')
  if (path === ':memory:') throw new Error('Reset requires durable storage and a backup')
  const backupDirectory = resolve(options.backupDirectory)
  mkdirSync(backupDirectory, { recursive: false, mode: 0o700 })
  const db = connect(path)
  try {
    const version = Number(db.prepare('PRAGMA main.user_version').get()?.user_version ?? 0)
    const hasLedger = !!db.prepare("SELECT 1 FROM main.sqlite_schema WHERE type='table' AND name='usage_ledger'").get()
    if (version !== RESEARCH_SCHEMA_VERSION && !hasLedger) throw new Error('Cannot establish historical budget records; restore a database containing usage_ledger before resetting')
    const active = db.prepare("SELECT count(*) AS n FROM runs WHERE status IN ('queued','planning','running')").get()
    if (Number(active?.n)) throw new Error('Research is active; stop it and settle or retain its reservations before resetting')
    db.prepare('VACUUM main INTO ?').run(resolve(backupDirectory, 'prospects.sqlite'))
    const budgetPath = getBudgetPath(path)
    if (version === RESEARCH_SCHEMA_VERSION && !existsSync(budgetPath)) throw new Error('Durable budget storage is missing; reset cannot restore allowance')
    attachBudget(db, budgetPath)
    db.prepare('VACUUM budget INTO ?').run(resolve(backupDirectory, 'budget.sqlite'))
    db.exec('BEGIN IMMEDIATE')
    try {
      if (hasLedger) {
        const oldRows = db.prepare(`SELECT ${ledgerColumns.join(',')} FROM main.usage_ledger`).all()
        const insert = db.prepare(`INSERT OR IGNORE INTO budget.usage_ledger (${ledgerColumns.join(',')}) VALUES (${ledgerColumns.map(() => '?').join(',')})`)
        for (const row of oldRows) {
          const existing = db.prepare('SELECT * FROM budget.usage_ledger WHERE id = ?').get(row.id)
          if (existing && ledgerColumns.some(column => column !== 'run_id' && existing[column] !== row[column])) {
            throw new Error(`Budget record ${row.id} conflicts with preserved history; no research was cleared`)
          }
          insert.run(...ledgerColumns.map(column => column === 'run_id' ? null : row[column]))
        }
      }
      // Research run identifiers are local, not billing identities.
      db.exec('UPDATE budget.usage_ledger SET run_id = NULL')
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
    const preservedRecords = Number(db.prepare('SELECT count(*) AS n FROM budget.usage_ledger').get()?.n)
    db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE')
    try {
      const objects = db.prepare("SELECT type,name FROM main.sqlite_schema WHERE type IN ('trigger','view','table') AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'trigger' THEN 0 WHEN 'view' THEN 1 ELSE 2 END").all()
      for (const object of objects) db.exec(`DROP ${String(object.type).toUpperCase()} "${String(object.name).replaceAll('"', '""')}"`)
      initialize(db, budgetPath)
      db.exec('COMMIT; PRAGMA foreign_keys = ON')
      verify(db)
    } catch (error) { db.exec('ROLLBACK'); throw error }
    return { backupDirectory, preservedRecords }
  } finally { db.close() }
}
