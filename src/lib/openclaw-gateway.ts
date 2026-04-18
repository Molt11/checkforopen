import { runOpenClaw } from './command'

export function parseGatewayJsonOutput(raw: string): unknown | null {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null

  const objectStart = trimmed.indexOf('{')
  const arrayStart = trimmed.indexOf('[')
  const hasObject = objectStart >= 0
  const hasArray = arrayStart >= 0

  let start = -1
  let end = -1

  if (hasObject && hasArray) {
    if (objectStart < arrayStart) {
      start = objectStart
      end = trimmed.lastIndexOf('}')
    } else {
      start = arrayStart
      end = trimmed.lastIndexOf(']')
    }
  } else if (hasObject) {
    start = objectStart
    end = trimmed.lastIndexOf('}')
  } else if (hasArray) {
    start = arrayStart
    end = trimmed.lastIndexOf(']')
  }

  if (start < 0 || end < start) return null

  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function callOpenClawGateway<T = unknown>(
  method: string,
  params: unknown,
  timeoutMs = 10000,
): Promise<T> {
  const result = await runOpenClaw(
    [
      'gateway',
      'call',
      method,
      '--timeout',
      String(Math.max(1000, Math.floor(timeoutMs))),
      '--params',
      JSON.stringify(params ?? {}),
      '--json',
    ],
    { timeoutMs: timeoutMs + 2000 },
  )

  const payload = parseGatewayJsonOutput(result.stdout)
  if (payload == null) {
    throw new Error(`Invalid JSON response from gateway method ${method}`)
  }

  return payload as T
}

export interface GatewayConnection {
  host: string
  port: number
  token: string
}

/**
 * Performs a direct HTTP RPC call to an OpenClaw gateway using its credentials.
 * This is useful for communicating with remote gateways added via the dashboard.
 */
export async function callGatewayRpc<T = unknown>(
  gateway: GatewayConnection,
  method: string,
  params: unknown = {},
  timeoutMs = 30000
): Promise<T> {
  const { host, port, token } = gateway
  
  // Build clean URL
  let baseUrl = host.trim()
  if (!baseUrl.startsWith('http')) {
    baseUrl = `http://${baseUrl}:${port}`
  }
  
  const url = new URL(baseUrl)
  const originalPath = url.pathname
  
  // Try /api/rpc first (legacy/standard), then /rpc as fallback
  const endpoints = ['/api/rpc', '/rpc']
  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    url.pathname = originalPath === '/' ? endpoint : `${originalPath.replace(/\/$/, '')}${endpoint}`
    
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    
    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          method,
          params,
        }),
        signal: controller.signal
      })
      
      if (response.ok) {
        return await response.json() as T
      }
      
      // If we got a 404, try the next endpoint
      if (response.status === 404) {
        lastError = new Error(`Gateway RPC ${method} failed with HTTP 404 at ${endpoint}`)
        continue
      }

      throw new Error(`Gateway RPC ${method} failed with HTTP ${response.status}`)
    } catch (err: any) {
      if (err.name === 'AbortError') throw new Error(`Gateway RPC ${method} timed out after ${timeoutMs}ms`)
      lastError = err
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError || new Error(`Gateway RPC ${method} failed at all endpoints`)
}
