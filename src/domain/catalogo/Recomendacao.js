// =============================================================
//  HELPERS DE CATÁLOGO (puros) — compartilhados entre index.js e os evals
//  Sem efeitos colaterais: recebem leadData e devolvem dados.
// =============================================================

// Recomenda até 3 modelos conforme a finalidade/uso informada pelo cliente.
function recomendarModelos(leadData) {
    const uso = (leadData.usoEvento || '').toLowerCase();
    const recomendacoes = [];

    if (uso.includes('beach tennis') || uso.includes('esport') || uso.includes('corrida') || uso.includes('academia') || uso.includes('treino') || uso.includes('fitness') || uso.includes('tenis')) {
        return ['IB_VIS', 'IB_SNAP', 'IB_TRUCK'];
    }
    if (uso.includes('campo') || uso.includes('agro') || uso.includes('fazenda') || uso.includes('rural') || uso.includes('produtor') || uso.includes('sertanejo') || uso.includes('proteção solar') || uso.includes('sol intenso')) {
        recomendacoes.push('IB_CHAP', 'IB_SNAP', 'IB_TRUCK');
    }
    if (uso.includes('brinde') || uso.includes('corporativo') || uso.includes('empresa') || uso.includes('marketing') || uso.includes('mimo')) {
        recomendacoes.push('IB_SNAP', 'IB_TRUCK', 'IB_BOLSA');
    }
    if (uso.includes('uniforme') || uso.includes('equipe') || uso.includes('time') || uso.includes('funcionario') || uso.includes('funcionário')) {
        recomendacoes.push('IB_SNAP', 'IB_TRUCK', 'IB_DAD');
    }
    if (uso.includes('evento') || uso.includes('casamento') || uso.includes('formatura') || uso.includes('festa') || uso.includes('15 anos') || uso.includes('aniversario') || uso.includes('aniversário')) {
        recomendacoes.push('IB_SNAP', 'IB_DAD', 'IB_VIS');
    }
    if (uso.includes('casual') || uso.includes('dia a dia') || uso.includes('uso diario') || uso.includes('pessoal')) {
        recomendacoes.push('IB_DAD', 'IB_SNAP', 'IB_TRUCK');
    }
    if (uso.includes('marca') || uso.includes('colecao') || uso.includes('coleção') || uso.includes('influencer') || uso.includes('revenda') || uso.includes('streetwear')) {
        recomendacoes.push('IB_SNAP', 'IB_DAD', 'IB_TRUCK');
    }
    if (uso.includes('bolsa') || uso.includes('sacola') || uso.includes('bag') || uso.includes('ecobag')) {
        recomendacoes.push('IB_BOLSA');
    }
    if (uso.includes('praia') || uso.includes('verão') || uso.includes('verao') || uso.includes('festival') || uso.includes('show')) {
        recomendacoes.push('IB_CHAP', 'IB_VIS', 'IB_SNAP');
    }

    if (recomendacoes.length === 0) recomendacoes.push('IB_SNAP', 'IB_TRUCK', 'IB_DAD');

    return [...new Set(recomendacoes)].slice(0, 3);
}

// Escolhe a(s) cartela(s) de cores conforme o produto escolhido.
// Padrão: Supercap. Dad Hat = Brim; Trucker = Supercap (corpo) + Tela Resinada (traseira).
function cartelasDoLead(leadData) {
    const dir = './assets/cores-tecidos';
    const modelo = leadData.modeloEscolhido;
    if (modelo === 'IB_DAD') {
        return [{ nome: 'Brim', arquivo: `${dir}/brim.png` }];
    }
    if (modelo === 'IB_TRUCK') {
        return [
            { nome: 'Supercap (corpo)', arquivo: `${dir}/supercap.png` },
            { nome: 'Tela Resinada (traseira)', arquivo: `${dir}/tela-resinada.png` }
        ];
    }
    return [{ nome: 'Supercap', arquivo: `${dir}/supercap.png` }];
}

module.exports = { recomendarModelos, cartelasDoLead };
