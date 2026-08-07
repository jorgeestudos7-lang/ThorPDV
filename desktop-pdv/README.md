# ThorPDV Desktop (Windows)

Aplicação de frente de caixa offline-first integrada ao ThorERP Gestão.

## Arquitetura

- Electron: interface Windows e empacotamento `.exe`.
- ThorAgent: módulo local responsável por sincronização e hardware.
- SQLite (`better-sqlite3`): catálogo, preços, estoque local e fila de operações.
- `safeStorage`: token do dispositivo criptografado pelo Windows.
- API ThorERP/Vercel: `/api/pdv/enroll`, `/pull`, `/push`, `/heartbeat`.
- Fila idempotente: cada operação recebe UUID e pode ser reenviada sem duplicar venda.

## Fluxo de ativação

1. No ThorERP, acesse **Administrativo → PDV Desktop / Agentes**.
2. Selecione o caixa/PDV e gere o código temporário.
3. No Windows, instale e abra o ThorPDV Desktop.
4. Informe o código de 8 caracteres.
5. O Agent recebe um token próprio do dispositivo, baixa catálogo/preços/estoque e começa o heartbeat.

## Operação offline

Abertura de caixa, vendas, pagamentos, sangria/suprimento, clientes e cancelamentos entram primeiro no banco local. O sincronizador envia lotes para o Gestão. Eventos processados são marcados como sincronizados; rejeições permanecem visíveis para tratamento.

## Desenvolvimento

```powershell
cd desktop-pdv
npm install
npm run dev
```

## Gerar instalador Windows

```powershell
cd desktop-pdv
npm install
npm run dist:win
```

O instalador ficará em `desktop-pdv/dist/`.

## Hardware V1

- Descoberta de impressoras Windows via PowerShell `Get-Printer`.
- Impressão de comprovante através do driver instalado (`Out-Printer`).
- Descoberta de portas COM para balança/serial.
- A camada `agent/hardware.js` é o ponto de extensão para ESC/POS RAW, gaveta, balança Toledo/Filizola/Urano e TEF/pinpad.

## Próximas integrações de hardware

A arquitetura já separa UI do hardware. Drivers específicos devem ser implementados como adapters sem alterar o fluxo de venda/sincronização.
