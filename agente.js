// =============================================================
//  NÚCLEO DO AGENTE (Fase 3) — tool-calling
//  A IA conduz a conversa e DECIDE quando chamar as ferramentas
//  (consultar preço, mostrar fotos, gerar mockup, transferir).
//  Os motores determinísticos (orçamento, guard de mínimo) continuam
//  sendo a fonte de verdade — a IA nunca inventa preço.
//
//  Testabilidade: todos os efeitos colaterais (envio de WhatsApp,
//  notificação da equipe, mockup) entram por `io` (injeção de
//  dependência), então os evals rodam sem tocar a ChatClean.
// =============================================================

const {
    CATALOGO_MODELOS,
    OPCOES_TECNICAS,
    OPCOES_REGULADORES
} = require('./data');
const orcamento = require('./orcamento');
const { promptAgente } = require('./prompts');

// gpt-4o por padrão: os evals mostraram que o gpt-4o-mini é instável ao disparar
// as ferramentas terminais (transferir/notificar). Ajuste via AGENT_MODEL se quiser.
const MODELO_IA        = process.env.AGENT_MODEL || 'gpt-4o';
const MAX_ITERACOES    = 6;   // trava de segurança contra loop de tool-calling
const MODELOS_SEM_REG  = ['IB_VIS', 'IB_BOLSA', 'IB_CHAP'];

// Tradução dos códigos internos → nomes amigáveis (mantém o resumo da equipe legível)
const NOMES_TECNICA = {
    silk3d: 'Silk 3D', bordado3d: 'Bordado 3D', sublimacao: 'Sublimação',
    dtf: 'DTF (Direct to Film)', patchLaser: 'Patch de Couro Gravado a Laser',
    patchSilk: 'Patch de Couro com Silk', dtfRelevo: 'DTF com Relevo'
};
const NOMES_REGULADOR = { padrao: 'Padrão Plástico', metal1: 'Fivela Metálica Tipo 01', metal2: 'Fivela Metálica Tipo 02' };

// -------------------------------------------------------------
//  Funil — carimba as etapas para a análise posterior (Fase 3.3)
// -------------------------------------------------------------
const ORDEM_ETAPAS = ['contato', 'qualificando', 'modelo', 'tecnica', 'cor', 'orcamento', 'finalizado'];
// Etapas lineares do funil para o relatório de analytics (orçamento é medido à parte,
// pois pode ocorrer em pontos diferentes da conversa).
const ETAPAS_FUNIL = ['contato', 'qualificando', 'modelo', 'tecnica', 'cor', 'finalizado'];

function marcarEtapa(leadData, etapa, agora) {
    if (!leadData.etapas) leadData.etapas = {};
    if (!leadData.etapas[etapa]) leadData.etapas[etapa] = agora;
    const atual = ORDEM_ETAPAS.indexOf(etapa);
    const anterior = ORDEM_ETAPAS.indexOf(leadData.etapaFunil || 'contato');
    if (atual > anterior) leadData.etapaFunil = etapa;
}

// Estágio MAIS AVANÇADO que o lead alcançou, derivado dos campos do leadData.
// Funciona tanto para leads do agente quanto do fluxo legado (que não carimba etapas).
function estagioDoLead(l) {
    if (!l) return 'contato';
    if (l.finalizado) return 'finalizado';
    if (l.corPreferencia) return 'cor';
    if (l.tecnica) return 'tecnica';
    if (l.modeloEscolhido) return 'modelo';
    if (l.quantidade && l.usoEvento) return 'qualificando';
    return 'contato';
}

// =============================================================
//  DEFINIÇÃO DAS FERRAMENTAS (schema OpenAI)
// =============================================================
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'registrar_dados',
            description: 'Salva/atualiza os dados do lead conforme o cliente informa. Chame sempre que o cliente fornecer ou mudar qualquer informação (nome, quantidade, finalidade, prazo, modelo, arte, técnica, regulador, cor, material). Só inclua os campos realmente informados nesta mensagem.',
            parameters: {
                type: 'object',
                properties: {
                    nome: { type: 'string', description: 'Nome do cliente. Nunca use saudações (Oi, Bom dia) como nome.' },
                    tipoAtendimento: { type: 'string', enum: ['compra', 'duvida'], description: '"compra" se quer orçamento/pedido, "duvida" se só tira dúvida.' },
                    quantidade: { type: 'integer', description: 'Quantidade de unidades desejada.' },
                    usoEvento: { type: 'string', description: 'Finalidade/uso (uniforme, evento, brinde, marca, esporte, campo...).' },
                    prazoRecebimento: { type: 'string', description: 'Prazo informado pelo cliente, como ele disse.' },
                    modeloEscolhido: { type: 'string', enum: Object.keys(CATALOGO_MODELOS), description: 'Código do produto escolhido.' },
                    tipoChapeu: { type: 'string', enum: ['protecao', 'bucket', 'juta', 'palha', 'cataoovo'], description: 'Tipo de chapéu, se aplicável.' },
                    material: { type: 'string', enum: ['tactel', 'oxford', 'supercap', 'brim', 'alfaiataria', 'camurca'], description: 'Linha/tecido: básico=tactel, essencial=oxford, premium=supercap.' },
                    temArte: { type: 'string', enum: ['sim', 'nao', 'enviou'], description: 'Se o cliente tem a arte/logo pronta.' },
                    quandoEnviaArte: { type: 'string', enum: ['agora', 'depois'], description: 'Quando vai enviar a arte.' },
                    tecnica: { type: 'string', enum: Object.keys(OPCOES_TECNICAS), description: 'Técnica de personalização escolhida.' },
                    tipoRegulador: { type: 'string', enum: ['padrao', 'metal1', 'metal2'], description: 'Regulador escolhido (só bonés).' },
                    corPreferencia: { type: 'string', description: 'Cor(es) que o cliente deseja.' }
                },
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'consultar_preco',
            description: 'Retorna o preço REAL da tabela para um modelo. Use SEMPRE antes de falar qualquer valor — nunca invente preço. Se faltar o modelo, o cliente precisa escolher um primeiro.',
            parameters: {
                type: 'object',
                properties: {
                    modelo: { type: 'string', enum: Object.keys(CATALOGO_MODELOS), description: 'Código do modelo. Omita para usar o modelo já escolhido pelo cliente.' },
                    quantidade: { type: 'integer', description: 'Quantidade. Omita para usar a já informada.' },
                    material: { type: 'string', enum: ['tactel', 'oxford', 'supercap', 'brim', 'alfaiataria', 'camurca'], description: 'Linha/tecido para preço exato. Omita se desconhecido.' }
                },
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'enviar_fotos_modelos',
            description: 'Envia fotos dos produtos do catálogo pelo WhatsApp. Use quando o cliente quiser ver modelos. "recomendados" = os ideais para a finalidade dele; "todos" = catálogo completo; ou um código específico.',
            parameters: {
                type: 'object',
                properties: {
                    quais: { type: 'string', description: '"recomendados", "todos" ou um código IB_ (ex.: IB_TRUCK).' }
                },
                required: ['quais'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'enviar_fotos_tecnicas',
            description: 'Envia as fotos das técnicas de personalização (silk 3D, bordado, sublimação, DTF, patch etc.). Use quando for a hora de o cliente escolher a técnica para a arte dele.',
            parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
    },
    {
        type: 'function',
        function: {
            name: 'enviar_fotos_reguladores',
            description: 'Envia as fotos dos 3 reguladores (só faz sentido para bonés — chapéu, viseira e bolsa não têm regulador).',
            parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
    },
    {
        type: 'function',
        function: {
            name: 'enviar_cartela_cores',
            description: 'Envia a cartela de cores adequada ao modelo escolhido. Use quando o cliente quiser ver/escolher a cor.',
            parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
    },
    {
        type: 'function',
        function: {
            name: 'gerar_mockup',
            description: 'Gera uma prévia ilustrativa da logo do cliente aplicada no modelo. Só funciona se o cliente já ENVIOU a arte e escolheu o modelo. Use quando ele pedir para ver como fica.',
            parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
    },
    {
        type: 'function',
        function: {
            name: 'transferir_consultor',
            description: 'Finaliza a qualificação e transfere o lead para o consultor humano. Use APENAS quando já tiver os dados essenciais (nome, quantidade válida, finalidade, modelo) e o cliente estiver pronto para fechar, OU em pedidos grandes/negociações especiais.',
            parameters: {
                type: 'object',
                properties: {
                    motivo: { type: 'string', description: 'Motivo curto da transferência (ex.: "qualificação completa", "pedido acima de 100").' }
                },
                additionalProperties: false
            }
        }
    }
];

// =============================================================
//  EXECUTORES DAS FERRAMENTAS
//  Cada um recebe (args, ctx) e retorna um objeto (vira JSON no tool msg).
//  ctx = { leadData, io, chatId, agora }
// =============================================================
const EXECUTORES = {
    async registrar_dados(args, ctx) {
        const { leadData } = ctx;
        const avisos = [];

        // Aplica cada campo informado (com tradução quando necessário)
        if (args.nome && !leadData.nome) leadData.nome = args.nome;
        if (args.tipoAtendimento) leadData.tipoAtendimento = args.tipoAtendimento;
        if (args.usoEvento && !leadData.usoEvento) leadData.usoEvento = args.usoEvento;
        if (args.prazoRecebimento && !leadData.prazoRecebimento) leadData.prazoRecebimento = args.prazoRecebimento;
        if (args.modeloEscolhido) leadData.modeloEscolhido = args.modeloEscolhido;
        if (args.tipoChapeu) leadData.tipoChapeu = args.tipoChapeu;
        if (args.material) leadData.material = args.material; // sempre atualiza (pode subir/descer de nível)
        if (args.temArte) leadData.temArte = args.temArte;
        if (args.quandoEnviaArte) leadData.quandoEnviaArte = args.quandoEnviaArte;
        if (args.tecnica) leadData.tecnica = NOMES_TECNICA[args.tecnica] || args.tecnica;
        if (args.tipoRegulador) leadData.tipoRegulador = NOMES_REGULADOR[args.tipoRegulador] || args.tipoRegulador;
        if (args.corPreferencia) leadData.corPreferencia = args.corPreferencia;

        // Regulador não se aplica a chapéu/viseira/bolsa
        if (leadData.modeloEscolhido && MODELOS_SEM_REG.includes(leadData.modeloEscolhido) && !leadData.tipoRegulador) {
            leadData.tipoRegulador = 'Não se aplica';
        }

        // GUARD — pedido mínimo (25 un.). Abaixo disso não avança.
        if (args.quantidade != null) {
            const q = parseInt(args.quantidade, 10);
            if (Number.isFinite(q) && q > 0 && q < 25) {
                leadData.avisarMinimo = q;
                leadData.quantidade = null;
                avisos.push(`PEDIDO ABAIXO DO MÍNIMO: cliente pediu ${q} un. O mínimo é 30 (ou 25 com +R$1,50/un, ou combos 20+20 / 25+25 com o mesmo logo). Explique com gentileza e peça para ajustar ANTES de avançar. Não confirme pedido nem transfira.`);
            } else if (Number.isFinite(q) && q >= 25) {
                leadData.quantidade = q;
                leadData.avisarMinimo = null;
            }
        }

        // Carimba etapa do funil
        if (leadData.quantidade && leadData.usoEvento) marcarEtapa(leadData, 'qualificando', ctx.agora);
        if (leadData.modeloEscolhido) marcarEtapa(leadData, 'modelo', ctx.agora);
        if (leadData.tecnica) marcarEtapa(leadData, 'tecnica', ctx.agora);
        if (leadData.corPreferencia) marcarEtapa(leadData, 'cor', ctx.agora);

        return { ok: true, avisos, estado: estadoResumido(leadData) };
    },

    async consultar_preco(args, ctx) {
        const { leadData } = ctx;
        const codigo = (args.modelo || leadData.modeloEscolhido || '').toUpperCase();
        if (!codigo || !CATALOGO_MODELOS[codigo]) {
            return { ok: false, motivo: 'Modelo ainda não definido. Peça ao cliente para escolher um produto antes de falar preço.' };
        }
        const qtd = args.quantidade != null ? args.quantidade : leadData.quantidade;
        const material = args.material || leadData.material;
        const contexto = orcamento.contextoPreco(codigo, qtd, CATALOGO_MODELOS[codigo]?.nome, material);
        marcarEtapa(leadData, 'orcamento', ctx.agora);
        if (!contexto) return { ok: false, motivo: 'Sem preço tabelado para essa combinação. Encaminhe para o consultor.' };
        return { ok: true, precoReal: contexto };
    },

    async enviar_fotos_modelos(args, ctx) {
        const { leadData, io, chatId } = ctx;
        const quais = String(args.quais || 'recomendados').trim();
        let codigos;

        if (/^todos$/i.test(quais)) {
            codigos = Object.keys(CATALOGO_MODELOS);
        } else if (/^IB_/i.test(quais) && CATALOGO_MODELOS[quais.toUpperCase()]) {
            codigos = [quais.toUpperCase()];
        } else {
            codigos = io.recomendarModelos(leadData);
        }

        leadData.modelosEnviados = [...new Set([...(leadData.modelosEnviados || []), ...codigos])];
        const enviados = [];
        for (const codigo of codigos) {
            const m = CATALOGO_MODELOS[codigo];
            if (!m) continue;
            const legenda = `🧢 *${m.nome}* (${m.codigo})\n\n${m.descricao}\n\n💰 ${m.precoReferencia}`;
            await io.enviarImagens(chatId, [m.arquivo], legenda);
            enviados.push(m.nome);
        }
        return { ok: true, enviados, obs: 'Fotos enviadas. Escreva uma mensagem curta perguntando qual o cliente prefere.' };
    },

    async enviar_fotos_tecnicas(args, ctx) {
        const { io, chatId } = ctx;
        const enviadas = [];
        for (const key of Object.keys(OPCOES_TECNICAS)) {
            const t = OPCOES_TECNICAS[key];
            await io.enviarImagens(chatId, t.arquivos, `*${t.nome}*\n\n${t.descricao}`);
            enviadas.push(t.nome);
        }
        return { ok: true, enviadas, obs: 'Técnicas enviadas. Pergunte qual combina mais com a arte dele.' };
    },

    async enviar_fotos_reguladores(args, ctx) {
        const { leadData, io, chatId } = ctx;
        if (leadData.modeloEscolhido && MODELOS_SEM_REG.includes(leadData.modeloEscolhido)) {
            return { ok: false, motivo: 'Este produto não tem regulador (chapéu/viseira/bolsa).' };
        }
        for (const [, reg] of Object.entries(OPCOES_REGULADORES)) {
            await io.enviarImagens(chatId, [reg.arquivo], `*${reg.nome}*\n💰 Adicional: ${reg.adicional}`);
        }
        return { ok: true, obs: 'Reguladores enviados. Pergunte qual ele prefere.' };
    },

    async enviar_cartela_cores(args, ctx) {
        const { leadData, io, chatId } = ctx;
        const cartelas = io.cartelasDoLead(leadData);
        for (const c of cartelas) {
            await io.enviarImagens(chatId, [c.arquivo], `Cartela de cores — ${c.nome}`);
        }
        leadData.coresEnviadas = true;
        return { ok: true, obs: 'Cartela(s) enviada(s). Pergunte qual cor ele prefere.' };
    },

    async gerar_mockup(args, ctx) {
        const { leadData, io, chatId } = ctx;
        if (!leadData.logoUrl) return { ok: false, motivo: 'O cliente ainda não enviou a arte/logo. Peça a arte antes.' };
        if (!leadData.modeloEscolhido) return { ok: false, motivo: 'Escolha o modelo antes de gerar a prévia.' };
        const ok = await io.gerarMockup(chatId, leadData);
        return ok
            ? { ok: true, obs: 'Prévia enviada ao cliente. Pergunte o que ele achou.' }
            : { ok: false, motivo: 'Não foi possível gerar agora. Diga que o consultor manda um mockup caprichado.' };
    },

    async transferir_consultor(args, ctx) {
        const { leadData, io, chatId } = ctx;
        leadData.finalizado = true;
        leadData.qualificacaoCompleta = true;
        leadData.followUpDueAt = null;
        leadData.motivoTransferencia = args.motivo || 'qualificação completa';
        marcarEtapa(leadData, 'finalizado', ctx.agora);
        await io.enviarMensagem(chatId, 'Transferir para o departamento Comercial');
        await io.notificarEquipe(leadData, chatId, args.motivo && /100|grande|especial/i.test(args.motivo) ? { tagExtra: 'Transbordo' } : {});
        return { ok: true, obs: 'Lead transferido. Encerre com uma mensagem calorosa dizendo que o consultor vai continuar.' };
    }
};

// Resumo compacto do estado, devolvido nas tool responses
function estadoResumido(l) {
    return {
        nome: l.nome || null, tipoAtendimento: l.tipoAtendimento || null,
        quantidade: l.quantidade || null, usoEvento: l.usoEvento || null,
        prazoRecebimento: l.prazoRecebimento || null, modeloEscolhido: l.modeloEscolhido || null,
        material: l.material || null, temArte: l.temArte || null,
        tecnica: l.tecnica || null, tipoRegulador: l.tipoRegulador || null,
        corPreferencia: l.corPreferencia || null, avisarMinimo: l.avisarMinimo || null
    };
}

// =============================================================
//  LOOP PRINCIPAL DO AGENTE
//  Retorna { resposta, toolsChamadas, leadData }.
//  `resposta` é o texto a enviar ao cliente (index.js faz o envio).
//  Fotos/mockup/transferência já foram enviados pelas ferramentas.
// =============================================================
async function rodarAgente({ openai, leadData, mensagemCliente, io, chatId, contexto = {}, agora = null }) {
    const ctx = { leadData, io, chatId, agora: agora || obterAgoraISO() };
    marcarEtapa(leadData, 'contato', ctx.agora);

    const historico = (leadData.conversationHistory || []).slice(-30).map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
    }));

    // Contexto pontual desta mensagem (imagem vista, aviso de mínimo pendente)
    const dicas = [];
    if (contexto.analiseImagem) dicas.push(`O cliente enviou uma imagem. Você viu: ${contexto.analiseImagem}`);
    if (leadData.avisarMinimo) dicas.push(`Pendência: o último pedido de quantidade (${leadData.avisarMinimo}) está abaixo do mínimo — resolva isso.`);
    const conteudoUsuario = dicas.length
        ? `${mensagemCliente}\n\n[contexto interno: ${dicas.join(' | ')}]`
        : mensagemCliente;

    const messages = [
        { role: 'system', content: promptAgente(leadData) },
        ...historico,
        { role: 'user', content: conteudoUsuario }
    ];

    const toolsChamadas = [];
    let resposta = '';

    for (let i = 0; i < MAX_ITERACOES; i++) {
        const completion = await criarCompletionComRetry(openai, {
            model: MODELO_IA,
            messages,
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.5
        });

        const msg = completion.choices[0].message;
        messages.push(msg);

        const chamadas = msg.tool_calls || [];
        if (!chamadas.length) {
            resposta = (msg.content || '').trim();
            break;
        }

        // Texto que a IA escreveu junto das tool calls (lead-in) — envia antes das fotos
        if (msg.content && msg.content.trim()) {
            await io.enviarMensagem(chatId, msg.content.trim());
            leadData.conversationHistory = leadData.conversationHistory || [];
            leadData.conversationHistory.push({ role: 'assistant', content: msg.content.trim() });
        }

        for (const chamada of chamadas) {
            const nome = chamada.function?.name;
            let args = {};
            try { args = JSON.parse(chamada.function?.arguments || '{}'); } catch (_) { args = {}; }
            let resultado;
            try {
                const exec = EXECUTORES[nome];
                resultado = exec ? await exec(args, ctx) : { ok: false, motivo: `ferramenta desconhecida: ${nome}` };
            } catch (e) {
                console.error(`❌ Erro na ferramenta ${nome}:`, e.message);
                resultado = { ok: false, erro: e.message };
            }
            toolsChamadas.push({ nome, args, resultado });
            messages.push({ role: 'tool', tool_call_id: chamada.id, content: JSON.stringify(resultado) });
        }
    }

    // Transbordo determinístico (paridade com o legado): pedidos grandes (>100 un.) vão
    // para negociação especial com o consultor, independente de o modelo lembrar de chamar
    // a ferramenta. Não confia no "humor" do modelo — a regra de negócio é a fonte de verdade.
    if (!leadData.finalizado && Number(leadData.quantidade) > 100) {
        await EXECUTORES.transferir_consultor(
            { motivo: `pedido grande (${leadData.quantidade} un.) — negociação especial` },
            ctx
        );
        if (!resposta) {
            resposta = 'Pra um pedido desse tamanho, vou te passar pra um dos nossos consultores fazer uma condição especial pra você! 🤝';
        }
    }

    return { resposta, toolsChamadas, leadData };
}

// Chamada à OpenAI com retry/backoff em 429 (rate limit) e erros transitórios 5xx.
async function criarCompletionComRetry(openai, params, tentativas = 4) {
    let espera = 800;
    for (let i = 0; ; i++) {
        try {
            return await openai.chat.completions.create(params);
        } catch (e) {
            const status = e.status || e.response?.status;
            const transitorio = status === 429 || (status >= 500 && status < 600);
            if (transitorio && i < tentativas - 1) {
                console.warn(`⏳ OpenAI ${status} — retry em ${espera}ms (tentativa ${i + 1}/${tentativas})`);
                await new Promise(r => setTimeout(r, espera));
                espera *= 2;
                continue;
            }
            throw e;
        }
    }
}

function obterAgoraISO() {
    // new Date() sem args é permitido em runtime normal (a restrição é só dos scripts de workflow)
    return new Date().toISOString();
}

module.exports = { rodarAgente, TOOLS, EXECUTORES, marcarEtapa, estagioDoLead, ORDEM_ETAPAS, ETAPAS_FUNIL, estadoResumido };
