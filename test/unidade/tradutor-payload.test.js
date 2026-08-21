// Testes de CARACTERIZAÇÃO do ACL: congelam o comportamento do parse
// legado (parsePayload do index.js antigo) na nova casa.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { traduzir } = require('../../src/infrastructure/chatclean/acl/tradutor');
const { MOTIVOS } = require('../../src/domain/mensageria/MotivoDeDescarte');

describe('ACL — tradutor de payload do ChatClean', () => {
    it('formato aninhado: extrai telefone de message.raw.Info.SenderAlt', () => {
        const r = traduzir({
            message: {
                id: 'abc123', body: 'Oi, quero bonés', type: 'chat',
                raw: { Info: { SenderAlt: '558494610845@s.whatsapp.net', PushName: 'Carlos' } }
            }
        });
        expect(r.aceita).toBe(true);
        expect(r.chatId).toBe('558494610845');
        expect(r.texto).toBe('Oi, quero bonés');
        expect(r.tipo).toBe('text'); // "chat" normaliza para text
        expect(r.nomeContato).toBe('Carlos');
        expect(r.msgId).toBe('abc123');
    });

    it('formato aninhado com contact.number no topo', () => {
        const r = traduzir({
            contact: { number: '5584991112222', name: 'Ana' },
            message: { body: 'olá', type: 'text', id: 'm1' }
        });
        expect(r.aceita).toBe(true);
        expect(r.chatId).toBe('5584991112222');
        expect(r.nomeContato).toBe('Ana');
    });

    it('fromMe é descartado como ECO (silencioso)', () => {
        const r = traduzir({ contact: { number: '5584991112222' }, message: { body: 'x', fromMe: true } });
        expect(r.aceita).toBe(false);
        expect(r.motivo).toBe(MOTIVOS.ECO);
    });

    it('formato plano (n8n/webhook simples)', () => {
        const r = traduzir({ number: '5584993334444', body: 'quero 50 bonés', type: 'text', contactName: 'Bia', id: 'm2' });
        expect(r.aceita).toBe(true);
        expect(r.chatId).toBe('5584993334444');
        expect(r.texto).toBe('quero 50 bonés');
        expect(r.nomeContato).toBe('Bia');
    });

    it('disparo duplicado do ChatBot (numero_cliente) é descartado nomeadamente', () => {
        const r = traduzir({ numero_cliente: '5584991112222', mensagem_cliente: 'oi' });
        expect(r.aceita).toBe(false);
        expect(r.motivo).toBe(MOTIVOS.FORMATO_DUPLICADO);
    });

    it('payload irreconhecível vira FORMATO_DESCONHECIDO (nunca lança)', () => {
        const r = traduzir({ qualquer: 'coisa' });
        expect(r.aceita).toBe(false);
        expect(r.motivo).toBe(MOTIVOS.FORMATO_DESCONHECIDO);
        expect(traduzir(null).aceita).toBe(false);
    });

    it('mídia preserva url, mimetype e citação', () => {
        const r = traduzir({
            contact: { number: '5584991112222' },
            message: { type: 'image', mediaUrl: 'https://x/img.png', mimetype: 'image/png', quotedMsg: { body: 'IB_TRUCK' } }
        });
        expect(r.tipo).toBe('image');
        expect(r.mediaUrl).toBe('https://x/img.png');
        expect(r.mediaMimetype).toBe('image/png');
        expect(r.quotedText).toBe('IB_TRUCK');
    });

    it('tipo desconhecido (sticker) passa como veio — tratado adiante como não suportado', () => {
        const r = traduzir({ number: '5584993334444', type: 'sticker', body: '' });
        expect(r.aceita).toBe(true);
        expect(r.tipo).toBe('sticker');
    });
    // REGRESSÃO (bug de produção): SenderAlt com id de aparelho gerava um chatId
    // com dígitos a mais → o push do ChatClean respondia 404.
    it('SenderAlt com sufixo de dispositivo vira o telefone limpo', () => {
        const r = traduzir({
            message: { body: 'oi', type: 'chat', id: 'm9', raw: { Info: { SenderAlt: '558491756446:24@s.whatsapp.net', PushName: 'Cliente' } } }
        });
        expect(r.aceita).toBe(true);
        expect(r.chatId).toBe('558491756446');
    });

    it('contact.number com sufixo também é limpo', () => {
        const r = traduzir({ contact: { number: '558491756446:12@s.whatsapp.net', name: 'Ana' }, message: { body: 'oi', type: 'text' } });
        expect(r.chatId).toBe('558491756446');
    });

    it('formato plano com sufixo também é limpo', () => {
        const r = traduzir({ number: '558491756446:5@c.us', body: 'oi', type: 'text' });
        expect(r.chatId).toBe('558491756446');
    });
});
