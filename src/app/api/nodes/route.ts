import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getDatabase } from '@/lib/db'
import { callGatewayRpc } from '@/lib/openclaw-gateway'

const GATEWAY_TIMEOUT = 5000

interface GatewayEntry {
  id: number
  name: string
  host: string
  port: number
  token: string
  status: string
  is_primary: number
}

async function getAllGateways(): Promise<GatewayEntry[]> {
  try {
    const db = getDatabase()
    return db.prepare("SELECT * FROM gateways").all() as GatewayEntry[]
  } catch (err) {
    logger.error({ err }, 'Failed to fetch gateways from database')
    return []
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const action = request.nextUrl.searchParams.get('action') || 'list'
  const gateways = await getAllGateways()

  if (action === 'list') {
    const allNodes: any[] = []
    let anyConnected = false

    await Promise.all(
      gateways.map(async (gw) => {
        try {
          const data = await callGatewayRpc<{ nodes?: any[] }>(
            { host: gw.host, port: gw.port, token: gw.token },
            'node.list',
            {},
            GATEWAY_TIMEOUT
          )
          if (data?.nodes) {
            allNodes.push(...data.nodes.map(n => ({ ...n, gateway_name: gw.name })))
          }
          anyConnected = true
        } catch (err) {
          logger.warn({ err, gateway: gw.name }, 'Failed to fetch nodes from gateway')
        }
      })
    )

    return NextResponse.json({ nodes: allNodes, connected: anyConnected })
  }

  if (action === 'devices') {
    const allDevices: any[] = []

    await Promise.all(
      gateways.map(async (gw) => {
        try {
          const data = await callGatewayRpc<{ devices?: any[] }>(
            { host: gw.host, port: gw.port, token: gw.token },
            'device.pair.list',
            {},
            GATEWAY_TIMEOUT
          )
          if (data?.devices) {
            allDevices.push(...data.devices.map(d => ({ ...d, gateway_name: gw.name })))
          }
        } catch (err) {
          logger.warn({ err, gateway: gw.name }, 'Failed to fetch devices from gateway')
        }
      })
    )

    return NextResponse.json({ devices: allDevices })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

const VALID_DEVICE_ACTIONS = ['approve', 'reject', 'rotate-token', 'revoke-token'] as const
type DeviceAction = (typeof VALID_DEVICE_ACTIONS)[number]

const ACTION_RPC_MAP: Record<DeviceAction, { method: string; paramKey: 'requestId' | 'deviceId' }> = {
  'approve':      { method: 'device.pair.approve', paramKey: 'requestId' },
  'reject':       { method: 'device.pair.reject',  paramKey: 'requestId' },
  'rotate-token': { method: 'device.token.rotate',  paramKey: 'deviceId' },
  'revoke-token': { method: 'device.token.revoke',  paramKey: 'deviceId' },
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as string
  const gatewayName = body.gateway_name as string

  if (!action || !VALID_DEVICE_ACTIONS.includes(action as DeviceAction)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_DEVICE_ACTIONS.join(', ')}` },
      { status: 400 },
    )
  }

  const gateways = await getAllGateways()
  const targetGw = gatewayName 
    ? gateways.find(g => g.name === gatewayName)
    : gateways.find(g => g.is_primary === 1) || gateways[0]

  if (!targetGw) {
    return NextResponse.json({ error: 'Target gateway not found' }, { status: 404 })
  }

  const spec = ACTION_RPC_MAP[action as DeviceAction]
  const id = body[spec.paramKey] as string | undefined
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: `Missing required field: ${spec.paramKey}` }, { status: 400 })
  }

  const params: Record<string, any> = { [spec.paramKey]: id }
  if ((action === 'rotate-token' || action === 'revoke-token') && body.role) {
    params.role = body.role
  }
  if (action === 'rotate-token' && Array.isArray(body.scopes)) {
    params.scopes = body.scopes
  }

  try {
    const result = await callGatewayRpc(
      { host: targetGw.host, port: targetGw.port, token: targetGw.token },
      spec.method,
      params,
      GATEWAY_TIMEOUT
    )
    return NextResponse.json(result)
  } catch (err: any) {
    logger.error({ err, gateway: targetGw.name }, 'Gateway device action failed')
    return NextResponse.json({ error: 'Gateway device action failed' }, { status: 502 })
  }
}
