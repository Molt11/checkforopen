import { NextResponse } from 'next/server'
import { destroySession, getUserFromRequest } from '@/lib/auth'
import { logAuditEvent } from '@/lib/db'
import { getMcSessionCookieOptions, getMcSessionCookieName } from '@/lib/session-cookie'

export async function POST(request: Request) {
  const user = getUserFromRequest(request)
  const cookieHeader = request.headers.get('cookie') || ''
  const isSecureRequest = (request.headers.get('x-forwarded-proto') === 'https' || new URL(request.url).protocol === 'https:')
  const cookieName = getMcSessionCookieName(isSecureRequest)
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`))
  const token = match ? decodeURIComponent(match[1]) : null

  if (token) {
    destroySession(token)
  }

  if (user) {
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    logAuditEvent({ action: 'logout', actor: user.username, actor_id: user.id, ip_address: ipAddress })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(cookieName, '', {
    ...getMcSessionCookieOptions({ maxAgeSeconds: 0, isSecureRequest }),
  })

  return response
}
