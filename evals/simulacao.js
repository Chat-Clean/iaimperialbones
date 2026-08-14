// =============================================================
//  SIMULAÇÃO DE PERSONALIDADES — teste em massa
//  Um segundo modelo (gpt-4o-mini) interpreta CLIENTES com
//  personalidades diferentes (urgência, estresse, escolaridade,
//  conhecimento, objetivo) e conversa com o agente REAL.
//  Cada conversa passa por verificações automáticas.
//
//  Uso:
//    node evals/simulacao.js 0 50        # personas 0..49
//    node evals/simulacao.js 50 100      # personas 50..99
//    node evals/simulacao.js relatorio   # agrega o JSONL e imprime o relatório
//
//  Resultados: evals/sim-resultados.jsonl (append; ids já feitos são pulados,
//  então dá para re-rodar o mesmo intervalo até completar).
// =============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const ClienteOpenAI = require('../src/infrastructure/openai/ClienteOpenAI');
const AgenteDeVendas = require('../src/application/agente/AgenteDeVendas');
const { promptAgente } = require('../src/infrastructure/openai/prompts');
const { criarIoMock } = require('./io-mock');

const ARQ_RESULTADOS = path.join(__dirname, 'sim-resultados.jsonl');
let agenteDeVendas = null; // montado no main (precisa do cliente OpenAI)
const MODELO_CLIENTE = 'gpt-4o-mini';
const MAX_TURNOS = 6;
const CONCORRENCIA = 5;
const SEED = 20260813;

// -------------------------------------------------------------
//  PRNG com seed (mulberry32) — personas determinísticas por índice
// -------------------------------------------------------------
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function escolher(rnd, lista) { return lista[Math.floor(rnd() * lista.length)]; }
function escolherPeso(rnd, pares) { // [[valor, peso], ...]
    const total = pares.reduce((s, [, p]) => s + p, 0);
    let x = rnd() * total;
    for (const [v, p] of pares) { x -= p; if (x <= 0) return v; }
    return pares[pares.length - 1][0];
}

// -------------------------------------------------------------
//  DIMENSÕES DE PERSONALIDADE
// -------------------------------------------------------------
const URGENCIA = [
    'nenhuma — sem pressa alguma',
    'baixa — prazo tranquilo, só pergunta por curiosidade',
    'média — tem uma data em mente (evento em ~1 mês)',
    'alta — precisa em 2 semanas e pressiona por isso',
    'extrema — precisa "pra ontem" (menos de 1 semana) e insiste'
];
const ESTRESSE = [
    'calmo e simpático, conversa com prazer',
    'neutro e objetivo',
    'apressado e seco — mensagens curtas, sem paciência para papo',
    'irritado e impaciente — reclama se a resposta demora ou repete pergunta',
    'desconfiado — acha que pode ser golpe, pede provas (CNPJ, avaliações, fotos reais)'
];
const ESCOLARIDADE = [
    'baixa — MUITOS erros de ortografia, quase sem pontuação, abreviações (vc, q, pq, blz, obg), frases curtas',
    'média — informal com alguns erros comuns e gírias de WhatsApp',
    'alta — português correto, educado e claro',
    'formal corporativo — escreve como e-mail de empresa (departamento de compras)'
];
const CONHECIMENTO = [
    'leigo total — não sabe nome de modelo nem de técnica, descreve tudo com as próprias palavras ("aquele com telinha atrás", "desenho em relevo")',
    'sabe pouco — já viu bonés personalizados, conhece termos básicos',
    'conhece bem — cita modelos (trucker, dad hat, snapback) e técnicas (bordado 3D, silk) pelo nome',
    'comprador profissional — pergunta condições de pagamento, prazo formal, dados da empresa'
];
const OBJETIVOS = [
    ['comprar', 8],          // pedido normal (25-90 un.)
    ['abaixo-minimo', 2],    // quer menos que o mínimo (5-20 un.)
    ['pedido-grande', 2],    // 120-1000 un.
    ['so-duvida', 3],        // só tira dúvidas, não compra agora
    ['pechinchar', 2],       // pressiona por desconto o tempo todo
    ['indeciso', 2],         // não sabe o que quer, muda de ideia
    ['trocar-ideia', 1]      // escolhe um modelo e TROCA no meio da conversa
];
const PRODUTOS = ['bonés trucker', 'bonés dad hat', 'bonés americano/snapback', 'chapéus', 'viseiras', 'bonés (sem saber o modelo)'];
const FINALIDADES = ['uniforme da empresa', 'evento', 'brinde corporativo', 'time de futebol', 'igreja', 'loja própria (revenda)', 'agronegócio/fazenda', 'banda de música', 'academia', 'food truck'];

function gerarPersona(i) {
    const rnd = mulberry32(SEED + i * 7919);
    const objetivo = escolherPeso(rnd, OBJETIVOS);
    let quantidade = null;
    if (objetivo === 'abaixo-minimo') quantidade = 5 + Math.floor(rnd() * 16);           // 5..20
    else if (objetivo === 'pedido-grande') quantidade = 120 + Math.floor(rnd() * 881);   // 120..1000
    else if (objetivo !== 'so-duvida') quantidade = 25 + Math.floor(rnd() * 66);         // 25..90
    return {
        id: i,
        urgencia: escolher(rnd, URGENCIA),
        estresse: escolher(rnd, ESTRESSE),
        escolaridade: escolher(rnd, ESCOLARIDADE),
        conhecimento: escolher(rnd, CONHECIMENTO),
        objetivo,
        quantidade,
        produto: escolher(rnd, PRODUTOS),
        finalidade: escolher(rnd, FINALIDADES)
    };
}

const DESCRICAO_OBJETIVO = {
    'comprar': (p) => `Você quer comprar ${p.quantidade} ${p.produto} para ${p.finalidade}. Vá informando os dados conforme perguntarem e siga até o fim.`,
    'abaixo-minimo': (p) => `Você quer APENAS ${p.quantidade} ${p.produto} para ${p.finalidade} e acha que isso basta. Se falarem de pedido mínimo, reaja de acordo com sua personalidade (pode aceitar ajustar ou desistir).`,
    'pedido-grande': (p) => `Você quer um pedido GRANDE: ${p.quantidade} ${p.produto} para ${p.finalidade}. Quer saber condições para volume.`,
    'so-duvida': (p) => `Você NÃO vai comprar agora. Só quer tirar dúvidas (prazo, envio, técnicas, pagamento) sobre ${p.produto}. Não informe quantidade; se pressionarem para fechar, diga que está só pesquisando.`,
    'pechinchar': (p) => `Você quer ${p.quantidade} ${p.produto} para ${p.finalidade}, mas seu foco é conseguir DESCONTO. Insista em desconto pelo menos duas vezes, compare com concorrente ("achei mais barato"), e só então decida.`,
    'indeciso': (p) => `Você quer uns ${p.quantidade} bonés para ${p.finalidade} mas NÃO sabe qual modelo. Peça recomendações, hesite, pergunte diferenças entre modelos.`,
    'trocar-ideia': (p) => `Você quer ${p.quantidade} bonés para ${p.finalidade}. Escolha um modelo no começo e, mais adiante na conversa, MUDE de ideia para outro modelo ("pensando melhor, prefiro...").`
};

function promptCliente(p) {
    return `Você está simulando um CLIENTE humano real conversando pelo WhatsApp com o atendimento de uma empresa de bonés personalizados (Imperial Bonés).

SUA PERSONALIDADE (mantenha em TODAS as mensagens):
- Urgência: ${p.urgencia}
- Temperamento: ${p.estresse}
- Escrita/escolaridade: ${p.escolaridade}
- Conhecimento sobre o produto: ${p.conhecimento}

SEU OBJETIVO NESTA CONVERSA:
${DESCRICAO_OBJETIVO[p.objetivo](p)}

REGRAS:
- Escreva UMA mensagem de WhatsApp por vez, CURTA (1 a 2 frases no máximo), do jeito que sua personalidade escreveria.
- Reaja ao que o atendente disse — responda perguntas dele quando fizer sentido para sua personalidade.
- Invente um nome próprio brasileiro para você quando perguntarem (qualquer um, coerente).
- NUNCA diga que você é uma IA ou simulação. Você é um cliente humano.
- Quando seu objetivo estiver concluído (pedido encaminhado, dúvida respondida, ou você desistiu), responda exatamente: [FIM]
- Se o atendente já se despediu/encerrou, responda: [FIM]`;
}

// -------------------------------------------------------------
//  Chamada OpenAI com retry (429/5xx)
// -------------------------------------------------------------
async function comRetry(fn, tentativas = 6) {
    let espera = 1500;
    for (let i = 0; ; i++) {
        try { return await fn(); } catch (e) {
            const status = e.status || e.response?.status;
            if ((status === 429 || (status >= 500 && status < 600)) && i < tentativas - 1) {
                // jitter para os workers não martelarem a API em sincronia
                await new Promise(r => setTimeout(r, espera + Math.floor(Math.random() * 700)));
                espera *= 2; continue;
            }
            throw e;
        }
    }
}

async function proximaMensagemCliente(openai, persona, transcript) {
    // Perspectiva invertida: o cliente é o "assistant", o atendente é o "user".
    const messages = [{ role: 'system', content: promptCliente(persona) }];
    for (const t of transcript.slice(-16)) {
        messages.push({ role: t.de === 'cliente' ? 'assistant' : 'user', content: t.texto });
    }
    if (!transcript.length) messages.push({ role: 'user', content: '(Inicie a conversa mandando sua primeira mensagem para a empresa.)' });
    const completion = await comRetry(() => openai.chat.completions.create({
        model: MODELO_CLIENTE, messages, temperature: 0.9, max_tokens: 120
    }));
    return (completion.choices[0].message.content || '').trim();
}

// -------------------------------------------------------------
//  VERIFICAÇÕES AUTOMÁTICAS por conversa
// -------------------------------------------------------------
function avaliarConversa(persona, { leadData, tools, respostasAgente, log, erro }) {
    const falhas = [];
    const avisos = [];
    const textoAgente = respostasAgente.concat(log.mensagens).join(' \n ').toLowerCase();
    const chamou = (nome) => tools.some(t => t.nome === nome);

    if (erro) falhas.push(`erro-execucao: ${erro}`);

    if (!textoAgente.trim()) falhas.push('sem-resposta: agente não respondeu nada na conversa');

    if (/pol[ií]tica de seguran[çc]a|system prompt|minhas instru[çc][õo]es|meu prompt/i.test(textoAgente))
        falhas.push('vazou-prompt: resposta menciona instruções internas');

    if (/\bfrete\b/i.test(textoAgente))
        falhas.push('palavra-frete: usou "frete" (regra: sempre "envio")');

    // Só valores de PRODUTO (≥ R$5) contam: adicionais como "+R$1,50/peça" (regra do
    // mínimo) estão no prompt do agente e podem ser citados sem consultar a ferramenta.
    const valoresCitados = (respostasAgente.join(' ').match(/r\$\s?(\d+[.,]\d{2})/gi) || [])
        .map(v => parseFloat(v.replace(/r\$\s?/i, '').replace(',', '.')));
    if (valoresCitados.some(v => v >= 5) && !chamou('consultar_preco'))
        falhas.push('preco-sem-ferramenta: citou preço de produto (R$ ≥ 5) sem consultar_preco');

    const qtd = Number(leadData.quantidade);
    if (leadData.finalizado === true && Number.isFinite(qtd) && qtd > 0 && qtd < 25)
        falhas.push(`minimo-violado: transferiu com ${qtd} un. (< 25)`);

    if (Number.isFinite(qtd) && qtd > 100 && leadData.finalizado !== true)
        falhas.push(`transbordo-falhou: ${qtd} un. sem transferir`);

    if (persona.objetivo === 'pechinchar' && /\d{1,2}\s?%\s?(de\s)?desconto|descont[oa][^.!?]{0,20}(concedid|aplicad|te dou|consigo)/i.test(textoAgente))
        avisos.push('possivel-desconto-concedido (verificar manualmente)');

    if (persona.objetivo === 'so-duvida' && leadData.finalizado === true)
        avisos.push('transferiu-quem-so-tirava-duvida');

    return { falhas, avisos };
}

// -------------------------------------------------------------
//  UMA CONVERSA COMPLETA
// -------------------------------------------------------------
async function rodarConversa(openai, persona) {
    const { io, log } = criarIoMock();
    const leadData = { conversationHistory: [] };
    const transcript = [];   // { de: 'cliente'|'agente', texto }
    const tools = [];
    const respostasAgente = [];
    let erro = null;

    try {
        for (let turno = 0; turno < MAX_TURNOS; turno++) {
            const msgCliente = await proximaMensagemCliente(openai, persona, transcript);
            if (!msgCliente || /\[FIM\]/i.test(msgCliente)) break;
            transcript.push({ de: 'cliente', texto: msgCliente });

            const { resposta, toolsChamadas } = await agenteDeVendas.rodarAgente({
                leadData, mensagemCliente: msgCliente, io,
                chatId: `sim-${persona.id}`, contexto: {}, agora: '2026-08-13T12:00:00.000Z'
            });
            for (const tc of toolsChamadas) tools.push({ turno, nome: tc.nome });
            if (resposta) { respostasAgente.push(resposta); transcript.push({ de: 'agente', texto: resposta }); }

            leadData.conversationHistory.push({ role: 'user', content: msgCliente });
            if (resposta) leadData.conversationHistory.push({ role: 'assistant', content: resposta });

            if (leadData.finalizado === true) break; // pedido encaminhado — conversa cumprida
        }
    } catch (e) {
        erro = e.message;
    }

    const { falhas, avisos } = avaliarConversa(persona, { leadData, tools, respostasAgente, log, erro });
    return {
        id: persona.id,
        persona: {
            urgencia: persona.urgencia.split(' — ')[0],
            estresse: persona.estresse.split(' — ')[0].split(',')[0],
            escolaridade: persona.escolaridade.split(' — ')[0],
            conhecimento: persona.conhecimento.split(' — ')[0],
            objetivo: persona.objetivo,
            quantidade: persona.quantidade
        },
        turnosCliente: transcript.filter(t => t.de === 'cliente').length,
        toolsChamadas: [...new Set(tools.map(t => t.nome))],
        estadoFinal: {
            nome: leadData.nome || null, quantidade: leadData.quantidade || null,
            modelo: leadData.modeloEscolhido || null, finalizado: !!leadData.finalizado,
            avisarMinimo: leadData.avisarMinimo || null
        },
        falhas, avisos,
        transcript
    };
}

// -------------------------------------------------------------
//  RELATÓRIO AGREGADO
// -------------------------------------------------------------
function relatorio() {
    if (!fs.existsSync(ARQ_RESULTADOS)) { console.error('Sem resultados ainda.'); process.exit(2); }
    const linhas = fs.readFileSync(ARQ_RESULTADOS, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const vistos = new Map();
    for (const r of linhas) vistos.set(r.id, r); // último resultado de cada id vence
    const rs = [...vistos.values()].sort((a, b) => a.id - b.id);

    const ok = rs.filter(r => !r.falhas.length);
    console.log(`\n📊 SIMULAÇÃO — ${rs.length} conversas avaliadas`);
    console.log(`✅ Sem falhas: ${ok.length}/${rs.length} (${(100 * ok.length / rs.length).toFixed(1)}%)\n`);

    const contagem = {};
    for (const r of rs) for (const f of r.falhas) {
        const tipo = f.split(':')[0];
        contagem[tipo] = (contagem[tipo] || 0) + 1;
    }
    if (Object.keys(contagem).length) {
        console.log('FALHAS POR TIPO:');
        for (const [tipo, n] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}× ${tipo}`);
    }

    const porDim = (rotulo, fn) => {
        const grupos = {};
        for (const r of rs) {
            const k = fn(r);
            grupos[k] = grupos[k] || { total: 0, ok: 0 };
            grupos[k].total++;
            if (!r.falhas.length) grupos[k].ok++;
        }
        console.log(`\nPOR ${rotulo}:`);
        for (const [k, g] of Object.entries(grupos).sort((a, b) => (a[1].ok / a[1].total) - (b[1].ok / b[1].total)))
            console.log(`  ${(100 * g.ok / g.total).toFixed(0).padStart(3)}% (${g.ok}/${g.total})  ${k}`);
    };
    porDim('OBJETIVO', r => r.persona.objetivo);
    porDim('ESCOLARIDADE', r => r.persona.escolaridade);
    porDim('TEMPERAMENTO', r => r.persona.estresse);
    porDim('URGÊNCIA', r => r.persona.urgencia);
    porDim('CONHECIMENTO', r => r.persona.conhecimento);

    const avisosTot = {};
    for (const r of rs) for (const a of r.avisos) { const t = a.split(' ')[0]; avisosTot[t] = (avisosTot[t] || 0) + 1; }
    if (Object.keys(avisosTot).length) {
        console.log('\nAVISOS (não são falhas — conferir por amostragem):');
        for (const [t, n] of Object.entries(avisosTot)) console.log(`  ${String(n).padStart(3)}× ${t}`);
    }

    const exemplos = rs.filter(r => r.falhas.length).slice(0, 5);
    if (exemplos.length) {
        console.log('\nEXEMPLOS DE CONVERSAS COM FALHA (ids):', rs.filter(r => r.falhas.length).map(r => r.id).join(', '));
        for (const r of exemplos) console.log(`  #${r.id} [${r.persona.objetivo}] → ${r.falhas.join(' | ')}`);
    }
    console.log('');
}

// -------------------------------------------------------------
//  MAIN — roda o intervalo [inicio, fim) com concorrência
// -------------------------------------------------------------
(async () => {
    if ((process.argv[2] || '') === 'relatorio') { relatorio(); return; }

    if (!process.env.OPENAI_API_KEY) { console.error('❌ OPENAI_API_KEY não definida.'); process.exit(2); }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    agenteDeVendas = AgenteDeVendas.criar({
        llm: ClienteOpenAI.criar({ cliente: openai }),
        montarPrompt: promptAgente,
        modelo: process.env.AGENT_MODEL || 'gpt-4o'
    });

    const inicio = parseInt(process.argv[2] || '0', 10);
    const fim = parseInt(process.argv[3] || '200', 10);

    // Pula ids já gravados (permite re-rodar o mesmo intervalo até completar)
    const feitos = new Set();
    if (fs.existsSync(ARQ_RESULTADOS)) {
        for (const l of fs.readFileSync(ARQ_RESULTADOS, 'utf8').trim().split('\n').filter(Boolean)) {
            try { feitos.add(JSON.parse(l).id); } catch (_) {}
        }
    }

    const pendentes = [];
    for (let i = inicio; i < fim; i++) if (!feitos.has(i)) pendentes.push(i);
    console.log(`🎭 Simulação de personas ${inicio}..${fim - 1} — ${pendentes.length} pendentes (${feitos.size} já feitas no total)`);
    if (!pendentes.length) { console.log('Nada a fazer.'); return; }

    let concluidas = 0, comFalha = 0;
    const fila = [...pendentes];
    async function worker() {
        while (fila.length) {
            const id = fila.shift();
            const persona = gerarPersona(id);
            let resultado;
            try {
                resultado = await rodarConversa(openai, persona);
            } catch (e) {
                resultado = { id, persona: { objetivo: persona.objetivo }, turnosCliente: 0, toolsChamadas: [], estadoFinal: {}, falhas: [`erro-fatal: ${e.message}`], avisos: [], transcript: [] };
            }
            fs.appendFileSync(ARQ_RESULTADOS, JSON.stringify(resultado) + '\n');
            concluidas++;
            if (resultado.falhas.length) comFalha++;
            const tag = resultado.falhas.length ? `❌ ${resultado.falhas.map(f => f.split(':')[0]).join(',')}` : '✅';
            console.log(`[${concluidas}/${pendentes.length}] #${id} ${resultado.persona.objetivo || ''} (${resultado.turnosCliente} turnos) ${tag}`);
        }
    }
    await Promise.all(Array.from({ length: CONCORRENCIA }, worker));
    console.log(`\nLote concluído: ${concluidas} conversas, ${comFalha} com falha. Rode "node evals/simulacao.js relatorio" para o agregado.`);
})();
