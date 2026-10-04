const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
// Pin labels that differ between Node/Chromium CLDR releases so SSR hydration
// and saved country constraints use the same names on both sides.
const stableNames: Record<string, string> = { FK: 'Falkland Islands', HK: 'Hong Kong SAR China', MO: 'Macao SAR China', PS: 'Palestinian Territories' }
const names = { of: (code: string) => stableNames[code] ?? displayNames.of(code) }
// ISO 3166-1 alpha-2 codes (kept client-safe; no server dependencies).
const codes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ')
export const countries = codes.map(code => ({ code, name: names.of(code)! })).sort((a, b) => a.name.localeCompare(b.name))
export interface SearchFilters { countries: string[]; minAudience: number | null; maxAudience: number | null }
export function validateSearchFilters(value: Record<string, unknown>): SearchFilters {
  if (value.country !== undefined) throw new Error('Use the countries array; legacy single-country requests are not supported')
  const selection = value.countries ?? []
  if (!Array.isArray(selection) || selection.some(code => typeof code !== 'string' || !codes.includes(code))) throw new Error('Select valid countries')
  const selectedCountries = [...new Set(selection)] as string[]
  function bound(input: unknown): number | null {
    if (input == null || input === '') return null
    if (typeof input !== 'number' && typeof input !== 'string') throw new Error('Audience size must be a non-negative whole number')
    const n = Number(input)
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Audience size must be a non-negative whole number')
    return n
  }
  const minAudience = bound(value.minAudience), maxAudience = bound(value.maxAudience)
  if (minAudience !== null && maxAudience !== null && minAudience > maxAudience) throw new Error('Minimum audience size cannot exceed maximum')
  return { countries: selectedCountries, minAudience, maxAudience }
}
export function filterBrief(brief: string, filters: SearchFilters): string {
  // Reused briefs may already contain one or more generated constraint blocks.
  brief = brief.replace(/\n\nRequired search constraints \(override conflicting brief text\):\n(?:Countries \(match any, not all\):[^\n]*|Minimum audience:[^\n]*|Maximum audience:[^\n]*)(?:\n(?:Countries \(match any, not all\):[^\n]*|Minimum audience:[^\n]*|Maximum audience:[^\n]*))*/g, '').trim()
  const constraints = [filters.countries.length > 0 && `Countries (match any, not all): ${filters.countries.map(code => names.of(code)).join(', ')}`, filters.minAudience !== null && `Minimum audience: ${filters.minAudience}`, filters.maxAudience !== null && `Maximum audience: ${filters.maxAudience}`].filter(Boolean)
  return constraints.length ? `${brief}\n\nRequired search constraints (override conflicting brief text):\n${constraints.join('\n')}` : brief
}
export function matchFilters(filters: SearchFilters, country: string | null, size: number | null): 'match' | 'unknown' | 'excluded' {
  if ((filters.countries.length > 0 && country && !filters.countries.includes(country)) || (size !== null && ((filters.minAudience !== null && size < filters.minAudience) || (filters.maxAudience !== null && size > filters.maxAudience)))) return 'excluded'
  if ((filters.countries.length > 0 && !country) || ((filters.minAudience !== null || filters.maxAudience !== null) && size === null)) return 'unknown'
  return 'match'
}
