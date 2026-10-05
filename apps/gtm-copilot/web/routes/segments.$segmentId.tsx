import { createFileRoute, Link, notFound } from '@tanstack/solid-router';
import { createQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { parseId, segmentOptions } from '../data';
import { Badge, Empty, PageHeading, Section } from '../components/ui';
import { QueryGenerator } from '../components/query-generator';
import { QuerySearch } from '../components/query-search';
import { SegmentResults } from '../components/segment-results';

export const Route = createFileRoute('/segments/$segmentId')({
  loader: async ({ context, params }) => {
    const id = parseId(params.segmentId);
    if (!Number.isFinite(id)) throw notFound();
    const data = await context.queryClient.ensureQueryData(segmentOptions(id));
    if (!data) throw notFound();
  },
  component: Segment,
});
function Segment() {
  const params = Route.useParams();
  const data = createQuery(() => segmentOptions(parseId(params().segmentId)));
  const [country, setCountry] = createSignal('');
  const [search, setSearch] = createSignal('');
  const [tab, setTab] = createSignal<'queries' | 'results'>('queries');
  createEffect(on(() => params().segmentId, () => { setTab('queries'); setCountry(''); setSearch(''); }));
  function handleTabKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'queries' : event.key === 'End' ? 'results' : tab() === 'queries' ? 'results' : 'queries';
    setTab(next);
    document.getElementById(`segment-tab-${next}`)?.focus();
  }
  const filtered = createMemo(() => (data.data?.queries ?? []).filter((query) => (!country() || query.country_code === country()) && `${query.query} ${query.platform} ${query.language} ${query.rationale}`.toLowerCase().includes(search().toLowerCase())));
  return <Show when={data.data}>{(detail) => <>
    <Link to="/" class="mb-6 inline-block text-sm text-teal-700 hover:underline">← All segments</Link>
    <PageHeading eyebrow="Marketing segment" title={detail().segment.name} description={detail().segment.description}><Badge>{detail().countries.length} countries</Badge><Badge>{detail().queries.length} suggested queries</Badge><Badge>{detail().results.length} search results</Badge></PageHeading>
    <Section title="Countries"><Show when={detail().countries.length} fallback={<p class="text-sm text-slate-500">No countries assigned.</p>}><div class="flex flex-wrap gap-2"><For each={detail().countries}>{(item) => <Badge>{item.country_code}</Badge>}</For></div></Show></Section>
    <div role="tablist" aria-label="Segment workspace" onKeyDown={handleTabKey} class="mt-8 flex gap-2 border-b border-slate-200">
      <button type="button" role="tab" id="segment-tab-queries" aria-controls="segment-panel-queries" aria-selected={tab() === 'queries'} tabIndex={tab() === 'queries' ? 0 : -1} onClick={() => setTab('queries')} class={`border-b-2 px-4 py-3 text-sm font-semibold ${tab() === 'queries' ? 'border-teal-700 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Queries ({detail().queries.length})</button>
      <button type="button" role="tab" id="segment-tab-results" aria-controls="segment-panel-results" aria-selected={tab() === 'results'} tabIndex={tab() === 'results' ? 0 : -1} onClick={() => setTab('results')} class={`border-b-2 px-4 py-3 text-sm font-semibold ${tab() === 'results' ? 'border-teal-700 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Search results ({detail().results.length})</button>
    </div>
    <div role="tabpanel" id="segment-panel-queries" aria-labelledby="segment-tab-queries" hidden={tab() !== 'queries'} tabIndex={0}>
    <div class="mt-8"><QueryGenerator segmentId={detail().segment.id} countries={detail().countries} /></div>
    <Section title="Suggested queries">
      <Show when={detail().queries.length} fallback={<Empty title="No suggested queries yet">Select countries above and generate queries, or use the query planner CLI.</Empty>}>
        <div class="mb-5 flex flex-wrap gap-4"><label class="flex-1"><span class="mb-2 block text-sm text-slate-600">Search queries</span><input type="search" value={search()} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Query, platform, language…" class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" /></label><label><span class="mb-2 block text-sm text-slate-600">Country</span><select value={country()} onChange={(event) => setCountry(event.currentTarget.value)} class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">All countries</option><For each={detail().countries}>{(item) => <option value={item.country_code}>{item.country_code}</option>}</For></select></label></div>
        <QuerySearch segmentId={detail().segment.id} queries={detail().queries} visibleQueries={filtered()} />
      </Show>
    </Section>
    </div>
    <div role="tabpanel" id="segment-panel-results" aria-labelledby="segment-tab-results" hidden={tab() !== 'results'} tabIndex={0}>
      <SegmentResults segmentId={detail().segment.id} results={detail().results} countries={detail().countries} />
    </div>
  </>}</Show>;
}
