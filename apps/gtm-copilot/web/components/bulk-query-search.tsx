import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createSignal, Show } from 'solid-js';
import { bulkSearchStatusOptions, startBulkQuerySearch } from '../data';

export function BulkQuerySearch(props: { unsearchedCount: number }) {
  const client = useQueryClient();
  const status = createQuery(bulkSearchStatusOptions);
  const [message, setMessage] = createSignal('');
  const mutation = createMutation(() => ({
    mutationFn: () => startBulkQuerySearch(),
    onSuccess: (response) => {
      setMessage(response.error ?? '');
      if (response.job) client.setQueryData(['bulk-query-search'], response.job);
      else void status.refetch();
    },
    onError: () => { setMessage('Could not confirm that search started. Refresh status before retrying.'); void status.refetch(); },
  }));
  const busy = () => mutation.isPending || status.data?.status === 'running';
  let lastProgress = '';
  createEffect(() => {
    const job = status.data;
    if (!job) return;
    const finished = job.queries.filter((query) => !['queued', 'running'].includes(query.status)).length;
    const signature = `${job.id}:${finished}:${job.status}`;
    if (signature === lastProgress || (!finished && job.status === 'running')) return;
    lastProgress = signature;
    for (const key of ['segments', 'segment', 'query', 'results']) void client.invalidateQueries({ queryKey: [key] });
  });
  return <section class="mb-6 rounded-2xl border border-teal-200 bg-white p-5 sm:p-6" aria-label="Bulk query search">
    <button type="button" disabled={busy() || status.isPending || status.isError || !props.unsearchedCount} onClick={() => { setMessage(''); mutation.mutate(); }} class="rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">{busy() ? 'Searching…' : `Search all unsearched queries (${props.unsearchedCount})`}</button>
    <p class="mt-3 text-xs text-slate-500">Across all segments, regardless of filters. Uses Brave API quota; searches run sequentially.</p>
    <Show when={message()}><p role="alert" class="mt-3 text-sm text-rose-800">{message()}</p></Show>
    <Show when={status.isError}><p role="alert" class="mt-3 text-sm text-rose-800">Could not load search status. <button type="button" class="underline" onClick={() => void status.refetch()}>Retry status</button></p></Show>
    <Show when={status.data}>{(job) => <p role="status" aria-live="polite" class="mt-4 text-sm">{job().status === 'running' ? 'Searching' : 'Search finished'} · {job().queries.filter((query) => !['queued', 'running'].includes(query.status)).length}/{job().queries.length} queries processed · {job().queries.reduce((total, query) => total + query.resultCount, 0)} results fetched{job().queries.some((query) => query.status === 'failed') ? ' · Some queries failed; run again to retry.' : ''}</p>}</Show>
  </section>;
}
