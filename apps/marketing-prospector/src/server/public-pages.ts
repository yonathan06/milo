import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { load } from 'cheerio'
import { chromium, type Browser } from 'playwright'
import { parsePublicUrl, privateAddress } from './identity.ts'
import type { ParentIdentityEvidence } from './deduplication.ts'
export interface Page { title: string; heading?: string; description: string; text: string; contextText?: string; contactRoutes: string[]; communitySize: string | null; operatorSections: Array<{ url: string; text: string }> }
const junkHosts = new Set(['google.com','bing.com','search.brave.com','webcache.googleusercontent.com'])
export async function assertPublicAddress(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (junkHosts.has(host)) throw new Error('Not an eligible public source')
  if (isIP(host)) { if (privateAddress(host)) throw new Error('Private address not allowed'); return }
  const addresses = await lookup(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw new Error('Host does not resolve exclusively to public addresses')
}
export async function fetchPublicHtml(input: string, fetcher: typeof fetch = fetch): Promise<string> {
  let url = parsePublicUrl(input)
  for (let redirects = 0; redirects <= 4; redirects++) {
    await assertPublicAddress(url)
    const response = await fetcher(url, { redirect: 'manual', headers: { 'user-agent': 'MiloLocalProspector/2.0 (+public metadata only)', accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(12_000) })
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location || redirects === 4) throw new Error('Page redirect limit exceeded')
      url = parsePublicUrl(new URL(location, url).toString()); continue
    }
    if (!response.ok) throw new Error(`Page fetch failed with HTTP ${response.status}`)
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') ?? '')) throw new Error('Page is not HTML')
    const html = (await response.text()).slice(0, 1_000_000)
    assertNotRestricted(html)
    return html
  }
  throw new Error('Page redirect limit exceeded')
}
export async function fetchWithPlaywright(input: string, launchBrowser: () => Promise<Browser> = () => chromium.launch({ headless: true })): Promise<string> {
  const target = parsePublicUrl(input); await assertPublicAddress(target)
  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', javaScriptEnabled: true })
    await context.route('**/*', async route => {
      try {
        if (route.request().method() !== 'GET') return await route.abort()
        const url = parsePublicUrl(route.request().url()); await assertPublicAddress(url); await route.continue()
      } catch { await route.abort() }
    })
    const page = await context.newPage()
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 15_000 })
    let content: string
    try { content = await page.content() } catch (error) {
      if (!(error instanceof Error) || !/navigating|changing the content/i.test(error.message)) throw error
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }); content = await page.content()
    }
    assertNotRestricted(content)
    await context.close()
    return content.slice(0, 1_000_000)
  } finally { await browser.close() }
}
// Usability is not eligibility: readable vendor pages still require classification.
// Match platform shells, not short but specific community metadata.
const genericPublicText = /^(?:facebook(?: - log in or sign up)?|reddit(?: - (?:dive into anything|the heart of the internet))?|dive into anything|the heart of the internet)$/i
export function hasUsablePublicEvidence(page: Pick<Page, 'title' | 'description' | 'text'>): boolean {
  return [page.title, page.description, page.text].some(value => {
    const text = value.replace(/\s+/g, ' ').trim()
    return text.length >= 12 && !genericPublicText.test(text)
  })
}
export async function fetchPageWithFallback(input: string, fetcher: typeof fetch = fetch, render: (url: string) => Promise<string> = fetchWithPlaywright): Promise<string> {
  try {
    const html = await fetchPublicHtml(input, fetcher)
    const page = extractPage(html, input)
    if (hasUsablePublicEvidence(page)) return html
  } catch (error) {
    // Never escalate a genuine access wall to browser-based interaction.
    if (isAccessWall(error)) throw error
    // Validate again before browser fallback, including redirects/subrequests.
  }
  const html = await render(input)
  assertNotRestricted(html)
  if (!hasUsablePublicEvidence(extractPage(html, input))) throw new Error('No usable public evidence; empty or generic platform shell')
  return html
}
export function isAccessWall(error: unknown): boolean { return /login, CAPTCHA, membership|HTTP (401|403)|access-control/i.test(error instanceof Error ? error.message : String(error)) }
export function assertNotRestricted(html: string): void {
  const $ = load(html); $('script,style,noscript').remove()
  const text = $.text().replace(/\s+/g, ' ').slice(0, 20_000)
  if ($('iframe[src*="captcha"],.g-recaptcha,.h-captcha,input[type="password"]').length || /captcha|verify (?:that )?you are human|log ?in to (?:view|continue|see)|sign in to (?:view|continue|see)|members only|access denied|blocked by network security|network (?:access )?blocked|join (?:this |the )?group to (?:view|see|continue)/i.test(text)) {
    throw new Error('Page requires login, CAPTCHA, membership, or access-control interaction; it was not accessed')
  }
}
const privateSelectors = '[class*=member],[class*=participant],[class*=comment],[class*=user-profile],[data-testid*=member],[data-testid*=participant]'
export function redactPhones(text: string): string { return text.replace(/(?:\+\d[\d ()-]{7,}\d|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b)/g, '[phone excluded]') }
export function extractPage(html: string, pageUrl = ''): Page {
  const $ = load(html)
  $('script,style,noscript,svg,iframe').remove()
  $(privateSelectors).remove()
  $('br').replaceWith(' ')
  $('p,div,h1,h2,h3,h4,li,section,article').prepend(' ').append(' ')
  const operatorSections: Page['operatorSections'] = []
  // Only explicit public operator sections. Do not retain broad member/admin lists.
  $('section,article,[data-public-operator],.team-card').each((_, el) => {
    const node = $(el), heading = node.find('h1,h2,h3,h4').first().text()
    if (!node.is('[data-public-operator],.team-card') && !/^(?:about(?: us)?|our team|community (?:team|operators)|leadership|founder|contact|partnerships|rules)$/i.test(heading.trim())) return
    const publishedLinks: string[] = []
    node.find('a[href]').each((_, a) => { try { const url = parsePublicUrl(new URL($(a).attr('href')!, pageUrl).toString()); if (!/private|members only/i.test($(a).text())) publishedLinks.push(`${$(a).text().trim()}: ${url.toString()}`) } catch { /* Not a public profile link. */ } })
    const text = redactPhones(`${node.text()} ${publishedLinks.join(' ')}`.replace(/\s+/g, ' ').trim()).slice(0, 2000)
    if (/\b(founder|administrator|moderator|community manager|admin)\b/i.test(text)) operatorSections.push({ url: pageUrl, text })
  })
  $('nav,footer,header').remove()
  const title = redactPhones($('meta[property="og:title"]').attr('content')?.trim() || $('title').first().text().trim()).slice(0, 500)
  const description = redactPhones($('meta[name="description"]').attr('content')?.trim() || $('meta[property="og:description"]').attr('content')?.trim() || '').slice(0, 2000)
  const main = $('main,article,[role="main"]').first()
  const text = redactPhones((main.length ? main : $('body')).text().replace(/\s+/g, ' ').trim()).slice(0, 12_000)
  const heading = redactPhones($('h1').first().text().replace(/\s+/g, ' ').trim()).slice(0, 500)
  const context = (main.length ? main : $('body')).clone()
  context.find('h1').remove()
  const contextText = redactPhones(context.text().replace(/\s+/g, ' ').trim()).slice(0, 12_000)
  const match = `${title} ${description} ${text}`.match(/\b([\d,.]+\s*[KMB]?)\s*(members|participants)\b/i)
  const contactRoutes = new Set<string>()
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href')!, label = `${$(a).text()} ${href}`
    if (!/contact|advertis|partnership|business/i.test(label)) return
    if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) contactRoutes.add(href.slice(0, 500))
    else try { const route = parsePublicUrl(new URL(href, pageUrl).toString()); if (route.protocol === 'https:') contactRoutes.add(route.toString()) } catch { /* unsupported route */ }
  })
  return { title, heading, description, text, contextText, contactRoutes: [...contactRoutes].slice(0, 10), communitySize: match ? `${match[1]} ${match[2]}` : null, operatorSections: operatorSections.slice(0, 6) }
}
export function explicitParent(html: string, childUrl: string): ParentIdentityEvidence | undefined {
  const $ = load(html); $(privateSelectors).remove()
  const candidates = new Map<string, ParentIdentityEvidence>()
  $('[aria-label*=breadcrumb i],.breadcrumb,nav[aria-label*=community i]').find('a[href]').each((_, el) => {
    const label = $(el).text().trim()
    if (!/forum|community|group|network/i.test(label)) return
    try {
      const parent = parsePublicUrl(new URL($(el).attr('href')!, childUrl).toString()), child = parsePublicUrl(childUrl)
      if (parent.origin !== child.origin || parent.pathname === '/' || parent.toString() === child.toString()) return
      candidates.set(parent.toString(), { childUrl, parentUrl: parent.toString(), sourceUrl: childUrl, excerpt: `${label}: ${parent.toString()}`, kind: 'breadcrumb' })
    } catch { /* malformed/untrusted navigation */ }
  })
  return candidates.size === 1 ? [...candidates.values()][0] : undefined
}
