# DMC PRIME — PUBLICAÇÃO (checklist D3)

Publicar é decisão explícita do CEO por rodada (DECISIONS.md D3/D4). Este arquivo é o
roteiro: nada aqui autoriza `vercel --prod`. Configuração vigente: T5 (DECISIONS.md).

## Como o site é servido (T5)

- `vercel.json`: `outputDirectory: "complexodmc.com.br"` — só a pasta pública vira estático.
  `api/[...path].js` continua como função (importa `../server/src/server.js`; `excludeFiles`
  tira só `complexodmc.com.br/**` do pacote — `server/uploads` fica, porque `materiais.js` e
  `capas.js` servem esses arquivos por `sendFile`).
- Rewrites: `/api/(.*)` → função; `/solucoes/:vertical/:slug` → `.html`.
- Redirects: 307 `/server/*` → `/`; 301 `/complexodmc.com.br[/*]` → `/*`, `/index.html` → `/`,
  `/em-construcao.html` → `/`, `/pages/planejamento-sucessorio-empresarial.html` →
  `planejamento-sucessorio.html`, cinco URLs antigas da raiz (`/pages/Sobre.html`,
  `Apresentação`, `Consultoria Imobiiliária`, `Jurídico Imobiliário`, `Jurídico Vendas`,
  `source` percent-encoded) → páginas aninhadas; `defesa-e-capital` → `defesa-empresarial`.
- Headers de segurança em `/(.*)` (CSP em report-only).
- `.vercelignore`: só vale para deploy via CLI. **Nunca** incluir `server/` ou `server/src`
  (função cai com `ERR_MODULE_NOT_FOUND` — D5). Padrões anchored (`/pages/`, `/assets/`,
  `/index.html`) para a raiz antiga não voltar.
- `package.json` `engines.node = "24.x"` (CLI recusa 20.x; projeto Vercel já em 24.x).

## 1. Antes de publicar (bloqueantes)

- [ ] **Rotação de credenciais feita (T3)** — senha de TODOS os usuários MongoDB citados em
      `server/.env` e `server/.env.bak-atlas` (cluster `siteadtech`) trocadas no Atlas;
      `JWT_SECRET` novo; variáveis atualizadas no painel da Vercel (Production). Sem isso,
      publicar apenas troca o site e mantém as credenciais vazadas válidas.
- [ ] `server/.env.bak-atlas` apagado do disco (tem hardlink fora do repo — apagar os dois).
- [ ] Variáveis de produção conferidas no painel (Settings → Environment Variables):
      `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`
      (`https://www.complexodmc.com.br,https://complexodmc.com.br`), `DEV_SIMULAR_PAGAMENTO=false`,
      `UPLOADS_DIR` (vazio = `server/uploads` empacotado, somente leitura), `MAX_UPLOAD_MB`,
      `TRUST_PROXY` (vazio na Vercel), opcionais `RESEND_API_KEY`, `LEADS_EMAIL_TO`,
      `LEADS_EMAIL_FROM` (sem elas o lead só grava no banco).
- [ ] Allowlist de IP do Atlas aceita a Vercel (0.0.0.0/0 ou integração Atlas-Vercel).
- [ ] Gate D3 de conteúdo cumprido (AUDIT §5: 0 hits de schema `LegalService`, 0 frases de
      "entrega" sem atribuição, `[CONFIRMAR]` da política de privacidade resolvidos).
- [ ] Branch `feat/dmc-prime` revisada; sem `_np_*`, `*.backup-*`, `console.log` de debug.
- [ ] Ponto de rollback anotado: URL do deployment de produção atual no painel
      (Deployments → o que está marcado "Current").

## 2. Porta de build (local, sem deploy)

Em checkout limpo (`git clone` ou `git stash -u`; build local com arquivos ignorados no disco é
falso positivo — nft lê do disco):

```
bash docs/dmc/audit/tools/vercel-build-check.sh      # tem de imprimir APROVADO
PORT=8081 node docs/dmc/audit/tools/emulador-rotas.mjs "$PWD" &   # emula o config.json compilado
node docs/dmc/audit/tools/pw-smoke.mjs http://127.0.0.1:8081       # 0 sub-recursos 4xx, 0 erros
```

Esperado no emulador: `/` = `complexodmc.com.br/index.html`; `/pages/planejamento-sucessorio.html`
200; `/solucoes/consultoria-trabalhista/ciclo-fechado` 200; `/server/.env` 307 → `/`;
`/complexodmc.com.br/index.html` 301 → `/`; `/sitemap.xml` e `/robots.txt` 200; `/api/health` 200.
Não usar `vercel deploy --prebuilt` a partir do Mac: a função sai com `architecture: arm64`.

## 3. Publicar

Preferir **deploy via Git** (squash merge de `feat/dmc-prime` em `main` — T4 — com a Vercel
ligada ao repositório; `.env*` e `server/uploads/` nunca entram). Alternativa: `vercel --prod`
na raiz, com `.vercelignore` íntegro (ele é o que impede `.env*` de subir).

1. Merge/push (ou `vercel --prod`), aguardar o build no painel (Node 24, função `api/[...path]`).
2. Não promover manualmente nada antes do smoke test.

## 4. Smoke test pós-deploy (produção)

```
bash docs/dmc/audit/tools/exposicao-prod.sh          # esperado: 0 falhas (server/.env* 307/404)
node docs/dmc/audit/tools/raiz-etag-prod.mjs && node docs/dmc/audit/tools/raiz-etag-compare.mjs
```

| URL | Esperado |
|---|---|
| `https://www.complexodmc.com.br/` | 200, home nova (`<h1>` "Inteligência para decisões…") |
| `/pages/planejamento-sucessorio.html` | 200 |
| `/solucoes/consultoria-trabalhista/ciclo-fechado` | 200 (sem `.html`) |
| `/server/.env`, `/server/.env.bak-atlas`, `/server/src/server.js` | 307 → `/` (nunca 200) |
| `/complexodmc.com.br/index.html`, `/complexodmc.com.br/` | 301 → `/` |
| `/index.html` | 301 → `/` |
| `/pages/Sobre.html`, `/pages/Jur%C3%ADdico%20Vendas.html` | 301 (raiz antiga) |
| `/sitemap.xml`, `/robots.txt` | 200 |
| `/api/health` | 200 `{"ok":true,"db":"complexodmc"}` |
| `/plataforma-ead/login.html` | 200, logo carrega (`/assets/images/RINO_logo.png`) e login de aluno funciona |
| `POST /api/contato` (form da home) | 201; lead na coleção `leads` |
| Headers em `/` | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, CSP report-only |

Se qualquer linha falhar: rollback (abaixo), registrar em PROGRESS.md, corrigir no repo.

## 5. Rollback

Painel da Vercel → Deployments → deployment anterior → "Promote to Production" (ou
"Instant Rollback"). Não há migração de dados nesta rodada; o banco não muda. Se o rollback
for para antes de T5, a raiz antiga volta a ser servida e `server/.env` volta a ficar
público — só vale como medida de minutos, com rotação de credenciais já feita.

## Riscos conhecidos

- `server/uploads/` é gitignored: no deploy via Git os PDFs/capas já enviados **não** vão
  para a função (`GET /api/materiais/*` e `/api/capas/*` → 404). Via CLI eles sobem
  empacotados, mas são somente leitura (novo upload em prod falha). Solução definitiva:
  armazenamento persistente (Vercel Blob/S3 ou GridFS) — backend-engineer, D5.
- `.vercelignore` só protege deploy via CLI; o que protege o deploy via Git é o `.gitignore`.
- Redirects com `source` percent-encoded (URLs antigas da raiz) não foram validados no proxy
  real da Vercel, só no emulador — conferir no smoke test.
