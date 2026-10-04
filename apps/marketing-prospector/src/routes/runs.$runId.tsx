import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'
import { countries, filterBrief } from '../search-filters'
import { EnrichProspectButton } from '../components/enrich-prospect-button'
import { CommunityEvidence } from '../components/community-evidence'
import { EnrichmentDetails } from '../components/enrichment-details'
import type { Enrichment } from '../server/enrichment'
import { DataTable, Status } from '../components/data-table'
import type { TableRecord } from '../components/data-table'
import type { ColumnDef } from '@tanstack/react-table'

const prospectColumns: ColumnDef<TableRecord>[] = [
  { accessorKey: 'identity', header: 'Prospect', cell: ({ row }) => <div className="min-w-48 max-w-xs"><a href={String(row.original.url)} target="_blank" rel="noreferrer">{String(row.original.identity)} ↗</a><p className="text-xs">{String(row.original.platform)}</p></div> },
  { accessorKey: 'communityType', header: 'Type', cell: ({ getValue }) => String(getValue()).replaceAll('_', ' ') },
  { accessorKey: 'verificationStatus', header: 'Verification', cell: ({ row, getValue }) => <div>{getValue() === 'unverified' ? 'Unverified — search only' : String(getValue() ?? 'Unknown')}{Boolean(row.original.verificationError) && <details className="min-w-48 max-w-xs text-xs"><summary>Why unverified?</summary>{String(row.original.verificationError)}</details>}</div> },
  { accessorKey: 'country', header: 'Country', cell: ({ row, getValue }) => getValue() == null ? 'Unknown' : `${String(getValue())}${row.original.countryProvisional ? ' (unverified)' : ''}` },
  { accessorKey: 'linkedQueriesJson', header: 'Found by', cell: ({ getValue }) => {
    try { return (JSON.parse(String(getValue() ?? '[]')) as Array<{ query: string; lane: string }>).map(item => `${item.query} (${item.lane.replaceAll('_', ' ')})`).join('; ') || '—' }
    catch { return '—' }
  } },
  { accessorKey: 'coverage', header: 'Fit coverage', cell: ({ getValue }) => `${String(getValue() ?? 0)}%` },
  { accessorKey: 'permissionStatus', header: 'Promotion permission', cell: ({ getValue }) => String(getValue() ?? 'unknown') },
  { accessorKey: 'scoringState', header: 'Scoring stage' },
  { accessorKey: 'score', header: 'Supported fit score', cell: ({ getValue }) => getValue() == null ? 'Not assessed' : <span className="font-bold tabular-nums text-indigo-700">{String(getValue())}<span className="font-normal text-slate-400"> / 100</span></span> },
  { accessorKey: 'filterStatus', header: 'ICP constraints', cell: ({ getValue }) => getValue() === 'unknown' ? 'Unknown — review needed' : String(getValue() ?? 'Unknown — review needed') },
  { accessorKey: 'audienceSize', header: 'Audience', cell: ({ getValue }) => String(getValue() ?? 'Unknown') },
  { accessorKey: 'confidence', header: 'Confidence', cell: ({ row, getValue }) => row.original.score == null ? 'Not assessed' : String(getValue() ?? 'Unknown') },
  { accessorKey: 'contactability', header: 'Contactability', cell: ({ getValue }) => String(getValue() ?? 'Unknown') },
  { accessorKey: 'evidenceMode', header: 'Ranking evidence', cell: ({ getValue }) => getValue() === 'snippet' ? 'Provisional — public search/references' : getValue() === 'page' ? 'Inspected page' : 'Not assessed' },
  { id: 'enrich', header: 'Enrichment', cell: ({ row }) => row.original.communityId && (row.original.verificationStatus !== 'verified' || row.original.scoringState !== 'complete' || ['failed','deferred'].includes(String(row.original.leaderState))) ? <EnrichProspectButton communityId={String(row.original.communityId)} runId={String(row.original.runId)} /> : null },
  { accessorKey: 'reviewState', header: 'Review', cell: ({ getValue }) => <Status value={getValue()} /> },
]
import { runDiagnosticsOptions, runProgressOptions, runProspectsOptions } from '../queries'
import { useRunData } from '../use-run-data'
import { useClearRun, usePrepareDraft, useReviewProspect, useSaveDraft, useStartResearch } from '../mutations'

export const Route = createFileRoute('/runs/$runId')({
  validateSearch: (search: Record<string, unknown>) => ({
    type: typeof search.type === 'string' ? search.type : '',
    minScore: typeof search.minScore === 'string' ? search.minScore : '',
  }),
  loaderDeps: ({ search }) => ({ type: search.type, minScore: search.minScore }),
  loader: async ({ params, deps, context }) => {
    await Promise.all([
      context.queryClient.fetchQuery(runProgressOptions(params.runId)),
      context.queryClient.fetchQuery(runProspectsOptions(params.runId, deps)),
      context.queryClient.fetchQuery(runDiagnosticsOptions(params.runId)),
    ])
  },
  component: RunPage,
})

function RunSummary({ brief, selectedCountries }: { brief: string; selectedCountries: string[] }) {
  const [queryExpanded, setQueryExpanded] = useState(false)
  const [countriesExpanded, setCountriesExpanded] = useState(false)
  const id = useId()
  const query = filterBrief(brief, { countries: [], minAudience: null, maxAudience: null })
  const queryLimit = 240
  const countryLimit = 4
  const visibleCountries = countriesExpanded ? selectedCountries : selectedCountries.slice(0, countryLimit)
  const linkClass = 'bg-transparent p-0 text-sm font-medium text-indigo-700 hover:bg-transparent hover:underline'

  return <div className="my-4 max-w-3xl">
    <p id={`${id}-query`} className="whitespace-pre-wrap break-words text-lg">{queryExpanded || query.length <= queryLimit ? query : `${query.slice(0, queryLimit).trimEnd()}…`}</p>
    {query.length > queryLimit && <button type="button" className={linkClass} aria-expanded={queryExpanded} aria-controls={`${id}-query`} onClick={() => setQueryExpanded(!queryExpanded)}>{queryExpanded ? 'Read less' : 'Read more'}</button>}
    <div id={`${id}-countries`} className="mt-3 flex flex-wrap items-center gap-2" aria-label="Countries">
      {visibleCountries.map(code => <span key={code} className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">{countries.find(country => country.code === code)?.name ?? code}</span>)}
      {selectedCountries.length === 0 && <span className="text-sm text-slate-500">Any country</span>}
      {selectedCountries.length > countryLimit && <button type="button" className={linkClass} aria-expanded={countriesExpanded} aria-controls={`${id}-countries`} onClick={() => setCountriesExpanded(!countriesExpanded)}>{countriesExpanded ? 'Show less' : `+ ${selectedCountries.length - countryLimit} more`}</button>}
    </div>
  </div>
}

function RunPage() {
  const { runId } = Route.useParams()
  const router = useRouter()
  const search = Route.useSearch()
  const { progress, prospects, diagnostics, refreshError } = useRunData(runId, search)
  const clearRun = useClearRun()
  const startResearch = useStartResearch()
  const prepareDraftMutation = usePrepareDraft()
  const saveDraftMutation = useSaveDraft()
  const reviewMutation = useReviewProspect()
  const [type, setType] = useState(search.type)
  const [minScore, setMinScore] = useState(search.minScore)
  const [error, setError] = useState('')
  const [draftText, setDraftText] = useState<Record<string, string>>({})
  const draftBusy = prepareDraftMutation.isPending
  const rerunning = startResearch.isPending
  const deleting = clearRun.isPending
  const [deleteMessage, setDeleteMessage] = useState('')

  useEffect(() => { setType(search.type); setMinScore(search.minScore) }, [search.type, search.minScore])

  async function filter() {
    setError('')
    try {
      await router.navigate({ to: '/runs/$runId', params: { runId }, search: { type, minScore }, resetScroll: false })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not filter prospects')
    }
  }

  async function deleteProspects() {
    if (!window.confirm('Delete ALL prospects from this run, including results hidden by filters? This removes this run’s evidence, scores, suggestions, and drafts. Prospects used by other runs are preserved, along with this run’s search logs and spending history. This cannot be undone.')) return
    setError('')
    setDeleteMessage('')
    try {
      const result = await clearRun.mutateAsync(runId)
      setDraftText({})
      setDeleteMessage(`Removed ${result.deleted} prospect(s) from this run.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete prospects')
    }
  }

  async function rerun() {
    setError('')
    try {
      const filters = progress.filters as { countries?: string[]; minAudience?: number | null; maxAudience?: number | null }
      const nextRun = await startResearch.mutateAsync({ input: {
        brief: String(run.brief),
        researchSettings: progress.settings,
        countries: filters.countries ?? [],
        minAudience: filters.minAudience ?? '',
        maxAudience: filters.maxAudience ?? '',
      } })
      await router.navigate({ to: '/runs/$runId', params: { runId: nextRun.id }, search: { type: '', minScore: '' } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rerun research')
    }
  }

  async function prepareDraft(prospectId: string) {
    setError('')
    try {
      await prepareDraftMutation.mutateAsync(prospectId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare an outreach draft')
    }
  }

  async function saveDraft(draftId: string, currentBody: string) {
    setError('')
    try {
      await saveDraftMutation.mutateAsync({ draftId, body: draftText[draftId] ?? currentBody })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save draft edits')
    }
  }

  async function review(prospectId: string, state: 'selected' | 'rejected' | 'pending') {
    setError('')
    try {
      await reviewMutation.mutateAsync({ prospectId, state })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update review state')
    }
  }

  const run = progress.run as Record<string, unknown>
  const rubric = progress.rubric as { criteria: Array<Record<string, unknown>>; plannedQueries: Array<Record<string, unknown>>; frozenAt: string } | null
  const queryRows = progress.queries as Array<Record<string, unknown>>
  const results = prospects as Array<Record<string, unknown>>
  const failed = diagnostics.queryFailures as Array<Record<string, unknown>>

  return (
    <main>
      <p><Link to="/">← Runs</Link></p>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1>Research run</h1><Status value={run.status} /></div>
      <RunSummary key={runId} brief={String(run.brief)} selectedCountries={(progress.filters as { countries?: string[] }).countries ?? []} />
      <p>Started: {String(run.startedAt)} · High-score threshold: {String(run.highScoreThreshold)}</p>
      <p aria-label="Frozen community settings">Community-only · Segment: {progress.settings.segment} · Audience: {progress.settings.audienceKind} · Lanes: {progress.settings.selectedLanes.join(', ')} · Public leaders: {progress.settings.discoverLeaders ? 'enabled (optional)' : 'disabled'}</p>
      {Boolean(run.cooldownUntil) && <p role="status">Inference cooldown until {String(run.cooldownUntil)}. Saved page evidence remains available for retry.</p>}
      <button type="button" className="secondary" disabled={rerunning} onClick={() => void rerun()}>{rerunning ? 'Starting rerun…' : 'Rerun research'}</button>
      <button type="button" className="secondary ml-2" disabled={deleting || draftBusy || rerunning || ['queued', 'planning', 'running'].includes(String(run.status))} onClick={() => void deleteProspects()}>{deleting ? 'Deleting…' : 'Delete all prospects'}</button>
      {deleteMessage && <p role="status">{deleteMessage}</p>}
      {Boolean(run.error) && <p role="alert">Run error: {String(run.error)}</p>}
      {run.status === 'partial' && <p>Partial describes the original research attempt. Saved-stage retries update the current stages and funnel, not that historical status.</p>}
      {rubric && <details className="panel mt-6">
        <summary>Research strategy</summary>
        <p>Saved before discovery: {rubric.frozenAt}</p>
        <ul>{rubric.criteria.map((criterion, index) => <li key={index}>{String(criterion.name)} ({String(criterion.weight)}%): {String(criterion.description)}</li>)}</ul>
        <h3>Queries</h3>
        <ul>{rubric.plannedQueries.map((query, index) => <li key={index}>{String(query.lane)}: {String(query.query)} · Saved fallbacks: {(query.fallbacks as string[]).join(' → ')}</li>)}</ul>
      </details>}
      <h2>Progress</h2>
      <div className="grid gap-4 sm:grid-cols-3" aria-live="polite">
        <div className="stat"><span className="text-3xl font-bold tabular-nums">{queryRows.length}</span><p className="text-sm">Logged queries</p></div>
        <div className="stat"><span className="text-3xl font-bold tabular-nums">{String((progress.totals as Record<string, unknown>).prospects)}</span><p className="text-sm">Prospects assessed</p></div>
        <div className="stat"><span className="text-3xl font-bold tabular-nums text-emerald-700">{String((progress.totals as Record<string, unknown>).highScoring)}</span><p className="text-sm">Above relevance threshold</p></div>
      </div>
      {queryRows.length > 0 && <details className="mt-4"><summary>Query activity</summary><ul>{queryRows.map((query) => <li key={String(query.id)}>{String(query.lane)} · {String(query.status)} · {String(query.query)}{query.diagnosticsJson ? (() => { const d = JSON.parse(String(query.diagnosticsJson)); return <small className="block">{String(query.stage)} · {d.returned ?? 0} returned · {d.newCandidates ?? 0} new candidates · {d.duplicate ?? 0} duplicates · {d.urlRejected ?? 0} URL/lane rejections · {d.triageRejected ?? 0} explicit triage rejections</small> })() : <small className="block">Result counts unavailable</small>}</li>)}</ul></details>}

      <h2>Prospects</h2>
      <p className="mb-3 text-sm text-slate-600">Community audience fit is separate from supported coverage, demand, activity and outreach readiness. Unscored needs-evidence leads are not low-fit findings. Results sort by supported relevance, then coverage; audience size is a separate constraint, never a ranking bonus.</p>
      <form className="panel mb-4 flex flex-wrap items-end gap-4" onSubmit={event => { event.preventDefault(); void filter() }}>
        <label className="mb-0 min-w-48">Type{' '}
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">All types</option>
            <option value="facebook_group">Facebook group</option>
            <option value="whatsapp_community">WhatsApp community</option>
            <option value="community">Community / public forum</option>
          </select>
        </label>{' '}
        <label>Minimum score{' '}
          <input type="number" min="0" max="100" value={minScore} onChange={(event) => setMinScore(event.target.value)} />
        </label>{' '}
        <button type="submit">Apply filters</button>
        <Link className="px-2 py-2 text-sm" to="/runs/$runId" params={{ runId }} search={{ type: '', minScore: '' }} resetScroll={false}>Clear filters</Link>
      </form>
      {error && <p role="alert">{error}</p>}
      {refreshError && <p role="alert">Could not refresh run data: {refreshError.message}</p>}
      <DataTable data={results} columns={prospectColumns} label="Prospects" emptyMessage={['queued', 'planning', 'running'].includes(String(run.status)) ? 'Researching…' : 'No prospects'} renderDetails={(prospect) => (
        <article key={String(prospect.id)}>
          <h3><a href={String(prospect.url)} target="_blank" rel="noreferrer">{String(prospect.identity)}</a></h3>
          <p>Prospect type: {String(prospect.communityType)} · Platform label: {String(prospect.platform)} · Community size: {String(prospect.communitySize ?? 'Unknown')} · Relevance score: {prospect.score == null ? 'Not assessed' : `${String(prospect.score)} / 100`} · Evidence confidence: {prospect.score == null ? 'Not assessed' : String(prospect.confidence ?? 'Unknown')} · Contactability: {String(prospect.contactability ?? 'Unknown')}</p>
          {prospect.verificationStatus === 'unverified' && <p role="status">Unverified search-only lead. Public-page evidence was not verified; any relevance score is provisional. {String(prospect.verificationError ?? '')}</p>}
          {prospect.evidenceMode === 'snippet' && <p role="status">Provisional ranking from public search/reference evidence, not verified prospect-page facts.</p>}
          {Boolean((prospect.enrichment as Record<string, unknown>)?.rankingError) && <p role="status">Enrichment: {String((prospect.enrichment as Record<string, unknown>).rankingError)}</p>}
          {prospect.filterStatus === 'unknown' && <p role="status">Country or audience size could not be verified against your constraints. This is not a confirmed match.</p>}
          <CommunityEvidence value={prospect} />
          <EnrichmentDetails value={prospect.enrichment as Partial<Enrichment>} aliases={prospect.aliases as Array<{ url: string }>} />
          <h4>Observed public-page content</h4>
          {prospect.verificationStatus === 'unverified' && <p>Any retained page observation is audit-only, not verified evidence.</p>}
          {Boolean(prospect.inspectedTitle) && <p>Inspected title: {String(prospect.inspectedTitle)}</p>}
          {Boolean(prospect.inspectedDescription) && <p>Inspected description: {String(prospect.inspectedDescription)}</p>}
          {Boolean(prospect.inspectedText) && <p>Inspected text excerpt: {String(prospect.inspectedText).slice(0, 1200)}</p>}
          <h4>Model-inferred assessment</h4>
          <p>{String(prospect.rationale ?? 'No assessment available.')}</p>
          <ul>{(prospect.dimensions as Array<Record<string, unknown>>).map((dimension, index) => <li key={index}>
            {String(dimension.name)} ({String(dimension.weight)}%): {dimension.score == null ? 'Unknown' : `${String(dimension.score)} / 100`} — {String(dimension.rationale)}
          </li>)}</ul>
          <h4>Evidence citations</h4>
          {(prospect.evidenceRefs as Array<Record<string, unknown>>).length === 0 ? <p>No evidence citations saved.</p> : <ul>
            {(prospect.evidenceRefs as Array<Record<string, unknown>>).map((ref, index) => <li key={index}>
              {String(ref.field)} quote: “{String(ref.quote)}” — <a href={String(ref.sourceUrl)} target="_blank" rel="noreferrer">source</a>
            </li>)}
          </ul>}
          <h4>Unknowns and public contact routes</h4>
          {(prospect.unknownFields as string[]).length === 0 ? <p>No listed unknowns.</p> : <ul>{(prospect.unknownFields as string[]).map((unknown, index) => <li key={index}>{unknown}</li>)}</ul>}
          {(prospect.contactRoutes as string[]).length > 0 && <ul>{(prospect.contactRoutes as string[]).map((route, index) => <li key={index}><a href={route}>{route}</a></li>)}</ul>}
          <p>Review: {String(prospect.reviewState)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={reviewMutation.isPending} onClick={() => review(String(prospect.id), 'selected')}>Select</button>{' '}
            <button type="button" disabled={reviewMutation.isPending} onClick={() => review(String(prospect.id), 'rejected')}>Reject</button>{' '}
            <button type="button" disabled={reviewMutation.isPending} onClick={() => review(String(prospect.id), 'pending')}>Reset review</button>{' '}
            {prospect.reviewState === 'selected' && Boolean(prospect.assessmentId) && prospect.verificationStatus !== 'unverified' && <button type="button" disabled={draftBusy} onClick={() => prepareDraft(String(prospect.id))}>Prepare manual outreach draft</button>}
          </div>
          <h4>Evidence sources</h4>
          <ul>{(prospect.sources as Array<Record<string, unknown>>).map((source, index) => (
            <li key={`${String(source.sourceUrl)}-${index}`}>
              <a href={String(source.sourceUrl)} target="_blank" rel="noreferrer">{String(source.sourceKind)} source</a>
              {' · observed '}{String(source.observedAt)}{' · original candidate URL '}{String(source.originalUrl)}
              {Boolean(source.query) && <p>Search query: {String(source.query)}</p>}
              {Boolean(source.summary) && <p>Search snippet: {String(source.summary)}</p>}
            </li>
          ))}</ul>
          {Boolean(prospect.messageAngle) && <p>Landing-page angle: {String(prospect.messageAngle)}{prospect.verificationWarning ? ` — ${String(prospect.verificationWarning)}` : ''}</p>}
          {Boolean(prospect.draftBlocker) && <p role="status">Outreach blocked: {String(prospect.draftBlocker)}</p>}
          {Boolean(prospect.draftBody) && <section>
            <h4>Editable manual outreach draft</h4>
            <textarea aria-label="Editable outreach draft" rows={8} maxLength={2000} value={draftText[String(prospect.draftId)] ?? String(prospect.draftBody)} onChange={(event) => setDraftText({ ...draftText, [String(prospect.draftId)]: event.target.value })} />
            <button type="button" disabled={saveDraftMutation.isPending} onClick={() => saveDraft(String(prospect.draftId), String(prospect.draftBody))}>Save draft edits</button>
            <p>{String(prospect.channelGuide)}</p>
          </section>}
        </article>
      )} />

      <details className="panel mt-8" open={failed.length > 0}>
      <summary>Diagnostics & service usage{failed.length > 0 ? ` · ${failed.length} queries need attention` : ''}</summary>
      <h2>Candidate funnel and configured limits</h2>
      <dl aria-label="Candidate funnel">{Object.entries(diagnostics.funnel ?? {}).map(([key, count]) => <div key={key}><dt className="inline">{key}: </dt><dd className="inline">{String(count ?? 0)}</dd></div>)}</dl>
      <p>Limits: {JSON.stringify(diagnostics.limits)}</p>
      <h3>Discovery versus recovery usage</h3><ul>{diagnostics.acquisition.map(item => <li key={String(item.stage)}>{String(item.stage)}: {String(item.searches)} searches, {String(item.credits ?? 0)} paid search credits</li>)}</ul>
      <details><summary>Retained candidates and rejection audit</summary><ul>{diagnostics.candidates.map(c => <li key={String(c.id)}><p>{String(c.title)} · {String(c.platform)} · {String(c.originalUrl)}</p><p>{String(c.triageStatus)} / {String(c.triageState)}: {String(c.triageReason ?? '')} · Inspection: {String(c.inspectionState)} · Recovery: {String(c.recoveryState)}</p>{Boolean(c.error) && <p>{String(c.error)}</p>}{c.triageStatus !== 'rejected' && <EnrichProspectButton communityId={String(c.communityId ?? c.id)} runId={runId} />}</li>)}</ul></details>
      <h2>Query failures</h2>
      {failed.length === 0 ? <p>No failed or skipped queries.</p> : <ul>{failed.map((item) => <li key={String(item.id)}>{String(item.lane)} · {String(item.status)}: {String(item.error ?? 'No error detail')}</li>)}</ul>}
      <h2>Monthly usage</h2>
      {(() => {
        const monthly = diagnostics.monthlyUsage as Record<string, unknown>
        const dollars = (micros: unknown) => (Number(micros) / 1_000_000).toFixed(2)
        return <p>{String(monthly.month)} · committed ${dollars(monthly.committedMicros)} / ${dollars(monthly.capMicros)} · unresolved reservations {String(monthly.unresolvedCount)} · remaining ${dollars(monthly.remainingMicros)} · {monthly.paidCallsEnabled ? 'paid calls enabled within cap' : 'paid calls disabled'}</p>
      })()}
      <p>Usage ledger rows: {(diagnostics.usage as unknown[]).length}</p>
      </details>
    </main>
  )
}
