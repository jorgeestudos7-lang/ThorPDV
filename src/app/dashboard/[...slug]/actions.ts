'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SESSION_COOKIE = 'thorpdv_test_session';

type RpcResult = { ok?: boolean; error?: string; data?: Record<string, unknown>[]; id?: string; [key: string]: unknown };

async function getSessionToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect('/login');
  return token;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: error.message } as RpcResult;
  return (data ?? { ok: false }) as RpcResult;
}

export async function erpLoad(resource: string, search?: string) {
  const token = await getSessionToken();
  const result = await rpc('erp_list', { p_token: token, p_resource: resource, p_search: search?.trim() || null });
  return { ok: Boolean(result.ok), error: result.error, data: Array.isArray(result.data) ? result.data : [] };
}

export async function erpSave(resource: string, payload: Record<string, unknown>) {
  const token = await getSessionToken();
  return resource === 'stock'
    ? rpc('erp_stock_move', { p_token: token, p_payload: payload })
    : rpc('erp_save', { p_token: token, p_resource: resource, p_payload: payload });
}

export async function erpCreateSale(payload: Record<string, unknown>) {
  const token = await getSessionToken();
  return rpc('erp_create_sale', { p_token: token, p_payload: payload });
}

export async function erpPriceTableDetail(tableId: string) {
  const token = await getSessionToken();
  return rpc('erp_price_table_detail', { p_token: token, p_table_id: tableId });
}

export async function erpPriceTableSetItem(tableId: string, productId: string, price: number) {
  const token = await getSessionToken();
  return rpc('erp_price_table_set_item', { p_token: token, p_table_id: tableId, p_product_id: productId, p_price: price });
}

export async function erpPriceTableCopy(sourceId: string, name: string) {
  const token = await getSessionToken();
  return rpc('erp_price_table_copy', { p_token: token, p_source_id: sourceId, p_name: name });
}

export async function erpInventoryStart(notes?: string) {
  const token = await getSessionToken();
  return rpc('erp_inventory_start', { p_token: token, p_notes: notes || null });
}

export async function erpInventoryDetail(inventoryId: string) {
  const token = await getSessionToken();
  return rpc('erp_inventory_detail', { p_token: token, p_inventory_id: inventoryId });
}

export async function erpInventoryCount(inventoryId: string, productId: string, counted: number) {
  const token = await getSessionToken();
  return rpc('erp_inventory_set_count', { p_token: token, p_inventory_id: inventoryId, p_product_id: productId, p_counted: counted });
}

export async function erpInventoryClose(inventoryId: string) {
  const token = await getSessionToken();
  return rpc('erp_inventory_close', { p_token: token, p_inventory_id: inventoryId });
}

export async function erpCashList() {
  const token = await getSessionToken();
  const result = await rpc('erp_cash_list', { p_token: token });
  return { ok: Boolean(result.ok), error: result.error, data: Array.isArray(result.data) ? result.data : [] };
}

export async function erpCashOpen(posId: string, opening: number) {
  const token = await getSessionToken();
  return rpc('erp_cash_open', { p_token: token, p_pos_id: posId, p_opening: opening });
}

export async function erpCashClose(cashId: string, closing: number, notes?: string) {
  const token = await getSessionToken();
  return rpc('erp_cash_close', { p_token: token, p_cash_id: cashId, p_closing: closing, p_notes: notes || null });
}

export async function erpReport(report: 'sales'|'finance'|'stock', start?: string, end?: string, branchId?: string) {
  const token = await getSessionToken();
  const result = await rpc('erp_report', {
    p_token: token,
    p_report: report,
    p_start: start || null,
    p_end: end || null,
    p_branch: branchId || null,
  });
  return { ok: Boolean(result.ok), error: result.error, data: Array.isArray(result.data) ? result.data : [], start: result.start, end: result.end };
}
