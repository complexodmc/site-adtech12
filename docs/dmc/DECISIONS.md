# DMC PRIME — DECISÕES

Formato: **Decisão / Justificativa / Impacto / Aprovação**. Uma linha de data por item.

## Aprovadas pelo CEO (2026-10-17)

### D1 — E6 é Consultoria Trabalhista
- Decisão: E6 definitivamente "Consultoria Trabalhista"; navegação, cards, títulos,
  metadados e página interna alinhados. Seis eixos preservados.
- Conteúdo de Tecnologia e Inovação não é apagado: reorganizado como capacidade transversal.
- Aprovação: CEO ✔

### D2 — Direção criativa C (Híbrido Executivo)
- Decisão: autoridade institucional + vídeo cinematográfico + 3D/rede neural + identidade
  DMC premium + layout editorial + mobile sofisticado. Planning como referência de
  qualidade, nunca de cópia. Não reapresentar opções A/B/C.
- Aprovação: CEO ✔

### D3 — Publicação em produção autorizada sob condições
Só publicar se, cumulativamente: (1) testes críticos aprovados; (2) sem erros bloqueantes
ou regressões; (3) backup + rollback preservados; (4) formulários, navegação e
integrações funcionando; (5) domínio/ambiente de produção validados; (6) sem ação
destrutiva sobre dados reais. Caso contrário: não publicar, registrar e corrigir.
- Aprovação: CEO ✔ (condicionada)

### D4 — Autonomia
Submeter ao CEO apenas: mudanças estratégicas fora do escopo, despesas adicionais,
riscos relevantes, alterações institucionais sensíveis.

### D5 — Plataforma EAD mantida (2026-10-17)
- Decisão: a plataforma EAD (`complexodmc.com.br/plataforma-ead/` + API em `server/`)
  permanece no ar e no projeto. O redesign não pode removê-la nem quebrá-la; links do
  site para a EAD continuam. Arquivos compartilhados com a EAD só mudam com teste de
  regressão nela.
- Aprovação: CEO ✔

## Decisões da equipe

### T1 — Ponto de restauração (2026-10-17)
- Decisão: branch `feat/dmc-prime`; WIP de 72 arquivos commitado como `4b59d15`.
- Justificativa: D3 exige rollback; a árvore tinha +9k linhas sem commit.
- Impacto: qualquer regressão volta com `git checkout main`.
- Aprovação necessária: não.

### T2 — Stack preservada (2026-10-17)
- Decisão: continuar HTML/CSS/JS estático sem build; Three.js via módulo ES local
  (`assets/js/vendor/`) apenas onde houver cena 3D; Playwright + Lighthouse como
  devDependencies para QA.
- Justificativa: a stack atual publica na Vercel sem pipeline; introduzir build agora
  adiciona risco sem ganho comercial.
- Aprovação necessária: não.

### T3 — Incidente: `server/.env` público em produção (2026-10-17)
- Constatado: `GET https://www.complexodmc.com.br/server/.env` → 200, 808 bytes (mesmo
  tamanho do `server/.env` local, com `MONGODB_URI` e `JWT_SECRET`); `server/src/*` e
  `server/uploads/*` também públicos. Causa provável: deploy via CLI sem `.vercelignore`
  (último `last-modified` do arquivo em prod: 2026-10-17 13:48 GMT). Conteúdo não foi lido
  por nós — só cabeçalhos HTTP.
- Corrigido no repositório (branch `feat/dmc-prime`, ainda NÃO publicado): `.vercelignore`
  exclui `.env*`, docs, testes e resíduos; `vercel.json` redireciona `/server/*` → `/`.
  As variáveis já existem no painel da Vercel, então a API não depende do arquivo.
- Atualização: `server/.env.bak-atlas` (628 B, com outra `MONGODB_URI`/`JWT_SECRET`) também
  está público em prod (200). Coberto pelo mesmo `.vercelignore` (`**/.env.*`) e redirect.
- Pendente do CEO (fora do nosso alcance): trocar a senha de TODOS os usuários MongoDB citados
  em `server/.env` e `server/.env.bak-atlas` no Atlas e o
  `JWT_SECRET` (atualizar nas variáveis da Vercel) e autorizar o hotfix em produção.
- Rodada extra (2026-10-17 14:24 UTC): `server/.env.bak-atlas` também público (200, 628 B) e
  ausente do probe anterior; localmente contém `MONGODB_URI` do Atlas com usuário:senha
  (cluster `siteadtech`) e o mesmo `JWT_SECRET` de `server/.env`. A rotação passa a incluir
  a senha desse usuário Atlas; apagar `server/.env.bak-atlas` (hardlink: existe cópia fora
  do repo) e o build antigo `.vercel/output/` (contém os dois `.env`). Também 200:
  `server/src/**`, `server/scripts/*`, `server/uploads/*` (PDF e capa), `package-lock.json`.
- A correção "`.vercelignore` com `server/`" (AUDIT §5 P0) é inviável: `api/[...path].js`
  importa `../server/src/server.js`; sem `server/` no upload o build termina "ok" mas a
  função falha com `ERR_MODULE_NOT_FOUND` (derruba `/api/*`, viola D5). Substituir por
  `"outputDirectory": "complexodmc.com.br"` em `vercel.json` (validado com `vercel build`:
  estático só da pasta pública, função íntegra, `/api/health` 200) — proposta e evidências
  em `docs/dmc/audit/2026-10-17/backend-vercel/`. Pré-requisito: `engines.node` → `24.x`
  (CLI atual recusa 20.x). Porta de deploy: `docs/dmc/audit/tools/vercel-build-check.sh`.
- Aprovação necessária: **sim** (publicação fora do pacote final + risco relevante).

### D6 — Botão de acesso com dois destinos (2026-10-17)
- Decisão: o "Login" do menu vira "Acessar", com duas opções: Área do aluno (plataforma
  EAD) e Ad-tech. Implementar no redesign da navbar (desktop e mobile).
- Aprovação: CEO ✔

### D7 — Números institucionais removidos (2026-10-17)
- Decisão: todos os indicadores sem comprovação (95% satisfação, 98% sucesso, R$ 80M+,
  24/7, 40% economia tributária, 35%/60%/70%/98%/99% etc.) saem do site. Entram fatos
  verificáveis (seis eixos, sede em São Paulo, metodologia). Número novo só com
  comprovação documental e aprovação do CEO.
- Aprovação: CEO ✔

### T4 — Evidências fora do git; merge por squash (2026-10-17)
- Decisão: `docs/dmc/audit/20*/` e `docs/dmc/qa/` ficam só locais (`.gitignore`). Como os
  commits 811ba98–0e20496 da branch já carregam ~137 MB dessas evidências e a reescrita de
  histórico foi bloqueada, a `feat/dmc-prime` entra na `main` por **squash merge**, para
  que esses arquivos não cheguem à `main` nem ao GitHub.
- Aprovação necessária: não.

### D8 — Identidade visual da direção C (2026-10-17)
- Decisão: ouro latão `#d6b069` como cor de destaque; Newsreader (títulos) + Hanken Grotesk
  (texto); no site institucional, marca monocromática branca/ouro do rinoceronte — a versão
  turquesa/limão permanece na plataforma EAD; E4 Auditoria em cobre (evita colisão com o ouro).
- Aprovação: CEO ✔

### T5 — Configuração de deploy (2026-10-17, executar na etapa 8)
- Decisão: publicar com `outputDirectory: "complexodmc.com.br"` no `vercel.json` (cenário
  validado com `vercel build` na auditoria) em vez de servir a raiz do repositório: a raiz hoje
  publica cópias antigas (`/pages/*.html`, `/assets/*`, stub `/index.html`) com texto não
  aprovado. `api/` continua como função. Nunca excluir `server/` no `.vercelignore` (derruba a
  API da EAD — D5). Alinhar `engines.node` (20.x) com o projeto Vercel (24.x). Ajustar rewrites
  e redirects ao novo diretório de saída e validar com `vercel build` em checkout limpo.
- Aprovação necessária: não (dentro de D3).
