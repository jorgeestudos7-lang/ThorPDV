import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    service: 'ThorPDV',
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}
