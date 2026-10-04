import { useState } from 'react'
import { useClearRun } from '../mutations'

export function ClearRunButton({ runId, status }: { runId: string; status: string }) {
  const mutation = useClearRun()
  const busy = mutation.isPending
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const active = ['queued', 'running'].includes(status)

  async function clear() {
    if (!window.confirm(`Clear all results and prospects for run ${runId}? This removes its evidence, scores, suggestions, and drafts. Prospects shared with other runs are preserved. The run, search logs, and spending history remain. This cannot be undone.`)) return
    setMessage('')
    setError('')
    try {
      const result = await mutation.mutateAsync(runId)
      setMessage(`Removed ${result.deleted} prospect(s) from this run.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not clear run results')
    }
  }

  return <div className="min-w-20 max-w-xs">
    <button type="button" className="secondary" disabled={busy || active} title={active ? 'Wait for research to finish' : 'Clear this run’s results and prospects'} onClick={() => void clear()}>{busy ? 'Clearing…' : 'Clear'}</button>
    {message && <p role="status" className="text-xs">{message}</p>}
    {error && <p role="alert" className="text-xs">{error}</p>}
  </div>
}
