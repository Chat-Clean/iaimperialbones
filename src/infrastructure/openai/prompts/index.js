// =============================================================
//  PROMPTS VERSIONADOS
//  A versão em uso é escolhida AQUI, num lugar só. Para evoluir:
//    1. Copie o arquivo da versão atual para a próxima (ex.: v2.js).
//    2. Edite a cópia e registre a mudança no CHANGELOG abaixo.
//    3. Rode `npm run evals` ANTES e DEPOIS e compare os resultados.
//    4. Troque VERSAO_EM_USO num commit separado (rollback = 1 linha).
//
//  CHANGELOG
//  - v1: prompts originais das Fases 0-4 (extração, resposta legada e
//        agente com tool-calling) + regras de mudança-de-ideia, múltiplos
//        produtos e registro de cores/arte (ajustes pós-evals de variação).
// =============================================================

const VERSAO_EM_USO = 'v1';

const versoes = {
    v1: require('./v1')
};

const emUso = versoes[VERSAO_EM_USO];

module.exports = {
    VERSAO_EM_USO,
    versoes,
    promptExtracao: emUso.promptExtracao,
    promptResposta: emUso.promptResposta,
    promptAgente: emUso.promptAgente
};
