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

## Portal acadêmico (2026-10-18)

Portal do Aluno + Portal do Professor sobre a EAD existente. Fonte única: `docs/dmc/PORTAL-ACADEMICO.md` (índice;
prevalece, §0), `PORTAL-API.md` (rotas e dados) e `PORTAL-UX.md` (telas). Aqui fica só o registro; o detalhe está
na seção do índice citada. Numeração local `PA-n` (não colide com D/T de sessões paralelas nem com os D-nn do
índice §11).

### PA-1 — Decisões do CEO de 18/10/2026 (índice §2.1, §3.2)
- CEO-0: escopo = blueprint integral; matriz de cobertura com uma linha por item (§4); o que não fechar vira
  lacuna (§12) ou pendência (§13), nunca tela falsa.
- CEO-1 (E1): financeiro com lançamentos manuais da coordenação, auditados; gateway depois. Modelo pronto
  (`origem manual|gateway`, webhook previsto e não montado); sem "Meus cartões", cobrança/NFS-e automáticas nem botão falso.
- CEO-2: assistente de IA com Google Gemini; a coordenação cola a chave no painel (Configurações › Assistente). Chave
  só no servidor (`GEMINI_API_KEY` tem precedência; senão cifrada AES-256-GCM, HKDF de `JWT_SECRET`), nunca devolvida;
  ferramentas somente leitura do próprio aluno + RAG no regulamento; consentimento antes do 1º uso.
- CEO-3 (E2): Libras retirada; nenhum VLibras nem script de terceiro em página autenticada.
- CEO-4: nota mínima 7 (0–10) = melhor tentativa da avaliação modular publicada (prévia não conta); certificado passa
  a exigir aprovação (curso sem modular publicada: regra antiga de 100% das aulas); emitidos seguem válidos; nova
  tentativa e mudança de nota mínima auditadas.
- CEO-5: padrão visual DMC em toda a plataforma (`tokens.css` + `components.css` + `css/portal.css`). **Revoga a parte
  de D8 que mantinha o rinoceronte turquesa/limão (neon) na EAD**; o neon sai. Exceção temporária: `login-classico.html`
  (2d), com proposta de aposentá-la (D-44, §13).
- CEO-6 (E3): assinatura eletrônica simples nativa; provedor externo e vídeo Mux/Bunny só previstos no modelo.
- Aprovação: CEO ✔ (18/10/2026). Fase 0 autorizada pelo CEO no mesmo dia ("execute com máxima qualidade").

### PA-2 — Posse exclusiva de arquivos (índice §8.1, §8.2; D-33)
- Decisão: cada arquivo tem um único dono durante todo o trabalho, sem transferência entre fases; arquivo alheio só
  muda por pedido escrito ao dono via principal. Operações mecânicas da principal (`cabecalho-ead.mjs` no S2,
  `versionar-ead.mjs` e `PENDENTES_FASE_1` no G2) são scripts idempotentes com dry-run e não mudam a posse (D-33).
- Proibidos a todas as fatias: `server.js` (fora os três pontos da principal, PA-4), `db.js`, `config.js`,
  `login.html`, `login-classico.html`, `business-school.{css,js}`. Agentes não commitam; a principal commita por fatia,
  com caminhos explícitos. Justificativa: várias sessões no mesmo working tree; conferência por `conferir-posse.mjs`.

### PA-3 — Divisão em 19 fatias (índice §8.1; D-37, D-59, D-78)
- 1ª revisão (D-37): F0a → F0a + F0t; F0b → F0b + F0r; F3 → F3a + F3b; F6 → F6a + F6b. 2ª (D-59): F0a → F0a + F0m;
  F0b → F0b + F0s + F0p; F1 → F1a + F1b. 3ª (D-78): F4 → F4a (turmas, matrículas, liberações) + F4b (documentos,
  contratos). Nenhuma divisão muda contrato de rota; na API e na UX o nome antigo vale como o grupo (§0).

### PA-4 — Agregador em ponto único e três pontos de `server.js` (API §5.3, DC-30; D-42, D-70, D-82)
- Decisão: rotas novas (`/api/portal/*` e o `/api/auth/*` ampliado, 27 módulos) entram só por `montarPortal()` de
  `server/src/portal/montar.js` (F0m), com isolamento por módulo. Em `server.js`, só a principal e só três pontos:
  (1) `import { montarPortal, tratarErroGlobal } from './portal/montar.js';` (2) `app.use('/api', montarPortal())`;
  (3) `app.use(tratarErroGlobal)` no lugar do tratamento de erro anônimo. Prova: `servidor-erros.test.js` (principal).
- Plano B (D-70): sem liberação de `server.js` pela 2d, o portão se divide: G0-a abre a fase 1 com o agregador montado
  só nos testes; G0-b (três pontos + `servidor-erros` verde + `/api/portal/saude` 200 no `serve.mjs`) abre E2E e G1.

### PA-5 — CSP da plataforma (índice §9.6; D-43)
- Política estrita para `/plataforma-ead/*` no `vercel.json` (exceto `login.html` e `login-classico.html`):
  report-only desde o G0, aplicada no G2 com 0 violação. Nenhum `<script>` inline nem `on*=`; boots inline vão para
  `js/portal/boot-<pagina>.js`; o `serve.mjs` reproduz o cabeçalho (o servidor manual não).

### PA-6 — Ordem da fase 0 com pontos de sincronização (índice §8.3; D-60, D-64, D-74)
- F0a → F0m (a partir do P0a) ∥ F0b ∥ F0s ∥ F0r + principal. S0: regressão D5 e capturas "antes" (F0b), antes de
  editar qualquer arquivo existente; S1: `portal.css` fase A, `pre-pintura.js`, `ui.js` mínimo e `cabecalho-ead.mjs`;
  S2: a principal aplica o cabeçalho; S3: contratos JS publicados. Fases B/C do reskin e shell v2 só depois do S2.
- A fase 1 começa pelos mini-portões P1 "contrato puro" (D-64) e P1f "hospedeiros de tela" (F8 e F1b, D-74).

### PA-7 — Isolamento das verificações por fatia (índice §9.1, §8.6; D-62, D-73)
- Unidade com `QA_FATIA` (testes estáveis + os da fatia + `front-estatico`); E2E com `PORTAL_MODULOS` da fatia e das
  dependências, F0t pulada por `PORTAL_MODULOS_IGNORAR`, D5 só nos casos da fatia, tolerâncias fechadas de
  `monitorarConsoleERede` por `QA_INTEGRADAS` (lista em `PROGRESS.md`); cada G1 integrado num `git worktree` fora do
  repositório; G2 com `QA_ESTRITO=1`. Portas 4630–4659 por fase, bancos `complexodmc_portal_<fatia>_qa`;
  `complexodmc_local` e as portas 4611/4612/3000/8090/4671–4691 intocados.

### PA-8 — Divergências que alteram contrato (índice §11; prevalecem sobre API e UX até a propagação, §14 item 1)
- D-01: códigos de erro em kebab (`segundo-fator`, `email-indisponivel`, `troca-de-senha-obrigatoria`); aviso à 2d.
- D-02: valem os caminhos da API (`/api/portal/me/notificacoes/resumo`, `/api/portal/busca`, `/api/portal/admin/equipe`…).
- D-03: códigos `DMC/DEC/FRQ/AVL/CTR` e despacho único `GET /portal/validar/:codigo` (F3b), sem nome completo; o
  legado `/api/certificados/validar/:codigo` e `certificado.html` não mudam.
- D-08: backoffice em grupos ensino · secretaria · relacionamento · gestão; menu estático `DMC_Professor.MENU_ESTATICO`.
- D-10: pedido LGPD do titular = protocolo `privacidade` com `pedidoTitular`, prazo de 15 dias.
- D-11: `DMC_Avaliacao.resumo` sai; o player conta a seção 4 por `Conteudo.secoes`; `montar` recebe `avaliacaoId`.
- D-21: professor no editor legado edita só plano, materiais, categoria e rótulo do encontro; o resto em leitura.
- D-24: CPF nunca vai em CSV (`incluirCpf` não é implementado).
- D-34: acréscimos de `DMC_UI` (`alerta`, `barras`, `codigo`, `upload`, `fmt.*`), `DMC_Shell.definirPendencia`,
  `cabecalhos` em `DMC_Api` e `DMC_PlanoEnsino`.
- D-38: módulos novos `routes/portal-declaracoes.js` e `routes/portal-cursos.js` (F3b); agregador com 27 módulos.
- D-39: configuração do assistente em `routes/portal/ia.js` (F6b); `ia/rag.js` é da F6a; serviço `ia.disponivel()`.
- D-41: variáveis de QA (`PORTAL_MODULOS*`, URLs de provedores falsos) só com `QA_SERVIDOR=1`, sem `VERCEL_ENV`, fora de
  produção e em `http://127.0.0.1`.
- D-42: log por `resumirErro` (sem corpo, `keyValue` nem cabeçalhos); E11000 não previsto → 409 `registro-duplicado`;
  JSON inválido → 400 `formato-invalido`.
- D-44: proposta de aposentar `login-classico.html` (redirecionamento no `vercel.json` preservando `?next=`); enquanto
  existir, `DMC_bootLogin` aceita CPF, destino por papel e desvia o 2FA para `login.html?next=`.
- D-45: D5 = invariantes de efeito com `SELETORES_D5`; mudar asserção só por pedido escrito ao dono (F0b).
- D-52: DC-61…DC-68 da API registradas (plano de ensino estruturado, dissertativa com limites, correção em rascunho,
  nome no certificado, selo, critérios MEC/TCC, isolamento transacional por módulo).
- D-53: pedidos da API à UX valem até a propagação (gabarito com pontos e devolutiva, TCC em PDF ≤ 4 MB, bibliografia
  em dois campos, correção com `publicar:false`, tipo de módulo TCC).
- D-54: pedidos da UX à API (escalonamento com `?categoria=&cursoId=`, `ouvidoriaSemParecer`,
  `sistema.instituicaoPendente`, `motivo`, endereço em texto, 409 no 2º parecer, `textoSha256` opcional).
- D-55: textos v1 literais de consentimento de gênero e etnia em `consentimentos-textos.js` (F0t); revisão jurídica pendente.
- D-56: capa vertical do curso e capa do módulo como acréscimo da F1a (≤ 1 MB, só admin, imagem pública imutável),
  sem tocar em `capas.js`; recorte central, sem `capaFoco`.
- D-57: `DMC_UI.reautenticar` e `DMC_UI.consentimento` (F0b), CSS `pf-reautenticacao`/`pf-consentimento` (F0s).
- D-63: modo restrito (`precisaTrocarSenha`) conferido logo após `DMC_Auth.init()`; `DMC_init` resolve sem carregar
  nada; boots legados levam a `perfil.html#seguranca`.
- D-64: import entre fatias irmãs só depois do P1 "contrato puro" anunciado pela principal.
- D-65: moldura do backoffice (`pai`, `aba`, `ctx`) é da F8; subnavegação do Atendimento por `pf-subnav` com markup fixo (§7.10).
- D-66: roteador só em `professor.html`; `itensDoMenu(papel)` da F8; o shell só desenha o que recebe.
- D-71: pedir link e criar nova senha em `acesso-link.html#pedir-link`/`#esqueci` (F0p); da 2d só entrada por CPF,
  passo do 2FA, destino por papel e os dois links; aceite por `login-portal.spec.js`; até lá `PORTAL_2FA` desligado.
- D-73: `monitorarConsoleERede` com tolerâncias fechadas por fase; `POSSE` em `tests/tools/posse-ead.mjs` (F0r).
- D-74: mini-portão P1f; `paginasDoPortal()` = `PAGINAS_BASE` + `portal-<x>.paginas.js` de cada fatia.
- D-75: `DMC_Portal.iniciar` ganha a opção `itens`; o contrato do `DMC_Shell` não muda.
- D-76: na D5, efeitos com diálogo são conferidos pela API; `confirmarNaTela` + gancho `data-pf-acao`.
- D-78: F4a/F4b; serviços `secretaria.matriculaPorId`, `secretaria.vincularContrato` (único escritor de
  `matriculas.contratoId`) e `contratos.situacaoPorMatricula`.
- D-79: pedido da loja com os nomes da API: 409 `ja-liberado`, `reaproveitado` (+ `&existente=1`),
  `POST /portal/me/pedidos` (F5, 5/h), fila `?pedido=1`; `liberarAcesso` booleano.
- D-80: `notaMinima` no GET do certificado não emitido (F3b) e no `ResumoMatricula` (F3a).
- D-81: página `regulamento.html` (F6a) com âncora `r-<regulamentoId>-<trechoId>`; `fontes[].regulamentoId` (F6b).
- D-82: DC-69…DC-78 da API registradas; `tratarErroGlobal` em `erros.js` é o 3º ponto de `server.js`.
- Aprovação: equipe (arquiteto, dentro de D4). O que está em §13 do índice continua pendente do CEO.

### PA-9 — Sessão 2d encerrada sem commit; plano B em vigor (2026-10-18)
- Constatado: a sessão 2d encerrou às 01:12 sem commitar o próprio trabalho. Seguem fora do git no working tree:
  `login.html` (modificado), `login-classico.html`, `css/business-school.css`, `js/business-school.js`,
  `server/src/routes/{vitrine,bolsas}.js` e testes (novos), e acréscimos em `server.js`, `db.js` e `config.js`.
- Decisão: sem quem libere `server.js`, vale o plano B (D-70). A principal aplica os três pontos de PA-4 como
  acréscimo sobre o arquivo em disco, sem desfazer nem reescrever as linhas da 2d, e não commita trabalho alheio sem
  decisão do CEO. Impacto: um commit de `server.js` levaria junto as linhas da 2d, então ele também depende dessa decisão.
- Aprovação: CEO pendente (destino do trabalho não commitado da 2d e do commit de `server.js`). Também pendente do CEO,
  e bloqueante do G0-a (índice §8.3, "contrato da 2d entregue"): indicar quem responde pela 2d para receber o aviso da
  §5.5 (itens 1–10 e 7a) ou aceitar por escrito o plano B (D-70) e abrir a fase 1 sem o aviso. O lado do código foi
  conferido às 10:41 (`docs/dmc/qa/2026-10-18-g0a-r4-principal/`); a equipe não decide no lugar do CEO.
