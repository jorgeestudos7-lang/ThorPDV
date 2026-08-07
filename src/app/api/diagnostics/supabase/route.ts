import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  SUPABASE_PROJECT_REF,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from '@/lib/supabase/config';

export async function GET() {
  const projectRef = SUPABASE_URL.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('profiles').select('id').limit(1);

    return NextResponse.json({
      service: 'ThorPDV',
      supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY),
      projectRef,
      expectedProjectRef: SUPABASE_PROJECT_REF,
      correctProject: projectRef === SUPABASE_PROJECT_REF,
      databaseReachable: !error,
      errorCode: error?.code ?? null,
    });
  } catch {
    return NextResponse.json(
      {
        service: 'ThorPDV',
        supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY),
        projectRef,
        expectedProjectRef: SUPABASE_PROJECT_REF,
        correctProject: projectRef === SUPABASE_PROJECT_REF,
        databaseReachable: false,
      },
      { status: 503 },
    );
  }
}
