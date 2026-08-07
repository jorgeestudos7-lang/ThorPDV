'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SESSION_COOKIE = 'thorpdv_test_session';

export async function dashboardLoad(start?: string, end?: string, branchId?: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, error: 'temporary_session_required' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_dashboard', {
    p_token: token,
    p_start: start || null,
    p_end: end || null,
    p_branch: branchId || null,
  });
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false }) as Record<string, unknown>;
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const supabase = await createClient();

  if (token) {
    await supabase.rpc('temp_logout', { p_token: token });
    cookieStore.delete(SESSION_COOKIE);
  }

  await supabase.auth.signOut();
  redirect('/login');
}
