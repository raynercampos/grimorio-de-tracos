# Grimório de Traços

Transforma fotos em decalques simplificados para pintar em tela. Funciona offline e pode ser instalado no Android (PWA).

- Entrada: câmera, galeria, "Compartilhar" de outros apps e colar imagem.
- Recorte pelas medidas reais da tela (20×30 até 80×100 cm, A4, A3, proporção da foto ou personalizado).
- Estilos: contorno limpo, esboço a lápis, contorno + sombras (hachura ou manchas) e manchas com números (pintura por números).
- Quadriculado com letras e números, na escala real da tela.
- Exportação: PNG, PDF A4 e PDF em tamanho real dividido em folhas A4 com guia de montagem, mais legenda de cores e paleta.
- Todo o processamento acontece no aparelho. Nenhuma imagem é enviada para a internet.

## Publicar (GitHub Pages)

Settings → Pages → Deploy from a branch → `main` / `(root)`. O endereço será `https://<usuario>.github.io/<repositório>/`.

## Instalar no Android

Abrir o endereço no Chrome → menu ⋮ → **Instalar app** (ou **Adicionar à tela inicial**).

## Estrutura

- `index.html`, `style.css`: interface.
- `engine.js`: motor de decalque (bordas, tons, k-means em Lab, números). Roda em Web Worker.
- `export.js`: gerador de PDF próprio, folhas A4, legenda e paleta.
- `app.js`: lógica do app (recorte, ajustes, galeria local em IndexedDB).
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: instalação, modo offline e recebimento de imagens pelo "Compartilhar".

Ao alterar qualquer arquivo, aumente a versão em `CACHE` no `sw.js` para o celular atualizar.
