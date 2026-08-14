// =============================================================
//  CONFIGURAÇÃO — fonte única, validada UMA vez, antes de abrir a porta
//  validar(env) é PURO (testável): devolve { ok, config | mensagem }.
//  carregar(env) embrulha validar com log + process.exit(1) (fail-fast).
//  avisos(config) lista o que é legal saber mas não impede o boot.
// =============================================================

const { z } = require('zod');

const texto = (padrao = '') => z.string().default(padrao);
const inteiro = (padrao, { min = 1, max = 65535 } = {}) =>
    z.string().default(String(padrao))
        .refine(v => /^\d+$/.test(v), { message: 'precisa ser um número inteiro' })
        .transform(v => parseInt(v, 10))
        .refine(v => v >= min && v <= max, { message: `precisa estar entre ${min} e ${max}` });
// Preserva o legado: só a string exata 'true' liga.
const booleanoPadraoDesligado = () => z.string().default('false').transform(v => v === 'true');
// Preserva o legado: qualquer valor diferente de 'false' liga.
const booleanoPadraoLigado = () => z.string().default('true').transform(v => v !== 'false');
const listaSeparadaPorVirgula = () => z.string().default('')
    .transform(v => v.split(',').map(s => s.trim()).filter(Boolean));

const esquema = z.object({
    NODE_ENV: texto('development'),
    OPENAI_API_KEY: z.string().min(1, 'obrigatória — a IA não funciona sem ela'),
    CC_PUSH_URL: texto(),         // URL autenticada da Push API (token JWT embutido em ?token=...)
    BASE_URL: texto(),            // URL pública deste servidor (sem barra final) — serve /assets
    WEBHOOK_SECRET: texto(),      // token para validar o webhook de entrada (exigido em produção)
    ADMIN_KEY: texto(),           // chave das rotas administrativas (/analytics) — fail-closed
    EQUIPE_NUMERO: texto(),       // WhatsApp interno que recebe o resumo dos leads qualificados
    IA_ALLOWED_CONTACTS: listaSeparadaPorVirgula(), // allow-list de teste (vazio = todos)
    RATE_LIMIT_POR_CONTATO: inteiro(20, { min: 1, max: 1000 }), // mensagens/min por contato
    PORT: inteiro(3000),
    AGENT_MODE: booleanoPadraoDesligado(),  // Fase 3 — núcleo com tool-calling (legado por padrão)
    AGENT_MODEL: texto('gpt-4o'),           // modelo do agente (gpt-4o-mini é instável nas tools terminais)
    MOCKUP_ENABLED: booleanoPadraoLigado(),
    LOG_PAYLOAD: booleanoPadraoDesligado(), // loga o payload cru do webhook (contém PII — só p/ depurar)
    REDIS_URL: texto(),
    REDIS_PREFIX: texto('imperialbones')
});

function validar(env = process.env) {
    const resultado = esquema.safeParse(env);
    if (!resultado.success) {
        const linhas = resultado.error.issues.map(i => {
            const chave = i.path.join('.');
            const recebido = env[chave] === undefined ? '(ausente)' : `"${env[chave]}"`;
            return `  - ${chave}: ${i.message} — recebido ${recebido}`;
        });
        return { ok: false, mensagem: `Configuração inválida:\n${linhas.join('\n')}` };
    }

    const cfg = resultado.data;

    // Endurecimento em produção (fail-closed): sem segredo, o webhook aceitaria
    // requisições de qualquer origem — em produção isso não pode passar.
    if (cfg.NODE_ENV === 'production') {
        const faltando = [];
        if (!cfg.WEBHOOK_SECRET || cfg.WEBHOOK_SECRET.length < 16) {
            faltando.push('  - WEBHOOK_SECRET: obrigatório em produção e com pelo menos 16 caracteres');
        }
        if (!cfg.CC_PUSH_URL) {
            faltando.push('  - CC_PUSH_URL: obrigatória em produção — sem ela a IA não responde ninguém');
        }
        if (faltando.length) {
            return { ok: false, mensagem: `Configuração inválida para NODE_ENV=production:\n${faltando.join('\n')}` };
        }
    }

    return { ok: true, config: Object.freeze({ ...cfg, ehProducao: cfg.NODE_ENV === 'production' }) };
}

function carregar(env = process.env) {
    const resultado = validar(env);
    if (!resultado.ok) {
        console.error(`❌ ${resultado.mensagem}`);
        process.exit(1);
    }
    return resultado.config;
}

// Coisas que não impedem o boot, mas merecem atenção no log de inicialização.
function avisos(config) {
    const lista = [];
    if (!config.CC_PUSH_URL)   lista.push('CC_PUSH_URL não configurado — a IA não conseguirá responder.');
    if (!config.BASE_URL)      lista.push('BASE_URL não configurado — envio de imagens desativado.');
    if (!config.EQUIPE_NUMERO) lista.push('EQUIPE_NUMERO não configurado — resumo de lead qualificado só irá como nota interna.');
    if (!config.WEBHOOK_SECRET) lista.push('WEBHOOK_SECRET não configurado — o webhook aceita requisições sem autenticação.');
    if (!config.ADMIN_KEY)     lista.push('ADMIN_KEY não configurada — /analytics responderá 503 (fail-closed).');
    if (!config.REDIS_URL)     lista.push('REDIS_URL não configurado — estado das conversas em memória (perde no restart).');
    if (config.LOG_PAYLOAD)    lista.push('LOG_PAYLOAD ligado — payloads crus (com PII) irão para o log.');
    if (!config.IA_ALLOWED_CONTACTS.length) lista.push('IA_ALLOWED_CONTACTS vazio — a IA responde a QUALQUER número que chegar no webhook.');
    return lista;
}

module.exports = { validar, carregar, avisos };
