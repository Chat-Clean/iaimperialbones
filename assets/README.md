# 📸 Imagens dos Produtos — Imperial Bonés

## Estrutura de Pastas

```
modelos/       → fotos dos produtos
tecnicas/      → exemplos das técnicas de personalização
reguladores/   → opções de regulador
cores-tecidos/ → cartelas de cores por tecido
```

## 📂 modelos/ (6 arquivos obrigatórios)

```
snapback.jpeg
trucker.jpeg
dad-hat.jpeg
chapeu.jpeg
viseira.jpeg
bolsa.jpeg
```

## 📂 tecnicas/ (7 arquivos obrigatórios)

```
silk3d.jpeg
bordado3d.jpeg
sublimacao.jpeg
dtf.jpeg
patch-laser.jpeg
patch-silk.jpeg
dtf-relevo.jpeg
```

## 📂 reguladores/ (3 arquivos obrigatórios)

```
regulador-plastico.jpeg
metalica-tipo1.jpeg
metalica-tipo2.jpeg
```

## 📂 cores-tecidos/ (1 cartela por tecido)

Nomes batem com as chaves de `TECIDOS_E_CORES` no `data.js`:

```
supercap.jpeg
oxford.jpeg          (opcional — não há página no catálogo Cores & Materiais)
tela-paranaense.jpeg
tela-resinada.jpeg
alfaiataria.jpeg
brim.jpeg
camurca.jpeg
especiais.jpeg       (materiais especiais para aba)
```

> Ainda NÃO estão ligadas no código — `TECIDOS_E_CORES` hoje só tem as cores em texto. Para o bot enviar essas cartelas, é preciso adicionar o campo de arquivo em cada tecido e um gatilho no fluxo (ex.: quando o cliente pede a cor).

---

**IMPORTANTE:** Respeite EXATAMENTE os nomes dos arquivos (minúsculas com hífens)
