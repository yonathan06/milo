import { Link } from '@tanstack/solid-router';
import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { searchStatusOptions, startQuerySearch } from '../data';
import type { Query } from '../server/store';
import { Badge, Empty } from './ui';

export function QuerySearch(props: { segmentId: number; queries: Query[]; visibleQueries: Query[] }) {
  const client = useQueryClient();
  const status = createQuery(() => searchStatusOptions(props.segmentId));
  const [selected, setSelected] = createSignal<number[]>([]);
  const [message, setMessage] = createSignal('');
  const selection = createMemo(() => selected().filter((id) => props.queries.some((query) => query.id === id)));
  const allVisibleSelected = () => props.visibleQueries.length > 0 && props.visibleQueries.every((query) => selection().includes(query.id));
  const progress = createMemo(() => new Map(status.data?.queries.map((query) => [query.queryId, query]) ?? []));
  const mutation = createMutation(() => ({
    mutationFn: (input: { segmentId: number; queryIds: number[] }) => startQuerySearch({ data: input }),
    onSuccess: (response, input) => {
      if (input.segmentId !== props.segmentId) return;
      if (response.error) { setMessage(response.error); void status.refetch(); }
      else { setMessage(''); client.setQueryData(['query-search', input.segmentId], response.job); }
    },
    onError: () => {
      setMessage('Could not confirm that search started. Refresh the search status before trying again.');
      void status.refetch();
    },
  }));
  const busy = () => mutation.isPending || status.data?.status === 'running';
  let lastProgress = '';
  createEffect(on(() => props.segmentId, () => { setSelected([]); setMessage(''); lastProgress = ''; }));
  createEffect(() => {
    const job = status.data;
    if (!job) return;
    const finished = job.queries.filter((query) => query.status === 'complete' || query.status === 'failed').length;
    const signature = `${job.id}:${finished}:${job.status}`;
    if (signature !== lastProgress && (finished > 0 || job.status === 'complete')) {
      lastProgress = signature;
      void client.invalidateQueries({ queryKey: ['segment', props.segmentId] });
      void client.invalidateQueries({ queryKey: ['segments'] });
      void client.invalidateQueries({ queryKey: ['query'] });
    }
  });
  function toggleAll(checked: boolean) {
    const visible = props.visibleQueries.map((query) => query.id);
    setSelected((ids) => checked ? [...new Set([...ids, ...visible])] : ids.filter((id) => !visible.includes(id)));
  }
  return <>
    <div class="mb-5 rounded-xl border border-teal-200 bg-white p-4">
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={allVisibleSelected()} ref={(element) => createEffect(() => { element.indeterminate = !allVisibleSelected() && props.visibleQueries.some((query) => selection().includes(query.id)); })} disabled={busy() || !props.visibleQueries.length} onChange={(event) => toggleAll(event.currentTarget.checked)} />Select all {props.visibleQueries.length === props.queries.length ? 'queries' : 'matching queries'} ({props.visibleQueries.length})</label>
        <span class="text-sm text-slate-500">{selection().length} selected</span>
        <button type="button" disabled={busy() || !selection().length} onClick={() => setSelected([])} class="text-sm text-teal-700 underline disabled:opacity-50">Clear selection</button>
        <button type="button" disabled={busy() || status.isPending || status.isError || !selection().length} onClick={() => { setMessage(''); mutation.mutate({ segmentId: props.segmentId, queryIds: selection() }); }} class="rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">{busy() ? 'Searching…' : `Run search for ${selection().length} ${selection().length === 1 ? 'query' : 'queries'}`}</button>
      </div>
      <p class="mt-3 text-xs text-slate-500">Uses your server’s Brave API key and search quota. Queries run sequentially and save up to 50 results each. Selections are kept when filters change.</p>
      <Show when={message()}><p role="alert" class="mt-3 text-sm text-rose-800">{message()}</p></Show>
      <Show when={status.isError}><p role="alert" class="mt-3 text-sm text-rose-800">Could not load search status. <button type="button" class="underline" onClick={() => void status.refetch()}>Retry status</button> before starting a search.</p></Show>
      <Show when={status.data}>{(job) => <>
        <p role="status" aria-live="polite" class="mt-4 text-sm font-medium">{job().status === 'running' ? 'Searching' : 'Search finished'} · {job().queries.filter((query) => query.status === 'complete' || query.status === 'failed').length}/{job().queries.length} queries processed · {job().queries.reduce((total, query) => total + query.resultCount, 0)} results fetched{job().queries.some((query) => query.status === 'failed') ? ' · Some queries failed; select them to retry.' : ''}</p>
        <p class="mt-2 text-xs text-slate-400">You can leave and return while the server stays running. Results persist; progress is kept in memory for one hour.</p>
      </>}</Show>
    </div>
    <Show when={props.visibleQueries.length} fallback={<Empty title="No matching queries">Try another country or search.</Empty>}>
      <div class="space-y-3"><For each={props.visibleQueries}>{(query) => <div class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 transition hover:border-teal-400">
        <input type="checkbox" aria-label={`Select query: ${query.query}`} class="mt-1" checked={selection().includes(query.id)} disabled={busy()} onChange={(event) => setSelected((ids) => event.currentTarget.checked ? [...new Set([...ids, query.id])] : ids.filter((id) => id !== query.id))} />
        <div class="min-w-0 flex-1"><Link to="/queries/$queryId" params={{ queryId: String(query.id) }} class="block"><div class="mb-3 flex flex-wrap gap-2"><Badge>{query.country_code}</Badge><Badge>{query.language}</Badge><Badge>{query.platform}</Badge><Badge>{query.result_count} results</Badge><Show when={progress().get(query.id)}>{(item) => <Badge>{item().status}</Badge>}</Show></div><h3 class="font-medium break-words">{query.query}</h3><p class="mt-2 text-sm leading-6 text-slate-500">{query.rationale}</p></Link><Show when={progress().get(query.id)?.error}>{(error) => <p class="mt-2 text-xs text-rose-700">{error()}</p>}</Show></div>
      </div>}</For></div>
    </Show>
  </>;
}
