import { z } from 'zod';
import { MarketingDatabase, type MarketingSegmentCountryQuery } from './database.ts';
import { planCommunityQueries, queryPlannerInputSchema, type QueryPlan, type QueryPlannerOptions } from './query-planner.ts';

export const countryQueryPlannerInputSchema = queryPlannerInputSchema.pick({
  languages: true,
  queriesPerLanguage: true,
}).extend({
  marketingSegmentCountryId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export type CountryQueryPlannerInput = z.input<typeof countryQueryPlannerInputSchema>;
export interface SavedCountryQueryPlan extends QueryPlan {
  marketingSegmentCountryId: number;
  savedQueries: MarketingSegmentCountryQuery[];
}

/** Resolve stored context -> generate all language batches -> save in one short transaction. */
export async function planMarketingSegmentCountryQueries(
  input: CountryQueryPlannerInput,
  options: QueryPlannerOptions & { database: MarketingDatabase },
): Promise<SavedCountryQueryPlan> {
  const request = countryQueryPlannerInputSchema.parse(input);
  const country = options.database.getCountry(request.marketingSegmentCountryId);
  if (!country) throw new Error(`Marketing segment country ${request.marketingSegmentCountryId} not found.`);
  const segment = options.database.getSegment(country.marketing_segment_id);
  if (!segment) throw new Error(`Marketing segment ${country.marketing_segment_id} not found.`);

  const plan = await planCommunityQueries({
    marketSegment: segment.name,
    marketSegmentDescription: segment.description,
    countryCode: country.country_code,
    languages: request.languages,
    queriesPerLanguage: request.queriesPerLanguage,
  }, options);

  // Do not save anything if generation fails or the caller cancels before persistence.
  options.abortSignal?.throwIfAborted();
  const savedQueries = options.database.saveQueries(country.id, plan.plans.flatMap(({ language, queries }) =>
    queries.map((query) => ({ ...query, language })),
  ));
  return { ...plan, marketingSegmentCountryId: country.id, savedQueries };
}
