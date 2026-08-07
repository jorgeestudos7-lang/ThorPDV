# ThorPDV — Infraestrutura

Atualizado em 2026-08-07.

## GitHub

- Repositório: `jorgeestudos7-lang/ThorPDV`
- Branch principal: `main`
- CI: GitHub Actions (`lint`, `typecheck`, `build`)

## Vercel

- Projeto: `thorpdv`
- Project ID: `prj_WG4NbrszmjvtE3Q86bVsDAxRz25e`
- URL principal: `https://thorpdv.vercel.app`
- Framework detectado: Next.js
- Primeiro deploy de infraestrutura: `READY`

> O primeiro deploy publicado contém a camada web base validada. A versão completa com autenticação depende das variáveis do projeto Supabase definitivo.

## Supabase

Configuração planejada:

- Projeto: `ThorPDV`
- Região: `sa-east-1` (São Paulo)
- PostgreSQL + Auth + RLS
- Migração inicial: `supabase/migrations/20260807123000_init.sql`

### Estado atual

A organização Supabase atingiu o limite de dois projetos gratuitos ativos. Os dois projetos ativos apresentam uso recente e não foram pausados para evitar indisponibilidade em sistemas existentes.

Assim que existir uma vaga de projeto ou o plano da organização permitir um terceiro projeto ativo, executar:

1. Criar `ThorPDV` em `sa-east-1`.
2. Aplicar a migração inicial.
3. Executar os Security/Performance Advisors.
4. Gerar a publishable key.
5. Configurar as variáveis de ambiente na Vercel.
6. Publicar a aplicação completa.
7. Validar `/login`, autenticação e isolamento multi-tenant.

## Variáveis Vercel planejadas

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://thorpdv.vercel.app
```

`SUPABASE_SERVICE_ROLE_KEY` deve permanecer exclusivamente no ambiente de servidor e nunca ser exposta no cliente ou no repositório.
