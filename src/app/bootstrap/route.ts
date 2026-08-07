import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SESSION_COOKIE = 'thorpdv_test_session';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=Link%20de%20acesso%20inválido.', request.url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('temp_bootstrap_once', { p_token: token });

  const result = data as {
    ok?: boolean;
    error?: string;
    session_token?: string;
    must_change_password?: boolean;
  } | null;

  if (error || !result?.ok || !result.session_token) {
    return NextResponse.redirect(new URL('/login?error=Link%20de%20acesso%20expirado%20ou%20já%20utilizado.', request.url));
  }

  const response = NextResponse.redirect(new URL('/change-password', request.url));
  response.cookies.set(SESSION_COOKIE, result.session_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 30,
  });

  return response;
}
