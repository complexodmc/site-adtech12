# 03 · Seis Eixos (`#features`) — parciais
1. `eixos.html`: fragmento `<section>` completo (6 `article#eixo-1..6`, `ol.eixos-grid` 3×2, `details.eixos-catalogo` com 21 links); copy de `copy.json › eixos`, sem alteração.
2. `eixos.css` (4,9 KB / 1,6 KB gz): só tokens; sem literal de cor, `all`, sombra, raio, `!important`; breakpoints 768/1024/1440.
3. `icones-eixos.svg` (1,8 KB): 6 `<symbol id="ico-e1..e6">` 24×24, traço 1.5, geometria da §3·03; colar como `<svg hidden>` primeiro filho de `<main class="home">`.
4. Integração: colar o HTML depois de `#conheca`; concatenar `eixos.css` em `home.css` depois de `_shared.css`. Sem JS (details nativo, `:target` por CSS).
5. `--num-font` vem de `.home` (_shared.css §2.3); o CSS tem fallback com o mesmo valor, então lê igual no design-preview.
6. O fio `.eixos-item::before` (§2.4) está declarado aqui; se `_shared.css` também o declarar, apagar um dos dois (mesmo resultado).
7. Desvio da spec: `li > a` do catálogo usa `display:flex; min-height: var(--hit)` — `padding-block:.55em` sozinho dava 36 px, abaixo de 44.
8. Validado com Playwright em 320/390/768/1024/1440: 0 px de overflow (fechado e aberto), 6 artigos, 0 `hidden`/`role=tab`, 6 `use` distintos desenhados, CTAs e links ≥ 44 px, `details` fechado com 21 links, `#eixo-4` em viewport com fio aberto via `:target`, Tab percorre os CTAs em ordem.
9. Capturas em `preview/eixos-{320,390,768,1024,1440}.png` + `-catalogo`, `-target`, `-focus`. Porta 4653 estava ocupada por processo de terceiro (PID 57820, não encerrado); usei 4654.
10. Pendências do CEO preservadas em comentários no HTML: [CEO 2] rótulos alternativos, [CEO 10] `contabilidade.html`, [CEO 12] "Jurídico".
