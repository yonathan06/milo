/** Limitations and outreach suggestions alone are not a successful factual extraction. */
export function hasEnrichmentData(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const fields = ['communityName', 'description', 'lastObservedActivity', 'memberCount', 'location', 'language',
    'visibility', 'communityMetrics', 'admins', 'publicContactRoutes', 'rulesAndPromotionPolicy', 'latestPosts', 'eventAndVideoSignals'];
  const hasEvidence = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(hasEvidence);
    const record = value as Record<string, unknown>;
    const evidence = record.evidence as Record<string, unknown> | undefined;
    return Boolean(evidence && typeof evidence.sourceUrl === 'string' && evidence.sourceUrl.trim()
      && typeof evidence.quote === 'string' && evidence.quote.trim());
  };
  return fields.some((field) => hasEvidence((data as Record<string, unknown>)[field]));
}
