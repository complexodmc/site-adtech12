# Verticais de Negócio — gerador

Seção `/verticais-de-negocio/` (índice + 9 segmentos). Site estático: o HTML gerado é commitado.

- `dados.mjs` — fonte única de conteúdo (prompt do CEO de 2026-10-18; vertical 8 a partir de `dores[1]` e vertical 9 inteira redigidas pela equipe, `revisao_pendente: true`). Guarda `case.cliente_interno`, que **nunca** vai ao HTML (o gerador aborta se vazar); o nome do cliente só sai com `case.autorizado: true` + `case.cliente_publico`.
- `gerar.mjs` — único template → `complexodmc.com.br/verticais-de-negocio/{index.html,<slug>/index.html}`. `--check` só confere (falha se o HTML em disco divergir).
- Camada visual: `assets/css/verticais.css`; formulário: `assets/js/verticais.js` → `POST /api/contato` (campos `segmento`, `faturamento`, `patrimonio`, `motivo` em `server/src/routes/contato.js`).
- Menu "Segmentos" e coluna do rodapé: lista espelhada em `assets/js/navbar.js` (`SEGMENTOS`) — mudou slug/nome, mude lá também.
- Mídia dos heróis: `tools/midia-verticais/` (Three.js, procedural) → `assets/{images,videos}/verticais/`.

```sh
node tools/verticais/gerar.mjs          # regenera as 10 páginas
node tools/verticais/gerar.mjs --check  # CI / pré-commit
```
