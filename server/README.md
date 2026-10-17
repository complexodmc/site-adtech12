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
3. Rode atrás de HTTPS — o token trafega no header.
4. Em Network Access no Atlas, libere o IP do servidor (hoje o acesso depende
   do IP da máquina que roda a API).
5. Rotacione a senha do usuário do Atlas se ela já tiver circulado fora do
   cofre de segredos.
