# Correções da rodada 1 de QA — home v2 (2026-10-17)

Corretor: frontend-motion. Base: branch `feat/dmc-prime`, HEAD b26a462 (árvore de trabalho).
Suíte filtrada: `QA_PORT=4660 npx playwright test tests/e2e/newsletter.spec.js tests/e2e/movimento.spec.js tests/e2e/home-secoes.spec.js`.
Lighthouse: `QA_LH_PORT=4662 LH_PAGINAS=home LH_RUNS=3 node tests/lighthouse.mjs`.

| | antes | depois |
|---|---|---|
| e2e (3 specs) | 51 passam / **10 falham** | **61 passam / 0 falham** (33 s) |
| Lighthouse mobile home (mediana de 3) | Perf 99 · LCP **1,96 s** · CLS 0,003 · TBT 20 ms | **Perf 100** · **LCP 1,65 s** · CLS 0,003 · TBT 2 ms |

Artefatos: `docs/dmc/qa/2026-10-17-corr-r1-antes/e2e/` e `docs/dmc/qa/2026-10-17-corr-r1-depois/{e2e,lighthouse}/`.

## Causas raiz corrigidas

### 1. Newsletter — contrato do formulário (7 testes)
`complexodmc.com.br/index.html`: `form#newsletterForm` passa a `data-origem="home"` e `aria-describedby="nlMessage"`;
`<input type=hidden name=origem>` (fallback sem JS) passa a `value="home"`; `p.form-message` passa a `id="nlMessage"`
(HOME_REDESIGN.md §3.09 l. 677/688; contratos-qa §3.1). `assets/js/main.js` consulta `#nlMessage` e o fallback de `origem` é `'home'`.

### 2. Newsletter — 400 do servidor nunca chegava
`validarLocal` em `main.js` validava formato de e-mail e nome ≥ 2 letras no cliente, de modo que o POST nunca saía e o QA
esperava a resposta até o timeout. A spec (§3.09 l. 702) prevê **só "valida obrigatórios"**; a regra de formato/tamanho
tem fonte única no servidor (`400 {error, campos}`). `validarLocal` agora checa apenas nome vazio, e-mail vazio e
consentimento; mensagens `nomeCurto/nomeLongo/emailInvalido/empresaLonga` (sem uso) foram removidas.
Fluxo de erro por campo (`aria-invalid`, `aria-describedby`, `p.form-field__error`, foco no 1.º inválido) inalterado.

### 3. Presença nacional — vocabulário `data-motion`
`assets/js/brasil.js`: `"on"` → `"running"`, `"off"` → `"paused"` (fora da viewport / aba oculta); `"still"` mantido.
Spec: HOME_REDESIGN.md l. 544/556; contratos-qa l. 136/141. Nenhum CSS dependia dos valores antigos.

### 4. Conformidade — `#publicacoes` cita "inventário" sem atribuição (S13)
Decisão editorial aplicada (dono: content-director; **a ratificar**): o texto do destaque ganhou a categoria pertinente,
em `copy.json`, `copy.md` e `index.html`:
> Legítima, inventário e ITCMD: o que muda quando a família decide antes, com doação, holding e testamento — e o que fica com advogados parceiros e cartórios conveniados.
Alternativa não adotada: declarar títulos de publicação isentos e restringir `RE_ATO_PRIVATIVO` em `#publicacoes` (enfraqueceria o teste).

### 5. Lighthouse — LCP 1,96 s > 1,8 s
Três medidas, todas em `index.html`/`styles.css`/mídia (nunca em tokens.css/components.css/navbar.js):
1. **S16 executado**: `assets/css/home.css` (28,5 KB) fundido no fim de `assets/css/styles.css` (bloco "HOME v2";
   cabeçalho do arquivo atualizado), `styles.css?v=c5` → `?v=c6`, `<link home.css>` removido e o arquivo apagado
   (só `index.html` carregava `styles.css`, logo nenhuma interna é afetada). 4 → 3 CSS render-blocking; `styles.css` 52,5 KB bruto / 12,7 KB gz.
2. Os dois `<script type="module">` (`rede-neural.js?v=2`, `brasil.js?v=1`) saíram do `<head>` para o fim do `<body>`:
   módulos já são adiados, mas eram requisitados com prioridade *High* antes do cartaz do herói e competiam com ele na banda simulada.
3. `assets/images/hero-dmc-poster-mobile.webp` (elemento LCP, 720×1280) recodificado com `cwebp -q 75 -m 6 -sharp_yuv`:
   39,8 KB → 21,3 KB, PSNR 45,6 dB (visualmente indistinguível). O cartaz desktop (70 KB) não foi tocado.
   Observação: o arquivo tem hardlink em `.vercel/output/static/` (saída de build), que recebeu o mesmo conteúdo.

### 6–8. Testes corrigidos pelo QA (sem ação aqui)
`overflowPorSecao` (honeypot fora da tela), regex de logos de terceiros, espera do fade `.dmc-reveal` antes do axe — já em `tests/e2e/_site.js` e `home-secoes.spec.js`.

## Fora de escopo / não tocado
`server/` (newsletter já passava: 3 testes de integração com Mongo descartável verdes), `assets/js/navbar.js`, `assets/css/components.css`, `assets/css/tokens.css`, seção 02 `#conheca`, hero (só o peso do cartaz mobile), rodapé.

## Pendências
- content-director ratificar a frase nova de `#publicacoes` (item 4) ou propor outra com a categoria de atribuição.
- QA rodar a suíte completa (454 testes) + Lighthouse ×5 nas 5 páginas antes do commit; `home.css` deixou de existir — qualquer parcial novo entra direto em `styles.css` (bloco HOME v2).
- `[CEO 7]`: `copy.json` pede `time.exibir:false`, mas `index.html` renderiza o `<time>` (pré-existente; não alterado nesta rodada).
