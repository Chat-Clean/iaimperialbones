// =============================================================
//  CASO DE USO — PROCESSAR MENSAGEM RECEBIDA
//  Orquestra um turno completo da conversa: lock por contato, mídia
//  (visão/transcrição), modo agente (tool-calling) OU fluxo legado
//  (state machine), guards de negócio e persistência do estado.
//
//  Toda a lógica foi portada do index.js legado SEM mudança de
//  comportamento — os efeitos colaterais entram pelas portas (deps).
// =============================================================

const {
    CATALOGO_MODELOS,
    OPCOES_TECNICAS,
    OPCOES_REGULADORES
} = require('../../domain/catalogo/Catalogo');
const { recomendarModelos, cartelasDoLead } = require('../../domain/catalogo/Recomendacao');
const { determinarProximoCampo, MODELOS_SEM_REGULADOR } = require('../../domain/atendimento/Funil');
const orcamento = require('../../domain/orcamento/MotorDeOrcamento');
const { obterDataHoraBrasilia } = require('../../shared/relogio');

// Mensagem enviada quando o turno falha de forma inesperada (IA fora do ar,
// cota estourada, timeout). Nunca deixar o cliente no vácuo.
const FALA_DE_INSTABILIDADE = 'Opa, tive uma instabilidade aqui do meu lado 😅 Pode mandar sua mensagem de novo? Se preferir, um consultor da nossa equipe já te chama.';

// Teto do histórico guardado por conversa (protege o payload no Redis e o custo de tokens)
const LIMITE_HISTORICO = 100;

function buscarPorKeywords(texto) {
    const textoLower = texto.toLowerCase();
    for (const [codigo, modelo] of Object.entries(CATALOGO_MODELOS)) {
        if (modelo.keywords?.some(kw => textoLower.includes(kw.toLowerCase()))) {
            return { tipo: 'modelo', codigo, item: modelo };
        }
    }
    for (const [key, tecnica] of Object.entries(OPCOES_TECNICAS)) {
        if (tecnica.keywords?.some(kw => textoLower.includes(kw.toLowerCase()))) {
            return { tipo: 'tecnica', codigo: key, item: tecnica };
        }
    }
    return null;
}

/**
 * @param {import('../portas').Dependencias} deps
 * @param {{AGENT_MODE: boolean}} config
 */
function criar(deps, config) {
    const { canal, notificador, repositorio, extrator, redator, leitorDeImagem, transcritor, mockup, baixadorDeMidia, agente } = deps;
    const processandoMensagem = new Map();  // lock de processamento (transitório, por instância)

    function estaProcessando(chatId) {
        return processandoMensagem.has(chatId);
    }

    // Usado pelo shutdown gracioso: espera os turnos em voo terminarem
    // (é no finally deles que a conversa é persistida).
    function temTurnosEmAndamento() {
        return processandoMensagem.size > 0;
    }

    // Agenda (ou reagenda) a reativação: só marca o timestamp no leadData.
    // O varredor (Reativacao) cuida de disparar.
    const TEMPO_INATIVIDADE = 30 * 60 * 1000;   // 30 min sem resposta → reativação
    function agendarFollowUpReativacao(leadData) {
        if (leadData.finalizado) { leadData.followUpDueAt = null; return; }
        leadData.followUpDueAt = Date.now() + TEMPO_INATIVIDADE;
    }

    // ---------------------------------------------------------
    //  Envio de fotos do fluxo legado (catálogo/técnicas/reguladores/cores)
    // ---------------------------------------------------------
    async function processarPedidoImagens(chatId, extraido, leadData, proximoCampoDepois) {
        let imagensEnviadas = false;

        if (extraido.modeloEscolhido || leadData.modeloEscolhido) {
            extraido.querVerModelos = false;
        }

        // Ver TODOS os produtos
        if (extraido.querVerTodosModelos) {
            await canal.enviarMensagem(chatId, 'Claro! Vou te enviar todos os nossos produtos para você conhecer melhor! 🧢');
            const arquivos = Object.values(CATALOGO_MODELOS).map(m => m.arquivo);
            await canal.enviarImagens(chatId, arquivos.slice(0, 3), '');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await canal.enviarImagens(chatId, arquivos.slice(3), '');
            imagensEnviadas = true;
            await canal.enviarMensagem(chatId, 'Essas são nossas opções! Qual desses produtos você prefere? 😊');
            extraido.perguntaEspecificaEnviada = true;
        }
        // Ver MAIS produtos
        else if (extraido.querVerMaisModelos) {
            const jaEnviados = leadData.modelosEnviados || [];
            const restantes = Object.keys(CATALOGO_MODELOS).filter(c => !jaEnviados.includes(c));
            if (restantes.length > 0) {
                const maisTres = restantes.slice(0, 3);
                leadData.modelosEnviados = [...jaEnviados, ...maisTres];
                await canal.enviarMensagem(chatId, 'Aqui estão mais opções:');
                await new Promise(resolve => setTimeout(resolve, 1500));
                for (const codigo of maisTres) {
                    const modelo = CATALOGO_MODELOS[codigo];
                    if (modelo) {
                        const legenda = `🧢 *${modelo.nome}* (${modelo.codigo})\n\n${modelo.descricao}\n\n💰 ${modelo.precoReferencia}`;
                        await canal.enviarImagens(chatId, [modelo.arquivo], legenda);
                        await new Promise(resolve => setTimeout(resolve, 1200));
                    }
                }
                imagensEnviadas = true;
                await canal.enviarMensagem(chatId, 'Qual desses você prefere? 😊');
                extraido.perguntaEspecificaEnviada = true;
            } else {
                await canal.enviarMensagem(chatId, 'Já te mostrei todos os nossos produtos! Algum te interessou? 😊');
                extraido.perguntaEspecificaEnviada = true;
            }
        }
        // Recomendação inteligente
        else if (extraido.querVerModelos && !leadData.modeloEscolhido) {
            const recomendacoes = recomendarModelos(leadData);
            if (recomendacoes.length > 0) {
                leadData.modelosEnviados = recomendacoes;
                await canal.enviarMensagem(chatId, 'Perfeito! Vou te mostrar os produtos ideais para o que você precisa! 🧢✨');
                await new Promise(resolve => setTimeout(resolve, 1500));
                for (const codigo of recomendacoes) {
                    const modelo = CATALOGO_MODELOS[codigo];
                    if (modelo) {
                        const legenda = `🧢 *${modelo.nome}* (${modelo.codigo})\n\n${modelo.descricao}\n\n💰 ${modelo.precoReferencia}`;
                        await canal.enviarImagens(chatId, [modelo.arquivo], legenda);
                        await new Promise(resolve => setTimeout(resolve, 1200));
                    }
                }
                imagensEnviadas = true;
                await canal.enviarMensagem(chatId, 'Qual desses produtos você prefere? 😊');
                extraido.perguntaEspecificaEnviada = true;
            }
        }

        // Produto específico por keyword
        if (extraido.modeloEspecifico) {
            const codigo = extraido.modeloEspecifico.toUpperCase();
            const modelo = CATALOGO_MODELOS[codigo];
            if (modelo) {
                const legenda = `🧢 *${modelo.nome}* (${modelo.codigo})\n\n${modelo.descricao}\n\n💰 ${modelo.precoReferencia}`;
                await canal.enviarImagens(chatId, [modelo.arquivo], legenda);
                imagensEnviadas = true;
                await canal.enviarMensagem(chatId, `O que achou do ${modelo.nome}? Se quiser ver mais ou outro produto, é só falar! 😊`);
                extraido.perguntaEspecificaEnviada = true;
            }
        }

        // Técnicas de personalização
        const modelosEstaoSendoEnviados = extraido.querVerModelos || extraido.querVerMaisModelos || extraido.querVerTodosModelos;
        const tecnicaEscolhidaAgora = extraido.tecnica !== null && extraido.tecnica !== undefined;

        if ((extraido.querVerTecnicas || proximoCampoDepois?.campo === 'tecnica') && !leadData.tecnica && !modelosEstaoSendoEnviados && !tecnicaEscolhidaAgora) {
            if (!extraido.querVerTecnicas) await new Promise(resolve => setTimeout(resolve, 1000));

            const tecnicaKeys = Object.keys(OPCOES_TECNICAS);
            for (const key of tecnicaKeys) {
                const tecnica = OPCOES_TECNICAS[key];
                const legenda = `*${tecnica.nome}*\n\n${tecnica.descricao}`;
                await canal.enviarImagens(chatId, tecnica.arquivos, legenda);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            imagensEnviadas = true;
            await canal.enviarMensagem(chatId, 'Qual dessas técnicas você prefere para sua arte? 😊');
            extraido.perguntaEspecificaEnviada = true;
        }

        // Reguladores
        const reguladorEscolhidoAgora = extraido.tipoRegulador !== null && extraido.tipoRegulador !== undefined;

        if (extraido.querVerRegulador && !MODELOS_SEM_REGULADOR.includes(leadData.modeloEscolhido) && !leadData.tipoRegulador && !reguladorEscolhidoAgora) {
            for (const [, reg] of Object.entries(OPCOES_REGULADORES)) {
                const legenda = `*${reg.nome}*\n💰 Adicional: ${reg.adicional}`;
                await canal.enviarImagens(chatId, [reg.arquivo], legenda);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            imagensEnviadas = true;
            await canal.enviarMensagem(chatId, 'Pode escolher qual regulador prefere! 😊');
            extraido.perguntaEspecificaEnviada = true;
        }

        // Cartela de cores — dispara ao chegar no passo da cor (uma vez) OU quando o cliente pede
        const pediuCores = !!extraido.querVerCores;
        const chegouNaCor = proximoCampoDepois?.campo === 'corPreferencia';
        if ((pediuCores || (chegouNaCor && !leadData.coresEnviadas)) && !leadData.corPreferencia) {
            const cartelas = cartelasDoLead(leadData);
            for (const c of cartelas) {
                await canal.enviarImagens(chatId, [c.arquivo], `Cartela de cores — ${c.nome}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            leadData.coresEnviadas = true;
            imagensEnviadas = true;
            const nota = cartelas.length > 1 ? 'Essas são as cores disponíveis pra esse modelo. ' : 'Essas são as cores disponíveis. ';
            await canal.enviarMensagem(chatId, `${nota}Qual você prefere? 😊`);
            extraido.perguntaEspecificaEnviada = true;
        }

        return imagensEnviadas;
    }

    // ---------------------------------------------------------
    //  TURNO COMPLETO
    // ---------------------------------------------------------
    async function processarMensagem({ chatId, texto, tipo, mediaBase64, mediaUrl, mediaMimetype, quotedText, nomeContato }) {
        if (processandoMensagem.get(chatId)) {
            console.log(`⚠️ Já processando mensagem de ${chatId}. Ignorando.`);
            return;
        }
        processandoMensagem.set(chatId, true);

        const timeoutId = setTimeout(() => {
            if (processandoMensagem.get(chatId)) {
                console.log(`⏱️ Timeout: Liberando processamento para ${chatId}`);
                processandoMensagem.delete(chatId);
            }
        }, 60000);

        let leadData = null;
        try {
            // Carrega o estado da conversa do repositório (Redis ou memória)
            leadData = await repositorio.buscarLead(chatId);
            if (!leadData) leadData = { conversationHistory: [] };
            // Captura o nome do contato vindo do ChatClean (se ainda não temos)
            if (nomeContato && !leadData.nome) leadData.nome = nomeContato;

            // Nova mensagem do cliente cancela qualquer reativação pendente (é reagendada no fim).
            leadData.followUpDueAt = null;

            // Reset
            if (texto.toLowerCase() === '/reset') {
                await repositorio.removerLead(chatId);
                leadData = null; // impede que o finally regrave o lead recém-apagado
                await canal.enviarMensagem(chatId, '🔄 Conversa resetada! Vamos começar de novo. 😊');
                return;
            }

            // No modo agente, mensagens de clientes com pedido finalizado também passam pelo
            // agente (que reconhece o cliente e reabre um novo pedido se ele quiser — Fase 4).
            if (!config.AGENT_MODE && leadData.finalizado) {
                // Pedido já encaminhado: ainda respondemos dúvidas pontuais de forma natural,
                // sem repetir o resumo nem refazer o funil.
                const histPos = leadData.conversationHistory.slice(-30).map(h => ({
                    role: h.role === 'user' ? 'user' : 'assistant', content: h.content
                }));
                const respPos = await redator.redigirPosPedido(leadData, texto, histPos);
                await canal.enviarMensagensQuebradas(chatId, respPos);
                leadData.conversationHistory.push({ role: 'user', content: texto });
                leadData.conversationHistory.push({ role: 'assistant', content: respPos });
                return;
            }

            // Imagem/documento — a IA "enxerga" a imagem (visão) e usa como contexto
            if (tipo === 'image' || tipo === 'document') {
                const descImg = await leitorDeImagem.descrever(mediaUrl, leadData);
                if (descImg) {
                    leadData.analiseImagem = descImg;
                    console.log(`🖼️ Visão: ${descImg}`);
                }
                if (mediaUrl) leadData.logoUrl = mediaUrl; // guarda a logo/arte para gerar o mockup depois
                // Registra o envio no histórico para dar contexto às próximas respostas
                leadData.conversationHistory.push({ role: 'user', content: `[O cliente enviou uma imagem]${descImg ? ' — ' + descImg : ''}` });

                // Já escolheu o produto e ainda não a técnica: trata como arte, reconhece de forma
                // contextual (referenciando o que viu) e leva para a escolha da técnica.
                // (No modo agente o próprio agente conduz isso — não fazemos o curto-circuito legado.)
                if (!config.AGENT_MODE && leadData.modeloEscolhido && (!leadData.temArte || leadData.temArte === 'sim') && !leadData.tecnica) {
                    leadData.temArte = 'enviou';
                    const histAck = leadData.conversationHistory.slice(-30).map(h => ({
                        role: h.role === 'user' ? 'user' : 'assistant', content: h.content
                    }));
                    const ack = await redator.redigirAckImagem(leadData, descImg, histAck);
                    await canal.enviarMensagensQuebradas(chatId, ack);
                    leadData.conversationHistory.push({ role: 'assistant', content: ack });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    await processarPedidoImagens(chatId, { querVerTecnicas: true }, leadData, { campo: 'tecnica' });
                    return;
                }
                // Caso contrário, segue o fluxo normal. Texto neutro (não polui a extração);
                // o conteúdo real da imagem vai como contexto em leadData.analiseImagem.
                texto = 'Enviei uma imagem.';
            }

            // Transcrição de áudio
            if (tipo === 'audio' || tipo === 'ptt') {
                // ChatClean entrega o áudio como URL (mediaUrl); alguns formatos mandam base64.
                let audioBuffer = null;
                try {
                    if (mediaBase64) {
                        audioBuffer = Buffer.from(mediaBase64, 'base64');
                    } else if (mediaUrl) {
                        console.log('⬇️ Baixando áudio da mediaUrl...');
                        audioBuffer = await baixadorDeMidia.baixar(mediaUrl);
                    }
                } catch (e) {
                    console.error('❌ Erro ao baixar áudio:', e.message);
                }

                if (audioBuffer) {
                    try {
                        console.log('🎙️ Áudio recebido, iniciando transcrição...');
                        texto = await transcritor.transcrever({ buffer: audioBuffer, mimetype: mediaMimetype });
                        console.log(`📝 Transcrição: "${texto}"`);
                    } catch (e) {
                        console.error('❌ Erro ao transcrever áudio:', e.message);
                        await canal.enviarMensagem(chatId, 'Desculpe, não consegui entender seu áudio. Pode digitar, por favor? ✨');
                        return;
                    }
                } else {
                    await canal.enviarMensagem(chatId, 'Desculpe, não consegui processar seu áudio. Pode digitar, por favor? ✨');
                    return;
                }
            }

            if (quotedText) {
                console.log(`💬 Mensagem citada: "${quotedText}"`);
                texto = `[RESPOSTA À MENSAGEM: "${quotedText}"]\n${texto}`;
            }

            // ---------------------------------------------------------
            //  MODO AGENTE (Fase 3) — tool-calling. A IA conduz e decide
            //  quando chamar preço, fotos, mockup e transferência.
            //  O fluxo legado abaixo (state machine) fica intacto para AGENT_MODE=false.
            // ---------------------------------------------------------
            if (config.AGENT_MODE) {
                const io = {
                    enviarImagens: canal.enviarImagens,
                    enviarMensagem: canal.enviarMensagem,
                    notificarEquipe: notificador.notificarEquipe,
                    gerarMockup: mockup.gerar,
                    recomendarModelos,
                    cartelasDoLead,
                    registrarPedidoCliente: (id, dados) => repositorio.registrarPedidoCliente(id, dados)
                };
                // Memória de cliente (Fase 4): reconhece quem já comprou
                let historicoCliente = null;
                try { historicoCliente = await repositorio.buscarCliente(chatId); } catch (_) {}
                const contexto = { analiseImagem: leadData.analiseImagem, historico: historicoCliente };
                leadData.analiseImagem = null; // já consumido nesta mensagem

                const { resposta } = await agente.rodarAgente({
                    leadData, mensagemCliente: texto, io, chatId, contexto
                });

                leadData.conversationHistory.push({ role: 'user', content: texto });
                if (resposta) {
                    leadData.conversationHistory.push({ role: 'assistant', content: resposta });
                    await canal.enviarMensagensQuebradas(chatId, resposta);
                }
                if (leadData.conversationHistory.length > 100) {
                    leadData.conversationHistory = leadData.conversationHistory.slice(-100);
                }
                // Follow-up de reativação (o agente já cuidou de finalizar/transferir quando foi o caso)
                if (!leadData.finalizado) agendarFollowUpReativacao(leadData);
                return;
            }

            // ---------------------------------------------------------
            //  FLUXO LEGADO (state machine)
            // ---------------------------------------------------------
            const proximoCampoAntes = determinarProximoCampo(leadData);
            const historicoExtracao = leadData.conversationHistory.slice(-4).map(h => ({
                role: h.role === 'user' ? 'user' : 'assistant',
                content: h.content
            }));

            const modelosEnviados = leadData.modelosEnviados || [];
            let extraido = await extrator.extrair(texto, proximoCampoAntes?.campo, historicoExtracao, modelosEnviados);

            // Debug regulador
            if (proximoCampoAntes?.campo === 'tipoRegulador') {
                console.log(`🔧 DEBUG REGULADOR - Texto: "${texto}"`);
                if (!extraido?.tipoRegulador) {
                    const tl = texto.toLowerCase();
                    if (tl.includes('primeiro') || tl.includes('padrão') || tl.includes('padrao') || tl.includes('plástico') || tl.includes('plastico')) {
                        if (!extraido) extraido = {};
                        extraido.tipoRegulador = 'padrao';
                    } else if (tl.includes('segundo') || tl.includes('do meio') || (tl.includes('metal') && !tl.includes('terceiro'))) {
                        if (!extraido) extraido = {};
                        extraido.tipoRegulador = 'metal1';
                    } else if (tl.includes('terceiro') || tl.includes('último') || tl.includes('ultimo')) {
                        if (!extraido) extraido = {};
                        extraido.tipoRegulador = 'metal2';
                    }
                }
            }

            // Debug técnica
            if (proximoCampoAntes?.campo === 'tecnica') {
                console.log(`🎨 DEBUG TÉCNICA - Texto: "${texto}"`);
                if (!extraido?.tecnica) {
                    const tl = texto.toLowerCase();
                    if (tl.includes('primeiro') || tl.includes('silk') || tl.includes('3d') || tl.includes('emborrachado')) {
                        if (!extraido) extraido = {};
                        extraido.tecnica = 'silk3d';
                    } else if (tl.includes('segundo') || tl.includes('bordado')) {
                        if (!extraido) extraido = {};
                        extraido.tecnica = 'bordado3d';
                    } else if (tl.includes('terceiro') || tl.includes('sublimacao') || tl.includes('sublimação') || tl.includes('full')) {
                        if (!extraido) extraido = {};
                        extraido.tecnica = 'sublimacao';
                    } else if (tl.includes('quarto') || tl.includes('dtf') || tl.includes('direct')) {
                        if (!extraido) extraido = {};
                        extraido.tecnica = 'dtf';
                    } else if (tl.includes('quinto') || tl.includes('laser') || (tl.includes('patch') && !tl.includes('silk'))) {
                        if (!extraido) extraido = {};
                        extraido.tecnica = 'patchLaser';
                    } else if (tl.includes('sexto') || tl.includes('patch silk') || tl.includes('couro com silk')) {
                        if (!extraido) extraido = {};
                        extraido.tecnica = 'patchSilk';
                    } else if (tl.includes('sétimo') || tl.includes('setimo') || tl.includes('último') || tl.includes('ultimo') || tl.includes('dtf relevo') || tl.includes('relevo')) {
                        if (!extraido) extraido = {};
                        extraido.tecnica = 'dtfRelevo';
                    }
                }
            }

            // Detecção por citação
            let codigoModeloCitado = null;
            let reguladorCitado    = null;
            let tecnicaCitada      = null;

            if (quotedText) {
                const regexCodigo = /\b(IB_[A-Z]+)\b/i;
                const matchCodigo = quotedText.match(regexCodigo);
                if (matchCodigo) codigoModeloCitado = matchCodigo[1].toUpperCase();

                const ql = quotedText.toLowerCase();
                if (ql.includes('padrão plástico') || ql.includes('padrao plastico'))                    reguladorCitado = 'padrao';
                else if (ql.includes('fivela metálica tipo 01') || ql.includes('fivela metalica tipo 01')) reguladorCitado = 'metal1';
                else if (ql.includes('fivela metálica tipo 02') || ql.includes('fivela metalica tipo 02')) reguladorCitado = 'metal2';

                if (ql.includes('silk 3d') || ql.includes('silk3d'))                         tecnicaCitada = 'silk3d';
                else if (ql.includes('bordado 3d') || ql.includes('bordado3d'))               tecnicaCitada = 'bordado3d';
                else if (ql.includes('sublimação') || ql.includes('sublimacao'))              tecnicaCitada = 'sublimacao';
                else if (ql.includes('dtf com relevo') || ql.includes('dtf relevo'))          tecnicaCitada = 'dtfRelevo';
                else if (ql.includes('dtf'))                                                   tecnicaCitada = 'dtf';
                else if (ql.includes('patch de couro com silk') || ql.includes('patch silk')) tecnicaCitada = 'patchSilk';
                else if (ql.includes('patch de couro') || ql.includes('laser'))               tecnicaCitada = 'patchLaser';
            }

            const textoLower = texto.toLowerCase();
            const expressõesEscolha = ['gostei','gosto','quero','prefiro','esse','essa','este','esta','desse','dessa','pode ser','vou de','escolho','escolhi','legal','top','perfeito','é esse','é essa','vamos de','beleza','ok','sim','fechou'];
            const clienteEscolheu = expressõesEscolha.some(exp => textoLower.includes(exp));

            if (codigoModeloCitado && !extraido?.modeloEscolhido && !leadData.modeloEscolhido && clienteEscolheu) {
                if (!extraido) extraido = {};
                extraido.modeloEscolhido = codigoModeloCitado;
            }
            if (reguladorCitado && !extraido?.tipoRegulador && !leadData.tipoRegulador && clienteEscolheu) {
                if (!extraido) extraido = {};
                extraido.tipoRegulador = reguladorCitado;
            }
            if (tecnicaCitada && !extraido?.tecnica && !leadData.tecnica && clienteEscolheu) {
                if (!extraido) extraido = {};
                extraido.tecnica = tecnicaCitada;
            }

            // Busca por keywords
            const buscaKeyword = buscarPorKeywords(texto);
            if (buscaKeyword) {
                const pedindoParaVer = ['foto','imagem','mandar','enviar','mostrar','ver','modelo','produto'].some(w => textoLower.includes(w));
                if (buscaKeyword.tipo === 'modelo' && pedindoParaVer && !leadData.modeloEscolhido) {
                    if (!extraido) extraido = {};
                    if (!extraido.modeloEspecifico && !extraido.modeloEscolhido) extraido.modeloEspecifico = buscaKeyword.codigo;
                }
            }

            if (extraido) {
                // Converter posição ordinal em código de modelo
                if (extraido.posicaoModelo && modelosEnviados.length > 0) {
                    const posicao = extraido.posicaoModelo - 1;
                    if (posicao >= 0 && posicao < modelosEnviados.length) {
                        extraido.modeloEscolhido = modelosEnviados[posicao];
                        leadData.modeloEscolhido = extraido.modeloEscolhido;
                    }
                }

                Object.keys(extraido).forEach(key => {
                    if (extraido[key] !== null && extraido[key] !== undefined) {
                        if (key === 'tipoRegulador') {
                            const nomesReguladores = { padrao: 'Padrão Plástico', metal1: 'Fivela Metálica Tipo 01', metal2: 'Fivela Metálica Tipo 02' };
                            leadData[key] = nomesReguladores[extraido[key]] || extraido[key];
                            extraido.querVerRegulador = false;
                        } else if (key === 'tecnica') {
                            const nomesTecnicas = {
                                silk3d: 'Silk 3D', bordado3d: 'Bordado 3D', sublimacao: 'Sublimação',
                                dtf: 'DTF (Direct to Film)', patchLaser: 'Patch de Couro Gravado a Laser',
                                patchSilk: 'Patch de Couro com Silk', dtfRelevo: 'DTF com Relevo'
                            };
                            leadData[key] = nomesTecnicas[extraido[key]] || extraido[key];
                            extraido.querVerTecnicas = false;
                            if (leadData.modeloEscolhido && !leadData.tipoRegulador) extraido.querVerRegulador = false;
                        } else if (key === 'material') {
                            // Linha de tecido (tactel/oxford/supercap/brim/alfaiataria/camurca) — sempre
                            // atualiza: o cliente pode subir/descer de nível ao longo da conversa. Torna
                            // o preço exato (uma linha da tabela) e o mockup mais fiel.
                            leadData[key] = extraido[key];
                        } else if (key === 'quantidade') {
                            const contextoEscolha = proximoCampoAntes?.campo === 'modeloEscolhido' || proximoCampoAntes?.campo === 'tipoRegulador' || proximoCampoAntes?.campo === 'tecnica';
                            if (contextoEscolha && extraido[key] < 10) {
                                console.log('⚠️ Ignorada extração de quantidade suspeita (' + extraido[key] + ')');
                            } else {
                                leadData[key] = extraido[key];
                            }
                        } else if (key === 'corPreferencia') {
                            const corpoSimples = texto.toLowerCase().trim();
                            if (corpoSimples !== 'sim' && corpoSimples !== 'tenho' && corpoSimples !== 'claro') {
                                leadData[key] = extraido[key];
                            }
                        } else if (!leadData[key]) {
                            leadData[key] = extraido[key];
                        }
                    }
                });

                // Forçar envio de modelos quando prazo for informado pela primeira vez (fluxo Isaac)
                if (extraido.prazoRecebimento && !leadData.jaViuModelos) {
                    extraido.querVerModelos = true;
                    extraido.querVerTecnicas = false;
                    leadData.jaViuModelos = true;
                }
            }

            // GUARD — pedido mínimo. Piso: 25 un (mínimo 30; 25 com +R$1,50/un; ou combos 20+20 / 25+25).
            // Abaixo disso não avança: zera a quantidade e sinaliza para a IA tratar a objeção no estilo dela.
            const qtdNum = parseInt(leadData.quantidade, 10);
            if (Number.isFinite(qtdNum) && qtdNum > 0 && qtdNum < 25) {
                leadData.avisarMinimo = qtdNum;
                leadData.quantidade = null;
                leadData.jaViuModelos = false;
                if (extraido) { extraido.querVerModelos = false; extraido.querVerTecnicas = false; extraido.querVerRegulador = false; extraido.querVerCores = false; }
                console.log(`🚧 Pedido mínimo: cliente pediu ${qtdNum} un (< 25) — segurando o avanço`);
            } else if (leadData.avisarMinimo && Number.isFinite(qtdNum) && qtdNum >= 25) {
                leadData.avisarMinimo = null; // cliente ajustou para quantidade válida
            }

            // Mockup: cliente pediu para ver a logo aplicada no modelo (precisa de logo + modelo)
            if (extraido?.querMockup && leadData.logoUrl && leadData.modeloEscolhido) {
                await canal.enviarMensagem(chatId, 'Boa ideia! Deixa eu montar uma prévia da sua logo no modelo, só um instante 🎨');
                const ok = await mockup.gerar(chatId, leadData);
                if (!ok) await canal.enviarMensagem(chatId, 'Não consegui gerar a prévia agora, mas nosso consultor te manda um mockup caprichado! 😉');
                leadData.conversationHistory.push({ role: 'user', content: texto });
                leadData.conversationHistory.push({ role: 'assistant', content: '[Enviou prévia/mockup da logo]' });
                return;
            }

            // Resposta afirmativa para arte
            if (proximoCampoAntes?.campo === 'temArte' && (textoLower.includes('tenho') || textoLower.includes('sim') || textoLower.includes('vou enviar'))) {
                leadData.temArte = 'sim';
            }

            const proximoCampoDepois = determinarProximoCampo(leadData);

            // Controle de técnicas
            const respondeuTimingArte = proximoCampoAntes?.campo === 'quandoEnviaArte' && extraido?.quandoEnviaArte;
            if (respondeuTimingArte && proximoCampoDepois?.campo === 'tecnica') {
                if (extraido) extraido.querVerTecnicas = false;
            }

            const respondeuTecnica = proximoCampoAntes?.campo === 'tecnica' && (extraido?.tecnica || extraido?.posicaoModelo);
            if (respondeuTecnica && proximoCampoDepois?.campo === 'tipoRegulador') {
                if (extraido) extraido.querVerRegulador = false;
            }

            const escolheuRegulador = proximoCampoAntes?.campo === 'tipoRegulador' && extraido?.tipoRegulador;
            if (escolheuRegulador && extraido) extraido.querVerRegulador = false;

            const escolheuTecnica = proximoCampoAntes?.campo === 'tecnica' && extraido?.tecnica;
            if (escolheuTecnica && extraido) extraido.querVerTecnicas = false;

            if (extraido && extraido.querVerModelos) extraido.querVerTecnicas = false;

            if (!respondeuTimingArte && !(tipo === 'image' || tipo === 'document') && proximoCampoDepois?.campo !== 'tecnica') {
                if (extraido) extraido.querVerTecnicas = false;
            }

            // Processar imagens
            const imagensForamEnviadas = extraido ? await processarPedidoImagens(chatId, extraido, leadData, proximoCampoDepois) : false;

            // Transbordo para pedidos grandes (ajustar limite conforme política da Imperial)
            if (leadData.quantidade > 100) {
                await canal.enviarMensagem(chatId, 'Para pedidos acima de 100 unidades, vou te passar para um de nossos consultores para uma negociação especial! 🤝');
                await canal.enviarMensagem(chatId, 'Transferir para o departamento Comercial');
                leadData.finalizado = true;
                await notificador.notificarEquipe(leadData, chatId, { tagExtra: 'Transbordo+100' });
                return;
            }

            const perguntaEspecificaJaEnviada = extraido?.perguntaEspecificaEnviada || false;
            if (perguntaEspecificaJaEnviada) {
                leadData.conversationHistory.push({ role: 'user', content: texto });
                leadData.conversationHistory.push({ role: 'assistant', content: 'Enviadas fotos e feita pergunta específica.' });
                return;
            }

            const historicoRecente = leadData.conversationHistory.slice(-30).map(h => ({
                role: h.role === 'user' ? 'user' : 'assistant',
                content: h.content
            }));

            const ultimaMensagemBot = leadData.conversationHistory.length > 0 ? leadData.conversationHistory[leadData.conversationHistory.length - 1] : null;
            const jaPerguntouIsso = ultimaMensagemBot?.role === 'assistant' && proximoCampoDepois && ultimaMensagemBot.content.includes(proximoCampoDepois.pergunta.substring(0, 30));

            // Motor de orçamento: se o cliente perguntou preço, calcula os valores REAIS da tabela
            // para o modelo em questão e injeta no prompt (a IA só apresenta, não inventa).
            let precoContexto = null;
            const perguntouPreco = extraido?.querSaberPreco || /(preç|preco|quanto|valor|custa|orçament|orcament)/i.test(texto);
            if (perguntouPreco) {
                const codPreco = leadData.modeloEscolhido || (buscaKeyword && buscaKeyword.tipo === 'modelo' ? buscaKeyword.codigo : null);
                if (codPreco) precoContexto = orcamento.contextoPreco(codPreco, leadData.quantidade, CATALOGO_MODELOS[codPreco]?.nome, leadData.material);
            }

            const resposta = await redator.redigir({ leadData, mensagemCliente: texto, proximoCampo: proximoCampoDepois, historicoRecente, imagensForamEnviadas, precoContexto });

            leadData.conversationHistory.push({ role: 'user', content: texto });

            if (resposta && !jaPerguntouIsso) {
                leadData.conversationHistory.push({ role: 'assistant', content: resposta });
                if (leadData.conversationHistory.length > 100) leadData.conversationHistory = leadData.conversationHistory.slice(-100);
                await canal.enviarMensagensQuebradas(chatId, resposta);

                // Disparar técnicas após transição da IA
                if (proximoCampoDepois?.campo === 'tecnica' && !imagensForamEnviadas && !leadData.tecnica) {
                    const extraidoSimulado = { querVerTecnicas: true };
                    await processarPedidoImagens(chatId, extraidoSimulado, leadData, proximoCampoDepois);
                }

                // Disparar reguladores após transição da IA
                if (proximoCampoDepois?.campo === 'tipoRegulador' && !imagensForamEnviadas && !leadData.tipoRegulador) {
                    const extraidoSimulado = { querVerRegulador: true };
                    await processarPedidoImagens(chatId, extraidoSimulado, leadData, proximoCampoDepois);
                }
            } else if (imagensForamEnviadas) {
                leadData.conversationHistory.push({ role: 'assistant', content: 'Enviadas fotos.' });
            }

            // Finalizar lead qualificado
            if (!proximoCampoDepois && !leadData.finalizado && leadData.tipoAtendimento === 'compra' && leadData.qualificacaoCompleta) {
                leadData.finalizado = true;
                const registro = { ...leadData, chatId, data: obterDataHoraBrasilia() };
                try { await repositorio.registrarLeadFinalizado(registro); }
                catch (e) { console.error('❌ Erro ao salvar lead finalizado:', e.message); }

                await canal.enviarMensagem(chatId, 'Transferir para o departamento Comercial');
                await notificador.notificarEquipe(leadData, chatId);
                // Fase 4: grava o pedido na memória durável do cliente (para recompra futura)
                try {
                    await repositorio.registrarPedidoCliente(chatId, {
                        nome: leadData.nome,
                        pedido: {
                            data: obterDataHoraBrasilia().toISOString(),
                            codigo: leadData.modeloEscolhido || null,
                            produto: leadData.modeloEscolhido ? (CATALOGO_MODELOS[leadData.modeloEscolhido]?.nome || leadData.modeloEscolhido) : null,
                            quantidade: leadData.quantidade || null,
                            usoEvento: leadData.usoEvento || null,
                            material: leadData.material || null,
                            tecnica: leadData.tecnica || null,
                            tipoRegulador: leadData.tipoRegulador || null,
                            corPreferencia: leadData.corPreferencia || null
                        }
                    });
                } catch (e) { console.error('❌ registrarPedidoCliente (legado):', e.message); }
            } else if (!leadData.finalizado) {
                agendarFollowUpReativacao(leadData);
            }

        } catch (e) {
            console.error(`❌ Erro ao processar mensagem de ${chatId}:`, e);
            // A IA falhou (instabilidade, cota, timeout). SILÊNCIO é o pior
            // desfecho: o cliente acha que foi ignorado e o lead se perde.
            // Avisa de forma humana e não repete se a última fala já foi essa.
            try {
                const ultima = leadData?.conversationHistory?.[leadData.conversationHistory.length - 1];
                const jaAvisou = ultima?.role === 'assistant' && ultima.content === FALA_DE_INSTABILIDADE;
                if (!jaAvisou) {
                    await canal.enviarMensagem(chatId, FALA_DE_INSTABILIDADE);
                    if (leadData?.conversationHistory) {
                        leadData.conversationHistory.push({ role: 'assistant', content: FALA_DE_INSTABILIDADE });
                    }
                }
            } catch (falhaAoAvisar) {
                console.error('❌ Falhou até para avisar o cliente:', falhaAoAvisar.message);
            }
        } finally {
            clearTimeout(timeoutId);
            processandoMensagem.delete(chatId);
            // Persiste o estado da conversa (salvo no /reset, que zera leadData).
            // O corte do histórico vive AQUI, num lugar só: os retornos antecipados
            // (pós-pedido, mockup, pergunta específica) também empilham turnos.
            if (leadData) {
                if (leadData.conversationHistory?.length > LIMITE_HISTORICO) {
                    leadData.conversationHistory = leadData.conversationHistory.slice(-LIMITE_HISTORICO);
                }
                try { await repositorio.salvarLead(chatId, leadData); }
                catch (e) { console.error('❌ Erro ao salvar estado da conversa:', e.message); }
            }
        }
    }

    // Mídia não suportada (vídeo, sticker, localização...) → fallback humanizado
    async function responderTipoNaoSuportado(chatId) {
        await canal.enviarMensagem(chatId, 'Pode me mandar por texto o que você precisa? Assim consigo te ajudar melhor 🙂');
    }

    return { processarMensagem, estaProcessando, temTurnosEmAndamento, responderTipoNaoSuportado };
}

module.exports = { criar };
