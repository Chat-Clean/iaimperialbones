// =============================================================
//  IO MOCKADO PARA EVALS
//  Substitui os efeitos colaterais (WhatsApp, equipe, mockup) por
//  gravadores. O agente roda de verdade (API OpenAI real), mas nada
//  é enviado para fora. Usa os helpers de catálogo REAIS (produção).
// =============================================================
const { recomendarModelos, cartelasDoLead } = require('../catalogo-helpers');

function criarIoMock() {
    const log = {
        mensagens: [],   // textos enviados ao cliente
        imagens: [],     // { arquivos, legenda }
        notificacoes: [],// resumos enviados à equipe
        mockups: 0
    };

    const io = {
        recomendarModelos,
        cartelasDoLead,
        async enviarMensagem(_chatId, texto) { if (texto) log.mensagens.push(String(texto)); return true; },
        async enviarImagens(_chatId, arquivos, legenda = '') { log.imagens.push({ arquivos, legenda }); return true; },
        async notificarEquipe(leadData, chatId, opcoes = {}) { log.notificacoes.push({ chatId, opcoes, nome: leadData.nome }); return true; },
        // Mockup não chama gpt-image-1 nos evals: só marca que foi solicitado.
        async gerarMockup(_chatId, leadData) { log.mockups++; return !!(leadData.logoUrl && leadData.modeloEscolhido); }
    };

    return { io, log };
}

module.exports = { criarIoMock };
