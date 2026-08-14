// =============================================================
//  ADAPTER — visão (gpt-4o): a IA "enxerga" a imagem do cliente.
//  Devolve null quando não leu; o turno segue sem descrição.
// =============================================================

function criar({ cliente }) {
    async function descrever(mediaUrl, leadData = {}) {
        if (!mediaUrl) return null;
        try {
            const contexto = leadData.modeloEscolhido
                ? `O cliente já escolheu o produto ${leadData.modeloEscolhido}.`
                : 'Ainda estamos no começo do atendimento.';
            const instrucao = `Você é atendente da Imperial Bonés (bonés e chapéus personalizados). O cliente enviou esta imagem pelo WhatsApp. ${contexto}
Descreva de forma curta e útil para o atendimento, em 1 a 2 frases, tom natural e SEM markdown:
- O que é: logo/arte da marca, foto de um boné de referência, print de exemplo, documento, ou outra coisa.
- Elementos visuais relevantes: texto/nome que aparece, símbolos, cores predominantes, estilo.
- Se for uma logo/arte, sugira brevemente qual técnica combina (silk 3D, bordado 3D, sublimação, DTF ou patch de couro) e por quê.
Não invente nada que não dê para ver. Se a imagem não tiver relação com bonés/personalização, diga isso claramente.`;
            const completion = await cliente.chat.completions.create({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: instrucao },
                        { type: 'image_url', image_url: { url: mediaUrl } }
                    ]
                }],
                max_tokens: 300,
                temperature: 0.4
            });
            return completion.choices[0].message.content.trim();
        } catch (e) {
            console.error('❌ Erro ao analisar imagem (visão):', e.message);
            return null;
        }
    }
    return { descrever };
}

module.exports = { criar };
