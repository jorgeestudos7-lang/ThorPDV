'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SESSION_COOKIE='thorpdv_test_session';
export async function executePriceAdjustment(id:string){const c=await cookies();const token=c.get(SESSION_COOKIE)?.value;if(!token)redirect('/login');const supabase=await createClient();const {data,error}=await supabase.rpc('erp_execute_price_adjustment',{p_token:token,p_adjustment_id:id});if(error)return {ok:false,error:error.message};return (data??{ok:false}) as Record<string,unknown>}
