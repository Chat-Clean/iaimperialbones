// =============================================================
//  DOMÍNIO — MENSAGEM RECEBIDA (objeto de fronteira do ACL)
//  Os nomes dos campos são os MESMOS que o fluxo legado usava, o que
//  permitiu trocar o parse sem tocar no processamento do turno.
// =============================================================

const TIPOS_SUPORTADOS = ['text', 'image', 'document', 'audio', 'ptt'];

function criar(campos) {
    if (!campos || !campos.chatId) throw new Error('MensagemRecebida requer chatId');
    return Object.freeze({
        aceita: true,
        chatId: campos.chatId,
        msgId: campos.msgId || null,
        texto: campos.texto || '',
        tipo: campos.tipo || 'text',
        mediaBase64: campos.mediaBase64 || null,
        mediaUrl: campos.mediaUrl || null,
        mediaMimetype: campos.mediaMimetype || null,
        quotedText: campos.quotedText || null,
        nomeContato: campos.nomeContato || ''
    });
}

function ehTipoSuportado(tipo) {
    return TIPOS_SUPORTADOS.includes(tipo);
}

module.exports = { criar, ehTipoSuportado, TIPOS_SUPORTADOS };
