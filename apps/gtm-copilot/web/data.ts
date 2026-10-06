import { createServerFn } from '@tanstack/solid-start';
import { queryOptions } from '@tanstack/solid-query';
import { z } from 'zod';
import { startPlanningSchema, planningStatusSchema } from './planning';
import { startSearchSchema, searchStatusSchema } from './search';
import { enrichmentRequestSchema } from './enrichment';
import { linkRankingRequestSchema } from './link-ranking';
import { resultsPageSchema, type ResultsPageRequest } from './results-page';

const idSchema = z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });

const getSegments = createServerFn({ method: 'GET' }).handler(async () => {
  const { withReadStore } = await import('./server/store');
  return withReadStore((store) => store.segments());
});
const getSegment = createServerFn({ method: 'GET' }).validator(idSchema).handler(async ({ data }) => {
  const { withReadStore } = await import('./server/store');
  return withReadStore((store) => store.segment(data.id));
});
const getQuery = createServerFn({ method: 'GET' }).validator(idSchema).handler(async ({ data }) => {
  const { withReadStore } = await import('./server/store');
  return withReadStore((store) => store.query(data.id));
});
const getResults = createServerFn({ method: 'GET' }).validator(resultsPageSchema).handler(async ({ data }) => {
  const { withReadStore } = await import('./server/store');
  return withReadStore((store) => store.resultsPage(data));
});
const getResult = createServerFn({ method: 'GET' }).validator(idSchema).handler(async ({ data }) => {
  const { withReadStore } = await import('./server/store');
  return withReadStore((store) => store.result(data.id));
});

export const startBulkQueryPlanning = createServerFn({ method: 'POST' }).handler(async () => {
  const { startBulkPlanning } = await import('./server/planning');
  const { runAction } = await import('./server/action-log');
  try { return runAction('bulk-planning', {}, () => startBulkPlanning()); }
  catch { return { job: null, error: 'Could not start generation. Check that the database is initialized and writable.' }; }
});
const getBulkQueryPlanningStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const { getBulkPlanningStatus } = await import('./server/planning');
  return getBulkPlanningStatus();
});
export const bulkPlanningStatusOptions = () => queryOptions({
  queryKey: ['bulk-query-planning'], queryFn: () => getBulkQueryPlanningStatus(), staleTime: 0,
  refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
  refetchIntervalInBackground: true,
});

export const startQueryPlanning = createServerFn({ method: 'POST' }).validator(startPlanningSchema).handler(async ({ data }) => {
  const { startPlanning } = await import('./server/planning');
  const { runAction } = await import('./server/action-log');
  try { return runAction('planning', { segmentId: data.segmentId }, () => startPlanning(data)); }
  catch { return { job: null, error: 'Could not start generation. Check that the database is initialized and writable.' }; }
});
const getQueryPlanningStatus = createServerFn({ method: 'GET' }).validator(planningStatusSchema).handler(async ({ data }) => {
  const { getPlanningStatus } = await import('./server/planning');
  return getPlanningStatus(data.segmentId);
});
export const planningStatusOptions = (segmentId: number) => queryOptions({
  queryKey: ['query-planning', segmentId],
  queryFn: () => getQueryPlanningStatus({ data: { segmentId } }),
  staleTime: 0,
  refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
  refetchIntervalInBackground: true,
});

export const startBulkQuerySearch = createServerFn({ method: 'POST' }).handler(async () => {
  const { startBulkSearch } = await import('./server/search');
  const { runAction } = await import('./server/action-log');
  try { return runAction('bulk-search', {}, () => startBulkSearch()); }
  catch { return { job: null, error: 'Could not start search. Run db:init to initialize search tracking and check database permissions.' }; }
});
const getBulkQuerySearchStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const { getBulkSearchStatus } = await import('./server/search');
  return getBulkSearchStatus();
});
export const bulkSearchStatusOptions = () => queryOptions({
  queryKey: ['bulk-query-search'], queryFn: () => getBulkQuerySearchStatus(), staleTime: 0,
  refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
  refetchIntervalInBackground: true,
});

export const startQuerySearch = createServerFn({ method: 'POST' }).validator(startSearchSchema).handler(async ({ data }) => {
  const { startSearch } = await import('./server/search');
  const { runAction } = await import('./server/action-log');
  try { return runAction('search', { segmentId: data.segmentId, queryCount: data.queryIds.length }, () => startSearch(data)); }
  catch { return { job: null, error: 'Could not start search. Check that the database is initialized and writable.' }; }
});
const getQuerySearchStatus = createServerFn({ method: 'GET' }).validator(searchStatusSchema).handler(async ({ data }) => {
  const { getSearchStatus } = await import('./server/search');
  return getSearchStatus(data.segmentId);
});
export const searchStatusOptions = (segmentId: number) => queryOptions({
  queryKey: ['query-search', segmentId],
  queryFn: () => getQuerySearchStatus({ data: { segmentId } }),
  staleTime: 0,
  refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
  refetchIntervalInBackground: true,
});

export const startResultEnrichment = createServerFn({ method: 'POST' }).validator(enrichmentRequestSchema).handler(async ({ data }) => {
  const { startEnrichment } = await import('./server/enrichment');
  const { runAction } = await import('./server/action-log');
  try { return runAction('enrichment', { segmentId: data.segmentId, resultId: data.resultId }, () => startEnrichment(data)); }
  catch { return { job: null, error: 'Could not start enrichment. Check that the database is initialized and writable.' }; }
});
export const startResultAssessment = createServerFn({ method: 'POST' }).validator(enrichmentRequestSchema).handler(async ({ data }) => {
  const { startEnrichment } = await import('./server/enrichment');
  const { runAction } = await import('./server/action-log');
  try { return runAction('assessment', { segmentId: data.segmentId, resultId: data.resultId }, () => startEnrichment({ ...data, mode: 'assessment' })); }
  catch { return { job: null, error: 'Could not start assessment. Initialize the assessment schema with db:init and check database permissions.' }; }
});
const getResultEnrichmentStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const { getEnrichmentStatus } = await import('./server/enrichment');
  return getEnrichmentStatus();
});
export const enrichmentStatusOptions = () => queryOptions({
  queryKey: ['result-enrichment'], queryFn: () => getResultEnrichmentStatus(), staleTime: 0,
  refetchInterval: (query) => query.state.data?.status === 'running' ? 2000 : false,
  refetchIntervalInBackground: true,
});

export const startResultLinkRanking = createServerFn({ method: 'POST' }).validator(linkRankingRequestSchema).handler(async ({ data }) => {
  const { startLinkRanking } = await import('./server/link-ranking');
  const { runAction } = await import('./server/action-log');
  try { return runAction('link-ranking', { resultId: data.resultId }, () => startLinkRanking(data)); }
  catch { return { job: null, error: 'Could not start link ranking. Check server settings and initialize the ranking schema with db:init.' }; }
});
const getResultLinkRankingStatus = createServerFn({ method: 'GET' }).validator(linkRankingRequestSchema).handler(async ({ data }) => {
  const { getLinkRankingStatus } = await import('./server/link-ranking');
  return getLinkRankingStatus(data);
});
export const linkRankingStatusOptions = (resultId?: number) => queryOptions({
  queryKey: ['link-ranking', resultId ?? 'all'], queryFn: () => getResultLinkRankingStatus({ data: { resultId } }), staleTime: 0,
  refetchInterval: (query) => query.state.data?.job?.status === 'running' ? 2000 : false,
  refetchIntervalInBackground: true,
});

export const resultsOptions = (request: ResultsPageRequest = resultsPageSchema.parse({})) => queryOptions({
  queryKey: ['results', request], queryFn: () => getResults({ data: request }),
  placeholderData: (previous) => previous,
  staleTime: 30_000,
});
export const segmentsOptions = () => queryOptions({ queryKey: ['segments'], queryFn: () => getSegments() });
export const segmentOptions = (id: number) => queryOptions({ queryKey: ['segment', id], queryFn: () => getSegment({ data: { id } }) });
export const queryDetailOptions = (id: number) => queryOptions({ queryKey: ['query', id], queryFn: () => getQuery({ data: { id } }) });
export const resultOptions = (id: number) => queryOptions({ queryKey: ['result', id], queryFn: () => getResult({ data: { id } }) });

export function parseId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) return NaN;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : NaN;
}
