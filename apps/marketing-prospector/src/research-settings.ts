// Client-safe settings shared by forms, request validation, and frozen runs.
export const researchLanes = ['facebook_group', 'whatsapp_community', 'reddit_community', 'public_forum', 'discord_community'] as const
export type ResearchLane = typeof researchLanes[number]
export const eventSegments = ['wedding', 'family_event', 'company_event', 'professional_planner', 'custom'] as const
export type EventSegment = typeof eventSegments[number]
export type AudienceKind = 'consumer' | 'professional' | 'mixed'
export type ResearchSettings = {
  planVersion: 2
  researchMode: 'community'
  segment: EventSegment
  audienceKind: AudienceKind
  selectedLanes: ResearchLane[]
  discoverLeaders: boolean
}

export function defaultCommunitySettings(): ResearchSettings {
  return { planVersion: 2, researchMode: 'community', segment: 'custom', audienceKind: 'mixed', selectedLanes: ['facebook_group', 'reddit_community', 'public_forum'], discoverLeaders: true }
}

export function validateResearchSettings(value: unknown): ResearchSettings {
  if (value === undefined) throw new Error('Community research settings are required')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid research settings')
  const data = value as Record<string, unknown>
  if (Object.keys(data).some(key => !['planVersion', 'researchMode', 'segment', 'audienceKind', 'selectedLanes', 'discoverLeaders'].includes(key))) throw new Error('Unknown research setting')
  if (data.planVersion !== 2) throw new Error('Community research requires plan version 2')
  if (data.researchMode !== 'community') throw new Error('Only community research is supported')
  if (!eventSegments.includes(data.segment as EventSegment)) throw new Error('Invalid event segment')
  if (!['consumer', 'professional', 'mixed'].includes(String(data.audienceKind))) throw new Error('Invalid audience kind')
  if (data.segment === 'professional_planner' && data.audienceKind !== 'professional') throw new Error('Professional-planner research requires a professional audience')
  if (!Array.isArray(data.selectedLanes) || data.selectedLanes.length === 0 || data.selectedLanes.some(lane => !researchLanes.includes(lane))) throw new Error('Select valid discovery lanes')
  if (new Set(data.selectedLanes).size !== data.selectedLanes.length) throw new Error('Discovery lanes must be unique')
  if (typeof data.discoverLeaders !== 'boolean') throw new Error('Leader discovery must be a boolean')
  return {
    planVersion: data.planVersion, researchMode: data.researchMode,
    segment: data.segment as EventSegment, audienceKind: data.audienceKind as AudienceKind,
    selectedLanes: [...data.selectedLanes] as ResearchLane[], discoverLeaders: data.discoverLeaders,
  }
}

export function decodeResearchRequest(value: Record<string, unknown>): ResearchSettings {
  return validateResearchSettings(value.researchSettings)
}
