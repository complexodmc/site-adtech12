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
- Executado (2026-10-17, fullstack-architect, sem publicar): `vercel.json` com `outputDirectory`,
  rewrites `/api` e `/solucoes/:vertical/:slug`, redirects 301 (via `statusCode`, não 308) para
  `/complexodmc.com.br[/*]`, `/index.html`, `/em-construcao.html`, `planejamento-sucessorio-
  empresarial` e as cinco URLs antigas da raiz (`source` percent-encoded); `functions.excludeFiles`
  só `complexodmc.com.br/**` (função 126 MB → 8,6 MB; `server/uploads` fica porque `materiais.js`/
  `capas.js` servem por `sendFile` — D5); `.vercelignore` com padrões anchored (`/pages/`,
  `/assets/`, `/index.html`) — `pages/` sem barra inicial excluiria a pasta pública. Raiz do git
  limpa (`index.html`, `pages/`, `assets/`), resíduos e 17 mídias órfãs removidos (órfãs em HEAD
  **e** no checkpoint 4b59d15, não citadas no BRIEF); mídias citadas no BRIEF, de marca (RINO_*)
  ou de parceiro (Bear Finance) ficam. `engines.node` 24.x. Porta de deploy APROVADO; roteamento
  validado por emulador do `config.json` compilado (não pelo proxy real). Roteiro: `DEPLOY.md`.

### T6 — Incidente de processos e regra de segurança dos agentes (2026-10-17)
- Constatado: o agente de QA rodou `pkill -f "cat" -U <uid>` para encerrar um `cat` travado; o padrão
  casou com todo processo do usuário com "cat" na linha de comando (apps em `/Applications`,
  "Application Support"). Caíram VS Code (helpers), Claude Code (sessão reiniciada 15:03–15:04),
  Google Chrome e serviços Adobe. Sem perda no repositório (trabalho parcial preservado no disco).
- Decisão: regra obrigatória em `.claude/agents/*.md` e `.codex/agents/*.toml` — nunca `pkill`/`killall`/
  `kill -9` por nome nem `kill` em PID não iniciado pelo agente; encerrar só o PID guardado em `$!`.
- Aprovação necessária: não. CEO avisado.

### T6 — "A casa" vira "Sobre"; página institucional própria (2026-10-17)
- Decisão: o rótulo "A casa" sai do menu, da gaveta mobile, dos rodapés (26 páginas) e da seção
  da home; entra "Sobre". A seção `#conheca` da home é redesenhada (tese + seis eixos como
  tablist + foco do eixo + rede neural reescrita) e passa a apontar para a nova página
  `pages/sobre.html`, que concentra o texto institucional. O id `#conheca` é preservado
  (âncoras antigas e testes). A mensagem central aprovada pelo CEO ("O Complexo DMC integra
  seis eixos de especialidade…") é o lead da seção e o subtítulo do herói de Sobre.
- Justificativa: pedido do CEO (seção visualmente fraca e pouco comercial; "a casa" opaco
  para quem chega de fora). Rede sem manchas de cor: fundo liso `surface-0`, brilho só por
  gradiente radial no nó, satélites discretos.
- Impacto: `index.html`, `assets/css/styles.css?v=c4`, `assets/js/rede-neural.js?v=2`,
  `assets/js/navbar.js?v=c3` (aria-current em Sobre), rodapés de `pages/` e `solucoes/`,
  `sitemap.xml`. A seção "Soluções" (`#features`) não muda.
- Aprovação necessária: não (dentro de D2/D4); texto de Sobre segue para revisão do CEO.


### D9 — Alcance de atendimento e imagens da home (2026-10-17)
- Decisão do CEO: o atendimento do Complexo DMC é em todo o Brasil, inclusive internacional.
  O texto público pode afirmar "atendimento em todo o Brasil e no exterior" (sede em São Paulo);
  segue proibido inventar números (estados, países, clientes — D7).
- Decisão do CEO: as imagens da home (verticais, mapa, publicações, metodologia) são produzidas
  internamente por render procedural; a equipe da DMC substitui depois por fotografia licenciada
  se houver necessidade. Não bloqueia a entrega.
- Aprovação: CEO ✔

## Pacote "DMC PRIME — Master Prompt Definitivo": header, portal e Parcerias (2026-10-17)

### D10 — Header institucional e portal Acessar (decisões do CEO no briefing)
- Decisão do CEO: barra "Eixos | Sobre | Treinamentos | Parcerias | Tecnologia" + "Acessar ▾" +
  CTA "Converse com nossos especialistas" em ouro sólido; Acessar com DMC Business School,
  ADTECH, Artheu IA e Bloadhound (substitui D6, que tinha Área do aluno + Ad-tech).
- Aprovação: CEO ✔ (briefing). Divergência registrada: a sessão do redesign da home recebeu do
  CEO o pedido de "cabeçalho da home intacto"; prevaleceu o briefing mais específico. CEO informado.

### T7 — Implementação do header e destinos do portal (2026-10-17)
- Decisão: `navbar.js?v=c4` + `components.css?v=3`. Barra completa ≥1200px; 768–1199 gaveta +
  CTA na barra; <768 CTA na gaveta. Altura 72px desde 1024 mantida (os heróis compensam
  `--header-h-lg`). CTA: ouro `#d6b069` + grafite `#121416` (≈9:1), seta ↗, brilho por transform.
- Destinos reais: DMC Business School → `plataforma-ead/login.html` (200 em produção); ADTECH →
  `https://adtech-app.complexodmc.com.br` (URL já usada no site; DNS resolve, mas a conexão deu
  timeout no teste de 2026-10-17 — PENDENTE confirmar com o CEO). Artheu IA e Bloadhound: sem URL
  nem ativo de marca no repositório, no Drive ou em DNS → sem login; "Em estruturação" e link para
  a apresentação em `pages/tecnologia.html#artheu` / `#bloadhound`.
- Grafias: as do CEO ("Artheu IA", "Bloadhound"). PENDENTE validar: `recuperacao-ativos.html`
  escreve "ARTHEU" e descreve a IA como em uso; "Bloadhound" não tem ativo que confirme a grafia.
- Rodapés (pages/ e solucoes/): "Área do aluno" → "DMC Business School", "Ad-tech" → "ADTECH",
  item "Parcerias" na coluna Sobre.
- Aprovação necessária: não (execução de D10).

### T8 — Central de Parcerias: rotas, identidades e conformidade (2026-10-17)
- Rotas: `/parcerias/`, `/parcerias/advogados-parceiros/`, `/parcerias/business-partner/` (pastas
  com index.html); redirects 301 sem barra → com barra e `/parcerias/partner-lawyers` →
  advogados-parceiros (a Vercel compila `^/caminho$`, sem laço).
- Identidades: Partner Lawyers em champanhe; Business Partner em BRONZE (o azul-petróleo sugerido
  colide com E1 `#76b7c1`). Imagens procedurais originais (D9).
- Conformidade: texto do CEO mantido onde pediu, com alternativas neutras sinalizadas em
  `docs/dmc/parcerias/CONFORMIDADE.md` ("Desenvolvemos oportunidades", "Excelência profissional",
  "Agente Prospector"). Retirado o exemplo "empresas em reestruturação → E5" do Business Partner
  (mais próximo de captação de causas). Nenhuma remuneração, comissão ou percentual publicado.
- Campanhas: tudo PROPOSTO; nenhuma mídia paga, segmentação ou disparo sem revisão jurídica e
  aprovação do CEO.
- Aprovação necessária: revisão jurídica humana antes de qualquer divulgação (CONFORMIDADE.md §5).

### T9 — Candidaturas: backend, funil e painel (2026-10-17)
- Decisão: rotas separadas por programa em `/api/parcerias/*`, coleção `parcerias_candidaturas`
  (sem IP/user-agent), funil alterado só por admin, painel em `plataforma-ead/parcerias.html`
  (arquivo novo; nenhum arquivo da EAD alterado — D5). Sem CRM configurado: persistência no
  MongoDB existente + aviso por e-mail opcional (Resend), sem serviço pago novo.
- PENDENTE CEO: prazo de retenção (24 meses informativo, sem expurgo), destinatário
  `PARCERIAS_EMAIL_TO`, `RESEND_API_KEY`/remetente verificado.
- Aprovação necessária: não (arquitetura existente).

### T10 — Documentos de status deste pacote (2026-10-17)
- Decisão: `docs/dmc/PROJECT_STATUS.md` (painel executivo do briefing) e `docs/dmc/QA_REPORT.md`
  (QA deste pacote). O histórico detalhado continua em PROGRESS.md e QA.md — sem duplicar.

## Redesign da home (2026-10-17)

### D11 — Home v2: síntese S1–S16 e sobreposições do diretor (2026-10-17)
Numerada D11 porque D10 já identifica "Header institucional e portal Acessar" (pacote Parcerias); a
instrução de registrar como D10 foi adaptada para não duplicar identificador.
- Decisão (síntese da especificação `docs/dmc/HOME_REDESIGN.md` §1.2, adotada pela equipe):
  S1 ritmo de fundo em blocos (escuro → papel → dividido → escuro → papel → vídeo → contato), vizinhas
  do mesmo bloco separadas por fio; S2 um canvas por seção animada, com gate de IntersectionObserver,
  `prefers-reduced-motion` e visibilidade da aba; S3 seção 03 = grade 3×2 dos seis eixos + `details`
  com os 21 links (≥ 44 px), sem busca nem cartões; S4 voz do cliente uma única vez (eyebrow dos painéis
  de 05), falas por eixo vão para `catalogo-cards.json`; S5 seção 04 = painel de papel com intro sticky,
  numeração em Hanken 14; S6 seção 05 = cinco painéis grandes, texto sobre véu ≥ 1024 e fora da imagem
  abaixo, loop WebM/MP4 ≤ 6 s/≤ 1 MB só ≥ 1024, sem reduce e sem `saveData`; S7 seção 06 com a fórmula
  literal da D9 (sem números), mapa SVG + canvas 2D sem `perspective`; S8 seção 07 sem imagem, um
  destaque real e "Em preparação" sem título fictício; S9 seção 08 = método em 4 etapas + programa real,
  `id="treinamentos"` mantido; S10 newsletter em papel, sucesso só com 2xx `{ok:true}`, erros por código
  HTTP; S11 WhatsApp flutuante visível desde o início, com `?text=` qualificado pelo eixo; S12 sem
  numeração de ato nos overlines; S13 fórmula completa de atribuição de atos uma vez (04.3), categoria
  pertinente nas demais seções; S14 ícones dos eixos como sprite `<symbol>` + `<use>`; S15 sem
  rinoceronte em vídeo na seção Sobre; S16 CSS da home construído em `home.css` e fundido em `styles.css`
  antes da publicação (executado: `home.css` removido, `styles.css?v=c7`).
- Sobreposições do diretor do projeto (prevalecem sobre a especificação): (a) seção 02 `#conheca`
  mantida exatamente como no HEAD b26a462 (tablist `.casa__tab`, rede neural `rede-neural.js?v=2`),
  logo a regra "um só canvas" passa a "dois canvas, ambos com gate" e a proibição de `role=tab` vale só
  para as seções novas; (b) cabeçalho/navbar, hero, formulário de contato e rodapé não redesenhados;
  `navbar.js` e `components.css` pertencem a outra sessão e não foram editados; rodapé "Área do aluno"
  → "DMC Business School", "Ad-tech" → "ADTECH", sem link "Parcerias" nesta rodada; (c) imagens das
  verticais = renders procedurais com movimento, nomes de arquivo da §4.
- Justificativa: resolve as contradições apontadas pelos três juízes entre as specs A/B/C
  (`julgamento-juiz-3.md`, `juiz-2-frontend.md`) com um só critério — consistência com o BRIEF, D7 e
  D9; o diretor manteve a seção Sobre por já estar aprovada (T6).
- Impacto: `index.html`, `styles.css`, `main.js`, `brasil.js` + `data/brasil-capitais.js`, 30 arquivos de
  mídia em `assets/{images,videos}/home/`, `POST /api/newsletter` + página de descadastro, suíte e2e
  reescrita (`home.spec.js` → `eixos.spec.js`, + `home-secoes`, `newsletter`, `newsletter-descadastro`).
  Resultado: 684/684 e2e, Lighthouse home 100/100/100/100 (LCP 1,65 s). `vercel.json`, `sitemap.xml`,
  `navbar.js`, `components.css`, `tokens.css` inalterados.
- Aprovação: equipe (dentro de D2/D4). Aprovação do CEO necessária para: commit/publicação desta rodada,
  política de privacidade sem `[CONFIRMAR]` (condição da newsletter) e as pendências listadas em
  `docs/dmc/home-redesign/RELATORIO-CEO.md` §5.
