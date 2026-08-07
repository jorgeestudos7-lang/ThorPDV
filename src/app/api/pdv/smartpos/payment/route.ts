import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime='nodejs';
export async function POST(request:Request){
 const body=await request.json().catch(()=>null) as null|{deviceToken?:string;terminalId?:string;clientReference?:string;amount?:number;paymentMethod?:string;installments?:number;saleId?:string;paymentId?:string};
 if(!body?.deviceToken||!body.terminalId)return NextResponse.json({ok:false,error:'device_token_and_terminal_required'},{status:400});
 const supabase=await createClient();const {data,error}=await supabase.rpc('pdv_smartpos_create_payment',{p_device_token:body.deviceToken,p_terminal:body.terminalId,p_payload:{client_reference:body.clientReference,amount:body.amount,payment_method:body.paymentMethod,installments:body.installments??1,sale_id:body.saleId,payment_id:body.paymentId}});
 if(error)return NextResponse.json({ok:false,error:error.message},{status:500});const r=data as {ok?:boolean}|null;return NextResponse.json(r??{ok:false,error:'empty_response'},{status:r?.ok?200:409});
}
