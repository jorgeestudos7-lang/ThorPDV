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
