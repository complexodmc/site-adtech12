# 09 · Newsletter — parcial `#newsletter`

Entrega da seção 09 (HOME_REDESIGN.md §3·09) com o contrato real de
`server/src/routes/newsletter.js` (já implementado, shape igual ao blueprint).
Copy conforme `copy.json → newsletter` (prevalece sobre o rascunho da spec).

| Arquivo | Conteúdo |
|---|---|
| `newsletter.html` | `<section … id="newsletter">` com `.news-grid` → `.news-head` + `form#newsletterForm.dmc-form.news-form` (2 linhas: nome/e-mail · empresa/botão), honeypot `#nl-website`, consentimento `#nl-consentimento` (texto v1, "LGPD (Lei 13.709/2018)", link `pages/politica-de-privacidade.html`), `input[hidden] origem=home-newsletter`, `p#newsletterMessage[role=status]`. Texto de descadastro em `.news-head__legal` (link `mailto:administrativo@…`). |
| `newsletter.css` | bloco `/* ==== 09 · NEWSLETTER ==== */` (grade 1 / 8 / 12 col; linhas do form 1 col <640, 2 col ≥640; botão 100 % no mobile). Só tokens; 0 literal, 0 `!important`, 0 sombra, 0 `will-change`. ≈ 1,9 KB bruto. Reaproveita `.dmc-form .form-*` de `styles.css` 1018-1142. |
| `newsletter.js` | `export function initNewsletter(root = document)` — sem auto-execução; `validarLocal()` e `MENSAGENS_NEWSLETTER` exportados para teste. |
| `preview/newsletter-preview.mjs` | harness Playwright (porta 4658, API interceptada) que gera as capturas e roda as asserções abaixo. |

## Integração (integrador — não feita aqui)
1. Colar `newsletter.html` em `index.html` **antes** de `#video`, dentro de `<main class="home">`.
2. Concatenar `newsletter.css` como último bloco de `assets/css/home.css`.
3. Em `main.js?v=c4` (ou módulo): `import { initNewsletter } from …; initNewsletter();`.
   Se `main.js` continuar script clássico, colar o conteúdo sem o `export` e chamar após `DOMContentLoaded`.
4. `[CEO 9]` copy.json: enquanto `pages/politica-de-privacidade.html` tiver marcadores
   `[CONFIRMAR]`, a seção entra com `hidden` (e sai de `viewports/a11y` até liberar).
5. Divergências conscientes em relação ao rascunho HTML da §3·09: ids `newsletterMessage`
   (não `nlMessage`) e `data-origem="home-newsletter"` — contrato do blueprint/tarefa;
   `novalidate` é ligado pelo JS (sem JS o navegador bloqueia vazios e o POST urlencoded
   segue para a API, que aceita o formato).

## Comportamento do JS
- Validação local (vazios/tamanhos/consentimento) com os textos da copy → `aria-invalid`,
  `p#nl-<campo>-erro.form-field__error` ligado por `aria-describedby`, foco no 1.º inválido,
  limpeza em `input/change`; não chama a API.
- Envio JSON `{nome,email,empresa,consentimento:true,origem,website:''}`, `Accept: application/json`,
  timeout 15 s, `aria-busy` + botão "Enviando…" desabilitado.
- Sucesso **só** com `resposta.ok && corpo.ok === true`: 201 → "Inscrição registrada. Você pode
  sair da lista…" ; outro 2xx (isca) → "Inscrição registrada." ; `form.reset()`.
- 400 `{campos}` → marca campos + "Revise os campos indicados. …"; 400 sem campos → erro JSON;
  413 / 429 / 503 / 5xx / 2xx sem `ok` / rede → textos fixos da copy. Guarda final: qualquer
  texto de erro que contenha `receb|cadastrad` é trocado pelo texto do 503.

## Como testar
```bash
node docs/dmc/home-redesign/partials/preview/newsletter-preview.mjs
```
Sobe `tests/server/serve.mjs` em `QA_PORT=4658 QA_NO_MONGO=1` (mata só o PID próprio ao
fim), monta a página de preview com tokens/components/styles.css reais e intercepta
`POST /api/newsletter` nos cenários `201 · 400 · 429 · 503 · 200-sem-ok · rede`, em 390 e 1440.
Verifica: 0 overflow, payload, `aria-invalid`/`aria-describedby`/foco, botão restaurado, textos,
"descadastr" visível, label com LGPD + link da política, 0 erros de console (exceto o
"Failed to load resource" do próprio cenário 4xx/5xx), axe 0 serious/critical. Resultado da
última execução: **Tudo ok**; 320/375/768/1024/1920 também com 0 px de overflow e botão 48 px.

Capturas: `preview/newsletter-{390,1440}-{201,400,429,503,200-sem-ok,rede}.png` e
`newsletter-{320,768}-201.png`.

Contra o backend real (com mongod): `QA_PORT=4658 node tests/server/serve.mjs &` + abrir a
home integrada; 6.º envio do mesmo IP → 429 (`x-qa-cliente` simula IPs distintos).
