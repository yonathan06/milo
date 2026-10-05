import { ResultEnrichment } from './result-enrichment';
import { ResultsTable } from './results-table';
import { compareMatchResults } from '../assessment-display';
import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import type { Country, SegmentResult } from '../server/store';
import { Empty, Section } from './ui';

export function SegmentResults(props: { segmentId: number; results: SegmentResult[]; countries: Country[] }) {
  const [search, setSearch] = createSignal('');
  const [country, setCountry] = createSignal('');
  createEffect(on(() => props.segmentId, () => { setSearch(''); setCountry(''); }));
  const filtered = createMemo(() => props.results.filter((result) =>
    (!country() || result.discoveries.some((item) => item.country_code === country())) &&
    `${result.title} ${result.url} ${result.description} ${result.discoveries.map((item) => item.query).join(' ')}`.toLowerCase().includes(search().toLowerCase())
  ).sort((a, b) => compareMatchResults(a, b)));
  return <Section title={`Search results · ${props.results.length}`}>
    <p class="mb-5 text-sm text-slate-500">One row per unique result discovered by this segment’s queries. Open a result to see its details and enrichment history.</p>
    <ResultEnrichment segmentId={props.segmentId} results={props.results} />
    <Show when={props.results.length} fallback={<Empty title="No search results yet">Select queries and run a search in the Queries tab to collect results for this segment.</Empty>}>
      <div class="mb-5 flex flex-wrap gap-4">
        <label class="min-w-48 flex-1"><span class="mb-2 block text-sm text-slate-600">Search results</span><input type="search" value={search()} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Title, URL, description, query…" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label>
        <label><span class="mb-2 block text-sm text-slate-600">Discovery country</span><select value={country()} onChange={(event) => setCountry(event.currentTarget.value)} class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">All countries</option><For each={props.countries}>{(item) => <option value={item.country_code}>{item.country_code}</option>}</For></select></label>
      </div>
      <p class="mb-3 text-xs text-slate-500">Showing {filtered().length} of {props.results.length} results</p>
      <Show when={filtered().length} fallback={<Empty title="No matching results">Try another country or search.</Empty>}>
        <ResultsTable results={filtered()} context="queries" caption="Unique search results for this segment, with discovery queries and collection dates" />
      </Show>
    </Show>
  </Section>;
}
