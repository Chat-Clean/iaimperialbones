// =============================================================
//  ADAPTER — mockup da logo aplicada no modelo (gpt-image-1)
//  Baixa a logo do cliente, gera a prévia e envia pelo canal.
// =============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const OpenAI = require('openai');
const { CATALOGO_MODELOS } = require('../../domain/catalogo/Catalogo');

// Dica de estrutura/tecido por modelo, para o mockup ilustrativo
const TECIDO_HINT = {
    IB_SNAP:  'boné estilo americano/snapback de aba curva, frente estruturada 6 gomos',
    IB_TRUCK: 'boné trucker com frente estruturada e traseira/laterais em tela (mesh)',
    IB_DAD:   'boné dad hat de copa baixa em tecido brim fosco, sem estrutura frontal',
    IB_CHAP:  'chapéu personalizado',
    IB_VIS:   'viseira sem copa',
    IB_BOLSA: 'bolsa/sacochila de tecido resistente'
};

// Aparência do tecido por linha escolhida (deixa o mockup mais fiel ao material)
const MATERIAL_HINT = {
    tactel:      'tactel leve, superfície lisa e levemente brilhosa',
    oxford:      'oxford médio, trama visível e acabamento fosco',
    supercap:    'supercap encorpado, aspecto premium e uniforme',
    brim:        'brim de algodão, textura fosca e natural',
    alfaiataria: 'tecido de alfaiataria sofisticado, caimento refinado',
    camurca:     'camurça aveludada, superfície macia e fosca'
};

function criar({ cliente, canal, raiz, habilitado = true }) {
    const MOCKUP_DIR = path.join(raiz, 'assets', 'mockups');

    // Gera e envia a prévia da logo aplicada. Precisa de logoUrl + modeloEscolhido.
    async function gerar(chatId, leadData) {
        if (!habilitado) return false;
        if (!leadData.logoUrl || !leadData.modeloEscolhido) return false;
        try {
            // Baixa a logo enviada pelo cliente (referência para o gpt-image-1)
            const resp = await axios.get(leadData.logoUrl, { responseType: 'arraybuffer', timeout: 30000 });
            const logoFile = await OpenAI.toFile(Buffer.from(resp.data), 'logo.png', { type: resp.headers['content-type'] || 'image/png' });

            const nomeModelo = CATALOGO_MODELOS[leadData.modeloEscolhido]?.nome || leadData.modeloEscolhido;
            const estrutura  = TECIDO_HINT[leadData.modeloEscolhido] || 'boné personalizado';
            const cor        = leadData.corPreferencia ? `na cor ${leadData.corPreferencia}` : 'em cor neutra elegante';
            const tecnica    = leadData.tecnica ? `A logo deve parecer aplicada com a técnica ${leadData.tecnica}.` : 'A logo deve parecer aplicada na frente.';
            const tecido     = MATERIAL_HINT[leadData.material] ? ` Tecido: ${MATERIAL_HINT[leadData.material]}.` : '';

            const prompt = `Mockup publicitário ilustrativo de um ${estrutura} (${nomeModelo}) ${cor}.${tecido} Aplique a logomarca da imagem de referência de forma nítida, centralizada e proporcional na frente do produto. ${tecnica} Iluminação de estúdio, fundo neutro claro, visão frontal levemente em 3/4, aparência realista de produto de e-commerce, alta qualidade. Não adicione nenhum texto além da própria logo.`;

            console.log(`🎨 Gerando mockup: ${nomeModelo} | ${leadData.corPreferencia || 'cor neutra'} | ${leadData.tecnica || 'sem técnica'} | ${leadData.material || 'material padrão'}`);
            const result = await cliente.images.edit({ model: 'gpt-image-1', image: logoFile, prompt, size: '1024x1024', quality: 'medium' });
            const b64 = result.data?.[0]?.b64_json;
            if (!b64) { console.error('❌ Mockup: resposta sem imagem'); return false; }

            if (!fs.existsSync(MOCKUP_DIR)) fs.mkdirSync(MOCKUP_DIR, { recursive: true });
            // O nome do arquivo NÃO pode conter o telefone: /assets é público e
            // uma URL com o número seria adivinhável por quem souber o contato.
            const nomeOpaco = crypto.randomBytes(16).toString('hex');
            const rel = `./assets/mockups/${nomeOpaco}.png`;
            fs.writeFileSync(path.join(raiz, rel), Buffer.from(b64, 'base64'));

            await canal.enviarImagens(chatId, [rel], 'Fiz uma prévia da sua logo no modelo pra você ter uma ideia! 😍 O que achou?');
            return true;
        } catch (e) {
            console.error('❌ Erro ao gerar mockup:', e.response?.data?.error?.message || e.message);
            return false;
        }
    }

    return { gerar };
}

module.exports = { criar };
