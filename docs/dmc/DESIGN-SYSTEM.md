# DMC PRIME — DESIGN SYSTEM (direção C · Híbrido Executivo)

Tokens: `complexodmc.com.br/assets/css/tokens.css` (mapa antigo → novo no cabeçalho).
Prévia: `docs/dmc/design-preview.html` · capturas em `docs/dmc/qa/2026-10-17/`.

## 1. Princípios
1. **Autoridade por subtração**: preto, grafite, branco; ouro só na ação principal, linha ativa e foco.
2. **Editorial, não catálogo**: fio de 1px, numeração e respiro; caixa só para mídia.
3. **Mesma forma, outra cor**: o eixo troca só `--np-accent`.
4. **Tecnologia como textura**: rede neural discreta na mídia; sem brilho, neon ou aura.
5. **Mobile primeiro, AA medido**: alvo ≥44px, zero overflow de 320 a 1920.

## 2. Cor
O logotipo real não tem dourado: 83% é petróleo/turquesa; o realce quente é o limão do chifre (`#c2f653`, oklch .91 .19 125). O ouro `#d6b069` é esse realce no matiz do metal (oklch .775 .10 82).

- **Fundos** `--surface-0…3`: `#0b0c0e` `#121416` `#1a1c1f` `#24272a`. **Papel** (seção clara): `#f5f3ef`.
- **Texto sobre escuro** `--text-1/2/3`: 17,7 · 10,4 · 6,8:1. **Sobre papel** `--text-ink-1/2/3`: 17,7 · 7,7 · 5,4:1.
- **Borda de campo** `--color-control`: 3,1:1 (componente de UI).

Eixos: mesma luminosidade (oklch L .74), croma baixo, só o matiz muda. E4 vira cobre (âmbar colidia com o ouro); E6 segue violeta. `accent` = sobre escuro, `deep` = sobre papel, `soft` = realce.

| Eixo | accent · deep · soft | acc×preto | acc×grafite-700 | deep×papel-2 | soft×preto |
|---|---|---|---|---|---|
| Casa (ouro) | `#d6b069` `#82602e` `#e7d3b1` | 9,57 | 7,35 | 4,60 | 13,37 |
| E1 petróleo | `#76b7c1` `#356e77` `#bddde2` | 8,68 | 6,66 | 4,62 | 13,61 |
| E2 sálvia | `#88b89d` `#466e59` `#c5ddcf` | 8,75 | 6,71 | 4,64 | 13,62 |
| E3 ardósia | `#8caed7` `#4d688a` `#c7d8ed` | 8,53 | 6,54 | 4,60 | 13,49 |
| E4 cobre | `#d49d7f` `#885c42` `#eccfc0` | 8,32 | 6,38 | 4,61 | 13,28 |
| E5 rosé | `#d697a1` `#8c5761` `#eeccd1` | 8,20 | 6,29 | 4,62 | 13,23 |
| E6 violeta | `#b39edb` `#6f5d8f` `#dad0ef` | 8,23 | 6,31 | 4,63 | 13,28 |

WCAG 2.x, recalculado ao vivo na prévia. Todos AA (≥4,5); preto sobre ouro 9,6:1.

## 3. Tipografia
- **Display — Newsreader 300 + itálico** (opsz 48, ~48 KB): display, H1 e H2. O itálico substitui a "palavra em degradê".
- **Texto — Hanken Grotesk 400–600** (35 KB): H3, H4, corpo, UI e dados (`--font-numeric`). Peso máximo 600.
- Link único com `display=swap` (topo do tokens.css); depois, self-host em `assets/fonts/`.
- Escala fluida de 320 a 1440px:
  - display 40→88
  - H1 36→64
  - H2 30→48
  - H3 22→32
  - lead 18→22
  - corpo 16→17, com altura de linha 1,65
  - overline 12, caixa-alta, 0,16em
- Parágrafo com no máximo 38rem.

## 4. Grid, espaço, forma
- **Colunas**: 4 até 767px, 8 de 768 a 1023, 12 a partir de 1024.
- **Medidas**: container 1240, `--gutter` 16→48, `--grid-gap` 16→32.
- **Espaço**: escala 4/8 (`--space-1…13`); seção 64→144; entre blocos 40→80.
- **Raio**: 2px (botão, campo), 4px (mídia), 8px no máximo; nada de pílula.
- **Sombra**: só em sobreposições; no resto, fio.

## 5. Movimento
- **Durações**: 160 / 240 / 400 / 700 / 1200 ms, com `--ease-out` e `--ease-exit`; stagger ≤80ms.
- **Propriedades**: deslocamento só com `transform`/`opacity`; troca de cor de estado é permitida. Nunca `all`, `box-shadow`, `width` ou `top`.
- **Revelação**: opacidade + 16px, uma vez só, nunca em conteúdo crítico.
- **Reduced-motion**: tokens a 1ms, vídeo vira poster, 3D fica estático.

## 6. Componentes
**Navbar**
- Fixa, 64/72px. Transparente sobre o herói; translúcida (`--surface-glass` + blur 16) após 24px de rolagem.
- Marca branca + "COMPLEXO **DMC**", com DMC em ouro.
- A partir de 1024px: Eixos ▾, A casa, Conteúdo, Contato e CTA secundário.
- **Mega-menu**: `button[aria-expanded]` abre um painel de largura total com grade 3×2 dos eixos (número no acento, nome, frase de escopo). Fecha com Esc, clique fora ou perda de foco.
- **Mobile** (<1024px): botão "Menu" 44px abre gaveta em tela cheia: eixos em sanfona, foco preso, rolagem travada, foco devolvido ao fechar.

**Herói**
- **Mobile**: mídia na metade superior e texto embaixo, sobre véu sólido.
- **A partir de 768px**: véu lateral `--hero-veil` (.86) até 42% da largura (62% entre 768 e 1023), caindo para .6 e depois 0. O texto fica sempre sobre véu ≥ .80, o que dá AA no pior caso.
- **Conteúdo**: overline, display (≤15ch), lead (≤34rem), um primário e um link. Sem selo, sem efeito de digitação.
- **Vídeo**: MP4+WebM ≤4 MB, 9:16 <800 KB via `<source media>`, poster, `preload=metadata`. Dourado da prévia = filtro CSS provisório; definitivo regradado no ffmpeg.

**Painel dos seis eixos**
- **Abas**: `role=tablist` com seis `role=tab`, cada uma com sua `np-pillar-*`. Mostram número e nome; a ativa ganha fio de 2px no acento (`scaleX`). Navegação por setas, Home e End, com tabindex móvel.
- **Painel**: mídia do eixo (4:5 no desktop, 16:10 no mobile), overline, H2, lead, 3 diferenciais numerados com fio, CTA secundário e link "N soluções".
- **Troca**: fade + 16px, texto 80ms depois da mídia.
- **Grade das abas**: 2, 3 ou 6 colunas, sem rolagem horizontal.
- **Estado inicial**: E1; `#eixo-N` abre direto; sem JS, painéis empilhados.

**Páginas internas (8 blocos)**, com `<body class="np-eixo np-pillar-X">`:
1. Herói em duas colunas
2. Para quem e quando
3. O que entregamos (grade 01–06 com fio, `.benefit-grid`)
4. Como conduzimos (etapas)
5. Fundamento e diferenciais (seção papel)
6. Perguntas frequentes (`<details>`)
7. Em vídeo (`#video`)
8. Conversa (CTA + formulário curto)

**Receita de migração de página interna** (pilotos: `pages/planejamento-sucessorio.html`, `solucoes/consultoria-trabalhista/ciclo-fechado.html`). Só HTML da página; **não editar** `eixos.css`, `shared.css`, `solucao.css`, `components.css`, `tokens.css` (a camada já cobre as 26 páginas).
1. **`<head>`**, nesta ordem (copiar do piloto, trocando `../` por `../../` em `/solucoes`): `<html lang="pt-BR" data-root="../">`; `canonical` igual ao `sitemap.xml`; `theme-color #0b0c0e`; preconnect + preload + Google Fonts (Newsreader/Hanken, `media=print onload`, `<noscript>`) — **o mesmo link da home**; `rel=icon` `assets/images/favicon-dmc.png` (64×64) + `rel=apple-touch-icon` `assets/images/apple-touch-icon.png`; `tokens.css?v=1` → `shared.css?v=3` (ou `consultoria-imobiliaria.css`) → `solucao.css?v=3` (só em `/solucoes`) → `eixos.css?v=4` → `components.css?v=2`; scripts `defer`: `navbar.js?v=c1`, `solucao.js?v=3`, `video.js?v=1`.
2. **Apagar**: links de DM Sans/Raleway/Poppins/Inter/Allura; Font Awesome (trocar `<i class="fa…">` por SVG inline `aria-hidden` ou remover se decorativo); todo `<style>` inline; scripts inline de menu, reveal, FAQ, malha (`#tech-net-*`) e **chromakey** (`canvas` + `getImageData`); `.stats-marquee`, `.sol-tags`, `.page-hero__glow`, `.benefit-card__icon/__tag`, `.np-ico`, `.process-step__number`; SVG do selo; sigla da malha (`PS`, `CF`…); iframe do YouTube solto na página.
3. **`<body class="np-eixo np-pillar-X">`** (+ `sol-page` em `/solucoes`). Sem eixo (Tecnologia, Privacidade): só `np-eixo` → ouro.
4. **Menu e atalho**: `<dmc-navbar data-over>` com fallback sem JS dentro (`a.dmc-skip[href="#conteudo"]` + `header.dmc-nav` com marca e "Menu" → `#rodape`), copiado do piloto. Tudo o que é conteúdo — herói, seções, vídeo e CTA — dentro de `<main id="conteudo">`; rodapé `footer.dmc-footer#rodape` (o da home, caminhos ajustados, `aria-current="page"` no eixo).
5. **Herói**: `section.page-hero` (não `<header>`) → `.page-hero__inner` → `.page-hero__content` (`p.page-hero__badge` "EN · Nome", `h1.page-hero__title` com `<em>` no lugar de `.gradient-text` e **sem `<br>`**, `p.page-hero__subtitle`, `.page-hero__actions` com **um** `a.dmc-btn.dmc-btn--primary` + seta SVG e um `a.dmc-btn.dmc-btn--link`) + `.page-hero__visual[aria-hidden]` > `.sol-net` > `canvas.sol-net__canvas` (malha do `solucao.js`, sem sigla). Um único H1.
6. **Rinoceronte** (onde havia chromakey): `<video class="np-rino" muted loop playsinline preload="none" poster="…/rino-alpha-poster.webp" width="480" height="480" disablepictureinpicture disableremoteplayback tabindex="-1">` com `<source …rino-alpha-gold.mov type='video/mp4; codecs="hvc1"'>` e `<source …rino-alpha-gold.webm type="video/webm">`, ambos com `media="(prefers-reduced-motion: no-preference)"`, dentro de `.np-mapa__media[aria-hidden]`. **Sem `autoplay` no HTML** (o atributo baixa 0,8 MB na carga mesmo fora da tela; Lighthouse mobile caiu para 77): `solucao.js` dá play a 200px da tela e pausa fora; sem JS ou com movimento reduzido fica o poster.
7. **Seções**: `.page-section` > `.page-section__container.reveal` > `.page-section__header` (overline, H2 com `<em>`, descrição). Grade "O que entregamos" = `.benefit-grid` > `article.benefit-card` (título + texto; o número vem do CSS). Etapas = `ol.process-grid` > `li.process-step`. Soluções do eixo = `.np-mapa` (rino + `.sol-related` > `a.np-card`). Painel que só abre no hover vira `.np-compare` (duas colunas abertas). "Fundamento e diferenciais" = `section.page-section.dmc-on-paper#fundamento` (papel). `.reveal` nunca no herói.
8. **FAQ**: `<details class="faq-item" name="faq">` > `summary.faq-item__question` (texto + SVG `+` `aria-hidden`) > `.faq-item__answer` > `.faq-item__answer-inner`. Sem script; manter o JSON-LD `FAQPage` igual ao texto.
9. **Vídeo**: `section#video` antes da conversa, dentro do `<main>`; ID do YouTube em `data-video` (nunca iframe direto); fallback sem JS = link "Assistir no YouTube".
10. **Conversa**: `section.cta-section.dmc-on-paper#conversa` com `dmc-btn--primary` (WhatsApp) + `dmc-btn--secondary` para `../?assunto=EN#contact` (`../../?assunto=EN#contact` em `/solucoes`; N = eixo). Usar a raiz `../`, **não** `../index.html` (301 no `vercel.json`).
11. **Medir**: 0 overflow em 320–1920, 0 erro de console, 0 4xx, H1 em Newsreader 300 e corpo em Hanken (`getComputedStyle`), Lighthouse mobile ≥ 90 com CLS < 0,1, `npx playwright test --grep "<página>"`.

Por que a camada funciona antes da migração: `eixos.css` importa `tokens.css` (sem isso o herói pulava quando o `navbar.js` injetava os tokens — CLS 1,0–1,3), zera a altura de `<dmc-navbar>`, redeclara `--font-display`/`--font-primary` no `body.np-eixo` (venciam no `:root` de `shared.css`) e usa fallback local com `size-adjust` (Iowan/Palatino/Georgia e Arial) para a troca de fonte não mudar a quebra de linha.

**Botões**
- **Primário**: ouro com texto preto; hover `--color-gold-soft`. Sobre papel: fundo preto, texto papel.
- **Secundário**: fio `--color-line-strong`, seta no acento; no hover, a borda assume o acento.
- **Link**: sublinhado, offset .5em.
- **Medidas**: altura 48px (link 44), texto 14px/600.
- **Foco**: outline ouro de 2px, offset 3. Inativo: opacidade .4.
- Um primário por dobra.

**Formulário**
- Label visível acima do campo. Campo de 48px, borda `--color-control`, raio 2px.
- Erro com texto e ícone, ligado por `aria-describedby`; sucesso em `role=status`; `aria-busy` durante o envio.
- Honeypot e consentimento LGPD.

**Rodapé**
- `--surface-1`, em 4, 2 ou 1 coluna: marca, eixos, a casa, contato/legal.
- Links de 44px no mobile; legal em `--text-3` (6,4:1); linha do Provimento 205/2021.

## 7. Breakpoints
| Largura | Comportamento |
|---|---|
| 320 | Mínimo, com marca compacta |
| 375/390 | Base do mobile |
| 768 | Abas em 3 colunas; véu lateral |
| 1024 | Navegação completa; 6 abas; 12 colunas |
| 1440 | A escala trava |
| 1920 | Container centrado |

Prévia verificada nas sete larguras: 0 overflow, 0 alvo <44px.

## 8. Cortar
- Chips, `.np-tag`, pílulas, `.np-aura`.
- Degradês neon, texto em degradê, brilho via `box-shadow`.
- Font Awesome (vira ~8 SVGs inline).
- Selos em inglês e contadores sem fonte.
- `transition: all`.
- Fontes Poppins, Inter, Raleway, DM Sans e Allura.
- Card para tudo.

## 9. Aval do CEO
1. **Tom do ouro** (cor nova da marca): `#d6b069` latão claro; alternativas champanhe `#c9b48a` ou ouro velho `#b8914f`.
2. **Fontes**: serifa display + grotesca, padrão de consultoria estratégica; se soar "jurídico", só Hanken.
3. **Logotipo**: marca branca na interface; o rinoceronte turquesa/limão fica na EAD.
4. **E4**: cobre no lugar do âmbar.
