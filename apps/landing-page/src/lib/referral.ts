// Shared protocol contract: case-sensitive ASCII, 1–64 characters.
// Backend marker parsers must use the same grammar; unknown codes are valid.
export const REFERRAL_COOKIE = 'milo_ref';
export const REFERRAL_MAX_AGE = 30 * 24 * 60 * 60;
export function usableReferral(value: string | null | undefined): string | undefined {
  return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined;
}

export function explicitReferral(search: string): string | undefined {
  const values = new URLSearchParams(search).getAll('ref');
  // Reject ambiguous repeated parameters, even when they have identical values.
  return values.length === 1 ? usableReferral(values[0]) : undefined;
}

export function readCookie(cookies: string, name: string): string | undefined {
  const entry = cookies.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  try { return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined; }
  catch { return undefined; }
}

export function referralCookie(ref: string, secure: boolean): string {
  if (!usableReferral(ref)) throw new Error('Invalid referral');
  return `${REFERRAL_COOKIE}=${encodeURIComponent(ref)}; Max-Age=${REFERRAL_MAX_AGE}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function deleteCookie(name: string, secure: boolean): string {
  return `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}
