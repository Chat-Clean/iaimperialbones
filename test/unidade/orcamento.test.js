import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const orcamento = require('../../src/domain/orcamento/MotorDeOrcamento');

describe('MotorDeOrcamento', () => {
    it('bandaIndex respeita as faixas da tabela', () => {
        expect(orcamento.bandaIndex(30)).toBe(0);
        expect(orcamento.bandaIndex(100)).toBe(0);
        expect(orcamento.bandaIndex(101)).toBe(1);
        expect(orcamento.bandaIndex(300)).toBe(1);
        expect(orcamento.bandaIndex(301)).toBe(2);
        expect(orcamento.bandaIndex(499)).toBe(2);
        expect(orcamento.bandaIndex(500)).toBe(3);
        expect(orcamento.bandaIndex(1000)).toBe(3);
        expect(orcamento.bandaIndex(1001)).toBe(4);
    });

    it('material conhecido crava preço EXATO (linha única, sem range)', () => {
        const ctx = orcamento.contextoPreco('IB_TRUCK', 50, 'Trucker', 'supercap');
        expect(ctx).toContain('R$ 15,99/unidade');
        expect(ctx).not.toContain(' a R$');
    });

    it('sem material o preço vem como faixa (varia conforme o material)', () => {
        const ctx = orcamento.contextoPreco('IB_TRUCK', 50, 'Trucker');
        expect(ctx).toMatch(/de R\$ .+ a R\$ .+\/unidade/);
    });

    it('modelo sem linhas na tabela devolve null', () => {
        expect(orcamento.contextoPreco('IB_INEXISTENTE', 50, 'X')).toBeNull();
    });

    it('preço do trucker oxford na faixa 30-100 é o da tabela (R$ 13,99)', () => {
        const ctx = orcamento.contextoPreco('IB_TRUCK', 80, 'Trucker', 'oxford');
        expect(ctx).toContain('R$ 13,99/unidade');
    });
});
