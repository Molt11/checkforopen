import { NextResponse } from 'next/server'
import { destroySession, getUserFromRequest } from '@/lib/auth'
import { logAuditEvent } from '@/lib/db'
import { getMcSessionCookieOptions, MC_SESSION_COOKIE_NAME } from '@/lib/session-cookie'

export async function POST(request: Request) {
  const user = getUserFromRequest(request)
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${MC_SESSION_COOKIE_NAME}=([^;]*)`))
  const token = match ? decodeURIComponent(match[1]) : null

  if (token) {
    destroySession(token)
  }

  if (user) {
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    logAuditEvent({ action: 'logout', actor: user.username, actor_id: user.id, ip_address: ipAddress })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(MC_SESSION_COOKIE_NAME, '', {
    ...getMcSessionCookieOptions({ maxAgeSeconds: 0 }),
  })

  return response
}
