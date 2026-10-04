import { createFileRoute, Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, Status } from '../components/data-table'
import type { TableRecord } from '../components/data-table'
import { CommunityEvidence } from '../components/community-evidence'
import { EnrichProspectButton } from '../components/enrich-prospect-button'
import { useSuspenseQuery } from '@tanstack/react-query'
import { allProspectsOptions } from '../queries'

const columns: ColumnDef<TableRecord>[] = [
  { accessorKey: 'identity', header: 'Prospect', cell: ({ row }) => <a className="block min-w-48 max-w-xs break-words" href={String(row.original.url)} target="_blank" rel="noreferrer">{String(row.original.identity)} ↗</a> },
  { accessorKey: 'type', header: 'Type', cell: ({ getValue }) => String(getValue()).replaceAll('_', ' ') },
  { accessorKey: 'platform', header: 'Platform', cell: ({ getValue }) => String(getValue() ?? '—').replaceAll('_', ' ') },
  { accessorKey: 'country', header: 'Country', cell: ({ row, getValue }) => getValue() == null ? 'Unknown' : `${String(getValue())}${row.original.countryProvisional ? ' (unverified)' : ''}` },
  { accessorKey: 'linkedQueriesJson', header: 'Found by', cell: ({ getValue }) => {
    try { return (JSON.parse(String(getValue() ?? '[]')) as Array<{ query: string; lane: string }>).map(item => `${item.query} (${item.lane.replaceAll('_', ' ')})`).join('; ') || '—' }
    catch { return '—' }
  } },
  { accessorKey: 'communitySize', header: 'Community size', cell: ({ getValue }) => String(getValue() ?? '—') },
  { accessorKey: 'filterStatus', header: 'ICP constraints', cell: ({ getValue }) => getValue() === 'unknown' ? 'Unknown — review needed' : String(getValue() ?? 'Unknown — review needed') },
  { accessorKey: 'verificationStatus', header: 'Verification', cell: ({ row, getValue }) => <div>{getValue() === 'unverified' ? 'Unverified — search only' : String(getValue() ?? 'Unknown')}{Boolean(row.original.verificationError) && <details className="min-w-48 max-w-xs text-xs"><summary>Why unverified?</summary>{String(row.original.verificationError)}</details>}</div> },
  { accessorKey: 'coverage', header: 'Supported coverage', cell: ({ getValue }) => `${String(getValue() ?? 0)}%` },
  { accessorKey: 'permissionStatus', header: 'Promotion permission' },
  { accessorKey: 'scoringState', header: 'Scoring stage' },
  { accessorKey: 'score', header: 'Latest audience fit', cell: ({ getValue }) => <span className="font-semibold tabular-nums text-indigo-700">{String(getValue() ?? 'Not assessed')}</span> },
  { accessorKey: 'confidence', header: 'Confidence', cell: ({ row, getValue }) => row.original.score == null ? 'Not assessed' : String(getValue() ?? 'Unknown') },
  { accessorKey: 'contactability', header: 'Contactability', cell: ({ getValue }) => String(getValue() ?? 'Unknown') },
  { accessorKey: 'evidenceMode', header: 'Ranking evidence', cell: ({ getValue }) => getValue() === 'snippet' ? 'Provisional — public search/references' : getValue() === 'page' ? 'Inspected page' : 'Not assessed' },
  { id: 'enrich', header: 'Enrichment', cell: ({ row }) => <div>{row.original.communityId && (row.original.verificationStatus !== 'verified' || row.original.scoringState !== 'complete' || ['failed','deferred'].includes(String(row.original.leaderState))) ? <EnrichProspectButton communityId={String(row.original.communityId)} runId={String(row.original.runId)} /> : null}{Boolean(row.original.rankingError) && <p className="text-xs">{String(row.original.rankingError)}</p>}</div> },
  { accessorKey: 'reviewState', header: 'Review', cell: ({ getValue }) => <Status value={getValue()} /> },
  { accessorKey: 'runCount', header: 'Runs' },
  { accessorKey: 'brief', header: 'Latest run', cell: ({ row }) => row.original.runId ? <Link className="line-clamp-2 min-w-48 max-w-xs" title={String(row.original.brief)} to="/runs/$runId" params={{ runId: String(row.original.runId) }} search={{ type: '', minScore: '' }}>{String(row.original.brief)}</Link> : '—' },
]

export const Route = createFileRoute('/prospects')({
  loader: async ({ context }) => { await context.queryClient.fetchQuery(allProspectsOptions()) },
  component: ProspectsPage,
})

function ProspectsPage() {
  const prospectsQuery = useSuspenseQuery(allProspectsOptions())
  const prospects = prospectsQuery.data
  return <main>
    <h1 className="mb-6">All prospects</h1>
    <p className="mb-4 text-sm text-slate-600">Inaccessible pages can still be ranked provisionally from identity-matched public search evidence and references. Provisional scores have low confidence, unknown contactability, and unconfirmed ICP constraints. Use Enrich / retry to process saved leads without another discovery run. Search snippets are not verified page evidence.</p>
    {prospectsQuery.error && <p role="alert">Could not refresh prospects: {prospectsQuery.error.message}</p>}
    <DataTable data={prospects} columns={columns} label="All prospects" emptyMessage="No prospects" renderDetails={prospect => <CommunityEvidence value={prospect} />} />
  </main>
}
