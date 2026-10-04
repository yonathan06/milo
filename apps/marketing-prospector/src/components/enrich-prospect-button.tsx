import { useState } from 'react'
import { useEnrichProspect } from '../mutations'

export function EnrichProspectButton({ communityId, runId }: { communityId: string; runId: string }) {
  const mutation = useEnrichProspect()
  const busy = mutation.isPending
  const [message, setMessage] = useState('')
  async function enrich() {
    setMessage('')
    try {
      const result = await mutation.mutateAsync({ communityId, runId })
      setMessage(result.status === 'failed' ? result.error ?? 'Ranking unavailable' : result.score === null ? `Needs evidence — no supported numeric fit${result.error ? `: ${result.error}` : ''}` : `Ranked ${result.score}/100 (${result.evidenceMode === 'snippet' ? 'provisional' : 'page evidence'})`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Enrichment failed') }
  }
  return <div className="min-w-36 max-w-xs">
    <button type="button" className="secondary" disabled={busy} onClick={() => void enrich()}>{busy ? 'Enriching…' : 'Enrich / retry'}</button>
    <p className="text-xs text-slate-500">Uses public sources within the shared budget.</p>
    {message && <p role="status" className="text-xs">{message}</p>}
  </div>
}
