import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as null | {
    code?: string;
    machineId?: string;
    name?: string;
    hostname?: string;
    appVersion?: string;
    capabilities?: Record<string, unknown>;
  };

  if (!body?.code || !body.machineId) {
    return NextResponse.json({ ok: false, error: 'code_and_machine_id_required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pdv_enroll', {
    p_code: body.code,
    p_machine_id: body.machineId,
    p_name: body.name ?? 'ThorPDV Desktop',
    p_hostname: body.hostname ?? null,
    p_app_version: body.appVersion ?? null,
    p_capabilities: body.capabilities ?? {},
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const result = data as { ok?: boolean; error?: string } | null;
  return NextResponse.json(result ?? { ok: false, error: 'empty_response' }, { status: result?.ok ? 200 : 401 });
}
