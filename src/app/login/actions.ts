'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SESSION_COOKIE = 'thorpdv_test_session';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirect('/login?error=Informe%20email%20e%20senha');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('temp_login', {
    p_email: email,
    p_password: password,
  });

  const result = data as {
    ok?: boolean;
    error?: string;
    session_token?: string;
    must_change_password?: boolean;
  } | null;

  if (error || !result?.ok || !result.session_token) {
    const message = result?.error === 'temporarily_locked'
      ? 'Acesso temporariamente bloqueado após várias tentativas. Tente novamente em alguns minutos.'
      : 'Email ou senha inválidos.';
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, result.session_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });

  if (result.must_change_password) {
    redirect('/change-password');
  }

  redirect('/dashboard');
}
