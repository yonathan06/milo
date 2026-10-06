import { createFileRoute } from '@tanstack/solid-router';
import { createQuery } from '@tanstack/solid-query';
import { batch, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { resultsOptions } from '../data';
import type { ResultsPageRequest } from '../results-page';
import { ResultEnrichment } from '../components/result-enrichment';
import { ResultLinkRanking } from '../components/result-link-ranking';
import { ResultsTable } from '../components/results-table';
import { Badge, Empty, PageHeading } from '../components/ui';

export const Route = createFileRoute('/results/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(resultsOptions()),
  component: AllResults,
});

function AllResults() {
  const [sort, setSort] = createSignal<ResultsPageRequest['sort']>('fit');
  const [descending, setDescending] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [pageSize, setPageSize] = createSignal<25 | 50 | 100>(25);
  const [search, setSearch] = createSignal('');
  const [searchInput, setSearchInput] = createSignal('');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(searchTimer));
  const updateSearch = (value: string) => {
    setSearchInput(value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => batch(() => { setPage(1); setSearch(value); }), 250);
  };
  const [countries, setCountries] = createSignal<string[]>([]);
  const [segments, setSegments] = createSignal<number[]>([]);
  const data = createQuery(() => resultsOptions({ page: page(), pageSize: pageSize(), sort: sort(), descending: descending(), search: search(), countries: countries(), segments: segments() }));
  const availableCountries = createMemo(() => data.data?.countries ?? []);
  const availableSegments = createMemo(() => data.data?.segments ?? []);
  const filtered = createMemo(() => data.data?.results ?? []);
  const toggleCountry = (code: string) => { setPage(1); setCountries((values) => values.includes(code) ? values.filter((value) => value !== code) : [...values, code]); };
  const toggleSegment = (id: number) => { setPage(1); setSegments((values) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id]); };
  const clear = () => {
    clearTimeout(searchTimer);
    batch(() => { setPage(1); setSearchInput(''); setSearch(''); setCountries([]); setSegments([]); });
  };
  const buttonClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

  return <>
    <PageHeading title="All search results"><Badge>{data.data?.totalCount ?? 0} unique results</Badge><Badge>{data.data?.enrichedCount ?? 0} enriched</Badge></PageHeading>
    <Show when={data.data}><ResultLinkRanking /></Show>
    <Show when={data.data}>{(response) => <ResultEnrichment results={[]} counts={{ pending: response().pendingCount, pendingAssessments: response().pendingAssessmentCount }} />}</Show>
    <Show when={data.isPending}><p role="status">Loading results…</p></Show>
    <Show when={data.isError}><p role="alert">Could not load results. <button type="button" class="underline" onClick={() => void data.refetch()}>Retry</button></p></Show>
    <Show when={data.data}><Show when={data.data?.totalCount} fallback={<Empty title="No search results yet">Run a search from a segment’s Queries tab to collect results.</Empty>}>
      <div class="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label class="block"><span class="mb-2 block text-sm font-medium text-slate-600">Search results</span><input type="search" value={searchInput()} onInput={(event) => updateSearch(event.currentTarget.value)} placeholder="Title, URL, description, query…" class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <fieldset><legend class="mb-2 text-sm font-medium text-slate-600">Countries</legend><div class="flex flex-wrap gap-3"><For each={availableCountries()}>{(code) => <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={countries().includes(code)} onChange={() => toggleCountry(code)} />{code}</label>}</For></div></fieldset>
        <fieldset><legend class="mb-2 text-sm font-medium text-slate-600">Segments</legend><div class="flex flex-wrap gap-3"><For each={availableSegments()}>{([id, name]) => <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={segments().includes(id)} onChange={() => toggleSegment(id)} />{name}</label>}</For></div></fieldset>
        <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-slate-500">Select any number; no selection means all. Country and segment must match the same discovery.</p><button type="button" class={buttonClass} onClick={clear} disabled={!searchInput() && !countries().length && !segments().length}>Clear filters</button></div>
      </div>
      <p role="status" class="mb-3 text-xs text-slate-500">{data.data?.matchedCount ?? 0} of {data.data?.totalCount ?? 0} results match{data.isFetching ? ' · Updating…' : ''}</p>
      <Show when={filtered().length} fallback={<Empty title="No matching results">Try different filters or <button type="button" class="text-teal-700 underline" onClick={clear}>clear filters</button>.</Empty>}>
        <ResultsTable serverPaginated sort={sort()} descending={descending()} onSort={(column) => { setPage(1); setDescending(sort() === column ? !descending() : column === 'fit'); setSort(column); }} results={filtered()} context="segments" caption="All saved search results with discovery countries, segments, and latest collection dates" />
      </Show>
      <Show when={data.data?.matchedCount}>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label class="flex items-center gap-2 text-sm text-slate-600">Rows per page<select class="rounded-lg border border-slate-200 bg-white px-3 py-2" value={pageSize()} onChange={(event) => { setPage(1); setPageSize(Number(event.currentTarget.value) as 25 | 50 | 100); }}><For each={[25, 50, 100]}>{(size) => <option value={size}>{size}</option>}</For></select></label>
          <div class="flex items-center gap-3"><button type="button" class={buttonClass} disabled={data.isFetching || (data.data?.page ?? 1) <= 1} onClick={() => setPage((data.data?.page ?? 1) - 1)}>Previous</button><span class="text-sm text-slate-500">Page {data.data?.page ?? 1} of {data.data?.pageCount ?? 1}</span><button type="button" class={buttonClass} disabled={data.isFetching || (data.data?.page ?? 1) >= (data.data?.pageCount ?? 1)} onClick={() => setPage((data.data?.page ?? 1) + 1)}>Next</button></div>
        </div>
      </Show>
    </Show></Show>
  </>;
}
