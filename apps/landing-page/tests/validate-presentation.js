import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// English presentation baselines; unused RTL overrides have been removed.
const styles = {
  HeroSection: 'bda01f6801ca0f100e7eb8ad5d36e2db34712b7b3a86fe5f8a9806b064464633',
  WhatsAppPreview: 'fb85c8a7b412fd7749e72ccee288429e29ca60cc09dc2fa2aafacf3485a64146',
  EditorComparison: '6e80a39da6c877ac731c63c337ccb502f0edfaae2112de033ce8e902ed63a618',
  ScrollConversation: 'a730d9f4056dc1905ae132af184299c6cb7b53d2b0d9861f19aae494418e1cf7',
  ClosingCta: '0f374c02e7c5eee05cb87e2f16ac1a3ffeb8da9f2069d98ea56502d1b734128a',
};
const hash = text => createHash('sha256').update(text).digest('hex');
for (const [component, expected] of Object.entries(styles)) {
  const source = await readFile(new URL(`../src/components/${component}.astro`, import.meta.url), 'utf8');
  assert.equal(hash([...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')), expected, `${component}: existing styling changed`);
  if (component === 'ScrollConversation') assert.equal(hash(source.match(/<script>([\s\S]*?)<\/script>/)[1]), '5d42efb1ff9d2413278b7cd1554f7b3654ff8f621a6a0b166b509da8d3c44d3a', 'Scroll animation changed');
}
console.log('presentation: English component CSS and scroll animation unchanged');
