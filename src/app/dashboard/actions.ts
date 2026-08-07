'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SESSION_COOKIE = 'thorpdv_test_session';

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
