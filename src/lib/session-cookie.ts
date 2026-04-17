import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'

export const MC_SESSION_COOKIE_NAME = '__Host-mc-session'
export const LEGACY_MC_SESSION_COOKIE_NAME = 'mc-session'
const MC_SESSION_COOKIE_NAMES = [MC_SESSION_COOKIE_NAME, LEGACY_MC_SESSION_COOKIE_NAME] as const

export function getMcSessionCookieName(isSecureRequest: boolean): string {
  const envName = (process.env.MC_SESSION_COOKIE_NAME || '').trim()
  if (envName) return envName

  return isSecureRequest ? MC_SESSION_COOKIE_NAME : LEGACY_MC_SESSION_COOKIE_NAME
}

export function isRequestSecure(request: Request): boolean {
  return request.headers.get('x-forwarded-proto') === 'https'
    || new URL(request.url).protocol === 'https:'
}

export function parseMcSessionCookieHeader(cookieHeader: string): string | null {
  if (!cookieHeader) return null

  // Check custom env name first
  const envName = (process.env.MC_SESSION_COOKIE_NAME || '').trim()
  const namesToTry = envName ? [envName, ...MC_SESSION_COOKIE_NAMES] : MC_SESSION_COOKIE_NAMES

  for (const cookieName of namesToTry) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`))
    if (match) {
      return decodeURIComponent(match[1])
    }
  }
  return null
}

// Deprecated: use getMcSessionCookieName() instead.
// Kept as a fallback for legacy code paths that haven't been migrated.
export const MC_SESSION_COOKIE_NAME_LEGACY = LEGACY_MC_SESSION_COOKIE_NAME

function envFlag(name: string): boolean | undefined {
  const raw = process.env[name]
  if (raw === undefined) return undefined
  const v = String(raw).trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return undefined
}

export function getMcSessionCookieOptions(input: { maxAgeSeconds: number; isSecureRequest?: boolean }): Partial<ResponseCookie> {
  const secureEnv = envFlag('MC_COOKIE_SECURE')
  // Explicit env wins. Otherwise auto-detect: only set secure if request came over HTTPS.
  // Falls back to NODE_ENV=production when no request hint is available.
  const secure = secureEnv ?? input.isSecureRequest ?? (process.env.NODE_ENV === 'production')

  // Lax is the most reliable default for DigitalOcean deployments.
  const sameSiteRaw = (process.env.MC_COOKIE_SAMESITE || 'lax').toLowerCase()
  const sameSite: ResponseCookie['sameSite'] =
    sameSiteRaw === 'strict' ? 'strict' :
    sameSiteRaw === 'none' ? 'none' :
    'lax'

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: input.maxAgeSeconds,
    path: '/',
  }
}
