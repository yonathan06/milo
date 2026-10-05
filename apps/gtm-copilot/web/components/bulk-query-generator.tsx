import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createSignal, For, Show } from 'solid-js';
import { bulkPlanningStatusOptions, startBulkQueryPlanning } from '../data';
import { Badge } from './ui';

export function BulkQueryGenerator(props: { missingCount: number }) {
  const client = useQueryClient();
  const status = createQuery(bulkPlanningStatusOptions);
  const [message, setMessage] = createSignal('');
  const mutation = createMutation(() => ({
    mutationFn: () => startBulkQueryPlanning(),
    onSuccess: (response) => {
      setMessage(response.error ?? '');
      if (response.job) client.setQueryData(['bulk-query-planning'], response.job);
      else void status.refetch();
    },
    onError: () => {
      setMessage('Could not confirm that planning started. Refresh the status before retrying.');
      void status.refetch();
    },
  }));
  const busy = () => mutation.isPending || status.data?.status === 'running';
  let lastProgress = '';
  createEffect(() => {
    const job = status.data;
    if (!job) return;
    const signature = JSON.stringify(job);
    if (signature === lastProgress) return;
    lastProgress = signature;
    void client.invalidateQueries({ queryKey: ['segments'] });
    void client.invalidateQueries({ queryKey: ['segment'] });
    void client.invalidateQueries({ queryKey: ['query-planning'] });
  });
  return <section class="mb-6 rounded-2xl border border-teal-200 bg-white p-5 sm:p-6" aria-label="Bulk query planning">
    <button type="button" disabled={busy() || status.isPending || status.isError || !props.missingCount} onClick={() => { setMessage(''); mutation.mutate(); }} class="rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">{busy() ? 'Planning queries…' : `Plan queries for all segments without queries (${props.missingCount})`}</button>
    <p class="mt-3 text-xs leading-5 text-slate-500">Plans all assigned countries using default languages and 20 queries per language. Segments run sequentially; segments with existing queries are skipped, regardless of the search filter. Uses OpenRouter credits; does not run searches.</p>
    <Show when={message()}><p role="alert" class="mt-4 text-sm text-rose-800">{message()}</p></Show>
    <Show when={status.isError}><p role="alert" class="mt-4 text-sm text-rose-800">Could not load planning status. <button type="button" class="underline" onClick={() => void status.refetch()}>Retry status</button>.</p></Show>
    <Show when={status.data}>{(job) => <div class="mt-4 border-t border-slate-200 pt-4">
      <p role="status" aria-live="polite" class="text-sm font-medium">{job().status === 'running' ? 'Planning' : 'Planning finished'} · {job().segments.filter((segment) => !['queued', 'running'].includes(segment.status)).length}/{job().segments.length} segments processed · {job().segments.reduce((total, segment) => total + segment.savedCount, 0)} queries saved</p>
      <ul class="mt-3 space-y-2"><For each={job().segments}>{(segment) => <li class="rounded-lg bg-slate-50 p-3 text-sm"><span class="mr-2 font-medium">{segment.name}</span><Badge>{segment.status}</Badge><Show when={segment.error}><p class="mt-2 text-xs text-rose-700">{segment.error} Open the segment to retry failed countries.</p></Show></li>}</For></ul>
      <p class="mt-3 text-xs text-slate-400">You can leave this page while the server stays running. Saved queries remain in SQLite; progress is retained for one hour.</p>
    </div>}</Show>
  </section>;
}
