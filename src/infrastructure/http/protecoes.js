// =============================================================
//  PROTEÇÕES DE BORDA (fábricas puras de configuração)
// =============================================================

const crypto = require('crypto');

// Autenticação do webhook por token compartilhado. Compara DIGESTS SHA-256
// com timingSafeEqual: tamanho fixo, sem truncar segredos longos nem vazar
// o comprimento do segredo. Sem segredo configurado, tudo passa (a config
// avisa no boot).
function criarAutenticacao(segredo) {
    function autenticar(req) {
        if (!segredo) return true;
        const raw = req.headers['x-webhook-token'] || req.headers['authorization'] || '';
        const token = String(raw).replace(/^Bearer\s+/i, '');
        const a = crypto.createHash('sha256').update(token).digest();
        const b = crypto.createHash('sha256').update(segredo).digest();
        return crypto.timingSafeEqual(a, b);
    }
    return { autenticar };
}

// Guarda das rotas administrativas. FAIL-CLOSED: sem ADMIN_KEY configurada a
// rota responde 503 — nunca fica aberta por omissão.
function criarGuardaAdministrativa(chaveAdmin) {
    function checar(req, res) {
        if (!chaveAdmin) {
            res.status(503).json({ erro: 'Rota administrativa desabilitada: defina ADMIN_KEY no ambiente.' });
            return false;
        }
        const raw = req.headers['x-admin-key'] || req.query.key || '';
        const a = crypto.createHash('sha256').update(String(raw)).digest();
        const b = crypto.createHash('sha256').update(chaveAdmin).digest();
        if (!crypto.timingSafeEqual(a, b)) {
            res.status(401).json({ erro: 'não autorizado' });
            return false;
        }
        return true;
    }
    return { checar };
}

// Teto de mensagens por CONTATO numa janela deslizante. Protege contra um
// contato abusivo/em loop gerar custo ilimitado de OpenAI. O Map é podado
// defensivamente para não crescer sem limite.
function criarControleDeVazao({ limite = 20, janelaMs = 60000, tetoDeChaves = 5000 } = {}) {
    const janelas = new Map(); // chatId → timestamps[]

    function excedeu(chatId, agora = Date.now()) {
        const inicio = agora - janelaMs;
        const recentes = (janelas.get(chatId) || []).filter(t => t > inicio);
        recentes.push(agora);
        janelas.set(chatId, recentes);

        if (janelas.size > tetoDeChaves) {
            for (const [k, ts] of janelas) {
                if (!ts.length || ts[ts.length - 1] <= inicio) janelas.delete(k);
                if (janelas.size <= tetoDeChaves) break;
            }
        }
        return recentes.length > limite;
    }
    return { excedeu };
}

// Deduplicação por id de mensagem (o ChatClean pode reenviar o mesmo webhook).
function criarControleDeIdempotencia({ capacidade = 500, descarte = 200 } = {}) {
    const vistos = new Set();
    function jaProcessada(msgId) {
        if (!msgId) return false;
        if (vistos.has(msgId)) return true;
        vistos.add(msgId);
        if (vistos.size > capacidade) {
            [...vistos].slice(0, descarte).forEach(id => vistos.delete(id));
        }
        return false;
    }
    return { jaProcessada };
}

module.exports = { criarAutenticacao, criarControleDeIdempotencia, criarGuardaAdministrativa, criarControleDeVazao };
