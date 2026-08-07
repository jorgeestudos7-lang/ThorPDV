# ThorPDV Desktop + ThorERP Gestão

## Visão geral

```text
ThorPDV Desktop (Windows)
  ├─ UI Frente de Caixa
  ├─ SQLite local
  └─ ThorAgent
      ├─ Fila offline / idempotência
      ├─ Impressora / COM / periféricos
      ├─ Heartbeat
      └─ HTTPS
             ↓
      ThorERP Sync API (Vercel)
             ↓
          Supabase
             ├─ Produtos / preços / promoções
             ├─ Estoque
             ├─ Caixa
             ├─ Vendas / pagamentos
             ├─ Financeiro
             └─ Fiscal / relatórios
```

## Segurança do dispositivo

O administrador não digita sua senha no PDV. O Gestão gera um código de ativação de uso único, válido por 15 minutos. O Desktop troca o código por um token aleatório de dispositivo. No banco, somente o SHA-256 do token é mantido. No computador, o token é armazenado usando `safeStorage` do Electron (DPAPI no Windows quando disponível).

## Eventos enviados pelo PDV

- `cash_open`
- `cash_movement` (`supply`, `withdrawal`, `expense`, `refund`)
- `sale_completed`
- `customer_upsert`
- `sale_cancel`
- `cash_close`

Cada evento tem `client_event_id` UUID único. O servidor mantém `unique(device_id, client_event_id)`, portanto retries não duplicam operações.

## Sincronização Gestão → PDV

O `pull` devolve contexto do terminal, catálogo alterado, clientes alterados, estoque da filial, tabela de preço padrão e promoções vigentes. O cursor é salvo localmente. Itens de preço e promoções são reenviados integralmente nesta V1 para manter a regra offline simples e determinística.

## Conflitos offline

A venda física não é perdida se o estoque do ERP tiver mudado durante a desconexão. O servidor registra a venda e marca `stock_conflict` no lançamento financeiro quando o saldo no momento da sincronização era inferior ao vendido. Da mesma forma, `price_variance` audita diferença entre o preço usado offline e o preço vigente no servidor no momento do sync.

## Fiscal

A venda sobe primeiro para o Gestão. A emissão NFC-e/NF-e usa o módulo fiscal central, evitando colocar certificado A1 ou credenciais fiscais no caixa nesta primeira versão. Para contingência NFC-e real, será criada uma extensão fiscal local específica, com armazenamento seguro do certificado e regras SEFAZ.
