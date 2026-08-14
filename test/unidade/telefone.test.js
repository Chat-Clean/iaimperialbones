import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { normalizarPhone, nucleoNumero, contatoPermitido } = require('../../src/shared/telefone');

describe('telefone', () => {
    it('normalizarPhone remove tudo que não é dígito', () => {
        expect(normalizarPhone('+55 (84) 99461-0845')).toBe('5584994610845');
    });

    it('nucleoNumero iguala número com e sem o 9º dígito', () => {
        expect(nucleoNumero('5584994610845')).toBe(nucleoNumero('558494610845'));
    });

    it('contatoPermitido: lista vazia libera todos; lista casa tolerante ao 9º dígito', () => {
        expect(contatoPermitido('5584994610845', [])).toBe(true);
        expect(contatoPermitido('5584994610845', ['558494610845'])).toBe(true);
        expect(contatoPermitido('5584990000000', ['558494610845'])).toBe(false);
    });
});
