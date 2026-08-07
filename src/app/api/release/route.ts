import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    service: 'ThorPDV',
    release: 'pdv-sync-recovery-stock-fix-v0.3.2-20260807',
    modules: ['cadastros','produtos','precos','compras','estoque','vendas','financeiro','caixa','fiscal','relatorios','pdv-desktop','sync-recovery'],
    status: 'ready-for-bidirectional-sync-retest',
    timestamp: new Date().toISOString(),
  });
}
