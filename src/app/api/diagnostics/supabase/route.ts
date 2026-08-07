import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const EXPECTED_PROJECT_REF = 'ovqjnkdnbkhslywumppn';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const projectRef = url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from('profiles').select('id').limit(1);

    return NextResponse.json({
      service: 'ThorPDV',
      supabaseConfigured: Boolean(url && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      projectRef,
      expectedProjectRef: EXPECTED_PROJECT_REF,
      correctProject: projectRef === EXPECTED_PROJECT_REF,
      databaseReachable: !error,
      errorCode: error?.code ?? null,
    });
  } catch {
    return NextResponse.json(
      {
        service: 'ThorPDV',
        supabaseConfigured: Boolean(url && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
        projectRef,
        expectedProjectRef: EXPECTED_PROJECT_REF,
        correctProject: projectRef === EXPECTED_PROJECT_REF,
        databaseReachable: false,
      },
      { status: 503 },
    );
  }
}
