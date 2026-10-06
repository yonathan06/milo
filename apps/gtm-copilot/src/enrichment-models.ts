export const defaultExtractionModel = 'google/gemma-4-31b-it';
export const defaultVerificationModel = 'deepseek/deepseek-v4.1-flash';

/** Extraction can be cheap without implicitly changing evidence/permission assessment. */
export function enrichmentModels(env: Record<string, string | undefined> = process.env, overrides: { extraction?: string; verification?: string; assessment?: string } = {}) {
  const extraction = overrides.extraction ?? env.GTM_ENRICHMENT_MODEL ?? defaultExtractionModel;
  const verification = overrides.verification ?? env.GTM_VERIFICATION_MODEL ?? defaultVerificationModel;
  const assessment = overrides.assessment ?? env.GTM_ASSESSMENT_MODEL ?? verification;
  return { extraction, verification, assessment };
}
