// Teste ESTRUTURAL: lê o código-fonte dos runners de eval e afirma que eles
// exercitam o núcleo de PRODUÇÃO, em vez de reimplementar o turno.
// Um eval que valida um comportamento que não é o de produção é pior que
// não ter eval — ele dá confiança falsa.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe.each(['evals/run.js', 'evals/simulacao.js'])('%s não reimplementa o núcleo', (arquivo) => {
    const codigo = fs.readFileSync(path.join(raiz, arquivo), 'utf8');

    it('usa o agente de produção', () => {
        expect(codigo).toContain('AgenteDeVendas');
        expect(codigo).toMatch(/rodarAgente\(/);
    });

    it('NÃO chama a OpenAI diretamente para conduzir o atendimento', () => {
        // A simulação usa chat.completions para o CLIENTE simulado; o atendimento
        // em si tem de passar pelo agente. Garantimos que o prompt do agente não
        // é montado à mão aqui.
        expect(codigo).not.toContain('promptAgente(');
    });

    it('usa os prompts versionados (índice), não o arquivo de versão direto', () => {
        expect(codigo).toContain("require('../src/infrastructure/openai/prompts')");
        expect(codigo).not.toContain('prompts/v1');
    });
});

describe('io-mock dos evals usa os helpers reais de catálogo', () => {
    const codigo = fs.readFileSync(path.join(raiz, 'evals/io-mock.js'), 'utf8');
    it('importa recomendarModelos/cartelasDoLead do domínio', () => {
        expect(codigo).toContain('src/domain/catalogo/Recomendacao');
    });
});
