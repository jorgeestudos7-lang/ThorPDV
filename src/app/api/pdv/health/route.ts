import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'ThorPDV Sync API',
    protocol: 1,
    capabilities: ['enroll', 'pull', 'push', 'heartbeat', 'offline-queue'],
    timestamp: new Date().toISOString(),
  });
}
