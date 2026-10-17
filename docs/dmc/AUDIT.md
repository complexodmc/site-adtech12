# DMC PRIME — AUDITORIA (Fase A) — 2026-10-17

Consolida 8 relatórios. Evidências em `docs/dmc/audit/2026-10-17/{site-producao,referencia-planning,homepage,paginas-internas,sistema-visual,backend,metricas-baseline,ead}/`; scripts em `docs/dmc/audit/tools/`. Produção (last-modified 15 Oct) está atrás do checkpoint `4b59d15`; o repo `feat/dmc-prime` é a base. Caminhos abaixo são relativos a `complexodmc.com.br/` salvo indicação.

## 1. Inventário de páginas

| Página | Status | Produção × repo |
|---|---|---|
| `index.html` (home) | reescrever: hero, stats, órbita, Ad-tech, rodapé, form | prod: E6 = Tecnologia, 74 linhas de diff |
| E1 `pages/planejamento-sucessorio`, `holding-patrimonial`, `blindagem-patrimonial`, `pronto-patrimonio`, `sucessao-testamentaria` | reescrever (marquees, "garanta") | diff 67–143 linhas; prod sem selo E1 nem bloco vídeo |
| E1 `planejamento-sucessorio-empresarial` | remover → 301 para `planejamento-sucessorio` (órfã, clone, title duplicado) | igual |
| E1 `por-que-urgente` | reorganizar: vira seção de `planejamento-sucessorio` | igual |
| E2 `planejamento-tributario`, `compliance-governanca` | reescrever (35%/60%) + aplicar `np-pillar-fiscal` | igual |
| E3 `consultoria-imobiliaria`, `juridico-imobiliario` | reescrever ("escritório de Direito", "advogados", -70%, tracker) | igual |
| E3 `juridico-vendas` | reorganizar: clone de `juridico-imobiliario` → diferenciar ou fundir | igual |
| E3 `registro-imobiliario`, `atos-notariais` | reescrever (98%/99%) | diff 81 |
| E4 `contabilidade` | reescrever: auditoria/inteligência sob E4; escrituração = parceiro | diff 80 (+"R$2B+") |
| E4 Auditoria | criar página ou retirar card (`index.html:933` → `#contact`) | — |
| E5 `recuperacao-ativos` | manter; mover vídeo para antes do CTA | **404 em prod** |
| E6 `solucoes/consultoria-trabalhista/*` (7) | manter; completar FAQ | **404 em prod** (+2 redirects 404) |
| `pages/tecnologia` | reorganizar: capacidade transversal; sair de sitemap/órbita; sem `np-pillar` | hero "TECNOLOGIA & INOVAÇÃO" |
| `pages/treinamento-interesse` | reorganizar: thank-you; mailto → API; sair do sitemap | igual |
| `mouse.html`, `recuperacao-ativos.backup-*.html`, `_np_390/_np_diag/_np_test.html`, `em-construcao.html` (+`BACKGROUND2.gif` 75 MB), `/index.html` stub da raiz | remover da raiz pública | todos 200 em prod |
| `plataforma-ead/*` (11) | manter (D5); fora do escopo visual | — |
| `robots.txt`, `sitemap.xml` | reescrever | **404 em prod** |

Divergências estruturais: a home real em prod vive em `/complexodmc.com.br/index.html` porque o stub `/index.html` da raiz vence o rewrite `/`; rewrites `/solucoes/:vertical/:slug` e redirects do `vercel.json` inativos; `server/.env`, `server/src/*` e `server/uploads/*` servidos publicamente (200).

## 2. Matriz DMC × Planning × Proposta

| Elemento | DMC atual | Referência Planning | Proposta DMC | Prioridade |
|---|---|---|---|---|
| Hero/vídeo | `rino-hero.mp4` 1280x720, 3,7 MB, poster, `cover`; inteiro no mobile; badge em inglês | MP4 30 MB, sem poster, `contain`, mesmo arquivo no mobile | Manter ativo; MP4+WebM ≤4 MB, 9:16 <800 KB via `<source media>`, `preload=metadata`, reduced-motion → poster; headline aprovada | P1 |
| Sobreposição de texto | Contraste 15,8:1; h1 contábil/advocacia | Gradiente 4deg + typewriter | Gradiente direcional + véu radial, AA medido, headline fixa | P1 |
| Menu | Hardcoded (Produtos, Consultoria Imobiliária, Login→adtech); raiz por pathname; toggle sem ARIA | Fixo 94→72 px, submenu lista simples | Barra translúcida, mega-menu 6 eixos com frase de escopo, CTA único, botão ≥44 px, `data-root` | P1 |
| Hierarquia/respiro | 9.586 px; 58 cards, 86 chips, 177 gradientes | `padding 80px`, H2 48/300, container 1210 | Painel editorial: abas + banner por eixo, sem chips/pílulas/aura; 3 breakpoints | P1 |
| Fotografia/imagens | Rino 3D neon, ABSTRACT1-3, favicon PNG 2 MB | Stock sorridente + gradiente | Ensaio próprio ou abstrações procedurais; WebP/AVIF | P2 |
| Seis eixos | `.np-axes/.np-flag/.np-card` + `--np-accent` (preservar); órbita com CONTAB./TECN. | 5 colunas line-art + "saiba mais" | Manter arquitetura; cards "para quem / quando / entrega"; órbita → rede neural 3D com 6 eixos reais | P1 |
| Segmentação | Só 6 situações `.np-case` | Atuação × Verticais (9 setores) | Matriz Eixo × Perfil (empresário, incorporadora, família, rural, investidor) | P2 |
| Transições | 23 keyframes (box-shadow/color), 34 `transition:all`, 163 `.reveal` | 3 keyframes, fade 1,6 s | Reveal 0,6–0,8 s só transform/opacity, stagger ≤80 ms, reduced-motion | P2 |
| Conversão/formulários | `mailto:` + sucesso simulado; `href="#"`; "agora mesmo" 6× | RD Station com qualificação | `POST /api/contato` com porte/eixo/perfil, honeypot, LGPD; CTA sem urgência | **P0** |
| Mobile | 13.089 px; vídeo 3,7 MB; sem overflow | Sem overflow; alvos 17–30 px | Poster/vídeo leve <768 px; alvos ≥44 px | P1 |
| Tipografia | Inter+Poppins+Raleway+DM Sans (+Allura sem uso), 6 URLs | 1 família woff2 | 1 texto + 1 display, link único + preload, tokens `--font-*` | P1 |
| Paleta | Ciano/verde neon (`#00e7fc` 36×, `#00ff4d` 31×); dourado = 0 | Preto + verde | `tokens.css` preto/grafite/branco/dourado; `--np-accent` dessaturado por eixo | **P0** |
| Performance | Home 5,24 MB, Perf 75, LCP 4,58 s; CSS 47% usado; FA 1% | Load 1,5 s, vídeo 30 MB | Poster-only mobile, favicon ≤10 KB, FA → SVG, CSS minificado, sem tracker/YouTube eager | P1 |
| SEO | robots/sitemap 404; 8 canônicas → 404; title duplicado; 2 H1 | — | Sitemap regenerado, canonical em todas, 1 H1, title/meta de consultoria | P1 |
| Acessibilidade | A11y 92–100; 21/28 sem `<main>`; form sem labels; toggle sem `aria-expanded` | Alvos pequenos | Template header/main/footer + skip-link; labels; ARIA; contraste do divisor | P1 |
| Conformidade de texto | Percentuais, "garanta", "gratuito", "advogados", "urgente" em ≥15 páginas | "garanta resultados" (não copiar) | Reescrita por método; números só com fonte/aprovação CEO | **P0** |

## 3. Baseline medido (local, Lighthouse 13.5 mobile)

| Página | Perf | A11y | BP | SEO | LCP | TBT | Peso |
|---|---|---|---|---|---|---|---|
| home | 75 | 95 | 96 | 100 | 4,58 s | 0 | 5.277 KB |
| planejamento-sucessorio | 80 | 94 | 96 | 100 | 4,30 s | 102 ms | 4.443 KB |
| consultoria-imobiliaria | 59 | 92 | 96 | 100 | 4,56 s | 792 ms | 4.482 KB |
| ciclo-fechado | 91 | 100 | 100 | 100 | 2,81 s | 0 | 240 KB |

Outros: overflow horizontal 0/28 (320–1920 px); 2 links internos quebrados (`logo.png`, `style.css`); CSS usado 22–53%; Font Awesome 1%; `assets/images` 29 MB (24 órfãos), `assets/videos` 86 MB; home 2 H1, 4 inputs sem label; contraste H1 15,8:1; headers de segurança só HSTS; `server/.env` em prod → 200; formulário → 0 requisições no submit.

## 4. Violações de identidade/conformidade

| Arquivo:linha | Atual | Redação sugerida |
|---|---|---|
| `index.html:8-29` | "Escritório de Consultoria Empresarial" (title/meta/OG) | "Complexo DMC — Consultoria em Negócios" |
| `index.html:73-77` | "Consultoria empresarial, tributária e contábil" / "Defendemos seus direitos…" | "Inteligência para decisões que transformam negócios." / "Consultoria estratégica integrada para empresas, patrimônio e operações de alta complexidade." |
| `index.html:89-315` | "95% Satisfação", "98% Taxa de Sucesso", "R$ 80M+ Economia", "24/7" | Remover a faixa; dado só com fonte e aprovação do CEO |
| `index.html:409` | "Direito, contabilidade, tributário…" | "Patrimônio, tributário, imobiliário, auditoria, ativos e trabalhista sob a mesma governança" |
| `index.html:558,596,634,672,710,748` | "Fale agora mesmo com nossos especialistas" | "Converse com nossos especialistas" |
| `index.html:1041` | "30 minutos… sem custo e sem compromisso" | "conversa inicial de 30 minutos" |
| `index.html:1170-1352` | "+500% Produtividade", "100% Seguro", "seu escritório" | Chamada curta "Tecnologia aplicada à consultoria", sem números |
| `index.html:1642-1646,1680` | "Escritório especializado… Defendemos seus direitos"; "© 2024 Consultoria Empresarial" | "Complexo DMC — Consultoria em Negócios"; "© 2026 Complexo DMC" |
| `pages/juridico-imobiliario.html:941` | "é um escritório de Direito Imobiliário" | "é uma consultoria em negócios que articula advogados e cartórios conveniados" |
| `consultoria-imobiliaria:1219`, `juridico-imobiliario:1016`, `juridico-vendas:1017` | "diagnóstico gratuito com nossos advogados imobiliários" | "Agende um diagnóstico com nossos especialistas" |
| `consultoria-imobiliaria:6`, `juridico-imobiliario:6`, `juridico-vendas:6` | "advocacia especializada" / "validação de advogados" | "consultoria imobiliária com execução por parceiros habilitados" |
| `consultoria-imobiliaria:606,627` | "Reduzimos em até 70%", "fé pública garantida" | "Acompanhamos o registro de ponta a ponta"; "atos lavrados por cartórios parceiros" |
| `pages/contabilidade.html:6-7,32,310` | "Contabilidade Estratégica", "assessoria contábil completa" | "Auditoria e inteligência contábil"; escrituração atribuída ao parceiro (modelo: `quitacao-anual:143`) |
| `pages/holding-patrimonial.html:81,163` | "40% Economia Tributária Média"; "se paga rapidamente" | Remover; "estrutura avaliada caso a caso" |
| `pages/planejamento-tributario.html:6,74-75` | "maximize os lucros"; "R$500M+ / 35%" | "organize a carga fiscal dentro da lei"; remover marquee |
| `pages/compliance-governanca.html:74-75,85` | "100% Conformidade / 60%"; "até 60% nas penalidades" | Remover; "reduz a exposição a penalidades" |
| `sucessao-testamentaria:6,38,318`; `registro/pronto/atos:311`; `blindagem:27` | "Garanta…" / "garantindo" | "Estruture…", "Organize…", "com segurança jurídica avaliada" |
| `por-que-urgente:6,37`; `consultoria-imobiliaria:597`; `index.html:1662` | "é urgente?", "Agir agora garante" | "O que muda sem planejamento sucessório" |
| `juridico-imobiliario:177`, `juridico-vendas:177`; `por-que-urgente:1053` | "únicas no mercado"; "a ferramenta mais poderosa" | "Três camadas integradas"; "instrumento central" |
| `planejamento-sucessorio:131-157`; `blindagem:79`; `sucessao`, `registro`, `pronto`, `atos`, `tecnologia` (stats) | marquees 98%/99%/97%/"99.9% Uptime" | Remover; fatos verificáveis (ex.: sistemas conveniados, `recuperacao-ativos:228-236`) |
| `plataforma-ead/js/login/cena-three.js:699-769` | "R$ 4,2M", "+38%", "72% meta" | Rótulos neutros (nomes de módulos) |

## 5. Backlog priorizado

### Engenharia independente (pode começar já)

**P0 bloqueante**
- Rotacionar `JWT_SECRET` e senha Atlas; criar `.vercelignore` (server/, docs/, .env*, .vercel, node_modules); deploy só via git — backend-engineer — `server/.env`, `.vercelignore`, `vercel.json`.
- `POST /api/contato` (validação, honeypot, throttle + `trust proxy`, coleção `leads`, e-mail por env) + front com `fetch`, `required`, `#formMessage`, aviso LGPD — backend-engineer — `server/src/routes/contato.js` (novo), `server/src/server.js`, `server/src/db.js`, `assets/js/main.js:197-273`, `index.html:1590-1636`, `pages/treinamento-interesse.html:346`.
- Roteamento: remover stub `/index.html`, validar rewrites `/solucoes/*`, servir robots/sitemap na raiz, canonical único com 301 — fullstack-architect — `/index.html`, `vercel.json`, `robots.txt`, `sitemap.xml`.
- Tirar da raiz pública `_np_*.html`, `mouse.html`, `recuperacao-ativos.backup-*`, `em-construcao.html`, `BACKGROUND2.gif`, mp4 órfãos — fullstack-architect — `complexodmc.com.br/`, `assets/videos/`.

**P1 alto**
- Headers de segurança (nosniff, frame-ancestors, Referrer-Policy, Permissions-Policy, CSP report-only) — backend-engineer — `vercel.json`.
- `navbar.js`: raiz via `data-root`/caminho absoluto; menu gerado dos 6 eixos; `aria-expanded`; remover toggle duplicado — fullstack-architect — `assets/js/navbar.js`, `assets/js/main.js:10-52`.
- Sitemap regenerado (defesa-empresarial; sem thank-you/órfãs/tecnologia), canonical em todas `/pages`, 301 `planejamento-sucessorio-empresarial` → `planejamento-sucessorio` — qa-performance — `sitemap.xml`, `vercel.json`, `pages/*.html`.
- Favicon ≤10 KB; `LOGO_RINOCERONTE.png` → `.webp` nas 21 páginas (PNG fica no lugar: EAD depende); corrigir `logo.png` — frontend-motion — `pages/*.html:10`, `index.html:1372`.
- Remover `tccl.min.js` (3 páginas); 6 iframes YouTube → `data-video` lazy (nocookie) — frontend-motion — `consultoria-imobiliaria.html:1090,1476`, `juridico-*:877-878`, `planejamento-sucessorio.html:913`, `planejamento-sucessorio-empresarial:1029`, `por-que-urgente:1062`.
- Uploads de materiais → GridFS/Blob; bloquear estático `server/uploads` — backend-engineer — `server/src/routes/materiais.js:107`.
- Vídeo hero: 720p/480p MP4+WebM, 9:16 mobile, `preload=metadata` — video-3d-producer — `assets/videos/`, `index.html:62-85`.
- Links: E5 → `recuperacao-ativos.html` (`index.html:489`); remover `#artigos` + seção oculta; vídeo antes do CTA em contabilidade/recuperacao-ativos — fullstack-architect.

**P2 médio**
- Login EAD consumir `?curso=`; destino único do "Login" — backend-engineer / strategy-marketing — `plataforma-ead/js/app.js:697`, `navbar.js:34`.
- Não registrar rota dev quando `DEV_SIMULAR_PAGAMENTO=false` — backend-engineer — `server/src/routes/liberacoes.js:99`.
- Página de privacidade/LGPD — content-director — `pages/politica-de-privacidade.html`.
- Minificar CSS; remover classes órfãs — qa-performance — `assets/css/styles.css`, `pages/css/shared.css`.

### Implementação criativa (direção C)

**P0 bloqueante**
- Reescrita de conformidade/identidade de todo texto público (§4) antes de qualquer layout — content-director — `index.html`, `pages/*.html`, `cena-three.js:699-769`.
- `tokens.css` (preto/grafite/branco/dourado; `--np-accent` dessaturado por eixo; `--font-*`, `--radius-*`) consumido por `styles.css`, `shared.css`, `eixos.css`, `solucao.css`, `consultoria-imobiliaria.css` — creative-webdesigner + frontend-motion — `assets/css/tokens.css` (novo), `styles.css:1-45,5675-5681`, `shared.css:15`, `eixos.css:24-54`.
- Reposicionar Contabilidade (sob E4) e Tecnologia (transversal); órbita e Ad-tech saem ou viram chamada curta — strategy-marketing — `index.html:320-392,1170-1352`, `pages/contabilidade.html`, `pages/tecnologia.html`.

**P1 alto**
- Hero: headline aprovada, sem badge, overlay direcional, CTA único — creative-webdesigner — `index.html:62-85`.
- Mega-menu dos 6 eixos, barra translúcida, botão ≥44 px — creative-webdesigner + frontend-motion — `navbar.js`, `styles.css`.
- Painel editorial dos eixos: manter abas/banners; cortar `.np-tag`, chips, pílulas, `.np-aura`; cards "para quem/quando/entrega"; eixo inicial fixo (E1) — creative-webdesigner — `index.html:401-1055`, `main.js:715-801`.
- `components.css` (vídeo, navbar, footer, `np-btn`, `np-card`); `consultoria-imobiliaria.css` vira overrides; 3 breakpoints; animar só transform/opacity — frontend-motion — `pages/css/*`, `styles.css:6959`.
- `np-eixo np-pillar-*` + `eixos.css` nas 5 páginas sem eixo — frontend-motion — `compliance-governanca`, `planejamento-tributario`, `por-que-urgente`, `planejamento-sucessorio-empresarial`, `tecnologia`.
- Uma tipografia (texto + display), link único com preload; Font Awesome → 8 SVGs inline — creative-webdesigner — 28 HTML.
- Rede neural 3D discreta no lugar da órbita, reaproveitando `cena-three.js`/`rhino-wireframe.js` retintados — frontend-motion + video-3d-producer — `index.html:320-392,1708-1747`.
- Template base header/main/footer/skip-link, 1 H1, labels — frontend-motion — todas as páginas.

**P2 médio**
- Matriz Eixo × Perfil; FAQ nas 7 trabalhistas; esqueleto de 8 blocos; diferenciar `juridico-vendas` — content-director + creative-webdesigner.
- Um vídeo por página/eixo (`data-video` vazio em 24/24) — video-3d-producer.
- Ensaio fotográfico próprio ou abstrações procedurais — creative-webdesigner.

## 6. Riscos

- **EAD compartilhada (D5)**: depende de `assets/images/RINO_logo.png`, `LOGO_RINOCERONTE.png` e dos rewrites `/api/(.*)` e `/(.*)`. Não mover/renomear; mudança exige regressão na EAD. CSS/JS/navbar institucionais não são compartilhados.
- **navbar por pathname**: pasta nova (`/eixos/`, `/sobre/`) quebra logo, links e EAD; resolver antes de criar páginas.
- **Deploy via CLI** sem `.vercelignore` expôs `.env`; novo deploy sem correção reexpõe segredos.
- **Rewrite vs filesystem**: remover o stub muda a URL da home hoje servida; prever 301 de `/complexodmc.com.br/index.html`.
- **Reescrita textual** (≥15 páginas): redesign sem ela republica infrações.
- **Dois sistemas de tokens** (home × páginas): retintura parcial gera site bicolor; `tokens.css` entra nos 5 CSS de uma vez.
- **Chromakey por frame** na home: CPU em mobile; trocar por 3D traz Three.js (603 KB) ao institucional.
- **`consultoria-imobiliaria`** nunca atinge `networkidle` (tracker long-poll): E2E só após remover o script.

## 7. Bloqueios

- SMTP/e-mail para `/api/contato`: nenhuma variável em `.env`/`.env.example` — credencial do CEO.
- Variáveis da Vercel, allowlist do Atlas e `DEV_SIMULAR_PAGAMENTO` em prod: não verificáveis daqui.
- Aprovação do CEO: headline final; números institucionais que sobrevivam; destino do "Login" (EAD × Ad-tech); aposentadoria de `tecnologia.html` como pilar.
- Blender/vídeo por IA indisponíveis → hero e rede neural só procedurais (Three.js/Canvas) + ffmpeg.
