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

export async function erpLoad(resource: string, search?: string) {
  const token = await getSessionToken();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_list', {
    p_token: token,
    p_resource: resource,
    p_search: search?.trim() || null,
  });
  if (error) return { ok: false, error: error.message, data: [] };
  const result = (data ?? {}) as RpcResult;
  return { ok: Boolean(result.ok), error: result.error, data: Array.isArray(result.data) ? result.data : [] };
}

export async function erpSave(resource: string, payload: Record<string, unknown>) {
  const token = await getSessionToken();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_save', {
    p_token: token,
    p_resource: resource,
    p_payload: payload,
  });
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false }) as RpcResult;
}

export async function erpCreateSale(payload: Record<string, unknown>) {
  const token = await getSessionToken();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_create_sale', {
    p_token: token,
    p_payload: payload,
  });
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false }) as RpcResult;
}
