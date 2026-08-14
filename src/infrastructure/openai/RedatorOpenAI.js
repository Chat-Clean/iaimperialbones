// =============================================================
//  ADAPTER — redação de respostas (fluxo legado, gpt-4o-mini)
//  redigir: resposta principal do funil (null quando bloqueada).
//  redigirPosPedido: dúvidas após o pedido já ter sido encaminhado.
//  redigirAckImagem: reconhecimento contextual da arte enviada.
// =============================================================

const { promptResposta } = require('./prompts');

const SYSTEM_ATENDENTE = 'Você é um atendente consultivo da Imperial Bonés Personalizados. Sua escrita é natural, empática e profissional. Tom: acolhedor, prestativo e consultivo.';
const SYSTEM_CURTO = 'Você é atendente consultivo da Imperial Bonés. Escrita natural, curta, registro de WhatsApp.';

function criar({ cliente }) {
    async function redigir({ leadData, mensagemCliente, proximoCampo, historicoRecente = [], imagensForamEnviadas = false, precoContexto = null }) {
        if (imagensForamEnviadas && (
            proximoCampo?.campo === 'modeloEscolhido' ||
            proximoCampo?.campo === 'tecnica' ||
            proximoCampo?.campo === 'tipoRegulador'
        )) {
            console.log(`🔒 BLOQUEIO: Imagens foram enviadas. Não gerando resposta adicional.`);
            return null;
        }

        const mensagemSanitizada = mensagemCliente.replace(/[<>]/g, '').substring(0, 1000);
        const isInicioConversa = leadData.conversationHistory.length === 0;

        if (proximoCampo?.campo === 'tipoRegulador') {
            const primeiroNome = leadData.nome?.split(' ')[0] || '';
            return `Sobre o regulador do seu produto, temos 3 opções. Vou te enviar as fotos para você escolher qual prefere, ${primeiroNome}! 😊`;
        }

        if (proximoCampo?.campo === 'tecnica' && (leadData.quandoEnviaArte || leadData.temArte === 'enviou')) {
            return 'Para eu te ajudar a escolher a melhor técnica de personalização para sua arte, vou te mostrar as opções que trabalhamos.';
        }

        const prompt = promptResposta({ isInicioConversa, mensagemSanitizada, imagensForamEnviadas, proximoCampo, leadData, precoContexto });

        const completion = await cliente.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_ATENDENTE },
                ...historicoRecente,
                { role: 'user', content: prompt }
            ],
            temperature: 0.7
        });

        return completion.choices[0].message.content.trim();
    }

    // Pedido JÁ encaminhado ao consultor: tira dúvidas pontuais sem repetir o
    // resumo nem refazer a qualificação.
    async function redigirPosPedido(leadData, mensagemCliente, historicoRecente = []) {
        const fallback = 'Seu pedido já está com o nosso consultor, que vai falar com você pra finalizar! Se tiver qualquer dúvida, pode mandar aqui que eu ajudo. 😊';
        try {
            const prompt = `O pedido deste cliente já foi montado e ENCAMINHADO ao consultor. Ele acabou de dizer: "${String(mensagemCliente).replace(/[<>]/g, '').substring(0, 600)}".
Responda de forma breve, calorosa e útil (registro de WhatsApp, sem markdown, no máximo 1 emoji):
- Se for uma dúvida que você consegue responder com o que sabe da Imperial Bonés, responda.
- Se depender do consultor (preço final fechado, prazo exato, mudança no pedido), diga que o consultor já vai falar com ele pra resolver.
NÃO refaça perguntas de qualificação e NÃO repita o resumo do pedido.`;
            const completion = await cliente.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: SYSTEM_CURTO },
                    ...historicoRecente,
                    { role: 'user', content: prompt }
                ],
                temperature: 0.6
            });
            return completion.choices[0].message.content.trim() || fallback;
        } catch (e) {
            console.error('❌ Erro na resposta pós-pedido:', e.message);
            return fallback;
        }
    }

    // Transforma a análise da imagem numa resposta curta e natural, referenciando
    // a arte, e faz a transição para a escolha da técnica.
    async function redigirAckImagem(leadData, descImg, historicoRecente = []) {
        const fallback = descImg
            ? 'Recebi sua arte! Vou te mostrar as técnicas pra gente escolher a ideal pra ela. ✨'
            : 'Perfeito, recebi sua arte! Vou te mostrar as técnicas. ✨';
        try {
            const nome = leadData.nome?.split(' ')[0] || '';
            const prompt = `O cliente${nome ? ' (' + nome + ')' : ''} acabou de enviar a arte/logo dele. O que você viu na imagem: "${descImg || 'imagem recebida'}".
Escreva UMA mensagem curta de WhatsApp (1 a 2 frases, tom humano e caloroso, no máximo 1 emoji, sem markdown) que:
- reconheça a arte citando algo CONCRETO que você viu nela (uma cor, símbolo, o nome, o estilo);
- diga que vai mostrar as técnicas de personalização pra escolher a ideal pra essa arte.
Não liste as técnicas agora e não invente detalhes que não estão na descrição.`;
            const completion = await cliente.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'Você é atendente consultivo da Imperial Bonés. Escrita natural, calorosa e curta, registro de WhatsApp.' },
                    ...historicoRecente,
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            });
            return completion.choices[0].message.content.trim() || fallback;
        } catch (e) {
            console.error('❌ Erro no ack de imagem:', e.message);
            return fallback;
        }
    }

    return { redigir, redigirPosPedido, redigirAckImagem };
}

module.exports = { criar };
