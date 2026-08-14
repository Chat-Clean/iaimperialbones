const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
    test: {
        environment: 'node',
        include: ['test/**/*.test.js'],
        testTimeout: 5000 // a suíte NÃO faz rede nem espera tempo real (evals são à parte: npm run evals)
    }
});
