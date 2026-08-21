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
    // REGRESSÃO: o JID do WhatsApp pode trazer o id do aparelho depois de ':'
    // ("558491756446:24@s.whatsapp.net"). Sem cortar antes de limpar os
    // não-dígitos, o "24" grudava no telefone → push em 404 (ou, com sufixo de
    // 1 dígito, mensagem entregue para OUTRA pessoa).
    it('remove o sufixo de dispositivo do JID', () => {
        expect(normalizarPhone('558491756446:24@s.whatsapp.net')).toBe('558491756446');
        expect(normalizarPhone('558491756446:3@c.us')).toBe('558491756446');
        expect(normalizarPhone('5584994610845@s.whatsapp.net')).toBe('5584994610845');
        expect(normalizarPhone('558491756446:24')).toBe('558491756446');
    });

    it('nunca devolve mais dígitos do que o número real tem', () => {
        for (const jid of ['558491756446:24@s.whatsapp.net', '558491756446:1@c.us', '558491756446:245@s.whatsapp.net']) {
            expect(normalizarPhone(jid)).toHaveLength(12);
        }
    });

    it('entrada vazia/nula não quebra', () => {
        expect(normalizarPhone(null)).toBe('');
        expect(normalizarPhone(undefined)).toBe('');
        expect(normalizarPhone('')).toBe('');
    });

    it('allow-list continua casando com o número que veio com sufixo', () => {
        expect(contatoPermitido('5584994610845:24@s.whatsapp.net', ['558494610845'])).toBe(true);
    });
});
