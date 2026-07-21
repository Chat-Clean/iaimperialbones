// =============================================================
//  CENÁRIOS DE EVAL
//  Cada cenário é uma conversa (turnos do cliente) + asserções sobre
//  as ferramentas chamadas e o estado final do lead.
//
//  turno: string (texto do cliente) OU objeto:
//    { texto, arte: true, analiseImagem: '...' }  → simula envio de arte/logo
//
//  assert(ctx) → array de { desc, pass }. ctx expõe:
//    ctx.leadData         estado final
//    ctx.tools            [{ turno, nome, args, resultado }] (todas as tool calls)
//    ctx.respostas        [string] resposta final do agente por turno
//    ctx.log              io mock { mensagens, imagens, notificacoes, mockups }
//    ctx.chamou(nome)     bool — alguma tool com esse nome
//    ctx.toolsDe(nome)    lista das tool calls com esse nome
//    ctx.textoTudo        todas as respostas concatenadas (minúsculas)
// =============================================================

const scenarios = [
    {
        nome: 'fluxo-feliz-completo',
        descricao: 'Compra de Trucker para uniforme, com logo, técnica, regulador e cor, até transferir.',
        turnos: [
            'Oi, boa tarde!',
            'Meu nome é Carlos',
            'Quero fazer uns 50 bonés personalizados pra equipe da minha empresa. O que vocês têm?',
            'Gostei do trucker, pode ser esse',
            'Tenho a logo sim',
            { texto: 'Segue minha logo', arte: true, analiseImagem: 'Logo com o texto "FC Águias", escudo azul e branco.' },
            'Quero bordado 3D',
            'Prefiro o regulador de metal, o tipo 1',
            'Pode ser preto',
            'Perfeito, pode fechar!'
        ],
        // Obs.: o caminho de "mostrar fotos dos modelos" é validado de forma determinística
        // pelo cenário `mostrar-catalogo`. Aqui o foco é a qualificação completa → transferência.
        assert: (ctx) => [
            { desc: 'registrou dados', pass: ctx.chamou('registrar_dados') },
            { desc: 'quantidade = 50', pass: ctx.leadData.quantidade === 50 },
            { desc: 'modelo = IB_TRUCK', pass: ctx.leadData.modeloEscolhido === 'IB_TRUCK' },
            { desc: 'técnica registrada', pass: !!ctx.leadData.tecnica },
            { desc: 'transferiu para consultor', pass: ctx.chamou('transferir_consultor') && ctx.leadData.finalizado === true },
            { desc: 'equipe notificada', pass: ctx.log.notificacoes.length >= 1 }
        ]
    },

    {
        nome: 'pedido-abaixo-do-minimo',
        descricao: 'Cliente pede 10 unidades — deve barrar no mínimo e não transferir.',
        turnos: [
            'Oi, quero uns bonés',
            'Sou a Ana',
            'Preciso de 10 bonés pra um evento'
        ],
        assert: (ctx) => [
            // O guard determinístico deve disparar (avisarMinimo=10 e quantidade zerada). Aceita
            // também o caso em que o modelo não avança para uma quantidade válida por conta própria.
            { desc: 'não aceitou quantidade abaixo do mínimo', pass: ctx.leadData.avisarMinimo === 10 || !(ctx.leadData.quantidade >= 25) },
            { desc: 'NÃO transferiu', pass: !ctx.chamou('transferir_consultor') && ctx.leadData.finalizado !== true },
            { desc: 'resposta menciona o mínimo (30/25/mínimo)', pass: /\b30\b|\b25\b|m[ií]nimo/.test(ctx.textoTudo) }
        ]
    },

    {
        nome: 'preco-via-ferramenta',
        descricao: 'Cliente pergunta preço — o agente deve consultar a ferramenta, não inventar.',
        turnos: [
            'Oi, é o João. Quero 80 trucker oxford pra uniforme da empresa',
            'Quanto fica?'
        ],
        assert: (ctx) => {
            const precos = ctx.toolsDe('consultar_preco');
            const okPreco = precos.some(t => t.resultado && t.resultado.ok);
            const temValorReal = precos.some(t => (t.resultado?.precoReal || '').includes('13,99'))
                || /13,99/.test(ctx.textoTudo);
            return [
                { desc: 'chamou consultar_preco', pass: ctx.chamou('consultar_preco') },
                { desc: 'consultar_preco retornou ok', pass: okPreco },
                { desc: 'preço real da tabela presente (R$ 13,99)', pass: temValorReal }
            ];
        }
    },

    {
        nome: 'mostrar-catalogo',
        descricao: 'Cliente pede para ver os modelos — deve enviar fotos.',
        turnos: [
            'Boa tarde',
            'Pedro',
            'Me mostra os modelos que vocês têm?'
        ],
        assert: (ctx) => [
            { desc: 'chamou enviar_fotos_modelos', pass: ctx.chamou('enviar_fotos_modelos') },
            { desc: 'enviou ao menos 1 imagem', pass: ctx.log.imagens.length >= 1 }
        ]
    },

    {
        nome: 'apenas-duvida',
        descricao: 'Cliente só tira uma dúvida — responde sem forçar venda e sem inventar preço.',
        turnos: [
            'Vocês entregam pra todo o Brasil?'
        ],
        assert: (ctx) => [
            { desc: 'respondeu algo', pass: !!(ctx.respostas.join('').trim()) },
            { desc: 'não transferiu', pass: !ctx.chamou('transferir_consultor') }
        ]
    }
];

module.exports = { scenarios };
