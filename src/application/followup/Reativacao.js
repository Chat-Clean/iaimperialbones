// =============================================================
//  FOLLOW-UP DE REATIVAÇÃO (durável)
//  Em vez de setTimeout em memória (morre no redeploy), o timestamp
//  leadData.followUpDueAt é persistido junto da conversa e um varredor
//  periódico dispara os vencidos. A mensagem é escolhida pelo ponto
//  do funil em que o lead parou.
// =============================================================

const { determinarProximoCampo } = require('../../domain/atendimento/Funil');

const FOLLOWUP_SWEEP = 2 * 60 * 1000;    // varre os follow-ups vencidos a cada 2 min

function criar({ repositorio, canal, estaProcessando }) {
    // Monta a mensagem de reativação conforme o ponto do funil em que o lead parou.
    function montarMsgReativacao(leadData) {
        const proximo = determinarProximoCampo(leadData);
        if (!proximo) return null;
        const nome = leadData.nome?.split(' ')[0] || 'amigo(a)';
        if (proximo.campo === 'tipoAtendimento') {
            return `Oi ${nome}, ainda está por aí? Me conta como posso te ajudar com seus produtos personalizados! 😊`;
        }
        if (proximo.campo === 'modeloEscolhido' || proximo.campo === 'usoEvento') {
            return `Oi ${nome}! Conseguiu dar uma olhadinha nos produtos que te enviei? Se tiver qualquer dúvida, é só falar! 🧢`;
        }
        if (proximo.campo === 'temArte') {
            return `Oi ${nome}, estou aguardando sua arte para darmos continuidade ao orçamento. Assim que puder, me envia por aqui! ✨`;
        }
        return `Oi ${nome}! Passando para saber se ficou alguma dúvida sobre o que conversamos. Estou à disposição para finalizarmos seu pedido! 😊`;
    }

    // Dispara a reativação de UM lead (chamado pelo varredor). Limpa o followUpDueAt ANTES de
    // enviar para não duplicar caso duas varreduras se cruzem.
    async function disparar(chatId, leadData) {
        const msg = montarMsgReativacao(leadData);
        leadData.followUpDueAt = null;
        if (!msg || leadData.followUpUltimo === msg) {
            try { await repositorio.salvarLead(chatId, leadData); } catch (_) {}
            return;
        }
        leadData.followUpUltimo = msg;
        try { await repositorio.salvarLead(chatId, leadData); } catch (_) {}
        await canal.enviarMensagem(chatId, msg);
        console.log(`📩 Follow-up de reativação enviado para ${chatId}`);
    }

    // Varredor: percorre os leads e dispara os follow-ups vencidos. Pula os que estão
    // sendo processados agora (evita corrida com uma mensagem em andamento).
    async function varrer() {
        try {
            const ids = await repositorio.listarIds();
            const agora = Date.now();
            for (const chatId of ids) {
                if (estaProcessando(chatId)) continue;
                let leadData;
                try { leadData = await repositorio.buscarLead(chatId); } catch (_) { continue; }
                if (!leadData || leadData.finalizado) continue;
                if (!leadData.followUpDueAt || leadData.followUpDueAt > agora) continue;
                await disparar(chatId, leadData);
            }
        } catch (e) {
            console.error('Erro no varredor de follow-up:', e.message);
        }
    }

    return { montarMsgReativacao, disparar, varrer };
}

module.exports = { criar, FOLLOWUP_SWEEP };
