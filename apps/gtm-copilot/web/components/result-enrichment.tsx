import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createSignal, Show } from 'solid-js';
import { enrichmentStatusOptions, startResultAssessment, startResultEnrichment } from '../data';
import type { Result } from '../server/store';
import type { ResultsFilterRequest } from '../results-page';

export function ResultEnrichment(props: { segmentId?: number; resultId?: number; results: Result[]; filters?: ResultsFilterRequest; scopeUpdating?: boolean; counts?: { pending: number; pendingAssessments: number; matched?: number; unscraped?: number; extraction?: number } }) {
  const client = useQueryClient();
  const status = createQuery(enrichmentStatusOptions);
  const [message, setMessage] = createSignal('');
  const scoped = () => props.results.filter((result) => props.resultId === undefined || result.id === props.resultId);
  const pendingExtraction = () => props.counts?.extraction ?? scoped().filter((result) => result.scraped && !result.assessment_ready).length;
  const pendingAssessments = () => props.counts?.pendingAssessments ?? scoped().filter((result) => result.assessment_ready && result.assessment_status !== 'complete').length;
  const canReassess = () => props.resultId !== undefined && scoped().some((result) => result.assessment_ready && result.assessment_status === 'complete');
  const unscraped = () => props.counts?.unscraped ?? scoped().filter((result) => !result.scraped).length;
  const mutation = createMutation(() => ({
    mutationFn: (request: { mode: 'extraction' | 'assessment' | 'scrape'; force?: boolean }) => {
      const data = { segmentId: props.segmentId, resultId: props.resultId, filters: props.filters, force: request.force, mode: request.mode };
      return request.mode === 'assessment' ? startResultAssessment({ data }) : startResultEnrichment({ data });
    },
    onSuccess: (response) => { setMessage(response.error ?? ''); if (response.job) client.setQueryData(['result-enrichment'], response.job); else void status.refetch(); },
    onError: () => { setMessage('Could not confirm the job started. Refresh status before retrying.'); void status.refetch(); },
  }));
  const busy = () => mutation.isPending || status.data?.status === 'running';
  const unavailable = () => busy() || status.isPending || status.isError || props.scopeUpdating;
  const processed = () => status.data?.results.filter((result) => !['queued', 'running'].includes(result.status)).length ?? 0;
  const processingLabel = () => {
    const active = status.data?.results.find((result) => result.status === 'running');
    if (!active) return 'Processing queue';
    return `Processing result #${active.resultId} · ${active.step ?? active.phase ?? 'starting'}${active.outputChars ? ` · ${active.outputChars} output characters received` : active.stepStatus === 'waiting' ? ' · still waiting' : ''}${active.stepElapsedMs != null ? ` · ${Math.round(active.stepElapsedMs / 1000)}s in this step` : ''}`;
  };
  let lastProgress = '';
  createEffect(() => {
    const job = status.data;
    if (!job) return;
    const signature = `${job.id}:${processed()}:${job.status}:${job.results.map((result) => result.phase).join(',')}`;
    if (signature !== lastProgress) {
      lastProgress = signature;
      for (const key of ['results', 'segment', 'result']) void client.invalidateQueries({ queryKey: [key] });
    }
  });
  const buttonClass = 'rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50';
  return <div class="mb-5 rounded-xl border border-teal-200 bg-white p-4">
    <div class="flex flex-wrap gap-3">
      <button type="button" class={buttonClass} disabled={unavailable() || !unscraped()} onClick={() => { setMessage(''); mutation.mutate({ mode: 'scrape' }); }}>{busy() ? 'Processing…' : props.resultId !== undefined ? 'Scrape this result' : `Scrape ${unscraped()} unscraped ${props.filters ? 'filtered ' : ''}results`}</button>
      <button type="button" class={buttonClass} disabled={unavailable() || !pendingExtraction()} onClick={() => { setMessage(''); mutation.mutate({ mode: 'extraction' }); }}>{busy() ? 'Processing…' : props.resultId !== undefined ? 'Extract data from saved sources' : `Extract data from ${pendingExtraction()} ${props.filters ? 'matching ' : ''}scraped results`}</button>
      <button type="button" class={buttonClass} disabled={unavailable() || (!pendingAssessments() && !canReassess())} onClick={() => { setMessage(''); mutation.mutate({ mode: 'assessment', force: canReassess() }); }}>{canReassess() ? 'Reassess enriched data' : props.resultId !== undefined ? 'Assess enriched data' : `Assess ${pendingAssessments()} ${props.filters ? 'matching ' : ''}enriched results`}</button>
    </div>
    <Show when={message()}><p role="alert" class="mt-3 text-sm text-rose-800">{message()}</p></Show>
    <Show when={status.isError}><p role="alert" class="mt-3 text-sm text-rose-800">Could not load job status. <button type="button" class="underline" onClick={() => void status.refetch()}>Retry status</button></p></Show>
    <Show when={status.data}>{(job) => <p role="status" aria-live="polite" class="mt-3 text-sm">{job().status === 'running' ? processingLabel() : 'Job finished'} · {processed()}/{job().results.length} processed · {job().results.filter((result) => ['failed', 'blocked'].includes(result.status)).length} failed/blocked. Progress covers the global queue and is kept for one hour while this server stays running.</p>}</Show>
  </div>;
}
