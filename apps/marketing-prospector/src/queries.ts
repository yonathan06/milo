import { queryOptions } from '@tanstack/react-query'
import { getRunDiagnostics, getRunProgress, listAllProspects, listPendingQueries, listProspects, listRuns } from './server/actions'
import { isActiveRun, queryKeys } from './query-cache'

export const runsOptions = () => queryOptions({
  queryKey: queryKeys.runs,
  queryFn: ({ signal }) => listRuns({ signal }),
  refetchInterval: query => query.state.data?.some(run => isActiveRun(run.status)) ? 1500 : false,
})
export const suggestedQueriesOptions = () => queryOptions({
  queryKey: queryKeys.suggested,
  queryFn: ({ signal }) => listPendingQueries({ signal }),
})
export const allProspectsOptions = () => queryOptions({
  queryKey: queryKeys.directory,
  queryFn: ({ signal }) => listAllProspects({ signal }),
})
export const runProgressOptions = (runId: string) => queryOptions({
  queryKey: queryKeys.progress(runId),
  queryFn: ({ signal }) => getRunProgress({ data: { runId }, signal }),
  refetchInterval: query => isActiveRun(query.state.data?.run.status) ? 1500 : false,
})
export const runProspectsOptions = (runId: string, filters: { type: string; minScore: string }) => queryOptions({
  queryKey: [...queryKeys.prospects(runId), { type: filters.type, minScore: filters.minScore }] as const,
  queryFn: ({ signal }) => listProspects({ data: { runId, ...filters }, signal }),
})
export const runDiagnosticsOptions = (runId: string) => queryOptions({
  queryKey: queryKeys.diagnostics(runId),
  queryFn: ({ signal }) => getRunDiagnostics({ data: { runId }, signal }),
})
