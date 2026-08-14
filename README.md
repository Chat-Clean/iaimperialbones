# IA Imperial Bonés Personalizados — WhatsApp Bot

Bot de atendimento automatizado via WhatsApp (ChatClean) com qualificação inteligente de leads, envio de imagens de produtos, orçamento pela tabela real e memória de recompra.

## 🚀 Instalação

```bash
npm install
npm start
```

## 🏛️ Arquitetura (hexagonal / DDD)

```
index.js                  Bootstrap fino: montar(config, deps) + iniciar(sistema)
src/
├── domain/               PURO — regra de negócio, sem I/O e sem process.env
│   ├── catalogo/         Catalogo.js (produtos, técnicas, tabela de preços), Recomendacao.js
│   ├── orcamento/        MotorDeOrcamento.js (preços REAIS — a IA nunca inventa valor)
│   ├── atendimento/      Funil.js (etapas + próximo campo), MontadorDeResumo.js
│   └── mensageria/       MensagemRecebida.js, MotivoDeDescarte.js (descartes nomeados)
├── application/          Orquestra, não decide regra — depende só de domain + portas
│   ├── portas/           Contratos (JSDoc) das dependências injetadas
│   ├── agente/           AgenteDeVendas.js — núcleo com tool-calling (Fase 3/4)
│   ├── casos-de-uso/     ProcessarMensagemRecebida.js — o turno completo
│   └── followup/         Reativacao.js — follow-up durável (sobrevive a redeploy)
├── infrastructure/       ÚNICO lugar com I/O
│   ├── chatclean/        CanalChatClean.js (Push API) + acl/tradutor.js (payloads)
│   ├── openai/           Cliente (retry), Extrator, Redator, Visão, Whisper, Mockup
│   │   └── prompts/      VERSIONADOS (index.js escolhe; v1.js é a versão em uso)
│   ├── redis/ memoria/   Repositórios (Redis com reserva automática em memória)
│   └── http/             servidor.js (webhook/health/analytics) + protecoes.js
├── main/                 config.js (zod, valida no boot) + container.js (composition root)
└── shared/               telefone.js, relogio.js
```

**Regras de dependência** (verificadas pelo ESLint — `npm run lint`):
domain ← application ← infrastructure ← main. Domínio não conhece internet
nem ambiente; infra não conhece o composition root.

## ⚙️ Configuração

Crie o arquivo `.env` a partir do `.env.example` (documenta todas as variáveis).
A config é validada no boot — valor inválido derruba o start com mensagem clara.

Destaques: `AGENT_MODE=true` liga o núcleo com tool-calling (agente);
`REDIS_URL` persiste as conversas; `IA_ALLOWED_CONTACTS` limita a fase de teste.

Com **`NODE_ENV=production`** o boot passa a exigir `WEBHOOK_SECRET` (≥16 caracteres)
e `CC_PUSH_URL` — sem eles o processo não sobe (fail-closed), em vez de rodar
aceitando webhook de qualquer origem.

## 🚢 Deploy — checklist

1. **Uma réplica só.** O lock de conversa, a deduplicação de webhook e o
   varredor de follow-up vivem em memória: com 2+ instâncias o cliente recebe
   respostas duplicadas e o estado sofre *lost update*.
2. `NODE_ENV=production`, `WEBHOOK_SECRET` e `ADMIN_KEY` definidos no ambiente.
3. `REDIS_URL` apontando para o Redis — sem ele o estado vive em memória e some
   a cada restart.
4. Créditos disponíveis na conta OpenAI (sem crédito, a IA não responde ninguém).
5. Mockups são gravados em `assets/mockups` e servidos por `/assets`. Em
   container o diretório é efêmero: monte um volume se quiser prévias duráveis.

Rotas: `POST /webhook` (autenticado), `GET /health` (aberta),
`GET /analytics` (exige `x-admin-key`).

## 🧪 Testes e evals

```bash
npm test          # unidade (vitest) — rápido, sem rede, roda no CI
npm run lint      # regras + fronteiras da arquitetura
npm run evals     # 22 cenários contra a API REAL da OpenAI (custa crédito)
npm run evals troca-de-modelo   # filtra cenários por nome
npm run sim 0 50  # simulação em massa de personalidades (evals/simulacao.js)
```

Fluxo para mexer em prompt: edite/copie a versão em
`src/infrastructure/openai/prompts/`, rode `npm run evals` antes e depois,
e troque `VERSAO_EM_USO` num commit separado (rollback = 1 linha).

## 📸 Imagens

Adicione as imagens dos produtos em:

- `assets/modelos/` — produtos (snapback.jpeg, trucker.jpeg, dad-hat.jpeg, chapeu.jpeg, viseira.jpeg, bolsa.jpeg)
- `assets/tecnicas/` — técnicas de personalização (silk3d.jpeg, bordado3d.jpeg, sublimacao.jpeg, dtf.jpeg, patch-laser.jpeg, patch-silk.jpeg, dtf-relevo.jpeg)
- `assets/reguladores/` — opções de regulador (regulador-plastico.jpeg, metalica-tipo1.jpeg, metalica-tipo2.jpeg)
- `assets/cores-tecidos/` — cartelas de cores por material

Ver `assets/README.md` para detalhes.

## 🔗 Webhook

Configure o webhook no ChatClean em **Configurações → API/Webhook** apontando para:

```
http://SEU_SERVIDOR:3000/webhook
```

## 🤖 Funcionalidades

- Dois núcleos: fluxo legado (state machine) e **agente com tool-calling** (`AGENT_MODE=true`)
- Qualificação inteligente de leads e recomendação de produtos por objetivo
- Preço SEMPRE da tabela real (motor de orçamento — a IA não inventa valor)
- Envio de fotos (catálogo, técnicas, reguladores, cartelas de cores)
- Visão (a IA "enxerga" a logo enviada) + mockup da logo aplicada (gpt-image-1)
- Suporte a áudio (transcrição via Whisper)
- Guard de pedido mínimo (30/25 un.) e transbordo determinístico (>100 un.)
- Memória de cliente para recompra (reconhece quem já comprou — Fase 4)
- Follow-up de reativação durável (sobrevive a restart/redeploy)
- Analytics de funil em `/analytics`

## 📦 Produtos

- Snapback, Trucker, Dad Hat
- Chapéu, Viseira
- Bolsa Personalizada

## ✏️ Técnicas de Personalização

Silk 3D · Bordado 3D · Sublimação · DTF · Patch Couro Laser · Patch Couro Silk · DTF com Relevo

---

**Imperial Bonés Personalizados** | Serra Negra do Norte-RN | Desde 2017 | @imperialbones
