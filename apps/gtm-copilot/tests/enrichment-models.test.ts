import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrichmentModels } from '../src/enrichment-models.ts';

test('Gemma extraction defaults independently of DeepSeek verification and assessment', () => {
  assert.deepEqual(enrichmentModels({}), { extraction: 'google/gemma-4-31b-it', verification: 'deepseek/deepseek-v4.1-flash', assessment: 'deepseek/deepseek-v4.1-flash' });
  assert.deepEqual(enrichmentModels({ GTM_ENRICHMENT_MODEL: 'custom-extraction' }), { extraction: 'custom-extraction', verification: 'deepseek/deepseek-v4.1-flash', assessment: 'deepseek/deepseek-v4.1-flash' });
});

test('model overrides preserve precedence and assessment follows verification unless explicitly set', () => {
  const env = { GTM_ENRICHMENT_MODEL: 'env-extract', GTM_VERIFICATION_MODEL: 'env-verify', GTM_ASSESSMENT_MODEL: 'env-assess' };
  assert.deepEqual(enrichmentModels(env), { extraction: 'env-extract', verification: 'env-verify', assessment: 'env-assess' });
  assert.deepEqual(enrichmentModels(env, { extraction: 'cli-extract', verification: 'cli-verify', assessment: 'cli-assess' }), { extraction: 'cli-extract', verification: 'cli-verify', assessment: 'cli-assess' });
  assert.equal(enrichmentModels({}, { verification: 'cli-verify' }).assessment, 'cli-verify');
});
