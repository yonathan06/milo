import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Hashes captured before this change: content work must not alter existing CSS.
const styles = {
  HeroSection: '752f108c4bfcc432fb28a227fb36fbf5d3cf640209c678aa66104b70b408b0e5',
  WhatsAppPreview: 'a1c0979b20e775a904093bf17bf0be15950151cfec2b8a4a6a3d2419b686309f',
  EditorComparison: 'd19b3541676b5e046041ea0323d1d2744fda7853a38349b66be7a499f7c75af9',
  ScrollConversation: 'a730d9f4056dc1905ae132af184299c6cb7b53d2b0d9861f19aae494418e1cf7',
  ClosingCta: '307fe48b99bc6791edd13240af38536b2adb188832be6d46eb29176f31fa9987',
  CountrySelector: '8c312d09dd7ad0f3251fb45a0335b0eb4ace0a76ec95730a8e52ab4cf57290e2',
  SiteFooter: 'e1a0995c0f1bf6d14342a24b92ed5fd47922820fe213e7bebf176459016a0bae',
};
const hash = text => createHash('sha256').update(text).digest('hex');
for (const [component, expected] of Object.entries(styles)) {
  const source = await readFile(new URL(`../src/components/${component}.astro`, import.meta.url), 'utf8');
  assert.equal(hash([...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')), expected, `${component}: existing styling changed`);
  if (component === 'ScrollConversation') assert.equal(hash(source.match(/<script>([\s\S]*?)<\/script>/)[1]), '5d42efb1ff9d2413278b7cd1554f7b3654ff8f621a6a0b166b509da8d3c44d3a', 'Scroll animation changed');
}
console.log('presentation: all original component CSS and scroll animation unchanged');
