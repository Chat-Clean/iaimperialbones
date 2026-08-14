// =============================================================
//  PORTAS DA APLICAÇÃO — contratos (JSDoc, sem código)
//  Em JavaScript não há `interface`: o contrato é documentado aqui e
//  garantido pelos fakes dos evals/testes, que implementam as mesmas
//  assinaturas. O container (src/main/container.js) é o único lugar
//  que conhece os adapters concretos.
// =============================================================

/**
 * @typedef {object} CanalDeMensagem
 * Fala com o cliente final (hoje: ChatClean Push API; nos evals: mock).
 * Nunca lança — loga e devolve false.
 * @property {(chatId: string, texto: string) => Promise<boolean>} enviarMensagem
 * @property {(chatId: string, texto: string) => Promise<void>} enviarMensagensQuebradas  Quebra por linha com atraso de "digitação".
 * @property {(chatId: string, arquivos: string[], legenda?: string) => Promise<boolean>} enviarImagens
 */

/**
 * @typedef {object} NotificadorDeEquipe
 * Entrega o resumo do lead qualificado (nota no ticket + WhatsApp da equipe).
 * @property {(leadData: object, chatId: string, opcoes?: {tagExtra?: string}) => Promise<boolean>} notificarEquipe
 */

/**
 * @typedef {object} RepositorioDeAtendimento
 * Estado das conversas + memória durável de cliente (Redis com reserva em memória).
 * @property {(chatId: string) => Promise<object|null>} buscarLead
 * @property {(chatId: string, leadData: object) => Promise<void>} salvarLead
 * @property {(chatId: string) => Promise<void>} removerLead
 * @property {() => Promise<string[]>} listarIds            Para o varredor de follow-up e o /analytics.
 * @property {(registro: object) => Promise<void>} registrarLeadFinalizado
 * @property {(chatId: string) => Promise<object|null>} buscarCliente          Memória de recompra (Fase 4).
 * @property {(chatId: string, dados: {nome?: string, pedido?: object}) => Promise<object>} registrarPedidoCliente
 * @property {() => boolean} ehDuravel                       true quando o estado sobrevive a restart (Redis).
 */

/**
 * @typedef {object} Llm
 * Cliente de chat-completion com retry/backoff (429/5xx) embutido.
 * @property {(params: object) => Promise<object>} completar   Espelha openai.chat.completions.create.
 */

/**
 * @typedef {object} ExtratorDeInformacoes
 * Extrai campos estruturados da mensagem (fluxo legado). null quando falhou —
 * o turno segue sem novos campos (falha esperada é valor, não exceção).
 * @property {(mensagem: string, campoAtual: string|null, historico: Array, modelosEnviados: string[]) => Promise<object|null>} extrair
 */

/**
 * @typedef {object} RedatorDeResposta
 * Redige as respostas do fluxo legado.
 * @property {(ctx: object) => Promise<string|null>} redigir
 * @property {(leadData: object, mensagemCliente: string, historico: Array) => Promise<string>} redigirPosPedido
 * @property {(leadData: object, descricaoImagem: string|null, historico: Array) => Promise<string>} redigirAckImagem
 */

/**
 * @typedef {object} LeitorDeImagem
 * @property {(url: string, leadData?: object) => Promise<string|null>} descrever   null quando não leu; o turno segue.
 */

/**
 * @typedef {object} TranscritorDeAudio
 * @property {(entrada: {buffer: Buffer, mimetype?: string}) => Promise<string>} transcrever   LANÇA em falha — o chamador decide o que dizer.
 */

/**
 * @typedef {object} GeradorDeMockup
 * @property {(chatId: string, leadData: object) => Promise<boolean>} gerar   Prévia da logo aplicada (gpt-image-1).
 */

/**
 * @typedef {object} BaixadorDeMidia
 * @property {(url: string, timeoutMs?: number) => Promise<Buffer>} baixar
 */

/**
 * @typedef {object} Dependencias
 * Conjunto completo entregue pelo composition root à aplicação.
 * @property {CanalDeMensagem} canal
 * @property {NotificadorDeEquipe} notificador
 * @property {RepositorioDeAtendimento} repositorio
 * @property {Llm} llm
 * @property {ExtratorDeInformacoes} extrator
 * @property {RedatorDeResposta} redator
 * @property {LeitorDeImagem} leitorDeImagem
 * @property {TranscritorDeAudio} transcritor
 * @property {GeradorDeMockup} mockup
 * @property {BaixadorDeMidia} baixadorDeMidia
 * @property {{promptAgente: Function, promptExtracao: Function, promptResposta: Function}} prompts
 */

module.exports = {};
