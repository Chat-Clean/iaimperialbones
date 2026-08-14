// =============================================================
//  BOOTSTRAP — IA Imperial Bonés (ChatClean Webhook + Push API)
//  index.js só monta e liga: config validada (fail-fast), container
//  (adapters concretos), caso de uso do turno, servidor HTTP e o
//  varredor de follow-up. Toda a lógica vive em src/.
//
//    montar(config, deps)  → sistema (usado também por evals/testes)
//    iniciar(sistema)      → efeitos: listen, timers, sinais
// =============================================================
require('dotenv').config();

const configuracao = require('./src/main/config');
const container = require('./src/main/container');
const ProcessarMensagemRecebida = require('./src/application/casos-de-uso/ProcessarMensagemRecebida');
const Reativacao = require('./src/application/followup/Reativacao');
const servidorHttp = require('./src/infrastructure/http/servidor');

function montar(config, deps) {
    const atendimento = ProcessarMensagemRecebida.criar(deps, config);
    const reativacao = Reativacao.criar({
        repositorio: deps.repositorio,
        canal: deps.canal,
        estaProcessando: (chatId) => atendimento.estaProcessando(chatId)
    });
    const { app } = servidorHttp.criar({
        config,
        atendimento,
        repositorio: deps.repositorio,
        raiz: deps.raiz || container.RAIZ
    });
    return { config, deps, atendimento, reativacao, app };
}

function iniciar(sistema) {
    const { config, deps, atendimento, reativacao, app } = sistema;

    // Varredor de follow-up durável (sobrevive a redeploy: o estado está no repositório)
    const varredor = setInterval(() => reativacao.varrer(), Reativacao.FOLLOWUP_SWEEP);
    varredor.unref?.();

    const servidor = app.listen(config.PORT, () => {
        console.log('');
        console.log('🚀 ================================');
        console.log(`🤖 IA Imperial Bonés — CHATCLEAN MODE`);
        console.log(`📡 Servidor rodando na porta ${config.PORT}`);
        console.log(`🔗 Webhook URL: https://SEU_DOMINIO/webhook`);
        console.log(`❤️  Health:     https://SEU_DOMINIO/health`);
        console.log(`🧠 Núcleo:      ${config.AGENT_MODE ? 'AGENTE (tool-calling)' : 'fluxo legado (state machine)'}`);
        console.log('🚀 ================================');
        console.log('');

        for (const aviso of configuracao.avisos(config)) console.warn(`⚠️  ${aviso}`);
        console.log(deps.repositorio.ehDuravel()
            ? '🗄️  Estado das conversas: Redis (persistente)'
            : '🗄️  Estado das conversas: memória (defina REDIS_URL para persistir entre restarts)');
    });

    // -------------------------------------------------------------
    //  SHUTDOWN GRACIOSO
    //  Um `process.exit` imediato mata o turno em andamento ANTES do
    //  finally que persiste a conversa — o cliente perderia o contexto a
    //  cada redeploy. Aqui: para de aceitar novas conexões, deixa os
    //  turnos em voo terminarem (com teto) e só então encerra.
    // -------------------------------------------------------------
    const ESPERA_MAXIMA_MS = 25000;
    let encerrando = false;

    async function shutdown(signal) {
        if (encerrando) return;
        encerrando = true;
        console.log(`\n⚠️  Recebido sinal ${signal}. Encerrando com elegância...`);

        clearInterval(varredor);
        servidor.close(() => console.log('🔌 Servidor HTTP parou de aceitar conexões.'));

        const limite = Date.now() + ESPERA_MAXIMA_MS;
        while (atendimento.temTurnosEmAndamento() && Date.now() < limite) {
            await new Promise(r => setTimeout(r, 250));
        }
        if (atendimento.temTurnosEmAndamento()) {
            console.warn('⚠️  Encerrando com turnos ainda em andamento (tempo esgotado).');
        } else {
            console.log('✅ Todos os turnos em andamento foram concluídos e persistidos.');
        }
        process.exit(0);
    }
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2'));

    // Rede de segurança: um erro assíncrono sem dono não pode derrubar o
    // atendimento em silêncio — loga e segue (o turno já tem try/catch próprio).
    process.on('unhandledRejection', (motivo) => {
        console.error('❌ Promise rejeitada sem tratamento:', motivo instanceof Error ? motivo.message : motivo);
    });
    process.on('uncaughtException', (erro) => {
        console.error('❌ Exceção não capturada:', erro);
    });
}

if (require.main === module) {
    const config = configuracao.carregar();
    iniciar(montar(config, container.criar(config)));
}

module.exports = { montar, iniciar };
