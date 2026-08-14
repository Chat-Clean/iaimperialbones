// =============================================================
//  DOMÍNIO — RESUMO DO LEAD QUALIFICADO
//  Texto estruturado entregue à equipe/CRM quando um lead é
//  transferido ao consultor. Puro: recebe dados, devolve string.
// =============================================================

const { CATALOGO_MODELOS } = require('../catalogo/Catalogo');

function montarResumo(leadData, chatId, opcoes = {}) {
    const nomeProduto = leadData.modeloEscolhido
        ? (CATALOGO_MODELOS[leadData.modeloEscolhido]?.nome || leadData.modeloEscolhido)
        : 'A definir';

    return (
        `🎯 LEAD QUALIFICADO — IA Imperial Bonés${opcoes.tagExtra ? ' [' + opcoes.tagExtra + ']' : ''}\n\n` +
        `Cliente: ${leadData.nome || 'Lead'} (${chatId})\n` +
        `Quantidade: ${leadData.quantidade || 'A definir'}\n` +
        `Finalidade: ${leadData.usoEvento || 'Não informado'}\n` +
        `Prazo: ${leadData.prazoRecebimento || 'Sem prazo específico'}\n` +
        `Produto: ${nomeProduto}\n` +
        `Arte/Logo: ${leadData.temArte === 'sim' ? 'Cliente tem' : leadData.temArte === 'enviou' ? 'Enviou arquivo' : 'Não tem'}\n` +
        `Técnica: ${leadData.tecnica || 'A definir'}\n` +
        `Regulador: ${leadData.tipoRegulador || 'Padrão'}\n` +
        `Cor: ${leadData.corPreferencia || 'A definir'}`
    );
}

module.exports = { montarResumo };
