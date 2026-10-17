# DMC PRIME — PROGRESSO

Após compactação de contexto: retome daqui. Não refaça auditoria concluída.

| Etapa | Status | Evidência |
|---|---|---|
| 1 Descoberta | ✅ concluída 2026-10-17 | BRIEF.md |
| 2 Auditoria DMC × Planning | ✅ concluída 2026-10-17 | docs/dmc/AUDIT.md; evidências em docs/dmc/audit/2026-10-17/ |
| 3 Estratégia / direção | ✅ aprovada (opção C) | DECISIONS.md D2 |
| 4 Engenharia paralela | ⏳ | |
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
| Links internos (43 HTML) | falhou | `index.html:1372` logo.png 404; `em-construcao.html:12` style.css 404 |
| Canônicas em produção | falhou | 8 páginas (recuperacao-ativos + 7 trabalhistas) → 404 em prod |
| Formulário de contato (submit) | falhou | 0 requisições de rede; `#formMessage` inexistente; `POST /api/contato` → 404 |
| Exposição de segredos em prod | falhou | `GET /server/.env` → 200 (808 B); `server/src/*` e `server/uploads/*` públicos |
| Headers de segurança | falhou | só HSTS; sem CSP/X-Frame-Options/nosniff/Referrer-Policy |
| Roteamento Vercel (rewrites/redirects) | falhou | stub `/index.html` vence rewrite `/`; `/solucoes/*`, robots e sitemap → 404 |
| Acessibilidade rápida | falhou | home 2 H1 e 4 inputs sem label; 21/28 páginas sem `<main>`; toggle sem aria-expanded |
| Console sem erros | falhou | logo.png 404 na home (7/7 larguras); embed YouTube abortado em 3 páginas |
| Conformidade de texto (scan) | falhou | ≥15 páginas com percentuais/"garanta"/"gratuito"/"advogados"/"urgente" — AUDIT.md §4 |
| MongoDB local (ping) | aprovado | 122 ms, 9 coleções |
| networkidle em consultoria-imobiliaria | bloqueado | tracker GoDaddy mantém long-poll (timeout 45 s) |
| Envio de e-mail (SMTP) | bloqueado | nenhuma variável SMTP/Resend em `.env`/`.env.example` |
| Variáveis Vercel / allowlist Atlas | bloqueado | não verificáveis localmente |

## Bloqueios
- Geração de vídeo por IA / Blender: indisponíveis → cenas procedurais + ffmpeg.
- SMTP/e-mail para `/api/contato`: credencial pendente (CEO).
- Variáveis de ambiente da Vercel, allowlist do Atlas e `DEV_SIMULAR_PAGAMENTO` em prod: não verificáveis daqui.
- Aprovações do CEO pendentes: headline final, números institucionais que sobrevivam, destino do "Login" (EAD × Ad-tech), destino de `tecnologia.html`.
