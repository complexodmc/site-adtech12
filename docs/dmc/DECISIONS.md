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
- Pendente do CEO (fora do nosso alcance): trocar a senha do usuário MongoDB no Atlas e o
  `JWT_SECRET` (atualizar nas variáveis da Vercel) e autorizar o hotfix em produção.
- Aprovação necessária: **sim** (publicação fora do pacote final + risco relevante).
