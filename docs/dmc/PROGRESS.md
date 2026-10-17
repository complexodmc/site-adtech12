# DMC PRIME — PROGRESSO

Após compactação de contexto: retome daqui. Não refaça auditoria concluída.

| Etapa | Status | Evidência |
|---|---|---|
| 1 Descoberta | ✅ concluída 2026-10-17 | BRIEF.md |
| 2 Auditoria DMC × Planning | ✅ concluída 2026-10-17 | docs/dmc/AUDIT.md; evidências em docs/dmc/audit/2026-10-17/ |
| 3 Estratégia / direção | ✅ aprovada (opção C) | DECISIONS.md D2 |
| 4 Engenharia paralela | 🔄 em andamento | backend (API contato + headers), conteúdo (conformidade), design system |
| 5 Implementação criativa | ⏳ | |
| 6 Mídias e 3D | ⏳ | |
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
- Página de política de privacidade inexistente (link do consentimento LGPD) — content-director.
- Variáveis de ambiente da Vercel, allowlist do Atlas e `DEV_SIMULAR_PAGAMENTO` em prod: não verificáveis daqui.
- Hotfix T3 bloqueado até: `package.json` `engines.node` → `24.x`; `vercel.json` com `outputDirectory` (não usar `.vercelignore` com `server/`); `tools/vercel-build-check.sh` imprimir APROVADO; rotação incluir a credencial Atlas de `server/.env.bak-atlas`.
- Aprovações do CEO pendentes: headline final (proposta em uso). Login → D6; números → D7; tecnologia.html → D1 (transversal).

## Pendências de conteúdo para o CEO (conformidade, commit 8e7f2f7)
1. Nome do parceiro contábil e do auditor habilitado (CRC) — citar a Bear Finance como em `quitacao-anual`?
2. Parcerias para usucapião/pareceres e atendimento fora de SP — confirmar antes de publicar.
3. Elaboração de contratos e pareceres é atividade privativa da advocacia: definir como o site apresenta a execução (sociedade de advogados parceira/conveniada).
4. Fatos jurídicos a revisar por profissional habilitado: prazo de registro (FAQ de registro-imobiliario; "30 dias" removido) e inventário extrajudicial frente à Res. CNJ 571/2024.
5. Gráfico 100/110/120% de recuperacao-ativos: é ilustração do art. 523 do CPC (não é resultado) — recomendação: manter.
