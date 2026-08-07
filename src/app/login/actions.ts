'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://thorpdv.vercel.app';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirect('/login?error=Informe%20email%20e%20senha');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent('Não foi possível entrar. Verifique suas credenciais.')}`);
  }

  redirect('/dashboard');
}

export async function signup(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('fullName') ?? '').trim();

  if (!email || password.length < 8) {
    redirect('/login?error=Use%20um%20email%20válido%20e%20senha%20com%208%20ou%20mais%20caracteres');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${APP_URL}/login`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  if (data.session) {
    redirect('/dashboard');
  }

  redirect('/login?message=Conta%20criada.%20Confira%20seu%20email%20para%20confirmar%20o%20cadastro.');
}
