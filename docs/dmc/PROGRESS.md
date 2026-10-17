# DMC PRIME — PROGRESSO

Após compactação de contexto: retome daqui. Não refaça auditoria concluída.

| Etapa | Status | Evidência |
|---|---|---|
| 1 Descoberta | ✅ concluída 2026-10-17 | BRIEF.md |
| 2 Auditoria DMC × Planning | ✅ consolidada 2026-10-17 (12 relatórios: 8 iniciais + extras raiz do repositório, deploy Vercel/D5, schema/atos privativos, chromakey/regrade) | docs/dmc/AUDIT.md (inventário, matriz, baseline, violações, backlog, riscos, bloqueios); evidências em docs/dmc/audit/2026-10-17/{site-producao,…,raiz-repositorio,backend-vercel,conformidade-schema,hero}/ |
| 3 Estratégia / direção | ✅ aprovada (opção C) | DECISIONS.md D2 |
| 4 Engenharia paralela | ✅ 1ª rodada | b3e03b4 (contato+headers), 8e7f2f7 (conformidade), 0e20496 (tokens) |
| 5 Implementação criativa | 🔄 home + painel dos eixos; EIXOS-COPY; privacidade; FAQ trabalhista | |
| 6 Mídias e 3D | 🔄 filme do hero (procedural) + rede neural da home | |
| 7 QA | ⏳ | docs/dmc/QA.md (a gerar) |
| 8 Entrega / publicação | ⏳ | DECISIONS.md D3 |

## Testes (aprovado / falhou / bloqueado)

| Teste | Resultado | Observação |
|---|---|---|
| Lighthouse mobile (baseline, 4 páginas) | aprovado (medido) | home 75/95/96/100, LCP 4,58 s; consultoria-imobiliaria Perf 59; ciclo-fechado 91 — `metricas-baseline/lighthouse-summary.json` |
| Playwright viewports 320–1920 (overflow) | aprovado | 0/28 combinações com overflow horizontal — `metricas-baseline/viewports.json` |
| Playwright crawl prod × local | aprovado (executado) | inventário e diffs em `site-producao/inventario.json` |
| Links internos (43 HTML) | falhou (logo da home corrigido em 8e7f2f7) | `index.html:1372` logo.png 404; `em-construcao.html:12` style.css 404 |
| Canônicas em produção | falhou | 8 páginas (recuperacao-ativos + 7 trabalhistas) → 404 em prod |
| Formulário de contato (submit) | aprovado (local) | `POST /api/contato` 201/400/200-isca/413/429; Playwright nos 2 forms; `npm test` 23/23 — commit b3e03b4. Prod: aguarda deploy |
| Exposição de segredos em prod | falhou (corrigido no repo, aguarda rotação + deploy — T3) | `GET /server/.env` → 200 (808 B); `server/src/*` e `server/uploads/*` públicos |
| Headers de segurança | corrigido no repo | `vercel.json` headers (CSP em report-only); aguarda deploy |
| Roteamento Vercel (rewrites/redirects) | falhou | stub `/index.html` vence rewrite `/`; `/solucoes/*`, robots e sitemap → 404 |
| Acessibilidade rápida | falhou | home 2 H1 e 4 inputs sem label; 21/28 páginas sem `<main>`; toggle sem aria-expanded |
| Console sem erros | falhou | logo.png 404 na home (7/7 larguras); embed YouTube abortado em 3 páginas |
| Conformidade de texto (scan) | aprovado | varredura do texto visível: restam só fundamentos legais (ITCMD 8%, CPC art. 523) e "seguro garantia" — commit 8e7f2f7 |
| Conformidade — raiz do repo (5 páginas fora de `complexodmc.com.br/`) | falhou | 100 ocorrências ("escritório de Direito", "impérios", "milionários", R$ 200MM, +180 construtoras, placeholder de dev visível, foto do CEO 404), todas 200 em prod — `raiz-repositorio/conformidade-raiz.json`, `prod-raiz-paginas.json` |
| Scan estendido: JSON-LD e atos privativos (E5/E6) | falhou | 1 `provider.@type = LegalService` (`recuperacao-ativos.html:62`; após 8e7f2f7 virou `ProfessionalService`, depreciado — alvo é `Organization @id`); 149 frases com atos privativos (E5 58, E6 `defesa-empresarial` 42) sem atribuição a advogado; JSON-LD ausente em 31/39 páginas (home incluída); EAD 0 — `conformidade-schema/conformidade.json`, `jsonld-renderizado.json`; gate D3 = 0 hits schema + 0 frases "entrega" sem atribuição |
| Raiz do repo servida em prod (ETag = md5) | falhou | 10 arquivos da raiz 200 em prod e iguais ao repo; 8 pares DIVERGE/SO-RAIZ (2 index, 5 pages, 1 css); `/pages/Sobre.html` 200 vs cópia aninhada 404 — `raiz-repositorio/etag-prod-antes-deploy.json`; pós-deploy: `tools/raiz-etag-prod.mjs` + `raiz-etag-compare.mjs` (aprovado = 0 pares) |
| Chromakey — main thread em mobile (Playwright, CPU 4×, 10 s scroll) | falhou (medido) | home 63,6% com laço vs 21,8% sem; `display:none` no canvas não reduz (68,2%); planejamento-sucessorio 67,1% vs 33,9% (+ laço `tech-net-canvas`); 5,0–5,5 ms/frame; FPS 59–60 (risco é bateria/térmica, não jank) — `metricas-baseline/chromakey.json`, `tools/chromakey-cpu.cjs` |
| Regrade do rino por ffmpeg (gold-mono / lut3d) | aprovado (viável) | vídeo é verde (97,5%), não ciano; gold-mono 99,7% dourado com matte intacto, 720p H.264 3,48 MB; alpha nativo VP9 820 KB + HEVC 1,41 MB gerados; 9:16 <800 KB só com corte a 6 s — `hero/regrade-stats.json`, `hue-distribuicao.json`. Escolha dourado × prata: CEO |
| HEVC alpha em Safari/iOS | bloqueado | sem aparelho real; WebM alpha + poster PNG como fallback |
| MongoDB local (ping) | aprovado | 122 ms, 9 coleções |
| networkidle em consultoria-imobiliaria | bloqueado | tracker GoDaddy mantém long-poll (timeout 45 s) |
| Envio de e-mail (SMTP) | bloqueado | nenhuma variável SMTP/Resend em `.env`/`.env.example` |
| Variáveis Vercel / allowlist Atlas | bloqueado | não verificáveis localmente |
| Exposição `server/.env.bak-atlas` em prod | falhou | `GET /server/.env.bak-atlas` → 200 (628 B), fora do probe anterior; localmente traz URI Atlas com usuário:senha (cluster `siteadtech`) e o mesmo `JWT_SECRET` de `server/.env`. Probe novo: `tools/exposicao-prod.sh` → 18 falhas — `backend-vercel/exposicao-prod-v2.txt` |
| `.vercelignore` com `server/` (P0 do AUDIT §5) | falhou | `vercel build` termina "ok", mas a função fica sem `server/src` → `ERR_MODULE_NOT_FOUND` ao importar `api/[...path].js` (derruba `/api/*`, viola D5). Build local com os arquivos ainda no disco dá falso positivo — `backend-vercel/cenario-B-ignore-server/`, `func-runtime-check.txt` |
| `.vercelignore` restrito (mantém `server/src`) | falhou | função íntegra (`/api/health` 200), mas o estático ainda publica `server/src/**` + `server/package.json` (14 arquivos) só escondidos pelo 307 — `backend-vercel/cenario-C-ignore-restrito/static-files.txt` |
| `outputDirectory: "complexodmc.com.br"` em `vercel.json` | aprovado | estático = pasta pública (113 arquivos; 0 `server/`, 0 `.env*`; `robots.txt`, `sitemap.xml`, `/solucoes/*` e `plataforma-ead/` na raiz; sem stub); função contém `server/src/server.js` e responde `/api/health` 200; `tools/vercel-build-check.sh` → APROVADO — `backend-vercel/cenario-D-outputDirectory/`, proposta em `backend-vercel/proposta/` |
| `vercel build` com `engines.node = "20.x"` (HEAD) | falhou | CLI 64.5.0 recusa: `BUILD_UTILS_NODE_VERSION_DISCONTINUED`; projeto na Vercel já em 24.x — `backend-vercel/engines-node-20-falha.txt` |

## Bloqueios
- Geração de vídeo por IA / Blender: indisponíveis → cenas procedurais + ffmpeg.
- E-mail de aviso de lead: precisa de `RESEND_API_KEY`, `LEADS_EMAIL_TO`, `LEADS_EMAIL_FROM` (domínio verificado) — CEO. Sem isso o lead é gravado no banco, sem aviso.
- Política de privacidade: rascunho em `pages/politica-de-privacidade.html` (sitemap + rodapés de `pages/` e das 7 trabalhistas); **não publicar** com os `[CONFIRMAR]` (itens 6–9 abaixo). O rótulo de consentimento da home (`index.html`, `#cf-consentimento`) ainda não linka a página — home/frontend (o de `treinamento-interesse` já linka).
- Variáveis de ambiente da Vercel, allowlist do Atlas e `DEV_SIMULAR_PAGAMENTO` em prod: não verificáveis daqui.
- Hotfix T3 bloqueado até: `package.json` `engines.node` → `24.x`; `vercel.json` com `outputDirectory` (não usar `.vercelignore` com `server/`); `tools/vercel-build-check.sh` imprimir APROVADO; rotação incluir a credencial Atlas de `server/.env.bak-atlas`.
- Aprovações do CEO pendentes: headline final (proposta em uso); regrade do rino dourado (gold-mono) × prata/grafite (lut3d) — tiras em `audit/2026-10-17/hero/*-comparacao.png`; nome "Defesa Empresarial" (alternativa "Gestão do Contencioso Trabalhista"); conteúdo da futura `pages/sobre.html` (substitui `Sobre.html` da raiz). Login → D6; números → D7; tecnologia.html → D1 (transversal).
- iPhone real para validar HEVC alpha antes de trocar o chromakey.

## Pendências de conteúdo para o CEO (conformidade, commit 8e7f2f7)
1. Nome do parceiro contábil e do auditor habilitado (CRC) — citar a Bear Finance como em `quitacao-anual`?
2. Parcerias para usucapião/pareceres e atendimento fora de SP — confirmar antes de publicar.
3. Elaboração de contratos e pareceres é atividade privativa da advocacia: definir como o site apresenta a execução (sociedade de advogados parceira/conveniada).
4. Fatos jurídicos a revisar por profissional habilitado: prazo de registro (FAQ de registro-imobiliario; "30 dias" removido) e inventário extrajudicial frente à Res. CNJ 571/2024.
5. Gráfico 100/110/120% de recuperacao-ativos: é ilustração do art. 523 do CPC (não é resultado) — recomendação: manter.

## Pendências de conteúdo — rodada 2026-10-17 (content-director)
Feito: `docs/dmc/EIXOS-COPY.md` (conteúdo-mestre E1–E6 para painel, mega-menu e páginas
internas); `pages/politica-de-privacidade.html` (LGPD, padrão das páginas de serviço, sem
herói de malha) + `sitemap.xml`; FAQ (5–6 perguntas, componente `.faq-item` + acordeão inline
+ JSON-LD `FAQPage`, padrão de `recuperacao-ativos`) nas 7 páginas trabalhistas, antes do
bloco de vídeo; link "Política de Privacidade" nos rodapés (17 de `pages/` deixam de apontar
para `#`; 7 trabalhistas ganham o link). `ciclo-fechado`: "Cuidamos de todo o jurídico
trabalhista" → "Coordenamos toda a frente trabalhista". QA local (Playwright 320/390/1440): 0
overflow, acordeão abre, nenhuma resposta cortada, 0 erro de console.
**Exceção ao bloco de vídeo:** `pages/politica-de-privacidade.html` (página legal), além de
`mouse.html` e `treinamento-interesse.html`.

6. Privacidade — razão social, CNPJ e nome/canal do encarregado (art. 41).
7. Privacidade — prazo de retenção dos leads (sugestão: 24 meses do último contato) e data de
   vigência.
8. Privacidade — região do cluster Atlas e da função Vercel (transferência internacional,
   art. 33); política própria da Área do aluno (EAD).
9. Script GoDaddy (`img1.wsimg.com/tccl.min.js`) em `consultoria-imobiliaria`,
   `juridico-imobiliario` e `juridico-vendas`: remover (frontend) e apagar o parágrafo de
   exceção da política. Único rastreador do site; sem analytics/pixel.
10. **Incidente T3 × LGPD:** credenciais do Atlas expostas em prod (leads e alunos) podem
    exigir comunicação à ANPD e aos titulares (art. 48; Res. CD/ANPD 15/2024, 3 dias úteis) —
    avaliar com o jurídico.
11. EIXOS-COPY — `[CONFIRMAR]` por eixo (holding rural; IBS/CBS; IA de minutas; cartórios
    conveniados; ARTHEU; página de Auditoria Empresarial) e divergências listadas no fim do
    arquivo: "mensalidade dedicada" em `consultoria-imobiliaria`; nome "Blindagem"; slugs
    `por-que-urgente` e `contabilidade`; Lei 13.140/2015 × art. 42, par. único (mediação
    trabalhista) em `camara-de-acordos`; backup `recuperacao-ativos.backup-2026-08-26.html`
    na pasta pública.
12. Trabalhista — "Parecer jurídico em 24–48 h" (`decisao-assistida`) sem atribuição a advogado
    (ver item 3).
