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
  aluno se libera. Exige `DEV_SIMULAR_PAGAMENTO=true`; o botão em
  `obrigado.html` só aparece em `localhost`. **Deixe `false` em produção.**

## Antes de ir pra produção

1. `DEV_SIMULAR_PAGAMENTO="false"` no `.env`.
2. Rode atrás de HTTPS — o token trafega no header.
3. Em Network Access no Atlas, libere o IP do servidor (hoje o acesso depende
   do IP da máquina que roda a API).
4. Rotacione a senha do usuário do Atlas se ela já tiver circulado fora do
   cofre de segredos.
