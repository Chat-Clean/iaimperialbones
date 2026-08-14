// =============================================================
//  FAKES PARA OS TESTES DE INTEGRAÇÃO ("teste dourado")
//  Princípio: fakes, não mocks de verificação. As asserções olham o
//  RESULTADO (mensagem enviada, estado salvo, equipe notificada), não
//  "esta função foi chamada".
// =============================================================
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requireDaRaiz = createRequire(path.join(raiz, 'index.js'));

const ProcessarMensagemRecebida = requireDaRaiz('./src/application/casos-de-uso/ProcessarMensagemRecebida');
const Reativacao = requireDaRaiz('./src/application/followup/Reativacao');
const { validar } = requireDaRaiz('./src/main/config');

// -------------------------------------------------------------
//  Canal + notificador (mesmo objeto, capacidades distintas)
// -------------------------------------------------------------
export function criarCanalFake() {
    const log = { mensagens: [], imagens: [], notificacoes: [] };
    const canal = {
        async enviarMensagem(chatId, texto) { log.mensagens.push({ chatId, texto }); return true; },
        async enviarMensagensQuebradas(chatId, texto) { log.mensagens.push({ chatId, texto }); },
        async enviarImagens(chatId, arquivos, legenda = '') { log.imagens.push({ chatId, arquivos, legenda }); return true; },
        async notificarEquipe(leadData, chatId, opcoes = {}) { log.notificacoes.push({ chatId, nome: leadData.nome, opcoes }); return true; }
    };
    // Textos concatenados, para asserções de conteúdo
    log.textos = () => log.mensagens.map(m => m.texto).join(' \n ');
    return { canal, log };
}

// -------------------------------------------------------------
//  Repositório em memória, com clone (evita alias acidental)
// -------------------------------------------------------------
export function criarRepositorioFake() {
    const leads = new Map();
    const clientes = new Map();
    const finalizados = [];
    const clonar = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

    const repositorio = {
        ehDuravel: () => false,
        async buscarLead(chatId) { return clonar(leads.get(chatId)) || null; },
        async salvarLead(chatId, leadData) { leads.set(chatId, clonar(leadData)); },
        async removerLead(chatId) { leads.delete(chatId); },
        async listarIds() { return [...leads.keys()]; },
        async registrarLeadFinalizado(registro) { finalizados.push(clonar(registro)); },
        async buscarCliente(chatId) { return clonar(clientes.get(chatId)) || null; },
        async registrarPedidoCliente(chatId, { nome, pedido } = {}) {
            const rec = clientes.get(chatId) || { chatId, nome: null, totalPedidos: 0, pedidos: [] };
            if (nome && !rec.nome) rec.nome = nome;
            if (pedido) { rec.pedidos.push(pedido); rec.ultimoPedido = pedido.data; }
            rec.totalPedidos = rec.pedidos.length;
            clientes.set(chatId, rec);
            return rec;
        }
    };
    return { repositorio, leads, clientes, finalizados };
}

// -------------------------------------------------------------
//  IA fake: extrator, redator, visão, transcrição, mockup, agente.
//  Um estado único — do ponto de vista do teste, "é o que a IA respondeu".
// -------------------------------------------------------------
export function criarIaFake() {
    const estado = {
        filaExtracao: [],        // objetos devolvidos por extrair(), na ordem
        filaResposta: [],        // textos devolvidos por redigir(), na ordem
        descricaoImagem: 'Logo com o texto "FC Águias", escudo azul e branco.',
        transcricao: 'quero 50 bonés pra equipe',
        falharTranscricao: false,
        erroNaExtracao: false,
        mockupOk: true,
        chamadas: { extracoes: [], respostas: [], mockups: 0, agente: [] },
        // Modo agente: efeito aplicado ao leadData a cada turno (simula as tools)
        efeitoDoAgente: null,
        respostaDoAgente: 'Certo! Me conta mais sobre o que você precisa.'
    };

    const extrator = {
        async extrair(mensagem, campoAtual, historico, modelosEnviados) {
            estado.chamadas.extracoes.push({ mensagem, campoAtual, modelosEnviados });
            if (estado.erroNaExtracao) return null;
            return estado.filaExtracao.shift() || {};
        }
    };

    const redator = {
        async redigir(ctx) {
            estado.chamadas.respostas.push(ctx);
            // Espelha os curto-circuitos determinísticos do adapter real
            if (ctx.imagensForamEnviadas && ['modeloEscolhido', 'tecnica', 'tipoRegulador'].includes(ctx.proximoCampo?.campo)) return null;
            return estado.filaResposta.shift() || 'Resposta padrão da IA.';
        },
        async redigirPosPedido() { return 'Seu pedido já está com o consultor! 😊'; },
        async redigirAckImagem() { return 'Recebi sua arte! Vou te mostrar as técnicas. ✨'; }
    };

    const leitorDeImagem = { async descrever() { return estado.descricaoImagem; } };

    const transcritor = {
        async transcrever() {
            if (estado.falharTranscricao) throw new Error('whisper falhou');
            return estado.transcricao;
        }
    };

    const mockup = {
        async gerar() { estado.chamadas.mockups++; return estado.mockupOk; }
    };

    const baixadorDeMidia = { async baixar() { return Buffer.from('audio-falso'); } };

    const agente = {
        async rodarAgente({ leadData, mensagemCliente }) {
            estado.chamadas.agente.push(mensagemCliente);
            if (estado.efeitoDoAgente) estado.efeitoDoAgente(leadData);
            return { resposta: estado.respostaDoAgente, toolsChamadas: [], leadData };
        }
    };

    return { estado, extrator, redator, leitorDeImagem, transcritor, mockup, baixadorDeMidia, agente };
}

// -------------------------------------------------------------
//  Monta o sistema completo com fakes — mesma composição da produção,
//  só que sem I/O.
// -------------------------------------------------------------
export function montarSistema({ env = {} } = {}) {
    const resultado = validar({ OPENAI_API_KEY: 'sk-teste', ...env });
    if (!resultado.ok) throw new Error('configuração de teste inválida:\n' + resultado.mensagem);
    const config = resultado.config;

    const c = criarCanalFake();
    const r = criarRepositorioFake();
    const ia = criarIaFake();

    const deps = {
        raiz,
        canal: c.canal,
        notificador: c.canal,
        repositorio: r.repositorio,
        extrator: ia.extrator,
        redator: ia.redator,
        leitorDeImagem: ia.leitorDeImagem,
        transcritor: ia.transcritor,
        mockup: ia.mockup,
        baixadorDeMidia: ia.baixadorDeMidia,
        agente: ia.agente
    };

    const atendimento = ProcessarMensagemRecebida.criar(deps, config);
    const reativacao = Reativacao.criar({
        repositorio: r.repositorio,
        canal: c.canal,
        estaProcessando: (id) => atendimento.estaProcessando(id)
    });

    return { config, deps, atendimento, reativacao, canal: c, repositorio: r, ia };
}

// Payload já traduzido (o ACL tem testes próprios em tradutor-payload.test.js)
export function turno(over = {}) {
    return {
        chatId: '5584900000000',
        texto: 'oi',
        tipo: 'text',
        mediaBase64: null,
        mediaUrl: null,
        mediaMimetype: null,
        quotedText: null,
        nomeContato: '',
        ...over
    };
}
