// =============================================================
//  MOTOR DE ORÇAMENTO — preços REAIS da tabela (data.js)
//  A IA nunca inventa preço: este módulo computa os números e o
//  index.js injeta o resultado no prompt para a IA apenas apresentar.
// =============================================================

const { TABELA_PRECOS } = require('../catalogo/Catalogo');

// Faixas de quantidade (índice 0..4) — casam com TABELA_PRECOS.faixas_padrao
// 30-100 / 101-300 / 301-499 / 500-1000 / acima de 1000
function bandaIndex(qtd) {
    const q = parseInt(qtd, 10);
    if (!Number.isFinite(q)) return 0;
    if (q <= 100) return 0;
    if (q <= 300) return 1;
    if (q <= 499) return 2;
    if (q <= 1000) return 3;
    return 4;
}

const FAIXAS = ['30 a 100', '101 a 300', '301 a 499', '500 a 1000', 'acima de 1000'];
function faixaLabel(qtd) { return FAIXAS[bandaIndex(qtd)]; }

// Quais linhas da tabela pertencem a cada modelo do catálogo
const MATCH = {
    IB_TRUCK: (nome)          => /trucker/i.test(nome),
    IB_SNAP:  (nome)          => /americano|6 gomos/i.test(nome),
    IB_DAD:   (nome)          => /dad hat/i.test(nome),
    IB_VIS:   (nome, secKey)  => secKey === 'viseira',
    IB_CHAP:  (nome, secKey)  => secKey === 'chapeus',
    IB_BOLSA: (nome, secKey)  => secKey === 'sacochila' || secKey === 'ecobag'
};

// Retorna [{ nome, precos: [5] }] das linhas da tabela que casam com o modelo
function precosDoModelo(codigo) {
    const fn = MATCH[codigo];
    if (!fn) return [];
    const linhas = [];
    for (const [secKey, sec] of Object.entries(TABELA_PRECOS)) {
        if (!sec || typeof sec !== 'object' || !sec.itens) continue;
        for (const [nome, precos] of Object.entries(sec.itens)) {
            if (Array.isArray(precos) && fn(nome, secKey)) linhas.push({ nome, precos });
        }
    }
    return linhas;
}

const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

// Palavra que identifica a linha de tecido no nome da linha da tabela.
const MATERIAL_MATCH = {
    tactel:      /tactel/i,
    oxford:      /oxford/i,
    supercap:    /supercap/i,
    brim:        /brim/i,
    alfaiataria: /alfaiataria/i,
    camurca:     /camurça|camurca/i
};

// String com os preços reais do modelo, na faixa da quantidade (ou "a partir de 30").
// Se o material for conhecido, restringe a UMA linha da tabela → preço EXATO (sem range).
// Retorna null se não houver dados. Usado como contexto no prompt (a IA só apresenta).
function contextoPreco(codigo, qtd, nomeAmigavel, material) {
    let linhas = precosDoModelo(codigo);
    if (!linhas.length) return null;

    // Filtro por material: se o cliente indicou o nível/tecido, cravamos a linha exata.
    let materialExato = false;
    const re = material && MATERIAL_MATCH[material];
    if (re) {
        const filtradas = linhas.filter(l => re.test(l.nome));
        if (filtradas.length) { linhas = filtradas; materialExato = true; }
    }

    const q = parseInt(qtd, 10);
    const temQtd = Number.isFinite(q) && q >= 30;
    const bi = temQtd ? bandaIndex(q) : 0;

    const valores = linhas.map(l => l.precos[bi]).filter(v => typeof v === 'number');
    if (!valores.length) return null;

    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const faixaTxt = min === max
        ? `${fmt(min)}/unidade`
        : `de ${fmt(min)} a ${fmt(max)}/unidade${materialExato ? '' : ' (varia conforme o material)'}`;
    const ctxQtd = temQtd ? `para ${q} unidades (faixa ${faixaLabel(q)})` : `a partir de 30 unidades`;
    const nome = nomeAmigavel || codigo;
    const linhaTxt = materialExato ? ` (linha ${linhas[0].nome})` : '';

    return `PREÇOS REAIS (use EXATAMENTE estes números, NUNCA invente): ${nome}${linhaTxt} ${ctxQtd}: ${faixaTxt}. Personalizações adicionais (bordado/silk lateral, DTF, regulador de metal, etc.) somam ao valor base. Quanto maior a quantidade, menor o valor por unidade.`;
}

module.exports = { bandaIndex, faixaLabel, precosDoModelo, contextoPreco };
