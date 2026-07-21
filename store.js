// =============================================================
//  STORE — estado da conversa persistido em Redis
//  Fallback automático para memória se REDIS_URL não estiver definido
//  (mantém o comportamento antigo em dev/local, sem quebrar nada).
//
//  Env:
//    REDIS_URL     = redis://:senha@host:6379  (ex.: instância do Easypanel)
//    REDIS_PREFIX  = namespace das chaves (padrão: imperialbones)
// =============================================================

const REDIS_URL    = process.env.REDIS_URL || '';
const PREFIX       = process.env.REDIS_PREFIX || 'imperialbones';
const LEAD_TTL_SEG = 60 * 60 * 24 * 30;   // 30 dias — conversas paradas expiram sozinhas
const CLIENTE_TTL_SEG = 60 * 60 * 24 * 365; // 365 dias — memória de cliente p/ recompra (Fase 4)

let redis = null;
let usingRedis = false;
const mem = new Map();        // fallback: estado das conversas
const memLeads = [];          // fallback: leads finalizados
const memClientes = new Map();// fallback: memória de cliente (recompra)

if (REDIS_URL) {
    try {
        const Redis = require('ioredis');
        redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
        redis.on('connect', () => console.log('🗄️  Redis conectado'));
        redis.on('error', (e) => console.error('❌ Redis:', e.message));
        usingRedis = true;
    } catch (e) {
        console.error('❌ Falha ao iniciar o Redis, usando memória:', e.message);
        usingRedis = false;
    }
}

const leadKey      = (chatId) => `${PREFIX}:lead:${chatId}`;
const leadsListKey = `${PREFIX}:leads`;
const clienteKey   = (chatId) => `${PREFIX}:cliente:${chatId}`;

function isRedis() { return usingRedis; }

// Estado da conversa (leadData) por número
async function getLead(chatId) {
    if (usingRedis) {
        try {
            const s = await redis.get(leadKey(chatId));
            return s ? JSON.parse(s) : null;
        } catch (e) {
            console.error('❌ getLead:', e.message);
            return mem.get(chatId) || null;
        }
    }
    return mem.get(chatId) || null;
}

async function saveLead(chatId, leadData) {
    if (usingRedis) {
        try {
            await redis.set(leadKey(chatId), JSON.stringify(leadData), 'EX', LEAD_TTL_SEG);
            return;
        } catch (e) {
            console.error('❌ saveLead:', e.message);
        }
    }
    mem.set(chatId, leadData);
}

async function deleteLead(chatId) {
    if (usingRedis) {
        try { await redis.del(leadKey(chatId)); return; }
        catch (e) { console.error('❌ deleteLead:', e.message); }
    }
    mem.delete(chatId);
}

// Lista os chatIds com estado ativo (para o varredor de follow-up).
// Redis: SCAN por prefixo. Memória: chaves do Map.
async function scanLeadIds() {
    if (usingRedis) {
        try {
            const ids = [];
            const prefixo = `${PREFIX}:lead:`;
            let cursor = '0';
            do {
                const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefixo}*`, 'COUNT', 200);
                cursor = next;
                for (const k of keys) ids.push(k.slice(prefixo.length));
            } while (cursor !== '0');
            return ids;
        } catch (e) {
            console.error('❌ scanLeadIds:', e.message);
            return [...mem.keys()];
        }
    }
    return [...mem.keys()];
}

// Leads qualificados (histórico append-only)
async function appendLeadFinalizado(registro) {
    if (usingRedis) {
        try { await redis.rpush(leadsListKey, JSON.stringify(registro)); return; }
        catch (e) { console.error('❌ appendLeadFinalizado:', e.message); }
    }
    memLeads.push(registro);
}

// =============================================================
//  MEMÓRIA DE CLIENTE (Fase 4 — recompra)
//  Registro durável por contato (sobrevive ao TTL da conversa), com o
//  histórico de pedidos. Usado para reconhecer quem já comprou e sugerir
//  recompra/upsell.
// =============================================================
async function getCliente(chatId) {
    if (usingRedis) {
        try {
            const s = await redis.get(clienteKey(chatId));
            return s ? JSON.parse(s) : null;
        } catch (e) {
            console.error('❌ getCliente:', e.message);
            return memClientes.get(chatId) || null;
        }
    }
    return memClientes.get(chatId) || null;
}

// Anexa um pedido ao histórico do cliente (cria o registro se ainda não existe).
async function registrarPedidoCliente(chatId, { nome, pedido } = {}) {
    let rec = await getCliente(chatId);
    if (!rec) rec = { chatId, nome: null, primeiroContato: (pedido && pedido.data) || null, totalPedidos: 0, pedidos: [] };
    if (nome && !rec.nome) rec.nome = nome;
    if (pedido) {
        rec.pedidos.push(pedido);
        rec.ultimoPedido = pedido.data || rec.ultimoPedido;
    }
    rec.totalPedidos = rec.pedidos.length;

    if (usingRedis) {
        try { await redis.set(clienteKey(chatId), JSON.stringify(rec), 'EX', CLIENTE_TTL_SEG); return rec; }
        catch (e) { console.error('❌ registrarPedidoCliente:', e.message); }
    }
    memClientes.set(chatId, rec);
    return rec;
}

module.exports = { isRedis, getLead, saveLead, deleteLead, appendLeadFinalizado, scanLeadIds, getCliente, registrarPedidoCliente };
