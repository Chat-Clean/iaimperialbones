// =============================================================
//  ADAPTER — ChatClean Push API (canal de mensagem + notificador)
//  Um único endpoint autenticado (CC_PUSH_URL) entrega texto e mídia.
//  O token JWT já vem embutido na URL como ?token=... (sem header).
//  Nunca lança: loga e devolve false.
// =============================================================

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const { normalizarPhone } = require('../../shared/telefone');
const { montarResumo } = require('../../domain/atendimento/MontadorDeResumo');

function criar({ pushUrl, baseUrl, equipeNumero, raiz }) {
    async function ccPush(number, payloadExtra = {}) {
        if (!pushUrl) { console.warn('⚠️ CC_PUSH_URL não configurado no .env — envio ignorado'); return false; }
        try {
            await axios.post(pushUrl, {
                number: normalizarPhone(number),
                externalKey: crypto.randomUUID(),
                ...payloadExtra
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
            return true;
        } catch (e) {
            console.error('❌ Erro no Push ChatClean:', e.response?.data || e.message);
            return false;
        }
    }

    function buildPublicUrl(filePath) {
        if (!baseUrl) return null;
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(raiz, filePath);
        const relativePath = path.relative(raiz, absPath).replace(/\\/g, '/');
        return `${baseUrl.replace(/\/$/, '')}/${relativePath}`;
    }

    async function enviarMensagem(chatId, texto) {
        if (!texto || !String(texto).trim()) return false;
        return ccPush(chatId, { body: texto });
    }

    async function enviarMensagensQuebradas(chatId, textoCompleto) {
        if (textoCompleto.includes('resumo') || textoCompleto.includes('Produto:') || textoCompleto.includes('encaminhando')) {
            await enviarMensagem(chatId, textoCompleto);
            return;
        }
        const partes = textoCompleto.split('\n').filter(p => p.trim());
        for (const parte of partes) {
            await new Promise(resolve => setTimeout(resolve, 1000 + parte.length * 20));
            await enviarMensagem(chatId, parte);
        }
    }

    async function enviarImagens(chatId, arquivos, legenda = '') {
        try {
            for (const arquivo of arquivos) {
                const url = buildPublicUrl(arquivo);
                if (!url) { console.warn('⚠️ BASE_URL não configurado — imagem ignorada'); continue; }
                const absPath = path.isAbsolute(arquivo) ? arquivo : path.join(raiz, arquivo);
                if (!fs.existsSync(absPath)) { console.log(`⚠️ Imagem não encontrada: ${absPath}`); continue; }

                console.log(`📤 Enviando imagem para ${chatId}: ${arquivo}`);
                await ccPush(chatId, { body: legenda || '', mediaUrl: url });
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            return true;
        } catch (e) {
            console.error('❌ Erro ao enviar imagens:', e.message);
            return false;
        }
    }

    // Notifica a equipe (nota interna no ticket + WhatsApp interno, se configurado)
    // quando um lead é qualificado.
    async function notificarEquipe(leadData, chatId, opcoes = {}) {
        const resumo = montarResumo(leadData, chatId, opcoes);

        // Registra o resumo como nota interna no ticket do próprio cliente (fica no CRM p/ o atendente)
        await ccPush(chatId, { body: resumo, onlyNote: true, note: { body: resumo } });

        // Se houver número da equipe, envia o resumo também por WhatsApp interno
        if (equipeNumero) await ccPush(equipeNumero, { body: resumo });

        console.log(`✅ Equipe notificada — lead ${leadData.nome || ''} (${chatId})`);
        return true;
    }

    return { ccPush, buildPublicUrl, enviarMensagem, enviarMensagensQuebradas, enviarImagens, notificarEquipe };
}

module.exports = { criar };
