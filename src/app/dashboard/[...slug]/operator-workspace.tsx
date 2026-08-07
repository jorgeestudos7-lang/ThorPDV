'use client';

import { useMemo,useState,useTransition } from 'react';
import { erpSave } from './actions';
import { setPdvOperatorPin } from './operator-actions';

type Row=Record<string,unknown>;
const text=(v:unknown)=>v==null?'':String(v);
const permission=(value:unknown,section:string,key:string)=>{
  if(!value||typeof value!=='object')return undefined;
  const group=(value as Record<string,unknown>)[section];
  if(!group||typeof group!=='object')return undefined;
  return (group as Record<string,unknown>)[key];
};

export function OperatorWorkspace({initialUsers,profiles,branches}:{initialUsers:Row[];profiles:Row[];branches:Row[]}){
  const [users,setUsers]=useState(initialUsers);const [pending,startTransition]=useTransition();const [message,setMessage]=useState('');
  const [form,setForm]=useState({id:'',name:'',email:'',profile_id:text(profiles[0]?.id),branch_id:text(branches[0]?.id),active:true,pin:''});
  const profileMap=useMemo(()=>new Map(profiles.map(p=>[text(p.id),p])),[profiles]);
  const reset=()=>setForm({id:'',name:'',email:'',profile_id:text(profiles[0]?.id),branch_id:text(branches[0]?.id),active:true,pin:''});
  const save=()=>startTransition(async()=>{setMessage('');if(!form.name.trim())return setMessage('Informe o nome do operador.');if(!form.profile_id)return setMessage('Selecione um perfil PDV.');const payload:Record<string,unknown>={id:form.id||undefined,name:form.name,email:form.email||undefined,profile_id:form.profile_id,branch_id:form.branch_id||undefined,active:form.active};const r=await erpSave('users_pdv',payload);if(!r.ok)return setMessage(text(r.error||'Falha ao salvar usuário.'));const id=text(r.id||form.id);if(form.pin){const pin=await setPdvOperatorPin(id,form.pin);if(!pin.ok)return setMessage(`Usuário salvo, mas o PIN falhou: ${text(pin.error)}`);}setUsers(prev=>{const profile=profileMap.get(form.profile_id);const branch=branches.find(b=>text(b.id)===form.branch_id);const next={id,name:form.name,email:form.email,profile_id:form.profile_id,profile:text(profile?.name),branch_id:form.branch_id,branch:text(branch?.name),active:form.active};return form.id?prev.map(u=>text(u.id)===form.id?{...u,...next}:u):[next,...prev];});reset();setMessage('Operador salvo. Clique em Sincronizar no ThorPDV Desktop para atualizar.');});
  const edit=(u:Row)=>setForm({id:text(u.id),name:text(u.name),email:text(u.email),profile_id:text(u.profile_id),branch_id:text(u.branch_id),active:u.active!==false,pin:''});
  const quickPin=(u:Row)=>{const value=window.prompt(`Novo PIN para ${text(u.name)} (4 a 8 dígitos):`,'');if(value==null)return;startTransition(async()=>{const r=await setPdvOperatorPin(text(u.id),value);setMessage(r.ok?`PIN de ${text(u.name)} atualizado. Sincronize o PDV Desktop.`:text(r.error||'Falha ao alterar PIN.'));});};
  return <div className="operator-admin-grid">
    <section className="operator-admin-card">
      <div className="operator-admin-head"><div><span>CADASTRO PDV</span><h2>{form.id?'Editar operador':'Novo operador'}</h2><p>Usuários sincronizados com os caixas Windows para identificação por PIN.</p></div>{form.id?<button className="secondary" onClick={reset}>Novo</button>:null}</div>
      <div className="operator-form-grid">
        <label><span>Nome</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: João - Caixa"/></label>
        <label><span>E-mail / identificador</span><input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="operador@empresa.local"/></label>
        <label><span>Perfil</span><select value={form.profile_id} onChange={e=>setForm({...form,profile_id:e.target.value})}>{profiles.map(p=><option key={text(p.id)} value={text(p.id)}>{text(p.name)}</option>)}</select></label>
        <label><span>Filial</span><select value={form.branch_id} onChange={e=>setForm({...form,branch_id:e.target.value})}>{branches.map(b=><option key={text(b.id)} value={text(b.id)}>{text(b.name)}</option>)}</select></label>
        <label><span>PIN {form.id?'(deixe vazio para manter)':''}</span><input type="password" inputMode="numeric" maxLength={8} value={form.pin} onChange={e=>setForm({...form,pin:e.target.value.replace(/\D/g,'')})} placeholder="4 a 8 dígitos"/></label>
        <label className="operator-check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/><span>Usuário ativo</span></label>
      </div>
      <div className="operator-actions"><button className="primary" disabled={pending} onClick={save}>{pending?'Salvando...':'Salvar operador'}</button></div>{message?<div className="operator-message">{message}</div>:null}
    </section>
    <section className="operator-admin-card">
      <div className="operator-admin-head"><div><span>OPERADORES</span><h2>Usuários do caixa</h2><p>{users.length} usuário(s) PDV cadastrado(s).</p></div></div>
      <div className="operator-table-wrap"><table className="operator-table"><thead><tr><th>Nome</th><th>Perfil</th><th>Filial</th><th>Status</th><th>Ações</th></tr></thead><tbody>{users.map(u=><tr key={text(u.id)}><td><strong>{text(u.name)}</strong><small>{text(u.email)||'—'}</small></td><td>{text(u.profile)||'Sem perfil'}</td><td>{text(u.branch)||'Todas'}</td><td><span className={u.active===false?'op-inactive':'op-active'}>{u.active===false?'Inativo':'Ativo'}</span></td><td><div className="op-row-actions"><button onClick={()=>edit(u)}>Editar</button><button onClick={()=>quickPin(u)}>Definir PIN</button></div></td></tr>)}</tbody></table></div>
    </section>
    <section className="operator-admin-card operator-permissions-card"><h3>Alçadas dos perfis</h3><div className="permission-cards">{profiles.map(p=>{const perms=p.permissions;return <article key={text(p.id)}><strong>{text(p.name)}</strong><span>Desconto até {Number(permission(perms,'discount','max_percent')??0)}%</span><span>Acréscimo até {Number(permission(perms,'surcharge','max_percent')??0)}%</span><span>Cancelar venda: {permission(perms,'sale','cancel')===true?'Sim':'Não'}</span><span>Devolver: {permission(perms,'sale','return')===true?'Sim':'Não'}</span><span>Supervisor: {permission(perms,'supervisor','authorize')===true?'Sim':'Não'}</span></article>})}</div></section>
  </div>;
}
