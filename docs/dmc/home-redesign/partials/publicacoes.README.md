# 07 · Publicações — `#publicacoes`

Parciais: `publicacoes.html` (fragmento da `<section>`), `publicacoes.css` (bloco `/* ==== 07 · PUBLICAÇÕES ==== */`). Sem JS.
Spec: `docs/dmc/HOME_REDESIGN.md` §3·07 (S8). Copy: `copy.json › publicacoes` (aplicada literalmente).
Prévia: `preview/_preview-07-08.html` (servir a raiz do repositório; não publicar) · capturas `preview/publicacoes-{320,375,390,768,1024,1440,1920}.png`.

## Composição
- Papel (`.dmc-on-paper`), corte com o preto de 06; abre o bloco 07+08+09. **Sem imagem, sem caixa, sem sombra.**
- `.publi-grid`: 4 col (<768) → 8 col (768) → 12 col (≥1024). Head `1 / -1`; destaque `1 / span 7`; aside `9 / span 4` com fio à esquerda (`--color-line-ink`) e `padding-left: var(--space-6)`. Abaixo de 1024 o aside vai para baixo com fio no topo. `align-items: stretch` → aside com a altura do destaque (medido: 273/273 em 1024, 290/290 em 1440).
- Destaque: `__eixo` em `rgb(var(--np-accent-deep))` (E1 petróleo, 14/500, 4,6:1), `time` `--text-ink-3`, título Newsreader 300 `--fs-h2` `max-width: 18ch`, texto `--text-ink-2` `max-width: 32rem`, CTA `.dmc-btn--link` com seta na cor do eixo. Cor do eixo só no E-n e na seta.
- Aside "Em preparação": `.publi-proximas.publicacoes__vazio`; dois `li` com fio no topo e traço de 2 rem × 1 px (`aria-hidden`); CTA "Receber quando sair" → `#newsletter`, seta em `--color-gold-deep`. Sem título fictício, sem data, sem "em breve", sem Provimento.
- Revelação: `.dmc-reveal` + `style="--i:n"`; a regra de stagger (`transition-delay: calc(var(--stagger) * min(var(--i,0), 5))`) está escopada em `.publi` — `_shared.css` não a declara (mesmo padrão de `verticais.css`). `scroll-margin-top` vem de `_shared.css` (`.home section[id]`).
- Depende de `_shared.css`: `--num-font` (há fallback em `var()`), `.home .dmc-sec-head`.

## Estados
- `:hover` do link: sublinhado passa a `--np-accent-deep` (components.css) + seta `translateX(4px)`.
- `:focus-visible`: outline ouro-profundo (`--focus-color-ink`, herdado de `.dmc-on-paper`). Alvos 44 px (medido).
- Reduced motion: tokens colapsam para 1 ms; nada próprio.

## Medições (Chromium, DPR 1)
Overflow horizontal: 0 px em 320/375/390/768/1024/1440/1920. CTAs 44 px. 1920 = container centrado.

## Pendências / decisões a confirmar
- **[CEO 7]** O `<time datetime="2026-10-17">Revisado em 17 out 2026</time>` está renderizado conforme a tarefa; `copy.json` pede `exibir:false` até o CEO confirmar a revisão editorial e por quem. Para ocultar basta apagar o elemento `<time>` (o teste de `contratos-qa` §2.5 tolera ausência). Se aprovado, o texto passa a "Revisado em 17 out 2026 por <função habilitada>".
- Quando houver 3 publicações reais: o aside sai e o grid vira três `article.publicacao` (`span 4`) com a mesma anatomia (meta, título em `--fs-h3`, uma linha, link), `time` ISO ≤ hoje.
- Contratos (§2.5): link → `pages/por-que-urgente.html` (existe, no sitemap); 0 `lorem|título do artigo|em breve` fora de `.publicacoes__vazio`; sem JSON-LD `Article`.
