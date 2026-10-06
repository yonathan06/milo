// Matches the landing-page's case-sensitive ASCII code grammar (1–64 chars).
// Exactly one marker; ASCII space/tab around the code. Ambiguity stays unattributed.
export function parseReferral(text: string | null): string | null {
  if (!text || text.length > 16_384) return null;
  const markers = [...text.matchAll(/\[ref:[^\]]*\]/g)];
  if (markers.length !== 1) return null;
  return /^\[ref:[ \t]*([A-Za-z0-9_-]{1,64})[ \t]*\]$/.exec(markers[0]![0])?.[1] ?? null;
}
