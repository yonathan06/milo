import { z } from 'zod';

// Keep runtime URL validation without emitting JSON Schema's `format: uri`,
// which some structured-output providers (including OpenAI) reject.
export const evidenceUrlSchema = z.string().refine((value) => z.url().safeParse(value).success, 'Invalid URL');
