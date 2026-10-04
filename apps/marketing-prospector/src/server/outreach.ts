import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { callOpenRouter } from './openrouter.ts'
import { prohibitedPromotion } from './leaders.ts'

const barredPromotion = /\b(no|prohibit(?:ed)?|forbid(?:den)?|not allowed|without prior approval|no unsolicited)\b.{0,100}\b(promot(?:ion|ing|e)|ad(?:s|vertis(?:e|ing|ements?))|solicit(?:ation|ations|ing))\b|\b(promot(?:ion|ing|e)|ad(?:s|vertis(?:e|ing|ements?))|solicit(?:ation|ing))\b.{0,100}\b(prohibit(?:ed)?|forbid(?:den)?|not allowed|no)\b/i
const prohibitedClaims = /\$\s?\d|\b(pric(?:e|ing)|commission|referral|guarantee(?:d|s)?|free trial|turnaround|delivery date|available immediately|we can deliver|service capacity)\b/i

export interface DraftInput {
  brief: string
  title: string
  description: string
  pageText: string
  contactRoutes: string[]
  visibleRules: string
}
export interface DraftOutput { body: string; personalizationQuote: string }

export function getOutreachBlocker(input: Pick<DraftInput, 'contactRoutes' | 'visibleRules'>): string | null {
  if (input.contactRoutes.length === 0) return 'No appropriate public contact route was found; do not improvise a private or member contact path.'
  if (barredPromotion.test(input.visibleRules) || prohibitedPromotion.test(input.visibleRules)) return 'Visible community rules appear to bar promotion or unsolicited advertising; do not contact with a promotional message.'
  return null
}

export function validateDraft(value: unknown, input: DraftInput): DraftOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OpenRouter returned invalid outreach draft: expected an object')
  const result = value as Record<string, unknown>
  if (typeof result.body !== 'string' || result.body.trim().length < 40 || result.body.length > 2000) {
    throw new Error('OpenRouter returned invalid outreach draft: body must contain 40–2000 characters')
  }
  if (typeof result.personalizationQuote !== 'string' || result.personalizationQuote.trim().length < 12) {
    throw new Error('OpenRouter returned invalid outreach draft: public-evidence personalization is required')
  }
  const quote = result.personalizationQuote.trim()
  const inspected = `${input.title} ${input.description} ${input.pageText}`.replace(/\s+/g, ' ')
  if (!inspected.includes(quote) || !result.body.includes(quote)) {
    throw new Error('OpenRouter returned invalid outreach draft: personalization must quote visible public evidence')
  }
  if (prohibitedClaims.test(result.body)) throw new Error('OpenRouter returned an outreach draft with an unapproved business claim')
  return { body: result.body.trim(), personalizationQuote: quote }
}

export async function generateOutreachDraft(input: DraftInput, db: DatabaseSync, runId: string): Promise<DraftOutput> {
  const { content } = await callOpenRouter({
    db, runId, maxCompletionTokens: 700,
    messages: [{ role: 'user', content:
      `Write one concise, polite, editable manual partnership introduction for a community operator. Return only JSON {"body":string,"personalizationQuote":exact public-page quote}. Use the exact supplied quote in the body. Introduce Milo only as an AI video editor on WhatsApp and explicitly avoid claims about delivery, service capacity, pricing, referral availability, commissions, free trials, turnaround, or guaranteed outcomes. Do not address or identify private members. Respect the visible rules; do not request permission to spam or bypass restrictions. Ask whether a short overview would be welcome. This is a draft only and must not be sent.\nAudience brief: ${input.brief.slice(0, 1000)}\nPublic page title: ${input.title}\nPublic description: ${input.description}\nPublic text: ${input.pageText.slice(0, 4000)}\nVisible rules: ${input.visibleRules.slice(0, 2000)}\nPublic contact routes: ${input.contactRoutes.join(', ')}` }],
  })
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { throw new Error('OpenRouter returned invalid outreach draft: malformed JSON') }
  return validateDraft(parsed, input)
}

type DraftGenerator = (input: DraftInput, db: DatabaseSync, runId: string) => Promise<DraftOutput>

export function createDraftForSelectedProspect(db: DatabaseSync, prospectId: string, generator: DraftGenerator = generateOutreachDraft): Promise<{ id: string; assessmentId: string; body: string; channelGuide: string; blocker: string | null }> {
  const latestEvidence = db.prepare(`
    SELECT c.verification_status AS status,c.page_state,c.scoring_state,c.permission_status,c.filter_status FROM communities c
    JOIN runs r ON r.id = c.run_id WHERE c.prospect_id = ?
    ORDER BY r.started_at DESC, r.rowid DESC LIMIT 1
  `).get(prospectId) as { status: string; page_state: string; scoring_state: string; permission_status: string; filter_status: string } | undefined
  if (latestEvidence?.status !== 'verified' || latestEvidence.page_state !== 'inspected') throw new Error('Verify this search-only lead before preparing outreach')
  if (latestEvidence.scoring_state !== 'complete') throw new Error('Finish qualification before preparing outreach')
  if (latestEvidence.filter_status === 'excluded') throw new Error('This community is excluded by the saved research filters')
  const prospect = db.prepare(`
    SELECT p.id, p.review_state AS reviewState, a.id AS assessmentId,a.score AS relevance,a.coverage, r.id AS runId, r.brief,
      c.id AS communityId,c.title, c.description, c.extracted_text AS pageText, c.contact_routes_json AS contactRoutesJson
    FROM prospects p
    JOIN assessments a ON a.prospect_id = p.id
    JOIN runs r ON r.id = a.run_id
    LEFT JOIN communities c ON c.prospect_id = p.id AND c.run_id = a.run_id
    WHERE p.id = ? ORDER BY r.started_at DESC LIMIT 1
  `).get(prospectId) as {
    id: string; reviewState: string; assessmentId: string; relevance: number | null; coverage: number; runId: string; brief: string; title: string | null;
    description: string | null; pageText: string | null; contactRoutesJson: string | null; communityId: string
  } | undefined
  if (!prospect) throw new Error('Prospect not found')
  if (prospect.reviewState !== 'selected') throw new Error('Select this prospect before preparing outreach')
  if (prospect.relevance === null || prospect.coverage <= 0) throw new Error('This community needs supported fit evidence before outreach')
  const leaderRoutes = db.prepare("SELECT business_route FROM community_leaders WHERE community_id=? AND status='verified' AND business_route IS NOT NULL AND contact_evidence_json IS NOT NULL").all(prospect.communityId).map(l => String(l.business_route))
  const contactRoutes = [...new Set([...leaderRoutes, ...JSON.parse(prospect.contactRoutesJson ?? '[]') as string[]])]
  const visibleRules = `${prospect.title ?? ''} ${prospect.description ?? ''} ${prospect.pageText ?? ''}`
  const input: DraftInput = {
    brief: prospect.brief, title: prospect.title ?? '', description: prospect.description ?? '',
    pageText: prospect.pageText ?? '', contactRoutes, visibleRules,
  }
  const blocker = getOutreachBlocker(input) ?? (latestEvidence.permission_status !== 'allowed' ? 'Promotion permission is unknown or prohibited; verify explicit public rules before preparing a promotional draft.' : null)
  return (async () => {
    const draft = blocker ? { body: '', personalizationQuote: '' } : await generator(input, db, prospect.runId)
    const channelGuide = blocker ? '' : `Manual only: open the publicly listed route ${contactRoutes[0]}. Re-check the current community rules before sending, edit this draft yourself, and submit it yourself only if promotion is allowed. This app does not send messages.`
    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(`
      INSERT INTO drafts (id, assessment_id, body, channel_guide, blocker, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, prospect.assessmentId, draft.body, channelGuide, blocker, now, now)
    return { id, assessmentId: prospect.assessmentId, body: draft.body, channelGuide, blocker }
  })()
}
