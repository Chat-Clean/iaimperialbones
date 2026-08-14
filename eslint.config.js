// =============================================================
//  ESLINT — regras gerais + FRONTEIRAS DA ARQUITETURA
//  domain/application/shared não podem tocar infraestrutura;
//  infrastructure não pode conhecer o composition root (main).
//  Como o projeto é CommonJS, `no-restricted-imports` NÃO funciona
//  (só enxerga import ESM): a barreira olha a chamada require()
//  via seletor AST em no-restricted-syntax.
// =============================================================

const js = require('@eslint/js');
const globals = require('globals');

const INFRA_PROIBIDA = ['openai', 'axios', 'ioredis', 'express', 'form-data', 'dotenv', 'fs', 'path'];

const proibirRequire = (modulos, motivo) => ({
    selector: `CallExpression[callee.name='require'][arguments.0.value=/^(${modulos.join('|')})$/]`,
    message: motivo
});

const regrasBase = {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    eqeqeq: ['error', 'smart'],
    'prefer-const': 'error',
    'no-var': 'error',
    'no-console': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }]
};

module.exports = [
    { ignores: ['node_modules/**', 'coverage/**', 'assets/**', 'database.json'] },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node }
        },
        rules: { ...js.configs.recommended.rules, ...regrasBase }
    },
    {
        // Camadas PURAS: nada de I/O nem SDKs — dependências apontam para dentro.
        files: ['src/domain/**/*.js', 'src/application/**/*.js', 'src/shared/**/*.js'],
        rules: {
            'no-restricted-syntax': [
                'error',
                proibirRequire(
                    INFRA_PROIBIDA,
                    'Camada pura (domain/application/shared) não pode requerer infraestrutura — injete pela porta (src/application/portas).'
                )
            ]
        }
    },
    {
        // O domínio também não lê ambiente.
        files: ['src/domain/**/*.js'],
        rules: {
            'no-restricted-globals': ['error', { name: 'process', message: 'Domínio não lê process.env — receba por parâmetro.' }]
        }
    },
    {
        // Adapter não conhece o composition root.
        files: ['src/infrastructure/**/*.js'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    // borda de segmento: casa "main/" no início ou após "/", sem casar "domain/"
                    selector: `CallExpression[callee.name='require'][arguments.0.value=/(^|\\u002f)main\\u002f/]`,
                    message: 'Infraestrutura não pode requerer src/main — o container é quem monta os adapters.'
                }
            ]
        }
    },
    {
        files: ['test/**/*.js', 'vitest.config.js'],
        languageOptions: { sourceType: 'module' }
    }
];
