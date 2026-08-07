'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SESSION_COOKIE='thorpdv_test_session';
type Result={ok?:boolean;error?:string;[key:string]:unknown};

async function token(){const store=await cookies();const value=store.get(SESSION_COOKIE)?.value;if(!value)redirect('/login');return value;}
async function rpc(name:string,args:Record<string,unknown>){const supabase=await createClient();const {data,error}=await supabase.rpc(name,args);if(error)return {ok:false,error:error.message} as Result;return (data??{ok:false}) as Result;}

export async function branchConfigurationGet(branchId:string){return rpc('erp_branch_configuration_get',{p_token:await token(),p_branch:branchId});}
export async function branchConfigurationSave(branchId:string,section:string,payload:Record<string,unknown>){return rpc('erp_branch_configuration_save',{p_token:await token(),p_branch:branchId,p_section:section,p_payload:payload});}
export async function branchPaymentIntegrationSave(branchId:string,payload:Record<string,unknown>){return rpc('erp_branch_payment_integration_save',{p_token:await token(),p_branch:branchId,p_payload:payload});}
export async function branchSmartPosTerminalSave(branchId:string,payload:Record<string,unknown>){return rpc('erp_branch_smartpos_terminal_save',{p_token:await token(),p_branch:branchId,p_payload:payload});}
export async function branchTaxGroupSave(branchId:string,payload:Record<string,unknown>){return rpc('erp_branch_tax_group_save',{p_token:await token(),p_branch:branchId,p_payload:payload});}
export async function branchDeliveryRateSave(branchId:string,payload:Record<string,unknown>){return rpc('erp_branch_delivery_rate_save',{p_token:await token(),p_branch:branchId,p_payload:payload});}
