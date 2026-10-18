# Complexo DMC · API da Plataforma EAD

Backend em Node + Express + MongoDB Atlas. Sobe a API em `/api/*` e serve o
site estático de `complexodmc.com.br/` no mesmo processo e na mesma porta —
por isso o front chama `/api` em caminho relativo, sem CORS.

## Subir o projeto

```bash
cd server
npm install
cp .env.example .env      # preencha MONGODB_URI e JWT_SECRET
npm run seed              # popula o catálogo a partir de js/data.js
npm run create-admin -- --email=voce@dominio.com --senha=suasenha --nome="Seu Nome"
npm start                 # http://localhost:3000/plataforma-ead/
```

`npm run dev` roda com `--watch` (reinicia sozinho ao salvar).

Gere o `JWT_SECRET` com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Sobe a API + site estático |
| `npm run dev` | Idem, reiniciando a cada alteração |
| `npm run seed` | Upsert idempotente do catálogo (não apaga nada) |
| `npm run seed -- --reset` | Apaga cursos/módulos/aulas antes de recriar |
| `npm run create-admin -- --email=… --senha=…` | Cria ou promove um administrador |
| `npm test` (na raiz do repositório) | Testes `node:test` de `server/test/` — não precisam de MongoDB |

O seed lê `complexodmc.com.br/plataforma-ead/js/data.js`, então o conteúdo dos
cursos não fica duplicado no repositório.

## Coleções

| Coleção | Documento |
|---|---|
| `users` | `{ _id, email, senhaHash, nome, isAdmin, createdAt }` |
| `cursos` | `{ _id, titulo, subtitulo, descricao, cargaHoraria, modalidade, iconeKey, preco, linkCheckout, beneficios[], ordem, isAtivo }` |
| `modulos` | `{ _id, cursoId, numero, titulo, resumo, duracao, ordem }` |
| `aulas` | `{ _id, moduloId, titulo, duracao, videoUrl, ordem, materiais[] }` |
| ↳ `materiais[]` | `{ id, tipo: 'arquivo'\|'link', nome, arquivo, url, tamanho, createdAt }` |
| `liberacoes` | `{ userId, cursoId, grantedAt, grantedBy }` |
| `progresso` | `{ userId, aulaId, completedAt }` |
| `leads` | `{ nome, email, telefone?, empresa?, perfil, eixo?, mensagem?, curso?, origem, consentimento: { aceito, em }, status: 'novo', createdAt }` |
| `parcerias_candidaturas` | `{ protocolo, programa, email, dados, fonte, status, historico[], responsavel, consentimento: { aceito, em, finalidade }, comunicacoes: { aceito, em }, retencaoAte, createdAt, updatedAt }` |
| `newsletter_inscricoes` | `{ email (minúsculas, único), nome, empresa?, status: 'ativa'\|'descadastrada', origem, criadoEm, atualizadoEm, consentimentos: [{ em, ipTruncado\|null, origem, politicaVersao, texto, baseLegal }] (50 mais recentes), descadastro?: { em, via: 'token'\|'email'\|'manual' } (vigente), descadastros: [{ em, via }] (histórico; preservado na reinscrição, eliminado pelo prazo da Política de Privacidade [CONFIRMAR: prazo e procedimento manual de eliminação]) }` |
| `bolsas_preinscricoes` | `{ protocolo (único), email (minúsculas, único), dados: { nome, email, whatsapp?, cidade, uf, perfil, area, motivacao? }, fonte, status: 'pre-inscrito', consentimento: { aceito, em, finalidade: 'aviso-concurso-bolsas' }, comunicacoes: { aceito, em }, createdAt }` |

Índices únicos em `users.email`, `liberacoes(userId, cursoId)` e
`progresso(userId, aulaId)` — criados sozinhos no boot.

Mongo não tem chave estrangeira, então o `DELETE` de curso e de módulo faz a
cascata na mão (remove módulos, aulas, progresso e liberações dependentes).

## Rotas

Autenticação por JWT no header `Authorization: Bearer <token>`.

### Públicas
- `GET /api/health` — status do processo e nome do banco
- `POST /api/auth/signup` — `{ email, senha, nome }` → `{ token, user }`
- `POST /api/auth/signin` — `{ email, senha }` → `{ token, user }`

`/api/auth/*` tem throttle de 20 tentativas por IP a cada 15 min.

### Formulário de contato do site — `POST /api/contato`

Usado pela home (`form#contactForm`, origem `home`) e por
`pages/treinamento-interesse.html` (origem `treinamento-interesse`). Aceita JSON
ou `application/x-www-form-urlencoded`; corpo de até 16 KB.

| Campo | Regra |
|---|---|
| `nome` | obrigatório, 2–120 caracteres |
| `email` | obrigatório, formato de e-mail, até 254 (gravado em minúsculas) |
| `telefone` | opcional; se vier, 10–13 dígitos com DDD |
| `empresa` | opcional, até 120 |
| `perfil` | obrigatório: `empresario`, `incorporadora-construtora`, `familia-empresaria`, `produtor-rural`, `investidor`, `outro` |
| `eixo` | obrigatório: `E1`…`E6` ou `nao-sei` — dispensado quando há `curso` |
| `mensagem` | obrigatória, 10–4000 — dispensada quando há `curso` |
| `curso` | opcional, até 150 (interesse em treinamento) |
| `consentimento` | obrigatório e afirmativo (`true`, `"on"`, `"1"`, `"sim"`) — LGPD |
| `origem` | página de onde veio; opcional, cortada em 120 |
| `website` | isca anti-robô: tem de vir vazia |

Respostas:

| Status | Corpo | Quando |
|---|---|---|
| 201 | `{ ok: true, id }` | gravado em `leads` |
| 200 | `{ ok: true }` | `website` preenchido: descartado em silêncio, nada é gravado |
| 400 | `{ error, campos: { <campo>: "mensagem em português" } }` | validação |
| 400 | `{ error }` | corpo ilegível (JSON malformado) |
| 413 | `{ error }` | corpo acima de 16 KB |
| 429 | `{ error }` + `Retry-After` | mais de 5 envios por IP em 15 min |
| 503 | `{ error }` | falha ao gravar no banco (nunca responde sucesso sem gravar) |

O throttle é em memória por instância (na Vercel, um freio de abuso, não um
limite global). O IP vem de `req.ip`: `trust proxy` = 1 na Vercel, desligado fora
dela (variável `TRUST_PROXY`).

**Aviso por e-mail (opcional).** Com `RESEND_API_KEY` e `LEADS_EMAIL_TO`, cada
lead gravado dispara um e-mail em texto puro pela API HTTP do Resend (`fetch`
nativo, sem dependência nova), com `reply_to` no e-mail de quem escreveu.
`LEADS_EMAIL_FROM` precisa ser de domínio verificado no Resend. Sem essas
variáveis, o lead fica só em `leads` e o log registra
`e-mail de notificação não configurado`. Falha no envio do e-mail não desfaz o
lead nem vira erro para o visitante — vai para o log. SMTP não foi incluído para
não trazer `nodemailer`; se a equipe preferir SMTP, ele entra no lugar de
`criarNotificadorEmail` em `src/routes/contato.js`.

### Candidaturas de parceria — `POST /api/parcerias/{partner-lawyers|business-partner}`

Código em `src/routes/parcerias.js`. **A modalidade vem da rota**; um campo
`programa` no corpo é ignorado. JSON ou `application/x-www-form-urlencoded`
(checkbox repetido vira lista), corpo de até 16 KB, honeypot `website`, throttle
próprio de 5 envios por IP em 15 min (contadores separados dos do contato).

| Partner Lawyers | Regra |
|---|---|
| `nome` | obrigatório, 2–120, com letra |
| `oab_numero` | obrigatório; só dígitos (3–7) depois de tirar `.`, espaço e `-`; gravado só com dígitos |
| `oab_seccional`, `uf` | obrigatórios; uma das 27 UFs (gravadas em maiúsculas) |
| `escritorio` | opcional, até 150 |
| `areas` | obrigatório, ≥1: `empresarial`, `sucessoes-patrimonio`, `imobiliario`, `tributario`, `trabalhista-empresarial`, `recuperacao-ativos`, `outra` |
| `cidade` | obrigatório, 2–80 |
| `email` | obrigatório (mesma regra do contato; domínio gratuito é aceito) |
| `telefone` | obrigatório, 10–13 dígitos (gravado só com dígitos) |
| `apresentacao` | obrigatório, 30–2000, multilinha |

| Business Partner | Regra |
|---|---|
| `nome`, `cidade`, `uf`, `email` | como acima |
| `empresa` | opcional, até 120 |
| `cargo` | obrigatório, 2–80 |
| `segmento` | obrigatório: `consultoria-empresarial`, `desenvolvimento-negocios`, `representacao-comercial-b2b`, `mercado-imobiliario`, `construcao-civil`, `agronegocio`, `rede-empresarial`, `outro` |
| `whatsapp` | obrigatório, 10–13 dígitos |
| `experiencia_b2b` | obrigatório: `ate-2-anos`, `2-a-5-anos`, `5-a-10-anos`, `mais-de-10-anos` |
| `perfil_empresas` | obrigatório, 10–1000 (setores e porte, sem nomes) |
| `mensagem` | opcional, até 2000 |

Nos dois: `consentimento` obrigatório e afirmativo (LGPD); `comunicacoes`
opcional e separado (opt-in, padrão `false`); `pagina` (até 120, sem query) e
`utm_source|medium|campaign|content` (até 80, só `[A-Za-z0-9._-]`) vão para
`fonte`. Objeto/array onde se espera texto → `"Formato inválido."`. IP,
user-agent e referrer não são gravados.

| Status | Corpo | Quando |
|---|---|---|
| 201 | `{ ok: true, id, protocolo, programa }` | gravado (protocolo `PL-AAAA-XXXXXX` / `BP-AAAA-XXXXXX`) |
| 200 | `{ ok: true, duplicada: true, protocolo, programa }` | mesmo e-mail + programa nas últimas 24 h, não arquivada: devolve o protocolo existente |
| 200 | `{ ok: true }` (sem protocolo) | honeypot: nada gravado — o front não deve contar como conversão |
| 400 | `{ error, campos }` ou `{ error }` | validação / corpo ilegível |
| 413 · 429 · 503 | `{ error }` | corpo > 16 KB · excesso (com `Retry-After`) · banco indisponível |

A duplicidade é um `findOne` antes do `insertOne`: dois envios simultâneos do
mesmo e-mail ainda podem gerar duas candidaturas (janela de 24 h não cabe em
índice único); o throttle reduz, a equipe arquiva a sobra. `retencaoAte`
(criação + 24 meses) é só informativo — não há índice TTL.

**Funil (só admin, `requireAuth` + `requireAdmin`).**
Partner Lawyers: `recebido → validacao-profissional → avaliacao-institucional → reuniao → decisao → formalizacao`.
Business Partner: `recebido → qualificacao → contato-comercial → reuniao → proposta-cooperacao → decisao`.
Avança ou volta um passo por vez; `arquivada` de qualquer estado (exige `nota`
de 5–500); de `arquivada` só reabre no estado anterior ao arquivamento.
Listas exportadas em `FUNIS`, `ROTULOS_ESTADOS` e `estadosDoPrograma()`.

- `GET /api/parcerias/admin/candidaturas?programa=…&status=…&pagina=1` — `programa`
  obrigatório; 25 por página, mais recentes primeiro → `{ itens, total, pagina, totalPaginas, estados, rotulos }`
  (itens sem os textos longos e sem histórico)
- `GET /api/parcerias/admin/candidaturas/:protocolo` → `{ candidatura, estados, permitidos }`
- `PATCH /api/parcerias/admin/candidaturas/:protocolo` — `{ status?, nota?, responsavel? }`;
  grava `historico` `{ status, de?, em, por, nota?, responsavel? }`. Transição
  inválida ou edição concorrente → 409 com a mensagem do motivo.

**Tela da equipe: `/plataforma-ead/parcerias.html`** (noindex; não há link no
`admin.html` — abra pela URL). Usa a mesma sessão da EAD: entre por
`login.html` com uma conta `isAdmin` (sem sessão, a tela manda para
`login.html?next=parcerias.html`; conta sem admin vê "Acesso restrito a
administradores"). Filtra por programa e status, abre o detalhe (dados, fonte/UTM,
consentimento, opt-in, histórico) e executa só as transições que a API devolve em
`permitidos`: avançar, voltar, arquivar (nota obrigatória), reabrir, responsável e
nota avulsa. Em 409, recarrega a candidatura e avisa que o status mudou. Arquivos:
`plataforma-ead/parcerias.html`, `js/parcerias-admin.js`, `css/parcerias-admin.css`
(lê `plataforma.css` e `api-client.js` sem alterá-los).

**Aviso por e-mail (opcional):** `RESEND_API_KEY` + `PARCERIAS_EMAIL_TO`
(reserva: `LEADS_EMAIL_TO`) + `LEADS_EMAIL_FROM`. Assunto
`[Partner Lawyers] Nova candidatura — Nome` / `[Business Partner] …`. Falha no
e-mail não desfaz a candidatura; sem chave, só log.

### Newsletter — `POST /api/newsletter`

Código em `src/routes/newsletter.js`; especificação em
`docs/dmc/home-redesign/blueprint-newsletter.md`. Mesmo desenho do contato:
parser próprio de 16 KB (JSON ou `application/x-www-form-urlencoded`, o form
funciona sem JS), honeypot `website`, throttle próprio de 5 envios por IP em
15 min, validação pura e **nunca sucesso sem gravar**. A coleção é separada de
`leads` (finalidade, base legal e retenção diferentes).

| Campo | Regra |
|---|---|
| `nome` | obrigatório, 2–120 caracteres, ao menos uma letra |
| `email` | obrigatório, ≤ 254, só ASCII visível (IDN/`İ` recusados), caracteres invisíveis (ZWSP, soft hyphen) removidos, gravado em minúsculas — é a chave de dedupe |
| `empresa` | opcional, ≤ 120 |
| `consentimento` | obrigatório e afirmativo (`true`, `"on"`, `"1"`, `"sim"`, `"yes"`) |
| `origem` | preenchido pela página (`home-newsletter`), cortado em 120; padrão `nao-informada` |
| `website` | honeypot — deve vir vazio |

| Status | Corpo | Quando |
|---|---|---|
| 201 | `{ ok: true }` | gravado **ou já existia** (dedupe silencioso: um só `updateOne` com upsert; sem `id`, não revela quem está na lista; reativa quem se descadastrou) |
| 200 | `{ ok: true }` | honeypot preenchido — descartado, só log |
| 400 | `{ error: 'Revise os campos indicados.', campos: { nome?, email?, empresa?, consentimento? } }` | validação (mensagens em pt-BR) |
| 400 | `{ error }` | JSON malformado |
| 413 | `{ error: 'Conteúdo grande demais. Reduza o texto dos campos e tente de novo.' }` | corpo acima de 16 KB |
| 429 | `{ error }` + `Retry-After` | mais de 5 envios por IP em 15 min |
| 503 | `{ error }` | banco fora / gravação falhou / `NEWSLETTER_POLITICA_VERSAO` vazia em produção |

Cada inscrição acrescenta um registro ao histórico `consentimentos` (prova do
art. 8º §2º da LGPD; ficam os 50 mais recentes): data, origem,
`NEWSLETTER_POLITICA_VERSAO`, o id do texto aceito (`v1` — o texto exato está
em `TEXTOS_CONSENTIMENTO` no `newsletter.js`; o front copia dali) e
`baseLegal: 'consentimento'`. O **IP truncado** (IPv4 `/24`, IPv6 `/48`) só é
gravado com `NEWSLETTER_GRAVAR_IP=true`; por padrão fica `null`, porque a
Política de Privacidade publicada diz que o IP não é gravado — ligue só depois
de publicar a política corrigida (ver blueprint, §10). Em produção
(`NODE_ENV=production`), sem `NEWSLETTER_POLITICA_VERSAO` a inscrição é recusada
com 503 e o log acusa — consentimento sem versão de política não serve de prova.

O aviso interno (quando ligado) só sai para inscrição **nova** ou **reativada**;
reenvio do mesmo e-mail responde 201 igual, mas não gera e-mail. O aviso sai
sem `reply_to` (o endereço pode ter sido digitado por terceiro). Logs nunca
contêm o e-mail do inscrito, inclusive nos erros do driver (`resumirErro`).

**Descadastro** (`/api/newsletter/descadastro`), dois caminhos na mesma rota:

- `GET ?token=…` — só **exibe** uma página HTML de confirmação (sem script) com
  o e-mail mascarado e um `<form method="post">`. Nunca altera estado (antivírus
  e pré-carregadores abrem links de e-mail). Token inválido → 400 HTML, sem
  dizer se o e-mail existe.
- `POST { token }` — efetiva (`via: 'token'`). 200 `{ ok: true }` ou HTML
  "Pronto…" (ver negociação abaixo). Mesma resposta se já estava fora ou nunca
  existiu. Token inválido → 400.
- `POST { email }` — autoatendimento (`via: 'email'`), **sem prova de posse**:
  é opt-out reversível, e terceiro pode descadastrar alguém. Freios: throttle
  por IP (5/15 min), **limite por endereço-alvo** (3 pedidos/24 h, qualquer IP
  → 429) e **allowlist de origem**: pedido com `Origin`/`Referer` de outro site
  → 403 (`complexodmc.com.br`, `www`, `CORS_ORIGINS`, `NEWSLETTER_ORIGENS` e,
  fora da Vercel, `localhost` são aceitos; sem `Origin` — curl — passa). Com
  tudo em ordem: **sempre** 202 `{ ok: true, mensagem: 'Se este e-mail estiver
  na lista, ele será removido.' }`, exista ou não. E-mail inválido → 400
  `campos.email`. É o caminho honesto enquanto não há serviço de e-mail.
- Falha no banco → 503. Honeypot → 200 neutro.

Negociação de conteúdo (todas as respostas do `POST /descadastro`): JSON é o
padrão — quem envia `Content-Type: application/json` ou `Accept: */*` (fetch,
curl) recebe JSON; só o formulário HTML sem JS (urlencoded + `Accept: text/html`)
recebe página HTML, inclusive nos 400/403/429/503. O front deve mandar
`Accept: application/json`. As páginas HTML saem com `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `nosniff` e CSP fechado
(sem script, `frame-ancestors 'none'`), também fora da Vercel.

Token: `base64url(email) + '.' + base64url(HMAC-SHA256(JWT_SECRET,
'dmc-newsletter-descadastro:v1:' + email))`, sem expiração, comparado com
`timingSafeEqual`. A primeira metade é o e-mail apenas codificado: a URL do
`GET` carrega o e-mail (logs da Vercel, histórico do navegador) — por isso
`no-referrer` e `no-store`; um token opaco gravado no documento fica para a fase
2. Gere com `gerarTokenDescadastro(email, config.jwtSecret)` para o rodapé dos
e-mails e os cabeçalhos `List-Unsubscribe` (RFC 8058). Trocar o `JWT_SECRET`
invalida os links; o descadastro por e-mail continua.

Limitação conhecida: os throttles (IP e endereço-alvo) são em memória por
instância; na Vercel cada lambda tem o seu e um cold start zera a janela. São
freios de abuso, não limites globais — a allowlist de origem é o que segura o
CSRF distribuído. Fase 2: Vercel KV/Upstash para contadores compartilhados.

**Aviso interno (opcional, desligado por padrão):** `NEWSLETTER_NOTIFICAR=true`
+ `RESEND_API_KEY` + `NEWSLETTER_EMAIL_TO` (reserva: `LEADS_EMAIL_TO`) +
`LEADS_EMAIL_FROM`. Assunto `Nova inscrição na newsletter — Nome`. Não existe
e-mail de boas-vindas nem *double opt-in* nesta fase — o front não pode sugerir
que exista. Sem chave, só grava e loga.

### DMC Business School — `GET /api/vitrine/cursos` e `POST /api/bolsas/pre-inscricao`

Código em `src/routes/vitrine.js` e `src/routes/bolsas.js` (banco injetado pelo
`server.js`; testes em `test/vitrine.test.js` e `test/bolsas.test.js`).

**Vitrine (pública, sem token).** `GET /api/vitrine/cursos` →
`200 { cursos: [{ id, titulo, subtitulo, descricao, cargaHoraria, modalidade, iconeKey, capaUrl, modulos, aulas }] }`:
só `isAtivo !== false`, por `ordem`; `modulos` e `aulas` são contagens reais do
banco (`aulas` inclui as "Em breve" — o mesmo número dos cards da loja);
`capaUrl` vazio quando o curso não tem capa. Lista de campos fechada: nunca sai
`videoUrl`, materiais, roteiro, `linkCheckout` nem preço.
`Cache-Control: public, max-age=300`. Banco fora → `503 { error }` (`no-store`).

**Pré-inscrição no Concurso de Bolsas.** Não é inscrição no concurso nem
promessa de bolsa: registra quem quer ser avisado quando o concurso abrir
(finalidade do consentimento: `aviso-concurso-bolsas`). Critérios, quantidade de
bolsas e datas não existem na API — o front não pode sugeri-los. JSON ou
`application/x-www-form-urlencoded`, corpo de até 16 KB, honeypot `website`,
throttle próprio de 5 envios por IP em 15 min.

| Campo | Regra |
|---|---|
| `nome` | obrigatório, 2–120, com letra |
| `email` | obrigatório, gravado em minúsculas; **um registro por e-mail** |
| `whatsapp` | opcional, 10–13 dígitos (gravado só com dígitos) |
| `cidade` | obrigatório, 2–80 |
| `uf` | obrigatório, uma das 27 UFs |
| `perfil` | obrigatório: `estudante-graduacao`, `recem-formado`, `profissional`, `outro` |
| `area` | obrigatório: `planejamento-sucessorio-patrimonial`, `holding-patrimonial`, `notarial-imobiliario`, `negocios-vendas`, `tecnologia` |
| `motivacao` | opcional, até 400, multilinha |
| `consentimento` | obrigatório e afirmativo (LGPD) |
| `comunicacoes` | opcional, opt-in separado (padrão `false`) |

`pagina` (só o caminho: sem host, query e fragmento; `[A-Za-z0-9._/-]`, até 80)
e `utm_source|medium|campaign|content` (`[A-Za-z0-9._-]`, até 80) vão para
`fonte`. Objeto/array onde se espera texto → `"Formato inválido."`. IP,
user-agent e referrer não são gravados.

| Status | Corpo | Quando |
|---|---|---|
| 201 | `{ ok: true, protocolo }` | gravado (protocolo `BOL-AAAA-XXXXXX`) |
| 200 | `{ ok: true, duplicada: true, protocolo }` | e-mail já pré-inscrito: devolve o protocolo existente; nada é alterado |
| 200 | `{ ok: true }` (sem protocolo) | honeypot: nada gravado — o front não deve contar como conversão |
| 400 | `{ error: 'Revise os campos indicados.', campos }` ou `{ error }` | validação / corpo ilegível |
| 413 · 429 · 503 | `{ error }` | corpo > 16 KB · excesso (com `Retry-After`) · banco indisponível |

Duplicidade sem corrida: índice único `uq_bolsas_email` — o insert vai direto e
o E11000 do e-mail devolve o protocolo da pré-inscrição existente (envios
simultâneos → um 201, os demais 200 `duplicada`). Protocolo também tem índice
único (`uq_bolsas_protocolo`; colisão sorteia outro).

- `GET /api/bolsas/admin/pre-inscricoes?pagina=1` — `requireAuth` +
  `requireAdmin` (401/403 sem permissão) → `{ ok, pagina, porPagina: 25, total, totalPaginas, rotulos: { perfis, areas }, itens }`,
  mais recentes primeiro, `Cache-Control: no-store`. Ainda não há tela da
  equipe: a consulta é por esta rota.

**Aviso por e-mail (opcional):** `RESEND_API_KEY` + `BOLSAS_EMAIL_TO`
(reserva: `LEADS_EMAIL_TO`) + `LEADS_EMAIL_FROM`. Assunto
`[Concurso de Bolsas] Nova pré-inscrição — Nome`. Falha no e-mail não desfaz a
pré-inscrição; sem chave, só log. Não existe e-mail de confirmação para quem se
pré-inscreve — o front não pode sugerir que exista.

### Aluno autenticado
- `GET /api/auth/me` — sessão atual
- `GET /api/catalogo` — cursos → módulos → aulas, já aninhado e ordenado
- `GET /api/liberacoes/me` — `{ cursoIds }` do próprio aluno
- `GET /api/progresso` — `{ itens: [{ aulaId, completedAt }] }`
- `PUT /api/progresso/:aulaId` — marca concluída (idempotente: preserva a data original)
- `DELETE /api/progresso/:aulaId` — desmarca
- `GET /api/materiais/:aulaId/:matId` — baixa o PDF de apoio. Só entrega se o
  aluno tiver o curso liberado (admin passa direto); material do tipo `link`
  responde com redirect 302.

### Admin (`isAdmin: true`)
- `GET /api/liberacoes` — `{ byEmail: { email: [cursoId] } }`
- `POST /api/liberacoes` — `{ email, cursoIds[] }`
- `DELETE /api/liberacoes?email=…[&cursoId=…]` — sem `cursoId` revoga tudo
- `PUT|DELETE /api/cursos/:id`
- `PUT|DELETE /api/modulos/:id`
- `PUT|DELETE /api/aulas/:id`
- `POST /api/aulas/:id/materiais?nome=…` — upload de PDF. O corpo é o arquivo
  cru com `Content-Type: application/pdf` (sem multipart). Teto de
  `MAX_UPLOAD_MB` (padrão 25 MB); rejeita o que não começa com `%PDF-`.
- `POST /api/aulas/:id/materiais/link` — `{ nome, url }` para material hospedado
  fora (Drive, Dropbox…)
- `PUT /api/aulas/:id/materiais/:matId` — `{ nome }`, renomeia
- `DELETE /api/aulas/:id/materiais/:matId` — remove o registro e o arquivo

Os PDFs ficam em `UPLOADS_DIR` (padrão `server/uploads/materiais`), **fora** do
site estático — a única saída é a rota `GET /api/materiais/…`, que confere a
liberação. Apagar curso, módulo ou aula também apaga os arquivos.

### Só em desenvolvimento
- `POST /api/liberacoes/dev/simular-pagamento` — `{ cursoIds[] }`, o próprio
  aluno se libera. Só é registrada com `DEV_SIMULAR_PAGAMENTO=true` (sem a
  flag, responde o 404 da API); o botão em `obrigado.html` só aparece em
  `localhost`. **Deixe `false` em produção.**

## Antes de ir pra produção

1. `DEV_SIMULAR_PAGAMENTO="false"` no `.env`.
2. Para receber os leads por e-mail: `RESEND_API_KEY`, `LEADS_EMAIL_TO` e
   `LEADS_EMAIL_FROM` nas variáveis da Vercel (domínio verificado no Resend).
   Candidaturas de parceria: `PARCERIAS_EMAIL_TO` (senão vão para `LEADS_EMAIL_TO`).
   Concurso de Bolsas: `BOLSAS_EMAIL_TO` (senão vai para `LEADS_EMAIL_TO`).
   Newsletter: `NEWSLETTER_POLITICA_VERSAO` com a data real da Política de
   Privacidade (**obrigatória em produção** — sem ela a inscrição responde 503);
   `NEWSLETTER_GRAVAR_IP=true` só depois de publicar a política corrigida;
   `NEWSLETTER_NOTIFICAR` / `NEWSLETTER_EMAIL_TO` só se a equipe quiser um
   aviso por inscrição. `MONGODB_SERVER_SELECTION_TIMEOUT_MS` fica em 5000 na
   Vercel por padrão (banco fora → 503 antes do limite de 10 s da função).
3. Rode atrás de HTTPS — o token trafega no header.
4. Em Network Access no Atlas, libere o IP do servidor (hoje o acesso depende
   do IP da máquina que roda a API).
5. Rotacione a senha do usuário do Atlas se ela já tiver circulado fora do
   cofre de segredos.

## Portal acadêmico · Assistente de IA (Google Gemini)

Especificação: `docs/dmc/PORTAL-ACADEMICO.md`, `PORTAL-API.md` e `PORTAL-UX.md`.

- **Chave:** a coordenação cola a chave em `professor.html#/configuracoes/ia` (só admin,
  com reautenticação). Ela é guardada cifrada (AES-256-GCM, derivada do `JWT_SECRET`) no
  documento `configuracoes.assistente_ia` e nunca volta ao navegador — só "configurada",
  a origem e os 4 últimos caracteres. `GEMINI_API_KEY` no ambiente tem precedência e
  trava a troca pelo painel.
- **Antes de colar a chave em produção:** trocar o `JWT_SECRET` (incidente T3 em
  `docs/dmc/DECISIONS.md`) — trocar depois invalida a chave cifrada e as sessões.
- **Chamada:** só pelo servidor, com o cabeçalho `x-goog-api-key` (nunca `?key=`), prazo
  `PORTAL_IA_TIMEOUT_MS`, limites por aluno e teto diário global.
- **Dados:** ferramentas só de leitura dos dados do próprio aluno; CPF, e-mail e números
  longos são mascarados antes de sair; consentimento LGPD antes do primeiro uso.
- **Desligado ou sem chave:** a tela do aluno mostra estado honesto e leva ao atendimento.
