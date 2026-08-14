// =============================================================
//  ADAPTER — repositório em REDIS (ioredis)
//  Cada operação cai para a `reserva` (repositório em memória) se o
//  Redis falhar — paridade com o comportamento do store.js legado.
//
//  Env relevantes (recebidas via config, não lidas aqui):
//    REDIS_URL     = redis://:senha@host:6379
//    REDIS_PREFIX  = namespace das chaves (padrão: imperialbones)
// =============================================================

const Redis = require('ioredis');

const LEAD_TTL_SEG    = 60 * 60 * 24 * 30;   // 30 dias — conversas paradas expiram sozinhas
const CLIENTE_TTL_SEG = 60 * 60 * 24 * 365;  // 365 dias — memória de cliente p/ recompra (Fase 4)

function criar({ url, prefixo = 'imperialbones', reserva }) {
    const redis = new Redis(url, { maxRetriesPerRequest: 3 });
    redis.on('connect', () => console.log('🗄️  Redis conectado'));
    redis.on('error', (e) => console.error('❌ Redis:', e.message));

    const leadKey      = (chatId) => `${prefixo}:lead:${chatId}`;
    const leadsListKey = `${prefixo}:leads`;
    const clienteKey   = (chatId) => `${prefixo}:cliente:${chatId}`;

    return {
        ehDuravel: () => true,

        async buscarLead(chatId) {
            try {
                const s = await redis.get(leadKey(chatId));
                return s ? JSON.parse(s) : null;
            } catch (e) {
                console.error('❌ buscarLead:', e.message);
                return reserva.buscarLead(chatId);
            }
        },

        async salvarLead(chatId, leadData) {
            try {
                await redis.set(leadKey(chatId), JSON.stringify(leadData), 'EX', LEAD_TTL_SEG);
            } catch (e) {
                console.error('❌ salvarLead:', e.message);
                await reserva.salvarLead(chatId, leadData);
            }
        },

        async removerLead(chatId) {
            try { await redis.del(leadKey(chatId)); }
            catch (e) {
                console.error('❌ removerLead:', e.message);
                await reserva.removerLead(chatId);
            }
        },

        // Lista os chatIds com estado ativo (varredor de follow-up e /analytics).
        async listarIds() {
            try {
                const ids = [];
                const prefixoLead = `${prefixo}:lead:`;
                let cursor = '0';
                do {
                    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefixoLead}*`, 'COUNT', 200);
                    cursor = next;
                    for (const k of keys) ids.push(k.slice(prefixoLead.length));
                } while (cursor !== '0');
                return ids;
            } catch (e) {
                console.error('❌ listarIds:', e.message);
                return reserva.listarIds();
            }
        },

        // Leads qualificados (histórico append-only)
        async registrarLeadFinalizado(registro) {
            try { await redis.rpush(leadsListKey, JSON.stringify(registro)); }
            catch (e) {
                console.error('❌ registrarLeadFinalizado:', e.message);
                await reserva.registrarLeadFinalizado(registro);
            }
        },

        // Memória de cliente (Fase 4 — recompra): registro durável por contato.
        async buscarCliente(chatId) {
            try {
                const s = await redis.get(clienteKey(chatId));
                return s ? JSON.parse(s) : null;
            } catch (e) {
                console.error('❌ buscarCliente:', e.message);
                return reserva.buscarCliente(chatId);
            }
        },

        async registrarPedidoCliente(chatId, { nome, pedido } = {}) {
            let rec = await this.buscarCliente(chatId);
            if (!rec) rec = { chatId, nome: null, primeiroContato: (pedido && pedido.data) || null, totalPedidos: 0, pedidos: [] };
            if (nome && !rec.nome) rec.nome = nome;
            if (pedido) {
                rec.pedidos.push(pedido);
                rec.ultimoPedido = pedido.data || rec.ultimoPedido;
            }
            rec.totalPedidos = rec.pedidos.length;
            try {
                await redis.set(clienteKey(chatId), JSON.stringify(rec), 'EX', CLIENTE_TTL_SEG);
                return rec;
            } catch (e) {
                console.error('❌ registrarPedidoCliente:', e.message);
                return reserva.registrarPedidoCliente(chatId, { nome, pedido });
            }
        }
    };
}

module.exports = { criar };
