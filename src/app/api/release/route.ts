import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    service: 'ThorPDV',
    release: 'erp-integrated-modules-v1-20260807',
    modules: ['cadastros','produtos','precos','compras','estoque','vendas','financeiro','caixa','fiscal','relatorios','atendimento'],
    status: 'ready-for-integrated-tests',
    timestamp: new Date().toISOString(),
  });
}
