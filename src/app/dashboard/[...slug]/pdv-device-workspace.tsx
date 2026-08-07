'use client';

import { useMemo, useState, useTransition } from 'react';
import { pdvDeviceList, pdvGenerateEnrollment, pdvReconnectDevice, pdvSetDeviceStatus } from './pdv-device-actions';

type Row = Record<string, unknown>;

function text(value: unknown) { return value == null ? '' : String(value); }
function when(value: unknown) { if (!value) return 'Nunca'; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-BR'); }

export function PdvDeviceWorkspace({ posRegisters, initialDevices }: { posRegisters: Row[]; initialDevices: Row[] }) {
  const [devices, setDevices] = useState(initialDevices);
  const [posId, setPosId] = useState(text(posRegisters[0]?.id));
  const [label, setLabel] = useState('Caixa principal');
  const [enrollment, setEnrollment] = useState<{ code?: string; expires_at?: string; pos_name?: string; reconnect?: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const online = useMemo(() => devices.filter((d) => text(d.status) === 'online').length, [devices]);

  const refresh = () => startTransition(async () => {
    const result = await pdvDeviceList();
    if (result.ok) setDevices(result.data);
  });

  const generate = () => startTransition(async () => {
    if (!posId) return setMessage('Cadastre ou selecione um caixa/PDV antes de gerar a ativação.');
    setMessage('');
    const result = await pdvGenerateEnrollment(posId, label);
    if (!result.ok) return setMessage(text(result.error || 'Não foi possível gerar o código.'));
    setEnrollment({ code: text(result.code), expires_at: text(result.expires_at), pos_name: text(result.pos_name) });
  });

  const reconnect = (id: string) => startTransition(async () => {
    if (!window.confirm('Refazer a conexão deste terminal? A credencial atual será revogada. As vendas locais permanecem no computador e poderão subir após o novo pareamento.')) return;
    setMessage('');
    const result = await pdvReconnectDevice(id);
    if (!result.ok) return setMessage(text(result.error || 'Não foi possível preparar a reconexão.'));
    setEnrollment({ code: text(result.code), expires_at: text(result.expires_at), pos_name: text(result.pos_name), reconnect: true });
    setMessage('Reconexão preparada. No ThorPDV Desktop, abra Fila ↑ → Desconectar terminal e informe o novo código abaixo.');
    await refresh();
  });

  const setStatus = (id: string, status: 'offline'|'blocked') => startTransition(async () => {
    const result = await pdvSetDeviceStatus(id, status);
    if (!result.ok) setMessage(text(result.error || 'Não foi possível alterar o terminal.'));
    await refresh();
  });

  return <div className="pdv-device-grid">
    <section className="pdv-device-card pdv-device-activate">
      <div className="pdv-device-title"><div><span className="pdv-device-kicker">Pareamento seguro</span><h2>{enrollment?.reconnect?'Reconectar ThorPDV Desktop':'Ativar ThorPDV Desktop'}</h2><p>Gere um código de uso único e informe no computador Windows que ficará no caixa.</p></div><div className="pdv-device-badge">SYNC v2</div></div>
      <div className="pdv-device-form">
        <label><span>Caixa / PDV</span><select value={posId} onChange={(e)=>setPosId(e.target.value)}>{posRegisters.map((p)=><option key={text(p.id)} value={text(p.id)}>{text(p.name) || text(p.code) || 'PDV'}</option>)}</select></label>
        <label><span>Identificação</span><input value={label} onChange={(e)=>setLabel(e.target.value)} placeholder="Ex.: Caixa 01 - Balcão" /></label>
        <button type="button" className="pdv-device-primary" onClick={generate} disabled={pending}>{pending?'Gerando...':'Gerar código de ativação'}</button>
      </div>
      {enrollment?.code ? <div className="pdv-enrollment-code"><small>{enrollment.reconnect?'Novo código de reconexão':'Código de ativação'}</small><strong>{enrollment.code}</strong><p>Expira em {when(enrollment.expires_at)} e só pode ser usado uma vez.</p></div> : null}
      {message ? <div className="pdv-device-message">{message}</div> : null}
      <div className="pdv-device-flow"><span>1. Parear</span><b>→</b><span>2. Baixar catálogo</span><b>→</b><span>3. Vender offline/online</span><b>→</b><span>4. Subir vendas/estoque</span></div>
    </section>

    <section className="pdv-device-card">
      <div className="pdv-device-title"><div><span className="pdv-device-kicker">Monitoramento</span><h2>Terminais conectados</h2><p>{devices.length} terminal(is) pareado(s), {online} online agora.</p></div><button type="button" className="pdv-device-secondary" onClick={refresh} disabled={pending}>Atualizar</button></div>
      <div className="pdv-device-table-wrap"><table className="pdv-device-table"><thead><tr><th>Terminal</th><th>PDV / Filial</th><th>Sync</th><th>Último contato</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {devices.length===0 ? <tr><td colSpan={6}><div className="pdv-device-empty">Nenhum ThorPDV Desktop foi ativado ainda.</div></td></tr> : devices.map((d)=><tr key={text(d.id)}><td><strong>{text(d.name)}</strong><small>{text(d.hostname) || text(d.machine_id)} • v{text(d.app_version) || '—'}</small></td><td><strong>{text(d.pos_name)}</strong><small>{text(d.branch_name)}</small></td><td><strong>✓ {text(d.sync_processed)||'0'}</strong><small>{Number(d.sync_rejected||0)>0?`⚠ ${text(d.sync_rejected)} rejeitado(s)`:`Último evento: ${when(d.last_event_at)}`}</small>{d.last_sync_error?<small className="pdv-sync-error">{text(d.last_sync_error)}</small>:null}</td><td>{when(d.last_seen_at)}</td><td><span className={`pdv-status pdv-${text(d.status)}`}>{text(d.status)==='online'?'Online':text(d.status)==='blocked'?'Bloqueado':'Offline'}</span></td><td><div className="pdv-device-actions"><button type="button" className="pdv-device-link" onClick={()=>reconnect(text(d.id))}>Refazer conexão</button><button type="button" className="pdv-device-link" onClick={()=>setStatus(text(d.id), text(d.status)==='blocked'?'offline':'blocked')}>{text(d.status)==='blocked'?'Desbloquear':'Bloquear'}</button></div></td></tr>)}
      </tbody></table></div>
    </section>

    <section className="pdv-device-card pdv-device-info">
      <h3>Sincronização bidirecional</h3>
      <div className="pdv-sync-capabilities"><div><b>↓ Gestão → PDV</b><span>Produtos, códigos, preços, promoções, clientes, estoque, usuários e permissões.</span></div><div><b>↑ PDV → Gestão</b><span>Vendas, itens, pagamentos, caixa, devoluções, cancelamentos e dados que movimentam estoque/financeiro.</span></div><div><b>Recuperação de fila</b><span>Eventos com erro podem ser reprocessados sem apagar o SQLite e sem duplicar eventos já processados.</span></div><div><b>Reconexão segura</b><span>Revoga a credencial antiga e cria um novo código para o mesmo computador/PDV.</span></div></div>
    </section>
  </div>;
}
