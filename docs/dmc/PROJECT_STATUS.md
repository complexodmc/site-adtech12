# DMC PRIME — PAINEL EXECUTIVO

Pacote "Master Prompt Definitivo" · atualizado em 2026-10-17 · branch `feat/dmc-prime`.
Detalhe técnico: `PROGRESS.md` (histórico) · `QA_REPORT.md` (QA deste pacote) · `DECISIONS.md` (D10, T7–T10).

Escala usada: **Desenvolvido → Integrado → Testado → Aprovado → Publicado → Operacional.**
Nada deste pacote está publicado: produção segue a versão anterior até a autorização de deploy (D3).

## Quem faz o quê nesta rodada

Três sessões trabalharam no mesmo repositório, com divisão de arquivos combinada:

| Frente | Sessão | Arquivos |
|---|---|---|
| Header, portal Acessar, Central de Parcerias, candidaturas, campanhas | esta | `navbar.js`, `components.css` (header), `parcerias/**`, `server/src/routes/parcerias.js`, `plataforma-ead/parcerias.html`, `docs/dmc/parcerias/**` |
| Redesign da home (10 seções) + newsletter | sessão da home | `index.html`, `styles.css`, `main.js`, `rede-neural.js`, `routes/newsletter.js` |
| Seção Sobre + `pages/sobre.html` | sessão do Sobre | commitado em `b26a462` |

## Entregáveis

| Entregável | Status | Evidência |
|---|---|---|
| Header institucional | Desenvolvido · testado localmente | `assets/js/navbar.js?v=c4`, `components.css?v=3`; medição 13 larguras × 3 páginas sem sobreposição nem estouro; suíte `tests/e2e/navegacao.spec.js` atualizada |
| Homepage | Em andamento na sessão da home | fora deste pacote |
| Eixos E1–E6 | Preservados; E6 = Consultoria Trabalhista | mega-menu inalterado; rodapés das 26 páginas atualizados |
| Portal Acessar | Desenvolvido · 2 destinos reais + 2 em estruturação | Business School → `plataforma-ead/login.html` (200 em produção); ADTECH → URL do site (timeout no teste — PENDENTE); Artheu IA e Bloadhound sem URL → apresentação em `pages/tecnologia.html#portal` |
| Página Parcerias | Desenvolvido · testado pelo frontend | `parcerias/index.html`; Lighthouse mobile 97/100/100/100 (frontend) |
| Partner Lawyers | Desenvolvido · testado pelo frontend | `parcerias/advogados-parceiros/`; Lighthouse 100/100/100/100 (frontend) |
| Business Partner | Desenvolvido · testado pelo frontend | `parcerias/business-partner/`; Lighthouse 99/100/100/100 (frontend) |
| Formulários | Desenvolvido · integrado à API real | 2 formulários independentes; estados 201/duplicada/400/413/429/503/rede verificados; envio real ponta a ponta no QA |
| Funis de qualificação | Desenvolvido · integrado · testado (API + painel) | `server/src/routes/parcerias.js` (commit `bc45c71`), `npm test` 79/79; painel `plataforma-ead/parcerias.html` E2E 35/35 com MongoDB real |
| Campanhas Partner Lawyers | Produzido · PROPOSTO | `docs/dmc/parcerias/campanhas/partner-lawyers.md`, 13 PNG, PDF de 8 páginas |
| Campanhas Business Partner | Produzido · PROPOSTO | `docs/dmc/parcerias/campanhas/business-partner.md`, 13 PNG, PDF de 8 páginas, segmentação proposta |
| Integrações | MongoDB existente (gravação) · e-mail opcional sem chave | sem CRM configurado → nenhum serviço pago criado; analytics preparado, não integrado |
| Segurança e LGPD | Desenvolvido · política atualizada com `[CONFIRMAR]` | validação no servidor, honeypot, throttle, sem IP/UA, opt-in separado; `politica-de-privacidade.html#parcerias` |
| QA e acessibilidade | Testado · aprovado (auditor independente) | `parcerias.spec.js` 73/73 (3 rodadas: 219/219), formulários contra API e MongoDB reais; specs do pacote 0 falha (navegação 40, rotas 121, SEO 31, viewports 203, console 58, a11y/axe 58); Lighthouse mobile 99–100 / 100 / 100 / 100 nas 3 páginas + tecnologia + planejamento-sucessorio, CLS ≤ 0,002; reteste após correção do atalho: 114/114 — `docs/dmc/QA_REPORT.md` |
| Build de produção | Aprovado (`vercel build` local, sem login) | 5 redirects `/parcerias*` compilados com casamento exato (`^/parcerias$`…), sem laço; `vercel-config.spec.js` 1/1 |
| Prontidão de publicação | Código pronto para homologação · NÃO pronto para campanhas | 19 falhas da suíte completa são da home/newsletter em andamento (outra sessão); publicação depende de D3 + rotação T3 + pendências abaixo |

### Defeitos menores conhecidos (P3, não bloqueiam homologação)
- Dois envios simultâneos com o mesmo e-mail podem gravar 2 candidaturas (corrida documentada; o botão trava o duplo clique e o throttle limita).
- O limite de 5 envios por IP em 15 min é compartilhado entre os dois programas (decisão: mantido).
- Sem JavaScript, o envio grava de verdade, mas a pessoa vê a resposta crua da API (falta página de confirmação no servidor).

## Pendências que dependem do CEO

1. **Revisão jurídica humana** do Partner Lawyers antes de qualquer divulgação (`docs/dmc/parcerias/CONFORMIDADE.md` §5).
2. **Modelo comercial do Business Partner** (contrato, base da remuneração) — a página não divulga valores.
3. **Grafia e destino** de Artheu IA e Bloadhound; **ADTECH** não respondeu no teste.
4. **LGPD:** razão social, CNPJ, encarregado, prazo de retenção (24 meses sugerido), região dos servidores.
5. **E-mail de aviso:** `RESEND_API_KEY`, remetente verificado e `PARCERIAS_EMAIL_TO`.
6. **Frases do briefing sinalizadas** (mantidas como pedido, com alternativa neutra em CONFORMIDADE.md): "Desenvolvemos oportunidades", "Excelência profissional", "Agente Prospector".
7. **Mídia paga, segmentação e disparos:** nada ativado; dependem de orçamento, público e revisão ética.
8. **Divergência de instruções:** a sessão da home recebeu "cabeçalho intacto"; este pacote seguiu o briefing (§6–§7).
9. Herdado: rotação das credenciais expostas (T3) antes de qualquer deploy.
