# Blueprint — Backend da Newsletter (`POST /api/newsletter`)

Especificação para implementação. **Nada aqui está implementado.** Espelha o padrão de
`server/src/routes/contato.js` (parser próprio de 16 KB, honeypot `website`, throttle por IP,
validação pura testável, `salvar`/`notificar` injetados, nunca sucesso sem gravar).

Arquivos previstos:

| Arquivo | Papel |
|---|---|
| `server/src/routes/newsletter.js` | `validarInscricao`, `truncarIp`, `gerarTokenDescadastro`, `verificarTokenDescadastro`, `criarRotaNewsletter` |
| `server/src/routes/contato.js` | só generaliza `criarNotificadorEmail` (parâmetros opcionais `assunto`/`corpo`); comportamento atual preservado |
| `server/src/db.js` | `col.newsletter()` → `newsletter_inscricoes` + 2 índices |
| `server/src/config.js` | bloco `newsletter` (ver §7) |
| `server/src/server.js` | monta parser + rota (ver §6) |
| `server/test/newsletter.test.js` | `node --test`, sem MongoDB (ver §8) |
| `server/.env.example`, `server/README.md` | documentação das variáveis e do contrato |

---

## 1. Rotas

| Método/rota | Função |
|---|---|
| `POST /api/newsletter` | inscrição |
| `GET /api/newsletter/descadastro?token=…` | página HTML de confirmação (não altera nada) |
| `POST /api/newsletter/descadastro` | efetiva o descadastro — por `token` (link) **ou** por `email` (autoatendimento) |

Montagem em `server.js` segue o padrão de `/api/contato`:
`app.use('/api/newsletter', corpoContato())` **antes** do `express.json` global (parser de
16 KB, JSON + `application/x-www-form-urlencoded`, 413/400 já tratados pelo `corpoContato`).

## 2. `POST /api/newsletter` — entrada

Aceita JSON ou urlencoded (formulário sem JS funciona).

| Campo | Regra | Erro (pt-BR, por campo) |
|---|---|---|
| `nome` | obrigatório, 2–120 chars, ≥1 letra, normalizado (`texto()` igual ao contato) | `Informe seu nome.` / `Informe seu nome completo.` / `Nome muito longo (máximo de 120 caracteres).` |
| `email` | obrigatório, `EMAIL_RE` do contato, ≤254, gravado em minúsculas (chave de dedupe) | `Informe seu e-mail.` / `E-mail inválido. Confira o endereço digitado.` |
| `empresa` | opcional, ≤120 | `Nome da empresa muito longo (máximo de 120 caracteres).` |
| `consentimento` | obrigatório e afirmativo (`true`, `"on"`, `"1"`, `"sim"`, `"yes"`) — mesma função `aceitou()` | `Para receber nossas análises, é preciso autorizar o uso do seu nome e e-mail (LGPD).` |
| `origem` | não é campo do usuário; limpa e corta em 120; padrão `nao-informada` | — |
| `website` | **honeypot**: deve vir vazio | — (resposta 200 neutra) |
| qualquer campo com objeto/array | recusado | `Formato inválido.` |

Não há dedupe por "gmail sem pontos"/alias: a chave é o e-mail como digitado, em minúsculas.

Registro do consentimento (preenchido pelo servidor, nunca pelo cliente):

```js
{
  em: Date,                       // agora()
  ipTruncado: '203.0.113.0/24',   // IPv4: último octeto zerado; IPv6: /48 (3 primeiros hextetos). '::ffff:a.b.c.d' tratado como IPv4. null se req.ip ausente
  origem: 'home-newsletter',      // dados.origem
  politicaVersao: config.newsletter.politicaVersao,   // string vinda do env, ex. '2026-10-17'
  texto: 'v1'                     // id do texto do checkbox (constante do módulo), para provar o que foi aceito
}
```

## 3. `POST /api/newsletter` — respostas

| Status | Corpo | Quando |
|---|---|---|
| **201** | `{ ok: true }` | gravado **ou já existia** (dedupe silencioso — corpo idêntico, sem `id`, sem distinção de tempo observável relevante: um `updateOne` upsert nos dois casos) |
| **200** | `{ ok: true }` | `website` preenchido — descartado, nada gravado, só `log.warn` |
| **400** | `{ error: 'Revise os campos indicados.', campos: { nome?, email?, empresa?, consentimento? } }` | validação |
| **400** | `{ error: 'Não foi possível ler os dados enviados.' }` | JSON malformado (do `corpoContato`) |
| **413** | `{ error: 'Conteúdo grande demais. …' }` | corpo > 16 KB (do `corpoContato`) |
| **429** | `{ error: 'Muitas inscrições em sequência. Aguarde alguns minutos e tente de novo.' }` + `Retry-After` | > 5 envios por IP em 15 min (`criarThrottle`, instância própria) |
| **503** | `{ error: 'Não foi possível registrar sua inscrição agora. Tente novamente em instantes.' }` | `salvar` lançou (banco fora/insert falhou) — nunca 2xx sem gravar |

Ordem no handler: throttle → honeypot → validação → `salvar` → `notificar` (opcional, falha só loga) → 201.

### Persistência (`salvar(inscricao)` injetado pelo server.js)

Operação atômica, idempotente, que também **reativa** quem se descadastrou e voltou:

```js
col.newsletter().updateOne(
  { email },
  {
    $setOnInsert: { email, criadoEm: momento },
    $set: { nome, empresa /* ou $unset se vazio */, status: 'ativa', origem, atualizadoEm: momento },
    $push: { consentimentos: registroConsentimento },
    $unset: { descadastro: '' }
  },
  { upsert: true }
);
```

Com o índice único em `email`, um corrida entre dois upserts simultâneos pode gerar `E11000`;
o handler trata `code === 11000` como sucesso (repete o `updateOne` sem upsert) — continua 201.

## 4. Coleção `newsletter_inscricoes`

```
{
  _id, email (minúsculas, único), nome, empresa?,
  status: 'ativa' | 'descadastrada',
  origem, criadoEm, atualizadoEm,
  consentimentos: [{ em, ipTruncado, origem, politicaVersao, texto }],   // histórico — prova do art. 8º §2º LGPD
  descadastro?: { em, via: 'token' | 'email' | 'manual' }
}
```

Índices (em `ensureIndexes`):
- `{ email: 1 }` unique — `uq_newsletter_email`
- `{ status: 1, criadoEm: -1 }` — `ix_newsletter_status_data` (exportação da lista ativa)

Separada de `leads` de propósito: finalidade e base legal diferentes, retenção diferente,
e `leads` tem `status: 'novo'` com semântica de atendimento.

## 5. Descadastro — decisão e justificativa

**Escolha: token HMAC no link + autoatendimento por e-mail, ambos na mesma rota.**
Não escolhemos "instrução por e-mail" sozinha porque hoje não existe serviço de envio em
produção (`RESEND_API_KEY` vazio) e, portanto, nenhum e-mail chegaria ao inscrito — o
descadastro ficaria dependente de alguém ler `administrativo@`. A LGPD (art. 8º §5º) pede
procedimento "gratuito e facilitado"; a rota com token já atende isso assim que os envios
começarem (vai no rodapé de todo e-mail e nos cabeçalhos `List-Unsubscribe` /
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`, RFC 8058), e o formulário por e-mail
atende hoje.

### Token

```
token = base64url(emailMinusculo) + '.' + base64url(HMAC-SHA256(chave, 'dmc-newsletter-descadastro:v1:' + emailMinusculo))
chave = JWT_SECRET
```

- Prefixo de domínio (`dmc-newsletter-descadastro:v1:`) separa o uso do uso HS256 dos JWTs
  (um JWT assina `header.payload` em base64url; a string prefixada nunca colide).
- Sem expiração: link de descadastro precisa funcionar em e-mail antigo. Rotação do
  `JWT_SECRET` invalida os links (aceitável; o autoatendimento por e-mail continua).
- Verificação com `crypto.timingSafeEqual`. Token malformado/forjado → 400.
- O token **não** é devolvido no 201 (quem inscreve um e-mail alheio não ganha nada).
- `node:crypto` apenas — nenhuma dependência nova.

### `GET /api/newsletter/descadastro?token=`

Só **exibe** confirmação (GET nunca altera estado: antivírus e pré-carregadores de link
abrem URLs de e-mail). Responde HTML mínimo, sem script, estilos inline (o CSP report-only
permite), com `<form method="post">` e `<input type="hidden" name="token">` e botão
"Confirmar descadastro". Mostra o e-mail decodificado do token (mascarado: `ma***@exemplo.com.br`).
Token inválido → 400 HTML "Este link não é válido. Para sair da lista, escreva para
administrativo@complexodmc.com.br." Nunca diz se o e-mail está ou não inscrito.

### `POST /api/newsletter/descadastro`

Corpo (JSON ou urlencoded): `{ token }` **ou** `{ email }` (+ honeypot `website`). Throttle próprio (5/15 min por IP).

| Caso | Ação | Resposta |
|---|---|---|
| `token` válido | `descadastrar(email, { via: 'token' })` → `updateOne({email, status:'ativa'}, {$set:{status:'descadastrada', descadastro:{em, via}, atualizadoEm}})` | 200 — `{ ok: true }` se `Accept: application/json`; senão HTML "Pronto. Este e-mail não receberá mais as nossas análises." **Mesma resposta** se já estava descadastrado ou se nunca existiu |
| `token` inválido | nada | 400 `{ error: 'Link inválido. …' }` / HTML |
| só `email` válido | mesma `descadastrar(email, { via: 'email' })` | 202 `{ ok: true, mensagem: 'Se este e-mail estiver na lista, ele será removido.' }` — sempre, exista ou não |
| `email` inválido / nenhum dos dois | — | 400 com `campos.email` |
| `salvar`/`descadastrar` lança | — | 503 (nunca "descadastrado" sem gravar) |
| `website` preenchido | nada | 200 neutro |

Risco aceito e documentado: por e-mail, terceiro pode descadastrar outra pessoa. É um
*opt-out* (dano mínimo, reversível com nova inscrição), limitado pelo throttle, e é o único
caminho honesto sem serviço de e-mail. Quando o Resend estiver ativo, a fase 2 pode trocar
por "enviamos um link de confirmação" sem mudar o contrato do front.

Fase 2 (não agora): *double opt-in* — `status: 'pendente'` até clique em
`/api/newsletter/confirmar?token=` com o mesmo mecanismo HMAC (prefixo `…confirmar:v1:`).
Exige e-mail funcionando. Com inscrição única + registro de consentimento já se cumpre a LGPD.

## 6. Notificação interna (reuso do Resend)

`criarNotificadorEmail` ganha dois parâmetros opcionais com os defaults atuais:

```js
criarNotificadorEmail({ resendApiKey, para, de, fetchImpl, timeoutMs, assunto = assuntoEmail, corpo = corpoEmail })
```

A newsletter passa `assunto: (i) => \`Nova inscrição na newsletter — ${i.nome}\`` e um `corpo`
em texto puro (nome, e-mail, empresa, origem, data, versão da política). `reply_to` segue o
e-mail do inscrito (o campo já existe no notificador). Só é criado quando
`NEWSLETTER_NOTIFICAR=true` — por padrão a equipe não quer um e-mail por inscrição;
destinatários `NEWSLETTER_EMAIL_TO` com fallback em `LEADS_EMAIL_TO`. Sem chave →
`null` → só grava e loga `e-mail de notificação não configurado` (igual ao contato).
Não é e-mail de boas-vindas ao inscrito — isso não existe nesta fase e o front não pode sugerir que exista.

Montagem no `server.js`:

```js
app.use('/api/newsletter', corpoContato());            // junto do de /api/contato, antes do express.json global
…
app.use('/api/newsletter', criarRotaNewsletter({
  salvar: (i) => upsertInscricao(i),                   // função em db.js ou inline
  descadastrar: (email, meta) => …,
  segredo: config.jwtSecret,
  politicaVersao: config.newsletter.politicaVersao,
  notificar: config.newsletter.notificar ? criarNotificadorEmail({ …config.newsletter.email, assunto, corpo }) : null
}));
```

**503 sem banco — atenção:** hoje o middleware `app.use('/api', ensureConnected)` manda
erro de conexão para o handler global, que responde **500** — vale para `/api/contato`
também. Para a newsletter responder 503 de verdade: montar `/api/newsletter` **antes** desse
middleware e fazer `salvar`/`descadastrar` chamarem `await ensureConnected()` dentro do
`try` da rota (falha vira 503). Opcional e recomendado: no handler global, mapear
`MongoServerSelectionError`/`MongoNetworkError` para 503 — corrige o contato sem mexer na rota.

## 7. Variáveis de ambiente (`server/.env.example` + README)

```bash
# ---------- Newsletter (POST /api/newsletter) ----------
# Versão/data da Política de Privacidade vigente, gravada em cada consentimento.
# Atualize quando a política mudar. Ex.: "2026-10-17".
NEWSLETTER_POLITICA_VERSAO=""
# "true" envia aviso interno por inscrição (usa RESEND_API_KEY/LEADS_EMAIL_FROM). Padrão: desligado.
NEWSLETTER_NOTIFICAR="false"
# Destinatários do aviso; vazio = LEADS_EMAIL_TO.
NEWSLETTER_EMAIL_TO=""
```

`JWT_SECRET` (já obrigatório) assina os tokens de descadastro. `config.js`:

```js
newsletter: {
  politicaVersao: (process.env.NEWSLETTER_POLITICA_VERSAO || '').trim() || 'nao-informada',
  notificar: String(process.env.NEWSLETTER_NOTIFICAR || '').toLowerCase() === 'true',
  email: { resendApiKey, para: NEWSLETTER_EMAIL_TO || LEADS_EMAIL_TO, de: LEADS_EMAIL_FROM }
}
```

Boot loga aviso se `politicaVersao === 'nao-informada'`. `tests/server/serve.mjs` deve fixar
`NEWSLETTER_NOTIFICAR=''` e `NEWSLETTER_POLITICA_VERSAO='qa'`.

Nenhum segredo novo no repositório; CORS inalterado (mesma origem); headers de segurança já
vêm do `vercel.json` para `/api/*`; a página HTML do descadastro não carrega script.

## 8. Testes — `server/test/newsletter.test.js` (`npm test`, sem MongoDB)

`validarInscricao` (pura):
- aceita completo, normaliza nome/espaços, e-mail em minúsculas, `empresa` vazia não entra em `dados`
- corpo vazio → erros em `nome`, `email`, `consentimento` (nessa chave exata)
- corpo não-objeto (null, string, número, array) → `ok: false`
- e-mail inválido, nome 1 char, nome/empresa acima do limite, objeto/array → `Formato inválido.`
- consentimento: recusa `false`, `'false'`, `''`, `0`, `'nao'`; aceita `true`, `'on'`, `'1'`, `'sim'`
- `origem` cortada em 120, padrão `nao-informada`

`truncarIp`: `203.0.113.77` → `203.0.113.0/24`; `::ffff:203.0.113.77` → idem; `2001:db8:abcd:12::1` → `2001:db8:abcd::/48`; `undefined` → `null`.

Token: gerar/verificar ida e volta; e-mail alterado → inválido; assinatura alterada → inválido; segredo diferente → inválido; formato sem `.` → inválido; `timingSafeEqual` não lança com tamanhos diferentes.

HTTP (`express` em porta 0, `salvar`/`descadastrar` fakes, `log` silencioso, relógio fixo, `segredo: 'teste'`):
- válido → 201 `{ ok: true }` sem `id`; `salvar` recebeu `email` minúsculo, `status: 'ativa'`, `consentimentos[0]` com `em`, `ipTruncado`, `origem`, `politicaVersao`
- mesmo e-mail duas vezes → 201 e 201, corpos idênticos (`salvar` fake simula upsert)
- urlencoded com `consentimento=on` → 201
- inválido → 400 com `campos.email` e `campos.consentimento`, `salvar` não chamado
- JSON malformado → 400; corpo > 16 KB → 413
- honeypot → 200 `{ ok: true }`, nada gravado/notificado
- `salvar` lança → 503, sem `ok`
- `notificar` lança → 201 (inscrição já gravada)
- rota com `max: 2` → 3º envio 429 com `Retry-After`
- `GET /descadastro?token=<válido>` → 200 `text/html`, contém `<form method="post"`, e-mail mascarado, **`descadastrar` não chamado**
- `GET /descadastro?token=lixo` e sem token → 400, não revela nada
- `POST /descadastro {token}` válido → 200; `descadastrar` chamado com e-mail e `via: 'token'`; repetir → 200 igual
- `POST /descadastro {token}` com `Accept: application/json` → JSON; sem → HTML
- `POST /descadastro {email}` existente e inexistente → **202 com corpo idêntico**; `via: 'email'`
- `POST /descadastro {email: 'x'}` → 400 `campos.email`; `{}` → 400
- `descadastrar` lança → 503

Integração (Playwright, `tests/e2e/newsletter.spec.js`, depois do front): com mongod descartável,
inscrição 201 cria 1 documento em `newsletter_inscricoes`; reenvio não duplica; `GET /descadastro`
não altera `status`; `POST` muda para `descadastrada`; nova inscrição volta a `ativa` e
`consentimentos.length === 2`.

## 9. Contrato front-end (para o `frontend-motion`)

Markup (seção 09 da home), mesmas classes do form de contato (`dmc-form`, `.form-group`,
`.form-consent`, `.form-hp`, `.form-message`, `.form-field__error` já existem no CSS):

```html
<form id="newsletterForm" class="dmc-form newsletter-form" action="/api/newsletter" method="post"
      data-origem="home-newsletter" aria-describedby="newsletterMessage">
  <input id="nl-nome"  name="nome"  type="text"  autocomplete="name"  required minlength="2" maxlength="120">
  <input id="nl-email" name="email" type="email" autocomplete="email" required maxlength="254">
  <input id="nl-empresa" name="empresa" type="text" autocomplete="organization" maxlength="120">   <!-- opcional -->
  <div class="form-hp" aria-hidden="true"><label for="nl-website">Não preencha este campo</label>
    <input type="text" id="nl-website" name="website" tabindex="-1" autocomplete="off"></div>
  <div class="form-consent">
    <input type="checkbox" id="nl-consentimento" name="consentimento" value="true" required>
    <label for="nl-consentimento">Autorizo o Complexo DMC a usar meu nome e e-mail para enviar análises e conteúdos
      institucionais, nos termos da LGPD e da <a href="pages/politica-de-privacidade.html">Política de Privacidade</a>.
      Posso cancelar a qualquer momento.</label>
  </div>
  <input type="hidden" name="origem" value="home-newsletter">
  <p id="newsletterMessage" class="form-message" role="status" aria-live="polite"></p>
  <button type="submit" class="dmc-btn dmc-btn--primary">Quero receber análises</button>
</form>
```

Comportamento (extrair de `main.js` o bloco do `#contactForm` numa função
`ligarFormulario(form, { mensagens })` e aplicar aos dois forms — mesma lógica de
`aria-busy`, botão "Enviando…", `aria-invalid` + `<p id="nl-<campo>-erro" class="form-field__error">`
ligado por `aria-describedby`, foco no 1º campo inválido, limpeza ao corrigir):

| Resposta | O que o front mostra em `#newsletterMessage` |
|---|---|
| `fetch` falhou / timeout 15 s | `Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.` (classe `is-erro`) |
| **201** e `corpo.ok === true` | `form.reset()` + `Inscrição registrada. Você pode sair da lista a qualquer momento pelo link nas mensagens ou por administrativo@complexodmc.com.br.` (`is-sucesso`) |
| 200 (honeypot) | mesma mensagem de sucesso (o robô não percebe) |
| 400 com `campos` | marca campos; `#newsletterMessage` = erros concatenados |
| 400/413/429 com `error` | `corpo.error` |
| 503 / 5xx / outro | `Não foi possível registrar sua inscrição agora. Tente novamente em instantes.` |

Regras invioláveis no front:
- **Nunca** exibir sucesso sem `resposta.ok && corpo.ok === true`. Nunca dizer "verifique seu
  e-mail", "confirmação enviada" ou prometer frequência ("semanal"): não há envio nesta fase.
- Sem texto de resultado/promessa (OAB). Nome do CTA: "Quero receber análises".
- Rodapé da seção deve ter o aviso de descadastro em texto (`administrativo@complexodmc.com.br`)
  enquanto não houver e-mails saindo.
- Formulário funciona sem JS: `action`/`method` reais; a resposta JSON crua é o fallback aceito.

## 10. Pré-requisitos fora do backend (bloqueiam a publicação, não o código)

1. **Política de Privacidade** (`pages/politica-de-privacidade.html`) precisa de nova
   finalidade ("envio de análises e conteúdos institucionais por e-mail, com base no
   consentimento"), menção à coleção/retenção da newsletter e, sobretudo, correção da frase
   "O endereço IP … não é gravado" — este blueprint grava o IP **truncado** no registro de
   consentimento. Alternativa, se o CEO preferir manter a frase: gravar só
   `HMAC(ip)` ou nada (o campo vira `null`), perdendo força probatória. Decisão do CEO.
2. `NEWSLETTER_POLITICA_VERSAO` só faz sentido quando a política tiver data real (hoje
   "[CONFIRMAR: data de publicação]").
3. Credenciais Resend (`RESEND_API_KEY`, `LEADS_EMAIL_FROM` com domínio verificado) para
   qualquer e-mail — hoje inexistentes; o backend funciona sem elas (grava + loga).
4. Decisão sobre a ferramenta de disparo das análises (fora deste escopo): a coleção exporta
   `status: 'ativa'`; a URL de descadastro e os headers `List-Unsubscribe` devem apontar para
   `/api/newsletter/descadastro?token=` gerado com `gerarTokenDescadastro`.

## 11. Comandos de verificação (após implementar)

```bash
npm test                                       # server/test/*.test.js, sem Mongo
node tests/server/serve.mjs &                  # guarde o PID; encerre com kill <PID>
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:4590/api/newsletter \
  -H 'content-type: application/json' -d '{"nome":"Maria","email":"m@ex.com.br","consentimento":true,"origem":"qa"}'   # 201
curl -s -X POST http://127.0.0.1:4590/api/newsletter -H 'content-type: application/json' -d '{"email":"x"}'               # 400 campos
curl -s -X POST http://127.0.0.1:4590/api/newsletter -H 'content-type: application/json' -d '{"website":"bot"}'           # 200
curl -s -X POST http://127.0.0.1:4590/api/newsletter/descadastro -H 'content-type: application/json' -d '{"email":"m@ex.com.br"}'  # 202
```
