import { hasEnrichmentData } from '../src/enrichment-data.ts';
import type { Enrichment, Json } from './server/store';

export function fieldLabel(key: string): string {
  const text = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function emptyValue(value: Json): boolean {
  return value === null || value === '' || (Array.isArray(value) && value.length === 0);
}
export function extractionDisplayStatus(enrichment: Pick<Enrichment, 'data' | 'sources' | 'status'> & Partial<Pick<Enrichment, 'scrapeMetadata'>>): string {
  if (hasEnrichmentData(enrichment.data)) return 'Extraction succeeded';
  const metadata = enrichment.scrapeMetadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) && Array.isArray(metadata.stages)
    && metadata.stages.some((stage) => stage && typeof stage === 'object' && !Array.isArray(stage) && stage.name === 'extraction' && stage.status === 'skipped')) return 'Extraction not requested · scrape only';
  return Array.isArray(enrichment.sources) && enrichment.sources.length ? 'Extraction failed · retry available' : 'Extraction not run';
}
export function partitionEnrichmentData(value: Json): { populated: Json; empty: Json; emptyCount: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { populated: value, empty: null, emptyCount: 0 };
  const entries = Object.entries(value);
  const empty = entries.filter(([, item]) => emptyValue(item));
  return { populated: Object.fromEntries(entries.filter(([, item]) => !emptyValue(item))), empty: Object.fromEntries(empty), emptyCount: empty.length };
}
