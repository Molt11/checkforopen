import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { logger } from '@/lib/logger';

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  const ua = request.headers.get('user-agent') || 'unknown';

  try {
    const db = getDatabase();
    
    // Update the tracking record
    const stmt = db.prepare(`
      UPDATE email_tracking 
      SET status = 'opened', 
          opened_at = unixepoch(),
          ip_address = ?,
          user_agent = ?
      WHERE id = ? AND status != 'opened'
    `);
    
    const result = stmt.run(ip, ua, id);

    if (result.changes > 0) {
      logger.info({ emailId: id, ip }, 'Email opened');
      
      // Also log to activities if you want it in the stream
      const activityStmt = db.prepare(`
        INSERT INTO activities (type, entity_type, entity_id, actor, description, created_at, workspace_id)
        SELECT 'email_opened', 'email', 0, recipient, 'Email opened by ' || recipient, unixepoch(), workspace_id
        FROM email_tracking WHERE id = ?
      `);
      activityStmt.run(id);
    }
  } catch (error) {
    logger.error({ err: error, emailId: id }, 'Error tracking email open');
  }

  // Always return the pixel, even if DB update fails
  return new NextResponse(TRACKING_PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
