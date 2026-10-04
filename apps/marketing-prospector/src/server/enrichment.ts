import { load } from 'cheerio'
import { countries } from '../search-filters.ts'
import { parsePublicUrl } from './identity.ts'
import { hasUsablePublicEvidence, type Page } from './public-pages.ts'
export type { Page } from './public-pages.ts'
export interface Enrichment {
  evidenceMode: 'page' | 'snippet'; emails: string[]; websites: string[]; niche: string[]; country: string | null; audienceSize: number | null; lastActivity: string | null
  engagementSignals: Array<{ value: string; sourceUrl: string }>; sources: Array<{ url: string; text: string; title?: string; heading?: string; description?: string; inspected?: boolean }>; errors: Array<{ url: string; error: string }>
  operatorSections: Array<{ url: string; text: string }>; rankingError?: string | null
}
export function parseAudienceSize(value: string | null): number | null {
  const match = value?.match(/^\s*([\d,]+(?:\.\d+)?)\s*([KMB])?\s*(?:members|participants)\b/i)
  if (!match) return null
  const n = Number(match[1]!.replaceAll(',', '')) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase() ?? ''] ?? 1)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}
export function detectCountry(text: string): string | null {
  const aliases: Record<string, string[]> = { US: ['United States','USA','U.S.A.','U.S.'], GB: ['United Kingdom','UK','U.K.'], TR: ['Turkey','Türkiye'] }
  const matches = countries.filter(country => [country.name, ...(aliases[country.code] ?? [])].some(name => new RegExp(`(?:^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'iu').test(text)))
  return matches.length === 1 ? matches[0]!.code : null
}
export function aliasUrl(input: string): string | null {
  try { const url = parsePublicUrl(input); url.protocol = 'https:'; url.hostname = url.hostname.replace(/^(www|m)\./, ''); url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key); url.searchParams.sort(); url.pathname = url.pathname.replace(/\/+$/, '') || '/'; return url.toString() } catch { return null }
}
export function operatorLinks(html: string, base: string): string[] {
  const $ = load(html); $('script,style,noscript,[class*=member],[class*=participant],[class*=comment],[class*=user-profile]').remove()
  const links = new Map<string, number>()
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href')!, label = `${$(a).text()} ${href}`
    if (!/about|rules|team|contact|partnership|business/i.test(label)) return
    try { const url = parsePublicUrl(new URL(href, base).toString()).toString(); if (url !== base) links.set(url, /about|rules|team/i.test(label) ? 0 : 1) } catch { /* unsafe link */ }
  })
  return [...links].sort((a, b) => a[1] - b[1]).slice(0, 2).map(([url]) => url)
}
// Two links total; leader discovery never adds a separate allowance.
export async function enrichPage(input: { url: string; links: string[]; previous?: Enrichment; page: Page; fetchPage: (url: string) => Promise<string>; extractPage: (html: string, url: string) => Page; assertPublic: (html: string) => void; checkpoint?: (result: Enrichment) => void }): Promise<Enrichment> {
  const result: Enrichment = input.previous ?? { evidenceMode: 'page', emails: [], websites: [], niche: [], country: null, audienceSize: parseAudienceSize(input.page.communitySize), lastActivity: null, engagementSignals: [], sources: [], errors: [], operatorSections: [] }
  const collect = (url: string, page: Page) => {
    if (!hasUsablePublicEvidence(page)) throw new Error('No usable public evidence on linked page; empty or generic shell')
    result.sources.push({ url, title: page.title, heading: page.heading, description: page.description, text: (page.contextText ?? page.description).slice(0, 8000), inspected: true })
    result.operatorSections.push(...page.operatorSections)
    for (const route of page.contactRoutes) if (route.startsWith('mailto:')) result.emails.push(route.slice(7))
    input.page.contactRoutes = [...new Set([...input.page.contactRoutes, ...page.contactRoutes])]
    input.checkpoint?.(result)
  }
  if (!result.sources.some(s => s.url === input.url)) collect(input.url, input.page)
  for (const url of [...new Set(input.links)].slice(0, 2)) {
    if (result.sources.some(s => s.url === url)) continue
    result.errors = result.errors.filter(e => e.url !== url)
    try { const html = await input.fetchPage(url); input.assertPublic(html); collect(url, input.extractPage(html, url)) }
    catch (error) { result.errors.push({ url, error: error instanceof Error ? error.message : 'Linked page failed' }); input.checkpoint?.(result) }
  }
  const locations = new Set(result.sources.map(s => detectCountry(s.text)).filter(Boolean))
  result.country = locations.size === 1 ? [...locations][0]! : null
  result.emails = [...new Set(result.emails)].slice(0, 10)
  result.engagementSignals = [...input.page.text.matchAll(/\b[\d,.]+\s*[KMB]?\s+(?:posts\s+(?:per|a)\s+(?:day|week|month))\b/gi)].slice(0, 10).map(m => ({ value: m[0], sourceUrl: input.url }))
  input.checkpoint?.(result)
  return result
}
