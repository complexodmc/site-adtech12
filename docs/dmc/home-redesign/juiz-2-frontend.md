# Juiz 2 — lente: engenheiro frontend sênior (HTML/CSS/JS puro, Lighthouse ≥ 95, axe limpo)

Lidos na íntegra: `fatos.md`, `inventario-frontend.md`, `spec-A.md`, `spec-B.md`, `spec-C.md`.
Conferidos no repositório: `.form-field/.form-consent/.form-message` estão escopados a `.dmc-form`
(`styles.css` 1018-1030) — o form da newsletter precisa da classe `dmc-form`; `rino-alpha-gold.webm`
= 820 KB e `.mov` = 1,27 MB; CSP `connect-src 'self'` (report-only) em `vercel.json`;
`html { scroll-behavior: smooth }` em `styles.css` 29.

Escala 0–10 por critério; total = soma (máx. 60).

| Critério | A Editorial | B Cinematic | C Conversion |
|---|---|---|---|
| Fidelidade ao brief + direção C | 7 | 8 | 8 |
| Narrativa sem repetição (Casa / Eixos / Por que) | 7 | 8 | 5 |
| Viabilidade na stack estática + tokens | 9 | 7 | 7 |
| Risco perf/a11y (10 = risco mínimo) | 9 | 6 | 8 |
| Persuasão comercial | 6 | 8 | 8 |
| Mobile | 7 | 7 | 7 |
| **Total** | **45** | **44** | **43** |

## A — Editorial-first (45)

**Por que pontua bem.** É a única que o frontend implementa quase sem JS novo: um canvas na página,
zero vídeo extra, grid 3×2 por `border`+`::before`, `:target` sem script, `home.css` ≈ 12 KB. Mapa de
estilos linha a linha coerente com o inventário. Orçamento de performance realista (HTML ≤ 70 KB,
≤ 1,5 MB sem vídeo). Preserva todos os 21 links de solução no próprio card.

**Onde perde.** (1) Fidelidade: proíbe zoom/paralaxe/loop nas verticais, em choque direto com a direção
de imagem do CEO (D9: "com movimento, loop curto ≤ 6 s"); as mídias de 05 em 6 colunas emolduradas em
papel são "fotos de revista", não "painéis fotográficos grandes". (2) Persuasão: a Casa vira um `<dl>`
(Natureza/Eixos/Execução/Método) — correto e seco; descarta as seis falas na voz do cliente, o melhor
texto comercial da home atual. (3) Repetição: "Execução por parceiros" aparece na ficha de 02 e no item 3
de 04; "Método" na ficha de 02 e na seção 08 inteira; "seis eixos, uma governança" em 02, 03 (H2) e 04.

**Riscos concretos.**
- `.porque-panel::before { inset: 0 -100vw 0 0; z-index: -1 }`: sem `isolation: isolate` no painel o
  pseudo-elemento cai atrás do fundo `--surface-0` da seção e o papel desaparece. Acrescentar
  `isolation: isolate` (ou `z-index: 0` no painel).
- `.eixos-item__index`: 21 links inline de 14 px separados por "·" têm alvo < 44 px → Lighthouse
  "tap targets" e WCAG 2.5.8 em 390. Precisa `display:inline-block; padding-block: .6em` ou virar `ul`.
- Ícones colados inline em cada `article` (não `<symbol>`): 6 cópias, sem reuso pelo mega-menu.
- `.news-form` reaproveita `.form-field` sem dizer que o `<form>` precisa de `class="dmc-form"`.
- `brasil-estados-min.svg ≤ 12 KB` (DP 2–2,5 px) é hipótese; o arquivo atual tem 27 KB.

**Melhores ideias para a síntese.** Ritmo claro/escuro em blocos (não zebra); Casa sem canvas e um só
canvas na página; grid 3×2 só com fios + `:target` sem JS; 07 com `aside` "Em preparação" sem título/data
e CTA para a newsletter; `catalogo-cards.json` + `icones-eixos.svg` + `design-preview.html` como
artefatos antes do corte; tabela de contraste medida com os tokens.

## B — Cinematic-first (44)

**Por que pontua bem.** Mais fiel à referência visual do CEO (planning.com.br): painéis 21:9 full-bleed,
véu ≥ .82, mapa com `perspective`/`rotateX(6deg)` que lê como 3D sem WebGL. Narrativa limpa: as falas do
cliente migram para o eyebrow das verticais (sem repetir eixos), Casa curta, `<details>` guarda o catálogo
sem poluir. Checklist de aceite visual útil.

**Onde perde.** Custo e risco. Vídeo do rinoceronte em 02 (+820 KB webm desktop; no mobile também toca —
decodificação VP9 com alfa é o que levou a 63 % de main thread no histórico do PROGRESS). Pilha sticky de
5 painéis ≈ 3.600 px antes de 06. Soma declarada "≈ 0,9 MB" ignora o rino: real ≈ 1,7 MB > teto 1,5 MB.

**Riscos concretos.**
- Pilha sticky: o CTA do painel 1 fica **coberto** pelo painel 2 quando o usuário volta por Shift+Tab →
  WCAG 2.4.11 (foco não obscurecido); axe não detecta, o QA manual sim. Também 5 imagens 2560 px
  compostas ao mesmo tempo (memória GPU) e `scale(1.02)` em hover sobre elemento sticky = relayout de
  camada.
- `rotateX(6deg)` com `perspective` sobre `<svg>` + `<canvas>`: texto "SP" e traços de 0,8 px
  rasterizam borrados; o canvas precisa de `size()` consciente da transformação (hit-test do ponteiro
  desloca).
- Rino no mobile: sem gate `(min-width:768px)` nos `<source>` o vídeo toca em 390.
- Poster procedural 16:9 para a única publicação parece "capa" de artigo — risco de o CEO/QA ler como
  conteúdo inventado; e são +60 KB para um card.
- Numeral Newsreader 40–48 px ouro em 04/08: `font-display: swap` com fonte grande = CLS visível
  na troca (inventário §7 já registrou 0,12–0,17 em internas por isso).
- `--veil-80: rgba(11,12,14,.82)` é literal de cor fora dos tokens (a própria spec proíbe).
- Mesmo problema de `.dmc-form` na newsletter.

**Melhores ideias para a síntese.** Eyebrow com a fala do cliente em cada vertical (resolve persuasão sem
repetir eixos); `<svg hidden>` de `<symbol id="ico-eN">` + `<use>`; `details.eixos-catalogo` para os 21
links (alvos de 44 px, DOM leve); numeração do ato no overline ("03 · Seis eixos"); mapa com três planos
de paralaxe (`z` .2/.6/1) e dados das capitais embutidos no módulo (sem `fetch`, CSP ok); programa EAD como
`aside` lateral de 08; checklist de aceite visual.

## C — Conversion-first (43)

**Por que pontua bem.** Melhor lógica de funil: situações na voz do cliente logo após a Casa, CTA nomeado
por painel, 07 → 09 → `#contact` encadeados, estados de erro honestos e detalhados na newsletter, ícones em
sprite, mapa com fallback SVG, `brasil.js` separado com exports de `rede-neural.js`. Tabela de testes a
mais operacional das três. Verticais em 1 painel 21:9 + 4 em 16:10 é a leitura mais próxima de "painéis
grandes" dentro de um container.

**Onde perde.** Repetição estrutural: a seção 03 lista os seis eixos **três vezes** (situações → card →
cabeçalhos do índice de 20 links em 6 colunas) — é o "catálogo em camadas" que as outras duas eliminam.
A litania "sociedades de advogados parceiras, contadores e auditores habilitados e cartórios conveniados"
aparece em 02, 04 (item 3), 05 (frase do painel 1) e 06. Mantém dois canvases (rede na Casa + mapa) e
cria uma interação cega: clicar no nó do canvas de 02 rola até um card de 03 que o usuário não vê ao
mesmo tempo. Esconde o WhatsApp até `#porque` entrar na viewport — tira um canal de conversão sem pedido
do CEO.

**Riscos concretos.**
- `a.vertical__link` envolvendo `h3 + p + span.cta`: nome acessível do link = setor + headline + frase +
  CTA (≈ 40 palavras); heading dentro de link; `span` com cara de botão não é foco separado. axe passa,
  leitor de tela sofre.
- Newsletter sobre `--surface-1` exige um **segundo visual de campo** (`.dmc-form label` é
  `--text-ink-1`, ilegível no escuro) — a própria spec admite; contraria "não duplicar".
- Índice de 6 colunas em 1024 (~190 px/col, 14 px, "Conformidade Psicossocial" quebra) e em 320 vira
  ~26 linhas antes de 04 — fadiga mobile.
- `controlador()` reescrito para ler `#features article[data-eixo]` + `scrollIntoView` + `focus`: código
  novo em módulo de 621 linhas para um ganho invisível; melhor remover o canvas da Casa.
- `h3.dmc-h3` com `--fs-small` "visualmente discreto" em 03a cria heading de 14 px — nível semântico
  pesa mais que a aparência; use `p` com `aria-hidden` ou um `h3` normal.
- Mesmo problema de `.dmc-form` (parcialmente endereçado em §13).

**Melhores ideias para a síntese.** As seis situações reescritas (E4 sem "minha contabilidade", E6 nova)
— mas **uma vez**, como eyebrow das verticais (B) ou como lista única em 03 **substituindo** o índice;
verticais 1×21:9 + 4×16:10 em `--container-wide`; `brasil.js` + `assets/js/data/brasil-capitais.js`
(sem `fetch`); fluxo de estados da newsletter (400 por campo, 429/503 com e-mail alternativo, sucesso só
com `{ok:true}`); link "Newsletter" no rodapé; `publi-vazio` com `min-height` igual ao card real (CLS);
`aside.metodo-programa` nomeado; linha "Conteúdo informativo, Provimento 205/2021" em 07.

## Veredito

**Vencedora: A** por um ponto, pela lente desta banca: é a que chega a Perf ≥ 95 / axe limpo com o menor
código novo e o menor número de pontos de falha, e a que menos depende de decisões do CEO para fechar.
Mas A **não deve ser implementada como está**: perde em persuasão e contraria a direção de imagem (D9).
A síntese deve ser o esqueleto de A com três enxertos: (1) verticais de B/C — painel grande em
`--container-wide`, véu ≥ .80 tokenizado, eyebrow com a fala do cliente, e os loops WebM ≤ 1 MB do CEO
montados por IO só ≥ 768 e sem `saveData`/reduce, poster como fallback; (2) sprite `<symbol>` + `details`
do catálogo de B (alvos de 44 px, DOM leve); (3) máquina de estados da newsletter de C.

Riscos comuns às três que o frontend precisa fechar antes do corte: `form.dmc-form` na newsletter;
re-simplificação do SVG do Brasil (27 KB → ≤ 12 KB a verificar); `home.spec.js` reescrito junto com o
HTML; rótulo "Treinamentos" × `#treinamentos` em 29 arquivos (DECISIONS); e `home.css` como 4.º CSS
render-blocking — fundir em `styles.css` na publicação ou aceitar o request a mais com o gzip ≤ 4 KB.
