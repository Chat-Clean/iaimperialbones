// =============================================================
//  ACL — TRADUTOR DE PAYLOAD DO CHATCLEAN
//  Único lugar que sabe como o ChatClean fala. Devolve OU uma
//  MensagemRecebida (aceita: true) OU um MotivoDeDescarte
//  (aceita: false) — nunca um null indistinguível.
//
//  O formato é do ChatClean, não nosso, e varia por canal: por isso
//  o tradutor é TOLERANTE (classifica e traduz o que reconhecer) em
//  vez de validar com esquema rígido — rejeitar um formato novo
//  deixaria leads sem atendimento.
// =============================================================

const MensagemRecebida = require('../../../domain/mensageria/MensagemRecebida');
const { MOTIVOS, descartar } = require('../../../domain/mensageria/MotivoDeDescarte');
const { normalizarPhone } = require('../../../shared/telefone');

// Normaliza o tipo de mensagem para os valores que o fluxo entende
function normalizarTipo(t) {
    const v = String(t || 'text').toLowerCase();
    if (['image', 'audio', 'ptt', 'document', 'text'].includes(v)) return v;
    if (v === 'chat' || v === '') return 'text';
    return v; // sticker/video/location etc. → tratado adiante como não suportado
}

function traduzir(body) {
    try {
        // --- Formato ChatClean (documentado): contact + message aninhados ---
        //   { contact:{number,name}, message:{body,type,fromMe,id,quotedMsg:{body},mediaUrl} }
        if (body?.contact || (body?.message && typeof body.message === 'object' && !body.message.add)) {
            const contato = body.contact || {};
            const msg     = body.message || {};
            if (msg.fromMe) return descartar(MOTIVOS.ECO); // mensagens enviadas pelo atendente/bot
            // Formato real ChatClean: sem contact.number no topo — o telefone vem em
            // message.raw.Info.SenderAlt (ex.: "558494610845@s.whatsapp.net"). NUNCA usar
            // Chat/Sender (formato "@lid", que não é telefone).
            const senderAlt = msg.raw?.Info?.SenderAlt ? String(msg.raw.Info.SenderAlt).split('@')[0] : null;
            const numero = contato.number || contato.phone || body.number || senderAlt || msg.number;
            const phone  = normalizarPhone(numero);
            if (!phone) return descartar(MOTIVOS.SEM_TELEFONE);
            return MensagemRecebida.criar({
                chatId:        phone,
                msgId:         msg.id ? String(msg.id) : (msg.messageId ? String(msg.messageId) : null),
                texto:         String(msg.body || msg.text || '').trim(),
                tipo:          normalizarTipo(msg.type || msg.mediaType),
                mediaBase64:   msg.mediaBase64 || msg.base64 || null,
                mediaUrl:      msg.mediaUrl || null,
                mediaMimetype: msg.mimetype || msg.raw?.Message?.imageMessage?.mimetype || null,
                quotedText:    msg.quotedMsg?.body || msg.quotedMsg?.text || null,
                nomeContato:   contato.name || msg.raw?.Info?.PushName || body.contactName || ''
            });
        }

        // --- Formato plano (webhook/n8n simples) ---
        //   { number, type, body, contactName, id }
        if (body?.number && (body?.body !== undefined || body?.type)) {
            if (body.fromMe) return descartar(MOTIVOS.ECO);
            const phone = normalizarPhone(body.number);
            if (!phone) return descartar(MOTIVOS.SEM_TELEFONE);
            return MensagemRecebida.criar({
                chatId:        phone,
                msgId:         body.id ? String(body.id) : null,
                texto:         String(body.body || '').trim(),
                tipo:          normalizarTipo(body.type),
                mediaBase64:   body.mediaBase64 || body.base64 || null,
                mediaUrl:      body.mediaUrl || null,
                mediaMimetype: body.mimetype || null,
                quotedText:    body.quotedText || null,
                nomeContato:   body.contactName || body.name || ''
            });
        }

        // --- Formato numero_cliente/url_envio (ChatBot "Requisição de API") ---
        // IGNORADO de propósito: a Imperial usa a API/Webhook (formato `message`) como
        // fonte ÚNICA. Este formato é o disparo duplicado do ChatBot (node de API) e
        // chega SEM `fromMe`/`mediaType`, tratando a URL da mídia como texto. Aceitá-lo
        // duplicaria cada mensagem.
        if (body?.numero_cliente && body?.mensagem_cliente !== undefined) {
            return descartar(MOTIVOS.FORMATO_DUPLICADO);
        }

        return descartar(MOTIVOS.FORMATO_DESCONHECIDO, JSON.stringify(body || {}).slice(0, 800));
    } catch (e) {
        // Nada aqui deveria lançar; se lançar, é defeito nosso e não pode derrubar o webhook.
        return descartar(MOTIVOS.FORMATO_DESCONHECIDO, `erro no parse: ${e.message}`);
    }
}

module.exports = { traduzir, normalizarTipo };
