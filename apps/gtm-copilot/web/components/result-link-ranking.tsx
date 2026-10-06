import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createSignal, Show } from 'solid-js';
import { linkRankingStatusOptions, startResultLinkRanking } from '../data';

export function ResultLinkRanking() {
  const client = useQueryClient();
  const status = createQuery(linkRankingStatusOptions);
  const [message, setMessage] = createSignal('');
  const mutation = createMutation(() => ({
    mutationFn: () => startResultLinkRanking(),
    onSuccess: (response) => {
      setMessage(response.error ?? '');
      if (response.job) client.setQueryData(['link-ranking'], { pendingCount: response.job.total - response.job.processed, error: null, job: response.job });
      else void status.refetch();
    },
    onError: () => { setMessage('Could not confirm ranking started. Refresh status before retrying.'); void status.refetch(); },
  }));
  const busy = () => mutation.isPending || status.data?.job?.status === 'running';
  let lastProgress = '';
  createEffect(() => {
    const job = status.data?.job;
    if (!job) return;
    const signature = `${job.id}:${job.processed}:${job.status}`;
    if (signature !== lastProgress) {
      lastProgress = signature;
      void client.invalidateQueries({ queryKey: ['results'] });
    }
  });
  return <div class="mb-5 rounded-xl border border-teal-200 bg-white p-4">
    <button type="button" class="rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={busy() || status.isPending || status.isError || Boolean(status.data?.error) || !status.data?.pendingCount}
      onClick={() => { setMessage(''); mutation.mutate(); }}>
      {busy() ? 'Ranking with Jev…' : `Rank ${status.data?.pendingCount ?? 0} unranked results with Jev`}
    </button>
    <p class="mt-3 text-xs text-slate-500">Ranks all saved results needing a current score, regardless of filters or pagination. Uses saved URLs, titles and snippets only; TypeSafe charges apply. Current rankings are skipped; failed or outdated rankings are retried. No scraping, enrichment or outreach is performed.</p>
    <Show when={message() || status.data?.error || status.data?.job?.error}><p role="alert" class="mt-3 text-sm text-rose-800">{message() || status.data?.error || status.data?.job?.error}</p></Show>
    <Show when={status.isError}><p role="alert" class="mt-3 text-sm text-rose-800">Could not load ranking status. <button type="button" class="underline" onClick={() => void status.refetch()}>Retry status</button></p></Show>
    <Show when={status.data?.job}>{(job) => <p role="status" aria-live="polite" class="mt-3 text-sm">
      {job().status === 'running' ? 'Ranking' : job().status === 'failed' ? 'Ranking stopped' : 'Ranking finished'} · {job().processed}/{job().total} processed · {job().failed} failed · {job().inputTokens.toLocaleString()} input tokens. Progress is process-local; completed scores persist in SQLite.
    </p>}</Show>
  </div>;
}
