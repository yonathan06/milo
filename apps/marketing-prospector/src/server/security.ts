const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost'])
const TUNNEL_HOST = 'parents-managers-had-cons.trycloudflare.com'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isAllowedLocalMutation(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false

  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    return false
  }

  const requestHost = host.toLowerCase().split(':')[0]
  const originHost = originUrl.hostname.toLowerCase()
  if (LOOPBACK_HOSTS.has(requestHost) && LOOPBACK_HOSTS.has(originHost)) {
    return originUrl.protocol === 'http:' && originUrl.host.toLowerCase() === host.toLowerCase()
  }

  return requestHost === TUNNEL_HOST && originHost === TUNNEL_HOST && originUrl.protocol === 'https:'
}

export function isMutationMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase())
}
