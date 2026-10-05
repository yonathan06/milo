export interface ProviderRun {
  actorId: string;
  kind: 'posts' | 'community_metadata';
  runId?: string;
  datasetId?: string;
  buildId?: string;
  status: string;
  startedAt?: string;
  finishedAt?: string;
  usageTotalUsd?: number;
  recordCount?: number;
  usableSourceCount?: number;
  maxItems: number;
  maxChargeUsd: number;
  error?: string;
}

export interface ScrapingMetadata {
  version: 2;
  requestedUrl: string;
  collector: string;
  startedAt: string;
  completedAt: string;
  scrapeCompletedAt: string;
  durationMs: number;
  models: { extraction: string | null; verification: string | null };
  settings: { maxPosts: number; supplementaryMetadata: boolean; maxActorChargeUsd: number };
  providerRuns: ProviderRun[];
  stages: { name: string; status: 'succeeded' | 'failed' | 'skipped'; reason?: string }[];
  sourceSummary: {
    url: string; fetchedAt: string; collector: string; kind: string;
    characters: number; sha256: string; atCharacterLimit: boolean;
  }[];
  coverage: { available: string[]; missing: string[] };
  marketingContext: {
    queryId: number; query: string; segment: string; segmentDescription: string;
    countryCode: string; language: string;
  }[];
}
