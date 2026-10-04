import { useEffect, useRef } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { runDiagnosticsOptions, runProgressOptions, runProspectsOptions } from './queries'
import { isActiveRun, queryKeys } from './query-cache'

export function useRunData(runId: string, filters: { type: string; minScore: string }) {
  const client = useQueryClient()
  const progress = useSuspenseQuery(runProgressOptions(runId))
  const prospects = useSuspenseQuery(runProspectsOptions(runId, filters))
  const diagnostics = useSuspenseQuery(runDiagnosticsOptions(runId))
  const status = String(progress.data.run.status)
  const previous = useRef({ runId, updatedAt: progress.dataUpdatedAt, status })

  useEffect(() => {
    const before = previous.current
    previous.current = { runId, updatedAt: progress.dataUpdatedAt, status }
    if (before.runId !== runId || before.updatedAt === progress.dataUpdatedAt) return
    if (!isActiveRun(before.status) && !isActiveRun(status)) return
    // Progress owns the only polling timer. Refresh dependent resources after
    // each tick, including the final tick that transitions to a finished run.
    void Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.prospects(runId) }),
      client.invalidateQueries({ queryKey: queryKeys.diagnostics(runId) }),
      client.invalidateQueries({ queryKey: queryKeys.runs, refetchType: 'none' }),
      client.invalidateQueries({ queryKey: queryKeys.directory, refetchType: 'none' }),
      client.invalidateQueries({ queryKey: queryKeys.suggested, refetchType: 'none' }),
    ])
  }, [client, runId, progress.dataUpdatedAt, status])

  return { progress: progress.data, prospects: prospects.data, diagnostics: diagnostics.data,
    refreshError: progress.error ?? prospects.error ?? diagnostics.error }
}
