// =============================================================
//  ADAPTER — porta Llm sobre o SDK da OpenAI
//  Chat-completion com retry/backoff em 429 (rate limit) e 5xx.
// =============================================================

function criar({ cliente, tentativas = 4 }) {
    async function completar(params) {
        let espera = 800;
        for (let i = 0; ; i++) {
            try {
                return await cliente.chat.completions.create(params);
            } catch (e) {
                const status = e.status || e.response?.status;
                const transitorio = status === 429 || (status >= 500 && status < 600);
                if (transitorio && i < tentativas - 1) {
                    console.warn(`⏳ OpenAI ${status} — retry em ${espera}ms (tentativa ${i + 1}/${tentativas})`);
                    await new Promise(r => setTimeout(r, espera));
                    espera *= 2;
                    continue;
                }
                throw e;
            }
        }
    }
    return { completar };
}

module.exports = { criar };
