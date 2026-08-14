import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const Funil = require('../../src/domain/atendimento/Funil');

describe('Funil de qualificação', () => {
    it('pede os campos na ordem do fluxo (nome → tipo → quantidade → ...)', () => {
        const lead = { conversationHistory: [] };
        expect(Funil.determinarProximoCampo(lead).campo).toBe('nome');
        lead.nome = 'Ana';
        expect(Funil.determinarProximoCampo(lead).campo).toBe('tipoAtendimento');
        lead.tipoAtendimento = 'compra';
        expect(Funil.determinarProximoCampo(lead).campo).toBe('quantidade');
        lead.quantidade = 50;
        expect(Funil.determinarProximoCampo(lead).campo).toBe('usoEvento');
        lead.usoEvento = 'uniforme';
        expect(Funil.determinarProximoCampo(lead).campo).toBe('prazoRecebimento');
    });

    it('modelo sem regulador pula a etapa do regulador (efeito colateral herdado)', () => {
        const lead = {
            conversationHistory: [], nome: 'Ana', tipoAtendimento: 'compra',
            quantidade: 50, usoEvento: 'uniforme', prazoRecebimento: 'sem pressa',
            modeloEscolhido: 'IB_CHAP', temArte: 'enviou', tecnica: 'Bordado 3D'
        };
        const proximo = Funil.determinarProximoCampo(lead);
        expect(proximo.campo).toBe('corPreferencia');
        expect(lead.tipoRegulador).toBe('Não se aplica');
    });

    it('qualificação completa marca qualificacaoCompleta e devolve null (efeito herdado)', () => {
        const lead = {
            conversationHistory: [], nome: 'Ana', tipoAtendimento: 'compra',
            quantidade: 50, usoEvento: 'uniforme', prazoRecebimento: 'sem pressa',
            modeloEscolhido: 'IB_TRUCK', temArte: 'enviou', tecnica: 'Bordado 3D',
            tipoRegulador: 'Padrão Plástico', corPreferencia: 'preto'
        };
        expect(Funil.determinarProximoCampo(lead)).toBeNull();
        expect(lead.qualificacaoCompleta).toBe(true);
    });

    it('estagioDoLead deriva o estágio mais avançado dos campos', () => {
        expect(Funil.estagioDoLead(null)).toBe('contato');
        expect(Funil.estagioDoLead({ quantidade: 50, usoEvento: 'evento' })).toBe('qualificando');
        expect(Funil.estagioDoLead({ modeloEscolhido: 'IB_TRUCK' })).toBe('modelo');
        expect(Funil.estagioDoLead({ tecnica: 'Silk 3D' })).toBe('tecnica');
        expect(Funil.estagioDoLead({ corPreferencia: 'preto' })).toBe('cor');
        expect(Funil.estagioDoLead({ finalizado: true })).toBe('finalizado');
    });

    it('marcarEtapa nunca regride a etapa do funil', () => {
        const lead = {};
        Funil.marcarEtapa(lead, 'modelo', 't1');
        Funil.marcarEtapa(lead, 'contato', 't2');
        expect(lead.etapaFunil).toBe('modelo');
        expect(lead.etapas.contato).toBe('t2'); // carimba o timestamp mesmo assim
    });
});
