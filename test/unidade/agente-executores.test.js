// Executores do agente (tool-calling) que não dependem de io — regras de
// negócio que os evals cobrem por cima com a API real, aqui cobertas de graça.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { EXECUTORES } = require('../../src/application/agente/AgenteDeVendas');

const ctx = (leadData) => ({ leadData, agora: '2026-08-13T12:00:00.000Z' });

describe('AgenteDeVendas — registrar_dados', () => {
    it('quantidade abaixo do mínimo (<25) não avança: zera e sinaliza avisarMinimo', async () => {
        const lead = {};
        const r = await EXECUTORES.registrar_dados({ quantidade: 10 }, ctx(lead));
        expect(r.ok).toBe(true);
        expect(lead.quantidade).toBeNull();
        expect(lead.avisarMinimo).toBe(10);
        expect(r.avisos[0]).toContain('MÍNIMO');
    });

    it('quantidade válida limpa o aviso de mínimo', async () => {
        const lead = { avisarMinimo: 10 };
        await EXECUTORES.registrar_dados({ quantidade: 30 }, ctx(lead));
        expect(lead.quantidade).toBe(30);
        expect(lead.avisarMinimo).toBeNull();
    });

    it('troca de modelo: a última escolha vence', async () => {
        const lead = {};
        await EXECUTORES.registrar_dados({ modeloEscolhido: 'IB_DAD' }, ctx(lead));
        await EXECUTORES.registrar_dados({ modeloEscolhido: 'IB_TRUCK' }, ctx(lead));
        expect(lead.modeloEscolhido).toBe('IB_TRUCK');
    });

    it('nome não é sobrescrito depois de capturado', async () => {
        const lead = { nome: 'Carlos' };
        await EXECUTORES.registrar_dados({ nome: 'Outro' }, ctx(lead));
        expect(lead.nome).toBe('Carlos');
    });

    it('modelo sem regulador ganha "Não se aplica" automaticamente', async () => {
        const lead = {};
        await EXECUTORES.registrar_dados({ modeloEscolhido: 'IB_CHAP' }, ctx(lead));
        expect(lead.tipoRegulador).toBe('Não se aplica');
    });

    it('técnica é traduzida para o nome amigável', async () => {
        const lead = {};
        await EXECUTORES.registrar_dados({ tecnica: 'bordado3d' }, ctx(lead));
        expect(lead.tecnica).toBe('Bordado 3D');
    });
});

describe('AgenteDeVendas — iniciar_novo_pedido', () => {
    it('reabre a qualificação preservando o nome e marcando recorrência', async () => {
        const lead = {
            nome: 'Carlos', finalizado: true, qualificacaoCompleta: true,
            quantidade: 50, modeloEscolhido: 'IB_TRUCK', tecnica: 'Bordado 3D', corPreferencia: 'preto'
        };
        const r = await EXECUTORES.iniciar_novo_pedido({}, ctx(lead));
        expect(r.ok).toBe(true);
        expect(lead.nome).toBe('Carlos');
        expect(lead.finalizado).toBe(false);
        expect(lead.clienteRecorrente).toBe(true);
        expect(lead.quantidade).toBeUndefined();
        expect(lead.modeloEscolhido).toBeUndefined();
    });
});

describe('AgenteDeVendas — consultar_preco', () => {
    it('sem modelo definido devolve ok:false com orientação (não inventa preço)', async () => {
        const r = await EXECUTORES.consultar_preco({}, ctx({}));
        expect(r.ok).toBe(false);
        expect(r.motivo).toContain('Modelo');
    });

    it('com modelo e material devolve o preço REAL da tabela', async () => {
        const lead = { modeloEscolhido: 'IB_TRUCK', quantidade: 50, material: 'supercap' };
        const r = await EXECUTORES.consultar_preco({}, ctx(lead));
        expect(r.ok).toBe(true);
        expect(r.precoReal).toContain('R$ 15,99/unidade');
    });
});
