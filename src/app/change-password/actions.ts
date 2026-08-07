'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SESSION_COOKIE = 'thorpdv_test_session';

export async function changePassword(formData: FormData) {
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (newPassword.length < 8) {
    redirect('/change-password?error=A%20nova%20senha%20deve%20ter%20pelo%20menos%208%20caracteres.');
  }

  if (newPassword !== confirmPassword) {
    redirect('/change-password?error=As%20senhas%20não%20coincidem.');
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    redirect('/login?error=Sessão%20expirada.%20Entre%20novamente.');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('temp_change_password', {
    p_token: token,
    p_new_password: newPassword,
  });

  const result = data as { ok?: boolean; error?: string } | null;

  if (error || !result?.ok) {
    redirect('/change-password?error=Não%20foi%20possível%20alterar%20a%20senha.');
  }

  redirect('/dashboard');
}
