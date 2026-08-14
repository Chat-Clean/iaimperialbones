import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
    criarAutenticacao, criarControleDeIdempotencia,
    criarGuardaAdministrativa, criarControleDeVazao
} = require('../../src/infrastructure/http/protecoes');

const req = (headers = {}, query = {}) => ({ headers, query });
function respostaFalsa() {
    const r = { codigo: null, corpo: null };
    r.status = (c) => { r.codigo = c; return r; };
    r.json = (b) => { r.corpo = b; return r; };
    return r;
}

describe('autenticação do webhook', () => {
    it('sem segredo configurado, tudo passa', () => {
        expect(criarAutenticacao('').autenticar(req())).toBe(true);
    });

    it('aceita o token certo por header próprio e por Bearer', () => {
        const a = criarAutenticacao('segredo-super-secreto');
        expect(a.autenticar(req({ 'x-webhook-token': 'segredo-super-secreto' }))).toBe(true);
        expect(a.autenticar(req({ authorization: 'Bearer segredo-super-secreto' }))).toBe(true);
    });

    it('rejeita token errado, vazio ou de tamanho diferente', () => {
        const a = criarAutenticacao('segredo-super-secreto');
        expect(a.autenticar(req({ 'x-webhook-token': 'errado' }))).toBe(false);
        expect(a.autenticar(req())).toBe(false);
        expect(a.autenticar(req({ 'x-webhook-token': 'segredo-super-secreto-e-mais' }))).toBe(false);
    });
});

describe('guarda administrativa (/analytics)', () => {
    it('FAIL-CLOSED: sem ADMIN_KEY responde 503 e bloqueia', () => {
        const res = respostaFalsa();
        expect(criarGuardaAdministrativa('').checar(req(), res)).toBe(false);
        expect(res.codigo).toBe(503);
    });

    it('sem chave na requisição responde 401', () => {
        const res = respostaFalsa();
        expect(criarGuardaAdministrativa('chave-admin').checar(req(), res)).toBe(false);
        expect(res.codigo).toBe(401);
    });

    it('libera com a chave certa (header ou query)', () => {
        const g = criarGuardaAdministrativa('chave-admin');
        expect(g.checar(req({ 'x-admin-key': 'chave-admin' }), respostaFalsa())).toBe(true);
        expect(g.checar(req({}, { key: 'chave-admin' }), respostaFalsa())).toBe(true);
    });
});

describe('idempotência', () => {
    it('a mesma mensagem só passa uma vez; sem id sempre passa', () => {
        const i = criarControleDeIdempotencia();
        expect(i.jaProcessada('m1')).toBe(false);
        expect(i.jaProcessada('m1')).toBe(true);
        expect(i.jaProcessada(null)).toBe(false);
        expect(i.jaProcessada(null)).toBe(false);
    });

    it('poda quando passa da capacidade, sem crescer sem limite', () => {
        const i = criarControleDeIdempotencia({ capacidade: 10, descarte: 5 });
        for (let n = 0; n < 30; n++) i.jaProcessada(`m${n}`);
        expect(i.jaProcessada('m29')).toBe(true);  // recentes continuam lá
        expect(i.jaProcessada('m0')).toBe(false);  // antigos foram descartados
    });
});

describe('controle de vazão por contato', () => {
    it('libera até o limite e barra o excedente', () => {
        const v = criarControleDeVazao({ limite: 3, janelaMs: 60000 });
        const agora = 1_000_000;
        expect(v.excedeu('55849', agora)).toBe(false);
        expect(v.excedeu('55849', agora)).toBe(false);
        expect(v.excedeu('55849', agora)).toBe(false);
        expect(v.excedeu('55849', agora)).toBe(true);
    });

    it('a janela desliza: passado o tempo, o contato volta a ser atendido', () => {
        const v = criarControleDeVazao({ limite: 2, janelaMs: 60000 });
        const t0 = 1_000_000;
        v.excedeu('55849', t0);
        v.excedeu('55849', t0);
        expect(v.excedeu('55849', t0)).toBe(true);
        expect(v.excedeu('55849', t0 + 61000)).toBe(false);
    });

    it('contatos diferentes não interferem entre si', () => {
        const v = criarControleDeVazao({ limite: 1, janelaMs: 60000 });
        expect(v.excedeu('A', 1000)).toBe(false);
        expect(v.excedeu('B', 1000)).toBe(false);
        expect(v.excedeu('A', 1000)).toBe(true);
    });
});
