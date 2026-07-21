# 📸 Imagens dos Produtos — Imperial Bonés

## Estrutura de Pastas

```
modelos/       → fotos dos produtos
tecnicas/      → exemplos das técnicas de personalização
reguladores/   → opções de regulador
cores-tecidos/ → cartelas de cores por tecido
prova-social/  → prints de avaliações/depoimentos
```

## 📂 modelos/ (produtos que o bot envia)

Ligados no `data.js` (campo `arquivo` de cada modelo):
```
americano.png        → IB_SNAP (Snapback / Americano)
trucker.png          → IB_TRUCK
dad-hat.png          → IB_DAD
chapeu-protecao.png  → IB_CHAP (chapéu principal = líder de vendas)
viseira.png          → IB_VIS
sacochila.png        → IB_BOLSA (líder de vendas entre as bolsas)
```

✅ Todos os 6 modelos do `CATALOGO_MODELOS` têm imagem.

Extras na pasta, ainda NÃO ligados no código:
```
6gomos.png            (boné 6 gomos)
ecobag.png            (bolsa — alternativa à sacochila)
chapeu-bucket.png
chapeu-juta.png
chapeu-palha.png
chapeu-cata-ovo.png
meia-lua.png          (Linha Básica)
linha-essencial.png   (composto Trucker+Americano+6 Gomos Oxford)
outros-premium.png    (composto Esportivo/Ciclista/Five Panel)
```

## 📂 prova-social/

```
depoimentos.png    (print de avaliações do Google)
depoimentos-2.png  (idem — outro print)
```
> Não ligados no código.

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
tactel.jpeg          (linha básica — 100% poliéster)
```

> Oxford não tem cartela própria no catálogo (usa cores equivalentes à Tela). Estas imagens ainda NÃO estão ligadas no código — `TECIDOS_E_CORES` só tem as cores em texto. Para o bot enviar as cartelas, adicionar um campo de arquivo em cada tecido + um gatilho no fluxo (ex.: quando o cliente pergunta as cores).

---

**IMPORTANTE:** Respeite EXATAMENTE os nomes dos arquivos (minúsculas com hífens)
