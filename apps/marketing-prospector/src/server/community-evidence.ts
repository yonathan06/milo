import { load } from 'cheerio'
import { normalizeCommunityUrl } from './identity.ts'
import { redactPhones } from './public-pages.ts'
import { createEvidenceCatalog, type EvidenceExcerpt } from './assessment.ts'

export type EvidenceRole = 'title' | 'community_context' | 'discussion' | 'identity_reference' | 'unknown'
export type EvidenceBasis = 'community_context' | 'community_fact' | 'discussion' | 'unknown'
export interface PublicEvidenceSource {
  url: string; title?: string; heading?: string; description?: string; text?: string
  inspected?: boolean; targetUrl?: string; candidateId?: string
}
// Only active inference input is cleaned. Original sources remain in the audit.
export function normalizeActiveText(text: string): string {
  const $ = load(`<body>${text}</body>`)
  $('script,style,nav,footer,header').remove()
  return redactPhones($('body').text()).replace(/\s+/g, ' ').trim()
}
export function withoutPlatformBoilerplate(text: string): string {
  return normalizeActiveText(text)
    .replace(/(?:discover|explore|find|browse)\s+(?:the\s+)?(?:most\s+)?(?:popular\s+)?(?:groups|communities)\s+(?:on|across)\s+(?:facebook|reddit)[^.?!]*(?:[.?!]|$)/gi, '')
    .replace(/(?:facebook|reddit)\s+has\s+[\d,.]+\s*(?:billion|million|[kmb])\s+(?:active\s+)?(?:users|people)[^.?!]*(?:[.?!]|$)/gi, '')
    .replace(/(?:join|connect with)\s+[\d,.]+\s*(?:billion|million)\s+(?:users|people)[^.?!]*(?:[.?!]|$)/gi, '')
    .replace(/(?:over |more than |about |nearly )?[\d,.]+\s*(?:billion|million)\s+(?:users|people)\s+(?:use|on|visit)\s+(?:facebook|reddit)[^.?!]*(?:[.?!]|$)/gi, '')
    .replace(/\b(?:log in or sign up|dive into anything|the heart of the internet|create new account)\b/gi, '')
    .replace(/\s+/g, ' ').trim()
}
const nonCommunity = /\b(?:no|without) (?:peer or member |actual |interactive )?community|\b(?:vendor|directory|article|portfolio)\b/i
export function hostedStructure(text: string): boolean { return !nonCommunity.test(text) && /\b(?:forum|community|group|network|discussion board|subreddit)\b/i.test(text) }
export function peerParticipation(text: string): boolean {
  return !nonCommunity.test(text) && /\b(?:members?|peers?|couples|brides|grooms|planners)\b[^.!?]{0,160}\b(?:discuss|connect|share|help|ask|comment|questions|advice)\b|\b(?:questions|advice)\b[^.!?]{0,100}\b(?:fellow|members?|peers?)\b/i.test(text)
}
export function participationEvidence(text: string): boolean {
  return hostedStructure(text) && (peerParticipation(text) || /\b(?:peer community|member network|community for|forum for|group for)\b/i.test(text))
}
function exactTarget(url: string, target: string): boolean {
  try { return normalizeCommunityUrl(url).url === normalizeCommunityUrl(target).url } catch { return false }
}
function isThread(url: string): boolean { return /\/comments\/|\/topics?\/|\/posts?\/|\/permalink\/|\/discussion\//i.test(url) }
export function createActiveCatalog(sources: PublicEvidenceSource[], canonicalTarget: string): EvidenceExcerpt[] {
  const output: EvidenceExcerpt[] = []
  for (const [index, source] of sources.entries()) {
    const own = exactTarget(source.url, canonicalTarget)
    const reference = !own && source.targetUrl === canonicalTarget
    const target = own || reference ? canonicalTarget : undefined
    const hosted = hostedStructure(withoutPlatformBoilerplate(`${source.title ?? ''} ${source.heading ?? ''} ${source.description ?? ''}`))
    for (const field of ['title','heading','description','text'] as const) {
      const cleaned = withoutPlatformBoilerplate(source[field] ?? '')
      // Sentence isolation prevents a suggested different community or an individual
      // statement from acquiring the role of the adjacent community description.
      const passages = cleaned.split(/(?<=[.!?])\s+/)
      for (const passage of passages) {
        const namedOther = [...passage.matchAll(/\br\/([a-z0-9_]+)/gi)].some(match => !canonicalTarget.toLowerCase().endsWith(`/r/${match[1]!.toLowerCase()}`))
        const unrelated = namedOther || /\b(?:another|other|different|suggested|recommended)\s+(?:community|group|forum|subreddit)\b/i.test(passage)
        const individual = /\b(?:I live|I am|my wedding|one (?:member|participant)|a participant)\b/i.test(passage)
        const identityMention = passage.includes(canonicalTarget.replace(/^https?:\/\/(?:www\.)?/, ''))
        const scopedTarget = reference && !identityMention ? undefined : target
        const role: EvidenceRole = field === 'title' || field === 'heading' ? 'title' : isThread(source.url) ? 'discussion' : !scopedTarget || unrelated || individual ? 'unknown' : participationEvidence(passage) || (hosted && peerParticipation(passage)) || /\b(?:this|our|the) (?:community|group|forum|network|subreddit)\b/i.test(passage) ? 'community_context' : reference ? 'identity_reference' : 'unknown'
        const catalog = createEvidenceCatalog({ [source.candidateId ?? `source:${index}:${field}`]: passage }, source.url)
        for (const excerpt of catalog) output.push({ ...excerpt, id: `E${output.length + 1}`, provenanceField: field === 'heading' ? 'title' : field, candidateId: source.candidateId, canonicalTarget: scopedTarget, role, inspected: source.inspected === true })
      }
    }
  }
  return output
}
export function sufficientCommunityContext(catalog: EvidenceExcerpt[]): boolean {
  return catalog.some(e => e.canonicalTarget && e.role === 'community_context')
}
export function supportsClaim(excerpt: EvidenceExcerpt, claim: string, basis: EvidenceBasis): boolean {
  if (!excerpt.canonicalTarget || basis === 'unknown' || excerpt.role === 'title' || excerpt.role === 'unknown') return false
  if (claim === 'planning_relevance' && basis === 'discussion') return excerpt.role === 'discussion' && /\b(?:planning|wedding|events?|celebrations?)\b/i.test(excerpt.quote)
  if (basis !== 'community_context' && basis !== 'community_fact') return false
  if (excerpt.role !== 'community_context' && excerpt.role !== 'identity_reference') return false
  const text = excerpt.quote
  if (claim === 'audience_alignment') return /\b(?:couples|brides|grooms|planners|homeowners|assistants|families|office managers|residents|parents|filmmakers|students|professionals|consumers)\b/i.test(text)
  if (claim === 'planning_relevance') return /\b(?:planning|discuss|questions|topics|weddings?|events?|celebrations?|consulting|house-building)\b/i.test(text)
  if (basis !== 'community_fact') return false
  if (claim === 'location') return /\b(?:community|group|forum|members?|audience)\b[^.!?]{0,100}\b(?:based in|located in|from|across|serves)\b/i.test(text) && !/\b(?:I |one member|participant)\b/i.test(text)
  if (claim === 'size') return /\b[\d,.]+\s*[KMB]?\s+(?:members|participants)\b/i.test(text)
  if (claim === 'activity') return ![...text.matchAll(/\b((?:19|20)\d{2})\b/g)].some(match => Number(match[1]) < new Date().getUTCFullYear()) && /\b(?:currently|current|now)\b[^.!?]{0,100}\b[\d,.]+\s+posts\s+(?:per|a)\s+(?:day|week|month)\b/i.test(text)
  if (claim === 'demand') return !/\b(?:advice|tips|ideas|tutorials?|questions)\b/i.test(text) && /\b(?:members|community|couples|planners)\b[^.!?]{0,140}\b(?:request|seek|need|buy|purchase)\b[^.!?]{0,100}\b(?:Milo|video (?:service|production)|guest video|video montage)\b/i.test(text)
  return false
}
