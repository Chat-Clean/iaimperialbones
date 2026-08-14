// =============================================================
//  DOMÍNIO — FUNIL DE QUALIFICAÇÃO
//  Etapas do funil, estágio alcançado por um lead e o próximo campo
//  a coletar no fluxo legado (state machine). Módulo PURO: sem I/O.
// =============================================================

const ORDEM_ETAPAS = ['contato', 'qualificando', 'modelo', 'tecnica', 'cor', 'orcamento', 'finalizado'];

// Etapas lineares do funil para o relatório de analytics (orçamento é medido à parte,
// pois pode ocorrer em pontos diferentes da conversa).
const ETAPAS_FUNIL = ['contato', 'qualificando', 'modelo', 'tecnica', 'cor', 'finalizado'];

const ROTULO_ETAPA = {
    contato: 'Contato iniciado', qualificando: 'Qualificando (qtd + finalidade)',
    modelo: 'Modelo escolhido', tecnica: 'Técnica definida',
    cor: 'Cor definida', finalizado: 'Transferido ao consultor'
};

// Modelos sem regulador (chapéu, viseira e bolsa)
const MODELOS_SEM_REGULADOR = ['IB_VIS', 'IB_BOLSA', 'IB_CHAP'];

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

// -------------------------------------------------------------
//  Próximo campo a coletar (fluxo legado / state machine).
//  ATENÇÃO (comportamento herdado): esta função tem DOIS efeitos
//  colaterais ao consultar — define tipoRegulador='Não se aplica'
//  para modelos sem regulador e marca qualificacaoCompleta=true ao
//  chegar no fim. Preservado de propósito (paridade com o legado).
// -------------------------------------------------------------
function determinarProximoCampo(leadData) {
    if (!leadData.nome) {
        return { campo: 'nome', pergunta: 'Qual seu nome?', tipo: 'texto' };
    }
    if (!leadData.tipoAtendimento) {
        return { campo: 'tipoAtendimento', pergunta: 'Como posso te ajudar hoje? Você está procurando produtos personalizados ou gostaria de tirar alguma dúvida?', tipo: 'texto' };
    }
    if (leadData.tipoAtendimento === 'duvida' && !leadData.querComprarAgora) {
        if (leadData.conversationHistory.length > 2) return null;
        return { campo: 'tipoAtendimento', pergunta: 'Para eu te ajudar melhor, você gostaria de fazer um pedido ou tirar alguma dúvida específica?', tipo: 'texto' };
    }

    // FLUXO ISAAC: quantidade → finalidade → prazo → logomarca → modelo → técnica → regulador → cor
    if (!leadData.quantidade) {
        return { campo: 'quantidade', pergunta: 'Quantas unidades você precisa?', tipo: 'numero' };
    }
    if (!leadData.usoEvento) {
        return { campo: 'usoEvento', pergunta: 'Qual seria a finalidade dos produtos? (uniforme, evento, brinde corporativo, coleção de marca, uso pessoal...)', tipo: 'texto' };
    }
    if (!leadData.prazoRecebimento) {
        return { campo: 'prazoRecebimento', pergunta: 'Você tem algum prazo específico para recebimento?', tipo: 'texto' };
    }
    if (!leadData.modeloEscolhido) {
        return { campo: 'modeloEscolhido', pergunta: 'Qual produto você mais gostou?', tipo: 'texto' };
    }
    if (!leadData.temArte) {
        return { campo: 'temArte', pergunta: 'Você já tem a logomarca ou arte que gostaria de colocar no produto?', tipo: 'texto' };
    }
    if (leadData.temArte === 'sim' && !leadData.quandoEnviaArte) {
        return { campo: 'quandoEnviaArte', pergunta: 'Perfeito! Você prefere me enviar a arte agora para analisarmos ou prefere enviar depois?', tipo: 'texto' };
    }
    if (leadData.temArte && leadData.temArte !== 'nao' && (leadData.quandoEnviaArte || leadData.temArte === 'enviou') && !leadData.tecnica) {
        return { campo: 'tecnica', pergunta: 'Para eu te ajudar a escolher a melhor técnica de personalização para sua arte, vou te mostrar as opções que trabalhamos.', tipo: 'texto' };
    }

    // Regulador apenas para bonés (não para chapéu, viseira e bolsa)
    if (!leadData.tipoRegulador && leadData.modeloEscolhido) {
        if (MODELOS_SEM_REGULADOR.includes(leadData.modeloEscolhido)) {
            leadData.tipoRegulador = 'Não se aplica';
        } else {
            return { campo: 'tipoRegulador', pergunta: 'Sobre o regulador do seu produto, temos 3 opções. Vou te enviar as fotos para você escolher!', tipo: 'texto' };
        }
    }

    if (!leadData.corPreferencia) {
        return { campo: 'corPreferencia', pergunta: 'Você já tem alguma cor de preferência?', tipo: 'texto' };
    }

    leadData.qualificacaoCompleta = true;
    return null;
}

module.exports = { ORDEM_ETAPAS, ETAPAS_FUNIL, ROTULO_ETAPA, MODELOS_SEM_REGULADOR, marcarEtapa, estagioDoLead, determinarProximoCampo };
