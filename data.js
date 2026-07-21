// =============================================================
//  DADOS DE NEGÓCIO — Imperial Bonés
//  Catálogo, níveis, tecidos, técnicas, reguladores e tabela de preços.
//  Editar aqui NÃO requer mexer na lógica do index.js.
// =============================================================

// =============================================================
//  INFORMAÇÕES DA EMPRESA
// =============================================================
const EMPRESA_INFO = {
    nome: 'Imperial Bonés Personalizados',
    dono: 'Isaac',
    instagram: '@imperialbones',
    site: 'www.imperialbones.com.br',
    email: 'contato@imperialbones.com.br',
    cnpj: '45.734.318/0001-34',
    localizacao: 'Serra Negra do Norte-RN',
    fundacao: '2017',
    historia: 'A Imperial Bonés Personalizados iniciou sua trajetória no mercado de headwear em 2017, sob a liderança de seu fundador Isaac. Com o crescimento sustentável da demanda, a formalização do CNPJ ocorreu em 2022. Ao longo de quase uma década, a Imperial construiu uma reputação de excelência e confiabilidade, tornando-se referência no setor de personalização e atendendo clientes em todo o território nacional.',
    tecnicas: {
        silk3d:      'Silk 3D — Estampa com relevo emborrachado, visual moderno e tátil.',
        bordado3d:   'Bordado 3D — Técnica premium com preenchimento que cria relevo alto e sofisticado.',
        sublimacao:  'Sublimação — Ideal para artes complexas, fotografias ou estampas com cores vibrantes em toda a peça.',
        dtf:         'DTF (Direct to Film) — Tecnologia de última geração com alta definição e durabilidade extrema.',
        patchLaser:  'Patch de Couro Gravado a Laser — Acabamento artesanal e rústico, conceito outdoor ou premium.',
        patchSilk:   'Patch de Couro com Silk — Textura do couro combinada com a precisão da estampa em silk.',
        dtfRelevo:   'DTF com Relevo — Alta definição do DTF com textura diferenciada que salta aos olhos.'
    },
    pedidoMinimo: 'Mínimo 30 unidades (padrão). Lotes menores: 25 unidades com acréscimo de R$1,50 por peça. Combinações possíveis: 20+20 ou 25+25 usando o mesmo logo.',
    prazos: {
        bolsas_ecobag: 'até 15 dias úteis',
        padrao: 'até 21 dias úteis (bonés, chapéus, viseiras e buckets — contados após aprovação da arte e pagamento)'
    },
    precos: 'Os valores da tabela são o ponto de partida por faixa de quantidade. Personalizações adicionais (bordado/silk lateral, etc.) somam ao valor base. Quanto maior a quantidade, menor o valor por unidade.',
    adicionais: {
        bordado_silk_lateral_ate100: '+R$1,50 por unidade (pedidos até 100 un.)',
        bordado_silk_lateral_acima100: '+R$1,00 por unidade (pedidos acima de 100 un.)',
        dtf_adicional: '+R$1,50 por unidade',
        aplicacao_frontal_laser: '+R$1,50 por unidade'
    },
    envio: 'O envio é por conta do cliente. Coleta/envio disponível apenas após quitação do pedido.',
    pagamento: 'PIX ou Boleto: 50% no ato do pedido + 50% após fabricação. Cartão de crédito: 100% do valor em até 12x (sujeito a juros da financeira). Coleta/envio disponível após quitação.',
    dadosBancarios: 'PIX CNPJ: 45.734.318/0001-34 | Nubank: Ag. 0001 / CC 42288944-2 (Banco 0260)',
    orcamentoValidade: '10 dias'
};

// =============================================================
//  CATÁLOGO DE MODELOS
// =============================================================
const CATALOGO_MODELOS = {
    'IB_SNAP': {
        nome: 'Snapback / Americano',
        codigo: 'IB_SNAP',
        descricao: 'Copa estruturada 6 gomos com fechamento traseiro ajustável. Disponível em 3 níveis: Básico (Tactel, silk ou DTF), Essencial (Oxford, silk ou bordado) e Premium (Supercap com bordado alto relevo, carneira em brim). Versátil para uniformes, marcas e coleções.',
        estilo: 'Moderno e versátil — do casual ao corporativo.',
        niveis: ['basico', 'essencial', 'premium'],
        precoReferencia: 'A partir de R$ 8,99/unidade (básico, 30-100 un.)',
        arquivo: './assets/modelos/americano.png',
        keywords: ['snapback', 'snap', 'americano', 'aba reta', 'estruturado', '6 gomos', 'seis gomos']
    },
    'IB_TRUCK': {
        nome: 'Trucker',
        codigo: 'IB_TRUCK',
        descricao: 'LÍDER DE VENDAS entre os bonés! Copa estruturada com laterais e traseira em tela para máxima ventilação. Básico (Tactel + tela básica, silk screen), Intermediário (Oxford + tela resinada, silk ou bordado) e Premium (Supercap + tela resinada, silk alto relevo ou bordado alto relevo, carneira brim).',
        estilo: 'Clássico e despojado com muito conforto — nosso modelo mais vendido.',
        niveis: ['basico', 'essencial', 'premium'],
        precoReferencia: 'A partir de R$ 8,99/unidade (básico, 30-100 un.)',
        arquivo: './assets/modelos/trucker.png',
        keywords: ['trucker', 'tela', 'ventilacao', 'telinha', 'traseira de tela', 'caminhoneiro']
    },
    'IB_DAD': {
        nome: 'Dad Hat',
        codigo: 'IB_DAD',
        descricao: 'Copa baixa em Brim Premium, sem estrutura frontal. Caimento natural que se adapta ao formato da cabeça. Sofisticado e versátil — ideal para coleções de marca, influenciadores e uso casual premium.',
        estilo: 'Casual premium — do dia a dia ao streetwear.',
        niveis: ['premium'],
        precoReferencia: 'A partir de R$ 19,99/unidade (30-100 un.)',
        arquivo: './assets/modelos/dad-hat.png',
        keywords: ['dad hat', 'copa baixa', 'casual', 'mole', 'relaxado', 'sem estrutura', 'influencer', 'streetwear', 'brim']
    },
    'IB_CHAP': {
        nome: 'Chapéus',
        codigo: 'IB_CHAP',
        descricao: 'Linha completa: Chapéu de Proteção (Oxford, botões laterais + cordão — LÍDER DE VENDAS entre os chapéus), Bucket Hat (fashion), Chapéu de Juta (fita colorida), Chapéu de Palha (patch couro sintético, forro sublimável) e Cata Ovo (viseira ampla). Todos com mínimo de 30 unidades.',
        estilo: 'Sofisticado, versátil e funcional.',
        precoReferencia: 'Bonés de aba: a partir de R$ 8,99/un | Chapéu de Juta/Agro: a partir de R$ 44,90/un',
        arquivo: './assets/modelos/chapeu-protecao.png',
        keywords: ['chapeu', 'chapéu', 'aba larga', 'sol', 'campo', 'agro', 'produtor', 'rural', 'fazenda',
                   'bucket', 'bucket hat', 'juta', 'palha', 'cata ovo', 'proteção', 'proteção solar', 'sertanejo']
    },
    'IB_VIS': {
        nome: 'Viseira',
        codigo: 'IB_VIS',
        descricao: 'Altamente procurada para beach tennis, academias, eventos esportivos e atividades ao ar livre. Logo bordada ou silk screen. Sem copa, ideal para quem prioriza conforto térmico.',
        estilo: 'Esportivo e funcional.',
        precoReferencia: 'A partir de R$ 8,99/unidade',
        arquivo: './assets/modelos/viseira.png',
        keywords: ['viseira', 'beach tennis', 'esporte', 'academia', 'corrida', 'sem copa', 'fitness', 'tenis', 'esportivo']
    },
    'IB_BOLSA': {
        nome: 'Bolsa Personalizada',
        codigo: 'IB_BOLSA',
        descricao: 'Linha de acessórios personalizados com foco em brindes corporativos e utilitários de alta resistência. Prazo especial: 15 dias úteis.',
        estilo: 'Funcional e resistente.',
        precoReferencia: 'Consulte para orçamento personalizado',
        arquivo: './assets/modelos/sacochila.png',
        keywords: ['bolsa', 'sacola', 'brinde', 'utilitario', 'resistente', 'corporativo', 'ecobag', 'bag', 'bolsa personalizada']
    }
};

// =============================================================
//  NÍVEIS DE QUALIDADE
// =============================================================
const NIVEIS_QUALIDADE = {
    basico: {
        nome: 'Básico',
        material_frente: 'Tactel Leve 100% poliéster',
        frente: 'Maleável com dublagem em TNT',
        carneira: '100% nylon poliéster',
        botao: 'Pino',
        aba: 'Curva sem costuras',
        tecnicas: ['Silk 3D', 'DTF'],
        descricao_resumida: 'Boné básico em Tactel, frente maleável, silk ou DTF'
    },
    essencial: {
        nome: 'Essencial / Intermediário',
        material_frente: 'Oxford Médio 100% poliéster',
        frente: 'Estruturada',
        carneira: 'Espumada 100% poliéster',
        botao: '3 garras',
        aba: 'Curva 4 costuras',
        tecnicas: ['Silk 3D', 'Bordado 3D', 'DTF'],
        descricao_resumida: 'Boné intermediário em Oxford, frente estruturada, silk ou bordado'
    },
    premium: {
        nome: 'Premium',
        material_frente: 'Supercap Pesado 100% poliéster',
        frente: 'Estruturada + entretela inteligente',
        carneira: 'Espumada em brim 100% algodão',
        botao: '3 garras',
        aba: 'Curva 6 costuras',
        tecnicas: ['Silk 3D', 'Bordado 3D', 'Sublimação', 'DTF', 'Patch Couro Laser', 'Patch Couro Silk', 'DTF com Relevo'],
        descricao_resumida: 'Boné premium em Supercap, frente estruturada + entretela, bordado alto relevo, carneira brim algodão'
    }
};

// =============================================================
//  TECIDOS E CORES
// =============================================================
const TECIDOS_E_CORES = {
    supercap: {
        nome: 'Supercap',
        usado_em: 'Frente e corpo dos bonés Premium',
        cores: ['Azul Marinho', 'Azul Royal', 'Turquesa', 'Azul Bebê', 'Tiffany', 'Açaí', 'Roxo',
                'Verde Militar', 'Verde Bandeira', 'Verde Limão', 'Amarelo', 'Laranja', 'Laranja Neon',
                'Branco', 'Cinza', 'Chumbo', 'Marrom', 'Preto', 'Bege',
                'Rosa Bebê', 'Pink', 'Pink Neon', 'Vermelho', 'Vinho']
    },
    oxford: {
        nome: 'Oxford Médio',
        usado_em: 'Frente e corpo dos bonés Essencial/Intermediário (Snapback e Americano)',
        cores: ['Azul Marinho', 'Azul Royal', 'Turquesa', 'Azul Bebê', 'Roxo',
                'Verde Militar', 'Verde Bandeira', 'Verde Limão', 'Amarelo', 'Laranja',
                'Branco', 'Cinza', 'Chumbo', 'Marrom', 'Preto',
                'Rosa Bebê', 'Pink', 'Vermelho', 'Vinho', 'Bege']
    },
    tela_paranaense: {
        nome: 'Tela Paranaense',
        usado_em: 'Laterais e traseira dos bonés Trucker Básico',
        cores: ['Azul Marinho', 'Azul Royal', 'Turquesa', 'Azul Bebê', 'Roxo',
                'Verde Militar', 'Verde Bandeira', 'Verde Limão', 'Amarelo', 'Laranja',
                'Branco', 'Cinza', 'Chumbo', 'Marrom', 'Preto',
                'Rosa Bebê', 'Pink', 'Vermelho', 'Vinho', 'Bege']
    },
    tela_resinada: {
        nome: 'Tela Resinada',
        usado_em: 'Laterais e traseira dos bonés Trucker Intermediário e Premium',
        cores: ['Azul Marinho', 'Azul Royal', 'Turquesa', 'Azul Bebê', 'Roxo',
                'Verde Militar', 'Verde Bandeira', 'Verde Limão', 'Amarelo', 'Laranja',
                'Branco', 'Cinza', 'Chumbo', 'Marrom', 'Preto',
                'Rosa Bebê', 'Pink', 'Vermelho', 'Vinho', 'Bege']
    },
    alfaiataria: {
        nome: 'Alfaiataria',
        usado_em: 'Linha especial de bonés e viseiras premium',
        cores: ['Branco', 'Cinza', 'Chumbo', 'Preto',
                'Rosa Bebê', 'Vermelho', 'Vinho', 'Verde Militar', 'Botanical',
                'Biscuit', 'Chai Latte', 'Caramelo', 'Cognac', 'Café',
                'Azul Marinho', 'Azul Royal', 'Indy Blue', 'Azul Bebê', 'Verde Sálvia']
    },
    brim: {
        nome: 'Brim',
        usado_em: 'Carneira interna dos bonés Premium; bonés linha Essencial em Brim',
        cores: ['Azul Marinho', 'Azul Royal', 'Azul Bebê', 'Tiffany', 'Marrom',
                'Verde Militar', 'Verde Bandeira', 'Amarelo', 'Laranja', 'Caramelo',
                'Branco', 'Chumbo', 'Cinza Escuro', 'Preto', 'Caqui',
                'Rosa Bebê', 'Pink', 'Vermelho', 'Vinho', 'Bege']
    },
    camurca: {
        nome: 'Camurça',
        usado_em: 'Linha especial de bonés e chapéus',
        cores: ['Branco', 'Cinza', 'Chumbo', 'Preto', 'Rosa Bebê', 'Pink',
                'Vermelho', 'Vinho', 'Laranja', 'Azul Royal', 'Azul Marinho',
                'Verde Militar', 'Verde Claro', 'Amarelo', 'Bege',
                'Ferrugem', 'Telha', 'Conhaque', 'Café']
    },
    especiais_aba: {
        nome: 'Materiais Especiais (exclusivo para aba)',
        usado_em: 'Personalização diferenciada da aba do boné',
        opcoes: ['Juta', 'Brilhoso Preto', 'Brilhoso Branco', 'Brilhoso Dourado',
                 'Brilhoso Pink', 'Brilhoso Rosa Bebê', 'Jeans', 'Jeans Preto', 'Holográfico',
                 'Couro Branco', 'Couro Cinza', 'Couro Bege', 'Couro Marrom', 'Couro Preto',
                 'Borracha Quadrada', 'Borracha Circular']
    }
};

// =============================================================
//  TÉCNICAS DE PERSONALIZAÇÃO
//  TODO: substituir arquivos placeholder pelas fotos reais
// =============================================================
const OPCOES_TECNICAS = {
    'silk3d': {
        nome: 'Silk 3D',
        arquivos: ['./assets/tecnicas/silk3d.jpeg'],
        keywords: ['silk 3d', 'silk', '3d', 'emborrachado'],
        descricao: 'Estampa com relevo emborrachado que proporciona visual moderno e tátil.'
    },
    'bordado3d': {
        nome: 'Bordado 3D',
        arquivos: ['./assets/tecnicas/bordado3d.jpeg'],
        keywords: ['bordado 3d', 'bordado', 'bordada', 'costura', 'linha'],
        descricao: 'Técnica premium com preenchimento que cria relevo alto e sofisticado.'
    },
    'sublimacao': {
        nome: 'Sublimação',
        arquivos: ['./assets/tecnicas/sublimacao.jpeg'],
        keywords: ['sublimacao', 'sublimação', 'full', 'colorido', 'foto', 'fotografia'],
        descricao: 'Ideal para artes complexas, fotografias ou estampas com cores vibrantes em toda a peça.'
    },
    'dtf': {
        nome: 'DTF (Direct to Film)',
        arquivos: ['./assets/tecnicas/dtf.jpeg'],
        keywords: ['dtf', 'direct to film', 'transfer', 'filme'],
        descricao: 'Tecnologia de última geração com alta definição e durabilidade extrema.'
    },
    'patchLaser': {
        nome: 'Patch de Couro Gravado a Laser',
        arquivos: ['./assets/tecnicas/patch-laser.jpeg'],
        keywords: ['patch', 'couro', 'laser', 'gravado', 'rustico', 'premium', 'outdoor'],
        descricao: 'Acabamento artesanal e rústico. Ideal para marcas com conceito outdoor ou premium.'
    },
    'patchSilk': {
        nome: 'Patch de Couro com Silk',
        arquivos: ['./assets/tecnicas/patch-silk.jpeg'],
        keywords: ['patch silk', 'couro com silk', 'couro estampado', 'patch colorido'],
        descricao: 'Combinação da textura do couro com a precisão e coloração da estampa em silk.'
    },
    'dtfRelevo': {
        nome: 'DTF com Relevo',
        arquivos: ['./assets/tecnicas/dtf-relevo.jpeg'],
        keywords: ['dtf relevo', 'dtf com relevo', 'relevo dtf', 'transfer relevo'],
        descricao: 'Une a alta definição do DTF com uma textura diferenciada que salta aos olhos.'
    }
};

// =============================================================
//  REGULADORES
// =============================================================
const OPCOES_REGULADORES = {
    'plastico': {
        nome: 'Regulador Padrão em Plástico',
        adicional: 'R$ 0,00 (incluso)',
        arquivo: './assets/reguladores/regulador-plastico.jpeg',
        keywords: ['regulador plastico', 'padrao', 'sem adicional', 'plastico']
    },
    'metalica_tipo1': {
        nome: 'Fivela Metálica Tipo 01',
        adicional: '+R$ 1,50 por unidade',
        arquivo: './assets/reguladores/metalica-tipo1.jpeg',
        keywords: ['fivela metalica', 'metal tipo 1', 'metalico']
    },
    'metalica_tipo2': {
        nome: 'Fivela Metálica Tipo 02',
        adicional: '+R$ 1,50 por unidade',
        arquivo: './assets/reguladores/metalica-tipo2.jpeg',
        keywords: ['fivela metalica tipo 2', 'metal tipo 2', 'metalico premium']
    }
};

// =============================================================
//  TABELA DE PREÇOS 2025
// =============================================================
const TABELA_PRECOS = {
    essencial_oxford: {
        nome: 'Linha Essencial (Oxford)',
        itens: {
            'Trucker Oxford + Tela Resinada':    [13.99, 13.49, 12.99, 12.49, 11.99],
            'Americano em Oxford':               [14.49, 13.99, 13.49, 12.99, 12.49],
            '6 Gomos Oxford + Tela Resinada':    [15.99, 15.49, 14.99, 14.49, 13.99],
            '6 Gomos Oxford (todo tecido)':      [15.99, 15.49, 14.99, 14.49, 13.99]
        }
    },
    premium_supercap: {
        nome: 'Linha Premium (Supercap / Camurça / Linho)',
        itens: {
            'Trucker Supercap + Tela Resinada':      [15.99, 15.49, 14.99, 14.49, 13.99],
            'Americano em Supercap':                 [16.99, 16.49, 15.99, 15.49, 14.99],
            '6 Gomos Supercap + Tela Resinada':      [16.49, 15.99, 15.49, 14.99, 14.49],
            '6 Gomos Supercap (todo tecido)':        [17.59, 17.09, 16.59, 16.09, 15.59]
        }
    },
    premium_brim: {
        nome: 'Linha Premium (Brim)',
        itens: {
            'Trucker Brim + Tela Resinada':              [17.49, 16.99, 16.49, 15.99, 15.49],
            'Americano em Brim':                         [18.99, 18.49, 17.99, 17.49, 16.99],
            '6 Gomos Brim + Tela Resinada':              [17.99, 17.49, 16.99, 16.49, 15.99],
            '6 Gomos Brim (todo tecido, com estrutura)': [19.99, 19.49, 18.99, 18.49, 17.99],
            'Dad Hat Brim (sem estrutura frontal)':      [19.99, 19.49, 18.99, 18.49, 17.99]
        }
    },
    alfaiataria: {
        nome: 'Linha Alfaiataria',
        itens: {
            'Trucker Alfaiataria + Tela Resinada': [17.99, 17.49, 16.99, 16.49, 15.99],
            'Americano em Alfaiataria':             [19.99, 19.49, 18.99, 18.49, 17.99],
            '6 Gomos Alfaiataria + Tela Resinada':  [18.99, 18.48, 17.99, 17.49, 16.99],
            '6 Gomos Alfaiataria (todo tecido)':    [20.49, 19.99, 19.49, 18.99, 18.49]
        }
    },
    basica: {
        nome: 'Linha Básica (Meia Lua / Tactel)',
        itens: {
            'Meia Lua - DTF ou Silk (frontal + lateral)': [9.99, 9.74, 9.49, 9.24, 8.99],
            'Meia Lua - Bordado (frontal)':               [10.99, 10.74, 10.49, 10.24, 9.99],
            'Tactel - DTF ou Silk (mín. 300 un.)':        [null, null, 8.99, 8.49, 7.99]
        }
    },
    viseira: {
        nome: 'Viseiras',
        itens: {
            'Oxford com TNT':       [8.99, 8.49, 7.99, 7.49, 6.99],
            'Supercap sem Dublagem':[10.49, 9.99, 9.49, 8.99, 8.49],
            'Supercap Premium':     [11.49, 10.99, 10.49, 9.99, 9.49],
            'Microfibra Espumada':  [14.49, 13.99, 13.49, 12.99, 12.49]
        }
    },
    bucket: {
        nome: 'Bucket Hat',
        itens: {
            'Bucket Oxford': [13.79, 13.29, 12.79, 12.29, 11.79],
            'Bucket Brim':   [18.99, 18.49, 17.99, 17.49, 16.99]
        }
    },
    chapeus: {
        nome: 'Chapéus',
        itens: {
            'Chapéu de Proteção (Oxford)': [14.99, 14.49, 13.99, 13.49, 12.99],
            'Chapéu Agro - Juta':          [44.90, 43.90, 42.90, 41.90, 39.90],
            'Chapéu de Palha':             [16.99, 16.49, 15.99, 15.49, 14.99],
            'Cata Ovo':                    [21.99, 21.49, 20.99, 20.49, 19.99]
        }
    },
    outros: {
        nome: 'Outros Modelos',
        itens: {
            'Boné Sport Perfurado a Laser (Premium)': [21.99, 21.49, 20.99, 20.49, 19.99],
            'Five Panel Premium':                     [19.99, 19.49, 18.99, 18.59, 17.99],
            'Ciclista Premium':                       [16.99, 16.49, 15.99, 15.49, 14.99]
        }
    },
    sacochila: {
        nome: 'Sacochila',
        itens: {
            'Tactel sem Bolso':               [8.99, 8.74, 8.49, 8.24, 7.99],
            'Tactel com Bolso TNT':           [9.99, 9.74, 9.49, 9.24, 8.99],
            'Tactel com Bolso Tactel':        [10.49, 10.24, 9.99, 9.74, 9.49],
            'Oxford com Tela Frontal':        [12.99, 12.49, 11.99, 11.49, 10.99],
            'Oxford Sublimada Parcial':       [12.49, 12.24, 11.99, 11.74, 11.49],
            'Oxford Sublimação Total':        [14.99, 14.74, 14.49, 14.24, 13.99]
        },
        adicional_logo: 1.50
    },
    ecobag: {
        nome: 'Ecobag',
        itens: {
            'Ecobag Algodão Cru': [11.59, 11.12, 10.68, 10.25, 9.84]
        },
        adicional_logo: 1.50,
        faixas: ['30-100', '101-300', '301-500', '501-1000', 'acima']
    },
    adicionais: {
        bordado_silk_lateral_ate99:    { desc: 'Bordado ou Silk 3D (lateral/traseiro) — 30 a 99 un.', valor: 1.50 },
        bordado_silk_lateral_100mais:  { desc: 'Bordado ou Silk 3D (lateral/traseiro) — 100+ un.', valor: 1.00 },
        dtf_qualquer_posicao:          { desc: 'DTF (frontal, lateral ou traseiro)', valor: 1.50 },
        apl_frontal_laser:             { desc: 'Aplicação Frontal — Gravado a Laser', valor: 1.50 },
        apl_frontal_silk3d:            { desc: 'Aplicação Frontal — Silk 3D', valor: 2.00 },
        apl_frontal_dtf:               { desc: 'Aplicação Frontal — DTF', valor: 2.00 },
        apl_frontal_sublimado:         { desc: 'Aplicação Frontal — Sublimado', valor: 2.00 },
        apl_lateral_laser:             { desc: 'Aplicação Lateral/Traseiro — Laser', valor: 1.50 },
        apl_lateral_silk3d:            { desc: 'Aplicação Lateral/Traseiro — Silk 3D (1,50 acima de 100 un.)', valor: 2.00 },
        apl_lateral_dtf:               { desc: 'Aplicação Lateral/Traseiro — DTF (1,50 acima de 100 un.)', valor: 2.00 },
        apl_lateral_sublimado:         { desc: 'Aplicação Lateral/Traseiro — Sublimado', valor: 2.00 },
        sublimacao_frente_forro:       { desc: 'Sublimação — Frente ou Forro Interno', valor: 2.00 },
        sublimacao_aba:                { desc: 'Sublimação — Aba (R$3,00 se aba + forro)', valor: 1.50 },
        sublimacao_laterais_traseira:  { desc: 'Sublimação — Laterais e Traseira completa', valor: 3.00 },
        perfuracao_laser_frontal:      { desc: 'Perfuração a Laser — Frontal', valor: 2.00 },
        perfuracao_laser_lateral:      { desc: 'Perfuração a Laser — Lateral e Traseira completa', valor: 3.00 },
        ilhos:                         { desc: 'Ilhós', valor: 0.30 },
        aba_sanduiche:                 { desc: 'Aba Sanduíche', valor: 1.50 },
        regulador_metal:               { desc: 'Regulador de Metal', valor: 1.50 },
        tela_resinada_linha_a:         { desc: 'Tela Resinada Linha (A) — Laterais e Traseira completa', valor: 1.50 }
    },
    faixas_padrao: ['30-100', '101-300', '301-499', '500-1000', 'acima de 1000'],
    obs: 'Produto liso: reduzir R$0,50. DTF: descontar R$0,50 do valor base e fazer simulação por tamanho. Combinações: 20+20 ou 25+25 com o mesmo logo. 25 unidades somente: +R$1,50/un.'
};

module.exports = {
    EMPRESA_INFO,
    CATALOGO_MODELOS,
    NIVEIS_QUALIDADE,
    TECIDOS_E_CORES,
    OPCOES_TECNICAS,
    OPCOES_REGULADORES,
    TABELA_PRECOS
};
