import { createFileRoute, stripSearchParams, useRouterState, type SearchSchemaInput } from '@tanstack/solid-router';
import { createQuery } from '@tanstack/solid-query';
import { batch, createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { resultsOptions } from '../data';
import { resultsPageSchema, type ResultsPageRequest } from '../results-page';
import { defaultResultsSearch, parseResultsSearch } from '../results-search';
import { ResultEnrichment } from '../components/result-enrichment';
import { ResultLinkRanking } from '../components/result-link-ranking';
import { ResultsTable } from '../components/results-table';
import { Badge, Empty, PageHeading } from '../components/ui';

export const Route = createFileRoute('/results/')({
  validateSearch: (search: Partial<ResultsPageRequest> & SearchSchemaInput) => parseResultsSearch(search),
  search: { middlewares: [stripSearchParams(defaultResultsSearch)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(resultsOptions(deps)),
  component: AllResults,
});

function AllResults() {
  const request = Route.useSearch();
  const navigate = Route.useNavigate();
  const navigating = useRouterState({ select: (state) => state.isLoading });
  const update = (patch: Partial<ResultsPageRequest>) => void navigate({
    search: (previous) => ({ ...previous, page: 1, ...patch }),
    resetScroll: false,
  });
  const sort = () => request().sort;
  const descending = () => request().descending;
  const pageSize = () => request().pageSize;
  const countries = () => request().countries;
  const segments = () => request().segments;
  const ranking = () => request().ranking;
  const enrichment = () => request().enrichment;
  const [searchInput, setSearchInput] = createSignal(request().search);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(searchTimer));
  const updateSearch = (value: string) => {
    setSearchInput(value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => update({ search: value }), 250);
  };
  const [customHostInput, setCustomHostInput] = createSignal(request().customHost);
  let hostTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(hostTimer));
  const updateCustomHost = (value: string) => {
    setCustomHostInput(value);
    clearTimeout(hostTimer);
    hostTimer = setTimeout(() => {
      const parsed = resultsPageSchema.shape.customHost.safeParse(value);
      if (parsed.success) update({ customHost: parsed.data });
    }, 250);
  };
  const [jevMin, setJevMin] = createSignal(request().jevMin);
  const [jevMax, setJevMax] = createSignal(request().jevMax);
  let rangeTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(rangeTimer));
  const updateRange = (bound: 'min' | 'max', value: number) => {
    if (bound === 'min') setJevMin(Math.min(value, jevMax()));
    else setJevMax(Math.max(value, jevMin()));
    clearTimeout(rangeTimer);
    rangeTimer = setTimeout(() => update({ jevMin: jevMin(), jevMax: jevMax() }), 250);
  };
  createEffect(on(request, (value) => {
    clearTimeout(searchTimer);
    clearTimeout(rangeTimer);
    clearTimeout(hostTimer);
    batch(() => { setSearchInput(value.search); setCustomHostInput(value.customHost); setJevMin(value.jevMin); setJevMax(value.jevMax); });
  }));
  const [filtersOpen, setFiltersOpen] = createSignal(false);
  const activeCount = createMemo(() => Number(Boolean(searchInput().trim())) + countries().length + segments().length + Number(jevMin() > 0 || jevMax() < 100) + Number(ranking() !== 'all') + Number(enrichment() !== 'all') + Number(request().host !== 'all'));
  const data = createQuery(() => resultsOptions(request()));
  const availableCountries = createMemo(() => data.data?.countries ?? []);
  const availableSegments = createMemo(() => data.data?.segments ?? []);
  const filtered = createMemo(() => data.data?.results ?? []);
  const toggleCountry = (code: string) => update({ countries: countries().includes(code) ? countries().filter((value) => value !== code) : [...countries(), code] });
  const toggleSegment = (id: number) => update({ segments: segments().includes(id) ? segments().filter((value) => value !== id) : [...segments(), id] });
  const clear = () => {
    clearTimeout(searchTimer);
    clearTimeout(rangeTimer);
    clearTimeout(hostTimer);
    batch(() => { setSearchInput(''); setCustomHostInput(''); setJevMin(0); setJevMax(100); });
    update({ search: '', host: 'all', customHost: '', countries: [], segments: [], jevMin: 0, jevMax: 100, ranking: 'all', enrichment: 'all' });
  };
  const buttonClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

  return <>
    <PageHeading title="All search results"><Badge>{data.data?.totalCount ?? 0} unique results</Badge><Badge>{data.data?.enrichedCount ?? 0} enriched</Badge></PageHeading>
    <Show when={data.data}><ResultLinkRanking /></Show>
    <Show when={data.data}>{(response) => <ResultEnrichment results={[]} filters={request()} scopeUpdating={navigating() || data.isFetching || (request().host === 'custom' && customHostInput() !== request().customHost) || searchInput() !== request().search || jevMin() !== request().jevMin || jevMax() !== request().jevMax} counts={{ pending: response().matchedPendingCount, pendingAssessments: response().matchedPendingAssessmentCount, matched: response().matchedCount, unscraped: response().matchedUnscrapedCount, extraction: response().matchedExtractionCount }} />}</Show>
    <Show when={data.isPending}><p role="status">Loading results…</p></Show>
    <Show when={data.isError}><p role="alert">Could not load results. <button type="button" class="underline" onClick={() => void data.refetch()}>Retry</button></p></Show>
    <Show when={data.data}><Show when={data.data?.totalCount} fallback={<Empty title="No search results yet">Run a search from a segment’s Queries tab to collect results.</Empty>}>
      <div class="mb-4 rounded-xl border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center gap-2 p-3">
          <label class="min-w-0 flex-1 basis-60"><span class="sr-only">Search results</span><input type="search" value={searchInput()} onInput={(event) => updateSearch(event.currentTarget.value)} placeholder="Search title, URL, description, query…" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          <button type="button" class={buttonClass} aria-expanded={filtersOpen()} aria-controls="result-filters" onClick={() => setFiltersOpen(!filtersOpen())}>Filters <Show when={activeCount()}><span class="ml-1 rounded-full bg-teal-50 px-1.5 text-xs text-teal-800">{activeCount()} active</span></Show><span class="ml-2" aria-hidden="true">{filtersOpen() ? '▴' : '▾'}</span></button>
          <button type="button" class={buttonClass} onClick={clear} disabled={!activeCount()}>Clear filters</button>
        </div>
        <div id="result-filters" hidden={!filtersOpen()} class="space-y-4 border-t border-slate-100 p-3 sm:p-4">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label class="text-sm font-medium text-slate-700">Link host<select value={request().host} onChange={(event) => update({ host: event.currentTarget.value as ResultsPageRequest['host'] })} class="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><For each={['all', 'reddit', 'facebook', 'x', 'instagram', 'linkedin', 'youtube', 'tiktok', 'custom'] as const}>{(host) => <option value={host} selected={request().host === host}>{({ all: 'All hosts', reddit: 'Reddit', facebook: 'Facebook', x: 'X / Twitter', instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube', tiktok: 'TikTok', custom: 'Custom domain' })[host]}</option>}</For></select></label>
            <Show when={request().host === 'custom'}><label class="text-sm font-medium text-slate-700">Custom domain<input type="text" value={customHostInput()} onInput={(event) => updateCustomHost(event.currentTarget.value)} placeholder="example.com" class="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /><span class="mt-1 block text-xs font-normal text-slate-500">Domain only; includes subdomains.</span><Show when={!resultsPageSchema.shape.customHost.safeParse(customHostInput()).success}><span role="alert" class="mt-1 block text-xs text-red-700">Enter a domain such as example.com, without a URL or path.</span></Show></label></Show>
            <fieldset class="min-w-0"><legend class="mb-2 text-sm font-medium text-slate-700">Jev relevance <span class="font-normal text-teal-700">{jevMin()}–{jevMax()} / 100</span></legend>
              <div class="grid grid-cols-2 gap-3">
                <label class="text-xs text-slate-500">Minimum: {jevMin()}<input type="range" min="0" max="100" step="1" value={jevMin()} aria-label="Minimum Jev relevance" aria-valuetext={`${jevMin()} out of 100`} onInput={(event) => { updateRange('min', Number(event.currentTarget.value)); event.currentTarget.value = String(jevMin()); }} class="mt-2 block w-full accent-teal-600" /></label>
                <label class="text-xs text-slate-500">Maximum: {jevMax()}<input type="range" min="0" max="100" step="1" value={jevMax()} aria-label="Maximum Jev relevance" aria-valuetext={`${jevMax()} out of 100`} onInput={(event) => { updateRange('max', Number(event.currentTarget.value)); event.currentTarget.value = String(jevMax()); }} class="mt-2 block w-full accent-teal-600" /></label>
              </div>
              <p class="mt-2 text-xs text-slate-500">Narrowing the range includes only current scores.</p>
            </fieldset>
            <label class="text-sm font-medium text-slate-700">Ranking status<select value={ranking()} onChange={(event) => update({ ranking: event.currentTarget.value as ResultsPageRequest['ranking'] })} class="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option value="all" selected={ranking() === 'all'}>All rankings</option><option value="ranked" selected={ranking() === 'ranked'}>Current score</option><option value="unranked" selected={ranking() === 'unranked'}>No current score</option></select></label>
            <label class="text-sm font-medium text-slate-700">Enrichment status<select value={enrichment()} onChange={(event) => update({ enrichment: event.currentTarget.value as ResultsPageRequest['enrichment'] })} class="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option value="all" selected={enrichment() === 'all'}>All results</option><option value="enriched" selected={enrichment() === 'enriched'}>Enriched</option><option value="not_enriched" selected={enrichment() === 'not_enriched'}>Not enriched</option></select></label>
          </div>
          <fieldset><legend class="mb-2 text-sm font-medium text-slate-700">Countries</legend><div class="flex flex-wrap gap-2"><For each={availableCountries()}>{(code) => <label class={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${countries().includes(code) ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}><input type="checkbox" class="accent-teal-600" checked={countries().includes(code)} onChange={() => toggleCountry(code)} />{code}</label>}</For></div></fieldset>
          <fieldset><legend class="mb-2 text-sm font-medium text-slate-700">Segments</legend><div class="grid max-h-36 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3"><For each={availableSegments()}>{([id, name]) => <label class={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${segments().includes(id) ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}><input type="checkbox" class="mt-0.5 shrink-0 accent-teal-600" checked={segments().includes(id)} onChange={() => toggleSegment(id)} />{name}</label>}</For></div></fieldset>
          <p class="text-xs text-slate-500">No country or segment selection means all. Country and segment must match the same discovery.</p>
        </div>
      </div>
      <p role="status" class="mb-3 text-xs text-slate-500">Showing {filtered().length} of {data.data?.matchedCount ?? 0} matching results{data.isFetching ? ' · Updating…' : ''}</p>
      <Show when={filtered().length} fallback={<Empty title="No matching results">Try different filters or <button type="button" class="text-teal-700 underline" onClick={clear}>clear filters</button>.</Empty>}>
        <ResultsTable serverPaginated sort={sort()} descending={descending()} onSort={(column) => update({ sort: column, descending: sort() === column ? !descending() : (column === 'fit' || column === 'jev') })} results={filtered()} context="segments" caption="All saved search results with discovery countries, segments, and latest collection dates" />
      </Show>
      <Show when={data.data?.matchedCount}>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label class="flex items-center gap-2 text-sm text-slate-600">Rows per page<select class="rounded-lg border border-slate-200 bg-white px-3 py-2" value={pageSize()} onChange={(event) => update({ pageSize: Number(event.currentTarget.value) as 25 | 50 | 100 })}><For each={[25, 50, 100]}>{(size) => <option value={size} selected={pageSize() === size}>{size}</option>}</For></select></label>
          <div class="flex items-center gap-3"><button type="button" class={buttonClass} disabled={data.isFetching || (data.data?.page ?? 1) <= 1} onClick={() => update({ page: (data.data?.page ?? 1) - 1 })}>Previous</button><span class="text-sm text-slate-500">Page {data.data?.page ?? 1} of {data.data?.pageCount ?? 1}</span><button type="button" class={buttonClass} disabled={data.isFetching || (data.data?.page ?? 1) >= (data.data?.pageCount ?? 1)} onClick={() => update({ page: (data.data?.page ?? 1) + 1 })}>Next</button></div>
        </div>
      </Show>
    </Show></Show>
  </>;
}
