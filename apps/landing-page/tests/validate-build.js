import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { ui, languages, directions } from '../src/i18n/ui.ts';
import { segmentSlugs, getSegmentUI } from '../src/i18n/segments.ts';
import { useTranslatedPath } from '../src/i18n/utils.ts';

const origin = process.env.SITE_URL || 'http://localhost:4321';
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let count = 0;
for (const locale of Object.keys(languages)) {
  const translate = useTranslatedPath(locale);
  for (const segment of [null, ...segmentSlugs]) {
    const neutralPath = segment ? `/${segment}/` : '/';
    const path = translate(neutralPath);
    const html = await readFile(new URL(`../dist${path}index.html`, import.meta.url), 'utf8');
    const content = segment ? getSegmentUI(locale, segment) : ui[locale];
    assert.match(html, new RegExp(`<html[^>]*lang="${locale}"[^>]*dir="${directions[locale]}"`));
    for (const tag of ['main', 'h1', 'footer']) assert.equal((html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length, 1, `${path}: ${tag}`);
    for (const cls of ['hero', 'country-selector', 'site-footer']) assert.ok(html.includes(`class="${cls}"`));
    assert.ok(html.includes(`<title>${escape(content['landing.title'])}</title>`));
    assert.ok(html.includes(`content="${escape(content['landing.description'])}"`));
    assert.ok(html.includes(`rel="canonical" href="${new URL(path, origin).href}"`));
    for (const target of Object.keys(languages)) {
      const targetPath = translate(neutralPath, target);
      assert.ok(html.includes(`rel="alternate" hreflang="${target}" href="${new URL(targetPath, origin).href}"`));
      assert.ok(html.includes(`href="${targetPath}" hreflang="${target}"`), `${path}: selector language link ${target}`);
      assert.ok(html.includes(`href="${targetPath}" lang="${target}" hreflang="${target}"`), `${path}: footer language link ${target}`);
    }
    assert.ok(html.includes(`class="brand" href="${translate('/')}"`));
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 2);
    assert.doesNotMatch(html, /href="\/en\//);
    const heroUrl = html.match(/class="cta" href="([^"]+)"/)?.[1];
    assert.ok(heroUrl);
    const chat = new URL(heroUrl.replaceAll('&amp;', '&'));
    assert.equal(chat.hostname, 'wa.me');
    assert.equal(chat.searchParams.get('text'), content['whatsapp.prefill']);
    if (process.env.PUBLIC_WHATSAPP_NUMBER) assert.equal(chat.pathname, `/${process.env.PUBLIC_WHATSAPP_NUMBER.replace(/[\s()+-]/g, '')}`);
    if (segment) {
      const ordered = ['class="hero"', 'class="editor-comparison"', 'class="scroll-conversation"', 'class="closing-cta"', 'class="site-footer"'].map(token => html.indexOf(token));
      assert.ok(ordered.every((offset, i) => offset >= 0 && (!i || offset > ordered[i - 1])));
      assert.equal((html.match(/data-message(?:\s|>)/g) ?? []).length, 8);
      assert.match(html, /aria-labelledby="comparison-heading"/);
      assert.match(html, /<bdi dir="ltr"[^>]*>\$1,500<\/bdi>/);
      assert.ok(html.includes(escape(content['conversation.recap'])));
      assert.ok(html.includes(escape(content['conversation.highlights'])));
      assert.ok(html.includes(`aria-label="${content['chat.read']}"`));
      assert.equal(html.match(/class="whatsapp-link" href="([^"]+)"/)?.[1], heroUrl);
      if (segment !== 'weddings') assert.doesNotMatch(html, /\/media\/(wedding|ceremony|flowers|reception)\.jpg/);
    } else {
      assert.doesNotMatch(html, /class="editor-comparison"|data-scroll-conversation|class="closing-cta"/);
      assert.equal((html.match(/<button[^>]*role="tab"/g) ?? []).length, segmentSlugs.length);
      assert.equal((html.match(/<div[^>]*role="tabpanel"/g) ?? []).length, segmentSlugs.length);
      assert.equal((html.match(/class="chat"/g) ?? []).length, segmentSlugs.length);
      assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
      for (const [index, slug] of segmentSlugs.entries()) {
        assert.ok(html.includes(`id="preview-tab-${slug}" aria-controls="preview-panel-${slug}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}"`));
        assert.ok(html.includes(`id="preview-panel-${slug}" aria-labelledby="preview-tab-${slug}"${index ? ' hidden' : ''} tabindex="0"`));
        const previewContent = getSegmentUI(locale, slug);
        assert.ok(html.includes(previewContent['landing.request']));
        assert.ok(html.includes(escape(previewContent['landing.caption'])));
        const dedicatedHtml = await readFile(new URL(`../dist${translate(`/${slug}/`)}index.html`, import.meta.url), 'utf8');
        const chatMarkup = dedicatedHtml.match(/<section class="chat"[\s\S]*?<\/section>/)?.[0];
        assert.ok(chatMarkup && html.includes(chatMarkup), `${path}: ${slug} uses the dedicated page phone mock`);
      }
      assert.doesNotMatch(html, /class="segment-links"/);
    }
    for (const src of [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map(m => m[1])) await access(new URL(`../public${src}`, import.meta.url));
    count++;
    console.log(`${path}: structure, content, links, assets, metadata and WhatsApp passed`);
  }
}
async function pages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? pages(new URL(`${e.name}/`, dir)) : e.name.endsWith('.html') ? [new URL(e.name, dir).pathname] : []))).flat();
}
const built = await pages(new URL('../dist/', import.meta.url));
assert.equal(count, 15);
assert.equal(built.length, 15);
assert.ok(built.every(path => !path.includes('/general/')));
console.log('build: exactly fifteen localized pages passed');
