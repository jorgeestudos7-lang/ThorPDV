'use client';

import Link from 'next/link';
import { ReactNode, useState } from 'react';
import { logout } from '../actions';

const menu: [string, [string,string][]][] = [
  ['Pessoas',[['Clientes','/dashboard/clientes'],['Fornecedores','/dashboard/fornecedores'],['Perfis PDV','/dashboard/perfis-pdv'],['Usuários PDV','/dashboard/usuarios-pdv'],['Perfis ADM','/dashboard/perfis-adm'],['Usuários ADM','/dashboard/usuarios-adm']]],
  ['Produtos',[['Produtos','/dashboard/produtos'],['Grupos','/dashboard/grupos'],['Classes','/dashboard/classes'],['Modificadores','/dashboard/modificadores']]],
  ['Tabela de Preços',[['Tabelas','/dashboard/tabelas-precos'],['Copiar','/dashboard/tabelas-precos/copiar'],['Ajustes Programados','/dashboard/tabelas-precos/ajustes'],['Promoções','/dashboard/promocoes']]],
  ['Estoque',[['Movimentações','/dashboard/estoque'],['Compras / Entradas','/dashboard/compras'],['Inventário','/dashboard/estoque/inventario'],['Ajustes','/dashboard/estoque/ajustes'],['Transferências','/dashboard/estoque/transferencias']]],
  ['Financeiro',[['Contas a Receber','/dashboard/financeiro/receber'],['Contas a Pagar','/dashboard/financeiro/pagar'],['Fluxo de Caixa','/dashboard/financeiro/fluxo-caixa'],['Conciliação','/dashboard/financeiro/conciliacao']]],
  ['Administrativo',[['Empresas e Filiais','/dashboard/administrativo/empresas'],['Caixas e PDVs','/dashboard/administrativo/pdvs'],['PDV Desktop / Agentes','/dashboard/administrativo/pdv-desktop'],['Fiscal','/dashboard/fiscal'],['Integrações','/dashboard/integracoes'],['Configurações','/dashboard/configuracoes']]],
  ['Relatórios',[['Financeiro','/dashboard/relatorios/financeiro'],['Vendas PDV','/dashboard/relatorios/vendas'],['Estoque','/dashboard/relatorios/estoque'],['Listagens','/dashboard/relatorios/listagens']]],
];

export function AdvancedShell({ title, subtitle, activePath, children }: { title:string; subtitle:string; activePath:string; children:ReactNode }) {
  const [open,setOpen]=useState<string[]>(menu.map(([m])=>m));
  return <main className="erp-module-shell"><aside className="erp-module-sidebar"><Link href="/dashboard" className="erp-module-logo"><span>ϟ</span> THOR<b>PDV</b></Link><nav><Link href="/dashboard">Dashboard</Link>{menu.map(([label,items])=>{const expanded=open.includes(label);return <div className="erp-module-group" key={label}><button type="button" onClick={()=>setOpen(v=>expanded?v.filter(x=>x!==label):[...v,label])}><span>{label}</span><span>{expanded?'⌄':'›'}</span></button>{expanded&&<div className="erp-module-submenu">{items.map(([name,href])=><Link className={activePath===href?'active':''} href={href} key={href}>{name}</Link>)}</div>}</div>})}</nav><div className="erp-module-branch"><small>Loja atual</small><strong>MATRIZ</strong><span>Teresina / PI</span></div></aside><section className="erp-module-main"><header className="erp-module-header"><div><Link href="/dashboard" className="erp-back">← Dashboard</Link><h1>{title}</h1><p>{subtitle}</p></div><div className="erp-module-user"><div className="erp-user-dot">SA</div><span><strong>ThorPDV</strong><small>Administrador</small></span><form action={logout}><button className="erp-ghost" type="submit">Sair</button></form></div></header>{children}</section></main>;
}
