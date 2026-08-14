// =============================================================
//  TESTE DOURADO — o turno completo, ponta a ponta, com fakes.
//  Cobre o caso de uso que orquestra a conversa (ProcessarMensagemRecebida)
//  nos DOIS núcleos: fluxo legado (state machine) e modo agente.
//  Os evals cobrem a QUALIDADE das respostas da IA real; este teste cobre
//  a MECÂNICA (guards, transbordo, persistência, notificação, locks).
// =============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { montarSistema, turno } from '../apoio/fakes.js';

const CHAT = '5584900000000';
const setTimeoutReal = globalThis.setTimeout;

beforeEach(() => {
    // Neutraliza os atrasos de "digitação"/envio de fotos (1-2s) sem tocar
    // no timeout de 60s do lock de processamento.
    vi.stubGlobal('setTimeout', (fn, ms, ...args) => setTimeoutReal(fn, ms >= 5000 ? ms : 0, ...args));
});
afterEach(() => { vi.unstubAllGlobals(); });

// -------------------------------------------------------------
//  FLUXO LEGADO (state machine) — AGENT_MODE=false (padrão)
// -------------------------------------------------------------
describe('fluxo legado — qualificação', () => {
    it('primeira mensagem: extrai o nome, responde e persiste o estado', async () => {
        const s = montarSistema();
        s.ia.estado.filaExtracao = [{ nome: 'Carlos' }];
        s.ia.estado.filaResposta = ['Oi Carlos! Como posso ajudar?'];

        await s.atendimento.processarMensagem(turno({ texto: 'Oi, sou o Carlos' }));

        const lead = s.repositorio.leads.get(CHAT);
        expect(lead.nome).toBe('Carlos');
        expect(s.canal.log.textos()).toContain('Oi Carlos!');
        // Histórico registra os dois lados do turno
        expect(lead.conversationHistory).toHaveLength(2);
        expect(lead.conversationHistory[0]).toEqual({ role: 'user', content: 'Oi, sou o Carlos' });
    });

    it('nome do contato do ChatClean é aproveitado quando ainda não temos nome', async () => {
        const s = montarSistema();
        await s.atendimento.processarMensagem(turno({ texto: 'oi', nomeContato: 'Ana' }));
        expect(s.repositorio.leads.get(CHAT).nome).toBe('Ana');
    });

    it('GUARD do pedido mínimo: abaixo de 25 un. zera a quantidade e sinaliza', async () => {
        const s = montarSistema();
        s.ia.estado.filaExtracao = [{ nome: 'Ana', tipoAtendimento: 'compra', quantidade: 10 }];

        await s.atendimento.processarMensagem(turno({ texto: 'quero 10 bonés' }));

        const lead = s.repositorio.leads.get(CHAT);
        expect(lead.quantidade).toBeNull();
        expect(lead.avisarMinimo).toBe(10);
        expect(lead.finalizado).toBeUndefined();
        expect(s.canal.log.notificacoes).toHaveLength(0);
    });

    it('cliente ajusta para quantidade válida: o aviso de mínimo é limpo', async () => {
        const s = montarSistema();
        s.ia.estado.filaExtracao = [{ nome: 'Ana', tipoAtendimento: 'compra', quantidade: 10 }, { quantidade: 30 }];

        await s.atendimento.processarMensagem(turno({ texto: 'quero 10' }));
        await s.atendimento.processarMensagem(turno({ texto: 'pode ser 30 então' }));

        const lead = s.repositorio.leads.get(CHAT);
        expect(lead.quantidade).toBe(30);
        expect(lead.avisarMinimo).toBeNull();
    });

    it('TRANSBORDO: acima de 100 un. transfere e notifica a equipe com a tag', async () => {
        const s = montarSistema();
        s.ia.estado.filaExtracao = [{ nome: 'Marina', tipoAtendimento: 'compra', quantidade: 500, usoEvento: 'evento' }];

        await s.atendimento.processarMensagem(turno({ texto: 'preciso de 500 bonés' }));

        const lead = s.repositorio.leads.get(CHAT);
        expect(lead.finalizado).toBe(true);
        expect(s.canal.log.notificacoes[0].opcoes.tagExtra).toBe('Transbordo+100');
        expect(s.canal.log.textos()).toContain('Transferir para o departamento Comercial');
    });

    it('qualificação completa: finaliza, notifica, grava lead e memória de recompra', async () => {
        const s = montarSistema();
        s.repositorio.leads.set(CHAT, {
            conversationHistory: [], nome: 'Carlos', tipoAtendimento: 'compra',
            quantidade: 50, usoEvento: 'uniforme', prazoRecebimento: '30 dias',
            modeloEscolhido: 'IB_TRUCK', temArte: 'enviou', tecnica: 'Bordado 3D',
            tipoRegulador: 'Padrão Plástico'
        });
        s.ia.estado.filaExtracao = [{ corPreferencia: 'preto' }];

        await s.atendimento.processarMensagem(turno({ texto: 'pode ser preto' }));

        const lead = s.repositorio.leads.get(CHAT);
        expect(lead.finalizado).toBe(true);
        expect(lead.qualificacaoCompleta).toBe(true);
        expect(s.canal.log.notificacoes).toHaveLength(1);
        expect(s.repositorio.finalizados).toHaveLength(1);
        // Fase 4 — memória durável do cliente para recompra
        const cliente = s.repositorio.clientes.get(CHAT);
        expect(cliente.totalPedidos).toBe(1);
        expect(cliente.pedidos[0]).toMatchObject({ codigo: 'IB_TRUCK', quantidade: 50, corPreferencia: 'preto' });
    });

    it('pedido já encaminhado: responde a dúvida sem refazer a qualificação', async () => {
        const s = montarSistema();
        s.repositorio.leads.set(CHAT, { conversationHistory: [], nome: 'Carlos', finalizado: true, quantidade: 50 });

        await s.atendimento.processarMensagem(turno({ texto: 'qual era o prazo mesmo?' }));

        expect(s.canal.log.textos()).toContain('já está com o consultor');
        expect(s.ia.estado.chamadas.extracoes).toHaveLength(0); // não reentrou no funil
        expect(s.repositorio.leads.get(CHAT).finalizado).toBe(true);
    });

    it('/reset apaga a conversa e não a regrava', async () => {
        const s = montarSistema();
        s.repositorio.leads.set(CHAT, { conversationHistory: [], nome: 'Carlos', quantidade: 50 });

        await s.atendimento.processarMensagem(turno({ texto: '/reset' }));

        expect(s.repositorio.leads.has(CHAT)).toBe(false);
        expect(s.canal.log.textos()).toContain('Conversa resetada');
    });
});

describe('fluxo legado — mídia', () => {
    it('áudio é transcrito e vira o texto do turno', async () => {
        const s = montarSistema();
        s.ia.estado.transcricao = 'quero 40 bonés pro meu time';
        s.ia.estado.filaExtracao = [{ nome: 'Marcos', tipoAtendimento: 'compra', quantidade: 40 }];

        await s.atendimento.processarMensagem(turno({ texto: '', tipo: 'ptt', mediaUrl: 'https://x/a.ogg' }));

        expect(s.ia.estado.chamadas.extracoes[0].mensagem).toBe('quero 40 bonés pro meu time');
        expect(s.repositorio.leads.get(CHAT).quantidade).toBe(40);
    });

    it('falha na transcrição pede para digitar, sem quebrar o turno', async () => {
        const s = montarSistema();
        s.ia.estado.falharTranscricao = true;

        await s.atendimento.processarMensagem(turno({ texto: '', tipo: 'audio', mediaUrl: 'https://x/a.ogg' }));

        expect(s.canal.log.textos()).toContain('não consegui entender seu áudio');
        expect(s.ia.estado.chamadas.extracoes).toHaveLength(0);
    });

    it('imagem: guarda a logo e a descrição da visão no estado', async () => {
        const s = montarSistema();

        await s.atendimento.processarMensagem(turno({ texto: '', tipo: 'image', mediaUrl: 'https://x/logo.png' }));

        const lead = s.repositorio.leads.get(CHAT);
        expect(lead.logoUrl).toBe('https://x/logo.png');
        expect(lead.conversationHistory[0].content).toContain('FC Águias');
    });

    it('arte enviada com modelo escolhido: reconhece e leva para as técnicas', async () => {
        const s = montarSistema();
        s.repositorio.leads.set(CHAT, {
            conversationHistory: [], nome: 'Léo', tipoAtendimento: 'compra',
            quantidade: 40, usoEvento: 'marca', prazoRecebimento: '30 dias', modeloEscolhido: 'IB_TRUCK'
        });

        await s.atendimento.processarMensagem(turno({ texto: '', tipo: 'image', mediaUrl: 'https://x/logo.png' }));

        const lead = s.repositorio.leads.get(CHAT);
        expect(lead.temArte).toBe('enviou');
        expect(s.canal.log.textos()).toContain('Recebi sua arte');
        expect(s.canal.log.imagens.length).toBeGreaterThan(0); // fotos das técnicas
    });

    it('mockup sob demanda: gera a prévia quando há logo e modelo', async () => {
        const s = montarSistema();
        s.repositorio.leads.set(CHAT, {
            conversationHistory: [], nome: 'Léo', tipoAtendimento: 'compra', quantidade: 40,
            usoEvento: 'marca', modeloEscolhido: 'IB_TRUCK', logoUrl: 'https://x/logo.png'
        });
        s.ia.estado.filaExtracao = [{ querMockup: true }];

        await s.atendimento.processarMensagem(turno({ texto: 'como fica no boné?' }));

        expect(s.ia.estado.chamadas.mockups).toBe(1);
    });
});

describe('fluxo legado — robustez', () => {
    it('extração falha (null): o turno segue sem quebrar', async () => {
        const s = montarSistema();
        s.ia.estado.erroNaExtracao = true;

        await s.atendimento.processarMensagem(turno({ texto: 'mensagem qualquer' }));

        expect(s.repositorio.leads.has(CHAT)).toBe(true);
        expect(s.canal.log.mensagens.length).toBeGreaterThan(0);
    });

    it('lock: segunda mensagem simultânea do mesmo contato é ignorada', async () => {
        const s = montarSistema();
        let liberar;
        s.ia.estado.filaExtracao = [{ nome: 'Ana' }, { nome: 'Outro' }];
        // Segura a primeira execução dentro do lock
        const originalExtrair = s.deps.extrator.extrair;
        s.deps.extrator.extrair = async (...args) => {
            await new Promise(r => { liberar = r; });
            return originalExtrair(...args);
        };

        const p1 = s.atendimento.processarMensagem(turno({ texto: 'primeira' }));
        await new Promise(r => setTimeoutReal(r, 10));
        expect(s.atendimento.estaProcessando(CHAT)).toBe(true);
        await s.atendimento.processarMensagem(turno({ texto: 'segunda' })); // deve sair na hora
        liberar();
        await p1;

        // Só a primeira mensagem foi processada
        expect(s.ia.estado.chamadas.extracoes).toHaveLength(1);
    });

    it('tipo não suportado recebe fallback humanizado', async () => {
        const s = montarSistema();
        await s.atendimento.responderTipoNaoSuportado(CHAT);
        expect(s.canal.log.textos()).toContain('Pode me mandar por texto');
    });

    it('IA fora do ar: o cliente NÃO fica no vácuo — recebe aviso de instabilidade', async () => {
        const s = montarSistema();
        s.deps.redator.redigir = async () => { throw new Error('429 no credits remaining'); };

        await s.atendimento.processarMensagem(turno({ texto: 'quero um orçamento' }));

        expect(s.canal.log.textos()).toContain('instabilidade');
        expect(s.repositorio.leads.has(CHAT)).toBe(true); // estado preservado
    });

    it('IA fora do ar duas vezes seguidas: não repete o mesmo aviso', async () => {
        const s = montarSistema();
        s.deps.redator.redigir = async () => { throw new Error('timeout'); };

        await s.atendimento.processarMensagem(turno({ texto: 'oi' }));
        await s.atendimento.processarMensagem(turno({ texto: 'alô?' }));

        const avisos = s.canal.log.mensagens.filter(m => m.texto.includes('instabilidade'));
        expect(avisos).toHaveLength(1);
    });

    it('agente fora do ar também avisa o cliente', async () => {
        const s = montarSistema({ env: { AGENT_MODE: 'true' } });
        s.deps.agente.rodarAgente = async () => { throw new Error('openai indisponível'); };

        await s.atendimento.processarMensagem(turno({ texto: 'quero bonés' }));

        expect(s.canal.log.textos()).toContain('instabilidade');
    });

    it('histórico é truncado mesmo nos retornos antecipados (pós-pedido)', async () => {
        const s = montarSistema();
        const historicoLongo = Array.from({ length: 130 }, (_, i) => ({ role: 'user', content: `m${i}` }));
        s.repositorio.leads.set(CHAT, { conversationHistory: historicoLongo, nome: 'Carlos', finalizado: true });

        await s.atendimento.processarMensagem(turno({ texto: 'qual o prazo?' }));

        expect(s.repositorio.leads.get(CHAT).conversationHistory).toHaveLength(100);
    });

    it('temTurnosEmAndamento reflete o lock (usado pelo shutdown gracioso)', async () => {
        const s = montarSistema();
        expect(s.atendimento.temTurnosEmAndamento()).toBe(false);
        let liberar;
        s.deps.extrator.extrair = async () => { await new Promise(r => { liberar = r; }); return {}; };

        const p = s.atendimento.processarMensagem(turno({ texto: 'oi' }));
        await new Promise(r => setTimeoutReal(r, 10));
        expect(s.atendimento.temTurnosEmAndamento()).toBe(true);
        liberar();
        await p;
        expect(s.atendimento.temTurnosEmAndamento()).toBe(false);
    });
});

// -------------------------------------------------------------
//  MODO AGENTE (tool-calling) — AGENT_MODE=true
// -------------------------------------------------------------
describe('modo agente', () => {
    const ENV_AGENTE = { AGENT_MODE: 'true' };

    it('delega ao agente, envia a resposta e registra o histórico', async () => {
        const s = montarSistema({ env: ENV_AGENTE });
        s.ia.estado.respostaDoAgente = 'Claro! Quantas unidades você precisa?';

        await s.atendimento.processarMensagem(turno({ texto: 'quero fazer bonés' }));

        expect(s.ia.estado.chamadas.agente).toEqual(['quero fazer bonés']);
        expect(s.canal.log.textos()).toContain('Quantas unidades');
        expect(s.repositorio.leads.get(CHAT).conversationHistory).toHaveLength(2);
        // Extrator/redator do fluxo legado NÃO são usados no modo agente
        expect(s.ia.estado.chamadas.extracoes).toHaveLength(0);
        expect(s.ia.estado.chamadas.respostas).toHaveLength(0);
    });

    it('cliente com pedido finalizado continua passando pelo agente (recompra)', async () => {
        const s = montarSistema({ env: ENV_AGENTE });
        s.repositorio.leads.set(CHAT, { conversationHistory: [], nome: 'Carlos', finalizado: true });

        await s.atendimento.processarMensagem(turno({ texto: 'quero fazer outro pedido' }));

        expect(s.ia.estado.chamadas.agente).toHaveLength(1);
    });

    it('memória de cliente é lida e passada ao agente como contexto', async () => {
        const s = montarSistema({ env: ENV_AGENTE });
        await s.repositorio.repositorio.registrarPedidoCliente(CHAT, {
            nome: 'Carlos', pedido: { data: '2026-05-10', codigo: 'IB_TRUCK', quantidade: 50 }
        });
        let contextoRecebido = null;
        s.deps.agente.rodarAgente = async ({ leadData, contexto }) => {
            contextoRecebido = contexto;
            return { resposta: 'Que bom te ver de novo, Carlos!', toolsChamadas: [], leadData };
        };

        await s.atendimento.processarMensagem(turno({ texto: 'oi, sou o Carlos de novo' }));

        expect(contextoRecebido.historico.totalPedidos).toBe(1);
        expect(contextoRecebido.historico.pedidos[0].codigo).toBe('IB_TRUCK');
    });

    it('quando o agente finaliza o lead, não agenda follow-up', async () => {
        const s = montarSistema({ env: ENV_AGENTE });
        s.ia.estado.efeitoDoAgente = (lead) => { lead.finalizado = true; };

        await s.atendimento.processarMensagem(turno({ texto: 'pode fechar!' }));

        const lead = s.repositorio.leads.get(CHAT);
        expect(lead.finalizado).toBe(true);
        expect(lead.followUpDueAt).toBeNull();
    });

    it('histórico é podado em 100 entradas', async () => {
        const s = montarSistema({ env: ENV_AGENTE });
        const historicoLongo = Array.from({ length: 120 }, (_, i) => ({ role: 'user', content: `m${i}` }));
        s.repositorio.leads.set(CHAT, { conversationHistory: historicoLongo });

        await s.atendimento.processarMensagem(turno({ texto: 'mais uma' }));

        expect(s.repositorio.leads.get(CHAT).conversationHistory).toHaveLength(100);
    });
});

// -------------------------------------------------------------
//  FOLLOW-UP DURÁVEL
// -------------------------------------------------------------
describe('follow-up de reativação', () => {
    it('turno não finalizado agenda o followUpDueAt (durável, no estado)', async () => {
        const s = montarSistema();
        s.ia.estado.filaExtracao = [{ nome: 'Ana' }];

        await s.atendimento.processarMensagem(turno({ texto: 'oi' }));

        const lead = s.repositorio.leads.get(CHAT);
        expect(lead.followUpDueAt).toBeGreaterThan(Date.now());
    });

    it('varredor dispara só os vencidos e não repete a mesma mensagem', async () => {
        const s = montarSistema();
        s.repositorio.leads.set(CHAT, {
            conversationHistory: [], nome: 'Ana', tipoAtendimento: 'compra',
            followUpDueAt: Date.now() - 1000
        });

        await s.reativacao.varrer();
        expect(s.canal.log.mensagens).toHaveLength(1);
        expect(s.repositorio.leads.get(CHAT).followUpDueAt).toBeNull();

        // Segunda varredura: nada vencido → nada enviado
        await s.reativacao.varrer();
        expect(s.canal.log.mensagens).toHaveLength(1);
    });

    it('lead finalizado nunca recebe reativação', async () => {
        const s = montarSistema();
        s.repositorio.leads.set(CHAT, {
            conversationHistory: [], nome: 'Ana', finalizado: true, followUpDueAt: Date.now() - 1000
        });

        await s.reativacao.varrer();

        expect(s.canal.log.mensagens).toHaveLength(0);
    });

    it('mensagem de reativação varia conforme o ponto do funil', async () => {
        const s = montarSistema();
        const msgArte = s.reativacao.montarMsgReativacao({
            conversationHistory: [], nome: 'Ana', tipoAtendimento: 'compra', quantidade: 50,
            usoEvento: 'uniforme', prazoRecebimento: '30 dias', modeloEscolhido: 'IB_TRUCK'
        });
        expect(msgArte).toContain('arte');

        const msgModelo = s.reativacao.montarMsgReativacao({
            conversationHistory: [], nome: 'Ana', tipoAtendimento: 'compra', quantidade: 50,
            usoEvento: 'uniforme', prazoRecebimento: '30 dias'
        });
        expect(msgModelo).toContain('produtos que te enviei');
    });
});
