// =============================================================
//  RUNNER DE EVALS — Fase 3
//  Roda cada cenário contra o agente REAL (API OpenAI) com io mockado.
//  Asserta ferramentas chamadas e estado final. Não envia WhatsApp.
//
//  Uso:
//    node evals/run.js                # roda todos
//    node evals/run.js preco          # só cenários cujo nome contém "preco"
//    OPENAI_API_KEY=... node evals/run.js
//
//  Sai com código 1 se algum assert falhar (útil em CI).
// =============================================================
require('dotenv').config();
const OpenAI = require('openai');
const { rodarAgente } = require('../agente');
const { criarIoMock } = require('./io-mock');
const { scenarios } = require('./scenarios');

const filtro = (process.argv[2] || '').toLowerCase();
const CHAT_ID = '5584900000000';

if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY não definida (.env). Os evals chamam a API real.');
    process.exit(2);
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function rodarCenario(cenario) {
    const { io, log } = criarIoMock();
    const leadData = { conversationHistory: [] };
    const tools = [];
    const respostas = [];

    for (let i = 0; i < cenario.turnos.length; i++) {
        const t = cenario.turnos[i];
        const texto = typeof t === 'string' ? t : t.texto;
        const contexto = {};
        if (typeof t === 'object') {
            if (t.arte) leadData.logoUrl = 'https://exemplo.com/logo-cliente.png';
            if (t.analiseImagem) contexto.analiseImagem = t.analiseImagem;
        }

        const { resposta, toolsChamadas } = await rodarAgente({
            openai, leadData, mensagemCliente: texto, io, chatId: CHAT_ID, contexto,
            agora: '2026-07-21T12:00:00.000Z'
        });

        for (const tc of toolsChamadas) tools.push({ turno: i, ...tc });
        respostas.push(resposta || '');

        // Espelha o que o index.js faz: registra o turno no histórico
        leadData.conversationHistory.push({ role: 'user', content: texto });
        if (resposta) leadData.conversationHistory.push({ role: 'assistant', content: resposta });
    }

    const ctx = {
        leadData, tools, respostas, log,
        chamou: (nome) => tools.some(x => x.nome === nome),
        toolsDe: (nome) => tools.filter(x => x.nome === nome),
        textoTudo: respostas.join(' \n ').toLowerCase()
    };

    const checks = cenario.assert(ctx);
    return { checks, ctx };
}

(async () => {
    const alvo = scenarios.filter(s => !filtro || s.nome.toLowerCase().includes(filtro));
    if (!alvo.length) {
        console.error(`Nenhum cenário casa com "${filtro}". Disponíveis: ${scenarios.map(s => s.nome).join(', ')}`);
        process.exit(2);
    }

    console.log(`\n🧪 Rodando ${alvo.length} cenário(s) de eval (API OpenAI real)\n`);
    let totalChecks = 0, totalPass = 0, cenariosFalhos = 0;

    for (const cenario of alvo) {
        process.stdout.write(`▶️  ${cenario.nome} — ${cenario.descricao}\n`);
        let resultado;
        try {
            resultado = await rodarCenario(cenario);
        } catch (e) {
            console.error(`   💥 ERRO ao rodar: ${e.message}\n`);
            cenariosFalhos++;
            continue;
        }
        const { checks, ctx } = resultado;
        let falhouAqui = false;
        for (const c of checks) {
            totalChecks++;
            if (c.pass) { totalPass++; console.log(`   ✅ ${c.desc}`); }
            else { falhouAqui = true; console.log(`   ❌ ${c.desc}`); }
        }
        if (falhouAqui) {
            cenariosFalhos++;
            // Contexto de depuração quando falha
            const nomesTools = ctx.tools.map(t => t.nome);
            console.log(`   🔎 tools chamadas: [${nomesTools.join(', ') || '—'}]`);
            console.log(`   🔎 estado: qtd=${ctx.leadData.quantidade} modelo=${ctx.leadData.modeloEscolhido} tecnica=${ctx.leadData.tecnica} final=${!!ctx.leadData.finalizado} min=${ctx.leadData.avisarMinimo}`);
            console.log(`   🔎 última resposta: "${(ctx.respostas[ctx.respostas.length - 1] || '').slice(0, 160)}"`);
        }
        console.log('');
    }

    console.log('─'.repeat(60));
    console.log(`Resultado: ${totalPass}/${totalChecks} asserções OK · ${alvo.length - cenariosFalhos}/${alvo.length} cenários verdes`);
    process.exit(cenariosFalhos > 0 ? 1 : 0);
})();
