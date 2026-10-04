import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteProspectsForRun, markPendingQueryRun, prepareOutreachDraft, retryProspectEnrichment, submitBrief, updateDraftBody, updateReviewState } from './server/actions'
import { invalidateProspectViews, invalidateRunResults, queryKeys } from './query-cache'

import type { ResearchSettings } from './research-settings'

export interface ResearchInput {
  researchSettings: ResearchSettings
  brief: string
  countries: string[]
  minAudience: string | number | null
  maxAudience: string | number | null
}

export function useStartResearch() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ input, suggestedId }: { input: ResearchInput; suggestedId?: string }) => {
      const run = await submitBrief({ data: input })
      if (suggestedId) await markPendingQueryRun({ data: { id: suggestedId, runId: run.id } })
      return run
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.runs }),
        client.invalidateQueries({ queryKey: queryKeys.suggested }),
      ])
    },
  })
}

export function useClearRun() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['clear-run'],
    mutationFn: (runId: string) => deleteProspectsForRun({ data: { runId } }),
    onSuccess: (_, runId) => invalidateRunResults(client, runId),
  })
}

export function useEnrichProspect() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['enrich-prospect'],
    mutationFn: ({ communityId }: { communityId: string; runId: string }) => retryProspectEnrichment({ data: { communityId } }),
    onSuccess: async (_, { runId }) => {
      // Spending is shared; mark other cached diagnostics stale as well.
      await client.invalidateQueries({ predicate: query => query.queryKey[0] === 'run' && query.queryKey[2] === 'diagnostics', refetchType: 'none' })
      await Promise.all([invalidateRunResults(client, runId), invalidateProspectViews(client)])
    },
  })
}

export function useReviewProspect() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (data: { prospectId: string; state: 'selected' | 'rejected' | 'pending' }) => updateReviewState({ data }),
    onSuccess: () => invalidateProspectViews(client),
  })
}

export function usePrepareDraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (prospectId: string) => prepareOutreachDraft({ data: { prospectId } }),
    onSuccess: async () => {
      await Promise.all([
        invalidateProspectViews(client),
        client.invalidateQueries({ predicate: query => query.queryKey[0] === 'run' && query.queryKey[2] === 'diagnostics' }),
      ])
    },
  })
}

export function useSaveDraft() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (data: { draftId: string; body: string }) => updateDraftBody({ data }),
    onSuccess: () => invalidateProspectViews(client),
  })
}
