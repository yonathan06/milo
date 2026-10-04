import { QueryClient } from '@tanstack/react-query'

// Called once per router (and therefore once per SSR request), never globally.
export function createQueryClient() {
  return new QueryClient({ defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { retry: false },
  } })
}

export const queryKeys = {
  runs: ['runs'] as const,
  suggested: ['suggested-queries'] as const,
  directory: ['prospects', 'all'] as const,
  run: (runId: string) => ['run', runId] as const,
  progress: (runId: string) => ['run', runId, 'progress'] as const,
  prospects: (runId: string) => ['run', runId, 'prospects'] as const,
  diagnostics: (runId: string) => ['run', runId, 'diagnostics'] as const,
}

export function isActiveRun(status: unknown) {
  return status === 'queued' || status === 'planning' || status === 'running'
}

export async function invalidateRunResults(client: QueryClient, runId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.run(runId) }),
    client.invalidateQueries({ queryKey: queryKeys.runs }),
    client.invalidateQueries({ queryKey: queryKeys.directory }),
  ])
}

// Review state belongs to an identity shared across runs. Refresh prospect
// views, not unrelated planning, diagnostics, or navigation loaders.
export async function invalidateProspectViews(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.directory }),
    client.invalidateQueries({ predicate: query => query.queryKey[0] === 'run' && query.queryKey[2] === 'prospects' }),
  ])
}
