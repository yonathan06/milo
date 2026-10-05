import { createFileRoute } from '@tanstack/solid-router';
import { createQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { resultsOptions } from '../data';
import { ResultEnrichment } from '../components/result-enrichment';
import { ResultsTable } from '../components/results-table';
import { compareMatchResults } from '../assessment-display';
import { matchesResult } from '../result-filters';
import { Badge, Empty, PageHeading } from '../components/ui';

export const Route = createFileRoute('/results/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(resultsOptions()),
  component: AllResults,
});

function AllResults() {
  const data = createQuery(resultsOptions);
  const [search, setSearch] = createSignal('');
  const [countries, setCountries] = createSignal<string[]>([]);
  const [segments, setSegments] = createSignal<number[]>([]);
  const availableCountries = createMemo(() => [...new Set((data.data ?? []).flatMap((result) => result.discoveries.map((item) => item.country_code)))].sort());
  const availableSegments = createMemo(() => [...new Map((data.data ?? []).flatMap((result) => result.discoveries.map((item) => [item.segment_id, item.segment_name] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1])));
  const filtered = createMemo(() => (data.data ?? []).filter((result) => matchesResult(result, { search: search(), countries: countries(), segments: segments() })).sort((a, b) => compareMatchResults(a, b)));
  const toggleCountry = (code: string) => { setCountries((values) => values.includes(code) ? values.filter((value) => value !== code) : [...values, code]); };
  const toggleSegment = (id: number) => { setSegments((values) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id]); };
  const clear = () => { setSearch(''); setCountries([]); setSegments([]); };
  const buttonClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

  return <>
    <PageHeading eyebrow="Research explorer" title="All search results" description="One row per saved URL across all segments. Filter by discovery countries and segments, or open a result for details and enrichment history."><Badge>{data.data?.length ?? 0} unique results</Badge><Badge>{(data.data ?? []).filter((result) => result.enriched).length} enriched</Badge></PageHeading>
    <ResultEnrichment results={data.data ?? []} />
    <Show when={data.data?.length} fallback={<Empty title="No search results yet">Run a search from a segment’s Queries tab to collect results.</Empty>}>
      <div class="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label class="block"><span class="mb-2 block text-sm font-medium text-slate-600">Search results</span><input type="search" value={search()} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Title, URL, description, query…" class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /></label>
        <fieldset><legend class="mb-2 text-sm font-medium text-slate-600">Countries</legend><div class="flex flex-wrap gap-3"><For each={availableCountries()}>{(code) => <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={countries().includes(code)} onChange={() => toggleCountry(code)} />{code}</label>}</For></div></fieldset>
        <fieldset><legend class="mb-2 text-sm font-medium text-slate-600">Segments</legend><div class="flex flex-wrap gap-3"><For each={availableSegments()}>{([id, name]) => <label class="flex items-center gap-2 text-sm"><input type="checkbox" checked={segments().includes(id)} onChange={() => toggleSegment(id)} />{name}</label>}</For></div></fieldset>
        <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-xs text-slate-500">Select any number; no selection means all. Country and segment must match the same discovery.</p><button type="button" class={buttonClass} onClick={clear} disabled={!search() && !countries().length && !segments().length}>Clear filters</button></div>
      </div>
      <p role="status" class="mb-3 text-xs text-slate-500">{filtered().length} of {data.data?.length ?? 0} results match</p>
      <Show when={filtered().length} fallback={<Empty title="No matching results">Try different filters or <button type="button" class="text-teal-700 underline" onClick={clear}>clear filters</button>.</Empty>}>
        <ResultsTable results={filtered()} context="segments" caption="All saved search results with discovery countries, segments, and latest collection dates" />
      </Show>
    </Show>
  </>;
}
