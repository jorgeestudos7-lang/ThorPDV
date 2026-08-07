import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime='nodejs';

export async function POST(request:Request){
  const body=await request.json().catch(()=>null) as null|{code?:string;name?:string;model?:string;serial?:string;androidVersion?:string;packageName?:string;identifier?:string;capabilities?:Record<string,unknown>};
  if(!body?.code)return NextResponse.json({ok:false,error:'code_required'},{status:400});
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('smartpos_enroll',{p_code:body.code,p_name:body.name??'ThorPDV Smart',p_model:body.model??null,p_serial:body.serial??null,p_android:body.androidVersion??null,p_package:body.packageName??null,p_identifier:body.identifier??null,p_capabilities:body.capabilities??{}});
  if(error)return NextResponse.json({ok:false,error:error.message},{status:500});
  const result=data as {ok?:boolean;error?:string}|null;
  return NextResponse.json(result??{ok:false,error:'empty_response'},{status:result?.ok?200:401});
}
