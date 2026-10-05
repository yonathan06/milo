import { createFileRoute, Link, notFound } from '@tanstack/solid-router';
import { createQuery } from '@tanstack/solid-query';
import { For, Show } from 'solid-js';
import { AssessmentDetails } from '../components/result-assessment';
import { ResultEnrichment } from '../components/result-enrichment';
import { extractionDisplayStatus, partitionEnrichmentData } from '../enrichment-display';
import { parseId, resultOptions } from '../data';
import { Badge, Empty, ExternalLink, JsonData, PageHeading, Section } from '../components/ui';
import type { Enrichment } from '../server/store';

export const Route = createFileRoute('/results/$resultId')({
  loader: async ({ context, params }) => {
    const id = parseId(params.resultId);
    if (!Number.isFinite(id)) throw notFound();
    if (!await context.queryClient.ensureQueryData(resultOptions(id))) throw notFound();
  },
  component: ResultDetail,
});
function ResultDetail() {
  const params = Route.useParams();
  const data = createQuery(() => resultOptions(parseId(params().resultId)));
  return <Show when={data.data}>{(detail) => <>
    <Link to="/results" class="mb-6 inline-block text-sm text-teal-700 hover:underline">← All search results</Link>
    <PageHeading eyebrow="Search result" title={detail().result.title || detail().result.url} description={detail().result.description}><Badge>Result #{detail().result.id}</Badge></PageHeading>
    <div class="rounded-xl border border-slate-200 bg-white p-5"><ExternalLink url={detail().result.url} /><p class="mt-2 text-xs text-slate-400">First recorded {detail().result.created_at}</p></div>
    <div class="mt-5"><ResultEnrichment resultId={detail().result.id} results={[detail().result]} /></div>
    <AssessmentDetails result={detail().result} attempts={detail().assessments} />
    <Section title="Discovery context"><Show when={detail().queries.length} fallback={<p class="text-sm text-slate-500">No linked queries.</p>}><div class="space-y-3"><For each={detail().queries}>{(query) => <Link to="/queries/$queryId" params={{ queryId: String(query.id) }} class="block rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-400"><p class="mb-2 text-xs text-slate-500">{query.segment_name} · {query.country_code} · {query.language} · {query.platform}</p><p class="text-sm font-medium break-words">{query.query}</p></Link>}</For></div></Show></Section>
    <Section title={`Enrichment data · ${detail().enrichments.length} attempts`}><Show when={detail().enrichments.length} fallback={<Empty title="No enrichment data yet">Use “Enrich & rank” on the Results page or the segment’s Results tab to collect community data, sources, and verification.</Empty>}>
      <For each={detail().enrichments}>{(enrichment, index) => <details open={index() === 0} class="mb-4 rounded-2xl border border-slate-200 bg-white"><summary class="rounded-2xl p-5"><span class="mr-3 font-medium">{index() === 0 ? 'Latest attempt' : `Attempt #${enrichment.id}`}</span><span class="inline-flex flex-wrap gap-2 align-middle"><Badge>{enrichment.status}</Badge><Badge>{enrichment.platform}</Badge><Badge>{enrichment.outreach_status}</Badge></span><span class="mt-2 block text-xs text-slate-400">{enrichment.scraped_at}</span></summary><EnrichmentData enrichment={enrichment} /></details>}</For>
    </Show></Section>
  </>}</Show>;
}
function EnrichmentData(props: { enrichment: Enrichment }) {
  const fields = () => partitionEnrichmentData(props.enrichment.data);
  const sourceCount = () => Array.isArray(props.enrichment.sources) ? props.enrichment.sources.length : 0;
  return <div class="border-t border-slate-100 p-5 sm:p-6">
    <Show when={props.enrichment.error}><p class="mb-6 rounded-lg bg-rose-50 p-4 text-sm break-words text-rose-800">{props.enrichment.error}</p></Show>
    <div class="mb-5 flex flex-wrap gap-2"><Badge>{sourceCount() ? `Collection succeeded · ${sourceCount()} sources` : 'No sources collected'}</Badge><Badge>{extractionDisplayStatus(props.enrichment)}</Badge></div>
    <Show when={extractionDisplayStatus(props.enrichment).startsWith('Extraction failed')}><p role="alert" class="mb-5 text-sm text-rose-800">Sources were collected, but extraction produced no evidenced facts or posts. Use “Enrich & rank” on the Results page to retry. This attempt does not count as successful enrichment.</p></Show>
    <h3 class="mb-4 font-semibold">Collected data</h3><JsonData value={fields().populated} />
    <Show when={fields().emptyCount}><details class="mt-5 rounded-xl border border-slate-200"><summary class="p-4 text-sm font-medium">Unavailable fields · {fields().emptyCount}</summary><div class="border-t border-slate-100 p-4"><JsonData value={fields().empty} /></div></details></Show>
    <For each={[
      { title: 'Sources', value: props.enrichment.sources },
      { title: 'Limitations', value: props.enrichment.limitations },
      { title: 'Verification', value: props.enrichment.verification },
      { title: 'Scrape metadata', value: props.enrichment.scrapeMetadata },
    ]}>{(section) => <details class="mt-5 rounded-xl border border-slate-200"><summary class="p-4 text-sm font-medium">{section.title}</summary><div class="border-t border-slate-100 p-4"><JsonData value={section.value} /></div></details>}</For>
    <Section title="Human outreach reviews"><Show when={props.enrichment.reviews.length} fallback={<p class="text-sm text-slate-500">No human reviews recorded. Status is informational only; this app cannot approve or send outreach.</p>}><div class="space-y-4"><For each={props.enrichment.reviews}>{(review) => <div class="rounded-lg bg-slate-50 p-4"><div class="mb-3 flex flex-wrap gap-2"><Badge>{review.decision}</Badge><Badge>{review.channel}</Badge><Badge>Permission {review.permission_confirmed ? 'confirmed' : 'not confirmed'}</Badge></div><p class="text-sm whitespace-pre-wrap">{review.notes}</p><p class="mt-2 text-xs text-slate-500">{review.reviewer} · {review.reviewed_at}</p></div>}</For></div></Show></Section>
  </div>;
}
