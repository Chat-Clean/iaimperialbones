require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Serve as imagens dos produtos como arquivos estáticos
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// =============================================================
//  CONFIGURAÇÃO — ChatClean (Webhook de entrada + Push API de saída)
//  Configure as variáveis no arquivo .env:
//
//  CC_PUSH_URL     = URL autenticada gerada em Configurações → API/Webhook → Adicionar
//                    (o token JWT já vem embutido como ?token=...; não precisa de header)
//  BASE_URL        = URL pública deste servidor (sem barra final) — serve as imagens em /assets
//  WEBHOOK_SECRET  = Token opcional para validar as requisições do webhook de entrada
//  EQUIPE_NUMERO   = WhatsApp interno que recebe o resumo dos leads qualificados
//  IA_ALLOWED_CONTACTS = Números permitidos na fase de teste (vazio = responde a todos)
//  PORT            = Porta do servidor (padrão: 3000)
// =============================================================
const CC_PUSH_URL   = process.env.CC_PUSH_URL   || '';
const BASE_URL      = process.env.BASE_URL      || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const EQUIPE_NUMERO = process.env.EQUIPE_NUMERO || '';
// Lista de números permitidos (fase de teste). Vazio = responde a todos.
const IA_ALLOWED_CONTACTS = (process.env.IA_ALLOWED_CONTACTS || '').split(',').map(s => s.trim()).filter(Boolean);
const PORT          = process.env.PORT          || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Dados de negócio e prompts extraídos para módulos próprios
const {
    EMPRESA_INFO,
    CATALOGO_MODELOS,
    NIVEIS_QUALIDADE,
    TECIDOS_E_CORES,
    OPCOES_TECNICAS,
    OPCOES_REGULADORES,
    TABELA_PRECOS
} = require('./data');
const { promptExtracao, promptResposta } = require('./prompts');

// Dados de negócio movidos para ./data.js


// =============================================================
//  ESTADO EM MEMÓRIA
// =============================================================
const leadsData               = new Map();
const processandoMensagem     = new Map();
const timersFollowUp          = new Map();
const followUpsEnviados       = new Map();
const modelosEnviadosCache    = new Map();
const tecnicasEnviadasCache   = new Map();

// =============================================================
//  UTILITÁRIOS
// =============================================================
function obterDataHoraBrasilia() {
    const agora = new Date();
    const brasiliaOffset = -3 * 60;
    const utcTime = agora.getTime() + (agora.getTimezoneOffset() * 60000);
    return new Date(utcTime + (brasiliaOffset * 60000));
}

function normalizarPhone(phone) {
    return String(phone).replace(/\D/g, '');
}

// Núcleo canônico de um número BR para COMPARAÇÃO (ignora o 9º dígito de celular).
// Ex.: 5584994610845 (13) e 558494610845 (12) viram o mesmo núcleo → casam.
// Usado só na allow-list; o número original é preservado para o envio (ccPush).
function nucleoNumero(n) {
    let d = String(n).replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55') && d[4] === '9') {
        d = d.slice(0, 4) + d.slice(5); // remove o 9 logo após o DDD
    }
    return d;
}

// true se o número está na allow-list (tolerante ao 9º dígito). Lista vazia = libera todos.
function contatoPermitido(numero) {
    if (!IA_ALLOWED_CONTACTS.length) return true;
    const alvo = nucleoNumero(numero);
    return IA_ALLOWED_CONTACTS.some(a => nucleoNumero(a) === alvo);
}

const dbPath = path.join(__dirname, 'database.json');
let databaseLeads = { leads: [] };
try {
    if (fs.existsSync(dbPath)) {
        databaseLeads = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
} catch (e) {
    console.log('⚠️ Criando novo banco de dados de leads');
}

function salvarDatabase() {
    fs.writeFileSync(dbPath, JSON.stringify(databaseLeads, null, 2));
}

// =============================================================
//  CHATCLEAN — ENVIO VIA PUSH API
//  Um único endpoint autenticado (CC_PUSH_URL) entrega texto e mídia.
//  O token JWT já vem embutido na URL como ?token=... (sem header).
// =============================================================
async function ccPush(number, payloadExtra = {}) {
    if (!CC_PUSH_URL) { console.warn('⚠️ CC_PUSH_URL não configurado no .env — envio ignorado'); return false; }
    try {
        await axios.post(CC_PUSH_URL, {
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

// Notifica a equipe (e registra o resumo) quando um lead é qualificado.
// Substitui o antigo criarLeadKommo — na ChatClean o "lead" já é o próprio
// contato/ticket na plataforma; aqui só entregamos o resumo estruturado.
async function notificarEquipe(leadData, chatId, opcoes = {}) {
    const nomeProduto = leadData.modeloEscolhido
        ? (CATALOGO_MODELOS[leadData.modeloEscolhido]?.nome || leadData.modeloEscolhido)
        : 'A definir';

    const resumo =
        `🎯 LEAD QUALIFICADO — IA Imperial Bonés${opcoes.tagExtra ? ' [' + opcoes.tagExtra + ']' : ''}\n\n` +
        `Cliente: ${leadData.nome || 'Lead'} (${chatId})\n` +
        `Quantidade: ${leadData.quantidade || 'A definir'}\n` +
        `Finalidade: ${leadData.usoEvento || 'Não informado'}\n` +
        `Prazo: ${leadData.prazoRecebimento || 'Sem prazo específico'}\n` +
        `Produto: ${nomeProduto}\n` +
        `Arte/Logo: ${leadData.temArte === 'sim' ? 'Cliente tem' : leadData.temArte === 'enviou' ? 'Enviou arquivo' : 'Não tem'}\n` +
        `Técnica: ${leadData.tecnica || 'A definir'}\n` +
        `Regulador: ${leadData.tipoRegulador || 'Padrão'}\n` +
        `Cor: ${leadData.corPreferencia || 'A definir'}`;

    // Registra o resumo como nota interna no ticket do próprio cliente (fica no CRM p/ o atendente)
    await ccPush(chatId, { body: resumo, onlyNote: true, note: { body: resumo } });

    // Se houver número da equipe, envia o resumo também por WhatsApp interno
    if (EQUIPE_NUMERO) await ccPush(EQUIPE_NUMERO, { body: resumo });

    console.log(`✅ Equipe notificada — lead ${leadData.nome || ''} (${chatId})`);
    return true;
}

// =============================================================
//  FUNÇÕES DE ENVIO  (tudo via ChatClean Push)
// =============================================================
function buildPublicUrl(filePath) {
    if (!BASE_URL) return null;
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
    const relativePath = path.relative(__dirname, absPath).replace(/\\/g, '/');
    return `${BASE_URL.replace(/\/$/, '')}/${relativePath}`;
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
            const absPath = path.isAbsolute(arquivo) ? arquivo : path.join(__dirname, arquivo);
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

// =============================================================
//  LÓGICA DE QUALIFICAÇÃO
// =============================================================
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
    const modelosSemRegulador = ['IB_VIS', 'IB_BOLSA', 'IB_CHAP'];
    if (!leadData.tipoRegulador && leadData.modeloEscolhido) {
        if (modelosSemRegulador.includes(leadData.modeloEscolhido)) {
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

function recomendarModelos(leadData) {
    const uso = (leadData.usoEvento || '').toLowerCase();
    const recomendacoes = [];

    if (uso.includes('beach tennis') || uso.includes('esport') || uso.includes('corrida') || uso.includes('academia') || uso.includes('treino') || uso.includes('fitness') || uso.includes('tenis')) {
        return ['IB_VIS', 'IB_SNAP', 'IB_TRUCK'];
    }
    if (uso.includes('campo') || uso.includes('agro') || uso.includes('fazenda') || uso.includes('rural') || uso.includes('produtor') || uso.includes('sertanejo') || uso.includes('proteção solar') || uso.includes('sol intenso')) {
        recomendacoes.push('IB_CHAP', 'IB_SNAP', 'IB_TRUCK');
    }
    if (uso.includes('brinde') || uso.includes('corporativo') || uso.includes('empresa') || uso.includes('marketing') || uso.includes('mimo')) {
        recomendacoes.push('IB_SNAP', 'IB_TRUCK', 'IB_BOLSA');
    }
    if (uso.includes('uniforme') || uso.includes('equipe') || uso.includes('time') || uso.includes('funcionario') || uso.includes('funcionário')) {
        recomendacoes.push('IB_SNAP', 'IB_TRUCK', 'IB_DAD');
    }
    if (uso.includes('evento') || uso.includes('casamento') || uso.includes('formatura') || uso.includes('festa') || uso.includes('15 anos') || uso.includes('aniversario') || uso.includes('aniversário')) {
        recomendacoes.push('IB_SNAP', 'IB_DAD', 'IB_VIS');
    }
    if (uso.includes('casual') || uso.includes('dia a dia') || uso.includes('uso diario') || uso.includes('pessoal')) {
        recomendacoes.push('IB_DAD', 'IB_SNAP', 'IB_TRUCK');
    }
    if (uso.includes('marca') || uso.includes('colecao') || uso.includes('coleção') || uso.includes('influencer') || uso.includes('revenda') || uso.includes('streetwear')) {
        recomendacoes.push('IB_SNAP', 'IB_DAD', 'IB_TRUCK');
    }
    if (uso.includes('bolsa') || uso.includes('sacola') || uso.includes('bag') || uso.includes('ecobag')) {
        recomendacoes.push('IB_BOLSA');
    }
    if (uso.includes('praia') || uso.includes('verão') || uso.includes('verao') || uso.includes('festival') || uso.includes('show')) {
        recomendacoes.push('IB_CHAP', 'IB_VIS', 'IB_SNAP');
    }

    if (recomendacoes.length === 0) recomendacoes.push('IB_SNAP', 'IB_TRUCK', 'IB_DAD');

    return [...new Set(recomendacoes)].slice(0, 3);
}

// =============================================================
//  FOLLOW-UPS
// =============================================================
async function enviarFollowUps(chatId, momento) {
    const followUps = {
        'apos_modelos':         ['Todos os nossos produtos incluem envio para todo o Brasil! 🚚', 'Personalizamos com sua marca utilizando as melhores técnicas do mercado! ✨'],
        'apos_escolher_modelo': ['Ótima escolha! Esse produto é um dos mais pedidos pelos nossos clientes! 🧢'],
        'apos_receber_arte':    ['Nossa equipe vai analisar a arte e, se precisar de ajustes, a gente te avisa! 👍'],
        'apos_quantidade':      ['Trabalhamos com descontos progressivos — quanto maior o pedido, melhor o preço por unidade! 💼']
    };
    const mensagens = followUps[momento];
    if (!mensagens) return;
    for (const msg of mensagens) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await enviarMensagem(chatId, msg);
    }
}

function agendarFollowUpReativacao(chatId, leadData) {
    if (timersFollowUp.has(chatId)) clearTimeout(timersFollowUp.get(chatId));
    if (leadData.finalizado) return;

    const TEMPO_INATIVIDADE = 30 * 60 * 1000;

    const timer = setTimeout(async () => {
        try {
            const proximo = determinarProximoCampo(leadData);
            if (!proximo) return;

            let msgReativacao = '';
            const nome = leadData.nome?.split(' ')[0] || 'amigo(a)';

            if (proximo.campo === 'tipoAtendimento') {
                msgReativacao = `Oi ${nome}, ainda está por aí? Me conta como posso te ajudar com seus produtos personalizados! 😊`;
            } else if (proximo.campo === 'modeloEscolhido' || proximo.campo === 'usoEvento') {
                msgReativacao = `Oi ${nome}! Conseguiu dar uma olhadinha nos produtos que te enviei? Se tiver qualquer dúvida, é só falar! 🧢`;
            } else if (proximo.campo === 'temArte') {
                msgReativacao = `Oi ${nome}, estou aguardando sua arte para darmos continuidade ao orçamento. Assim que puder, me envia por aqui! ✨`;
            } else {
                msgReativacao = `Oi ${nome}! Passando para saber se ficou alguma dúvida sobre o que conversamos. Estou à disposição para finalizarmos seu pedido! 😊`;
            }

            if (followUpsEnviados.get(chatId) === msgReativacao) return;

            await enviarMensagem(chatId, msgReativacao);
            followUpsEnviados.set(chatId, msgReativacao);
            console.log(`📩 Follow-up de reativação enviado para ${chatId}`);
        } catch (e) {
            console.error('Erro ao enviar follow-up:', e);
        }
    }, TEMPO_INATIVIDADE);

    timersFollowUp.set(chatId, timer);
}

// =============================================================
//  IA — EXTRAÇÃO DE INFORMAÇÕES
// =============================================================
async function extrairInformacoesComIA(mensagem, campoAtual, historicoRecente = [], modelosEnviados = []) {
    try {
        const mensagemSanitizada = mensagem.replace(/[<>]/g, '').substring(0, 1000);

        const prompt = promptExtracao({ mensagemSanitizada, campoAtual, modelosEnviados });

        let promptFinal = prompt;
        if (mensagemSanitizada.includes('[RESPOSTA À MENSAGEM:')) {
            promptFinal += `\n\nOBSERVAÇÃO: O cliente respondeu citando uma mensagem específica. Se a citação contiver código de produto (IB_xxx) e o cliente usar expressões de escolha, extraia o código como modeloEscolhido.`;
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                ...historicoRecente,
                { role: 'user', content: promptFinal }
            ],
            temperature: 0
        });

        let res = completion.choices[0].message.content.trim();
        if (res.includes('```')) res = res.replace(/```json?/g, '').replace(/```/g, '').trim();
        return JSON.parse(res);
    } catch (e) {
        console.error('Erro ao extrair informações:', e.message);
        return null;
    }
}

// =============================================================
//  IA — GERAÇÃO DE RESPOSTA
// =============================================================
async function gerarRespostaIA(leadData, mensagemCliente, proximoCampo, historicoRecente = [], imagensForamEnviadas = false) {
    if (imagensForamEnviadas && (
        proximoCampo?.campo === 'modeloEscolhido' ||
        proximoCampo?.campo === 'tecnica' ||
        proximoCampo?.campo === 'tipoRegulador'
    )) {
        console.log(`🔒 BLOQUEIO: Imagens foram enviadas. Não gerando resposta adicional.`);
        return null;
    }

    const mensagemSanitizada = mensagemCliente.replace(/[<>]/g, '').substring(0, 1000);
    const isInicioConversa = leadData.conversationHistory.length === 0;

    if (proximoCampo?.campo === 'tipoRegulador') {
        const primeiroNome = leadData.nome?.split(' ')[0] || '';
        return `Sobre o regulador do seu produto, temos 3 opções. Vou te enviar as fotos para você escolher qual prefere, ${primeiroNome}! 😊`;
    }

    if (proximoCampo?.campo === 'tecnica' && (leadData.quandoEnviaArte || leadData.temArte === 'enviou')) {
        return 'Para eu te ajudar a escolher a melhor técnica de personalização para sua arte, vou te mostrar as opções que trabalhamos.';
    }

    const prompt = promptResposta({ isInicioConversa, mensagemSanitizada, imagensForamEnviadas, proximoCampo, leadData });

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: 'Você é um atendente consultivo da Imperial Bonés Personalizados. Sua escrita é natural, empática e profissional. Tom: acolhedor, prestativo e consultivo.' },
            ...historicoRecente,
            { role: 'user', content: prompt }
        ],
        temperature: 0.7
    });

    return completion.choices[0].message.content.trim();
}

// =============================================================
//  IA — VISÃO (a IA "enxerga" a imagem enviada pelo cliente)
// =============================================================
async function analisarImagem(mediaUrl, leadData = {}) {
    if (!mediaUrl) return null;
    try {
        const contexto = leadData.modeloEscolhido
            ? `O cliente já escolheu o produto ${leadData.modeloEscolhido}.`
            : 'Ainda estamos no começo do atendimento.';
        const instrucao = `Você é atendente da Imperial Bonés (bonés e chapéus personalizados). O cliente enviou esta imagem pelo WhatsApp. ${contexto}
Descreva de forma curta e útil para o atendimento, em 1 a 2 frases, tom natural e SEM markdown:
- O que é: logo/arte da marca, foto de um boné de referência, print de exemplo, documento, ou outra coisa.
- Elementos visuais relevantes: texto/nome que aparece, símbolos, cores predominantes, estilo.
- Se for uma logo/arte, sugira brevemente qual técnica combina (silk 3D, bordado 3D, sublimação, DTF ou patch de couro) e por quê.
Não invente nada que não dê para ver. Se a imagem não tiver relação com bonés/personalização, diga isso claramente.`;
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: instrucao },
                    { type: 'image_url', image_url: { url: mediaUrl } }
                ]
            }],
            max_tokens: 300,
            temperature: 0.4
        });
        return completion.choices[0].message.content.trim();
    } catch (e) {
        console.error('❌ Erro ao analisar imagem (visão):', e.message);
        return null;
    }
}

// Transforma a análise da imagem numa resposta curta e natural, referenciando a arte,
// e faz a transição para a escolha da técnica.
async function gerarAckImagem(leadData, descImg, historicoRecente = []) {
    const fallback = descImg
        ? 'Recebi sua arte! Vou te mostrar as técnicas pra gente escolher a ideal pra ela. ✨'
        : 'Perfeito, recebi sua arte! Vou te mostrar as técnicas. ✨';
    try {
        const nome = leadData.nome?.split(' ')[0] || '';
        const prompt = `O cliente${nome ? ' (' + nome + ')' : ''} acabou de enviar a arte/logo dele. O que você viu na imagem: "${descImg || 'imagem recebida'}".
Escreva UMA mensagem curta de WhatsApp (1 a 2 frases, tom humano e caloroso, no máximo 1 emoji, sem markdown) que:
- reconheça a arte citando algo CONCRETO que você viu nela (uma cor, símbolo, o nome, o estilo);
- diga que vai mostrar as técnicas de personalização pra escolher a ideal pra essa arte.
Não liste as técnicas agora e não invente detalhes que não estão na descrição.`;
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Você é atendente consultivo da Imperial Bonés. Escrita natural, calorosa e curta, registro de WhatsApp.' },
                ...historicoRecente,
                { role: 'user', content: prompt }
            ],
            temperature: 0.7
        });
        return completion.choices[0].message.content.trim() || fallback;
    } catch (e) {
        console.error('❌ Erro no ack de imagem:', e.message);
        return fallback;
    }
}

// =============================================================
//  PROCESSAMENTO DE IMAGENS
// =============================================================
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

async function processarPedidoImagens(chatId, extraido, leadData, proximoCampoDepois) {
    let imagensEnviadas = false;

    if (extraido.modeloEscolhido || leadData.modeloEscolhido) {
        extraido.querVerModelos = false;
    }

    // Ver TODOS os produtos
    if (extraido.querVerTodosModelos) {
        await enviarMensagem(chatId, 'Claro! Vou te enviar todos os nossos produtos para você conhecer melhor! 🧢');
        const arquivos = Object.values(CATALOGO_MODELOS).map(m => m.arquivo);
        await enviarImagens(chatId, arquivos.slice(0, 3), '');
        await new Promise(resolve => setTimeout(resolve, 2000));
        await enviarImagens(chatId, arquivos.slice(3), '');
        imagensEnviadas = true;
        await enviarMensagem(chatId, 'Essas são nossas opções! Qual desses produtos você prefere? 😊');
        extraido.perguntaEspecificaEnviada = true;
    }
    // Ver MAIS produtos
    else if (extraido.querVerMaisModelos) {
        const jaEnviados = modelosEnviadosCache.get(chatId) || [];
        const restantes = Object.keys(CATALOGO_MODELOS).filter(c => !jaEnviados.includes(c));
        if (restantes.length > 0) {
            const maisTres = restantes.slice(0, 3);
            modelosEnviadosCache.set(chatId, [...jaEnviados, ...maisTres]);
            await enviarMensagem(chatId, 'Aqui estão mais opções:');
            await new Promise(resolve => setTimeout(resolve, 1500));
            for (const codigo of maisTres) {
                const modelo = CATALOGO_MODELOS[codigo];
                if (modelo) {
                    const legenda = `🧢 *${modelo.nome}* (${modelo.codigo})\n\n${modelo.descricao}\n\n💰 ${modelo.precoReferencia}`;
                    await enviarImagens(chatId, [modelo.arquivo], legenda);
                    await new Promise(resolve => setTimeout(resolve, 1200));
                }
            }
            imagensEnviadas = true;
            await enviarMensagem(chatId, 'Qual desses você prefere? 😊');
            extraido.perguntaEspecificaEnviada = true;
        } else {
            await enviarMensagem(chatId, 'Já te mostrei todos os nossos produtos! Algum te interessou? 😊');
            extraido.perguntaEspecificaEnviada = true;
        }
    }
    // Recomendação inteligente
    else if (extraido.querVerModelos && !leadData.modeloEscolhido) {
        const recomendacoes = recomendarModelos(leadData);
        if (recomendacoes.length > 0) {
            modelosEnviadosCache.set(chatId, recomendacoes);
            await enviarMensagem(chatId, 'Perfeito! Vou te mostrar os produtos ideais para o que você precisa! 🧢✨');
            await new Promise(resolve => setTimeout(resolve, 1500));
            for (const codigo of recomendacoes) {
                const modelo = CATALOGO_MODELOS[codigo];
                if (modelo) {
                    const legenda = `🧢 *${modelo.nome}* (${modelo.codigo})\n\n${modelo.descricao}\n\n💰 ${modelo.precoReferencia}`;
                    await enviarImagens(chatId, [modelo.arquivo], legenda);
                    await new Promise(resolve => setTimeout(resolve, 1200));
                }
            }
            imagensEnviadas = true;
            await enviarMensagem(chatId, 'Qual desses produtos você prefere? 😊');
            extraido.perguntaEspecificaEnviada = true;
        }
    }

    // Produto específico por keyword
    if (extraido.modeloEspecifico) {
        const codigo = extraido.modeloEspecifico.toUpperCase();
        const modelo = CATALOGO_MODELOS[codigo];
        if (modelo) {
            const legenda = `🧢 *${modelo.nome}* (${modelo.codigo})\n\n${modelo.descricao}\n\n💰 ${modelo.precoReferencia}`;
            await enviarImagens(chatId, [modelo.arquivo], legenda);
            imagensEnviadas = true;
            await enviarMensagem(chatId, `O que achou do ${modelo.nome}? Se quiser ver mais ou outro produto, é só falar! 😊`);
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
            await enviarImagens(chatId, tecnica.arquivos, legenda);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        imagensEnviadas = true;
        await enviarMensagem(chatId, 'Qual dessas técnicas você prefere para sua arte? 😊');
        extraido.perguntaEspecificaEnviada = true;
    }

    // Reguladores
    const modelosSemRegulador = ['IB_VIS', 'IB_BOLSA', 'IB_CHAP'];
    const reguladorEscolhidoAgora = extraido.tipoRegulador !== null && extraido.tipoRegulador !== undefined;

    if (extraido.querVerRegulador && !modelosSemRegulador.includes(leadData.modeloEscolhido) && !leadData.tipoRegulador && !reguladorEscolhidoAgora) {
        for (const [, reg] of Object.entries(OPCOES_REGULADORES)) {
            const legenda = `*${reg.nome}*\n💰 Adicional: ${reg.adicional}`;
            await enviarImagens(chatId, [reg.arquivo], legenda);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        imagensEnviadas = true;
        await enviarMensagem(chatId, 'Pode escolher qual regulador prefere! 😊');
        extraido.perguntaEspecificaEnviada = true;
    }

    return imagensEnviadas;
}

// =============================================================
//  PROCESSAMENTO DE MENSAGEM
// =============================================================
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

    try {
        if (!leadsData.has(chatId)) {
            leadsData.set(chatId, { conversationHistory: [] });
        }
        const leadData = leadsData.get(chatId);
        // Captura o nome do contato vindo do ChatClean (se ainda não temos)
        if (nomeContato && !leadData.nome) leadData.nome = nomeContato;

        if (timersFollowUp.has(chatId)) {
            clearTimeout(timersFollowUp.get(chatId));
            timersFollowUp.delete(chatId);
        }

        // Reset
        if (texto.toLowerCase() === '/reset') {
            leadsData.delete(chatId);
            modelosEnviadosCache.delete(chatId);
            tecnicasEnviadasCache.delete(chatId);
            followUpsEnviados.delete(chatId);
            if (timersFollowUp.has(chatId)) { clearTimeout(timersFollowUp.get(chatId)); timersFollowUp.delete(chatId); }
            await enviarMensagem(chatId, '🔄 Conversa resetada! Vamos começar de novo. 😊');
            return;
        }

        if (leadData.finalizado) {
            await enviarMensagem(chatId, 'Já estou encaminhando seu atendimento! Um consultor retornará em instantes. 😊');
            return;
        }

        // Imagem/documento — a IA "enxerga" a imagem (visão) e usa como contexto
        if (tipo === 'image' || tipo === 'document') {
            const descImg = await analisarImagem(mediaUrl, leadData);
            if (descImg) {
                leadData.analiseImagem = descImg;
                console.log(`🖼️ Visão: ${descImg}`);
            }
            // Registra o envio no histórico para dar contexto às próximas respostas
            leadData.conversationHistory.push({ role: 'user', content: `[O cliente enviou uma imagem]${descImg ? ' — ' + descImg : ''}` });

            // Já escolheu o produto e ainda não a técnica: trata como arte, reconhece de forma
            // contextual (referenciando o que viu) e leva para a escolha da técnica.
            if (leadData.modeloEscolhido && (!leadData.temArte || leadData.temArte === 'sim') && !leadData.tecnica) {
                leadData.temArte = 'enviou';
                const histAck = leadData.conversationHistory.slice(-30).map(h => ({
                    role: h.role === 'user' ? 'user' : 'assistant', content: h.content
                }));
                const ack = await gerarAckImagem(leadData, descImg, histAck);
                await enviarMensagensQuebradas(chatId, ack);
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
                    const resp = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 30000 });
                    audioBuffer = Buffer.from(resp.data);
                }
            } catch (e) {
                console.error('❌ Erro ao baixar áudio:', e.message);
            }

            if (audioBuffer) {
                try {
                    console.log('🎙️ Áudio recebido, iniciando transcrição...');
                    const formData = new FormData();
                    formData.append('file', audioBuffer, { filename: 'audio.ogg', contentType: mediaMimetype || 'audio/ogg' });
                    formData.append('model', 'whisper-1');
                    const transcription = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
                        headers: { ...formData.getHeaders(), Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
                    });
                    texto = transcription.data.text;
                    console.log(`📝 Transcrição: "${texto}"`);
                } catch (e) {
                    console.error('❌ Erro ao transcrever áudio:', e.message);
                    await enviarMensagem(chatId, 'Desculpe, não consegui entender seu áudio. Pode digitar, por favor? ✨');
                    return;
                }
            } else {
                await enviarMensagem(chatId, 'Desculpe, não consegui processar seu áudio. Pode digitar, por favor? ✨');
                return;
            }
        }

        if (quotedText) {
            console.log(`💬 Mensagem citada: "${quotedText}"`);
            texto = `[RESPOSTA À MENSAGEM: "${quotedText}"]\n${texto}`;
        }

        const proximoCampoAntes = determinarProximoCampo(leadData);
        const historicoExtracao = leadData.conversationHistory.slice(-4).map(h => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content
        }));

        const modelosEnviados = modelosEnviadosCache.get(chatId) || [];
        let extraido = await extrairInformacoesComIA(texto, proximoCampoAntes?.campo, historicoExtracao, modelosEnviados);

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
            // Fallback: se o objetivo for informado e já tiver quantidade, mas não tiver visto modelos ainda
            if (extraido.usoEvento && leadData.quantidade && !leadData.prazoRecebimento && !leadData.jaViuModelos) {
                // Não força aqui — espera o prazo antes de mostrar os modelos
            }
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
            await enviarMensagem(chatId, 'Para pedidos acima de 100 unidades, vou te passar para um de nossos consultores para uma negociação especial! 🤝');
            await enviarMensagem(chatId, 'Transferir para o departamento Comercial');
            leadData.finalizado = true;
            await notificarEquipe(leadData, chatId, { tagExtra: 'Transbordo+100' });
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

        const resposta = await gerarRespostaIA(leadData, texto, proximoCampoDepois, historicoRecente, imagensForamEnviadas);

        leadData.conversationHistory.push({ role: 'user', content: texto });

        if (resposta && !jaPerguntouIsso) {
            leadData.conversationHistory.push({ role: 'assistant', content: resposta });
            if (leadData.conversationHistory.length > 100) leadData.conversationHistory = leadData.conversationHistory.slice(-100);
            await enviarMensagensQuebradas(chatId, resposta);

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
            databaseLeads.leads.push({ ...leadData, chatId, data: obterDataHoraBrasilia() });
            salvarDatabase();

            await enviarMensagem(chatId, 'Transferir para o departamento Comercial');
            await notificarEquipe(leadData, chatId);
        } else if (!leadData.finalizado) {
            agendarFollowUpReativacao(chatId, leadData);
        }

    } catch (e) {
        console.error(`❌ Erro ao processar mensagem de ${chatId}:`, e);
    } finally {
        clearTimeout(timeoutId);
        processandoMensagem.delete(chatId);
    }
}

// (Endpoint /salesbot removido — era específico do Kommo. Na ChatClean a saída
//  é feita diretamente via Push API, sem return_url nem handlers.)

// =============================================================
//  WEBHOOK
// =============================================================
function parsePayload(body) {
    try {
        // Normaliza o tipo de mensagem para os valores que o fluxo entende
        const normTipo = (t) => {
            const v = String(t || 'text').toLowerCase();
            if (['image', 'audio', 'ptt', 'document', 'text'].includes(v)) return v;
            if (v === 'chat' || v === '') return 'text';
            return v; // sticker/video/location etc. → tratado como não-texto no /webhook
        };

        // --- Formato ChatClean (documentado): contact + message aninhados ---
        //   { contact:{number,name}, message:{body,type,fromMe,id,quotedMsg:{body},mediaUrl} }
        if (body?.contact || (body?.message && typeof body.message === 'object' && !body.message.add)) {
            const contato = body.contact || {};
            const msg     = body.message || {};
            if (msg.fromMe) return null; // ignora mensagens enviadas pelo atendente/bot
            // Formato real ChatClean: sem contact.number no topo — o telefone vem em
            // message.raw.Info.SenderAlt (ex.: "558494610845@s.whatsapp.net"). NUNCA usar
            // Chat/Sender (formato "@lid", que não é telefone).
            const senderAlt = msg.raw?.Info?.SenderAlt ? String(msg.raw.Info.SenderAlt).split('@')[0] : null;
            const numero = contato.number || contato.phone || body.number || senderAlt || msg.number;
            const phone  = normalizarPhone(numero);
            if (!phone) return null;
            return {
                chatId:        phone,
                msgId:         msg.id ? String(msg.id) : (msg.messageId ? String(msg.messageId) : null),
                texto:         String(msg.body || msg.text || '').trim(),
                tipo:          normTipo(msg.type || msg.mediaType),
                mediaBase64:   msg.mediaBase64 || msg.base64 || null,
                mediaUrl:      msg.mediaUrl || null,
                mediaMimetype: msg.mimetype || msg.raw?.Message?.imageMessage?.mimetype || null,
                quotedText:    msg.quotedMsg?.body || msg.quotedMsg?.text || null,
                nomeContato:   contato.name || msg.raw?.Info?.PushName || body.contactName || ''
            };
        }

        // --- Formato plano (webhook/n8n simples) ---
        //   { number, type, body, contactName, id }
        if (body?.number && (body?.body !== undefined || body?.type)) {
            if (body.fromMe) return null;
            const phone = normalizarPhone(body.number);
            if (!phone) return null;
            return {
                chatId:        phone,
                msgId:         body.id ? String(body.id) : null,
                texto:         String(body.body || '').trim(),
                tipo:          normTipo(body.type),
                mediaBase64:   body.mediaBase64 || body.base64 || null,
                mediaUrl:      body.mediaUrl || null,
                mediaMimetype: body.mimetype || null,
                quotedText:    body.quotedText || null,
                nomeContato:   body.contactName || body.name || ''
            };
        }

        // --- Formato numero_cliente/url_envio (ChatBot "Requisição de API") ---
        // IGNORADO de propósito: a Imperial usa a API/Webhook (formato `message`) como
        // fonte ÚNICA. Este formato é o disparo duplicado do ChatBot 114 (node de API) e
        // chega SEM `fromMe`/`mediaType`, tratando a URL da mídia como texto. Aceitá-lo
        // duplicaria cada mensagem. Ideal: desativar o node de API no ChatBot 114.
        if (body?.numero_cliente && body?.mensagem_cliente !== undefined) {
            console.log('↩️ Ignorando disparo duplicado do ChatBot (formato numero_cliente) — fonte única é a API/Webhook');
            return null;
        }

        console.log('⚠️ Payload não reconhecido:', JSON.stringify(body, null, 2).slice(0, 800));
        return null;
    } catch (e) {
        console.error('❌ Erro ao fazer parse do payload:', e.message);
        return null;
    }
}

// IDs de mensagens já processadas (evita webhooks duplicados)
const mensagensProcessadas = new Set();

// Tipos de mídia que o fluxo trata internamente (áudio → transcreve; imagem/doc → arte)
const TIPOS_SUPORTADOS = ['text', 'image', 'document', 'audio', 'ptt'];

app.post('/webhook', express.json({ limit: '10mb' }), async (req, res) => {
    // Responder imediatamente (o ChatClean espera resposta rápida)
    res.status(200).json({ status: 'ok' });

    try {
        if (WEBHOOK_SECRET) {
            const raw = req.headers['x-webhook-token'] || req.headers['authorization'] || '';
            const token = raw.replace(/^Bearer\s+/i, '');
            const a = Buffer.from(token.padEnd(128).slice(0, 128));
            const b = Buffer.from(WEBHOOK_SECRET.padEnd(128).slice(0, 128));
            if (token.length !== WEBHOOK_SECRET.length || !crypto.timingSafeEqual(a, b)) {
                console.warn('⚠️ Webhook com token inválido.');
                return;
            }
        }

        console.log('🔍 PAYLOAD RAW:', JSON.stringify(req.body, null, 2).slice(0, 4000));

        const parsed = parsePayload(req.body);
        if (!parsed) return;

        console.log(`📩 Webhook de ${parsed.chatId} [${parsed.tipo}]: "${parsed.texto || '[mídia]'}"`);

        // Fase de teste: só responde aos números da lista permitida (tolerante ao 9º dígito)
        if (!contatoPermitido(parsed.chatId)) {
            console.log(`🚫 Contato ${parsed.chatId} fora da lista de teste — ignorado`);
            return;
        }

        // Dedup: o ChatClean pode reenviar o mesmo webhook
        if (parsed.msgId) {
            if (mensagensProcessadas.has(parsed.msgId)) {
                console.log(`↩️ Mensagem duplicada (${parsed.msgId}) ignorada`);
                return;
            }
            mensagensProcessadas.add(parsed.msgId);
            if (mensagensProcessadas.size > 500) {
                [...mensagensProcessadas].slice(0, 200).forEach(id => mensagensProcessadas.delete(id));
            }
        }

        // Mídia não suportada (vídeo, sticker, localização...) → fallback humanizado
        if (!TIPOS_SUPORTADOS.includes(parsed.tipo)) {
            await enviarMensagem(parsed.chatId, 'Pode me mandar por texto o que você precisa? Assim consigo te ajudar melhor 🙂');
            return;
        }

        // Guarda de concorrência: evita dois processamentos simultâneos do mesmo contato
        if (processandoMensagem.get(parsed.chatId)) {
            console.log(`⏳ Já processando ${parsed.chatId} — ignorando concorrente`);
            return;
        }

        setImmediate(() => processarMensagem(parsed));

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

// =============================================================
//  INICIALIZAÇÃO
// =============================================================
app.listen(PORT, () => {
    console.log('');
    console.log('🚀 ================================');
    console.log(`🤖 IA Imperial Bonés — CHATCLEAN MODE`);
    console.log(`📡 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Webhook URL: https://SEU_DOMINIO/webhook`);
    console.log(`❤️  Health:     https://SEU_DOMINIO/health`);
    console.log('🚀 ================================');
    console.log('');

    if (!CC_PUSH_URL)   console.warn('⚠️  ATENÇÃO: CC_PUSH_URL não configurado — a IA não conseguirá responder.');
    if (!BASE_URL)      console.warn('⚠️  ATENÇÃO: BASE_URL não configurado — envio de imagens desativado.');
    if (!EQUIPE_NUMERO) console.warn('ℹ️  EQUIPE_NUMERO não configurado — resumo de lead qualificado só irá como nota interna.');
    if (!process.env.OPENAI_API_KEY) { console.error('❌ OPENAI_API_KEY não configurada no .env!'); process.exit(1); }

    setInterval(() => { try { salvarDatabase(); } catch (_) {} }, 5 * 60 * 1000);
});

// Shutdown gracioso
async function shutdown(signal) {
    console.log(`\n⚠️  Recebido sinal ${signal}. Encerrando servidor...`);
    try { salvarDatabase(); console.log('✅ Banco de dados salvo.'); } catch (e) { console.error('❌ Erro ao salvar:', e); }
    process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGUSR2', () => shutdown('SIGUSR2'));
