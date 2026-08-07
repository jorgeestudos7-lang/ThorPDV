import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime='nodejs';

export async function POST(request:Request){
  const body=await request.json().catch(()=>null) as null|{deviceToken?:string;intentId?:string;result?:Record<string,unknown>};
  if(!body?.deviceToken||!body.intentId||!body.result)return NextResponse.json({ok:false,error:'device_token_intent_result_required'},{status:400});
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('smartpos_complete',{p_device_token:body.deviceToken,p_intent:body.intentId,p_result:body.result});
  if(error)return NextResponse.json({ok:false,error:error.message},{status:500});
  const result=data as {ok?:boolean}|null;
  return NextResponse.json(result??{ok:false,error:'empty_response'},{status:result?.ok?200:409});
}
