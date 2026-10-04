import { isIP } from 'node:net'
export type ProspectType = 'facebook_group' | 'whatsapp_community' | 'community'
export interface CanonicalProspect { type: ProspectType; identity: string; url: string; originalUrl: string }
export function privateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase()
  if (ip.includes(':')) {
    if (ip.startsWith('::ffff:')) {
      const tail = ip.slice(7)
      if (tail.includes('.')) return privateAddress(tail)
      const parts = tail.split(':').map(x => parseInt(x, 16))
      return parts.length !== 2 || privateAddress(`${parts[0]! >> 8}.${parts[0]! & 255}.${parts[1]! >> 8}.${parts[1]! & 255}`)
    }
    return ip === '::1' || ip === '::' || /^(fc|fd|fe[89ab]|ff)/.test(ip) || ip.startsWith('2001:db8:')
  }
  const p = ip.split('.').map(Number)
  return p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255) || p[0] === 0 || p[0] === 10 || p[0] === 127
    || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31)
    || (p[0] === 192 && (p[1] === 168 || p[1] === 0)) || (p[0] === 100 && p[1]! >= 64 && p[1]! <= 127) || p[0]! >= 224
}
export function parsePublicUrl(input: string): URL {
  const url = new URL(input.trim())
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port
    || /(^|\.)(localhost|local|internal|onion)$/.test(host) || (isIP(host) && privateAddress(host))) throw new Error('Expected public HTTP(S) URL without credentials or custom port')
  return url
}
export function normalizeProspectUrl(type: ProspectType, input: string): CanonicalProspect {
  const originalUrl = input.trim(), url = parsePublicUrl(originalUrl)
  const host = url.hostname.toLowerCase().replace(/^(www|m|old)\./, '')
  const parts = url.pathname.split('/').filter(Boolean)
  url.hash = ''; url.hostname = host
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  if (type === 'facebook_group') {
    if (host !== 'facebook.com' || parts[0]?.toLowerCase() !== 'groups' || !/^[A-Za-z0-9.-]+$/.test(parts[1] ?? '')
      || ['feed','discover','joins','create','search'].includes(parts[1]!.toLowerCase())
      || !(parts.length === 2 || (parts.length === 4 && ['posts','permalink'].includes(parts[2]!) && /^\d+$/.test(parts[3]!)))) throw new Error('Expected public Facebook group shape')
    return { type, identity: parts[1]!.toLowerCase(), url: `https://www.facebook.com/groups/${parts[1]!.toLowerCase()}`, originalUrl }
  }
  if (type === 'whatsapp_community') {
    if (host !== 'chat.whatsapp.com' || parts.length !== 1 || !/^[A-Za-z0-9_-]+$/.test(parts[0]!)) throw new Error('Expected public WhatsApp invite shape')
    return { type, identity: parts[0]!, url: `https://chat.whatsapp.com/${parts[0]}`, originalUrl }
  }
  if (type !== 'community') throw new Error('Only community identities are supported')
  if (host === 'reddit.com') {
    if (parts[0]?.toLowerCase() !== 'r' || !/^[A-Za-z0-9_]{2,21}$/.test(parts[1] ?? '')
      || !(parts.length === 2 || (parts[2] === 'comments' && parts.length >= 4 && parts.length <= 6 && /^[a-z0-9]+$/i.test(parts[3]!)))) throw new Error('Expected subreddit or supported discussion shape')
    url.protocol = 'https:'; url.pathname = `/r/${parts[1]!.toLowerCase()}`; url.search = ''
  } else if (host === 'discord.gg' || host === 'discord.com') {
    if (!(host === 'discord.gg' ? parts.length === 1 : parts.length === 2 && ['invite','servers'].includes(parts[0]!))
      || !/^[A-Za-z0-9_-]+$/.test(parts.at(-1) ?? '')) throw new Error('Expected public Discord community invite shape')
    url.protocol = 'https:'; url.search = ''
  } else if (/(^|\.)(facebook\.com|whatsapp\.com|youtube\.com|instagram\.com|tiktok\.com|twitch\.tv|x\.com|linkedin\.com|reddit\.com|discord\.com)$/.test(host)) {
    throw new Error('Unsupported community URL shape')
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return { type, identity: url.toString(), url: url.toString(), originalUrl }
}
export function normalizeCommunityUrl(input: string): CanonicalProspect {
  const host = parsePublicUrl(input).hostname.replace(/^(www|m)\./, '')
  return normalizeProspectUrl(host === 'facebook.com' ? 'facebook_group' : host === 'chat.whatsapp.com' ? 'whatsapp_community' : 'community', input)
}
