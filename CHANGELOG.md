# Changelog — IA Imperial Bonés Personalizados

## [1.1.0] — 2026-06-23

### 📚 Atualização com documentação completa do cliente

Leitura e incorporação de todos os PDFs e imagens da pasta `/docs`:
- `TABELA DE PREÇOS - ATUAL.pdf`
- `Imperial Bonés Personalizados.pdf`
- `CATÁLOGO - BONÉS e VISEIRAS.pdf`
- `CATÁLOGO CHAPÉUS.pdf`
- `Catálogo de Tecidos e Cores - IMPERIAL.pdf`
- `DESCRIÇÕES 6 GOMOS.pdf`
- `DESCRIÇÕES TRUCKER e AMERICANO.pdf`

### Mudanças em `index.js`

- **EMPRESA_INFO**: pedido mínimo (30 un padrão, 25 com +R$1,50/un), prazo correto (22-24 dias úteis), pagamento (50%+50%), dados bancários Nubank, PIX CNPJ
- **CATALOGO_MODELOS**: descrições expandidas com os 3 níveis de qualidade por produto; Chapéus com todos os 5 tipos (Proteção, Bucket Hat, Juta, Palha, Cata Ovo); preços de referência por nível
- **NIVEIS_QUALIDADE** (novo): constante com specs completas Básico (Tactel), Essencial (Oxford), Premium (Supercap + Brim)
- **TECIDOS_E_CORES** (novo): paleta completa por material — Supercap (24 cores), Oxford, Tela Paranaense, Tela Resinada, Alfaiataria, Brim, Camurça, Especiais para aba
- **gerarRespostaIA**: prompt atualizado com descrições completas de chapéus, técnicas por nível, tabela de preços, cores, pedido mínimo e pagamento
- **recomendarModelos**: novos gatilhos — praia/festival, sertanejo/agro → chapéus; fitness/tenis → viseira
- **extrairInformacoesComIA**: mapeamento dos tipos de chapéu (juta, bucket, palha, cata ovo, proteção)

### Pendências de configuração

- [ ] Fotos dos produtos em `assets/modelos/`
- [ ] Fotos das técnicas em `assets/tecnicas/`
- [ ] Fotos dos reguladores em `assets/reguladores/`
- [ ] Configurar `.env` com chaves reais

---

## [1.0.0] — 2026-06-23

### 🚀 Lançamento inicial

- Projeto criado baseado na IA Bonés Ramalho (v2.0.0)
- Adaptado para Imperial Bonés Personalizados (Serra Negra do Norte-RN)
- Modo: ChatClean Webhook (sem WhatsApp Web / QR Code)
- Catálogo inicial de 6 produtos, 7 técnicas, 3 reguladores
