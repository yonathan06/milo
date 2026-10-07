// Development-only access policy; hostname checks are NOT authentication.
export function allowsSimulatorRequest(request: Request, allowTunnels: boolean): boolean {
  const url = new URL(request.url);
  const tunnel = allowTunnels && url.hostname.endsWith(".trycloudflare.com");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !tunnel) return false;
  if (!url.pathname.startsWith("/dev/")) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin || origin === url.origin) return true;
  // Cloudflared terminates TLS; permit HTTPS Origin for the SAME tunnel host.
  // Do not permit arbitrary sibling trycloudflare origins to call this simulator.
  return tunnel && origin === `https://${url.host}`;
}
