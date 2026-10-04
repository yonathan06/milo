export interface LandingSuggestion {
  language: string | null
  domain: string
  messageAngle: string
  verificationWarning: string | null
}

function inferLanguage(text: string): string | null {
  if (/[\u0590-\u05ff]/.test(text)) return 'Hebrew (inferred)'
  if (/[\u0600-\u06ff]/.test(text)) return 'Arabic (inferred)'
  if (/[\u0400-\u04ff]/.test(text)) return 'Cyrillic-language content (inferred)'
  return null
}

export function createLandingSuggestion(input: {
  title: string
  brief: string
  url: string
  communityType: string
  pageText: string
  confidence: 'low' | 'medium' | 'high'
}): LandingSuggestion {
  const domain = new URL(input.url).hostname.replace(/^www\./, '').toLowerCase()
  const language = inferLanguage(`${input.title} ${input.pageText}`)
  const audience = input.title.trim().slice(0, 100) || input.brief.trim().slice(0, 100) || 'this audience'
  const angle = `Consider a page angle for ${audience}: introduce Milo's WhatsApp-based video-editing concept through the kinds of event and community stories this audience shares. Verify the audience fit and wording before using it.`
  const warnings = [
    input.confidence === 'low' ? 'Low-confidence prospect match; verify relevance before using this suggestion.' : null,
    language ? `${language}; verify the prospect's preferred language.` : 'Prospect language is unknown; verify language before drafting page content.',
  ].filter(Boolean)
  return {
    language,
    domain,
    messageAngle: angle,
    verificationWarning: warnings.join(' '),
  }
}
