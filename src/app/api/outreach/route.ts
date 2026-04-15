import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/outreach - Get list of sent emails for outreach tracking
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const db = getDatabase();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const emails = db.prepare(`
      SELECT * FROM email_tracking 
      ORDER BY sent_at DESC 
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM email_tracking').get() as { count: number };

    return NextResponse.json({
      emails,
      total: total.count,
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /api/outreach error');
    return NextResponse.json({ error: 'Failed to fetch outreach data' }, { status: 500 });
  }
}

/**
 * POST /api/outreach - Register a sent email for tracking
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id, recipient, subject, body, status, sent_at, workspace_id } = await request.json();

    if (!id || !recipient) {
      return NextResponse.json({ error: 'Missing required fields (id, recipient)' }, { status: 400 });
    }

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO email_tracking (id, recipient, subject, body, status, sent_at, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Enforce workspace isolation unless admin
    const resolvedWorkspaceId = auth.user.role === 'admin' 
      ? (workspace_id || auth.user.workspace_id || 1)
      : (auth.user.workspace_id || 1);

    stmt.run(
      id,
      recipient,
      subject || null,
      body || null,
      status || 'sent',
      sent_at || Math.floor(Date.now() / 1000),
      resolvedWorkspaceId
    );

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'Tracking record already exists' }, { status: 409 });
    }
    logger.error({ err: error }, 'POST /api/outreach error');
    return NextResponse.json({ error: 'Failed to register tracking record' }, { status: 500 });
  }
}

/**
 * PATCH /api/outreach - Update a tracking record (e.g. schedule follow-up)
 */
export async function PATCH(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id, followup_at, followup_status } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Missing email ID' }, { status: 400 });
    }

    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE email_tracking 
      SET followup_at = ?, followup_status = ?
      WHERE id = ?
    `);

    const result = stmt.run(followup_at, followup_status || 'pending', id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Email record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/outreach error');
    return NextResponse.json({ error: 'Failed to update outreach record' }, { status: 500 });
  }
}
