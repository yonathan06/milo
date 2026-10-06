import { load } from 'cheerio';

const attrs = new Set(['href', 'alt', 'title', 'datetime', 'itemprop', 'itemscope', 'itemtype', 'content', 'name', 'property', 'aria-label', 'scope', 'colspan', 'rowspan']);

/** Keep semantic HTML from the rendered DOM, not scripts, styling or interactive widgets. */
export function cleanExtractionHtml(html: string, url: string, dateMetadata: string[] = []) {
  const $ = load(html);
  $('script, style, css, link[rel~="stylesheet"], noscript, svg, canvas, iframe, object, embed, form, button, input, select, textarea, nav, [role="navigation"], [hidden], [aria-hidden="true"]').remove();
  $('*').contents().filter((_, node) => node.type === 'comment').remove();
  $('*').each((_, element) => {
    if (!('attribs' in element)) return;
    const node = $(element);
    for (const [name, value] of Object.entries(element.attribs)) {
      if (!attrs.has(name)) { node.removeAttr(name); continue; }
      if (name === 'href') {
        try {
          const link = new URL(value, url);
          if (!['http:', 'https:', 'mailto:'].includes(link.protocol)) node.removeAttr(name);
          else node.attr(name, link.href);
        } catch { node.removeAttr(name); }
      } else node.attr(name, value.slice(0, 500));
    }
  });
  const main = $('main').first();
  const article = $('article').first();
  const content = main.length ? main : article.length ? article : $('body');
  const head = $('head').find('title, meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[property="article:published_time"], meta[property="article:modified_time"], meta[itemprop="datePublished"], meta[itemprop="dateModified"]').toArray().map((element) => $.html(element)).join('');
  const dates = load('<div></div>');
  for (const line of dateMetadata) dates('div').append(dates('<p></p>').text(line));
  return `<html><head>${head}</head><body>${dates('div').html() ?? ''}${content.html() ?? ''}</body></html>`;
}

/** Shrink whole DOM nodes first; keep dates/rules and produce well-formed HTML within the budget. */
export function compactExtractionHtml(html: string, budget: number) {
  if (html.length <= budget) return html;
  if (budget < 100) return '';
  const $ = load(html);
  const blocks = $('body').find('p, li, blockquote, tr, pre, div, section').filter((_, element) => $(element).find('p, li, blockquote, tr, pre, div, section').length === 0).toArray();
  const priority = (text: string) => (/datePublished|dateModified|publishedAt|created_utc|created_at|\b(?:time|timestamp):|\d{4}-\d{2}-\d{2}/i.test(text) ? 50 : 0)
    + (/\b(?:rules?|admin|permission|prohibited|promotion|contact|members?|subscribers?)\b/i.test(text) ? 20 : 0)
    + (/\b(?:event|video|wedding|editor|organizer|community)\b/i.test(text) ? 10 : 0);
  const ordered = blocks.map((element, index) => ({ element, index, score: priority($(element).text()) })).sort((a, b) => a.score - b.score || b.index - a.index);
  let estimated = $.html().length;
  for (const { element } of ordered) {
    if (estimated <= budget) break;
    estimated -= $.html(element).length;
    $(element).remove();
  }
  $('*').each((_, element) => { for (const name of ['itemscope', 'itemtype']) $(element).removeAttr(name); });
  let result = $.html();
  // A page may have one huge text node, long URLs or excessive nesting. Trim those without cutting tags.
  if (result.length > budget) {
    const textNodes = $('*').contents().filter((_, node) => node.type === 'text').toArray();
    let remaining = Math.max(0, budget - (result.length - textNodes.reduce((n, node) => n + ('data' in node ? node.data.length : 0), 0)) - 64);
    for (const node of textNodes) {
      if (!('data' in node)) continue;
      const length = Math.min(node.data.length, remaining);
      node.data = node.data.slice(0, length); remaining -= length;
    }
    result = $.html();
  }
  if (result.length > budget) {
    // Rare markup-heavy fallback: retain evidenced visible text inside a single safe HTML node.
    const minimal = load('<html><head></head><body><p></p></body></html>');
    minimal('p').text($('body').text().slice(0, Math.max(0, budget - 100)));
    result = minimal.html();
    while (result.length > budget && minimal('p').text().length) {
      minimal('p').text(minimal('p').text().slice(0, -Math.max(1, result.length - budget)));
      result = minimal.html();
    }
  }
  return result;
}

export function containsSourceQuote(source: { text: string; format?: 'html' | 'text' }, quote: string) {
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
  const expected = normalize(quote);
  if (normalize(source.text).includes(expected)) return true;
  return source.format === 'html' && normalize(load(source.text).text()).includes(expected);
}
