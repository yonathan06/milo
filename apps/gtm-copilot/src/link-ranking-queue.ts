import { LinkRankingStore, rankLinkBatch, rankingBatches, rankingSettings, rankingModel, type Link, type RankingOptions, type rankLink } from './link-ranking.ts';

/** Drain active workers before returning/throwing so callers can safely close SQLite. */
export async function runLinkRankingQueue(links: Link[], store: LinkRankingStore, options: RankingOptions & {
  force?: boolean;
  rank?: typeof rankLink;
  onProgress?: (processed: number, failed: number, inputTokens: number) => void;
}) {
  const settings = rankingSettings();
  const model = options.model ?? rankingModel;
  const batches = rankingBatches(links, options.rank ? 1 : settings.batchSize, model);
  let next = 0;
  let stopped = false;
  let failure: unknown;
  const worker = async () => {
    while (!stopped && next < batches.length) {
      const selected = batches[next++]!;
      const active: Link[] = [];
      for (const selectedLink of selected) {
        const fresh = store.links(selectedLink.id)[0];
        if (!fresh || (!options.force && store.current(fresh, model))) options.onProgress?.(1, 0, 0);
        else active.push(fresh);
      }
      if (!active.length) continue;
      try {
        const batch = options.rank ? await (async () => {
          const response = await options.rank!(active[0]!, options);
          return { results: new Map([[active[0]!.id, response]]), usage: response.usage };
        })() : await rankLinkBatch(active, options);
        // A single short transaction avoids one disk sync per link in a batch.
        store.saveBatch(active, model, batch.results, null);
        options.onProgress?.(active.length, 0, batch.usage.input_tokens ?? 0);
      } catch (error) {
        stopped = true;
        failure ??= error;
        store.saveBatch(active, model, null, error instanceof Error ? error.message : String(error));
        options.onProgress?.(active.length, active.length, 0);
        throw error;
      }
    }
  };
  const settled = await Promise.allSettled(Array.from({ length: Math.min(settings.concurrency, batches.length) }, () => worker().catch((error) => {
    stopped = true; failure ??= error; throw error;
  })));
  const rejected = settled.find((result) => result.status === 'rejected');
  if (rejected?.status === 'rejected') throw failure ?? rejected.reason;
}
