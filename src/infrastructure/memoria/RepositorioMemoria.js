// =============================================================
//  ADAPTER — repositório em MEMÓRIA (dev/local e reserva do Redis)
//  Leads finalizados persistem em database.json (paridade com o
//  fallback legado, que não perdia o histórico no restart).
// =============================================================

const fs = require('fs');
const path = require('path');

function criar({ raiz = null } = {}) {
    const leads = new Map();      // estado das conversas
    const clientes = new Map();   // memória de cliente (recompra)
    const finalizados = [];       // leads finalizados (espelho em memória)

    const dbPath = raiz ? path.join(raiz, 'database.json') : null;
    if (dbPath) {
        try {
            if (fs.existsSync(dbPath)) {
                const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                if (Array.isArray(db.leads)) finalizados.push(...db.leads);
            }
        } catch (e) {
            console.log('⚠️ Criando novo banco de dados de leads');
        }
    }

    function persistirFinalizados() {
        if (!dbPath) return;
        try { fs.writeFileSync(dbPath, JSON.stringify({ leads: finalizados }, null, 2)); }
        catch (e) { console.error('❌ Erro ao salvar database.json:', e.message); }
    }

    return {
        ehDuravel: () => false,
        buscarLead: async (chatId) => leads.get(chatId) || null,
        salvarLead: async (chatId, leadData) => { leads.set(chatId, leadData); },
        removerLead: async (chatId) => { leads.delete(chatId); },
        listarIds: async () => [...leads.keys()],
        registrarLeadFinalizado: async (registro) => { finalizados.push(registro); persistirFinalizados(); },
        buscarCliente: async (chatId) => clientes.get(chatId) || null,
        registrarPedidoCliente: async (chatId, { nome, pedido } = {}) => {
            let rec = clientes.get(chatId);
            if (!rec) rec = { chatId, nome: null, primeiroContato: (pedido && pedido.data) || null, totalPedidos: 0, pedidos: [] };
            if (nome && !rec.nome) rec.nome = nome;
            if (pedido) {
                rec.pedidos.push(pedido);
                rec.ultimoPedido = pedido.data || rec.ultimoPedido;
            }
            rec.totalPedidos = rec.pedidos.length;
            clientes.set(chatId, rec);
            return rec;
        }
    };
}

module.exports = { criar };
