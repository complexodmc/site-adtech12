# DMC PRIME — AUDITORIA (Fase A) — 2026-10-17

Consolida 12 relatórios (8 iniciais + 4 rodadas extras: raiz do repositório, deploy Vercel/D5, schema/atos privativos, chromakey/regrade). Evidências em `docs/dmc/audit/2026-10-17/{site-producao,referencia-planning,homepage,paginas-internas,sistema-visual,backend,backend-vercel,metricas-baseline,ead,raiz-repositorio,conformidade-schema,hero}/`; scripts em `docs/dmc/audit/tools/`. Produção está atrás do checkpoint `4b59d15`; o repo `feat/dmc-prime` é a base. Comparar prod × repo **por ETag (= md5 do arquivo)**, nunca por `Last-Modified` (varia por edge). Caminhos relativos a `complexodmc.com.br/` salvo indicação; `index.html` está em reescrita paralela (linhas podem deslocar).

## 1. Inventário de páginas

| Página | Status | Produção × repo |
|---|---|---|
| `index.html` (home) | reescrever: hero, stats, órbita, Ad-tech, rodapé, form; inserir JSON-LD `Organization` | prod: E6 = Tecnologia, 74 linhas de diff |
| E1 `pages/planejamento-sucessorio`, `holding-patrimonial`, `blindagem-patrimonial`, `pronto-patrimonio`, `sucessao-testamentaria` | reescrever (marquees, "garanta") | diff 67–143; prod sem selo E1 nem bloco vídeo |
| E1 `planejamento-sucessorio-empresarial` | remover → 301 para `planejamento-sucessorio` (órfã, clone, title duplicado) | igual |
| E1 `por-que-urgente` | reorganizar: vira seção de `planejamento-sucessorio` | igual |
| E2 `planejamento-tributario`, `compliance-governanca` | reescrever (35%/60%, "representação… fiscal") + `np-pillar-fiscal` | igual |
| E3 `consultoria-imobiliaria`, `juridico-imobiliario` | reescrever ("escritório de Direito", "advogados", -70%, tracker) | igual |
| E3 `juridico-vendas` | reorganizar: clone de `juridico-imobiliario` → diferenciar ou fundir | igual |
| E3 `registro-imobiliario`, `atos-notariais` | reescrever (98%/99%) | diff 81 |
| E4 `contabilidade` | reescrever: auditoria/inteligência sob E4; escrituração = parceiro | diff 80 (+"R$2B+") |
| E4 Auditoria | criar página ou retirar card (`index.html:933` → `#contact`) | — |
| E5 `recuperacao-ativos` | manter; corrigir JSON-LD (`LegalService`) e atribuir atos privativos; vídeo antes do CTA | **404 em prod** |
| E6 `solucoes/consultoria-trabalhista/*` (7) | manter; `defesa-empresarial` corrige meta/title/schema/corpo; completar FAQ | **404 em prod** (+2 redirects 404) |
| `pages/tecnologia` | reorganizar: capacidade transversal; sair de sitemap/órbita; sem `np-pillar` | hero "TECNOLOGIA & INOVAÇÃO" |
| `pages/treinamento-interesse` | reorganizar: thank-you; mailto → API; sair do sitemap | igual |
| `mouse.html`, `recuperacao-ativos.backup-*.html`, `_np_390/_np_diag/_np_test.html`, `em-construcao.html` (+`BACKGROUND2.gif` 75 MB), `/index.html` stub da raiz | remover da raiz pública | todos 200 em prod |
| **Raiz do repo** (fora de `complexodmc.com.br/`): `/pages/Sobre.html`, `/pages/Apresentação.html`, `/pages/Jurídico Vendas.html`, `/pages/Jurídico Imobiliário.html`, `/pages/Consultoria Imobiiliária.html`, `/pages/Site_Produtos/shared.css` (órfão), `/assets/{images/RINO_logo.png, images/LOGO_RINOCERONTE.png, videos/rino-video-transparent.mp4}` | **Sobre**: retirar já (placeholder de dev visível, foto do CEO 404) e absorver como institucional da direção C (`pages/sobre.html`, reescrita total: 6 eixos, sem "impérios"/R$ 200MM) + 301. **Apresentação** (deck E3): remover + 301 → `consultoria-imobiliaria`. **3 clones** (425–497 linhas de diff, mesmos `<title>`): remover + 301 para os slugs aninhados (`source` percent-encoded). **css/assets**: remover — o rewrite já serve a cópia aninhada (provado com `hero-poster.jpg`); com `outputDirectory` deixam de subir | todos 200 em prod, iguais ao repo (ETag = md5); ausentes de `inventario.json`, sem links internos, fora do sitemap |
| `plataforma-ead/*` (11) | manter (D5); fora do escopo visual | — |
| `robots.txt`, `sitemap.xml` | reescrever | **404 em prod** |

Divergências estruturais: o filesystem vence o rewrite para **qualquer** path existente na raiz (`index.html`, `pages/`, `assets/`): a home real vive em `/complexodmc.com.br/index.html`; `/pages/Sobre.html` → 200 e `/complexodmc.com.br/pages/Sobre.html` → 404; a cópia aninhada em prod está atrás do repo (`index.html`, `pages/css/shared.css` com ETag ≠ md5). Rewrites `/solucoes/*` e redirects inativos. Públicos (18 falhas em `backend-vercel/exposicao-prod-v2.txt`): `server/.env`, **`server/.env.bak-atlas`** (URI Atlas com usuário:senha, cluster `siteadtech`, e o mesmo `JWT_SECRET`), `server/src/*`, `server/scripts/*`, `server/uploads/*`, `_np_diag.html`. Correção validada: `outputDirectory: "complexodmc.com.br"` (cenário D) — estático = pasta pública, sem stub nem rewrite `/(.*)`, função íntegra.

## 2. Matriz DMC × Planning × Proposta

| Elemento | DMC atual | Referência Planning | Proposta DMC | Prioridade |
|---|---|---|---|---|
| Hero/vídeo | `rino-hero.mp4` 1280×720, 3,7 MB, wireframe **verde** (97,5% dos pixels cromáticos; poster idem), `cover`; inteiro no mobile; badge em inglês | MP4 30 MB, sem poster, `contain`, mesmo arquivo no mobile | Manter ativo **condicionado ao regrade** (dourado gold-mono ou prata lut3d — CEO); só H.264 (WebM sai maior); 9:16 480×854 ≤1,4 MB ou poster-only <768 px; `preload=metadata`; reduced-motion → poster; headline aprovada | P1 |
| Sobreposição de texto | Contraste 15,8:1; h1 contábil/advocacia | Gradiente 4deg + typewriter | Gradiente direcional + véu radial, AA medido, headline fixa | P1 |
| Menu | Hardcoded (Produtos, Consultoria Imobiliária, Login→adtech); raiz por pathname; toggle sem ARIA | Fixo 94→72 px, submenu lista simples | Barra translúcida, mega-menu 6 eixos com frase de escopo, "Acessar" com 2 destinos (D6), botão ≥44 px, `data-root` | P1 |
| Hierarquia/respiro | 9.586 px; 58 cards, 86 chips, 177 gradientes | `padding 80px`, H2 48/300, container 1210 | Painel editorial: abas + banner por eixo, sem chips/pílulas/aura; 3 breakpoints | P1 |
| Fotografia/imagens | Rino neon verde; low-poly verde/ciano/dourado (`rino-video-transparent.mp4` 993 KB, AAC 317 kbps num vídeo `muted`) com chromakey JS em 6 páginas + mp4 cru (fundo preto) em `por-que-urgente`; ABSTRACT1-3; favicon 2 MB | Stock sorridente + gradiente | Regrade ffmpeg (`hue=s=0,colorchannelmixer=rr=0.92:gg=0.74:bb=0.36` ou `dmc-dourado.cube`) do hero e do poster; rino transparente → VP9/HEVC com **alpha nativo** (820 KB / 1,41 MB, já gerados), fim do `getImageData`; WebP/AVIF; abstrações procedurais ou ensaio próprio | P1 |
| Seis eixos | `.np-axes/.np-flag/.np-card` + `--np-accent` (preservar); órbita com CONTAB./TECN. | 5 colunas line-art + "saiba mais" | Manter arquitetura; cards "para quem / quando / entrega"; órbita → rede neural 3D com 6 eixos reais | P1 |
| Segmentação | Só 6 situações `.np-case` | Atuação × Verticais (9 setores) | Matriz Eixo × Perfil (empresário, incorporadora, família, rural, investidor) | P2 |
| Transições | 23 keyframes (box-shadow/color), 34 `transition:all`, 163 `.reveal`; 2 laços rAF sem gate (chromakey; `tech-net-canvas` ciano em `planejamento-sucessorio:1161-1303`) | 3 keyframes, fade 1,6 s | Reveal 0,6–0,8 s só transform/opacity, stagger ≤80 ms; todo laço com `IntersectionObserver` + `prefers-reduced-motion` | P2 |
| Conversão/formulários | `mailto:` + sucesso simulado (repo já tem `POST /api/contato`, b3e03b4; prod aguarda deploy); `href="#"`; "agora mesmo" 6× | RD Station com qualificação | API com porte/eixo/perfil, honeypot, LGPD; CTA sem urgência | **P0** |
| Mobile | 13.089 px; vídeo 3,7 MB; chromakey ocupa 64–67% da main thread a CPU 4× (22–34% sem o laço), roda fora da viewport e com canvas oculto | Sem overflow; alvos 17–30 px | Poster/vídeo leve <768 px; alpha nativo; alvos ≥44 px | P1 |
| Tipografia | Inter+Poppins+Raleway+DM Sans (+Allura sem uso), 6 URLs | 1 família woff2 | 1 texto + 1 display, link único + preload, tokens `--font-*` | P1 |
| Paleta | Ciano/verde neon (`#00e7fc` 36×, `#00ff4d` 31×); dourado = 0 | Preto + verde | `tokens.css` preto/grafite/branco/dourado; `--np-accent` dessaturado por eixo; mídias regradeadas na mesma paleta | **P0** |
| Performance | Home 5,24 MB, Perf 75, LCP 4,58 s, TBT 0 (cego ao laço pós-load); CSS 47% usado; FA 1%; função serverless 126 MB (118 MB = pasta pública traçada) | Load 1,5 s, vídeo 30 MB | Poster-only mobile, favicon ≤10 KB, FA → SVG, CSS minificado, sem tracker/YouTube eager; `excludeFiles` → função 4,1 MB; métrica de scroll na regressão | P1 |
| SEO | robots/sitemap 404; 8 canônicas → 404; title duplicado (+3 clones da raiz); 2 H1; JSON-LD em 8/39 páginas, 1 `LegalService` | — | Sitemap regenerado, canonical + 301s, 1 H1; `Organization` (+`WebSite`, `@id #organization`) na home; todo `Service.provider` referencia o `@id` | P1 |
| Acessibilidade | A11y 92–100; 21/28 sem `<main>`; form sem labels; toggle sem `aria-expanded` | Alvos pequenos | Template header/main/footer + skip-link; labels; ARIA; contraste do divisor | P1 |
| Conformidade de texto | Percentuais, "garanta", "gratuito", "advogados", "urgente" em ≥15 páginas; 149 frases com atos privativos (E5 58, E6 42) sem atribuição; raiz com "escritório", "impérios", R$ 200MM | "garanta resultados" (não copiar) | Reescrita por método + parágrafo de atribuição a advogados parceiros; D7: números só com comprovação | **P0** |

## 3. Baseline medido

Lighthouse 13.5 mobile, local:

| Página | Perf | A11y | BP | SEO | LCP | TBT | Peso |
|---|---|---|---|---|---|---|---|
| home | 75 | 95 | 96 | 100 | 4,58 s | 0 | 5.277 KB |
| planejamento-sucessorio | 80 | 94 | 96 | 100 | 4,30 s | 102 ms | 4.443 KB |
| consultoria-imobiliaria | 59 | 92 | 96 | 100 | 4,56 s | 792 ms | 4.482 KB |
| ciclo-fechado | 91 | 100 | 100 | 100 | 2,81 s | 0 | 240 KB |

| Medição (rodadas extras) | Resultado |
|---|---|
| Chromakey (Playwright, 390×844, CPU 4×, 10 s de scroll, `chromakey.json`) | main thread home 63,6% com laço / 68,2% canvas `display:none` / 21,8% sem laço; planejamento-sucessorio 67,1% / 63,4% / 33,9% (+1 long task 138 ms); FPS 59–60; 5,0–5,5 ms por frame (1,8–2,0 a 1×); CPU 6×: 82,2% / 94,9% |
| Regrade ffmpeg (`hero/regrade-stats.json`) | gold-mono: 99,7% dos cromáticos em dourado, preto <50 preservado (80,1% vs 75,6%); 720p H.264 crf 28 = 3,48 MB (3 s de encode); WebM VP9 5,93 MB; 9:16 540×960 2,90 MB, 480p crf 32 1,38 MB, corte 6 s 805 KB; alpha VP9 820 KB, HEVC 1,41 MB (154 NALs layer 1); `hue=-140` reprovado (magenta) |
| Raiz × aninhado (`raiz-repositorio/etag-prod-antes-deploy.json`) | 8 pares DIVERGE/SO-RAIZ (2 index, 5 pages, 1 css); 3 assets idênticos; 100 ocorrências de conformidade nas 5 páginas |
| `vercel build` 64.5.0 (`backend-vercel/resumo-cenarios.json`) | A HEAD: `/api/health` 200, 21 arquivos `server/` no estático; B `.vercelignore` com `server/`: build "ok" mas `ERR_MODULE_NOT_FOUND`; C restrito: 14 arquivos `server/` no estático; **D `outputDirectory`: 113 estáticos, 0 `server/`, 0 `.env*`, health 200**; D2 + `excludeFiles`: função 126 MB → 4,1 MB; `engines.node 20.x`: build recusado |
| Exposição prod (`tools/exposicao-prod.sh`) | 18 falhas: `.env`, `.env.bak-atlas` (628 B), `src/`, `scripts/`, `uploads/` (PDF 312 KB, capa 3,9 MB), `_np_diag` |

Outros: overflow horizontal 0/28 (320–1920 px); 2 links quebrados (`logo.png`, `style.css`); CSS usado 22–53%; `assets/images` 29 MB (24 órfãos), `assets/videos` 86 MB; home 2 H1, 4 inputs sem label; headers de segurança só HSTS em prod (corrigidos no repo); formulário → 0 requisições no submit em prod.

## 4. Violações de identidade/conformidade

| Arquivo:linha | Atual | Redação sugerida |
|---|---|---|
| `index.html:8-29` | "Escritório de Consultoria Empresarial" (title/meta/OG) | "Complexo DMC — Consultoria em Negócios" |
| `index.html:73-77` | "Consultoria empresarial, tributária e contábil" / "Defendemos seus direitos…" | "Inteligência para decisões que transformam negócios." / "Consultoria estratégica integrada para empresas, patrimônio e operações de alta complexidade." |
| `index.html:89-315` | "95% Satisfação", "98% Taxa de Sucesso", "R$ 80M+ Economia", "24/7" | Remover a faixa (D7) |
| `index.html:409` | "Direito, contabilidade, tributário…" | "Patrimônio, tributário, imobiliário, auditoria, ativos e trabalhista sob a mesma governança" |
| `index.html:558…748` (6×) | "Fale agora mesmo com nossos especialistas" | "Converse com nossos especialistas" |
| `index.html:696` (`#eixo-5`) | "retomada de bens… até a execução efetiva do que é seu" | "Localização de patrimônio e estratégia de recuperação; bloqueio e penhora por advogados parceiros" (alinhar ao bullet :704 já corrigido) |
| `index.html:1041` | "30 minutos… sem custo e sem compromisso" | "conversa inicial de 30 minutos" |
| `index.html:1170-1352` | "+500% Produtividade", "100% Seguro", "seu escritório" | Chamada curta "Tecnologia aplicada à consultoria", sem números |
| `index.html:1642-1646,1680` | "Escritório especializado… Defendemos seus direitos"; "© 2024 Consultoria Empresarial" | "Complexo DMC — Consultoria em Negócios"; "© 2026 Complexo DMC" |
| `index.html` (sem JSON-LD) | — | `Organization` + `WebSite`, `@id https://www.complexodmc.com.br/#organization`, `description` "consultoria em negócios", `address` (:1675), `telephone`, `email`, `sameAs` Instagram, `areaServed` BR, `knowsAbout` seis eixos. Nunca `LegalService` ("law firms"), `ProfessionalService` (depreciado) nem `LocalBusiness` |
| `pages/juridico-imobiliario.html:941` | "é um escritório de Direito Imobiliário" | "é uma consultoria em negócios que articula advogados e cartórios conveniados" |
| `consultoria-imobiliaria:1219`, `juridico-imobiliario:1016`, `juridico-vendas:1017` | "diagnóstico gratuito com nossos advogados imobiliários" | "Agende um diagnóstico com nossos especialistas" |
| `consultoria-imobiliaria:6`, `juridico-imobiliario:6`, `juridico-vendas:6` | "advocacia especializada" / "validação de advogados" | "consultoria imobiliária com execução por parceiros habilitados" |
| `consultoria-imobiliaria:606,627` | "Reduzimos em até 70%", "fé pública garantida" | "Acompanhamos o registro de ponta a ponta"; "atos lavrados por cartórios parceiros" |
| `pages/contabilidade.html:6-7,32,221,310` | "Contabilidade Estratégica", "assessoria contábil completa", "Execução Assistida" | "Auditoria e inteligência contábil"; escrituração atribuída ao parceiro (modelo: `quitacao-anual:143`); "Implementação acompanhada" |
| `pages/holding-patrimonial.html:81,163` | "40% Economia Tributária Média"; "se paga rapidamente" | Remover; "estrutura avaliada caso a caso" |
| `pages/planejamento-tributario.html:6,56,74-75` | "maximize os lucros"; "Representação e defesa em processos administrativos fiscais"; "R$500M+ / 35%" | "organize a carga fiscal dentro da lei"; "Suporte técnico à defesa administrativa, com representação por profissional habilitado"; remover marquee |
| `pages/compliance-governanca.html:74-75,85` | "100% Conformidade / 60%"; "até 60% nas penalidades" | Remover; "reduz a exposição a penalidades" |
| `sucessao-testamentaria:6,38,318`; `registro/pronto/atos:311`; `blindagem:27` | "Garanta…" / "garantindo" | "Estruture…", "Organize…", "com segurança jurídica avaliada" |
| `por-que-urgente:6,37`; `consultoria-imobiliaria:597`; `index.html:1662` | "é urgente?", "Agir agora garante" | "O que muda sem planejamento sucessório" |
| `juridico-imobiliario:177`, `juridico-vendas:177`; `por-que-urgente:1053` | "únicas no mercado"; "a ferramenta mais poderosa" | "Três camadas integradas"; "instrumento central" |
| `planejamento-sucessorio:131-157`; `blindagem:79`; `sucessao`, `registro`, `pronto`, `atos`, `tecnologia` (stats) | marquees 98%/99%/97%/"99.9% Uptime" | Remover (D7); fatos verificáveis |
| `plataforma-ead/js/login/cena-three.js:699-769` | "R$ 4,2M", "+38%", "72% meta" | Rótulos neutros (nomes de módulos) |
| `pages/recuperacao-ativos.html:62` (JSON-LD) | `provider.@type = "LegalService"`; `serviceType` "Recuperação de ativos e execução de títulos" | `provider` → `{"@type":"Organization","@id":"…#organization"}`; `serviceType` "Consultoria em recuperação de ativos"; `description` "Diligência patrimonial, estratégia de recuperação do crédito e articulação de advogados parceiros para os atos privativos (bloqueio, penhora, execução)" |
| `recuperacao-ativos:197-222, 685-693` | "Pedidos de penhora, bloqueio… até a decisão do juízo"; "Condução da fase de execução"; "Execução de Títulos" — 58 frases privativas, 9 em tom de entrega, `advogad`=0 | Parágrafo antes dos cards: "Os atos processuais são privativos de advogado (Lei 8.906/94, art. 1º) e praticados por escritórios parceiros; a Complexo DMC conduz a inteligência patrimonial, a estratégia e o acompanhamento." Cards com "formulados/conduzidos por advogados parceiros". FAQ (:76-128) mantida como informação legal com fonte |
| `solucoes/consultoria-trabalhista/defesa-empresarial.html:6,8,51,83,118,132-164` | meta "Defesa da empresa no litígio…"; title "Contencioso e Litígios Trabalhistas"; hero "A empresa defendida em todo litígio"; contestação, audiência, recursos, embargos como entrega (42 frases, 22 sem atribuição); :118 deprecia escritórios | meta "Coordenação da defesa trabalhista da empresa: estratégia, prova, cálculo e gestão da carteira, com atuação processual por advogados parceiros"; `serviceType` "Consultoria em contencioso trabalhista"; seção "Como a defesa da empresa é coordenada" com cada ato atribuído ao advogado parceiro; :118 sem "um escritório para a audiência, outro para o recurso" |
| Nome "Defesa Empresarial" (`defesa-empresarial:8,34`; `ciclo-fechado:44`; `camara-de-acordos:245`; `decisao-assistida:241`; `quitacao-anual:268`) | nome afirma ato privativo | Manter só com o parágrafo de atribuição; alternativa "Gestão do Contencioso Trabalhista" (estratégia decide) |
| Raiz `pages/Sobre.html:6,8,949,954,1041,1095`, `:959,1076,1101,1132` | "Arquitetos de Impérios Modernos"; "4 pilares: Direito, Tecnologia, Administração e Contabilidade"; "negócios milionários" ×7; "R$ 200 milhões+"; "USP — a mais prestigiada"; placeholder "SALVE A FOTO EM ASSETS/…" | Retirar da raiz; reescrever como institucional dos 6 eixos, sem superlativos nem cifras; foto real |
| Raiz `pages/Apresentação.html:1174,1259-1290,1781`; `Jurídico Imobiliário.html:289,339,979,1072,1123`; `Jurídico Vendas.html:107,113,980,1073,1124`; `Consultoria Imobiiliária.html:55,92,541-550` | "+180 construtoras", "+9 Bi VGV", "−70%", "15+ anos", "escritório de Direito Imobiliário", "diagnóstico gratuito com nossos advogados", "únicas no mercado", "fé pública garantida", "liquidez imediata", "é urgente?", "lucro projetado", "Caixa em Prazo Recorde" | Remover + 301; qualquer trecho migrado passa pela reescrita de E3 (sem "escritório", "advogados", "gratuito", urgência, garantia ou resultado financeiro) |

Método: `tools/scan-conformidade.cjs` (versão estendida: regra A `schema/tipo reservado`, regra B `ato privativo` com enquadramento entrega/explicativo e flag de atribuição; ignora CSS/comentários, parseia JSON-LD) + `schema-rendered.cjs` (DOM via Chromium). Resultado nas 28 páginas + 11 EAD + 5 da raiz: `conformidade-schema/conformidade.json` (2 hits schema, 149 frases privativas, EAD 0) e `raiz-repositorio/conformidade-raiz.json`.

## 5. Backlog priorizado

### Engenharia independente (pode começar já)

**P0 bloqueante**
- Hotfix T3: rotacionar `JWT_SECRET` **e a senha Atlas** (`siteadtech`); apagar `server/.env.bak-atlas` (+ hardlink fora do repo) e `.vercel/output/`; `engines.node` → `"24.x"`; aplicar `backend-vercel/proposta/vercel.json` (`outputDirectory`, redirect 308 `/complexodmc.com.br/:path*` → `/:path*`, manter `headers`) + `vercelignore.txt`; **não** usar `.vercelignore` com `server/` (derruba `/api/*`, D5); porta de deploy = `tools/vercel-build-check.sh` em checkout limpo; pós-deploy `tools/exposicao-prod.sh` — backend-engineer — `package.json:21`, `vercel.json`, `.vercelignore`, `server/.env.bak-atlas`.
- `POST /api/contato` (feito no repo, b3e03b4): publicar e validar em prod — backend-engineer — `server/src/routes/contato.js`, `assets/js/main.js`, `index.html`, `pages/treinamento-interesse.html`.
- Limpar a raiz do repo: `git rm` de `pages/`, `assets/`, `index.html` da raiz + `pages`, `assets`, `index.html` no `.vercelignore`; redirects 301 percent-encoded (`/pages/Jur%C3%ADdico%20Vendas.html` → `/pages/juridico-vendas.html` etc., `Sobre` → futura `pages/sobre.html`, `Apresentação` → `consultoria-imobiliaria`); teste `raiz-etag-prod.mjs antes/depois` + `raiz-etag-compare.mjs` (aprovado = 0 DIVERGE/SO-RAIZ) e regressão EAD na forma limpa `/plataforma-ead/*.html` — fullstack-architect — raiz, `vercel.json`.
- Tirar da raiz pública `_np_*.html`, `mouse.html`, `recuperacao-ativos.backup-*`, `em-construcao.html`, `BACKGROUND2.gif`, mp4 órfãos; servir robots/sitemap na raiz — fullstack-architect — `complexodmc.com.br/`, `assets/videos/`.
- JSON-LD `Organization`+`WebSite` na home; corrigir `provider` de E5 e `Service` de `defesa-empresarial`; gate pré-publicação: scan estendido com 0 hits `schema/tipo reservado` e 0 frases "entrega" sem atribuição em E5/E6 (D3) — fullstack-architect + qa-performance — `index.html`, `recuperacao-ativos.html:53-74`, `defesa-empresarial.html:45-52`.

**P1 alto**
- `functions.excludeFiles` (`proposta/vercel.excludeFiles.json`): função 126 → 4,1 MB; depois condicionar `express.static`/`staticRoot` a `process.env.VERCEL !== '1'` — backend-engineer — `vercel.json`, `server/src/config.js`, `server.js`.
- Chromakey: trocar mp4+canvas por `<video autoplay muted loop playsinline>` com `<source .mov codecs="hvc1">` + `<source .webm>` e poster PNG alpha nas 6 páginas + `por-que-urgente:311`; enquanto isso, `IntersectionObserver`, `prefers-reduced-motion` e canvas a 110×DPR px; mesmo gate no `tech-net-canvas` — frontend-motion — `index.html:1775-1794`, `consultoria-imobiliaria:661,1437`, `juridico-*:434-437,1220-1240`, `planejamento-sucessorio:244,1161-1303`, `planejamento-sucessorio-empresarial:312`, `styles.css:5069`.
- Produzir os finais: `colorkey=0x000000:0.2:0.05` + regrade aprovado → VP9 `yuva420p` + HEVC alpha (`hevc_videotoolbox`), sempre `-an`; hero regradeado 720p H.264 + 9:16 480p + poster com o mesmo filtro; testar HEVC alpha em iPhone real — video-3d-producer — `assets/videos/`, `assets/images/hero-poster.jpg`.
- `navbar.js`: raiz via `data-root`; menu dos 6 eixos; `aria-expanded`; "Acessar" com 2 destinos (D6) — fullstack-architect — `assets/js/navbar.js`, `main.js:10-52`.
- Sitemap regenerado, canonical em todas, 301 `planejamento-sucessorio-empresarial`; padronizar checks de prod por ETag — qa-performance — `sitemap.xml`, `vercel.json`, `pages/*.html`.
- Favicon ≤10 KB; `LOGO_RINOCERONTE.png` → `.webp` nas 21 páginas (PNG fica: EAD depende); corrigir `logo.png` — frontend-motion — `pages/*.html:10`, `index.html:1372`.
- Remover `tccl.min.js` (3 páginas); 6 iframes YouTube → `data-video` lazy — frontend-motion.
- Uploads → GridFS/Blob; bloquear estático `server/uploads` — backend-engineer — `server/src/routes/materiais.js:107`.
- Links: E5 → `recuperacao-ativos.html` (`index.html:489`); remover `#artigos`; vídeo antes do CTA em contabilidade/recuperacao-ativos — fullstack-architect.
- Regressão de runtime: `chromakey-cpu.cjs` na suíte com limiar (≤35% de main thread a 4× sem hero visível) — qa-performance.

**P2 médio**
- Login EAD consumir `?curso=` — backend-engineer — `plataforma-ead/js/app.js:697`.
- Não registrar rota dev quando `DEV_SIMULAR_PAGAMENTO=false` — backend-engineer — `server/src/routes/liberacoes.js:99`.
- Página de privacidade/LGPD — content-director — `pages/politica-de-privacidade.html`.
- Minificar CSS; remover classes órfãs — qa-performance.

### Implementação criativa (direção C)

**P0 bloqueante**
- Reescrita de conformidade/identidade de todo texto público (§4), incluindo atribuição dos atos privativos em E5/E6 e `#eixo-5` da home — content-director — `index.html`, `pages/*.html`, `solucoes/**`, `cena-three.js:699-769`.
- `tokens.css` (preto/grafite/branco/dourado; `--np-accent` dessaturado; `--font-*`, `--radius-*`) consumido pelos 5 CSS de uma vez — creative-webdesigner + frontend-motion — `assets/css/tokens.css`, `styles.css:1-45,5675-5681`, `shared.css:15`, `eixos.css:24-54`.
- Reposicionar Contabilidade (sob E4) e Tecnologia (transversal); órbita e Ad-tech saem ou viram chamada curta; decidir nome "Defesa Empresarial"; escopo de `pages/sobre.html` — strategy-marketing — `index.html`, `pages/contabilidade.html`, `pages/tecnologia.html`.

**P1 alto**
- Regrade do rino: CEO escolhe dourado (gold-mono) × prata/grafite (lut3d) com as tiras `hero/*-comparacao.png`; cena procedural só se o look wireframe for rejeitado — video-3d-producer.
- Hero: headline aprovada, sem badge, overlay direcional, CTA único — creative-webdesigner — `index.html:62-85`.
- Mega-menu dos 6 eixos, barra translúcida, botão ≥44 px — creative-webdesigner + frontend-motion.
- Painel editorial dos eixos: manter abas/banners; cortar `.np-tag`, chips, pílulas, `.np-aura`; cards "para quem/quando/entrega"; eixo inicial fixo — creative-webdesigner — `index.html:401-1055`, `main.js:715-801`.
- `components.css` (vídeo, navbar, footer, `np-btn`, `np-card`); 3 breakpoints; animar só transform/opacity — frontend-motion — `pages/css/*`, `styles.css:6959`.
- `np-eixo np-pillar-*` + `eixos.css` nas 5 páginas sem eixo — frontend-motion.
- Uma tipografia (texto + display), link único com preload; Font Awesome → SVGs inline — creative-webdesigner — 28 HTML.
- Rede neural 3D discreta no lugar da órbita, reaproveitando `cena-three.js`/`rhino-wireframe.js` retintados pelos tokens — frontend-motion + video-3d-producer.
- Template base header/main/footer/skip-link, 1 H1, labels — frontend-motion — todas as páginas.
- `pages/sobre.html` institucional (substitui `Sobre.html` da raiz) — content-director + creative-webdesigner.

**P2 médio**
- Matriz Eixo × Perfil; FAQ nas 7 trabalhistas; diferenciar `juridico-vendas` — content-director + creative-webdesigner.
- Um vídeo por página/eixo (`data-video` vazio em 24/24) — video-3d-producer.
- Ensaio fotográfico próprio ou abstrações procedurais — creative-webdesigner.

## 6. Riscos

- **EAD compartilhada (D5)**: depende de `../assets/images/RINO_logo.png`, `LOGO_RINOCERONTE.png` (relativos, 11 HTML + `shell.js:56`, `app.js:1529`) e de `/api/*`. `.vercelignore` com `server/` derruba a API embora o build "passe"; build local com `server/` no disco é falso positivo (nft lê do disco) — validar só em checkout limpo. Mudança de assets exige regressão nas formas limpa e aninhada.
- **Rewrite vs filesystem**: vale para qualquer path da raiz, não só o stub. Trocar logo/vídeo na direção C sem apagar `assets/` da raiz produz site com duas marcas (26 pages + 11 EAD resolvem a URL limpa para a raiz). `outputDirectory` elimina o problema, mas muda a URL da home hoje servida → redirect 308 de `/complexodmc.com.br/*`.
- **navbar por pathname**: pasta nova (`/eixos/`, `/sobre/`) quebra logo, links e EAD; resolver antes de criar páginas.
- **Segredos**: deploy via CLI sem a trava reexpõe; `.env.bak-atlas` tem cópia hardlink fora do repo e no build antigo.
- **Reescrita textual** (≥20 páginas incl. raiz): redesign sem ela republica infrações; `index.html` em edição paralela — sincronizar antes de reescrever.
- **Dois sistemas de tokens** (home × páginas): retintura parcial gera site bicolor; mídias verdes contra paleta dourada idem — `tokens.css` e regrade entram juntos.
- **Chromakey**: custo é bateria/térmica (sem jank medido); HEVC alpha em Safari/iOS não testado em aparelho; WebM alpha não roda em Safari antigo — poster PNG como fallback.
- **`consultoria-imobiliaria`** nunca atinge `networkidle` (tracker): E2E só após remover o script.
- **Metas irreais**: 9:16 <800 KB só com corte a 6 s; "MP4+WebM" para o hero não se justifica.

## 7. Bloqueios

- Hotfix T3 só após: `engines.node` 24.x, `vercel.json` com `outputDirectory`, `vercel-build-check.sh` APROVADO, rotação com a senha Atlas — e autorização do CEO.
- SMTP/e-mail para `/api/contato` (`RESEND_API_KEY`, `LEADS_EMAIL_TO/FROM`) — CEO.
- Variáveis da Vercel, allowlist do Atlas, `DEV_SIMULAR_PAGAMENTO` em prod: não verificáveis daqui.
- Aprovação do CEO: headline final; regrade dourado × prata; números institucionais que sobrevivam (D7); nome "Defesa Empresarial"; conteúdo da página Sobre; aposentadoria de `tecnologia.html` como pilar (D1).
- iPhone real para validar HEVC alpha; Blender/vídeo por IA indisponíveis → ffmpeg + procedural.
