# QA — Cabeçalho, portal Acessar, Central de Parcerias e candidaturas (2026-10-17)

Auditoria independente (QA não implementou o pacote). Ambiente: branch `feat/dmc-prime`, working tree
de 2026-10-17 21:47; servidor de teste `tests/server/serve.mjs` (vercel.json real + API real com MongoDB
descartável — nada foi gravado em produção). Evidências locais (não versionadas) em `docs/dmc/qa/`.

**Veredito: pacote aprovado nos testes automáticos (0 falha do pacote).** Antes de publicar, restam
pendências de conteúdo e conformidade para o CEO (abaixo) e itens que só dá para validar depois do deploy.

## Resultado por item

| Item | Status | Evidência (números medidos) |
|---|---|---|
| `vercel build` + regras compiladas | aprovado | CLI 64.5.0 sem login; os 4 redirects novos compilaram como `^/parcerias$`, `^/parcerias/advogados-parceiros$`, `^/parcerias/business-partner$` e `^/parcerias/partner-lawyers$` (301, sem laço com a barra final); `vercel-config.spec` 1/1 |
| 3 páginas: 200, 1 h1, `main#conteudo`, canonical com barra, og:image 200 (1200×630 real), JSON-LD válido, FAQPage = texto visível, BreadcrumbList = trilha | aprovado | `tests/e2e/parcerias.spec.js`, 3/3 |
| FAQ em acordeão pelo teclado (Enter/Espaço/Tab, foco visível) | aprovado | 3/3 |
| `#video` imediatamente antes do CTA final | aprovado | 3/3 |
| Links internos 200 sem redirect e âncoras existentes | aprovado | 3/3 + `rotas.spec` 16/16 nas páginas do pacote |
| Redirects `/parcerias*` (301 → 200, query preservada) | aprovado | 4/4; `/parcerias/partner-lawyers/` (com barra) → **404** (D1) |
| Envio válido PL e BP → 201 + painel com protocolo `PL-2026-XXXXXX` / `BP-2026-XXXXXX` | aprovado | formato `^(PL\|BP)-2026-[2-9A-HJ-NP-Z]{6}$`; documento gravado com o programa da página e `fonte.pagina` correta; nenhum IP/user-agent gravado |
| Modalidade vem da rota (um formulário não cria candidatura do outro) | aprovado | `programa` no corpo ignorado; corpo PL na rota BP → 400 e vice-versa, 0 gravações |
| Reenvio com o mesmo e-mail (até em maiúsculas) | aprovado | 200 `duplicada` com o mesmo protocolo; 1 documento; não conta como conversão |
| Erros no cliente (aria-invalid + aria-describedby, foco no 1º inválido, nenhum POST) | aprovado | PL 10 e BP 10 obrigatórios marcados; ajuda original preservada; erro some ao corrigir |
| 400 do servidor com o JS contornado | aprovado | POST direto vazio/tipos errados/opções fora da lista → 400 por campo, 0 gravações; na tela, campo marcado e focado |
| Honeypot | aprovado | 200 `{ok:true}`, painel genérico sem protocolo, 0 gravações, 0 evento de sucesso |
| Throttle | aprovado | 5 × 201 e 6º → 429 com `Retry-After`; contato mantém contador próprio (201); tela mostra o aviso |
| 413 (> 16 KB) | aprovado | nos 2 programas, 0 gravações |
| Duplo clique / reenvio durante o envio | aprovado | 1 POST, 1 candidatura (botão desabilitado + `aria-busy`) |
| Dado pessoal fora da URL e dos eventos | aprovado | 0 ocorrência em todas as URLs requisitadas e nos eventos `dmc:analytics`; `*_submit_success` só depois do 201 (resposta retida: 0 evento antes), nunca em 400/honeypot/duplicada/503/rede |
| UTMs saneadas | aprovado | `?utm_medium=cpc<script>` descartado no cliente; servidor limpa `goo gle<b>` → `googleb`, corta em 80 e tira query da página |
| Sem JavaScript | aprovado (com ressalva) | POST urlencoded grava (áreas em lista), nada na URL; a pessoa vê o JSON cru da API (D4) |
| Painel admin | aprovado | sem token → `login.html?next=parcerias.html`; API 401/403; admin vê só o programa pedido; conta sem admin vê "Acesso restrito" |
| Cabeçalho 320–1920 nas 3 páginas + tecnologia | aprovado | 28/28: 0 sobreposição, 0 peça fora da janela, barra 64/72 px, gaveta < 1200, CTA na barra ≥ 768, h1 nunca sob a barra |
| Overflow horizontal | aprovado | 0 em 7 larguras (`viewports.spec` 35/35 nas páginas do pacote) |
| Console (desktop + 390) | aprovado | 0 erro (`console.spec` 10/10); axe 0 serious/critical (`a11y.spec` 10/10) |
| Navegação (Eixos, Parcerias, Acessar, gaveta) | aprovado | `navegacao.spec` 40/40 |
| Suíte completa | 650/669 | as 19 falhas são fora do pacote (lista abaixo) — `qa/2026-10-17-parcerias/e2e/resumo.json` |
| API (`npm test`) | aprovado | 129/129 (parcerias 56, newsletter 50, contato 23) |
| Lighthouse mobile (mediana de 3) | aprovado | Perf/A11y/BP/SEO — parcerias 99/100/100/100 (LCP 1,88 s); advogados-parceiros 100/100/100/100 (1,65 s); business-partner 99/100/100/100 (1,80 s); tecnologia 100/100/100/100 (1,20 s); planejamento-sucessorio 100/100/100/100 (1,65 s); CLS ≤ 0,002 em todas as 15 execuções; TBT 0 — `qa/2026-10-17/parcerias/lighthouse/resumo.json` |
| Conformidade do texto (4 páginas, FAQ aberto, meta, JSON-LD, alt) | aprovado com pendências | 0 percentual numérico, 0 R$, 0 "comissão", 0 remuneração afirmativa, 0 "garantia/aprovação garantida" afirmativa, 0 número institucional, 0 selo/brasão; "OAB" só como requisito de inscrição. Pendências C1–C4 — `qa/2026-10-17/parcerias/conformidade.json` |
| Segredos em arquivos públicos | aprovado | grep por chaves/tokens na pasta pública: 0 |
| Destino ADTECH | falhou (medido daqui) | `adtech-app.complexodmc.com.br` (64.181.172.211) não respondeu em 443 nem 80 (timeout 20 s); internet ok — dono CEO/infra |
| Capturas antes × depois | feito | `qa/2026-10-17/parcerias/capturas/` (lista abaixo) |

## Defeitos do pacote (nenhum bloqueia; todos P3)

- **D1** `vercel.json:96` — o atalho `/parcerias/partner-lawyers/` (com barra) dá 404; só a forma sem barra redireciona. Corrigir: mais uma regra `/parcerias/partner-lawyers/` → `/parcerias/advogados-parceiros/` (frontend).
- **D2** `server/src/routes/parcerias.js:773-774` — o mesmo contador vale para os dois programas: depois de 5 envios de Partner Lawyers, o 1º de Business Partner do mesmo IP já recebe 429. Escritórios que saem por um único IP somam os envios. Decidir se fica assim (backend).
- **D3** `server/src/routes/parcerias.js:716-733` — limite já documentado, agora medido: dois envios simultâneos com o mesmo e-mail gravaram **2** candidaturas. Mitigação: chave única (e-mail + programa + dia) (backend).
- **D4** `parcerias/advogados-parceiros/index.html:273` (e o mesmo no BP) — quem está sem JS vê o JSON cru depois de enviar. Mitigação: a API responder com 303 para uma página de confirmação quando o pedido aceitar HTML (backend + frontend).

## Conformidade — decisão do CEO (sem defeito de código)

- **C1** "Agente Prospector" (`assets/js/navbar.js:69`, `parcerias/index.html:175`) — `parcerias/CONFORMIDADE.md` D3 (lembra "agenciador").
- **C2** "não divulgamos valores nem percentuais" no FAQ do BP (`parcerias/business-partner/index.html:427` e JSON-LD `:59`) — D4.
- **C3** h1 "Excelência profissional…" (`parcerias/advogados-parceiros/index.html:133`) — D2.
- **C4** `pages/politica-de-privacidade.html:199` mostra "[CONFIRMAR: prazo de retenção das candidaturas]" — impede a publicação, junto com os outros `[CONFIRMAR]` da política.

## Falhas fora do pacote (19 — só lista)

- home/newsletter: `newsletter.spec` 8 (mensagens do `#nlMessage`, timeout no 400); `home-secoes.spec` 10 (overflow do `div.form-hp` em `#newsletter`/`#contact` de 320 a 1920, contraste de `.metodo-programa > .dmc-overline` em `#treinamentos`, ato sem atribuição em `#publicacoes`, logo de terceiro fora do rodapé); `movimento.spec` 1 (`#presenca` sem `data-motion="running"`).

## Capturas

Antes (produção, só GET): `docs/dmc/qa/2026-10-17/parcerias/capturas/antes-prod-home-1440.png`, `antes-prod-home-390-gaveta.png`.
Depois (local): `depois-local-home-1440.png`, `depois-local-home-390-gaveta.png`, `depois-local-pl-1440-acessar.png`,
`depois-local-pl-1440-parcerias.png`, `depois-local-bp-390-gaveta.png`, `depois-local-central-1024.png` (mesma pasta; `capturas.json` traz URL, status e itens do cabeçalho).

## NÃO TESTADO (e por quê)

- Safari/iOS e Firefox reais: a suíte roda só no Chromium.
- E-mail de aviso (Resend): o servidor de teste zera `RESEND_API_KEY`; sem chave nenhum e-mail sai. Só os testes de unidade cobrem o envio.
- Proxy real da Vercel: redirects, índice de pasta (`/parcerias/` → `index.html`), cabeçalhos e o throttle em memória por instância da função só se confirmam depois do deploy. `/parcerias/` em produção hoje responde 404 (ainda não publicado).
- 503 de banco fora do ar e falha de rede na tela: testados com a rota interceptada (comportamento do cliente); o 503 real só nos testes de unidade.
- Lighthouse em rede real: medido em 127.0.0.1 (as fontes do Google vêm da internet).
- Leitor de tela real (VoiceOver/NVDA): só axe + verificação de ARIA e foco.
