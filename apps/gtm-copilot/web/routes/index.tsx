import { createFileRoute, Link } from '@tanstack/solid-router';
import { createQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { segmentsOptions } from '../data';
import { Badge, Empty, PageHeading } from '../components/ui';
import { BulkQueryGenerator } from '../components/bulk-query-generator';

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(segmentsOptions()),
  component: Segments,
});
function Segments() {
  const data = createQuery(segmentsOptions);
  const [search, setSearch] = createSignal('');
  const filtered = createMemo(() => (data.data ?? []).filter((segment) => `${segment.name} ${segment.description}`.toLowerCase().includes(search().toLowerCase())));
  return <>
    <PageHeading title="Marketing segments"><Badge>{data.data?.length ?? 0} segments</Badge><Badge>SQLite · live local data</Badge></PageHeading>
    <Show when={data.data?.length} fallback={<Empty title="No segments yet">Create segments with the existing CLI. They will appear here without changing the database from the app.</Empty>}>
      <BulkQueryGenerator missingCount={(data.data ?? []).filter((segment) => segment.query_count === 0).length} />
      <label class="mb-6 block"><span class="mb-2 block text-sm font-medium text-slate-600">Find a segment</span><input type="search" value={search()} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Search name or description…" class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm sm:max-w-md" /></label>
      <Show when={filtered().length} fallback={<Empty title="No matching segments">Try a different search.</Empty>}>
        <div class="grid gap-5 md:grid-cols-2"><For each={filtered()}>{(segment) => <Link to="/segments/$segmentId" params={{ segmentId: String(segment.id) }} class="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-teal-400 hover:shadow-sm">
          <div class="mb-3 flex items-start justify-between gap-4"><h2 class="text-xl font-semibold tracking-tight group-hover:text-teal-800">{segment.name}</h2><span class="text-teal-600" aria-hidden="true">↗</span></div>
          <p class="mb-8 line-clamp-3 text-sm leading-6 text-slate-500">{segment.description || 'No description recorded.'}</p>
          <div class="mt-auto flex flex-wrap gap-2"><Badge>{segment.country_count} countries</Badge><Badge>{segment.query_count} queries</Badge><Badge>{segment.result_count} results</Badge></div>
        </Link>}</For></div>
      </Show>
    </Show>
  </>;
}
