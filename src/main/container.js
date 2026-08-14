// =============================================================
//  COMPOSITION ROOT — único lugar que conhece adapters concretos.
//  criar(config, sobrescritas) → Dependencias
//  `sobrescritas` permite aos evals/testers trocar canal, repositório
//  ou cliente OpenAI sem duplicar a montagem.
// =============================================================

const path = require('path');
const OpenAI = require('openai');

const CanalChatClean = require('../infrastructure/chatclean/CanalChatClean');
const ClienteOpenAI = require('../infrastructure/openai/ClienteOpenAI');
const ExtratorOpenAI = require('../infrastructure/openai/ExtratorOpenAI');
const RedatorOpenAI = require('../infrastructure/openai/RedatorOpenAI');
const LeitorDeImagemOpenAI = require('../infrastructure/openai/LeitorDeImagemOpenAI');
const TranscritorWhisper = require('../infrastructure/openai/TranscritorWhisper');
const GeradorDeMockupOpenAI = require('../infrastructure/openai/GeradorDeMockupOpenAI');
const BaixadorHttp = require('../infrastructure/midia/BaixadorHttp');
const RepositorioMemoria = require('../infrastructure/memoria/RepositorioMemoria');
const RepositorioRedis = require('../infrastructure/redis/RepositorioRedis');
const prompts = require('../infrastructure/openai/prompts');
const AgenteDeVendas = require('../application/agente/AgenteDeVendas');

const RAIZ = path.resolve(__dirname, '..', '..');

// Sem REDIS_URL → memória. Com REDIS_URL → Redis com reserva em memória
// (cada operação que falhar cai para a reserva; se a construção lançar,
// cai inteira para a memória com log).
function montarRepositorio(config) {
    const memoria = RepositorioMemoria.criar({ raiz: RAIZ });
    if (!config.REDIS_URL) return memoria;
    try {
        return RepositorioRedis.criar({ url: config.REDIS_URL, prefixo: config.REDIS_PREFIX, reserva: memoria });
    } catch (e) {
        console.error('❌ Falha ao iniciar o Redis, usando memória:', e.message);
        return memoria;
    }
}

function criar(config, sobrescritas = {}) {
    // Um único cliente OpenAI injetado em todos os adapters
    const cliente = sobrescritas.cliente || new OpenAI({ apiKey: config.OPENAI_API_KEY });

    const canal = sobrescritas.canal || CanalChatClean.criar({
        pushUrl: config.CC_PUSH_URL,
        baseUrl: config.BASE_URL,
        equipeNumero: config.EQUIPE_NUMERO,
        raiz: RAIZ
    });

    // Mesmo objeto do canal, capacidade distinta (ISP): notificar a equipe
    // não é a mesma porta que falar com o cliente.
    const notificador = sobrescritas.notificador || canal;

    const repositorio = sobrescritas.repositorio || montarRepositorio(config);
    const llm = sobrescritas.llm || ClienteOpenAI.criar({ cliente });
    const mockup = sobrescritas.mockup || GeradorDeMockupOpenAI.criar({ cliente, canal, raiz: RAIZ, habilitado: config.MOCKUP_ENABLED });

    const agente = sobrescritas.agente || AgenteDeVendas.criar({
        llm,
        montarPrompt: prompts.promptAgente,
        modelo: config.AGENT_MODEL
    });

    return {
        raiz: RAIZ,
        cliente,
        canal,
        notificador,
        repositorio,
        llm,
        agente,
        mockup,
        extrator: sobrescritas.extrator || ExtratorOpenAI.criar({ cliente }),
        redator: sobrescritas.redator || RedatorOpenAI.criar({ cliente }),
        leitorDeImagem: sobrescritas.leitorDeImagem || LeitorDeImagemOpenAI.criar({ cliente }),
        transcritor: sobrescritas.transcritor || TranscritorWhisper.criar({ cliente }),
        baixadorDeMidia: sobrescritas.baixadorDeMidia || BaixadorHttp.criar(),
        prompts
    };
}

module.exports = { criar, montarRepositorio, RAIZ };
