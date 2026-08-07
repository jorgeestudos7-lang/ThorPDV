# Arquitetura ThorPDV V1

## Objetivo

Construir um ERP/PDV SaaS multiempresa preparado para varejo brasileiro, com separação forte de dados, evolução fiscal e deploy cloud.

## Camadas

```text
Browser / ThorPDV
        |
        v
Next.js / Vercel
        |
        +--> Supabase Auth
        +--> PostgreSQL + RLS
        +--> Supabase Storage
        |
        +--> Fiscal Gateway (V1 futura)
        |       +--> NF-e
        |       +--> NFC-e
        |       +--> NFS-e
        |
        +--> Payment Gateway (V1 futura)
                +--> Pix
                +--> Cartão
```

## Multi-tenant

`tenants` representa a conta SaaS. Uma conta pode possuir várias empresas e filiais.

Toda tabela operacional possui `tenant_id`. O PostgreSQL usa Row Level Security para impedir acesso entre tenants.

## Domínios V1

- Identidade: `profiles`, `tenants`, `tenant_members`
- Organização: `companies`, `branches`
- Cadastros: `customers`, `suppliers`, `products`, `product_barcodes`
- Estoque: `inventory_balances`, `stock_movements`
- Vendas: `sales`, `sale_items`, `payments`
- Financeiro: `financial_entries`
- Fiscal: `fiscal_documents`

## Segurança

- autenticação via Supabase Auth
- SSR usando `@supabase/ssr`
- RLS habilitado em todas as tabelas operacionais
- service role apenas em servidor seguro
- certificado A1 nunca deverá trafegar para o browser
- integrações externas devem usar secrets de ambiente
- webhooks futuros devem validar assinatura/idempotência

## Fiscal

A camada fiscal será desacoplada do domínio de vendas. `fiscal_documents` guarda estado, protocolo, chave, XML/PDF e referências do provedor.

Isso permite trocar ou combinar provedores fiscais sem reescrever o PDV.

## Próximas entregas

1. onboarding de tenant, empresa e filial
2. CRUD de produtos/clientes/fornecedores
3. motor de estoque
4. tela operacional ThorPDV
5. caixa e pagamentos
6. gateway fiscal NF-e/NFC-e
7. financeiro e conciliação
8. relatórios e observabilidade
