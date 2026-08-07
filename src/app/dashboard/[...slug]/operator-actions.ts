'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SESSION_COOKIE='thorpdv_test_session';

async function token(){const store=await cookies();const value=store.get(SESSION_COOKIE)?.value;if(!value)redirect('/login');return value;}

export async function setPdvOperatorPin(staffUserId:string,pin:string){
  const pToken=await token();
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('erp_staff_set_pin',{p_token:pToken,p_staff_user_id:staffUserId,p_pin:pin});
  if(error)return {ok:false,error:error.message};
  return (data??{ok:false,error:'empty_response'}) as {ok?:boolean;error?:string};
}

export async function setPdvOperatorCommission(staffUserId:string,percent:number){
  const pToken=await token();
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('erp_staff_set_commission',{p_token:pToken,p_staff_user_id:staffUserId,p_percent:percent});
  if(error)return {ok:false,error:error.message};
  return (data??{ok:false,error:'empty_response'}) as {ok?:boolean;error?:string;commission_percent?:number};
}

export async function listPdvOperators(){
  const pToken=await token();
  const supabase=await createClient();
  const {data,error}=await supabase.rpc('erp_staff_pdv_list',{p_token:pToken});
  if(error)return {ok:false,error:error.message,data:[] as Record<string,unknown>[]};
  const result=(data??{}) as {ok?:boolean;error?:string;data?:Record<string,unknown>[]};
  return {ok:Boolean(result.ok),error:result.error,data:Array.isArray(result.data)?result.data:[]};
}
