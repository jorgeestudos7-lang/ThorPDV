# ThorPDV SmartPOS — estratégia de integração

## Arquitetura

O ThorPDV terá dois cenários de pagamento presencial:

1. **ThorPDV Desktop (Windows)**: continua sendo o frente de caixa principal. Quando a adquirente oferecer integração remota/TEF, o pagamento pode ser iniciado pelo Windows.
2. **ThorPDV Smart (Android)**: aplicativo/bridge Android executado dentro da SmartPOS para adquirentes cuja integração exige SDK/deeplink local no terminal.

O Gestão mantém a configuração por filial e por adquirente. Credenciais secretas ficam em schema privado e não são retornadas pela UI.

## Matriz

| Provedor | SmartPOS | Integração preferida | Alternativa | Homologação |
|---|---|---|---|---|
| Stone | POS Android | SDK Android Stone | DeepLink Stone | Parcerias Stone / terminal homologado |
| PagBank | SmartPOS | PlugPag SmartPOS SDK | — | Parceria comercial + terminal DEBUG + homologação |
| TON | T3 Smart Android | Somente integração parceira formal | Sem conector público assumido | Necessário validar com TON/Stone |
| Getnet | Get Smart | DeepLinks de pagamento | SDK Getnet para hardware | Certificação Get Store |
| Cielo | LIO | SDK Local Android | LIO Remote / Order Manager REST | Portal Cielo / Dev Console |
| Rede/Itaú | Laranjinha Smart | Rede Store / programa parceiro | TEF Rede / APIs | Rede Store / Conexão Itaú / TEF |

## Regras do ThorPDV

- Não armazenar PAN, trilha, CVV ou senha do portador.
- O valor enviado ao terminal deve usar `payment_intent_id` único e idempotente.
- Só marcar pagamento como `authorized/paid` após retorno confirmado do SDK/API/adquirente.
- Em timeout, consultar/reconciliar antes de repetir para evitar dupla cobrança.
- Guardar NSU/TID/authorization code/reference quando a adquirente retornar esses campos.
- Cancelamento de venda deve chamar primeiro o adaptador da adquirente quando houver transação integrada.
- Devolução financeira e devolução de mercadoria permanecem operações distintas.
- Todos os callbacks/webhooks devem ser idempotentes.
- Logs nunca devem conter segredos ou dados sensíveis do cartão.

## Stone

Usar SDK Android nos POS homologados. StoneCode identifica o estabelecimento. O SDK suporta ativação, pagamento, captura, cancelamento e reversão. DeepLink é opção válida para pagamento/cancelamento/impressão/reimpressão. Para PIX via SDK existem credenciais específicas fornecidas pela área de parcerias.

Configuração ThorERP: `merchant_code=StoneCode`, modo `stone_sdk` ou `stone_deeplink`, package name, return scheme e credenciais adicionais apenas quando oficialmente fornecidas.

## PagBank

Usar SDK SmartPOS/PlugPag com aplicação Android nativa Java/Kotlin. O fluxo comercial antecede o desenvolvimento: parceria, equipamento DEBUG, desenvolvimento, homologação e distribuição via loja/reseller PagBank. Suporta pagamento, estorno, impressão e recursos NFC conforme SDK.

Configuração ThorERP: modo `pagbank_smartpos_sdk`, app/package, grupo/reseller quando fornecido e credenciais de ativação somente no cofre privado.

## Getnet

Pagamento no Get Smart é integrado por deeplinks parametrizados. Hardware é acessado pelo SDK Getnet e o app deve suportar os modelos homologados do Get Smart. A distribuição passa pela Get Store e certificação.

Configuração ThorERP: modo `getnet_deeplink`, package/return scheme, identificadores do terminal e metadados do parceiro.

## Cielo

A Cielo LIO permite duas arquiteturas: Local (app Android + SDK no terminal) e Remota (PDV externo usando Order Manager REST para acionar pedidos/pagamentos na LIO). Isso torna a Cielo a melhor candidata para integração direta do ThorPDV Desktop sem precisar mover toda a UI do caixa para a SmartPOS.

Configuração ThorERP: `cielo_lio_local` ou `cielo_lio_remote`, app id, credenciais fornecidas pela Cielo no cofre privado e associação do terminal LIO à filial.

## Rede / Itaú

A Rede mantém Rede Store para apps SmartPOS, área específica de TEF e APIs no Portal do Desenvolvedor. A Laranjinha Smart é destinada também a apps de gestão. Para Windows, priorizar TEF quando o produto/parceria contratado for TEF; para app embarcado, usar Rede Store/Conexão Itaú conforme homologação.

Configuração ThorERP: `rede_store`, `rede_tef` ou `rede_api`; número lógico/terminal, filiação quando aplicável e credenciais privadas.

## TON

A T3 Smart roda Android, mas a documentação pública disponível ao consumidor não publica um SDK/parceria de terceiros equivalente aos portais Stone, PagBank, Getnet ou Cielo. Portanto o ThorPDV não deve assumir compatibilidade do SDK Stone com TON sem autorização/homologação do fornecedor, apesar de TON pertencer ao ecossistema Stone.

Configuração ThorERP: modo `ton_partner`, desativado até existir acordo técnico/comercial e kit oficial de desenvolvimento.

## Próxima implementação Android

Criar `ThorPDV Smart` em Kotlin com flavors/adapters por adquirente. O core comum deve expor:

```kotlin
interface SmartPosPaymentAdapter {
    suspend fun initialize(config: MerchantConfig): AdapterStatus
    suspend fun pay(request: PaymentRequest): PaymentResult
    suspend fun cancel(request: CancelRequest): PaymentResult
    suspend fun reprint(reference: String): PrintResult
    suspend fun health(): AdapterStatus
}
```

Cada flavor inclui somente as bibliotecas oficialmente fornecidas para aquele ecossistema, evitando empacotar SDKs concorrentes no mesmo APK quando a homologação proibir.
