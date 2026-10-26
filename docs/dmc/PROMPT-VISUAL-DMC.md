# Prompt — aplicar o visual da DMC em outro sistema

Cole tudo o que está abaixo da linha no Claude Code (VS Code), aberto na pasta do sistema que vai receber o visual.

---

Você vai aplicar neste sistema o design system do Complexo DMC (direção "C · Híbrido Executivo"), o mesmo do site complexodmc.com.br e da plataforma EAD. O objetivo é que uma pessoa que navegue do site para este sistema sinta que está no mesmo produto: mesma cor, mesma tipografia, mesma forma, mesmo movimento.

**Escopo: só visual.** Não mude regra de negócio, rotas, chamadas de API, nomes de campos, validações nem textos. Se algum texto de interface precisar mudar para caber no padrão, liste o caso e me pergunte antes. Textos públicos da DMC são publicidade advocatícia (Provimento 205/2021 da OAB) e não podem ser reescritos sem aval.

## Passo 0 — entender antes de mexer

1. Descubra a stack: framework (React, Vue, Angular, Blade, HTML puro…), como o CSS é feito (CSS puro, Sass, Tailwind, CSS Modules, styled-components, biblioteca de UI como MUI/Bootstrap/shadcn) e onde ficam as variáveis globais de tema.
2. Liste as fontes, cores literais (hex/rgb), raios, sombras e `transition` usados hoje, com contagem aproximada.
3. Me mostre um plano curto: onde os tokens vão morar, o que muda em cada camada, e em que ordem você vai migrar as telas. **Espere meu ok antes de editar.**

## Passo 1 — tokens (fonte única)

Crie um arquivo de tokens com o conteúdo abaixo, sem alterar valores. Na stack deste sistema:
- CSS/Sass puro: `tokens.css` carregado antes de qualquer outro CSS.
- Tailwind: mantenha o `tokens.css` e aponte `theme.extend` (cores, fontes, espaçamento, raio, duração, easing) para `var(--…)`, em vez de copiar os valores.
- Biblioteca de UI (MUI, Bootstrap, shadcn etc.): sobrescreva o tema dela para ler estes tokens. Não troque de biblioteca.

Regra de ouro da migração: **troque o valor, não o componente.** Cor literal vira token, raio vira token, `transition` vira token. Só reescreva um componente se não houver outro jeito, e me avise quando fizer isso.

```css
/* Fontes: um único link, display=swap */
/* <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..600&family=Newsreader:ital,opsz,wght@0,48,300;1,48,300&display=swap"> */

:root {
  /* Cor · base */
  --color-black: #0b0c0e;          /* preto da casa (não #000) */
  --color-graphite-900: #121416;
  --color-graphite-800: #1a1c1f;
  --color-graphite-700: #24272a;
  --color-graphite-600: #36383c;
  --color-graphite-500: #505357;
  --color-graphite-400: #67696c;   /* borda de controle: ≥3:1 */
  --color-white: #ffffff;
  --color-paper: #f5f3ef;          /* seção clara editorial */
  --color-paper-2: #e9e6e0;

  --color-gold: #d6b069;           /* ouro da casa */
  --color-gold-deep: #82602e;      /* texto/linha sobre papel */
  --color-gold-soft: #e7d3b1;
  --color-gold-rgb: 214, 176, 105;

  --color-line: rgba(255, 255, 255, 0.1);
  --color-line-strong: rgba(255, 255, 255, 0.18);
  --color-line-ink: rgba(11, 12, 14, 0.14);
  --color-control: var(--color-graphite-400);
  --color-control-ink: #7f8285;

  --color-error: #e88f84;
  --color-error-ink: #aa5047;
  --color-success: #8ec899;

  /* Cor · papéis */
  --surface-0: var(--color-black);
  --surface-1: var(--color-graphite-900);
  --surface-2: var(--color-graphite-800);
  --surface-3: var(--color-graphite-700);
  --surface-glass: rgba(11, 12, 14, 0.72);
  --surface-paper: var(--color-paper);

  --text-1: #f5f3f0;               /* 17.7:1 sobre preto */
  --text-2: #bfbdb9;               /* 10.4:1 */
  --text-3: #9a9893;               /*  6.8:1 — só meta/legenda */
  --text-ink-1: var(--color-black);
  --text-ink-2: #4a4d52;           /* 7.7:1 sobre papel */
  --text-ink-3: #616368;           /* 5.4:1 sobre papel */
  --text-on-gold: var(--color-black);

  --focus-color: var(--color-gold);
  --focus-color-ink: var(--color-gold-deep);
  --focus-width: 2px;
  --focus-offset: 3px;

  /* Acento — padrão = ouro. Formato "R, G, B": rgb(var(--np-accent)) */
  --np-accent: 214, 176, 105;
  --np-accent-deep: 130, 96, 46;
  --np-accent-soft: 231, 211, 177;

  /* Tipografia */
  --font-text: "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --font-display: "Newsreader", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --font-numeric: "tnum" 1, "lnum" 1;

  --fw-light: 300;
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;   /* teto: nada de 700/800 */

  --fs-display: clamp(2.5rem, 1.6429rem + 4.2857vw, 5.5rem);    /* 40 → 88 */
  --fs-h1: clamp(2.25rem, 1.75rem + 2.5vw, 4rem);               /* 36 → 64 */
  --fs-h2: clamp(1.875rem, 1.5536rem + 1.6071vw, 3rem);         /* 30 → 48 */
  --fs-h3: clamp(1.375rem, 1.1964rem + 0.8929vw, 2rem);         /* 22 → 32 */
  --fs-h4: clamp(1.125rem, 1.0536rem + 0.3571vw, 1.375rem);     /* 18 → 22 */
  --fs-lead: clamp(1.125rem, 1.0536rem + 0.3571vw, 1.375rem);   /* 18 → 22 */
  --fs-body: clamp(1rem, 0.9821rem + 0.0893vw, 1.0625rem);      /* 16 → 17 */
  --fs-small: 0.875rem;
  --fs-overline: 0.75rem;

  --lh-display: 1.04;
  --lh-heading: 1.15;
  --lh-snug: 1.35;
  --lh-body: 1.65;

  --tracking-display: -0.015em;
  --tracking-heading: -0.005em;
  --tracking-overline: 0.16em;

  --measure: 38rem;

  /* Espaço (escala 4/8) */
  --space-1: 0.25rem;  --space-2: 0.5rem;  --space-3: 0.75rem;  --space-4: 1rem;
  --space-5: 1.5rem;   --space-6: 2rem;    --space-7: 2.5rem;   --space-8: 3rem;
  --space-9: 4rem;     --space-10: 5rem;   --space-11: 6rem;    --space-12: 8rem;
  --space-13: 10rem;

  --space-section: clamp(4rem, 2.5714rem + 7.1429vw, 9rem);     /* 64 → 144 */
  --space-block: clamp(2.5rem, 1.7857rem + 3.5714vw, 5rem);     /* 40 → 80 */
  --gutter: clamp(1rem, 0.4286rem + 2.8571vw, 3rem);            /* 16 → 48 */
  --grid-gap: clamp(1rem, 0.7143rem + 1.4286vw, 2rem);          /* 16 → 32 */

  --container: 77.5rem;        /* 1240 */
  --container-wide: 90rem;
  --container-text: 46rem;

  --header-h: 4rem;            /* 64 · < 1024 */
  --header-h-lg: 4.5rem;       /* 72 · ≥ 1024 */
  --hit: 2.75rem;              /* 44 — alvo mínimo de toque */

  /* Forma */
  --radius-1: 2px;     /* botão, campo */
  --radius-2: 4px;     /* mídia, painel */
  --radius-3: 8px;     /* menu, diálogo — teto */
  --border-hair: 1px;
  --border-accent: 2px;

  --shadow-raise: 0 12px 24px -16px rgba(0, 0, 0, 0.55);
  --shadow-overlay: 0 32px 64px -32px rgba(0, 0, 0, 0.7);

  /* Movimento */
  --dur-fast: 160ms;
  --dur-base: 240ms;
  --dur-slow: 400ms;
  --dur-reveal: 700ms;
  --dur-hero: 1200ms;
  --stagger: 80ms;
  --reveal-distance: 16px;

  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);

  --transition-move: transform var(--dur-slow) var(--ease-out), opacity var(--dur-slow) var(--ease-out);
  --transition-state: color var(--dur-fast) linear, background-color var(--dur-fast) linear, border-color var(--dur-fast) linear, opacity var(--dur-fast) linear;

  /* Camadas */
  --z-raised: 10;  --z-sticky: 100;  --z-float: 999;  --z-header: 1000;
  --z-menu: 1001;  --z-drawer: 1101; --z-modal: 1200; --z-toast: 1300;
}

/* Acento por eixo: só use se este sistema separar conteúdo por área.
   Mesma forma, outra cor — aplicar a classe no contêiner da área. */
.np-pillar-patrimonial { --np-accent: 118, 183, 193; --np-accent-deep: 53, 110, 119;  --np-accent-soft: 189, 221, 226; } /* E1 petróleo */
.np-pillar-fiscal      { --np-accent: 136, 184, 157; --np-accent-deep: 70, 110, 89;   --np-accent-soft: 197, 221, 207; } /* E2 sálvia */
.np-pillar-imobiliario { --np-accent: 140, 174, 215; --np-accent-deep: 77, 104, 138;  --np-accent-soft: 199, 216, 237; } /* E3 ardósia */
.np-pillar-auditoria   { --np-accent: 212, 157, 127; --np-accent-deep: 136, 92, 66;   --np-accent-soft: 236, 207, 192; } /* E4 cobre */
.np-pillar-ativos      { --np-accent: 214, 151, 161; --np-accent-deep: 140, 87, 97;   --np-accent-soft: 238, 204, 209; } /* E5 rosé */
.np-pillar-trabalhista { --np-accent: 179, 158, 219; --np-accent-deep: 111, 93, 143;  --np-accent-soft: 218, 208, 239; } /* E6 violeta */

/* 1ms (não 0) para transitionend/animationend continuarem disparando */
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-fast: 1ms; --dur-base: 1ms; --dur-slow: 1ms; --dur-reveal: 1ms; --dur-hero: 1ms;
    --stagger: 0ms; --reveal-distance: 0px;
  }
}
```

## Passo 2 — princípios que guiam cada decisão

1. **Autoridade por subtração.** Preto, grafite e branco. O ouro aparece só na ação principal, na linha ativa e no foco. Se o ouro estiver em todo lugar, ele perdeu a função.
2. **Editorial, não catálogo.** Fio de 1px, numeração `01…06` e respiro organizam o conteúdo. Caixa com fundo e borda fica para mídia, menu e diálogo, não para tudo.
3. **Mesma forma, outra cor.** Área diferente troca só o acento (`--np-accent`), nunca o layout.
4. **Tecnologia como textura.** Sem neon, brilho, aura, degradê em texto ou `box-shadow` decorativo.
5. **Mobile primeiro e AA medido.** Contraste WCAG AA em tudo, alvo de toque ≥ 44px e zero rolagem horizontal de 320 a 1920px.

## Passo 3 — regras por elemento

**Tipografia**
- H1, H2 e títulos de destaque: `--font-display` (Newsreader) peso 300, `text-wrap: balance`. Para dar ênfase, use `<em>` em itálico; não use negrito nem texto em degradê.
- H3, H4, corpo, interface, tabelas e números: `--font-text` (Hanken Grotesk), peso máximo 600. Números em tabela usam `font-feature-settings: var(--font-numeric)`.
- Overline (rótulo acima do título): 12px, caixa-alta, `letter-spacing: var(--tracking-overline)`, peso 600, cor `rgb(var(--np-accent))`.
- Parágrafo com no máximo `--measure` (38rem). Corpo com altura de linha 1,65.
- Remova Poppins, Inter, Raleway, DM Sans, Allura e qualquer outra fonte.

**Superfícies**
- Fundo da página `--surface-0`; painéis e barras laterais `--surface-1`/`--surface-2`; hover de linha `--surface-3`.
- Seção clara (papel): fundo `--surface-paper`, texto `--text-ink-*`, acento `rgb(var(--np-accent-deep))` e foco `--focus-color-ink`. Use com moderação, por exemplo num bloco de destaque ou num relatório.
- Separação por fio (`--border-hair` com `--color-line`), não por sombra. Sombra (`--shadow-raise` ou `--shadow-overlay`) só em sobreposições: dropdown, modal e toast.
- Raio: 2px em botão e campo, 4px em mídia e painel, 8px no máximo em menu e diálogo. Nada de pílula nem `border-radius: 9999px`.

**Botões** (altura 48px, texto 14px/600, raio 2px, ícone de seta SVG que anda 4px no hover)
- Primário: fundo `--color-gold`, texto `--color-black`, hover `--color-gold-soft`. Sobre papel: fundo preto, texto papel. **Um primário por tela/dobra.**
- Secundário: transparente, borda `--color-line-strong`, seta no acento; no hover a borda assume o acento.
- Link: sublinhado de 1px com `text-underline-offset: .5em`, altura mínima 44px.
- Foco: `outline: 2px solid var(--focus-color); outline-offset: 3px`. Use outline, nunca só box-shadow. Desabilitado: opacidade .4.

**Formulários**
- Label visível acima do campo; placeholder não substitui label.
- Campo com 48px de altura, borda `--color-control`, raio 2px e fundo `--surface-1`. No foco, a borda vai para o ouro e aparece o outline.
- Erro com texto e ícone (não só cor), em `--color-error`, ligado ao campo por `aria-describedby`. Sucesso em `role="status"`. Durante o envio, `aria-busy="true"`.

**Navegação**
- Barra fixa de 64px (72px a partir de 1024px), fundo `--surface-glass` com `backdrop-filter: blur(16px)` e fio inferior `--color-line`.
- Marca: logotipo branco + "COMPLEXO **DMC**", com DMC em ouro.
- Abaixo de 1024px: botão "Menu" de 44px que abre uma gaveta em tela cheia, com foco preso, rolagem travada, fechamento por Esc e foco devolvido ao botão.
- Item ativo: texto `--text-1` e fio de 2px no acento. Dropdown com raio de 8px e `--shadow-overlay`.

**Listas e dados**
- Grade de itens: fio superior `--color-line-strong`, cada item com fio inferior `--color-line`, número `01, 02…` via `counter(…, decimal-leading-zero)` na cor do acento, título em H4 e texto em `--text-2`. No hover, um fio de 2px no acento cresce com `scaleX(0 → 1)`.
- Tabelas: cabeçalho em overline, linhas separadas por fio, números alinhados à direita com `--font-numeric`. Sem zebra colorida.
- Status e badges: texto em overline com um ponto ou fio na cor do acento. Nada de chip/pílula colorida.
- FAQ e acordeões: `<details>`/`<summary>` nativos, com ícone `+` em SVG que gira.

**Ícones**
- SVG inline com `stroke="currentColor"`, traço de 1,5px e `aria-hidden="true"` quando decorativo. Remova Font Awesome e outras fontes de ícone.

**Movimento**
- Anime deslocamento só com `transform` e `opacity`; para troca de cor de estado, use `--transition-state`. Nunca `transition: all`, nem animação de `box-shadow`, `width`, `height`, `top` ou `left`.
- Entrada de conteúdo: opacidade + 16px, uma vez só, com stagger de no máximo 80ms. Nunca em conteúdo crítico (formulário, mensagem de erro, dado principal).
- Respeite `prefers-reduced-motion` (os tokens já tratam disso; vídeo vira poster e 3D fica estático).

**Grid e breakpoints**
- Container `--container` (1240px) com `--gutter` lateral. Colunas: 4 até 767px, 8 de 768 a 1023px e 12 a partir de 1024px.
- Teste em 320, 375, 768, 1024, 1440 e 1920px.

## Passo 4 — cortar

Remova onde encontrar: degradês neon e texto em degradê; brilho via `box-shadow`; chips e pílulas; cards para tudo; cores ciano `#00e7fc`/`#5ed6e6` e verde `#00ff4d`/`#6ee68c` (viram o acento); `transition: all`; fontes fora do par Newsreader/Hanken; Font Awesome; pesos 700/800.

## Passo 5 — verificar e entregar

Ao terminar cada tela, confira e me reporte com evidência:
- [ ] `getComputedStyle` confirma H1 em Newsreader 300 e corpo em Hanken Grotesk.
- [ ] Nenhuma cor literal sobrando nos arquivos de estilo migrados (só tokens). Cole o `grep` que prova isso.
- [ ] Contraste AA em texto e ≥ 3:1 em bordas de campo; foco visível em todo elemento interativo, navegando só por teclado.
- [ ] Zero rolagem horizontal e zero alvo < 44px de 320 a 1920px.
- [ ] Zero erro novo no console; build e testes existentes passando (mostre a saída se algo falhar).
- [ ] Nenhuma mudança em lógica, rotas, API ou textos (mostre o `git diff --stat` e explique qualquer arquivo fora de estilo/markup).

Trabalhe em commits pequenos, um por camada (tokens → base/tipografia → componentes → telas), com mensagem descritiva. Não faça push.
