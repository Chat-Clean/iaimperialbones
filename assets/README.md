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

## 📂 cores-tecidos/ (1 cartela por tecido — .png)

Nomes batem com as chaves de `TECIDOS_E_CORES` no `data.js`:

```
capa.png             (capa "Cores & Materiais")
supercap.png
tela-paranaense.png
tela-resinada.png
alfaiataria.png
brim.png
camurca.png
especiais.png        (materiais especiais para aba)
```

> Oxford não tem cartela própria no catálogo (usa cores equivalentes à Tela). Estas imagens ainda NÃO estão ligadas no código — `TECIDOS_E_CORES` só tem as cores em texto. Para o bot enviar as cartelas, adicionar um campo de arquivo em cada tecido + um gatilho no fluxo (ex.: quando o cliente pergunta as cores).

---

**IMPORTANTE:** Respeite EXATAMENTE os nomes dos arquivos (minúsculas com hífens)
