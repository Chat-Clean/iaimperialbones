import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { validar, avisos } = require('../../src/main/config');

const MINIMO = { OPENAI_API_KEY: 'sk-teste' };

describe('config', () => {
    it('aplica os padrões documentados', () => {
        const r = validar(MINIMO);
        expect(r.ok).toBe(true);
        expect(r.config.PORT).toBe(3000);
        expect(r.config.AGENT_MODE).toBe(false);
        expect(r.config.AGENT_MODEL).toBe('gpt-4o');
        expect(r.config.MOCKUP_ENABLED).toBe(true);
        expect(r.config.REDIS_PREFIX).toBe('imperialbones');
        expect(r.config.IA_ALLOWED_CONTACTS).toEqual([]);
    });

    it('sem OPENAI_API_KEY não sobe, e a mensagem nomeia a variável', () => {
        const r = validar({});
        expect(r.ok).toBe(false);
        expect(r.mensagem).toContain('OPENAI_API_KEY');
    });

    it('PORT inválida falha com o valor recebido na mensagem', () => {
        const r = validar({ ...MINIMO, PORT: 'abc' });
        expect(r.ok).toBe(false);
        expect(r.mensagem).toContain('PORT');
        expect(r.mensagem).toContain('"abc"');
    });

    it('booleans preservam a semântica do legado', () => {
        expect(validar({ ...MINIMO, AGENT_MODE: 'true' }).config.AGENT_MODE).toBe(true);
        expect(validar({ ...MINIMO, AGENT_MODE: '1' }).config.AGENT_MODE).toBe(false);   // só 'true' liga
        expect(validar({ ...MINIMO, MOCKUP_ENABLED: 'false' }).config.MOCKUP_ENABLED).toBe(false);
        expect(validar({ ...MINIMO, MOCKUP_ENABLED: 'qualquer' }).config.MOCKUP_ENABLED).toBe(true); // ≠ 'false' liga
    });

    it('IA_ALLOWED_CONTACTS vira lista limpa', () => {
        const r = validar({ ...MINIMO, IA_ALLOWED_CONTACTS: ' 5584991112222 , 558494610845 ,, ' });
        expect(r.config.IA_ALLOWED_CONTACTS).toEqual(['5584991112222', '558494610845']);
    });

    it('NODE_ENV=production EXIGE webhook secret forte e push url (fail-closed)', () => {
        const semSegredo = validar({ ...MINIMO, NODE_ENV: 'production', CC_PUSH_URL: 'https://x/push' });
        expect(semSegredo.ok).toBe(false);
        expect(semSegredo.mensagem).toContain('WEBHOOK_SECRET');

        const segredoCurto = validar({ ...MINIMO, NODE_ENV: 'production', CC_PUSH_URL: 'https://x/push', WEBHOOK_SECRET: 'curto' });
        expect(segredoCurto.ok).toBe(false);

        const semPush = validar({ ...MINIMO, NODE_ENV: 'production', WEBHOOK_SECRET: 'x'.repeat(32) });
        expect(semPush.ok).toBe(false);
        expect(semPush.mensagem).toContain('CC_PUSH_URL');

        const completo = validar({ ...MINIMO, NODE_ENV: 'production', CC_PUSH_URL: 'https://x/push', WEBHOOK_SECRET: 'x'.repeat(32) });
        expect(completo.ok).toBe(true);
        expect(completo.config.ehProducao).toBe(true);
    });

    it('fora de produção o boot é permissivo (dev/local sem segredo)', () => {
        const r = validar(MINIMO);
        expect(r.ok).toBe(true);
        expect(r.config.ehProducao).toBe(false);
    });

    it('rate-limit por contato tem padrão e valida a faixa', () => {
        expect(validar(MINIMO).config.RATE_LIMIT_POR_CONTATO).toBe(20);
        expect(validar({ ...MINIMO, RATE_LIMIT_POR_CONTATO: '5' }).config.RATE_LIMIT_POR_CONTATO).toBe(5);
        expect(validar({ ...MINIMO, RATE_LIMIT_POR_CONTATO: '0' }).ok).toBe(false);
    });

    it('avisos apontam o que falta sem impedir o boot', () => {
        const { config } = validar(MINIMO);
        const lista = avisos(config);
        expect(lista.join(' ')).toContain('CC_PUSH_URL');
        expect(lista.join(' ')).toContain('REDIS_URL');
        expect(lista.join(' ')).toContain('ADMIN_KEY');
        expect(lista.join(' ')).toContain('IA_ALLOWED_CONTACTS');
    });
});
