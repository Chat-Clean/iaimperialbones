// =============================================================
//  SERVIDOR HTTP — casca fina sobre o caso de uso
//  Ordem no webhook: responde 200 imediatamente (o ChatClean espera
//  resposta rápida) → autenticação → ACL → allow-list → idempotência
//  → tipo suportado → processa em background.
// =============================================================

const express = require('express');
const path = require('path');
const tradutor = require('../chatclean/acl/tradutor');
const { MOTIVOS } = require('../../domain/mensageria/MotivoDeDescarte');
const MensagemRecebida = require('../../domain/mensageria/MensagemRecebida');
const { contatoPermitido } = require('../../shared/telefone');
const { criarAutenticacao, criarControleDeIdempotencia, criarGuardaAdministrativa, criarControleDeVazao } = require('./protecoes');
const { ETAPAS_FUNIL, ROTULO_ETAPA, estagioDoLead } = require('../../domain/atendimento/Funil');

function criar({ config, atendimento, repositorio, raiz }) {
    const app = express();
    app.use(express.json({ limit: '10mb' }));

    // Serve as imagens dos produtos como arquivos estáticos
    app.use('/assets', express.static(path.join(raiz, 'assets')));

    const auth = criarAutenticacao(config.WEBHOOK_SECRET);
    const idempotencia = criarControleDeIdempotencia();
    const admin = criarGuardaAdministrativa(config.ADMIN_KEY);
    const vazao = criarControleDeVazao({ limite: config.RATE_LIMIT_POR_CONTATO });

    app.post('/webhook', async (req, res) => {
        // Responder imediatamente (o ChatClean espera resposta rápida)
        res.status(200).json({ status: 'ok' });

        try {
            if (!auth.autenticar(req)) {
                console.warn('⚠️ Webhook com token inválido.');
                return;
            }

            if (config.LOG_PAYLOAD) {
                console.log('🔍 PAYLOAD RAW:', JSON.stringify(req.body, null, 2).slice(0, 4000));
            }

            const resultado = tradutor.traduzir(req.body);
            if (!resultado.aceita) {
                // Descartes nomeados: ECO é silencioso; o resto vira log específico.
                if (resultado.motivo === MOTIVOS.FORMATO_DUPLICADO) {
                    console.log('↩️ Ignorando disparo duplicado do ChatBot (formato numero_cliente) — fonte única é a API/Webhook');
                } else if (resultado.motivo === MOTIVOS.FORMATO_DESCONHECIDO) {
                    console.log('⚠️ Payload não reconhecido:', resultado.detalhe || '');
                } else if (resultado.motivo === MOTIVOS.SEM_TELEFONE) {
                    console.log('⚠️ Payload sem telefone utilizável — ignorado');
                }
                return;
            }
            const parsed = resultado;

            console.log(`📩 Webhook de ${parsed.chatId} [${parsed.tipo}]: "${parsed.texto || '[mídia]'}"`);

            // Fase de teste: só responde aos números da lista permitida (tolerante ao 9º dígito)
            if (!contatoPermitido(parsed.chatId, config.IA_ALLOWED_CONTACTS)) {
                console.log(`🚫 Contato ${parsed.chatId} fora da lista de teste — ignorado`);
                return;
            }

            // Dedup: o ChatClean pode reenviar o mesmo webhook
            if (idempotencia.jaProcessada(parsed.msgId)) {
                console.log(`↩️ Mensagem duplicada (${parsed.msgId}) ignorada`);
                return;
            }

            // Teto por contato: contém custo de OpenAI em caso de loop/abuso
            if (vazao.excedeu(parsed.chatId)) {
                console.warn(`🚦 Contato ${parsed.chatId} excedeu ${config.RATE_LIMIT_POR_CONTATO} msgs/min — turno ignorado`);
                return;
            }

            // Mídia não suportada (vídeo, sticker, localização...) → fallback humanizado
            if (!MensagemRecebida.ehTipoSuportado(parsed.tipo)) {
                await atendimento.responderTipoNaoSuportado(parsed.chatId);
                return;
            }

            // Guarda de concorrência: evita dois processamentos simultâneos do mesmo contato
            if (atendimento.estaProcessando(parsed.chatId)) {
                console.log(`⏳ Já processando ${parsed.chatId} — ignorando concorrente`);
                return;
            }

            setImmediate(() => atendimento.processarMensagem(parsed));

        } catch (e) {
            console.error('❌ Erro no handler do webhook:', e);
        }
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
    });

    app.get('/webhook', (req, res) => {
        res.status(200).json({ status: 'ok' });
    });

    // =========================================================
    //  ANALYTICS DE FUNIL (Fase 3) — quantos leads alcançaram
    //  cada etapa, onde os não-finalizados pararam e a conversão.
    // =========================================================
    app.get('/analytics', async (req, res) => {
        if (!admin.checar(req, res)) return; // fail-closed: exige ADMIN_KEY
        try {
            const ids = await repositorio.listarIds();
            const leads = [];
            for (const id of ids) {
                try { const l = await repositorio.buscarLead(id); if (l) leads.push(l); } catch (_) { /* pula lead ilegível */ }
            }

            const total = leads.length;
            const idx = (etapa) => ETAPAS_FUNIL.indexOf(etapa);
            const estagios = leads.map(estagioDoLead);

            // Quantos alcançaram cada etapa (cumulativo: etapa N conta quem chegou em N ou além)
            const funil = ETAPAS_FUNIL.map((etapa) => {
                const alcancaram = estagios.filter(e => idx(e) >= idx(etapa)).length;
                return {
                    etapa,
                    rotulo: ROTULO_ETAPA[etapa],
                    alcancaram,
                    taxa: total ? Math.round((alcancaram / total) * 100) + '%' : '0%'
                };
            });

            // Onde os leads NÃO finalizados estão parados
            const abandono = {};
            for (const e of estagios) {
                if (e === 'finalizado') continue;
                abandono[e] = (abandono[e] || 0) + 1;
            }

            const finalizados = estagios.filter(e => e === 'finalizado').length;
            const orcamentosConsultados = leads.filter(l => l.etapas && l.etapas.orcamento).length;

            res.json({
                total,
                finalizados,
                conversao: total ? Math.round((finalizados / total) * 100) + '%' : '0%',
                orcamentosConsultados,
                funil,
                abandonoPorEtapa: abandono,
                atualizadoEm: new Date().toISOString()
            });
        } catch (e) {
            console.error('❌ Erro no /analytics:', e.message);
            res.status(500).json({ erro: e.message });
        }
    });

    return { app };
}

module.exports = { criar };
