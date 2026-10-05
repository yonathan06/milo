import { z } from 'zod';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const language = z.string().trim().min(2).max(64).transform((value, ctx) => {
  try { return Intl.getCanonicalLocales(value)[0]!; }
  catch { ctx.addIssue({ code: 'custom', message: 'Use language tags such as en, de, or pt-BR.' }); return z.NEVER; }
});
export const startPlanningSchema = z.object({
  segmentId: id,
  countryIds: z.array(id).min(1, 'Select at least one country.').max(50).transform((ids) => [...new Set(ids)]),
  languages: z.array(language).min(1).max(8).transform((languages) => [...new Set(languages)]).optional(),
  queriesPerLanguage: z.number().int().min(1).max(20).default(20),
});
export type PlanningInput = z.input<typeof startPlanningSchema>;
export type PlanningRequest = z.output<typeof startPlanningSchema>;
export const planningStatusSchema = z.object({ segmentId: id });

/** Explicit editable defaults, not an inference by the query planner. Unknown countries require an override. */
export const countryLanguages: Record<string, string[]> = {
  US: ['en'], GB: ['en'], AU: ['en'], CA: ['en', 'fr'], DE: ['de'], FR: ['fr'],
  IT: ['it'], ES: ['es'], NL: ['nl'], BE: ['nl', 'fr', 'de'], SE: ['sv'],
  PL: ['pl'], CZ: ['cs'], PT: ['pt-PT'], IL: ['he', 'en'],
};
export interface PlanningCountryProgress {
  countryId: number;
  countryCode: string;
  languages: string[];
  status: 'queued' | 'running' | 'complete' | 'failed';
  savedCount: number;
  error: string | null;
}
export interface BulkPlanningJob {
  id: string;
  status: 'running' | 'complete';
  startedAt: string;
  finishedAt: string | null;
  segments: {
    segmentId: number;
    name: string;
    status: 'queued' | 'running' | 'complete' | 'failed' | 'skipped';
    savedCount: number;
    error: string | null;
  }[];
}
export interface PlanningJob {
  id: string;
  segmentId: number;
  status: 'running' | 'complete';
  queriesPerLanguage: number;
  startedAt: string;
  finishedAt: string | null;
  countries: PlanningCountryProgress[];
}
