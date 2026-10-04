import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { countries as countryOptions } from '../search-filters'
import { useSuspenseQuery } from '@tanstack/react-query'
import { suggestedQueriesOptions } from '../queries'
import { useStartResearch } from '../mutations'
import { Status } from '../components/data-table'

export const Route = createFileRoute('/suggested-queries')({
  loader: async ({ context }) => { await context.queryClient.fetchQuery(suggestedQueriesOptions()) },
  component: SuggestedQueriesPage,
})

function SuggestedQueriesPage() {
  const queriesQuery = useSuspenseQuery(suggestedQueriesOptions())
  const queries = queriesQuery.data
  const navigate = useNavigate()
  const startResearch = useStartResearch()
  const [error, setError] = useState('')
  const [runningQuery, setRunningQuery] = useState('')

  async function runQuery(query: (typeof queries)[number]) {
    setError('')
    setRunningQuery(query.id)
    try {
      const selectedCountries = query.countries.map(name => countryOptions.find(country => country.name === name)?.code).filter((code): code is string => Boolean(code))
      if (selectedCountries.length !== query.countries.length) throw new Error('A saved country is not supported by the country filter')
      const run = await startResearch.mutateAsync({ input: { brief: query.brief, researchSettings: query.researchSettings, countries: selectedCountries, minAudience: '', maxAudience: '' }, suggestedId: query.id })
      await navigate({ to: '/runs/$runId', params: { runId: run.id }, search: { type: '', minScore: '' } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start query')
    } finally {
      setRunningQuery('')
    }
  }

  return <main>
    <h1>Suggested queries</h1>
    <p className="mb-6">Start community research from an event/audience preset. To edit its brief, use the matching editable preset on Research.</p>
    {error && <p role="alert">{error}</p>}
    {queriesQuery.error && <p role="alert">Could not refresh suggested queries: {queriesQuery.error.message}</p>}
    {queries.length ? <div className="panel overflow-x-auto" aria-busy={Boolean(runningQuery)}>
      <table className="w-full text-left" aria-label="Suggested queries">
        <thead><tr><th className="p-2">Query</th><th className="p-2">Countries</th><th className="p-2">Status</th><th className="p-2"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{queries.map(query => <tr key={query.id} className="border-t">
          <td className="p-2"><strong>{query.title}</strong><p className="max-w-2xl text-sm">{query.brief}</p></td>
          <td className="p-2 text-sm">{query.countries.join(', ') || 'Any country'}</td>
          <td className="p-2"><Status value={query.status} /></td>
          <td className="p-2"><button type="button" disabled={Boolean(runningQuery) || query.status === 'running'} onClick={() => void runQuery(query)}>{runningQuery === query.id ? 'Starting…' : 'Run'}</button></td>
        </tr>)}</tbody>
      </table>
    </div> : <p>No suggested queries.</p>}
  </main>
}
