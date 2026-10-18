# Newsletter — revisão de segurança/LGPD (2026-10-17)

Três revisores apontaram 19 achados sobre `server/src/routes/newsletter.js` e
arquivos vizinhos. Cada um foi reproduzido (teste puro, HTTP sem banco ou
`tests/server/serve.mjs` com mongod descartável) antes de qualquer correção.
Resultado: **18 corrigidos, 1 aceito como limitação documentada, 0 rejeitados**
(todos se reproduziram). `npm test`: 129 testes, 0 falhas (eram 115).

Nada em `complexodmc.com.br/`, em `routes/parcerias.js` ou em
`test/parcerias.test.js` foi tocado. `/api/contato` mantém o comportamento
(`corpoContato()` e `criarNotificadorEmail()` só ganharam parâmetros opcionais
com os defaults antigos).

## Corrigidos

| # | Gravidade | Achado | Reprodução | Correção | Teste de regressão |
|---|---|---|---|---|---|
| 12 | alta | IP truncado gravado enquanto a Política publicada diz "não é gravado" | `curl` com `X-Forwarded-For` → `consentimentos[0].ipTruncado = '203.0.113.0/24'` | Opção `gravarIp` (env `NEWSLETTER_GRAVAR_IP`, padrão `false` → `ipTruncado: null`). Boot loga o estado. Ligar só após publicar a política corrigida (blueprint §10). | `gravarIp=false (padrão) → ipTruncado null` |
| 1 | média | Descadastro por e-mail sem checar `Origin`/`Referer`: CSRF distribuído anula o throttle por IP | 6 POST urlencoded com `Origin: https://evil.example` e IPs distintos → 6× 202 | `origemPermitida()` + opção `origensPermitidas` (produção: `complexodmc.com.br`, `www`, `CORS_ORIGINS`, `NEWSLETTER_ORIGENS`, `localhost` fora da Vercel). Origin/Referer de fora → 403; sem cabeçalho (curl) passa; caminho por token não exige. **Mais** limite por endereço-alvo (3/24 h, qualquer IP) → 429 com `Retry-After`. | `origemPermitida (...)`, `Origin de terceiro → 403`, `mesmo endereço-alvo de IPs distintos → 429`; curl no QA: `202 202 202 429` |
| 7 | média | Unicode invisível (ZWSP, soft hyphen) passa e vira chave de dedupe distinta; `İ` muda após `toLowerCase`; IDN sem punycode | `validarInscricao({email:'maria​@exemplo.com'})` → `ok:true`, e-mail com ZWSP | `normalizarEmail()`: remove `\p{Cf}` e U+00AD, exige ASCII visível (`[\x21-\x7E]`), depois `EMAIL_RE` e minúsculas. Usado na inscrição e em `validarEmail` (descadastro). `+` continua aceito. | `e-mail: aceita "+", remove invisíveis e recusa não-ASCII`, `validarEmail segue as mesmas regras`, `ZWSP no e-mail não cria segunda chave` |
| 14 / 8 / 19 | média / baixa / baixa | Negociação JSON×HTML só por `Accept` e só no caminho por token: `fetch` (`*/*`) recebia HTML; e-mail e 400 sempre JSON | `fetch` JSON sem Accept → `200 text/html` | `prefereJson = req.is('application/json') || !Accept.includes('text/html')`, aplicada por `responder()` a **todas** as respostas do `POST /descadastro` (200/202/400/403/429/503), com páginas HTML "Revise o e-mail", "Pedido recebido", "Aguarde", "Pedido recusado". | `form com Accept text/html → HTML; fetch JSON sem Accept → JSON; urlencoded com */* → JSON`, `{email} por form sem JS → 202 HTML; inválido → 400 HTML` |
| 13 | média | Token = `base64url(email).HMAC`: e-mail legível na URL do GET (logs, histórico, referrer) | `Buffer.from(parte1,'base64url')` → e-mail | Opção A do revisor: `HEADERS_HTML` em toda resposta HTML (`Referrer-Policy: no-referrer`, `Cache-Control: no-store`, …) + `<meta name="referrer" content="no-referrer">`; README documenta que a URL carrega o e-mail codificado e que token opaco fica para a fase 2 (precisa de campo + índice + `buscarPorToken`). | `GET … → 200 … mesmos headers`, `GET … → 400 … mesmos headers` |
| 15 | média | Aviso de `NEWSLETTER_POLITICA_VERSAO` vazia só dentro de `start()`, que não roda na Vercel | leitura de `server.js` (`shouldListen=false` com `VERCEL=1`) | Aviso movido para a criação da rota (roda em qualquer ambiente). Opção `exigirPoliticaVersao` (server.js: `NODE_ENV === 'production'`): sem versão → **503** + `log.error`, nada gravado. | `exigirPoliticaVersao sem versão → 503, salvar não chamado` |
| 2 | baixa | `err.message` do driver com `dup key: { email: … }` ia para o log | fake lançando E11000 com dup key → log com o e-mail | `resumirErro(err)`: nome + `code` + mensagem com `dup key {…}` e qualquer `x@y` redigidos; usado nos 4 pontos de log de erro. | `resumirErro redige dup key e e-mails`, `salvar lança → 503 …; log não contém o e-mail`, `descadastrar lança → 503` (checa logs) |
| 3 | baixa | `$push` em `consentimentos` sem teto (16 MB → 503 permanente para o alvo) | teste "mesmo e-mail duas vezes" mostra o append | `$push: { $each, $slice: -50 }` (`HISTORICO_MAX`), também em `descadastros`. | `upsert: … $push com $slice` |
| 4 | baixa | `notificar()` a cada reenvio, com `reply_to` do e-mail informado (spam refletido pela equipe) | testes mostravam `notificados` crescendo a cada POST | `salvar()` devolve `{ nova, reativada }` (via `findOneAndUpdate` com `returnDocument: 'before'`, ainda uma operação atômica); a rota só avisa em inscrição nova ou reativada; `criarNotificadorEmail` ganhou `replyTo` (server.js passa `null` para a newsletter). 201 idêntico nos dois casos. | `reenvio não avisa a equipe`, `reativação após descadastro avisa`, `replyTo: null` |
| 6 | baixa | Páginas HTML sem `nosniff`/`X-Frame-Options`/CSP/`no-store` fora da Vercel (clickjacking do botão "Confirmar") | `curl -D -` no Express local: só `content-type`/`etag` | `HEADERS_HTML` (`no-store`, `no-referrer`, `nosniff`, `X-Frame-Options: DENY`, CSP `default-src 'none'; … frame-ancestors 'none'`) em `html()` — 200 e 400/403/429/503. | idem #13; curl no QA mostra os headers no 400 |
| 9 | baixa | `serverSelectionTimeoutMS: 15000` fixo: 503 só após 15 s; na Vercel (10 s) vira 504 | leitura de `db.js` (opção do cliente sobrepõe a URI) | `config.mongoServerSelectionTimeoutMs` = env `MONGODB_SERVER_SELECTION_TIMEOUT_MS` ou 5000 na Vercel / 15000 fora; se a URI já traz `serverSelectionTimeoutMS`, a URI prevalece (serve.mjs usa 1000). README deixa de prometer 503 instantâneo. | — (config; sem Mongo nos testes unitários) |
| 10 | baixa | Retry pós-E11000 sem upsert ignorava `matchedCount: 0` → 201 sem gravar | fake: 1ª lança 11000, 2ª devolve `matchedCount: 0` → `salvar` resolve | Retry repete **com upsert**; se lançar de novo, propaga → 503. `findOneAndUpdate` devolve o estado anterior, nunca "resolve sem efeito". | `E11000 na corrida: repete uma vez (ainda com upsert); segunda falha propaga` |
| 11 | baixa | Lacunas de cobertura (`+`, ZWSP, `İ`, `validarEmail`, `Accept: */*`, `text/html` no caminho por e-mail, retry, `truncarIp` com zona) | `grep` no arquivo de teste: 0 ocorrências | Todos acrescentados (ver coluna de testes acima; `truncarIp('fe80::1%eth0')`). Integração e2e com mongod fica para o `tests/e2e` depois do front; a prova manual com `serve.mjs` está abaixo. | 14 testes novos |
| 16 | baixa | `$unset: { descadastro }` na reinscrição apagava a prova do opt-out | leitura do `operacaoUpsert` | `descadastrar()` faz `$set` do vigente **e** `$push` em `descadastros[]` (histórico, `$slice -50`); a reinscrição só limpa o vigente. `db.js`/README atualizados. | `descadastrar: $set do vigente + $push no histórico` |
| 17 | baixa | 413 dizia "Reduza a mensagem" num form sem mensagem | `POST` com `empresa` de 20 000 chars | `corpoContato({ mensagem413 })` (default = texto antigo; `MENSAGEM_413` exportado); server.js monta a newsletter com "Reduza o texto dos campos". | `corpo > 16 KB → 413` (checa a mensagem) |
| 18 | baixa | `texto: 'v1'` sem o texto correspondente no código; sem base legal | leitura | `TEXTOS_CONSENTIMENTO = { v1: '…' }` exportado (fonte para o front) e `baseLegal: 'consentimento'` no registro. | `texto do consentimento versionado e base legal`, `válido → 201 …` (checa `baseLegal`) |

## Aceito como limitação (documentado)

| # | Gravidade | Achado | Decisão |
|---|---|---|---|
| 5 | baixa | Throttle em memória por instância (Vercel): limite não é global | Não corrigível sem armazenamento compartilhado. Mitigado por #1 (allowlist de origem corta o CSRF distribuído; limite por e-mail alvo reduz o dano por instância). README registra a limitação e a fase 2 (Vercel KV/Upstash). |

## Rejeitados

Nenhum — todos os cenários se reproduziram como descritos.

## Verificação (2026-10-17)

```
npm test                       → 129 testes, 129 pass, 0 fail
node tests/server/serve.mjs    → mongod descartável em 127.0.0.1 (PID guardado; encerrado com kill <PID>)
POST /api/newsletter válido                         → 201 {"ok":true}
POST reenvio com ZWSP no e-mail                     → 201, mesmo documento (consentimentos: 2)
POST {"email":"x"}                                  → 400 campos.nome/email/consentimento em pt-BR
POST {"website":"bot"}                              → 200 {"ok":true}, nada gravado
POST empresa com 20 000 chars                       → 413 "Reduza o texto dos campos"
6 POST mesmo IP simulado                            → 201 ×5, 429
POST /descadastro Origin: https://evil.example      → 403
POST /descadastro {"email"} via curl (sem Origin)   → 202
POST /descadastro form Accept: text/html            → 202 text/html
POST /descadastro mesmo alvo, 4 IPs distintos       → 202 202 202 429
GET  /descadastro?token=lixo                        → 400 + no-store, no-referrer, DENY, nosniff, CSP
Documento: status descadastrada, ipTruncado null, baseLegal consentimento, politicaVersao qa, descadastros: 1
```

## Pendências fora do código (inalteradas)

1. Política de Privacidade: nova finalidade (newsletter) e decisão do CEO sobre
   o IP — só então `NEWSLETTER_GRAVAR_IP=true`.
2. `NEWSLETTER_POLITICA_VERSAO` com a data real na Vercel — **sem ela a
   inscrição responde 503 em produção** (decisão desta revisão, achado #15).
3. Credenciais Resend continuam inexistentes; o backend grava e loga sem elas.
4. Front (`frontend-motion`): enviar `Accept: application/json`; copiar o label
   do checkbox de `TEXTOS_CONSENTIMENTO.v1`; tratar 403/429 do descadastro.
