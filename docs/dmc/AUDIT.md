# DMC PRIME — AUDITORIA (Fase A) — 2026-10-17

Consolida 12 relatórios (8 iniciais + extras: raiz do repositório, deploy Vercel/D5, schema/atos privativos, chromakey/regrade). Evidências em `docs/dmc/audit/2026-10-17/*/`; scripts em `docs/dmc/audit/tools/`. Produção está atrás do checkpoint `4b59d15`; base = `feat/dmc-prime`. Comparar prod × repo **por ETag (= md5)**, nunca por `Last-Modified` (varia por edge). Caminhos relativos a `complexodmc.com.br/`; `index.html` está em reescrita paralela (linhas deslocam). Estado em 17/10 à tarde: texto público já passou pela reescrita de conformidade (8e7f2f7, 24 arquivos) e `tokens.css` existe (0e20496, `DESIGN-SYSTEM.md`) — §4 marca só o que segue aberto; "reescrever" em §1 refere-se ao layout da direção C. Evidências de `audit/2026-10-17/` são locais (T4, fora do git).

## 1. Inventário

| Página | Status | Prod × repo |
|---|---|---|
| `index.html` | reescrever: hero, stats, órbita, Ad-tech, rodapé, form; + JSON-LD `Organization` | prod E6 = Tecnologia; 74 linhas diff |
| E1 `planejamento-sucessorio`, `holding-patrimonial`, `blindagem-patrimonial`, `pronto-patrimonio`, `sucessao-testamentaria` | reescrever (marquees, "garanta") | diff 67–143; prod sem selo E1/vídeo |
| E1 `planejamento-sucessorio-empresarial` | remover → 301 `planejamento-sucessorio` (clone órfão) | igual |
| E1 `por-que-urgente` | reorganizar: seção de `planejamento-sucessorio` | igual |
| E2 `planejamento-tributario`, `compliance-governanca` | reescrever (35%/60%, "representação fiscal") + `np-pillar-fiscal` | igual |
| E3 `consultoria-imobiliaria`, `juridico-imobiliario` | reescrever ("escritório", "advogados", -70%, tracker) | igual |
| E3 `juridico-vendas` | reorganizar: clone → diferenciar ou fundir | igual |
| E3 `registro-imobiliario`, `atos-notariais` | reescrever (98%/99%) | diff 81 |
| E4 `contabilidade` | reescrever: auditoria sob E4; escrituração = parceiro | diff 80 |
| E4 Auditoria | criar página ou retirar card (`index.html:933`) | — |
| E5 `recuperacao-ativos` | manter; JSON-LD `provider` → `Organization @id` + atribuir card :198 | **404 em prod** |
| E6 `solucoes/consultoria-trabalhista/*` (7) | manter; `defesa-empresarial` corrige meta/title/schema/corpo; FAQ | **404 em prod** |
| `tecnologia` | reorganizar: transversal; fora de sitemap/órbita | hero "TECNOLOGIA & INOVAÇÃO" |
| `treinamento-interesse` | thank-you; mailto → API; fora do sitemap | igual |
| `mouse`, `*.backup-*`, `_np_*`, `em-construcao` (+`BACKGROUND2.gif` 75 MB), stub `/index.html` | remover | 200 em prod |
| **Raiz do repo**: `/pages/{Sobre, Apresentação, Jurídico Vendas, Jurídico Imobiliário, Consultoria Imobiiliária}.html`, `/pages/Site_Produtos/shared.css` (órfão), `/assets/{RINO_logo, LOGO_RINOCERONTE}.png`, `rino-video-transparent.mp4` | **remover tudo** + 301 (`source` percent-encoded): Sobre → futura `pages/sobre.html` (reescrita total); Apresentação → `consultoria-imobiliaria`; 3 clones (425–497 linhas diff, mesmos `<title>`) → slugs aninhados; assets: o rewrite já serve a cópia aninhada | 200 em prod, iguais ao repo; fora de `inventario.json`, sem links internos |
| `plataforma-ead/*` (11) | manter (D5) | — |
| `robots.txt`, `sitemap.xml` | reescrever | **404 em prod** |

Estrutural: o filesystem vence o rewrite para **qualquer** path da raiz (`index.html`, `pages/`, `assets/`) — a home real vive em `/complexodmc.com.br/index.html`; `/pages/Sobre.html` 200 e `/complexodmc.com.br/pages/Sobre.html` 404; cópia aninhada em prod atrás do repo (`index.html`, `shared.css`). Rewrites `/solucoes/*` e redirects inativos. Públicos (18 falhas, `backend-vercel/exposicao-prod-v2.txt`): `server/.env`, **`.env.bak-atlas`** (URI Atlas com usuário:senha, cluster `siteadtech`, mesmo `JWT_SECRET`), `server/src`, `scripts`, `uploads`, `_np_diag.html`. Correção validada: `outputDirectory: "complexodmc.com.br"` (cenário D).

## 2. Matriz

| Elemento | DMC atual | Planning | Proposta DMC | Prio |
|---|---|---|---|---|
| Hero/vídeo | `rino-hero.mp4` 720p 3,7 MB, wireframe **verde** (97,5% dos cromáticos; poster idem); inteiro no mobile; badge em inglês | MP4 30 MB, sem poster, `contain` | Manter **condicionado ao regrade** (dourado × prata — CEO); só H.264; 9:16 480p ≤1,4 MB ou poster-only <768 px; `preload=metadata`; reduced-motion → poster | P1 |
| Sobreposição | Contraste 15,8:1; h1 contábil/advocacia | Gradiente + typewriter | Gradiente direcional + véu radial, AA medido, headline fixa | P1 |
| Menu | Hardcoded; raiz por pathname; toggle sem ARIA | Fixo 94→72 px | Barra translúcida, mega-menu 6 eixos, "Acessar" 2 destinos (D6), alvos ≥44 px, `data-root` | P1 |
| Hierarquia/respiro | 9.586 px; 58 cards, 86 chips, 177 gradientes | `padding 80`, H2 48/300 | Painel editorial: abas + banner por eixo, sem chips/aura; 3 breakpoints | P1 |
| Fotografia/imagens | Rino verde; low-poly (`rino-video-transparent.mp4` 993 KB, com AAC inútil) via chromakey JS em 6 páginas + mp4 cru em `por-que-urgente`; ABSTRACT1-3; favicon 2 MB | Stock + gradiente | Regrade ffmpeg (gold-mono ou lut3d `dmc-dourado.cube`) de hero e poster; transparente → VP9/HEVC **alpha nativo** (820 KB / 1,41 MB, gerados), fim do `getImageData`; WebP/AVIF | P1 |
| Seis eixos | `.np-axes/.np-flag/.np-card` + `--np-accent`; órbita com CONTAB./TECN. | 5 colunas line-art | Manter arquitetura; cards "para quem/quando/entrega"; órbita → rede neural 3D | P1 |
| Segmentação | 6 situações `.np-case` | Atuação × 9 setores | Matriz Eixo × Perfil | P2 |
| Transições | 23 keyframes, 34 `transition:all`, 163 `.reveal`; 2 laços rAF sem gate (chromakey; `tech-net-canvas`) | 3 keyframes | Reveal 0,6–0,8 s só transform/opacity; laços com `IntersectionObserver` + reduced-motion | P2 |
| Conversão | `mailto:` simulado (repo já tem `POST /api/contato`, b3e03b4; prod aguarda); "agora mesmo" 6× | RD Station | API com porte/eixo/perfil, honeypot, LGPD; CTA sem urgência | **P0** |
| Mobile | 13.089 px; vídeo 3,7 MB; chromakey ocupa 64–67% da main thread a CPU 4× (22–34% sem laço), roda fora da viewport | Alvos 17–30 px | Poster/vídeo leve <768 px; alpha nativo; alvos ≥44 px | P1 |
| Tipografia | 4 famílias (+Allura sem uso), 6 URLs | 1 woff2 | 1 texto + 1 display, preload, `--font-*` | P1 |
| Paleta | Ciano/verde neon (`#00e7fc` 36×, `#00ff4d` 31×); dourado 0 | Preto + verde | `tokens.css` (0e20496): ouro `#d6b069`, eixos em oklch L .74 (E4 cobre, E6 violeta) — falta consumo pelos 5 CSS; mídias regradeadas na mesma paleta | **P0** |
| Performance | Home 5,24 MB, Perf 75, LCP 4,58 s, TBT 0 (cego ao laço pós-load); CSS 47%; função serverless 126 MB | Load 1,5 s | Poster-only mobile, favicon ≤10 KB, FA → SVG, CSS minificado; `excludeFiles` → função 4,1 MB; métrica de scroll na regressão | P1 |
| SEO | robots/sitemap 404; 8 canônicas 404; titles duplicados (+3 clones da raiz); 2 H1; JSON-LD em 8/39, `provider` reservado/depreciado em E5 | — | Sitemap, canonical + 301s, 1 H1; `Organization`+`WebSite` `@id #organization`; `Service.provider` referencia o `@id` | P1 |
| Acessibilidade | 21/28 sem `<main>`; form sem labels; sem `aria-expanded` | Alvos pequenos | Template header/main/footer + skip-link; labels; ARIA | P1 |
| Conformidade | Pré-8e7f2f7: percentuais, "garanta", "gratuito", "advogados", "urgente" em ≥15 páginas; 149 frases de atos privativos (E5 58, E6 42) sem atribuição. Ainda abertos: schema E5/E6, `#eixo-5`, raiz com "escritório", "impérios", R$ 200MM | "garanta resultados" (não copiar) | Fechar §4 "abertos"; atribuição a advogados parceiros em schema e meta; D7 | **P0** |

## 3. Baseline

Lighthouse 13.5 mobile (local):

| Página | Perf | A11y | BP | SEO | LCP | TBT | Peso |
|---|---|---|---|---|---|---|---|
| home | 75 | 95 | 96 | 100 | 4,58 s | 0 | 5.277 KB |
| planejamento-sucessorio | 80 | 94 | 96 | 100 | 4,30 s | 102 ms | 4.443 KB |
| consultoria-imobiliaria | 59 | 92 | 96 | 100 | 4,56 s | 792 ms | 4.482 KB |
| ciclo-fechado | 91 | 100 | 100 | 100 | 2,81 s | 0 | 240 KB |

| Medição extra | Resultado |
|---|---|
| Chromakey (390×844, CPU 4×, 10 s scroll — `metricas-baseline/chromakey.json`) | main thread home 63,6% com laço / 68,2% canvas `display:none` / 21,8% sem; planejamento-sucessorio 67,1% / 63,4% / 33,9%; FPS 59–60; 5,0–5,5 ms/frame; CPU 6×: 82% / 95% |
| Regrade (`hero/regrade-stats.json`) | gold-mono (`hue=s=0,colorchannelmixer=rr=0.92:gg=0.74:bb=0.36`) 99,7% dourado, matte preservado; 720p H.264 3,48 MB; WebM 5,93 MB; 9:16 480p crf 32 1,38 MB (6 s: 805 KB); alpha VP9 820 KB, HEVC 1,41 MB; `hue=-140` reprovado |
| Raiz × aninhado (`raiz-repositorio/etag-prod-antes-deploy.json`) | 8 pares DIVERGE/SO-RAIZ (2 index, 5 pages, 1 css); 3 assets idênticos; 100 ocorrências de conformidade |
| `vercel build` 64.5.0 (`backend-vercel/resumo-cenarios.json`) | A HEAD: health 200, 21 arquivos `server/` no estático; B ignore `server/`: `ERR_MODULE_NOT_FOUND`; C restrito: 14 no estático; **D `outputDirectory`: 113 estáticos, 0 `server/`, health 200**; D2 `excludeFiles`: função 126 → 4,1 MB; engines 20.x: recusado |

Outros: overflow 0/28 viewports; 2 links quebrados (`logo.png`, `style.css`); `assets/images` 29 MB (24 órfãos), `videos` 86 MB; home 2 H1, 4 inputs sem label; headers de segurança só HSTS em prod (corrigidos no repo).

## 4. Violações (arquivo:linha → redação)

Corrigidos em 8e7f2f7 (verificado por grep no working tree): title/meta/OG da home, faixa de stats, "agora mesmo", "sem custo", rodapé; E3 "escritório de Direito Imobiliário", "advocacia especializada", "diagnóstico gratuito", "até 70%", "fé pública garantida", "únicas no mercado"; "Garanta…"/"garantindo"; "é urgente?"; marquees 98%/99%/Uptime; holding 40%; tributário R$500M+/35%; compliance 100%/60%; `cena-three.js` R$ 4,2M/+38%/72%; `defesa-empresarial:118`. **Abertos:**

| Onde | Atual | Sugerida |
|---|---|---|
| `index.html:696` (`#eixo-5`) | "retomada de bens… até a execução efetiva do que é seu" | "Localização de patrimônio e estratégia de recuperação; bloqueio e penhora por advogados parceiros" (como o bullet :704) |
| `index.html` (0 blocos JSON-LD) | — | `Organization`+`WebSite`, `@id https://www.complexodmc.com.br/#organization`, `description` "consultoria em negócios", `address`, `telephone`, `email`, `sameAs`, `areaServed` BR, `knowsAbout` 6 eixos. Nunca `LegalService` ("law firms"), `ProfessionalService` (depreciado) ou `LocalBusiness` |
| `index.html:815`; `contabilidade:221`; `planejamento-tributario:56` | "Execução assistida"; "Execução Assistida"; "Representação e defesa em processos administrativos fiscais" | "Implementação acompanhada"; "Suporte técnico à defesa administrativa, com representação por profissional habilitado" |
| `recuperacao-ativos:58-62` (JSON-LD) | `provider.@type "ProfessionalService"` (era `LegalService`; ambos reservados/depreciados); `serviceType` "…execução de títulos"; `description` "bloqueio e penhora de bens, execução de títulos judiciais" como serviço próprio | `provider {"@type":"Organization","@id":"…#organization"}`; `serviceType` "Consultoria em recuperação de ativos"; `description` "Diligência patrimonial, estratégia de recuperação do crédito e articulação de advogados parceiros para os atos privativos" |
| `recuperacao-ativos:198` | "Pedidos de penhora, bloqueio e indisponibilidade… acompanhados até a decisão do juízo" (único card sem atribuição; :185, :204, :685 já atribuem) | "…formulados por advogados parceiros e acompanhados pela DMC até a decisão"; opcional: parágrafo "Os atos processuais são privativos de advogado (Lei 8.906/94, art. 1º) e praticados por escritórios parceiros; a Complexo DMC conduz a inteligência patrimonial, a estratégia e o acompanhamento." |
| `defesa-empresarial:6,8,50-51` | meta "Defesa da empresa no litígio… recursos e execução"; title "Contencioso e Litígios Trabalhistas"; `serviceType` "Contencioso Trabalhista"; `Service.description` idem — sem atribuição (hero :83 e :286 já atribuem) | meta/description "Coordenação da defesa trabalhista da empresa: estratégia, prova, cálculo e gestão da carteira, com atuação processual por advogados parceiros"; title "Defesa Empresarial — Gestão do Contencioso Trabalhista"; `serviceType` "Consultoria em contencioso trabalhista"; `provider` → `@id #organization` |
| Nome "Defesa Empresarial" (`defesa-empresarial` ×8; `ciclo-fechado:56,217`; `camara-de-acordos`, `decisao-assistida`, `quitacao-anual`, `index.html` ×1) | nome afirma ato privativo | Manter só com a atribuição na página; alternativa "Gestão do Contencioso Trabalhista" |
| Raiz `pages/Sobre.html:6,8,949-959,1041,1076-1132` | "Arquitetos de Impérios Modernos"; "4 pilares… Contabilidade"; "negócios milionários" ×7; "R$ 200 milhões+"; placeholder "SALVE A FOTO EM…" | Retirar; reescrever como institucional dos 6 eixos, sem superlativos nem cifras |
| Raiz `Apresentação:1174,1259-1290,1781`; `Jurídico Imobiliário:289,339,979,1072,1123`; `Jurídico Vendas:107,113,980,1073,1124`; `Consultoria Imobiiliária:55,92,541-550` | "+180 construtoras", "+9 Bi VGV", "−70%", "escritório de Direito", "diagnóstico gratuito com advogados", "liquidez imediata", "é urgente?", "lucro projetado" | Remover + 301; trecho migrado passa pela reescrita de E3 |

Método: `tools/scan-conformidade.cjs` estendido (regra A `schema/tipo reservado`; regra B `ato privativo` com enquadramento entrega/explicativo e atribuição; ignora CSS/comentários; parseia JSON-LD) + `schema-rendered.cjs` (DOM). Saídas pré-8e7f2f7: `conformidade-schema/conformidade.json` (2 hits schema, 149 privativas, EAD 0), `raiz-repositorio/conformidade-raiz.json`; rerodar como gate D3.

## 5. Backlog

### Engenharia independente (pode começar já)

**P0**
- Hotfix T3: rotacionar `JWT_SECRET` **e senha Atlas** (`siteadtech`); apagar `server/.env.bak-atlas` (+hardlink) e `.vercel/output/`; `engines.node` → `24.x`; aplicar `backend-vercel/proposta/vercel.json` (`outputDirectory`, 308 `/complexodmc.com.br/:path*`, manter `headers`) + `vercelignore.txt`; **nunca** `.vercelignore` com `server/`; porta = `tools/vercel-build-check.sh` em checkout limpo; pós-deploy `tools/exposicao-prod.sh` — backend-engineer — `package.json:21`, `vercel.json`, `.vercelignore`.
- Publicar `POST /api/contato` (b3e03b4) e validar em prod — backend-engineer.
- Limpar raiz: `git rm pages/ assets/ index.html` + travas no `.vercelignore`; 301 percent-encoded (`/pages/Jur%C3%ADdico%20Vendas.html` → `/pages/juridico-vendas.html` etc.); teste `raiz-etag-prod.mjs antes/depois` + `raiz-etag-compare.mjs` (aprovado = 0 DIVERGE/SO-RAIZ) e regressão EAD na forma limpa `/plataforma-ead/*` — fullstack-architect — raiz, `vercel.json`.
- Tirar da pasta pública `_np_*`, `mouse`, `*.backup-*`, `em-construcao`, `BACKGROUND2.gif`, mp4 órfãos; robots/sitemap na raiz — fullstack-architect.
- JSON-LD `Organization`+`WebSite` na home; corrigir `provider` E5 e `Service` E6; gate D3 = scan estendido com 0 hits schema e 0 frases "entrega" sem atribuição — fullstack-architect + qa-performance — `index.html`, `recuperacao-ativos:53-74`, `defesa-empresarial:45-52`.

**P1**
- `functions.excludeFiles` (`proposta/vercel.excludeFiles.json`); depois `express.static` condicionado a `process.env.VERCEL !== '1'` — backend-engineer — `vercel.json`, `server/src/config.js`.
- Chromakey → `<video autoplay muted loop playsinline>` com `<source .mov codecs="hvc1">` + `<source .webm>` + poster alpha nas 6 páginas + `por-que-urgente:311`; interino: `IntersectionObserver`, reduced-motion, canvas 110×DPR; mesmo gate no `tech-net-canvas` — frontend-motion — `index.html:1775-1794`, `consultoria-imobiliaria:661`, `juridico-*:434`, `planejamento-sucessorio:244,1161-1303`, `styles.css:5069`.
- Finais de vídeo: `colorkey=0x000000:0.2:0.05` + regrade aprovado calibrado ao ouro `#d6b069` do `tokens.css` → VP9 `yuva420p` + HEVC alpha, sempre `-an`; hero 720p H.264 + 9:16 480p + poster com o mesmo filtro — video-3d-producer — `assets/videos/`, `hero-poster.jpg`.
- `navbar.js`: `data-root`; menu dos 6 eixos; `aria-expanded`; "Acessar" 2 destinos — fullstack-architect — `navbar.js`, `main.js:10-52`.
- Sitemap, canonical em todas, 301 `planejamento-sucessorio-empresarial`; checks de prod por ETag — qa-performance.
- Favicon ≤10 KB; `LOGO_RINOCERONTE` → `.webp` nas 21 páginas (PNG fica: EAD); corrigir `logo.png` (`index.html:1372`) — frontend-motion.
- Remover `tccl.min.js` (3 páginas); 6 iframes YouTube → `data-video` lazy — frontend-motion.
- Uploads → GridFS/Blob; bloquear `server/uploads` — backend-engineer — `routes/materiais.js:107`.
- Links: E5 → `recuperacao-ativos.html` (`index.html:489`); remover `#artigos`; vídeo antes do CTA — fullstack-architect.
- `chromakey-cpu.cjs` na suíte de regressão (limiar ≤35% a 4× sem hero visível) — qa-performance.

**P2**
- Login EAD consumir `?curso=` (`app.js:697`); rota dev só com `DEV_SIMULAR_PAGAMENTO` (`liberacoes.js:99`) — backend-engineer.
- `pages/politica-de-privacidade.html` — content-director.
- Minificar CSS; classes órfãs — qa-performance.

### Implementação criativa (direção C)

**P0**
- Fechar o que restou da reescrita (§4 "abertos"): E5 schema + card :198, E6 meta/title/schema, `#eixo-5`, "Execução assistida", raiz — content-director — `index.html`, `recuperacao-ativos.html`, `defesa-empresarial.html`.
- Consumo do `tokens.css` (0e20496) pelos 5 CSS de uma vez — creative-webdesigner + frontend-motion — `styles.css:1-45`, `shared.css:15`, `eixos.css:24-54`, `solucao.css`, `consultoria-imobiliaria.css`.
- Reposicionar Contabilidade (sob E4) e Tecnologia (transversal); órbita/Ad-tech saem; nome "Defesa Empresarial"; escopo de `pages/sobre.html` — strategy-marketing.

**P1**
- Regrade: CEO escolhe dourado (gold-mono) × prata (lut3d) pelas tiras `hero/*-comparacao.png`; cena procedural só se o look wireframe for rejeitado — video-3d-producer.
- Hero: headline aprovada, sem badge, overlay direcional, CTA único — creative-webdesigner — `index.html:62-85`.
- Mega-menu, barra translúcida — creative-webdesigner + frontend-motion.
- Painel editorial: manter abas/banners; cortar `.np-tag`, chips, `.np-aura`; cards "para quem/quando/entrega" — creative-webdesigner — `index.html:401-1055`, `main.js:715-801`.
- `components.css`; 3 breakpoints; só transform/opacity — frontend-motion — `pages/css/*`.
- `np-pillar-*` + `eixos.css` nas 5 páginas sem eixo — frontend-motion.
- Uma tipografia; Font Awesome → SVG inline — creative-webdesigner — 28 HTML.
- Rede neural 3D no lugar da órbita (`cena-three.js`/`rhino-wireframe.js` retintados) — frontend-motion + video-3d-producer.
- Template header/main/footer/skip-link, 1 H1, labels — frontend-motion.
- `pages/sobre.html` institucional — content-director + creative-webdesigner.

**P2**
- Matriz Eixo × Perfil; FAQ nas 7 trabalhistas; diferenciar `juridico-vendas` — content-director.
- Um vídeo por página (`data-video` vazio 24/24) — video-3d-producer.
- Ensaio fotográfico ou abstrações procedurais — creative-webdesigner.

## 6. Riscos

- **EAD (D5)**: depende de `../assets/images/{RINO_logo,LOGO_RINOCERONTE}.png` (11 HTML + `shell.js:56`, `app.js:1529`) e `/api/*`. `.vercelignore` com `server/` derruba a API embora o build "passe"; build local com `server/` no disco é falso positivo (nft lê do disco) — validar em checkout limpo. Mudança de assets exige regressão nas formas limpa e aninhada.
- **Rewrite vs filesystem**: vale para qualquer path da raiz. Trocar logo/vídeo sem apagar `assets/` da raiz produz site com duas marcas (26 pages + 11 EAD resolvem a URL limpa para a raiz). `outputDirectory` resolve, mas muda a URL da home hoje servida → 308 de `/complexodmc.com.br/*`.
- **navbar por pathname**: pasta nova quebra logo, links e EAD; resolver antes de criar páginas.
- **Segredos**: deploy via CLI sem trava reexpõe; `.env.bak-atlas` tem cópia hardlink fora do repo e no build antigo.
- **Reescrita textual** (≥20 páginas incl. raiz): redesign sem ela republica infrações; `index.html` em edição paralela — sincronizar antes.
- **Dois sistemas de tokens** + mídias verdes contra paleta dourada: `tokens.css` e regrade entram juntos ou o site fica bicolor.
- **Chromakey**: custo é bateria/térmica; HEVC alpha em Safari/iOS não testado em aparelho — poster PNG como fallback.
- **`consultoria-imobiliaria`** nunca atinge `networkidle` (tracker): E2E só após remover o script.
- **Metas irreais**: 9:16 <800 KB só com corte a 6 s; WebM do hero sai maior que o MP4.

## 7. Bloqueios

- Hotfix T3 só após `engines.node` 24.x, `vercel.json` com `outputDirectory`, `vercel-build-check.sh` APROVADO, rotação incluindo Atlas — e autorização do CEO.
- SMTP/e-mail do `/api/contato` (`RESEND_API_KEY`, `LEADS_EMAIL_TO/FROM`) — CEO.
- Variáveis da Vercel, allowlist Atlas, `DEV_SIMULAR_PAGAMENTO` em prod: não verificáveis daqui.
- CEO: headline final; regrade dourado × prata; números que sobrevivam (D7); nome "Defesa Empresarial"; conteúdo de Sobre; `tecnologia.html` transversal (D1).
- iPhone real para HEVC alpha; Blender/IA indisponíveis → ffmpeg + procedural.
