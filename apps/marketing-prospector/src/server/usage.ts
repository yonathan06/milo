import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

const BRAVE_SEARCH_COST_MICROS = 5_000
const BRIGHTDATA_COST_PER_1K_RECORDS_MICROS = 1_500_000
const HARD_CAP_MICROS = 10_000_000

function configuredBudgetMicros(): number {
  return HARD_CAP_MICROS
}

export function getMonthlyUsage(db: DatabaseSync, now = new Date()): { month: string; capMicros: number; committedMicros: number; remainingMicros: number; paidCallsEnabled: boolean; unresolvedCount: number } {
  const month = now.toISOString().slice(0, 7)
  const budgetMicros = Math.min(configuredBudgetMicros(), HARD_CAP_MICROS)
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN status IN ('reserved','settled') THEN cost_micros ELSE 0 END), 0) AS committed
    FROM usage_ledger WHERE month = ?
  `).get(month) as { committed: number }
  const committedMicros = Number(row.committed)
  return {
    month,
    capMicros: budgetMicros,
    committedMicros,
    remainingMicros: Math.max(0, budgetMicros - committedMicros),
    paidCallsEnabled: true,
    unresolvedCount: Number(db.prepare("SELECT count(*) n FROM usage_ledger WHERE status='reserved'").get()?.n ?? 0),
  }
}

export function reserveUsageRequest(db: DatabaseSync, provider: string, runId: string, maximumCostMicros: number, now = new Date()): string {
  if (!Number.isSafeInteger(maximumCostMicros) || maximumCostMicros < 0) throw new Error('Invalid preflight usage estimate')
  const budgetMicros = Math.min(configuredBudgetMicros(), HARD_CAP_MICROS)
  if (maximumCostMicros > 0 && budgetMicros < maximumCostMicros) {
    throw new Error('Monthly external-service budget cannot cover this request')
  }
  const month = now.toISOString().slice(0, 7)
  const reservationId = randomUUID()
  db.exec('BEGIN IMMEDIATE')
  try {
    const usage = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN status IN ('reserved','settled') THEN cost_micros ELSE 0 END), 0) AS committed,
        (SELECT count(*) FROM usage_ledger WHERE status = 'reserved') AS unresolved
      FROM usage_ledger WHERE month = ?
    `).get(month) as { committed: number; unresolved: number }
    if (Number(usage.unresolved) > 0) {
      throw new Error('An earlier external-service charge is unresolved; no new provider request was made')
    }
    if (Number(usage.committed) + maximumCostMicros > budgetMicros) {
      throw new Error('Monthly external-service budget exhausted; no provider request was made')
    }
    db.prepare(`
      INSERT INTO usage_ledger (id, month, provider, run_id, operation, credits, cost_micros, status, created_at)
      VALUES (?, ?, ?, ?, 'reserve', 1, ?, 'reserved', ?)
    `).run(reservationId, month, provider, runId, maximumCostMicros, now.toISOString())
    db.exec('COMMIT')
    return reservationId
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function recordBrightDataUsage(db: DatabaseSync, runId: string, recordCount: number, now = new Date()): { costMicros: number; usage: ReturnType<typeof getMonthlyUsage> } {
  if (!Number.isSafeInteger(recordCount) || recordCount < 0) throw new Error('Invalid Bright Data record count')
  const costMicros = Math.ceil(recordCount * BRIGHTDATA_COST_PER_1K_RECORDS_MICROS / 1000)
  const month = now.toISOString().slice(0, 7)
  db.prepare(`INSERT INTO usage_ledger (id, month, provider, run_id, operation, credits, cost_micros, status, created_at)
    VALUES (?, ?, 'brightdata', ?, 'reconcile', ?, ?, 'settled', ?)`)
    .run(randomUUID(), month, runId, recordCount, costMicros, now.toISOString())
  return { costMicros, usage: getMonthlyUsage(db, now) }
}

export function reserveBraveRequest(db: DatabaseSync, runId: string, now = new Date()): string {
  try {
    return reserveUsageRequest(db, 'brave', runId, BRAVE_SEARCH_COST_MICROS, now)
  } catch (error) {
    if (error instanceof Error && error.message.includes('Monthly external-service budget exhausted')) {
      throw new Error('Monthly search budget exhausted; no provider request was made')
    }
    throw error
  }
}

export function releaseUsageRequest(db: DatabaseSync, reservationId: string): void {
  const result = db.prepare(`
    UPDATE usage_ledger SET operation = 'release', cost_micros = 0, status = 'released'
    WHERE id = ? AND status = 'reserved'
  `).run(reservationId)
  if (Number(result.changes) !== 1) throw new Error('Provider usage reservation could not be released')
}

export function settleUsageRequest(db: DatabaseSync, reservationId: string, actualCostMicros: number): void {
  if (!Number.isSafeInteger(actualCostMicros) || actualCostMicros < 0) throw new Error('Invalid reconciled provider charge')
  const reservation = db.prepare('SELECT cost_micros FROM usage_ledger WHERE id = ? AND status = \'reserved\'').get(reservationId) as { cost_micros: number } | undefined
  if (!reservation) throw new Error('Provider usage reservation could not be reconciled')
  if (actualCostMicros > Number(reservation.cost_micros)) {
    throw new Error('Provider charge exceeded its preflight reservation; the run stopped to protect the monthly cap')
  }
  const result = db.prepare(`
    UPDATE usage_ledger SET operation = 'reconcile', cost_micros = ?, status = 'settled'
    WHERE id = ? AND status = 'reserved'
  `).run(actualCostMicros, reservationId)
  if (Number(result.changes) !== 1) throw new Error('Provider usage reservation could not be reconciled')
}

export function settleBraveRequest(db: DatabaseSync, reservationId: string, actualCostMicros = BRAVE_SEARCH_COST_MICROS): void {
  if (actualCostMicros > BRAVE_SEARCH_COST_MICROS) throw new Error('Invalid Brave request charge')
  settleUsageRequest(db, reservationId, actualCostMicros)
}

export function releaseBraveRequest(db: DatabaseSync, reservationId: string): void {
  db.prepare(`
    UPDATE usage_ledger SET operation = 'release', cost_micros = 0, status = 'released'
    WHERE id = ? AND provider = 'brave' AND status = 'reserved'
  `).run(reservationId)
}
