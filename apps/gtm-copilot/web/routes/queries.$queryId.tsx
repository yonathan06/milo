import { createFileRoute, Link, notFound } from '@tanstack/solid-router';
import { createQuery } from '@tanstack/solid-query';
import { For, Show } from 'solid-js';
import { parseId, queryDetailOptions } from '../data';
import { Badge, Empty, ExternalLink, PageHeading, Section } from '../components/ui';

export const Route = createFileRoute('/queries/$queryId')({
  loader: async ({ context, params }) => {
    const id = parseId(params.queryId);
    if (!Number.isFinite(id)) throw notFound();
    if (!await context.queryClient.ensureQueryData(queryDetailOptions(id))) throw notFound();
  },
  component: QueryDetail,
});
function QueryDetail() {
  const params = Route.useParams();
  const data = createQuery(() => queryDetailOptions(parseId(params().queryId)));
  return <Show when={data.data}>{(detail) => <>
    <Link to="/segments/$segmentId" params={{ segmentId: String(detail().query.segment_id) }} class="mb-6 inline-block text-sm text-teal-700 hover:underline">← {detail().query.segment_name}</Link>
    <PageHeading eyebrow="Suggested search query" title={detail().query.query} description={detail().query.rationale}><Badge>{detail().query.country_code}</Badge><Badge>{detail().query.language}</Badge><Badge>{detail().query.platform}</Badge></PageHeading>
    <Section title={`Suggested results · ${detail().results.length}`}><Show when={detail().results.length} fallback={<Empty title="No results collected yet">Select this query and run a search from the segment’s Queries tab, or use the search CLI to collect results.</Empty>}><div class="space-y-4"><For each={detail().results}>{(result) => <article class="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div class="flex gap-4"><span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-500">{result.rank}</span><div class="min-w-0 flex-1"><Link to="/results/$resultId" params={{ resultId: String(result.id) }} class="text-lg font-semibold break-words hover:text-teal-700">{result.title || result.url}</Link><p class="mt-2 text-sm leading-6 text-slate-500">{result.description || 'No description recorded.'}</p><div class="mt-3 text-xs"><ExternalLink url={result.url} /></div><p class="mt-3 text-xs text-slate-400">Collected {result.collected_at}</p></div></div>
    </article>}</For></div></Show></Section>
  </>}</Show>;
}
