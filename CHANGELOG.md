# Changelog — IA Imperial Bonés Personalizados

## [1.4.0] — 2026-07-21

### 🔁 Fase 4 — Recompra (memória de cliente)

Reconhece quem já comprou, guarda o histórico de pedidos e reabre a qualificação
para novos pedidos, com upsell moderado. Ativo no modo agente (`AGENT_MODE=true`);
a persistência do histórico acontece também no fluxo legado (dados acumulam sempre).

- **`store.js`**: memória de cliente durável em `imperialbones:cliente:{chatId}`
  (TTL 365 dias, sobrevive ao TTL da conversa). `getCliente()` e
  `registrarPedidoCliente(chatId, {nome, pedido})` — nome, primeiro contato,
  último pedido, total e histórico de pedidos. Fallback em memória.
- **`agente.js`**: nova ferramenta **`iniciar_novo_pedido`** (zera os campos do pedido,
  mantém o nome, reabre a qualificação) — usada quando um cliente que já fechou quer
  comprar de novo. `transferir_consultor` grava o pedido na memória do cliente.
- **`prompts.js`**: bloco **CLIENTE RECORRENTE** (nome, nº de pedidos, resumo do último)
  + guia de pós-fechamento (só reabre em novo pedido; dúvida continua no pós-pedido)
  + upsell moderado.
- **`index.js`**: no modo agente, clientes com pedido finalizado passam a ser tratados
  pelo agente (reconhecimento + reabertura); injeta o histórico do cliente no contexto;
  persiste o pedido no fechamento (agente e legado).
- **Gatilho de recompra**: detecção de intenção de compra (dúvida ≠ novo pedido).
- **evals**: +3 cenários (reconhecimento de recorrente, reabertura pós-fechamento,
  dúvida pós-pedido que NÃO reabre) → **17 cenários / 54 asserções** verdes no `gpt-4o`.

---

## [1.3.0] — 2026-07-21

### 🤖 Fase 3 — Núcleo com tool-calling + evals + analytics de funil

Nova arquitetura de agente atrás da flag `AGENT_MODE` (desligada por padrão; o fluxo
legado — state machine — continua ativo e intacto até a validação em produção).

- **`agente.js` (novo)**: loop de tool-calling da OpenAI. A IA conduz a conversa e DECIDE
  quando chamar as ferramentas: `registrar_dados`, `consultar_preco` (preço SEMPRE da tabela
  real — nunca inventado), `enviar_fotos_modelos/tecnicas/reguladores`, `enviar_cartela_cores`,
  `gerar_mockup` e `transferir_consultor`. Efeitos colaterais entram por injeção (`io`),
  então roda em teste sem tocar a ChatClean. Guard de pedido mínimo (25 un.) preservado.
  Retry com backoff em 429/5xx. Carimba as etapas do funil no `leadData`.
- **`prompts.js`**: novo `promptAgente(leadData)` — identidade, segurança/anti-jailbreak,
  tom ChatClean, catálogo, fluxo, pedido mínimo e guia de uso das ferramentas.
- **`catalogo-helpers.js` (novo)**: `recomendarModelos` e `cartelasDoLead` extraídos do
  `index.js` (funções puras, reusadas pela produção e pelos evals).
- **`index.js`**: flag `AGENT_MODE`; delegação ao agente em `processarMensagem` (reusa
  visão/transcrição/pós-pedido/follow-up); endpoint **`GET /analytics`** (funil por etapa,
  onde os leads param, taxa de conversão e nº de orçamentos consultados).
- **Transbordo determinístico**: pedidos acima de 100 un. vão para negociação especial
  (transfere + notifica a equipe) independente do modelo — paridade com o fluxo legado.
- **`evals/` (novo)**: suíte por cenários (`npm run evals`) que roda o agente real contra
  `io` mockado e asserta ferramentas chamadas + estado final. **14 cenários / 45 asserções**
  verdes no `gpt-4o`: fluxo feliz, pedido mínimo, preço via ferramenta, mostrar catálogo,
  dúvida avulsa, troca de modelo, anti-jailbreak, transbordo (>100), mockup, preço exato
  por material, fala informal (estilo transcrição), cliente indeciso, múltiplos produtos e
  retomada de conversa parada (via `estadoInicial` no runner).
- **Modelo do agente**: padrão passou a `gpt-4o` (`AGENT_MODEL` sobrescreve). Os evals
  mostraram que o `gpt-4o-mini` é instável ao disparar as ferramentas terminais
  (transferência/notificação).

### Tuning conhecido (para quando ligar `AGENT_MODE` em produção)

- No `gpt-4o-mini`, o agente é pouco proativo em enviar fotos e às vezes anuncia a
  transferência no texto sem chamar `transferir_consultor` (a equipe não é notificada).
  Por isso o padrão é `gpt-4o`. Rodar `npm run evals` antes de virar a chave.

---

## [1.1.0] — 2026-06-23

### 📚 Atualização com documentação completa do cliente

Leitura e incorporação de todos os PDFs e imagens da pasta `/docs`:
- `TABELA DE PREÇOS - ATUAL.pdf`
- `Imperial Bonés Personalizados.pdf`
- `CATÁLOGO - BONÉS e VISEIRAS.pdf`
- `CATÁLOGO CHAPÉUS.pdf`
- `Catálogo de Tecidos e Cores - IMPERIAL.pdf`
- `DESCRIÇÕES 6 GOMOS.pdf`
- `DESCRIÇÕES TRUCKER e AMERICANO.pdf`

### Mudanças em `index.js`

- **EMPRESA_INFO**: pedido mínimo (30 un padrão, 25 com +R$1,50/un), prazo correto (22-24 dias úteis), pagamento (50%+50%), dados bancários Nubank, PIX CNPJ
- **CATALOGO_MODELOS**: descrições expandidas com os 3 níveis de qualidade por produto; Chapéus com todos os 5 tipos (Proteção, Bucket Hat, Juta, Palha, Cata Ovo); preços de referência por nível
- **NIVEIS_QUALIDADE** (novo): constante com specs completas Básico (Tactel), Essencial (Oxford), Premium (Supercap + Brim)
- **TECIDOS_E_CORES** (novo): paleta completa por material — Supercap (24 cores), Oxford, Tela Paranaense, Tela Resinada, Alfaiataria, Brim, Camurça, Especiais para aba
- **gerarRespostaIA**: prompt atualizado com descrições completas de chapéus, técnicas por nível, tabela de preços, cores, pedido mínimo e pagamento
- **recomendarModelos**: novos gatilhos — praia/festival, sertanejo/agro → chapéus; fitness/tenis → viseira
- **extrairInformacoesComIA**: mapeamento dos tipos de chapéu (juta, bucket, palha, cata ovo, proteção)

### Pendências de configuração

- [ ] Fotos dos produtos em `assets/modelos/`
- [ ] Fotos das técnicas em `assets/tecnicas/`
- [ ] Fotos dos reguladores em `assets/reguladores/`
- [ ] Configurar `.env` com chaves reais

---

## [1.0.0] — 2026-06-23

### 🚀 Lançamento inicial

- Projeto criado baseado na IA Bonés Ramalho (v2.0.0)
- Adaptado para Imperial Bonés Personalizados (Serra Negra do Norte-RN)
- Modo: ChatClean Webhook (sem WhatsApp Web / QR Code)
- Catálogo inicial de 6 produtos, 7 técnicas, 3 reguladores
