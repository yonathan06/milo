import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { CommunityControls } from '../components/community-controls'
import { communityPresets } from '../community-presets'
import { CountryPicker } from '../components/country-picker'
import { ClearRunButton } from '../components/clear-run-button'
import type { FormEvent } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { runsOptions } from '../queries'
import { useStartResearch } from '../mutations'
import { DataTable, Status } from '../components/data-table'
import type { TableRecord } from '../components/data-table'
import type { ColumnDef } from '@tanstack/react-table'

const runColumns: ColumnDef<TableRecord>[] = [
  { accessorKey: 'brief', header: 'Audience brief', cell: ({ row }) => <Link className="block min-w-48 max-w-xl" to="/runs/$runId" params={{ runId: String(row.original.id) }} search={{ type: '', minScore: '' }}>{String(row.original.brief)}</Link> },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Status value={getValue()} /> },
  { accessorFn: row => Number(row.prospectCount), id: 'prospects', header: 'Prospects' },
  { accessorFn: row => Number(row.failedQueryCount), id: 'failures', header: 'Query failures' },
  { id: 'actions', header: 'Actions', enableSorting: false, cell: ({ row }) => <ClearRunButton runId={String(row.original.id)} status={String(row.original.status)} /> },
]

export const Route = createFileRoute('/')({
  loader: async ({ context }) => { await context.queryClient.fetchQuery(runsOptions()) },
  component: Home,
})

function Home() {
  const runsQuery = useSuspenseQuery(runsOptions())
  const runs = runsQuery.data
  const navigate = useNavigate()
  const startResearch = useStartResearch()
  const [brief, setBrief] = useState(communityPresets[0]!.brief)
  const [researchSettings, setResearchSettings] = useState(communityPresets[0]!.settings)
  const [countries, setCountries] = useState<string[]>([])
  const [minAudience, setMinAudience] = useState('')
  const [maxAudience, setMaxAudience] = useState('')
  const [error, setError] = useState('')
  const submitting = startResearch.isPending

  async function startRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      const run = await startResearch.mutateAsync({ input: { brief, researchSettings, countries, minAudience, maxAudience } })
      setBrief('')
      await navigate({ to: '/runs/$runId', params: { runId: run.id }, search: { type: '', minScore: '' } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create research run')
    }
  }

  return (
    <main>
      <h1>Research</h1>
      <div className="mt-6">
        <form className="panel" onSubmit={startRun} aria-busy={submitting}>
          <h2 className="mt-0">New community research</h2>
          <CommunityControls settings={researchSettings} onChange={setResearchSettings} onBrief={setBrief} />
          <label className="sr-only" htmlFor="brief">Audience brief</label>
          <textarea className="mb-4" id="brief" placeholder="Audience brief" value={brief} onChange={(event) => setBrief(event.target.value)} rows={3} required />
          <div className="mb-4 flex flex-wrap gap-4">
            <CountryPicker value={countries} onChange={setCountries} />
            <label>Minimum audience size<input type="number" min="0" step="1" value={minAudience} onChange={event => setMinAudience(event.target.value)} placeholder="No minimum" /></label>
            <label>Maximum audience size<input type="number" min={minAudience || '0'} step="1" value={maxAudience} onChange={event => setMaxAudience(event.target.value)} placeholder="No maximum" /></label>
          </div>
          <p className="mb-4 text-sm">Known nonmatches are excluded from qualification. Unknown country or audience size is flagged for review.</p>
          <button type="submit" disabled={submitting || !brief.trim() || researchSettings.selectedLanes.length === 0}>{submitting ? 'Starting…' : 'Start research →'}</button>
        </form>
      </div>
      {error && <p role="alert">{error}</p>}
      <h2>Research runs</h2>
      {runsQuery.error && <p role="alert">Could not refresh runs: {runsQuery.error.message}</p>}
      <DataTable data={runs} columns={runColumns} label="Research runs" emptyMessage="No runs" />
    </main>
  )
}
