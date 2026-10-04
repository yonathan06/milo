export type Platform =
  | 'reddit' | 'facebook' | 'discord' | 'telegram' | 'whatsapp' | 'meetup'
  | 'linkedin' | 'slack' | 'skool' | 'circle' | 'mighty' | 'forum' | 'other';

export interface SegmentConfig {
  name: string;
  audience: string;
  pains: string[];
  keywords: string[];
  excludeHints: string[];
}

export interface RunOptions {
  segment: string;
  geo?: string;          // e.g. "US", "Germany", "Israel"
  languages: string[];   // e.g. ["en"], ["de","en"], ["he"]
  maxCandidates: number; // how many communities to enrich
  queriesPerPlatform: number;
  notes?: string;        // free-text steering ("focus on budget brides")
}

export interface PlannedQuery {
  q: string;
  platform: Platform | 'directory' | 'any';
  language: string;
  intent: 'find_community' | 'find_directory' | 'find_discussion';
  rationale?: string;
}

export interface QueryPlan {
  segment: string;
  createdAt: string;
  queries: PlannedQuery[];
}

export interface SearchHit {
  url: string;
  title: string;
  description: string;
  extraSnippets: string[];
  query: string;
  age?: string;
}

export interface Evidence {
  source: 'search' | 'page' | 'platform_api' | 'recon' | 'directory';
  url: string;
  text: string;
}

export interface Candidate {
  key: string;            // canonical id, e.g. "reddit:r/weddingplanning"
  platform: Platform;
  url: string;            // canonical community URL
  name?: string;
  hits: number;           // how many search results pointed here
  queries: string[];
  evidence: Evidence[];
  discoveredVia: 'search' | 'directory';
}

export type PromoPolicy = 'allowed' | 'with_permission' | 'restricted' | 'forbidden' | 'unknown';
export type Approach = 'admin_partnership' | 'direct_post' | 'value_comment' | 'join_and_engage' | 'skip';

export interface Contact {
  name?: string;
  role?: string;          // admin, moderator, founder, organizer
  channel: string;        // email | platform_dm | linkedin | instagram | website_form | phone | other
  value: string;          // address / handle / url
  notes?: string;
}

export interface CommunityProfile {
  key: string;
  platform: Platform;
  url: string;
  name: string;
  description: string;
  audience: string;
  language: string;
  geo: string;
  memberCount: number | null;
  activity: 'high' | 'medium' | 'low' | 'dead' | 'unknown';
  activityHint: string;
  isRelevantCommunity: boolean; // false if it's not really a community (a vendor page, article...)
  contacts: Contact[];
  joinRequirements: string;
  promoPolicy: PromoPolicy;
  rulesSummary: string;
  canPostDirectly: boolean | null;
  canComment: boolean | null;
  recommendedApproach: Approach;
  approachRationale: string;
  openerDraft: string;
  scores: { relevance: number; intent: number; activity: number; accessibility: number }; // 0..10
  confidence: number; // 0..1
  evidenceUrls: string[];
}

export interface RankedCommunity extends CommunityProfile {
  score: number;      // 0..100
  rank: number;
  scoreBreakdown: Record<string, number>;
}
