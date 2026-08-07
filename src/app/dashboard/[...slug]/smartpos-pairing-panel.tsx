'use client';

import { useState } from 'react';
import { branchSmartPosEnrollment } from './branch-config-actions';

type Row=Record<string,unknown>;
const providers=[['stone','Stone'],['pagbank','PagBank / PagSeguro'],['ton','TON'],['getnet','Getnet'],['cielo','Cielo'],['rede','Rede / Itaú Laranjinha']] as const;

export function SmartPosPairingPanel({branches}:{branches:Row[]}){
  const [branchId,setBranchId]=useState(String(branches[0]?.id??''));
  const [provider,setProvider]=useState('stone');
  const [label,setLabel]=useState('SmartPOS 01');
  const [code,setCode]=useState('');const [expires,setExpires]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  async function generate(){setBusy(true);setMessage('');const r=await branchSmartPosEnrollment(branchId,provider,label);setBusy(false);if(r.ok){setCode(String(r.code??''));setExpires(String(r.expires_at??''));setMessage('Código criado. Digite-o uma única vez no ThorPDV Smart instalado na maquineta.');}else{setCode('');setMessage(String(r.error??'Não foi possível gerar o código. Ative primeiro a integração desta adquirente na aba Integrações.'));}}
  return <section className="erp-module-card smartpos-pairing">
    <div className="branch-section-head"><div><h3>Pareamento de SmartPOS</h3><p>Vincule uma maquineta Android à filial sem gravar senha administrativa no terminal.</p></div></div>
    <div className="smartpos-pair-grid"><label>Filial<select value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(b=><option key={String(b.id)} value={String(b.id)}>{String(b.name)}</option>)}</select></label><label>Adquirente<select value={provider} onChange={e=>setProvider(e.target.value)}>{providers.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label><label>Nome do terminal<input value={label} onChange={e=>setLabel(e.target.value)}/></label><button className="erp-primary" type="button" disabled={busy} onClick={generate}>{busy?'Gerando...':'Gerar código de pareamento'}</button></div>
    {code?<div className="smartpos-code"><small>CÓDIGO DE ATIVAÇÃO</small><strong>{code}</strong><span>Expira em {expires?new Date(expires).toLocaleString('pt-BR'):'20 minutos'} e só pode ser usado uma vez.</span></div>:null}
    {message?<div className="branch-message">{message}</div>:null}
    <p className="branch-help">O pareamento só é liberado para adquirentes marcadas como ativas em <b>Integrações</b>. Depois do vínculo, o terminal recebe um token opaco próprio; credenciais comerciais e segredos do adquirente continuam somente no Gestão.</p>
  </section>;
}
