# DMC PRIME — BRIEFING CENTRAL

Leia este arquivo antes de qualquer tarefa. Ele é o contexto mínimo compartilhado.
Decisões em `DECISIONS.md`; estado em `PROGRESS.md`.

## Quem é o cliente

**Complexo DMC** — empresa de **consultoria em negócios**, São Paulo. Não é escritório de
contabilidade nem se apresenta como escritório de advocacia. Entrega inteligência
estratégica para decisões complexas envolvendo empresas, patrimônio e negócios.

CEO: Daniel Mathias Chagas. Aprova posicionamento, identidade visual e impacto comercial.

## Os seis eixos (preservar, elevar)

| Eixo | Nome | slug CSS (`np-pillar-*`) | Páginas hoje |
|---|---|---|---|
| E1 | Planejamento Patrimonial e Sucessório | `patrimonial` | pages/planejamento-sucessorio, holding-patrimonial, blindagem-patrimonial, pronto-patrimonio, sucessao-testamentaria, planejamento-sucessorio-empresarial |
| E2 | Tributário, Fiscal e Corporativo | `fiscal` | pages/planejamento-tributario, compliance-governanca |
| E3 | Direito Notarial e Imobiliário | `imobiliario` | pages/consultoria-imobiliaria, juridico-imobiliario, registro-imobiliario, atos-notariais, juridico-vendas |
| E4 | Auditoria Empresarial e Contábil | `auditoria` | pages/contabilidade (+ card "auditoria" aponta para #contact) |
| E5 | Recuperação de Ativos | `ativos` | pages/recuperacao-ativos |
| E6 | **Consultoria Trabalhista** | `trabalhista` (violeta) | solucoes/consultoria-trabalhista/{ciclo-fechado, quitacao-anual, blindagem-contratual, conformidade-psicossocial, decisao-assistida, camara-de-acordos, defesa-empresarial} |

Tecnologia (`pages/tecnologia.html`) e Contabilidade são **capacidades transversais /
soluções específicas**, não eixos nem identidade principal. Resíduos de "E6 = Tecnologia"
devem ser auditados e reorganizados, nunca apagados sem avaliação.

## Público prioritário

Empresários, incorporadoras, construtoras, grupos econômicos, famílias empresárias de alto
patrimônio, investidores, produtores rurais, gestores. Tom: autoridade institucional,
solidez técnica, discrição, visão de longo prazo. Sem cara de site contábil, escritório
genérico ou startup futurista.

## Direção criativa aprovada: C — Híbrido Executivo

Sofisticação institucional + vídeo cinematográfico no hero + 3D/rede neural discreta +
layout editorial com respiro + mobile de primeira. Referência de qualidade (nunca de
cópia): https://planning.com.br/. Paleta a partir da marca real: preto, grafite, branco,
dourado, detalhes tecnológicos discretos.

Headline proposta (sujeita a ajuste): "Inteligência para decisões que transformam negócios."
Sub: "Consultoria estratégica integrada para empresas, patrimônio e operações de alta
complexidade." CTA: "Converse com nossos especialistas".

## Stack e arquitetura (não mudar sem justificativa)

- Site **estático puro**: HTML + CSS + JS vanilla, **sem build, sem framework, sem lint**.
  Raiz pública: `complexodmc.com.br/`. Deploy Vercel (`vercel.json` reescreve `/(.*)` →
  `/complexodmc.com.br/$1`; `/solucoes/:vertical/:slug` → `.html`).
- Catálogo dos eixos **hardcoded** em `complexodmc.com.br/index.html`: abas `.np-axes`,
  banners `.np-flag#eixo-1..6`, cards `.np-card`. Acento por eixo via `--np-accent`
  (`assets/css/styles.css` `.np-pillar-*`; páginas internas via `pages/css/eixos.css` +
  `<body class="np-eixo np-pillar-X">`).
- CSS: `assets/css/styles.css` (7.1k linhas, home), `pages/css/shared.css` (2k),
  `pages/css/consultoria-imobiliaria.css` (2k), `pages/css/eixos.css`, `pages/css/solucao.css`.
  O bloco `.page-video__*` está **triplicado** (shared, consultoria-imobiliaria, styles) —
  mexeu em um, mexa nos três e suba o `?v=`.
- JS: `assets/js/main.js` (home; `sortearDestaque` sorteia o destaque do eixo — `data-np-spot="fixo"`
  fixa), `navbar.js` (calcula profundidade pelo pathname — página fora de `/pages/` precisa
  ser prevista), `solucao.js` (malha do herói), `video.js` (bloco de vídeo lazy do YouTube).
- `.reveal` é `opacity:0` até o JS — não usar em conteúdo crítico.
- **Toda página termina com** `<section class="page-section" id="video">` +
  `.page-video__frame[data-video]` antes do `.cta-section`.
- Plataforma EAD: `complexodmc.com.br/plataforma-ead/` + API Express/MongoDB em `server/`
  (`api/[...path].js` reexporta para Vercel). **Mantida por decisão do CEO (D5)**: fora do escopo visual do redesign; não remover nem quebrar.
- Formulário de contato da home: `form#contactForm action="mailto:..."` — **CTA falsamente
  funcional**; precisa de backend real.
- Mídias existentes: `assets/videos/` (rino-hero.mp4, rino-video-transparent.mp4, etc.),
  `assets/images/` (logo rinoceronte, hero-poster.jpg, ABSTRACT1-3, FUNDO-SITE).

## Conformidade (obrigatório em todo texto público)

Provimento 205/2021 CFOAB + diferenciação consultoria × atividades reservadas. Proibido:
promessa de resultado, percentual de êxito, economia garantida, honorários, ranking,
depoimento com resultado, urgência artificial. Dados de mercado só com fonte atribuída.
Depoimentos/cases/estatísticas só com comprovação ou aprovação do CEO.

## Ferramental disponível

Node 24; Chrome (headless e via extensão); ffmpeg; Playwright + Lighthouse instalados como
devDependencies (`npx playwright test`, `npx lighthouse`). Servidor local do site:
`python3 -m http.server 8080` na raiz → `http://127.0.0.1:8080/complexodmc.com.br/`.
Blender/geradores de vídeo por IA: **não disponíveis** — cenas procedurais (Three.js/Canvas)
e ffmpeg são o caminho.

## Git

Branch de trabalho: `feat/dmc-prime` (a partir de `main`). Checkpoint pré-redesign:
commit `4b59d15`. Nunca publicar em produção sem os critérios de `DECISIONS.md` §3.

## Protocolo de economia

Leia só o necessário; `grep` antes de `cat`. Retorne ≤300 palavras + caminhos + evidências.
Teste = aprovado / falhou / bloqueado. Sem relatórios longos. Decisões → `DECISIONS.md`;
progresso → `PROGRESS.md`.
