import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createSignal, Show } from 'solid-js';
import { enrichmentStatusOptions, startResultAssessment, startResultEnrichment } from '../data';
import type { Result } from '../server/store';

export function ResultEnrichment(props: { segmentId?: number; resultId?: number; results: Result[] }) {
  const client = useQueryClient();
  const status = createQuery(enrichmentStatusOptions);
  const [message, setMessage] = createSignal('');
  const scoped = () => props.results.filter((result) => props.resultId === undefined || result.id === props.resultId);
  const pending = () => scoped().filter((result) => result.assessment_status !== 'complete').length;
  const pendingAssessments = () => scoped().filter((result) => result.assessment_ready && result.assessment_status !== 'complete').length;
  const canReassess = () => props.resultId !== undefined && scoped().some((result) => result.assessment_ready && result.assessment_status === 'complete');
  const mutation = createMutation(() => ({
    mutationFn: (request: { mode: 'enrichment' | 'assessment'; force?: boolean }) => {
      const data = { segmentId: props.segmentId, resultId: props.resultId, force: request.force };
      return request.mode === 'assessment' ? startResultAssessment({ data }) : startResultEnrichment({ data });
    },
    onSuccess: (response) => { setMessage(response.error ?? ''); if (response.job) client.setQueryData(['result-enrichment'], response.job); else void status.refetch(); },
    onError: () => { setMessage('Could not confirm the job started. Refresh status before retrying.'); void status.refetch(); },
  }));
  const busy = () => mutation.isPending || status.data?.status === 'running';
  const unavailable = () => busy() || status.isPending || status.isError;
  const processed = () => status.data?.results.filter((result) => !['queued', 'running'].includes(result.status)).length ?? 0;
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
      <button type="button" class={buttonClass} disabled={unavailable() || !pending()} onClick={() => { setMessage(''); mutation.mutate({ mode: 'enrichment' }); }}>{busy() ? 'Processing…' : props.resultId !== undefined ? (pending() ? 'Enrich & assess this result' : 'Result assessed') : `Enrich & assess ${pending()} pending results`}</button>
      <button type="button" class={buttonClass} disabled={unavailable() || (!pendingAssessments() && !canReassess())} onClick={() => { setMessage(''); mutation.mutate({ mode: 'assessment', force: canReassess() }); }}>{canReassess() ? 'Reassess saved sources' : props.resultId !== undefined ? 'Assess saved sources' : `Assess ${pendingAssessments()} enriched results`}</button>
    </div>
    <p class="mt-3 text-xs text-slate-500">{props.resultId !== undefined ? 'Processes only this result.' : `Processes all ${props.segmentId ? 'segment' : 'saved'} results, regardless of filters or pagination.`} Current assessments are skipped. Existing meaningful enrichment is reused; assessment-only work never scrapes. Uses server providers and OpenRouter quota (charges may apply). Match score and permissions are independent; human review is required and nothing is sent.</p>
    <Show when={message()}><p role="alert" class="mt-3 text-sm text-rose-800">{message()}</p></Show>
    <Show when={status.isError}><p role="alert" class="mt-3 text-sm text-rose-800">Could not load job status. <button type="button" class="underline" onClick={() => void status.refetch()}>Retry status</button></p></Show>
    <Show when={status.data}>{(job) => <p role="status" aria-live="polite" class="mt-3 text-sm">{job().status === 'running' ? `Processing ${job().results.find((result) => result.status === 'running')?.phase ?? 'queue'}` : 'Job finished'} · {processed()}/{job().results.length} processed · {job().results.filter((result) => ['failed', 'blocked'].includes(result.status)).length} failed/blocked. Progress covers the global queue and is kept for one hour while this server stays running.</p>}</Show>
  </div>;
}
