// =============================================================
//  ADAPTER — extração de informações (fluxo legado, gpt-4o-mini)
//  Devolve null quando falhou: o turno segue sem novos campos.
// =============================================================

const { promptExtracao } = require('./prompts');

function criar({ cliente }) {
    async function extrair(mensagem, campoAtual, historicoRecente = [], modelosEnviados = []) {
        try {
            const mensagemSanitizada = mensagem.replace(/[<>]/g, '').substring(0, 1000);

            let promptFinal = promptExtracao({ mensagemSanitizada, campoAtual, modelosEnviados });
            if (mensagemSanitizada.includes('[RESPOSTA À MENSAGEM:')) {
                promptFinal += `\n\nOBSERVAÇÃO: O cliente respondeu citando uma mensagem específica. Se a citação contiver código de produto (IB_xxx) e o cliente usar expressões de escolha, extraia o código como modeloEscolhido.`;
            }

            const completion = await cliente.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    ...historicoRecente,
                    { role: 'user', content: promptFinal }
                ],
                temperature: 0
            });

            let res = completion.choices[0].message.content.trim();
            if (res.includes('```')) res = res.replace(/```json?/g, '').replace(/```/g, '').trim();
            return JSON.parse(res);
        } catch (e) {
            console.error('Erro ao extrair informações:', e.message);
            return null;
        }
    }
    return { extrair };
}

module.exports = { criar };
