// =============================================================
//  DOMÍNIO — MOTIVO DE DESCARTE
//  Todo payload não processado tem um motivo NOMEADO (antes, tudo
//  colapsava num null indistinguível — impossível medir por que um
//  lead não foi atendido).
// =============================================================

const MOTIVOS = {
    ECO: 'ECO',                                   // fromMe: mensagem do próprio bot/atendente
    SEM_TELEFONE: 'SEM_TELEFONE',                 // payload sem número utilizável
    FORMATO_DUPLICADO: 'FORMATO_DUPLICADO',       // disparo duplicado do ChatBot (numero_cliente)
    FORMATO_DESCONHECIDO: 'FORMATO_DESCONHECIDO'  // nenhum formato conhecido casou
};

const DESCRICOES = {
    ECO: 'mensagem enviada pelo próprio atendente/bot',
    SEM_TELEFONE: 'payload sem telefone utilizável',
    FORMATO_DUPLICADO: 'disparo duplicado do ChatBot (formato numero_cliente) — fonte única é a API/Webhook',
    FORMATO_DESCONHECIDO: 'payload não reconhecido'
};

function descartar(motivo, detalhe = null) {
    return Object.freeze({
        aceita: false,
        motivo,
        detalhe,
        descricao: DESCRICOES[motivo] || motivo
    });
}

module.exports = { MOTIVOS, DESCRICOES, descartar };
