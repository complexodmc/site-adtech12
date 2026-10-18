# PORTAL-ACADEMICO — Documento-índice do Portal do Aluno e do Portal do Professor

Plataforma Complexo DMC (`complexodmc.com.br/plataforma-ead/` + `server/`) · branch `feat/dmc-prime` ·
consolidado em 18/10/2026 pelo arquiteto fullstack (revisão final) e revisado no mesmo dia com as críticas de
cobertura, segurança, viabilidade e design e com os pedidos dos revisores da API e da UX (registro em §15); segunda
revisão no mesmo dia (viabilidade da fase 0, isolamento das fatias, cobertura da matriz, capas e pedidos cruzados da
API e da UX; registro em §16); terceira revisão no mesmo dia (telas de acesso sem depender da 2d, QR dos comprovantes,
404 esperados por fase, fatias sem página própria, D5 robusta à troca de diálogos, divisão da F4, pedido da loja,
regulamento e pedidos cruzados da API e da UX; registro em §17).
Status: **especificação para implementação**. Nenhum arquivo de código foi alterado para escrevê-la.

Este documento amarra os dois contratos detalhados e absorve o rascunho de arquitetura:

| Documento | É a fonte única de |
|---|---|
| [`PORTAL-API.md`](PORTAL-API.md) | rotas, coleções, campos, índices, códigos de erro, serviços entre fatias, regras de negócio, testes de servidor, contrato com a sessão 2d |
| [`PORTAL-UX.md`](PORTAL-UX.md) | telas, textos, menus, componentes `pf-*`, tokens `--pf-*`, estados, acessibilidade, impressão |
| **este documento** | objetivo, decisões do CEO, escopo e exceções, **matriz de cobertura do blueprint**, papéis (resumo), estrutura de arquivos, **contratos JS globais**, **fatias com posse exclusiva**, ordem e critérios de pronto, QA/regressão, riscos, divergências resolvidas, lacunas e pendências |

O rascunho `r-arquitetura` (fora do repositório) fica só como histórico: tudo o que dele vale está aqui,
já corrigido pelas decisões de consolidação da API e da UX.

Sumário: §0 Como ler · §1 Objetivo · §2 Decisões do CEO · §3 Escopo, exceções e restrições · §4 Matriz de
cobertura do blueprint · §5 Papéis e acessos · §6 Estrutura de arquivos · §7 Contratos JS globais · §8 Fatias,
posse exclusiva, ordem e critérios de pronto · §9 QA e regressão · §10 Riscos · §11 Divergências API × UX ×
arquitetura resolvidas · §12 Lacunas a resolver na revisão · §13 Pendências para o CEO · §14 Registro e
próximos passos · §15 Revisão de 18/10/2026 (críticas acolhidas, acolhidas em parte e não acolhidas) · §16 Segunda
revisão de 18/10/2026 (idem, mais os pedidos cruzados da API e da UX) · §17 Terceira revisão de 18/10/2026 (idem).

---

## 0. Como ler

**Precedência** (vale para toda fatia e todo revisor):

| Assunto | Fonte que prevalece |
|---|---|
| rota de API, campo, enum, código de erro, regra de negócio, serviço entre fatias | `PORTAL-API.md` |
| tela, texto, ordem de menu, componente, token visual, estado de tela | `PORTAL-UX.md` |
| nome e posse de arquivo, módulo JS, contrato JS global, fatia, ordem de trabalho, QA (inclusive CSP, detector de neon, regressão D5 e portões) | **este documento** |
| decisão registrada em §11 (D-01…D-82) | **este documento**, sobre qualquer trecho de `PORTAL-API.md` e `PORTAL-UX.md` |
| conflito não coberto pelas linhas acima | este documento decide e registra em §11 |

**Regra de §11.** Uma linha de §11 prevalece sobre qualquer trecho da API e da UX. Quem implementa e encontra texto
divergente segue §11 e avisa a principal, que corrige o documento atrasado. Situação conferida na segunda revisão:
a API aplicou D-01…D-51 no corpo (API §15 e §16.3, DC-68) e registrou as próprias DC-61…DC-68; a UX aplicou
D-01…D-36 e as próprias DC-38…DC-40, mas ainda não D-37…D-51 nem os pedidos que a API lhe fez (API §16.5). As
decisões D-52…D-70 desta segunda revisão ainda não estão no texto da API nem da UX. Situação conferida na terceira
revisão (§17): a API registrou DC-69…DC-78 (API §12 e §17) e aplicou de D-52…D-70 só o `textoSha256` de D-54 e a
leitura do filtro de D-62; a UX registrou a própria terceira revisão (UX §0.3, §15, P17), aplicou D-69 e trouxe as
telas que a cobertura pedia (`acesso-link.html#pedir-link`/`#esqueci`, `regulamento.html`, obrigado honesto). As
decisões D-71…D-82 da terceira revisão também não estão em nenhuma das duas. Tudo isso vale pela regra acima
até a principal propagar (§14 item 1), o que acontece ANTES da fase 0; a conferência por script da matriz no G2
(D-58) reprova linha que cite seção da UX ou da API sem o termo do item.

**Notação.** `/portal/...` = `/api/portal/...`. Caminhos de front são relativos a
`complexodmc.com.br/plataforma-ead/`; de back, a `server/`. "Principal" = sessão principal (integra, monta o
agregador em `server.js`, commita com caminhos explícitos). "2d" = sessão paralela `site-complexo-dmc-2d`
(dona do login). "Fatia" = uma das 19 de §8.1: F0a, F0m, F0t, F0b, F0s, F0p, F0r, F1a, F1b, F2, F3a, F3b, F4a,
F4b, F5, F6a, F6b, F7, F8. Na API e na UX, "F0a" cobre F0a + F0m + F0t, "F0b" cobre F0b + F0s + F0p + F0r, "F1" cobre
F1a + F1b, "F3" cobre F3a + F3b, "F4" cobre F4a + F4b e "F6" cobre F6a + F6b: a tabela de posse da §8.1 diz, arquivo
a arquivo, qual delas é a dona (D-37, D-59, D-78).

**Status na matriz (§4):**

| Código | Significado |
|---|---|
| **C** | coberto: implementado nesta rodada como o blueprint descreve, com tela (seção da UX) e rota (seção da API) que contêm o termo do item; quando o texto da UX ou da API ainda não traz o acréscimo, a linha cita a decisão de §11 que vale até a propagação (D-58) |
| **A** | adaptado: entregue por equivalente próprio na nossa stack (o motivo está na linha) |
| **R** | referência do blueprint sobre a stack observada (§4 dele): não copiar; a linha diz o equivalente |
| **E1 · E2 · E3** | exceção decidida pelo CEO (§3.2) |
| **L*n*** | lacuna: precisa de acréscimo de contrato ou de decisão antes de implementar (§12) |
| **2d** | parte do item depende da tela de login da sessão 2d (D-71). Sempre junto de C: a parte da principal (rotas, `DMC_Auth`, `acesso-link.html`, Perfil) está coberta; a linha só conta como C pleno quando o `login-portal.spec.js` passar (§9.9 item 1a). Até lá, o 2FA fica desligado (`PORTAL_2FA` ausente) e a entrada por CPF não é anunciada nos tutoriais |

---

## 1. Objetivo

Evoluir a plataforma EAD que já existe (`dashboard.html` e as demais páginas, `app.js`, `server/` em
Express + MongoDB) para um **Portal do Aluno** e um **Portal do Professor e da coordenação**, cobrindo
**integralmente** o blueprint entregue pelo CEO em 18/10/2026, adaptado à stack preservada (T2), sem quebrar
nenhum fluxo existente (D5), com a identidade visual da DMC em toda a plataforma (decisão CEO-5), sem nenhum
número ou dado inventado (D7) e com texto público sóbrio (Provimento OAB 205/2021) e cadastro minimizado
(LGPD).

Ponto de partida (código em disco): `js/app.js` 1.882 linhas, `css/plataforma.css` 4.195 linhas, 11 páginas
legadas da EAD + 2 da sessão 2d, 14 arquivos de rota no servidor, `npm test` com 188/188 testes verdes
(conferido nesta consolidação).

Ponto de chegada desta rodada: 21 páginas novas (aluno, equipe e públicas; a 21ª, `regulamento.html`, entrou na
terceira revisão, D-81), 11 legadas reskinadas e corrigidas,
um agregador de API (`/api/portal/*` e `/api/auth/*`) com 27 módulos de rota (o 27º, `routes/portal-declaracoes.js`,
entrou com a divisão da F3, D-38), as coleções novas da API §3.3 e campos aditivos nas existentes, entregues por
**19 fatias com posse exclusiva de arquivos** (eram 10 no rascunho, 14 na primeira revisão e 18 na segunda; F0a, F0b,
F3 e F6 foram divididas na primeira, D-37, F0a, F0b e F1 de novo na segunda, D-59, e a F4 na terceira, D-78), com a
CSP aplicada nas páginas da plataforma (D-43). Publicação em produção só com decisão explícita do CEO na rodada (D3)
e depois dos itens bloqueantes de segurança de §9.9.

---

## 2. Decisões do CEO

### 2.1 Decisões de 18/10/2026 (prevalecem sobre qualquer rascunho)

| # | Decisão | Efeito nesta especificação |
|---|---|---|
| CEO-0 | Escopo = **blueprint integral** ("está faltando muita coisa") | Matriz §4 com uma linha por item; o que não fechar volta como lacuna (§12) ou pendência (§13), nunca como tela falsa |
| CEO-1 | Financeiro: **gateway depois** (EXCEÇÃO 1) | `financeiro.html` com lançamentos manuais da coordenação, auditados; modelo pronto (`origem manual\|gateway`, `externo`, webhook previsto e **não montado**); sem "Meus cartões", sem cobrança nem NFS-e automáticas, sem botão falso |
| CEO-2 | **Assistente de IA com Google Gemini** e espaço para a coordenação colar a chave | Configurações › Assistente (colar chave, modelo padrão `gemini-2.5-flash`, ligar/desligar, testar). Chave só no servidor: `GEMINI_API_KEY` tem precedência; senão `configuracoes` com a chave cifrada (AES-256-GCM, HKDF de `JWT_SECRET` com sal próprio). A API nunca devolve a chave (só configurada, origem e 4 últimos). Chamada só pelo servidor, header `x-goog-api-key`, timeout, teto de tamanho, limite por aluno. Dez ferramentas **somente leitura** dos dados do próprio aluno + RAG no regulamento; nunca envia CPF/RG/arquivos; sem aconselhamento jurídico individual. Consentimento antes do 1º uso, retenção, apagar histórico, estado honesto sem chave, testes com provedor falso |
| CEO-3 | **Libras retirada** (EXCEÇÃO 2) | Nenhum VLibras; nenhum script de terceiro em página autenticada |
| CEO-4 | **Notas e aprovação** — mínimo 7 (0–10) | Nota do módulo = melhor tentativa corrigida da avaliação MODULAR publicada; prévia não conta; aprovado ≥ `notaMinima` (padrão 7, só admin altera, auditado); situações Cursando · Aprovado · Em recuperação · Reprovado; curso aprovado = 100% das aulas disponíveis + todos os módulos com modular publicada aprovados; certificado passa a exigir aprovação (curso sem modular publicada: regra antiga de 100% das aulas); emitidos continuam válidos; nova tentativa concedida por professor/admin, auditada |
| CEO-5 | **Identidade visual da DMC em toda a plataforma** (substitui a parte de D8 que mantinha o neon na EAD) | `tokens.css` + `components.css` + `css/portal.css` (`--pf-*`) em todas as páginas; neon ciano/verde sai; rinoceronte monocromático; Newsreader 300 + Hanken Grotesk; estados sóbrios AA; tema claro em papel DMC. Única página ainda fora do padrão: `login-classico.html` (da 2d, sem link em nenhuma página, abre por URL); proposta de aposentá-la com redirecionamento para `login.html` (D-44, §5.5 item 9, pendência §13) |
| CEO-6 | Provedor de assinatura e vídeo Mux/Bunny dependem de contrato/custo (EXCEÇÃO 3) | Assinatura eletrônica simples nativa; `contratos.provedor` previsto; webhook não montado; vídeo por YouTube/Vimeo/arquivo com embed seguro |

### 2.2 Decisões anteriores que continuam valendo

| Ref. (`DECISIONS.md`) | Regra | Consequência |
|---|---|---|
| T2 | Stack preservada | HTML/CSS/JS vanilla sem build; Express + MongoDB; biblioteca de terceiro só vendorizada e indispensável (só o gerador de QR, MIT) |
| D5 | A EAD não pode quebrar | Regressão D5 gravada ANTES de qualquer edição (§9.2); contratos legados só ganham acréscimos |
| D7 | Nenhum número inventado | Valor desconhecido = `null` → "—" + motivo; estados vazios honestos; nada de dado de exemplo fora de banco `_qa` |
| D3 | Publicação sob condições | Checklist de homologação §9.9; publicar só com decisão do CEO na rodada |
| T6 | Segurança de processos | Nunca `pkill`/`killall`/`kill -9` por nome; só o PID iniciado; portas 4630–4659 deste trabalho |
| — | Conformidade OAB (Provimento 205/2021) | Sem "pós-graduação", "MEC", "reconhecido" salvo curso com IES parceira cadastrada; sem promessa de resultado |
| — | LGPD | Base legal por campo, consentimento para sensíveis, visibilidade mínima, auditoria, canal do titular |
| — | Nome | "Plataforma Complexo DMC" nas páginas internas (não renomear para Business School) |

---

## 3. Escopo, exceções e restrições

### 3.1 Dentro do escopo desta rodada
Todo item do blueprint §1–§8 (matriz §4), mais o que o CEO acrescentou na revisão do escopo (bloco M17 da
matriz): shell completo por papel; Início, Meus cursos e player em seções; avaliações com banco, sorteio,
dissertativas e correção; Acadêmico com frequência de fonte única; aulas ao vivo com presença automática;
documentos, declarações, contratos com assinatura nativa e comprovantes verificáveis; financeiro manual;
assistente de IA, atendimentos e ouvidoria; perfil completo com LGPD e "Meus dados"; publicações, banners e
notificações; turmas e matrículas como evolução das liberações; auth ampliada (CPF, link, recuperação, 2FA,
senha temporária); backoffice do professor e da coordenação com relatórios e auditoria; reskin DMC de todo o
legado; correções de autorização e de bugs já mapeados; endurecimento transversal pedido na revisão (CSP aplicada
nas páginas da plataforma, log de erros sem corpo nem dado pessoal, abertura segura de arquivos no navegador).

### 3.2 Exceções decididas pelo CEO

| Código | Fora | O que existe no lugar (sem botão falso) |
|---|---|---|
| **E1** | Gateway (boleto, Pix, cartão automáticos), NFS-e automática, "Meus cartões" | Lançamentos manuais auditados; nº da NFS-e registrado à mão; 2ª via por link https ou PDF; `pf-alerta--info` explicando; campos `origem/externo` e webhook só documentado |
| **E2** | Libras/VLibras | Tema, A−/A+, WCAG 2.2 AA |
| **E3** | Assinatura por provedor externo (D4Sign/Clicksign/ZapSign); vídeo Mux/Bunny | Assinatura eletrônica simples nativa com evidências e selo; `contratos.provedor`; vídeo YouTube (nocookie)/Vimeo/arquivo |

### 3.3 Adaptações por restrição (não são exceções)
Next.js/TypeScript/Tailwind → vanilla (T2) · Postgres com RLS → Mongo com autorização por família de rota ·
ERP externo → a própria plataforma é o sistema de registro · FullCalendar, Plyr, Chart.js, DataTables,
Dropzone, Summernote, Material Symbols → componentes próprios (zero biblioteca) · SSR → esqueleto + endpoints
agregados · PDF gerado no servidor → documento imprimível "salvar como PDF" · URL assinada → download por
header `Authorization` · cron → geração sob demanda · Sentry → trilha de auditoria + log de erros (Sentry é
pendência de custo).

### 3.4 Restrições operacionais (valem para todas as fatias)
- Arquivos proibidos a TODAS as fatias: `server/src/server.js`, `server/src/db.js`, `server/src/config.js`,
  `plataforma-ead/login.html`, `login-classico.html`, `css/business-school.css`, `js/business-school.js`. Em
  `server.js` só a principal mexe, depois de a 2d liberar o arquivo, em exatamente três pontos (§8.1, linha
  "Principal"): a linha de import, a linha `app.use('/api', montarPortal())` e o tratamento de erro global, que passa a
  ser só `app.use(tratarErroGlobal)` (D-42, API DC-77, D-82). A
  liberação (ou uma janela combinada por escrito) é pedida à 2d como critério de ENTRADA da fase 0; se não vier, vale
  o plano B de §8.3 (G0-a × G0-b, D-70).
- Código novo usa `getDb().collection(nome)` sem editar `db.js`; índices novos por `indices.js` (F0m),
  idempotentes e memoizados; configuração nova só em `server/src/portal/config-portal.js` (F0a).
- Contrato com a 2d (API §10): `DMC_init()`, `DMC_Auth.signIn/signUp/isLogged/user/signOut`, `DMC_bootLogin`,
  `DMC_capaSrc` não mudam de assinatura; `user()` só ganha campos (`papel`, `precisaTrocarSenha`, `temFoto`,
  `doisFatoresAtivo`, `emailVerificado`, `avisos`); `nome` passa a ser o nome de exibição. O comportamento de
  `DMC_bootLogin` (só usado por `login-classico.html`) ganha CPF, destino por papel e o desvio do 2FA (§5.5 item 9).
  Pedir link de acesso e criar nova senha têm tela própria da principal (`acesso-link.html#pedir-link` e `#esqueci`,
  F0p); da 2d dependem só a entrada por CPF, o passo do código do 2FA, o destino por papel e os dois links (D-71).
- Nenhum `<script>` inline nem atributo `on*=` em página da plataforma, exceto as duas da 2d: a CSP de
  `/plataforma-ead/` fica estrita em modo report-only desde o G0 e passa a aplicada no G2 (D-43, §9.6).
- Bancos e portas: testes só em bancos `*_qa` ou no mongod descartável do `tests/server/serve.mjs`;
  `complexodmc_local` intocado; portas 4630–4659 (4611, 4612, 3000, 8090 e 4671–4691 não são nossas; tabela §9.1).
- Agentes não commitam; a principal commita por fatia, com caminhos explícitos (nunca `git add -A`, `stash`,
  `reset`).

---

## 4. Matriz de cobertura do blueprint

Uma linha por item do `BLUEPRINT.md` (texto integral do CEO), na ordem dele. Colunas: **Tela · componente**
(seção da `PORTAL-UX.md`), **Endpoint** (seção da `PORTAL-API.md`; caminhos `/portal/...` = `/api/portal/...`),
**Coleção · campo**, **Fatia** dona da entrega, **St** (status, legenda em §0). Itens que o CEO acrescentou na
revisão do escopo e que não estão literalmente no blueprint ficam no bloco M17.

### M1 — §1 Visão geral do modelo

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 1.1 | Portal = central de atendimento + secretaria + financeiro + LMS num só shell | shell único `pf-topo`/`pf-lateral` em todas as páginas autenticadas, menu por papel (UX §5) | `GET /api/auth/me`; `GET /portal/me/pendencias` (API §6.4) | — | F0s | C |
| 1.2 | Cada área lê de um ERP acadêmico externo (Eduq) | a própria plataforma é o sistema de registro; integrações futuras com campos reservados | API §3.3 (`lancamentos.externo`, `contratos.provedor`) | — | todas | A |
| 1.3 | Camada Shell/UX: menu lateral, busca global, tema, acessibilidade | UX §5, §2.7, §2.8, §11 | `GET /portal/busca` (§6.4) | — | F0s · F0p · F0t | C |
| 1.4 | Camada LMS: player, materiais, aulas gravadas, avaliações (YouTube + Plyr) | `aula.html` UX §6.3–§6.4 | §6.5, §6.6 | `modulos.plano/materiais`, `aulas`, `progresso*`, `avaliacoes`, `questoes`, `tentativas` | F1a · F1b · F2 | C |
| 1.5 | Camada Secretaria: matrícula, enturmação, notas, frequência, histórico, declarações | `academico`, `certificados`, `comprovantes`; `#/matriculas`, `#/turmas` (UX §6.5, §6.9, §6.11, §7.4, §7.14) | §6.7, §6.8.1–§6.8.2 | `turmas`, `matriculas`, `frequencias`, `declaracoes` | F3a · F3b · F4a | C |
| 1.6 | Camada Financeiro: parcelas, boletos, NFS-e, cartões | `financeiro.html`, `#/financeiro` (UX §6.7, §7.18) | §6.9 | `lancamentos` | F5 | C · E1 |
| 1.7 | Camada Documentos/Contratos: upload, assinatura eletrônica (EduqSign) | `documentos`, `contratos`, `contrato` (UX §6.8, §6.10) | §6.8.3–§6.8.4 | `tipos_documento`, `documentos_enviados`, `contratos`, `arquivos` | F4b | C · E3 |
| 1.8 | Camada Atendimento: IA pedagógica + protocolos + ouvidoria | `assistente`, `atendimentos`, `ouvidoria` (UX §6.12) | §6.10 | `conversas_ia`, `protocolos`, `manifestacoes` | F6a · F6b | C |
| 1.9 | Camada Comunicação: publicações, banners, notificações | `publicacoes`, `pf-faixa`, destaques do Início, `pf-sino` (UX §6.13, §5.2, §6.1) | §6.11, §6.4 | `publicacoes`, `banners`, `notificacoes` | F7 · F0t · F0s · F0p | C |
| 1.10 | Insight: aluno resolve a secretaria sozinho; IA na porta do atendimento, antes do protocolo | Início com pendências, inclusive avaliação disponível e lançamento vencendo em ≤ 3 dias (UX §6.1; L13 fechada); "Falar com a equipe" em toda resposta e estado do assistente (UX §6.12) | `POST /portal/me/ia/conversas/:id/escalar` → protocolo ATD `origem:'ia'` (§6.10.3); avisos `avaliacao-disponivel` (F2) e `lancamento-vencendo` (F5) no grupo `aviso` (API §4.4) | `protocolos.origem`, `conversas_ia.escalouPara` | F6b · F6a · F1b (+F2, F5 nos avisos) | C |
| 1.11 | Financeiro: "mesma integração usada no pré-atendimento" (coluna "Observado") | `loja.html` [Finalizar pedido] registra o pedido como atendimento Financeiro e `obrigado.html?protocolo=` mostra protocolo, itens e total do servidor, com texto honesto (UX §6.19); bloco Pedido em Seus atendimentos (UX §6.12); fila "Pedidos da loja" e [Criar matrícula e lançamentos] (UX §7.10, §7.14, §7.18), com os nomes da API (D-79) | `POST /portal/me/pedidos` (§6.9, DC-69) → ATD `categoria:'financeiro'` por `atendimento.abrirProtocolo` com `pedido` (§6.10.1, `?pedido=1`) | `protocolos.pedido` (congelado) | F5 · F6a · F0b (`DMC_bootLoja`/`DMC_bootObrigado`) · F0r (páginas) | C · E1 |

### M2 — §2 Mapa de rotas

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 2.1 | `inicio` (Meus Cursos → abre o Player) | `dashboard.html` (UX §6.1) | `GET /portal/me/cursos`, `GET /portal/cursos/:id/trilha` (§6.5) | — | F1a · F1b | C |
| 2.2 | `novo_atendimento` (IA com histórico de conversas) | `assistente.html` (UX §6.12) | §6.10.3 | `conversas_ia` | F6b | C |
| 2.3 | `protocolos` (lista + filtro + "Iniciar Atendimento") | `atendimentos.html` (UX §6.12) | §6.10.1 | `protocolos` | F6a | C |
| 2.4 | `academico` (Enturmação Atual \| Histórico) | `academico.html` (UX §6.5) | `GET /portal/me/academico(/:matriculaId)` (§6.7.3) | `matriculas` + cálculo | F3a | C |
| 2.5 | `financeiro` (resumo + lançamentos + Meus Cartões) | `financeiro.html` (UX §6.7) | `GET /portal/me/financeiro` (§6.9) | `lancamentos` | F5 | C · E1 |
| 2.6 | `calendario` (aulas ao vivo mês/semana/lista) | `ao-vivo.html` (nome legado mantido, D5) (UX §6.6) | `GET /portal/agenda`, `POST /portal/encontros/:id/entrar` (§6.7.2) | `lives`, `frequencias` | F3a | C |
| 2.7 | `documentos` (checklist de upload) | `documentos.html` (UX §6.8) | §6.8.3 | `tipos_documento`, `documentos_enviados` | F4b | C |
| 2.8 | `declaracoes` (Declarações & Certificados) | `certificados.html` evoluída, rótulo "Declarações e certificados" (UX §6.9) | §6.7.5, §6.7.7; quitação §6.9 | `declaracoes`, `certificados` | F3b (+F5) | C |
| 2.9 | `assinaturas` (contratos com assinatura eletrônica) | `contratos.html` + `contrato.html?id=` (UX §6.10) | §6.8.4 | `contratos` | F4b | C |
| 2.10 | `comprovantes` (frequência e avaliações imprimíveis) | `comprovantes.html` (UX §6.11) | `GET /portal/me/comprovantes` (§6.7.4) | visão de `frequencias` + `tentativas` | F3a | C |
| 2.11 | `publicacoes` (cards de vídeo) | `publicacoes.html` + `publicacao.html?id=` (UX §6.13) | §6.11.1 | `publicacoes` | F7 | C |
| 2.12 | `ouvidoria` (manifestações) | `ouvidoria.html` (UX §6.12) | §6.10.2 | `manifestacoes` | F6a | C |
| 2.13 | `perfil` (cadastro completo) | `perfil.html` + `meus-dados.html` (UX §6.15–§6.16) | §6.3 | `perfis`, `users` | F0p · F0t | C |
| 2.14 | Endpoint `ajax_banners` | faixa do topo e destaques do Início | `GET /portal/banners?local=topo\|inicio` (§6.11.2) | `banners` | F7 | C |
| 2.15 | Endpoint `ajax_academico_matriculas` | Acadêmico | `GET /portal/me/academico` (§6.7.3) | `matriculas` | F3a | C |
| 2.16 | Telas carregam o shell e depois buscam dados com spinner | shell e `pf-cabecalho` imediatos; região de dados com `pf-esqueleto` + `aria-busy`; nunca spinner sequencial (UX §10) | endpoints agregados (§4 do blueprint, linha 4.20) | — | F0s + todas | A |

### M3 — §3.1 Meus Cursos (`/inicio`) e Player

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 3.1.1 | Hero: imagem de capa do curso ativo | `pf-heroi__midia` (UX §6.1); sem capa → capa tipográfica | `GET /portal/me/cursos` → `curso.capaUrl` | `cursos` (capa legada, `capas.js`) | F1a · F1b | C |
| 3.1.2 | Hero: nome do curso | `pf-heroi` H1 | idem → `curso.titulo` | `cursos.titulo` | F1a · F1b | C |
| 3.1.3 | Hero: status ("Cursando") | `pf-estado`: Cursando · Concluído · Aprovado · Em recuperação · Reprovado | idem → `situacao` (de `academico.situacaoDoCurso`, §8.11) | derivado | F1a · F1b · F3a | C |
| 3.1.4 | Hero: data de início | "Início em dd/mm/aaaa" (some sem matrícula) | idem → `matricula.inicioEm` (`secretaria.garantirMatricula`, §8.2) | `matriculas.inicioEm` | F1a · F1b · F4a | C |
| 3.1.5 | Hero: barra de progresso (% concluído) | `pf-progresso` + "38% · 17 de 45 aulas" | idem → `progresso` (regra única de contagem, §6.5) | `progresso` | F1a · F1b | C |
| 3.1.6 | CTA "Acessar Aulas" | primário; abre o próximo conteúdo não concluído; 100% → "Rever aulas" | idem → `continuar` | — | F1a · F1b | C |
| 3.1.7 | CTA "Acadêmico" | secundário → `academico.html?curso=<id>` | — | — | F1b → F3a | C |
| 3.1.8 | Grid "Meus Cursos" com capas verticais | `pf-capas` 2:3 no Início ③ e em `meus-cursos.html` com `capaVerticalUrl`; sem ela, recorte central da capa 16:9 e, sem imagem, capa tipográfica (UX §4.11, §6.1, §6.2; `capaFoco` não entra, D-56); envio e remoção da capa vertical no editor (UX §7.16 com D-56) | `GET /portal/me/cursos` → `curso.capaVerticalUrl`; `POST`/`DELETE /portal/admin/cursos/:cursoId/capa-vertical`; `GET /portal/conteudo/imagens/:arquivo` (público) (D-56) | `cursos.capaVertical`, `arquivos` (`contexto:'capa'`) | F1a · F1b · F8 | C |
| 3.1.9 | Player em overlay full-screen | `aula.html` em modo foco (`pf-app--foco`, sem topo global nem lateral) + tela cheia do provedor; página própria em vez de overlay (URL compartilhável, Voltar funciona, `aula.html?id=` legado preservado) | — | — | F1b · F0s | A |
| 3.1.10 | Coluna esquerda: lista de módulos (ex.: 11) | `pf-modulos` em sanfona; < 1280 vira painel "Módulos" (UX §6.3) | `GET /portal/cursos/:id/trilha` | `modulos` | F1a · F1b | C |
| 3.1.11 | Módulo: miniatura numerada | 56×56: capa do módulo quando houver, senão o número em Newsreader 24 (UX §6.3); envio da capa do módulo no editor (UX §7.16 com D-56) | trilha → `modulos[].numero`, `modulos[].capaUrl`; `POST`/`DELETE /portal/admin/modulos/:moduloId/capa` (D-56) | `modulos.numero`, `modulos.capa` | F1a · F1b · F8 | C |
| 3.1.12 | Módulo: carga horária (36h) | "36 h" | trilha → `chHoras` | `modulos.chHoras` (F3b; fallback `horasDe(duracao)`) | F1a · F1b · F3b | C |
| 3.1.13 | Módulo: status | glifo Concluído · Cursando · Não iniciado · Em breve | trilha → `situacao` | derivado | F1a · F1b · F3a | C |
| 3.1.14 | Módulo: % de progresso | "4 de 9 · 44%" + barra fina | trilha → `progresso.pct` | `progresso` | F1a · F1b | C |
| 3.1.15 | Módulo: check verde quando concluído | glifo de sucesso (sálvia `--pf-sucesso`, nunca verde neon) | trilha → `concluido` | — | F1a · F1b | C |
| 3.1.16 | Seções padronizadas com contador `feitos/total` | `pf-secao__contador` (UX §6.3) | `GET /portal/modulos/:id/conteudo` → `secoes.*.feitos/total` | `progresso_conteudo`, `progresso` | F1a · F1b | C |
| 3.1.17 | Seção 1 — Plano de Ensino | palco "documento legível": Ementa, Objetivos em lista, Bibliografia Básica e Complementar, Cronograma em tabela Encontro · Data · Tema (UX §6.3); edição pelo componente `DMC_PlanoEnsino` em `#/cursos/:id/plano` e embutido no `admin.html` (UX §7.3, §7.16), com a bibliografia em dois campos, limites visíveis e [Montar a partir das aulas gravadas] pelas `aulas` de `planos` (D-53) | `secoes.plano.item` = `PlanoEnsino` estruturado (API §3.2, DC-61); `GET /portal/professor/cursos/:id/planos`; `PUT /portal/professor/modulos/:id/plano` (§6.5) | `modulos.plano` | F1a · F1b (+F8 embute) | C |
| 3.1.18 | Seção 2 — Material de Apoio: Leitura | subgrupo "Leitura"; [Abrir material] por blob autenticado | `secoes.materiais` (`categoria:'leitura'`); `GET /portal/materiais/:arquivoId`; `POST /portal/professor/modulos/:id/materiais` | `modulos.materiais[]`, `aulas.materiais[].categoria`, `arquivos` | F1a · F1b | C |
| 3.1.19 | Seção 2 — Material de Apoio: Slides | subgrupo "Slides" | idem (`categoria:'slides'`) | idem | F1a · F1b | C |
| 3.1.20 | Seção 2 — Material de Apoio: Complementar | subgrupo "Complementar" | idem (`categoria:'complementar'`) | idem | F1a · F1b | C |
| 3.1.21 | Seção 3 — Aulas Gravadas (uma por encontro) | itens de aula; encontro vinculado aparece na meta | `secoes.aulas` (+ `encontro`); `POST /portal/professor/encontros` (cria, id do servidor) e `PUT …/:id` (edita) com `aulaGravadaId` (§6.7.2) | `aulas`, `lives.aulaGravadaId` | F1a · F1b · F3a | C |
| 3.1.22 | Rótulo do encontro (Sexta, Sábado manhã, Sábado tarde, Domingo) | rótulo do item no player; `datalist` no editor de aulas (UX §7.16) | `PUT /portal/professor/aulas/:aulaId/academico`; `PUT /api/aulas/:id` aceita `rotuloEncontro` (§6.13) | `aulas.rotuloEncontro` (vazio → derivado do encontro) | F1a · F1b (+F8 editor, F0b `DMC_Data`) | C |
| 3.1.23 | Seção 4 — Atividade/Avaliação | `DMC_Avaliacao.montar` no palco (UX §6.4) | `secoes.avaliacoes`; §6.6.1 | `avaliacoes`, `tentativas` | F2 (+F1b) | C |
| 3.1.24 | Rodapé: Anterior | `pf-player__rodape` | `Conteudo.sequencia`, `anterior` | — | F1a · F1b | C |
| 3.1.25 | Rodapé: "5 de 9" | posição entre TODOS os itens do módulo, `aria-live="polite"` | `Conteudo.sequencia` | — | F1a · F1b | C |
| 3.1.26 | Rodapé: Próximo conteúdo / Concluído | [Marcar como concluído] ↔ [Desmarcar conclusão] (o rótulo troca, sem `aria-pressed`; estado no marcador ao lado) + primário [Próximo]; no fim "Concluir módulo" / "Ir para o Módulo n" | `POST /portal/conteudo/feito`; `PUT /api/progresso/:aulaId`; `POST /portal/aulas/:id/assistido` | `progresso`, `progresso_conteudo` | F1a · F1b | C |
| 3.1.27 | Navegação linear | ordem plano → materiais → aulas → avaliações; sem avanço automático | `Conteudo.sequencia`, `proximo.moduloId` | — | F1a · F1b | C |
| 3.1.28 | Vídeo: YouTube embed | `DMC_Video.montar`: `youtube-nocookie.com/embed` por DOM API; também Vimeo (com hash) e arquivo `<video>` | `aula.video` normalizado (`normalizarVideo`, §4.11) | `aulas.videoUrl` (normalizado na leitura) | F1a · F1b | C |
| 3.1.29 | Vídeo: skin Plyr | controles do provedor e `<video controls>`; nenhuma biblioteca (T2, OWASP A06) | — | — | F1b | A |
| 3.1.30 | Overlay com código da aula (`HP029M01A01`) | `pf-palco__codigo` sobre o vídeo + meta com [Copiar]; formato próprio `SIGLA-M##-A##` (UX §6.3); o `admin.html` gera o código da aula nova logo depois do 1º salvamento e oferece [Gerar códigos que faltam] e "Refazer todos" com motivo (UX §7.16) | `Conteudo.secoes.aulas.itens[].codigo`; `POST /portal/admin/cursos/:id/codigos` (`refazer:true` exige `motivo`, D-54) (§6.7.1, §8.12) | `aulas.codigo`, `cursos.sigla` | F1a · F1b · F3b · F8 | C |

### M4 — §3.2 Avaliação (dentro do Player)

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 3.2.1 | Avisos importantes: limite de tentativas | `pf-avisos-avaliacao` "Tentativas 2 de 3 disponíveis" (UX §6.4) | `GET /portal/avaliacoes/:id` → `avisos.tentativas`, `estado` (§6.6.1) | `avaliacoes.tentativasMax`, `avaliacoes_aluno.tentativasExtras` | F2 | C |
| 3.2.2 | Avisos importantes: tempo livre (ou limite) | "Livre" / "N minutos a partir do início"; `pf-cronometro` `role=timer`; o prazo é do servidor | `avisos.tempo`; tentativa → `prazoEm`, `agora` | `avaliacoes.tempoLimiteMin`, `tentativas.prazoEm` | F2 | C |
| 3.2.3 | Avisos importantes: nº de questões | "10, sorteadas a cada tentativa" | `avisos.questoes`, `nQuestoes` | `avaliacoes.sorteio` | F2 | C |
| 3.2.4 | Resultado: início/fim com timestamp | "Início dd/mm/aaaa às hh:mm · Fim … (duração)" | `ResultadoAluno.iniciadaEm/enviadaEm` | `tentativas` | F2 | C |
| 3.2.5 | Resultado: donut com % de acerto | `pf-donut` (SVG estático, sem Chart.js) | `ResultadoAluno.pctAcerto` | `tentativas.pctAcerto` | F2 · F0b · F0s | C |
| 3.2.6 | "Você acertou 9 de 10" | texto do `pf-resultado`; com dissertativa pendente, "aguardando correção do professor" | `acertosObjetivas` / `totalObjetivas` | `tentativas` | F2 | C |
| 3.2.7 | Ação "Melhorar Nota" (nova tentativa) | primário quando nota < mínima com tentativas; inativo com motivo quando esgotadas | `POST /portal/avaliacoes/:id/tentativas` | `tentativas` (`uq_tent_aberta`) | F2 | C |
| 3.2.8 | Ação "Finalizar e ver Gabarito" | confirmação "encerra as tentativas" → `pf-gabarito` | `POST /portal/avaliacoes/:id/finalizar`; `GET /portal/tentativas/:id/gabarito` (403 antes) | `avaliacoes_aluno.finalizadaEm` | F2 | C |
| 3.2.9 | Link "Confira sua nota na aba Acadêmico" | link para `academico.html?m=<matriculaId>#modulo-<id>` | `ResultadoAluno.linkAcademico` | — | F2 → F3a | C |
| 3.2.10 | Tipo: Atividade Prévia | "Não conta para a nota." | `avaliacoes.tipo:'previa'` | `uq_avaliacoes_modulo_tipo` | F2 | C |
| 3.2.11 | Tipo: Atividade Modular | "Conta para a nota do módulo. Nota mínima: 7,0" (valor do servidor) | `avaliacoes.tipo:'modular'`; regra §8.11 | `cursos.criterios.notaMinima` | F2 · F3a · F3b | C |

### M5 — §3.3 Módulo Acadêmico (`/academico`)

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 3.3.1 | Aba "Enturmação Atual" | `pf-abas` `#atual` (UX §6.5) | `GET /portal/me/academico` → `atuais` (ativa, trancada) | `matriculas` | F3a | C |
| 3.3.2 | Aba "Histórico" | `#historico`: concluídas e canceladas, nota final, [Ver certificado], [Declaração de conclusão] | idem → `historico` | `matriculas.resultadoFinal`, `certificados` | F3a | C |
| 3.3.3 | Card: código da turma | "Turma APE-2026-1" / "Sem turma: curso gravado" | `CardMatricula.turma.codigo` | `turmas.codigo` | F3a · F4a | C |
| 3.3.4 | Card: nível (Pós-Graduação) | Curso livre · Extensão · Aperfeiçoamento; "Pós-graduação lato sensu" só com IES parceira cadastrada, nunca "reconhecido" | `CardMatricula.nivelRotulo` | `cursos.nivel`, `cursos.iesId`, `ies` | F3a · F3b | C |
| 3.3.5 | Card: carga total (360h) | "42 h" | `cargaTotalHoras` | `cursos.cargaHorariaHoras` | F3a | C |
| 3.3.6 | Card: data | "Início" | `inicioEm` | `matriculas.inicioEm` | F3a · F4a | C |
| 3.3.7 | Card: status | situação da matrícula + situação do curso | `status`, `situacaoCurso` | `matriculas.status` | F3a | C |
| 3.3.8 | Card expandido | `button[aria-expanded]`; com uma matrícula ativa já vem aberto | `GET /portal/me/academico/:matriculaId` → `ResumoMatricula` | — | F3a | C |
| 3.3.9 | KPI Média parcial | `pf-kpi`; sem nota → "—" + "Sem notas ainda" | `kpis.mediaParcial` | derivado (§8.11) | F3a · F2 | C |
| 3.3.10 | KPI Frequência geral | `pf-kpi` | `kpis.frequenciaGeralPct` | `frequencias` | F3a | C |
| 3.3.11 | KPI Disciplinas | `pf-kpi` "Módulos" (vocabulário da casa) | `kpis.modulos` | `modulos` | F3a | A |
| 3.3.12 | KPI Carga horária | "16 h de 42 h" | `kpis.cargaHoraria` | `modulos.chHoras` | F3a | C |
| 3.3.13 | KPI Em andamento | `pf-kpi` | `kpis.emAndamento` | derivado | F3a | C |
| 3.3.14 | Tabela por disciplina: CH | `pf-tabela` (empilhada < 44em) | `linhas[].chHoras` | `modulos.chHoras` | F3a | C |
| 3.3.15 | Tabela: Média | vírgula, 1 casa; "Sem avaliação"; "Em correção" | `linhas[].media`, `aguardandoCorrecao` | derivado | F3a · F2 | C |
| 3.3.16 | Tabela: Frequência (Ao vivo % · Gravado %) | geral em 600 + "ao vivo X% · gravado Y%" | `linhas[].frequencia.{pct, aoVivoPct, gravadoPct}` | `frequencias` (fonte única, §8.5–§8.7) | F3a | C |
| 3.3.17 | Tabela: Faltas | número | `frequencia.faltas` | `frequencias` + `lives` | F3a | C |
| 3.3.18 | Tabela: Situação (Cursando/Aprovado) | + Não iniciado · Aguardando correção · Em recuperação · Reprovado · Concluído | `linhas[].situacao` | derivado | F3a | C |

### M6 — §3.4 Financeiro (`/financeiro`)

Tela: `financeiro.html` (UX §6.7) e `#/financeiro` (UX §7.18). Endpoint: API §6.9 em todas as linhas (`GET
/portal/me/financeiro` e rotas `admin/financeiro`), salvo indicação. O pedido da loja, que liga o "pré-atendimento" ao
financeiro manual, está na linha 1.11 e na 17.37 (`POST /portal/me/pedidos`, API §6.9, DC-69).

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 3.4.1 | KPI Total | `pf-kpis` (UX §6.7) | `GET /portal/me/financeiro` → `kpis.total` (centavos, sem cancelados) | `lancamentos` | F5 | C |
| 3.4.2 | KPI Em aberto | idem | `kpis.emAberto` | idem | F5 | C |
| 3.4.3 | KPI Pago | idem | `kpis.pago` (usa `valorPagoCentavos`) | `lancamentos.pagamento` | F5 | C |
| 3.4.4 | KPI Em atraso | idem; `--pf-erro` só quando > 0 | `kpis.emAtraso` (derivado na leitura, fuso SP, sem cron — §8.10) | idem | F5 | C |
| 3.4.5 | Chip "Todos" | `pf-segmento` (URL `?status=todos`) | `?status=todos` | — | F5 | C |
| 3.4.6 | Chip "Em aberto" | idem | `?status=aberto` | — | F5 | C |
| 3.4.7 | Chip "Em atraso" | idem | `?status=atrasado` | — | F5 | C |
| 3.4.8 | Chip "Pagos" | idem | `?status=pago` | — | F5 | C |
| 3.4.9 | Lançamento: tipo (Matrícula, Parcela n/N) | coluna "Lançamento" (+ Taxa) | `itens[].rotuloTipo` | `lancamentos.tipo`, `parcela{n,de}` | F5 | C |
| 3.4.10 | Lançamento: status | Em aberto · Vence em N dias (≤ 3, D-18) · Em atraso · Pago em dd/mm · Cancelado | `itens[].status` (derivado) | `lancamentos.situacao` | F5 | C |
| 3.4.11 | Lançamento: vencimento | coluna | `itens[].vencimento` | `lancamentos.vencimento` | F5 | C |
| 3.4.12 | Lançamento: forma (Boleto automático) | Boleto · Pix · Cartão · Transferência, registrados à mão | `itens[].forma` | `formaPrevista`, `pagamento.forma` | F5 | C · E1 |
| 3.4.13 | Lançamento: referência do curso | curso + nº da matrícula em 13 px | `cursoTitulo`, `matriculaNumero` | `lancamentos.cursoTitulo` | F5 | C |
| 3.4.14 | Lançamento: número da NFS-e vinculada | coluna "NFS-e" (número ou "—") | `nfseNumero`; `PUT /portal/admin/financeiro/lancamentos/:id/nfse` | `lancamentos.nfse.numero` | F5 | C · E1 |
| 3.4.15 | Lançamento: valor | moeda de centavos, `tnum` | `valorCentavos` | `lancamentos.valorCentavos` | F5 | C |
| 3.4.16 | Atalho "Meus Cartões" | não aparece; nenhum placeholder | — | nenhum campo de cartão | — | E1 |
| 3.4.17 | Atalho "Atendimento" | `atendimentos.html?novo=1&categoria=financeiro` | `POST /portal/me/atendimentos` (§6.10.1) | `protocolos` | F5 → F6a | C |
| 3.4.18 | Atalho "Protocolos" | `atendimentos.html?categoria=financeiro` | `GET /portal/me/atendimentos` | `protocolos` | F5 → F6a | C |

### M7 — §3.5 Aulas ao Vivo (`/calendario`)

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 3.5.1 | Calendário (FullCalendar) | `pf-calendario` próprio, sem biblioteca (UX §6.6, DC-18) | `GET /portal/agenda` (§6.7.2) | `lives` | F3a | A |
| 3.5.2 | Visão "Hoje" | `pf-segmento` | `?de=&ate=` | — | F3a | C |
| 3.5.3 | Visão "Mês" | grade 7 colunas; < 768 pontos + lista do dia | idem | — | F3a | C |
| 3.5.4 | Visão "Semana" | 7 colunas com encontros empilhados (sem grade de horas) | idem | — | F3a | C |
| 3.5.5 | Visão "Lista" | padrão abaixo de 1024 px | idem | — | F3a | C |
| 3.5.6 | Evento: horário | `pf-encontro` "19:00–22:00" | `inicioEm`, `fimEm` | `lives.inicioEm`, `duracaoMin` | F3a | C |
| 3.5.7 | Evento: disciplina | "Módulo 03 · <título>" | `modulo` | `lives.moduloId` | F3a | C |
| 3.5.8 | Evento: código da turma | "Turma APE-2026-1" | `turma.codigo` | `lives.turmaId` → `turmas` | F3a · F4a | C |
| 3.5.9 | Filtro por curso | `select` nativo | `?cursoId=` | — | F3a | C |
| 3.5.10 | Encontros em blocos de fim de semana (sex noite, sáb manhã/tarde, dom manhã) | dado real do cadastro; o formulário do encontro sugere o rótulo pela data e hora (UX §7.9) | `POST /portal/professor/encontros` · `PUT …/:id` | `lives` | F3a | C |

### M8 — §3.6 Documentação

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 3.6.1 | Documentos pessoais: checklist | `documentos.html` com "3 de 5 aprovados" (UX §6.8) | `GET /portal/me/documentos` (§6.8.3) | `tipos_documento`, `documentos_enviados` | F4b | C |
| 3.6.2 | Sigla DOC | `pf-sigla`; nome, orientação e formatos vêm da configuração | `POST /portal/admin/documentos/tipos/sugeridos` (nasce **inativo**, D7) | `tipos_documento.sigla` | F4b | C |
| 3.6.3 | Sigla DIP | idem | idem | idem | F4b | C |
| 3.6.4 | Sigla CERT | idem | idem | idem | F4b | C |
| 3.6.5 | Sigla HIS | idem | idem | idem | F4b | C |
| 3.6.6 | Sigla RES | idem (significado das siglas: pendência §13) | idem | idem | F4b | C |
| 3.6.7 | Status "Não enviado" | `pf-estado` neutro | `status:'nao_enviado'` (derivado) | — | F4b | C |
| 3.6.8 | Status "Em revisão" | info | `em_revisao` | `documentos_enviados.status` | F4b | C |
| 3.6.9 | Status "Aprovado" | sucesso; não se reenvia | `aprovado` | idem | F4b | C |
| 3.6.10 | Status "Pendente" | aviso + motivo em `pf-alerta--compacto` | `pendente` + `motivo`; `PUT /portal/admin/documentos/envios/:id/revisao` | `documentos_enviados.motivo` | F4b | C |
| 3.6.11 | Botão "Enviar" | diálogo `pf-upload` (PDF/JPG/PNG ≤ 4 MB) e reenvio | `POST /portal/me/documentos/tipos/:tipoId/envio` | `arquivos` (Binary), `documentos_enviados.numeroEnvio` | F4b | C |
| 3.6.12 | Declaração financeira por ano | `certificados.html` › Solicitar declaração › "Declaração financeira anual (quitação)", com motivo honesto sem dados da instituição (UX §6.9); emissor cadastrado em Configurações › Instituição (UX §7.22) e aviso em "Avisos do sistema" (UX §7.2) | `GET /portal/me/declaracoes` → `quitacao`; `POST /portal/me/financeiro/declaracoes/:ano` (§6.9); `GET`/`PUT /portal/admin/configuracoes/instituicao` (§6.10.5; `motivo` ao alterar e `endereco` em texto, D-54); aviso `sistema.instituicaoPendente` (D-54) | `declaracoes` (`quitacao_anual`), `configuracoes.instituicao` | F3b · F5 · F6a | C |
| 3.6.13 | Declarações por curso (ex.: matrícula) | tipos matrícula, frequência, conclusão; `declaracao.html` imprimível com QR | `POST /portal/me/declaracoes` (§6.7.5) | `declaracoes` | F3b | C |
| 3.6.14 | Histórico de solicitações | `pf-tabela` "Histórico de solicitações" | `GET /portal/me/declaracoes` → `historico` | `declaracoes` | F3b | C |
| 3.6.15 | Contratos: lista | `contratos.html` (UX §6.10) | `GET /portal/me/contratos` (§6.8.4) | `contratos` | F4b | C |
| 3.6.16 | Contratos: status "Pendentes" | `pf-segmento` + marcador | `status:'pendente'` | `contratos.status` | F4b | C |
| 3.6.17 | Contratos: status "Assinados" | idem | `assinado` | idem | F4b | C |
| 3.6.18 | Contratos: status "Cancelados" | idem | `cancelado` | idem | F4b | C |
| 3.6.19 | Contratos: data | disponibilizado em / assinado em | `disponivelEm`, `assinadoEm` | idem | F4b | C |
| 3.6.20 | Contratos: nº da matrícula | coluna | `matriculaNumero` | `contratos.matriculaNumero` | F4b | C |
| 3.6.21 | Contratos: Visualizar (EduqSign) | `contrato.html?id=`: [Abrir contrato (PDF)] por blob + SHA-256 + assinatura nativa em 4 passos | `GET /portal/me/contratos/:id/arquivo`; `POST …/assinar` | `contratos.assinatura` | F4b | A · E3 |
| 3.6.22 | Comprovantes: trilha de auditoria imprimível | `comprovantes.html` + `@media print` (UX §6.11, §12): cada linha impressa com o próprio código (FRQ/AVL) e o hash abreviado, URL de `validar.html` no rodapé, sem QR (D-16, D-72) | `GET /portal/me/comprovantes` (§6.7.4) | visão de `frequencias` + `tentativas` | F3a | C |
| 3.6.23 | Comprovante de avaliação: data/hora | coluna "Data e hora" | `iniciadaEm`, `enviadaEm` | `tentativas` | F3a · F2 | C |
| 3.6.24 | Comprovante de avaliação: % acerto | coluna "Resultado" | `pctAcerto` (+ código AVL e hash depois de corrigida) | `tentativas` | F3a · F2 | C |
| 3.6.25 | Registro de frequência: data/hora | linha com origem (ao vivo/gravado) e hash verificável | `registradaEm`, `origem`, `hash`, `codigo` FRQ | `frequencias` | F3a | C |

### M9 — §3.7 Atendimento

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 3.7.1 | IA "Cora" (BETA) | "Assistente acadêmico · Em fase de testes": sem persona, sem "BETA" (UX DC-34) | `GET /portal/me/ia/estado` (§6.10.3) | `configuracoes.assistente_ia` | F6b | A |
| 3.7.2 | Chat | `pf-chat` (`role=log`), resposta renderizada como texto, nunca HTML | `POST /portal/me/ia/conversas`, `POST …/:id/mensagens`; limite em `estado.limites.caracteresPorMensagem` (L12 fechada) | `conversas_ia` | F6b | C |
| 3.7.3 | Histórico lateral de conversas | lista Hoje · Esta semana · Anteriores; apagar uma ou todas | `GET /portal/me/ia/conversas(/:id)`; `DELETE` | `conversas_ia` (TTL pela retenção) | F6b | C |
| 3.7.4 | Saudação personalizada | "Olá, <nome social ou primeiro nome>." | `estado.saudacao` | `users.nome` (exibição) | F6b | C |
| 3.7.5 | Pergunta sugerida: desempenho | botão secundário de 44 px | `estado.sugestoes[0]` → ferramentas `meus_cursos_e_progresso`, `minhas_notas_e_situacao` | — | F6b | C |
| 3.7.6 | Pergunta sugerida: risco de reprovação | idem | `estado.sugestoes[1]` → `minhas_notas_e_situacao`, `minha_frequencia` | — | F6b | C |
| 3.7.7 | Pergunta sugerida: documentos pendentes | idem | `estado.sugestoes[2]` → `meus_documentos_pendentes` | — | F6b | C |
| 3.7.8 | Pergunta sugerida: prazos | idem | `estado.sugestoes[3]` → `minhas_proximas_aulas_ao_vivo`, `meus_lancamentos_em_aberto` | — | F6b | C |
| 3.7.9 | Aviso de imprecisão | aviso permanente sob o compositor (+ "não presta orientação jurídica") | `estado.aviso` | — | F6b | C |
| 3.7.10 | IA com acesso de leitura ao "ERP" do aluno | 10 ferramentas somente leitura; `userId` sempre da sessão; RAG no regulamento; cada "Fonte" da resposta é link para o trecho em `regulamento.html#r-<regulamentoId>-<trechoId>` (UX §6.12, §6.20; D-81) | §6.10.3 (serviços F1–F6a via `servicos.obter`, ausente = "indisponível"; `fontes[]` com `regulamentoId`, D-81); `GET /portal/regulamento` com `trechos` (§6.10.5, DC-70) | `regulamentos.trechos` | F6b · F6a | C |
| 3.7.11 | Seus Atendimentos: protocolos | `atendimentos.html`: tabela, conversa `pf-linha-tempo`, [Iniciar atendimento], [Encerrar] | `GET/POST /portal/me/atendimentos`, `…/:protocolo(/mensagens\|/encerrar)` (§6.10.1) | `protocolos` (ATD) | F6a | C |
| 3.7.12 | Seus Atendimentos: filtro | `pf-segmento` situação + busca por protocolo/assunto + categoria | `?status&categoria&q` | — | F6a | C |
| 3.7.13 | Ouvidoria: Elogio | `fieldset` de rádios grandes (UX §6.12) | `POST /portal/me/ouvidoria` (§6.10.2) | `manifestacoes.tipo` (OUV) | F6a | C |
| 3.7.14 | Ouvidoria: Denúncia | idem + aviso fixo nos 4 tipos, sem caixa de "resguardar identidade": a identidade nunca chega a professor; na denúncia, "Apurada só pela coordenação" (UX §6.12, DC-40); a coordenação não tem botão de encaminhar denúncia e o professor só vê as encaminhadas, saneadas, com parecer (UX §7.11) | idem (`identidadeResguardada` enviado é ignorado); denúncia não se encaminha a professor (409 `encaminhamento-nao-permitido`, §6.10.2, DC-46) | `manifestacoes` (visão do professor sempre saneada) | F6a | C |
| 3.7.15 | Ouvidoria: Reclamação | idem | idem | idem | F6a | C |
| 3.7.16 | Ouvidoria: Sugestão | idem | idem | idem | F6a | C |
| 3.7.17 | Status "Aberto" | `pf-estado` info | `status:'aberto'` | `manifestacoes.status` | F6a | C |
| 3.7.18 | Status "Respondido" | info | `respondido` | idem | F6a | C |
| 3.7.19 | Status "Encerrado" | neutro | `encerrado` | idem | F6a | C |

### M10 — §3.8 Perfil (cada campo)

Tela: `perfil.html`, seções com salvar próprio, "Quem vê" e "Base legal" em cada uma (UX §6.15). Endpoint:
`GET/PUT /portal/me/perfil` (API §6.3.2) salvo indicação. Base legal (API §6.3.1): **C** contrato · **L**
obrigação legal · **K** consentimento · **KS** consentimento específico para dado sensível. Fatia: F0p (tela)
· F0t (API) em todas as linhas; o bloco de consentimento é o `pf-consentimento` (CSS da F0s, `DMC_UI.consentimento`
da F0b, D-57), sempre com o texto literal do servidor (UX DC-39). Endereço no exterior, celular E.164 e
consentimentos registrados de nome social, redes e foto: API §6.3.1 (DC-48, DC-57).

| # | Campo do blueprint | Seção da tela · regra de UX | Endpoint (API) | Coleção · campo · base | Fatia | St |
|---|---|---|---|---|---|---|
| 3.8.1 | Nome de registro | Identificação; travado após contrato assinado ou certificado emitido | perfil | `perfis.nomeRegistro` · C | F0p · F0t | C |
| 3.8.2 | Nome social | Identificação; vira o nome de exibição; `pf-consentimento` abaixo do campo quando há valor, aceite no mesmo PUT (UX §6.15) | perfil (428 `consentimento-necessario`) | `perfis.nomeSocial`; `users.nome = nomeSocial \|\| nomeRegistro` · K (`perfil_nome_social`, registrado e revogável) | F0p · F0t | C |
| 3.8.3 | CPF | Identificação; máscara, dígitos verificadores, único, travado | perfil (409 `cpf-em-uso`, `campo-travado`) | `perfis.cpf` · C+L | F0p · F0t | C |
| 3.8.4 | Passaporte | Identificação, "Sou estrangeiro(a) sem CPF" | perfil | `perfis.passaporte{numero, paisEmissor}` · C | F0p · F0t | C |
| 3.8.5 | Nascimento | Identificação; texto com máscara dd/mm/aaaa | perfil | `perfis.nascimento`, `menorDeIdade` · C | F0p · F0t | C |
| 3.8.6 | RG: número | Documentos (seção opcional) | perfil | `perfis.rg.numero` · C | F0p · F0t | C |
| 3.8.7 | RG: órgão emissor | Documentos | perfil | `perfis.rg.orgaoEmissor` · C | F0p · F0t | C |
| 3.8.8 | RG: data de expedição | Documentos | perfil | `perfis.rg.dataExpedicao` · C | F0p · F0t | C |
| 3.8.9 | RG: UF | Documentos | perfil | `perfis.rg.uf` · C | F0p · F0t | C |
| 3.8.10 | Gênero | Dados pessoais; opcional; "Prefiro não informar"; `pf-consentimento` próprio com o texto v1 literal (D-55); só o titular vê (equipe vê "Restrito"; estatística agregada) (UX §6.15) | perfil (428 `consentimento-necessario`) | `perfis.genero`, `consentimentos` · KS | F0p · F0t | C |
| 3.8.11 | Etnia | idem (categorias IBGE; texto v1 literal, D-55) | idem | `perfis.etnia`, `consentimentos` · KS | F0p · F0t | C |
| 3.8.12 | Estado civil | Dados pessoais; opcional | perfil | `perfis.estadoCivil` · C | F0p · F0t | C |
| 3.8.13 | Nacionalidade | Identificação | perfil | `perfis.nacionalidade` · C | F0p · F0t | C |
| 3.8.14 | Naturalidade | Identificação (cidade, UF, país) | perfil | `perfis.naturalidade` · C | F0p · F0t | C |
| 3.8.15 | Celular | Contato e redes; celular com DDI (Brasil e exterior) | perfil | `perfis.celular` (E.164) · C | F0p · F0t | C |
| 3.8.16 | E-mail | Contato; somente leitura + [Alterar e-mail] com senha e link de confirmação; sem e-mail configurado → "peça à secretaria" | `POST /portal/me/perfil/email`; `POST /api/auth/email/confirmar` | `users.email` · C | F0p · F0t | C |
| 3.8.17 | Instagram | Contato e redes; um `pf-consentimento` para as duas redes, abaixo do Facebook (UX §6.15) | perfil (428 `consentimento-necessario`) | `perfis.redes.instagram` · K (`perfil_redes`, registrado e revogável) | F0p · F0t | C |
| 3.8.18 | Facebook | Contato e redes; o mesmo `pf-consentimento` das redes (UX §6.15) | perfil (428 `consentimento-necessario`) | `perfis.redes.facebook` · K (`perfil_redes`, registrado e revogável) | F0p · F0t | C |
| 3.8.19 | Endereço completo | Endereço (país; Brasil: CEP, logradouro, número, complemento, bairro, cidade, UF; exterior: código postal, região, logradouro, cidade) | perfil | `perfis.endereco` (`cep`/`uf` ou `codigoPostal`/`regiao`) · C+L | F0p · F0t | C |
| 3.8.20 | CEP com autocomplete | consulta **pelo servidor**; "Buscando endereço…"; falha → preenchimento manual; endereço no exterior não consulta | `GET /portal/cep/:cep` (timeout 2,5 s, cache) | `cache_cep` | F0p · F0t | C |
| 3.8.21 | Foto com upload | Foto: `pf-consentimento` com [Concordo] ANTES de [Enviar foto]; JPG/PNG/WebP ≤ 2 MB, prévia, remover; 428 reabre o aceite sem perder o arquivo (UX §6.15) | `POST /portal/me/dados/consentimentos` (`perfil_foto`); `POST/GET/DELETE /portal/me/perfil/foto` | `arquivos` (`foto_perfil`, metadados removidos), `perfis.fotoArquivoId`, `users.temFoto` · K (`perfil_foto`, registrado antes do envio) | F0p · F0t | C |

### M11 — §3.9 Shell global

| # | Item do blueprint | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 3.9.1 | Sidebar com ícones Material Symbols | `pf-lateral` com `DMC_Icons` SVG próprios, traço 1,5 (UX §4.12, §5.3) | — | — | F0s · F0b | A |
| 3.9.2 | Submenu "Documentação" | único submenu: Documentos pessoais, Declarações e certificados, Contratos, Comprovantes; flyout com menu recolhido (UX §5.5) | `GET /portal/me/pendencias` (pontos de pendência) | — | F0s | C |
| 3.9.3 | Topbar: busca global | `pf-busca` combobox ARIA 1.2, Ctrl/⌘ K, `busca.html` (UX §5.2, §6.18) | `GET /portal/busca` (§6.4) | grupo `busca` (F1a cursos/aulas, F4b documentos, F6a atendimentos, F7 publicações) | F0s · F0p · F0t | C |
| 3.9.4 | Busca: com filtros | `pf-segmento` Tudo · Cursos · Aulas · Publicações · Atendimentos · Documentos | `?tipos=` | — | F0s · F0p | C · L3 |
| 3.9.5 | Banner "Conheça o Novo Portal" | `pf-faixa--novidade` embutida no front, dispensável, leva a `tutoriais.html#novo-portal`; depois dela, banners gerenciados `topo` | `GET /portal/banners?local=topo` (§6.11.2) | `localStorage dmc:banner:<id>:dispensado` | F0s · F7 | C |
| 3.9.6 | Notificações | `pf-sino` + painel + `notificacoes.html` (UX §5.2, §6.14) | `GET /portal/me/notificacoes(/resumo)`, `POST …/:id/lida`, `…/lidas` | `notificacoes` | F0s · F0p · F0t | C |
| 3.9.7 | Tema claro/escuro | `pf-tema`; `pre-pintura.js`; padrão escuro (UX §2.7) | — | `localStorage dmc:tema` | F0s · F0b | C |
| 3.9.8 | A− / A+ (tamanho de fonte) | `pf-fonte`, 4 níveis 93,75 · 100 · 112,5 · 125% (UX §2.8) | — | `localStorage dmc:fonte` | F0s | C |
| 3.9.9 | Libras (VLibras) | não existe | — | — | — | E2 |
| 3.9.10 | Tutoriais | `tutoriais.html` com guias reais (catálogo mínimo de 17 guias do aluno em 10 categorias, UX §6.17) + tour de primeiro acesso `pf-tour` + `#/ajuda` no backoffice (UX §6.17, §5.7, §7.20) | — | conteúdo estático versionado | F0r · F0s | C |
| 3.9.11 | Avatar | `pf-conta`: foto ou iniciais; Meu perfil, Meus dados, Aparência, Rever o tour, troca de área, Sair | `GET /portal/me/perfil/foto` | — | F0s | C |
| 3.9.12 | Visual dark navy + dourado | grafite DMC (`--surface-0`) + ouro DMC (decisão CEO-5) | — | `tokens.css` | F0s · F0r | A |
| 3.9.13 | Cards arredondados | "fio, não caixa"; raios 2/4/8 px, teto 8; card só para mídia (UX §2.5) | — | — | F0s · F0r | A |
| 3.9.14 | Chips de status coloridos | marcador `pf-estado` (glifo + texto, cores sóbrias AA) e `pf-segmento` para filtro (UX §2.3, DC-12) | — | — | F0s · F0r | A |

### M12 — §4 Stack observada (referência, não copiar) e pontos de melhoria

| # | Item do blueprint | Equivalente próprio | Onde | Fatia | St |
|---|---|---|---|---|---|
| 4.1 | Backend PHP monolítico `controller/método` + `ajax_*` (CodeIgniter) | Express 5 + MongoDB; agregador `/api/portal/*` com famílias `me/`, `professor/`, `admin/`, `validar/` | API §1.1, §5 | F0a · F0m | R |
| 4.2 | Bootstrap 5 + tema admin Hyper | `tokens.css` + `components.css` + `portal.css` (`pf-*`) | UX §2–§4 | F0s · F0r | R |
| 4.3 | jQuery (duas versões) | JS vanilla, nenhuma dependência | §6 | todas | R |
| 4.4 | DataTables | `DMC_UI.tabela`: `<table>` real, empilhada abaixo de 44em, "Carregar mais" | UX §4.7; §7.3 | F0b · F0s | R |
| 4.5 | FullCalendar | `pf-calendario` | UX §6.6 | F3a | R |
| 4.6 | Dropzone | `pf-upload` (botão como caminho principal) + `DMC_Api.upload` (corpo cru) | UX §4.11; API §4.12 | F0b · F0s | R |
| 4.7 | Summernote | texto simples multilinha; nenhum HTML aceito nem devolvido | API §1.2 | todas | R |
| 4.8 | Chart.js | `pf-donut` e `pf-barras` (SVG/CSS sobre tabela real) | UX §4.9 | F0b · F0s | R |
| 4.9 | Plyr | controles do provedor / `<video controls>` | UX §6.3 | F1b | R |
| 4.10 | Material Symbols | `DMC_Icons` (SVG próprio) | UX §4.12 | F0b | R |
| 4.11 | DM Sans / Inter | Newsreader 300 + Hanken Grotesk (casa) | UX §2.4 | F0s · F0r | R |
| 4.12 | ERP Eduq (`apiportal.eduqtecnologia.com.br`) | nenhum ERP; dados próprios no Mongo | API §3 | — | R |
| 4.13 | EduqSign | assinatura eletrônica simples nativa; `contratos.provedor` previsto | API §6.8.4 | F4b | R · E3 |
| 4.14 | YouTube | `youtube-nocookie.com/embed` por DOM API + Vimeo + arquivo | API §4.11 | F1a · F1b | R |
| 4.15 | NFS-e | nº registrado manualmente; emissão fora da plataforma | API §6.9 | F5 | R · E1 |
| 4.16 | Boleto | 2ª via por link https ou PDF anexado; gateway depois | API §6.9 | F5 | R · E1 |
| 4.17 | Melhoria: token de API em query string na URL de imagem → header/cookie ou URL assinada | todo download por `Authorization` (`DMC_Api.blob` → `blob:`); imagem privada por `DMC_UI.imagemProtegida`; token de link só no fragmento; imagens públicas (capas, banners) com nome aleatório; `DMC_UI.abrirArquivo` só abre em aba PDF e imagem (tipo refeito no cliente), o resto baixa (§7.5) | API §1.6, §6.1; UX §6.8 | F0m · F0b | C |
| 4.18 | Melhoria: libs demais em todas as páginas → bundle por rota | um módulo JS por página (`js/portal/<pagina>.js`), CSS por domínio, cache por hash; sem bundler (T2); única lib vendorizada = QR; nenhum `<script>` inline (CSP aplicada, §9.6) | §6.2, §6.4 | F0b · F0s | A |
| 4.19 | Melhoria: frequência inconsistente → fonte única | `frequencias` com selo; uma função de cálculo para Acadêmico, Comprovantes, turma, relatórios, IA e certificado | API §8.5–§8.8 | F3a | C |
| 4.20 | Melhoria: spinners sequenciais → SSR ou dados pré-carregados | sem SSR (T2): shell imediato + esqueleto + endpoints agregados (`me/cursos`, `Conteudo`, `ResumoMatricula`, `me/pendencias`) + no máximo 2 idas em série (medido) | UX §10; §9.6 | F0s + todas | A |

### M13 — §5 Modelo de dados (cada entidade)

| # | Entidade do blueprint | Coleção(ões) e campos-chave (API §3) | Telas que leem/escrevem | Fatia | St |
|---|---|---|---|---|---|
| 5.1 | `Pessoa(id, nome_registro, nome_social, cpf, docs…, contato, endereco)` | `users` (conta: e-mail, papel, sessão) + `perfis` (cadastro; CPF e segredos fora de `users`) | Perfil, Cadastro do aluno (`#/alunos/:id/cadastro`) | F0t · F0m | C |
| 5.2 | `Curso(id, codigo, nome, nivel, carga_total, capa)` | `cursos` + `sigla` (= código), `nivel`, `iesId`, `cargaHorariaHoras`, `criterios{notaMinima, frequenciaMinima, cargaMinimaHoras, exigeTcc, …}`; capa legada 16:9 (`capas.js`) + `capaVertical` 2:3 (D-56) | editor `admin.html` (UX §7.16), `#/configuracoes/cursos` (UX §7.22) | F3b (campos acadêmicos) · F1a (`capaVertical`) · F8 (editor) | C |
| 5.3 | `Turma(id, curso_id, codigo, inicio, modalidade[ao_vivo\|gravado\|hibrido])` | `turmas` (+ `nome`, `fim`, `encerradaEm`; status derivado) | `#/turmas`, `#/turmas/nova` | F4a | C |
| 5.4 | `Matricula(id, pessoa_id, turma_id, status, data, contrato_id)` | `matriculas` (`numero` MAT, `turmaId` opcional, `status ativa\|concluida\|cancelada\|trancada`, `inicioEm`, `contratoId`, `enturmacoes[]`, `historico[]`, `resultadoFinal`); evolução de `liberacoes` sem quebrá-las | `#/matriculas`, Acadêmico | F4a | C |
| 5.5 | `Modulo/Disciplina(id, curso_id, ordem, nome, ch, capa)` | `modulos` + `chHoras`, `tipo regular\|tcc`, `plano` (`PlanoEnsino` estruturado, API DC-61), `materiais[]`, `capa` (D-56) | player (UX §6.3), editor (UX §7.16) | F1a · F3b · F8 | C |
| 5.6 | `Conteudo(id, modulo_id, secao[plano\|material\|aula\|avaliacao], tipo[pdf\|slide\|video\|link\|quiz], ordem, codigo)` | composto na leitura, sem coleção própria (`GET /portal/modulos/:id/conteudo`): plano = `modulos.plano`; material = `modulos.materiais[]` / `aulas.materiais[]` (`tipo arquivo\|link`, `categoria leitura\|slides\|complementar`); aula = `aulas` (+ `codigo`); quiz = `avaliacoes` | player | F1a | A |
| 5.7 | `Progresso(matricula_id, conteudo_id, concluido_em, pct_video)` | `progresso` legado (por pessoa) + `progresso_video.pctMax` + `progresso_conteudo`; vínculo à matrícula por `completedAt ≥ matricula.inicioEm` (API §8.8) | player, Início, Acadêmico | F1a | A |
| 5.8 | `Encontro(id, turma_id, modulo_id, inicio, fim, link_transmissao)` | `lives` estendida (`turmaId`, `moduloId`, `aulaGravadaId`, `cancelado`); fim = `inicioEm + duracaoMin`; `url` | ao vivo, `#/ao-vivo` | F3a | C |
| 5.9 | `Frequencia(matricula_id, encontro_id\|conteudo_id, origem[ao_vivo\|gravado], registrado_em, comprovante_hash)` | `frequencias` (`codigo` FRQ, `origem`, `encontroId\|aulaId`, `via`, `registradaEm`, `pctVideo`, `hash` HMAC, `anulada`); só inserção | Acadêmico, Comprovantes, turma › Frequência | F3a | C |
| 5.10 | `Avaliacao(id, modulo_id, tipo[previa\|modular], n_questoes, tentativas_max, tempo_limite)` | `avaliacoes` (+ `sorteio`, `publicada`, `embaralharAlternativas`) + `questoes` (banco) | player, `#/avaliacoes` | F2 | C |
| 5.11 | `Tentativa(id, avaliacao_id, matricula_id, inicio, fim, acertos, nota, gabarito_liberado)` | `tentativas` (snapshot das questões, `prazoEm`, `status`, correção em rascunho até `publicar:true`, entrega de TCC por resposta `arquivo`, `codigo` AVL, selo) + `avaliacoes_aluno.finalizadaEm` (= gabarito liberado) | player, `#/correcao` | F2 | C |
| 5.12 | `Nota(matricula_id, modulo_id, media, situacao)` | derivada na leitura (API §8.11); congelada só em `matriculas.resultadoFinal` e `certificados` | Acadêmico, boletim | F2 · F3a | A |
| 5.13 | `Lancamento(id, matricula_id, tipo, parcela, vencimento, valor, status, forma, nfse_numero)` | `lancamentos` (`valorCentavos`, `situacao` gravada + `status` derivado, `pagamento`, `nfse`, `segundaVia`, `origem`, `externo`) | Financeiro, `#/financeiro` | F5 | C |
| 5.14 | `DocumentoExigido(id, sigla, nome)` | `tipos_documento` (+ `formatos`, `escopo` por curso, `obrigatorio`, `ativo`, `ordem`) | `#/documentos/tipos` | F4b | C |
| 5.15 | `DocumentoEnviado(pessoa_id, doc_id, arquivo, status, revisor)` | `documentos_enviados` (`arquivoId`, `sha256`, `numeroEnvio`, `status`, `revisadoPor`, `historico`) | Documentos, `#/documentos` | F4b | C |
| 5.16 | `Contrato(id, matricula_id, provedor_assinatura, status, assinado_em)` | `contratos` (`sha256Pdf`, `assinatura{…evidências, selo}`, `codigoVerificacao` CTR, `provedor{nome nativo\|d4sign\|clicksign\|zapsign}`) | Contratos, `#/contratos` | F4b | C |
| 5.17 | `Declaracao(id, tipo, matricula_id, solicitada_em, arquivo, codigo_validacao)` | `declaracoes` (`codigo` DEC, `dados` congelados + `hash`); documento renderizado no front (`declaracao.html`), sem arquivo gravado | Declarações, `#/documentos/declaracoes` | F3b | A |
| 5.18 | `Protocolo(id, pessoa_id, assunto, status, origem[ia\|humano])` | `protocolos` (`protocolo` ATD, `categoria`, `pedidoTitular`, `roteamento`, `mensagens[]`) | Atendimentos, `#/atendimento` | F6a | C |
| 5.19 | `Manifestacao(id, tipo, status)` | `manifestacoes` (OUV, `encaminhamentos[]`; visão do professor sempre saneada; identidade só para a coordenação, auditada) | Ouvidoria, `#/ouvidoria` | F6a | C |
| 5.20 | `ConversaIA(id, pessoa_id, mensagens[], escalou_para_protocolo)` | `conversas_ia` (+ `expiraEm`, `ferramentas`, `fontes`, `versaoInstrucao`, `escalouPara`) + `ia_trilha` (só metadados) | Assistente | F6b | C |
| 5.21 | `Publicacao(id, titulo, tipo, publico_alvo)` | `publicacoes` (`tipo video\|texto\|link\|pdf`, `publico todos\|curso\|turma`, `autor`, `status`) | Publicações, `#/publicacoes` | F7 | C |
| 5.22 | `Banner` | `banners` (`local topo\|inicio`, `inicioEm/fimEm`, `link`, `publico`, `imagem`) | faixa, Início, `#/banners` | F7 | C · L6 |
| 5.23 | `Notificacao` | `notificacoes` (`tipo` domínio.evento, `chave` de deduplicação, TTL pela retenção) | sino, `notificacoes.html` | F0m · F0t | C |
| 5.24 | Regra: frequência = presença ao vivo OU conclusão da aula gravada, ambas com comprovante | `registrarFrequencia` via `POST …/entrar` e grupo `aoConcluirAula`; compensação por `lives.aulaGravadaId` (API §8.5, §8.7) | Acadêmico, Comprovantes, ao vivo | F3a · F1a | C |

### M14 — §6 Stack recomendada (cada linha da tabela)

| # | Necessidade · sugestão do blueprint | Equivalente nesta rodada | Onde | Fatia | St |
|---|---|---|---|---|---|
| 6.1 | App: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | HTML/CSS/JS vanilla sem build; componentes `pf-*` | T2; UX §4 | F0b · F0s | A |
| 6.2 | Backend/DB: PostgreSQL (Supabase/Prisma) com Row Level Security por aluno | MongoDB + autorização no servidor por família de rota e por registro (`acesso.js`: titular, docência, admin; recurso alheio = 404) | API §1.1, §2, §4.2 | F0m | A |
| 6.3 | Auth: CPF/e-mail + senha / magic link; 2FA opcional | e-mail OU CPF + senha, link mágico, recuperação, 2FA TOTP com códigos de recuperação, senha temporária da coordenação. Telas da principal: pedir link e criar nova senha em `acesso-link.html#pedir-link`/`#esqueci`, usar o link (`#acesso=`, `#redefinir=`, com o passo do código quando há 2FA) (UX §8.5, F0p), Perfil › Senha e segurança (UX §6.15). Telas da 2d: entrada por CPF, passo do código do 2FA no login, destino por papel e os dois links para `acesso-link.html` (API §10.8; D-71). 2FA ativável só com `PORTAL_2FA=1`, depois do `login-portal.spec.js` verde (§9.9 item 1a); sem e-mail configurado = 503 honesto | API §6.1, §10; UX §8.5, §6.15 | F0t · F0b · F0p · 2d | C · 2d |
| 6.4 | Vídeo: Mux, Bunny Stream ou Vimeo (URL assinada, DRM leve) | YouTube (nocookie) / Vimeo (com hash) / arquivo, embed seguro e normalizado; Mux/Bunny dependem de custo | API §4.11 | F1a · F1b | A · E3 |
| 6.5 | Ao vivo: Zoom/Meet/StreamYard com link + registro automático de presença | link do encontro só na janela + `POST /portal/encontros/:id/entrar` registra presença com selo | API §6.7.2 | F3a | C |
| 6.6 | Avaliações: banco com sorteio, tentativas, gabarito pós-finalização | idem | API §6.6, §8.13 | F2 | C |
| 6.7 | Financeiro: Asaas / Iugu / Pagar.me + NFS-e | lançamentos manuais auditados; modelo pronto para o gateway | API §6.9 | F5 | E1 |
| 6.8 | Assinatura: D4Sign / Clicksign / ZapSign | assinatura eletrônica simples nativa; provedor previsto | API §6.8.4 | F4b | E3 |
| 6.9 | Documentos: storage com URLs assinadas + fila de revisão | Mongo Binary (`arquivos`) + download por header (equivalente à URL assinada, sem token em URL) + fila `#/documentos` | API §4.12, §6.8.3 | F0m · F4b | A |
| 6.10 | Declarações: PDF com QR code de validação pública | documento imprimível ("salvar como PDF") + `DMC_QR` (biblioteca MIT vendorizada) + `validar.html` | API §6.7.5–§6.7.6; UX §8 | F3b · F0b | A |
| 6.11 | IA: LLM com acesso somente leitura via ferramentas + RAG sobre regulamento + "falar com humano" | Gemini só pelo servidor; 10 ferramentas; BM25 no regulamento publicado; escalonamento → ATD | API §6.10.3–§6.10.5 | F6b · F6a | C |
| 6.12 | Acessibilidade: VLibras, ajuste de fonte, tema escuro, WCAG AA | A−/A+, tema claro/escuro, WCAG 2.2 AA; VLibras fora | UX §2.7, §2.8, §11 | F0s · F0b | C · E2 |
| 6.13 | Observabilidade: Sentry + logs de auditoria (LGPD) | trilha de auditoria só de inserção (`executar`/`registrar`) + log estruturado por `requestId` (`X-Request-Id`), resumido por `resumirErro` (nunca corpo, `keyValue` nem cabeçalhos) + `erros_servidor` (30 dias) no bloco `sistema` do painel; Sentry = pendência de custo | API §3.4, §4.5, §4.8; §11 D-42 | F0a · F0m · principal | A |

### M15 — §7 Roadmap de implementação (cada fase)

As sete fases do blueprint entram **nesta rodada**, entregues como fatias verticais em paralelo depois da
fundação (§8.3), e não em sequência de 4–6 semanas cada.

| # | Fase do blueprint | Fatias | St |
|---|---|---|---|
| 7.1 | MVP: auth, perfil, Meus Cursos, player (módulos → seções → conteúdos), progresso, avaliações simples | F0a, F0m, F0b, F0s, F0r (fase 0) · F0t, F0p, F1a, F1b, F2 (fase 1) | C |
| 7.2 | Secretaria: acadêmico (notas/frequência), documentos com revisão, declarações em PDF com QR | F3a, F3b, F4a, F4b | C |
| 7.3 | Financeiro: integração gateway, NFS-e, KPIs e 2ª via | F5 (KPIs, 2ª via, nº da NFS-e); gateway e NFS-e automática fora | C · E1 |
| 7.4 | Contratos: assinatura eletrônica no onboarding da matrícula | F4b (assinatura nativa; contrato anexado à matrícula pelo serviço `secretaria.vincularContrato` da F4a, D-78) + faixa de pendência não dispensável (F0s, grupo `aviso` da F4b) | C · E3 |
| 7.5 | Aulas ao vivo: calendário + presença automática + comprovantes | F3a | C |
| 7.6 | Atendimento: protocolos, ouvidoria, assistente IA com escalonamento | F6a, F6b | C |
| 7.7 | Admin/Secretaria (backoffice): cadastro de cursos, turmas, correção, revisão de documentos, relatórios | F8 (casca, Visão geral, turmas, alunos, dúvidas, equipe, `admin.html`) + painéis de F1–F7 | C |

### M16 — §8 Checklist de conformidade (cada item)

| # | Item do checklist | Como é atendido | Onde | Fatia | St |
|---|---|---|---|---|---|
| 8.1 | LGPD: base legal por campo, consentimento para sensíveis (etnia, gênero), retenção, DPO e canal do titular | base legal por campo na API e na tela; consentimento específico registrado com o texto literal do servidor (`pf-consentimento`; textos v1 de gênero e etnia em D-55); retenção configurável (`configuracoes.retencao`, TTL em conversas, notificações e trilha da IA); encarregado configurável, nunca inventado; `meus-dados.html` (resumo, operadores, as 6 finalidades com data, versão e [Retirar autorização] com `efeitoRevogacao`, exportação JSON, pedidos → protocolo `privacidade` com prazo de 15 dias) | API §6.3.1, §6.3.3, §6.10.5; UX §6.15, §6.16, §7.22 Privacidade | F0t · F0p · F6a | C (prazos: §13) |
| 8.2 | Logs de auditoria para notas, frequência e alterações de cadastro | `auditoria` só de inserção; `executar` (registro antes da mutação) em nota, frequência, cadastro pela equipe, financeiro, contratos, papéis; consulta e CSV em `#/auditoria` | API §3.4, §6.4; UX §7.24 | F0m · F0t + todas · F7 | C · L4 |
| 8.3 | Comprovantes e declarações com hash/QR verificável | selo HMAC (`assinador`) + códigos DMC/DEC/FRQ/AVL/CTR + `validar.html` (despacho único); **declarações, certificados e comprovante de assinatura (C)**: QR por `DMC_QR` para `validar.html?codigo=`, conferido de forma determinística (D-68); certificado emitido a partir desta rodada também selado, com `hashPrefixo` (API DC-65); certificado antigo: "Emitido antes da verificação por selo" (D-53); contrato com SHA-256 do PDF conferível no navegador; **comprovantes de frequência e avaliação (A)**: código e hash por linha + URL de validação no rodapé, sem QR do conjunto (D-16, D-72; o blueprint pede "hash/QR") | API §4.7, §6.7.4, §6.7.6, §6.7.7; UX §6.11, §8 | F3a · F3b · F2 · F4b · F0b | C · A |
| 8.4 | IA: aviso de imprecisão, sem decisões acadêmicas automáticas, trilha das respostas | aviso fixo; só ferramentas de leitura; nada decide nota/situação; `conversas_ia` guarda ferramentas, fontes, modelo e `versaoInstrucao` por resposta; `ia_trilha` só de metadados sobrevive ao "apagar histórico"; a coordenação consulta a trilha, auditada e sem conteúdo, em Configurações › Assistente de IA › Trilha das respostas (L5: ler o conteúdo continua fora) | API §6.10.3–§6.10.4; UX §6.12, §7.22 Assistente de IA (Uso e Trilha das respostas) | F6b | C · L5 |
| 8.5 | MEC: pós-graduação lato sensu (360h, frequência mínima, TCC) — validar com a IES | `nivel` com lato sensu só com IES ativa (400 `nivel-exige-ies`); `criterios` (carga mínima, frequência mínima, TCC) valendo nas DUAS regras de certificado (API DC-66); TCC = módulo `tipo:'tcc'` com modular publicada e aprovada, entregue por questão `arquivo` (PDF ≤ 4 MB) corrigida pelo professor; aviso não bloqueante abaixo de 360 h e com TCC exigido sem avaliação publicada; nenhum texto afirma reconhecimento | API §6.6, §6.7.1, §8.11; UX §7.22 Critérios, §7.6 (tipo "Arquivo (PDF)"), §7.16 ("Tipo do módulo"), §6.4 (envio do PDF) com D-53 | F3b · F3a · F2 · F8 | C (validação com IES e TCC por PDF ≤ 4 MB: §13) |
| 8.6 | Identidade visual, textos e materiais 100% próprios; nenhum ativo da EBPÓS | tokens DMC, ícones próprios, rinoceronte, vocabulário fixo e lista de proibidos (UX §9); nada copiado de layout, código ou conteúdo | UX §2–§4, §9 | F0s · F0r + todas | C |
| 8.7 | Pentest próprio (OWASP Top 10) antes do lançamento | revisão OWASP na fase 2 com evidência das fatias (matriz IDOR E2E, casos obrigatórios de teste por rota, varredura de segredos); pentest independente fica como pendência do CEO | API §7.8, §9.2; §9.8 | principal | C (pentest externo: §13) |

### M17 — Itens do escopo revisado pelo CEO que não estão literalmente no blueprint

| # | Item do escopo (CONTEXTO, 18/10/2026) | Tela · componente (UX) | Endpoint (API) | Coleção · campo | Fatia | St |
|---|---|---|---|---|---|---|
| 17.1 | Nº da matrícula no card (`MAT-AAAA-XXXXXX`) | `pf-matricula` (UX §6.5) | `CardMatricula.numero` | `matriculas.numero` | F3a · F4a | C |
| 17.2 | Plano de ensino (ementa, objetivos, bibliografia, cronograma) editado pelo professor | palco do player; `DMC_PlanoEnsino` em `#/cursos/:id/plano` (UX §6.3, §7.3 com D-53) | `GET /portal/professor/cursos/:id/planos` (com `aulas`); `PUT …/modulos/:id/plano` (docente geral) (§6.5) | `modulos.plano` (`PlanoEnsino` estruturado, DC-61) | F1a · F1b | C |
| 17.3 | % assistido medido (vídeo nativo; YouTube/Vimeo por `postMessage` sem script do provedor) + conclusão automática ≥ 90% + botão manual | "Assistido 64% (medido pelo navegador)"; anúncio "Aula concluída automaticamente." | `POST /portal/aulas/:id/assistido` (teto de plausibilidade, §8.4) | `progresso_video.pctMax` | F1a · F1b | C |
| 17.4 | Dissertativas corrigidas pelo professor | `#/correcao` (fila e tela de correção, UX §7.7): cada questão salva em rascunho, resumo com o efeito calculado pelo servidor, [Publicar correção] (D-53); orientação, limite de caracteres e resposta de referência no editor de questão (UX §7.6) | `GET /portal/professor/correcoes`; `PUT …/tentativas/:id/correcao` (`publicar:false` rascunho × `publicar:true`, `efeito`, DC-63) e `/recorrecao` | `tentativas.correcao`, `questoes.{orientacao, limiteCaracteres, respostaReferencia}` (DC-62) | F2 | C |
| 17.5 | Gabarito só depois de finalizar; finalizar encerra as tentativas | `pf-gabarito` | 403 `gabarito-bloqueado`; `POST …/finalizar` | `avaliacoes_aluno.finalizadaEm` | F2 | C |
| 17.6 | Notas e aprovação (CEO-4): mínimo 7, melhor tentativa, situações, concessão auditada | avaliação, Acadêmico, `#/configuracoes/cursos`, diálogo "Conceder nova tentativa" | §8.11; `POST /portal/professor/avaliacoes/:id/concessoes` | derivado; `avaliacoes_aluno.concessoes` | F2 · F3a · F3b | C |
| 17.7 | Certificado exige aprovação; emitidos continuam válidos; sem modular publicada = regra antiga | `certificados.html` › Certificados (UX §6.9), com a confirmação do nome antes de emitir quando `nomeOrigem:'conta'` (D-53) e, quando não apto, a regra com a nota mínima do servidor e a lista de `pendencias[]` com o link que resolve (UX §6.9 item 1) | §6.7.7 (selo e `hashPrefixo`, DC-65; nome social → registro → conta, DC-64; `notaMinima` no GET, D-80; R9 e R9b) | `certificados` (+ `regra`, `notaFinal`, `nomeOrigem`, `hash`) | F3b | C |
| 17.8 | Lançamentos manuais auditados: criar, lote de parcelas, marcar pago (data/forma), estorno, 2ª via (link/PDF), nº da NFS-e, cancelar | `#/financeiro` (UX §7.18) | §6.9 (rotas `admin/financeiro`) | `lancamentos.historico` + auditoria `executar` | F5 | C |
| 17.9 | Modelo pronto para o gateway (origem, ids externos, webhook previsto) | — | webhook não montado (404) | `lancamentos.origem`, `externo` | F5 | C · E1 |
| 17.10 | Declaração anual de quitação gerada dos lançamentos pagos do ano | `certificados.html` › Solicitar declaração (UX §6.9); dados do emissor em Configurações › Instituição (UX §7.22) | `POST /portal/me/financeiro/declaracoes/:ano`; `declaracoes.emitir`; `PUT /portal/admin/configuracoes/instituicao` (§6.10.5, D-54) | `declaracoes`, `configuracoes.instituicao` | F5 · F3b · F6a | C |
| 17.11 | "Entrar" registra presença; encontro vinculável a turma, módulo e aula gravada | `ao-vivo.html`; formulário de `#/ao-vivo` | `POST /portal/professor/encontros` · `PUT …/:id` · `POST /portal/encontros/:id/entrar` (§6.7.2) | `lives.turmaId/moduloId/aulaGravadaId`, `frequencias` | F3a | C |
| 17.12 | Documentos configuráveis por curso; reenvio; revisão pela coordenação | `#/documentos`, `#/documentos/tipos` | §6.8.3 | `tipos_documento.escopo/cursoIds` | F4b | C |
| 17.13 | Declarações de frequência e de conclusão quando cabível; código e QR | `certificados.html`, `declaracao.html` | §6.7.5, §8.9; lista da coordenação `GET /portal/admin/declaracoes` | `declaracoes` | F3b | C |
| 17.14 | Contrato: aceite autenticado, carimbo de tempo do servidor, SHA-256 do PDF, evidências, código; anexado pela coordenação; aviso enquanto pendente | `contrato.html`, `#/contratos`, `pf-faixa--pendencia` | §6.8.4; grupo `aviso` (F4b) | `contratos`; `matriculas.contratoId` só por `secretaria.vincularContrato` (F4a, D-78) | F4b · F0s | C |
| 17.15 | Comprovantes com origem e hash verificável | `comprovantes.html` | §6.7.4, §6.7.6 | `frequencias`, `tentativas` | F3a | C |
| 17.16 | IA: consentimento antes do 1º uso, apagar histórico, retenção, estado honesto sem chave, limite por aluno, configuração pelo admin | Assistente; `#/configuracoes/ia` | §6.10.3–§6.10.4 | `consentimentos`, `configuracoes`, `conversas_ia`, `ia_trilha`, `ia_uso_diario` (teto global), `limites` | F6b | C |
| 17.17 | "Falar com a equipe" → protocolo `origem:'ia'` com resumo confirmado pelo aluno | diálogo do Assistente: prévia do escalonamento, "Quem atende", anexo desmarcado por padrão (UX §6.12) | `GET …/escalonamento` (`?categoria=&cursoId=`, D-54), `POST …/escalar` | `protocolos.anexoConversa` | F6b · F6a | C |
| 17.18 | Perfil LGPD: base legal declarada, visibilidade mínima (professor vê nome, nome social, foto e e-mail), alterações auditadas | Perfil; Cadastro do aluno (UX §7.5) | §6.3.1; `perfis.publicos` | auditoria `perfil.*` | F0t · F0p · F8 | C · L4 |
| 17.19 | "Meus dados": exportar (JSON) e pedir correção/eliminação → protocolo | `meus-dados.html` | `GET /portal/me/dados/resumo`, `/exportacao`; `POST /portal/me/atendimentos` (`categoria:'privacidade'`) | grupo `exportador` | F0p · F0t · F6a | C |
| 17.20 | Troca de senha | Perfil › Senha e segurança | `POST /api/auth/senha/trocar` | `users.sessaoVersao` | F0p · F0t | C |
| 17.21 | Publicações: cards de vídeo, texto, link ou PDF; público todos/curso/turma; autor professor/admin | `publicacoes.html`; `#/publicacoes` | §6.11.1 | `publicacoes` | F7 | C |
| 17.22 | Banners gerenciados: Início e topo, período, link, público | `#/banners` | §6.11.2 | `banners` | F7 | C · L6 |
| 17.23 | Notificações por gatilho (resposta em dúvida/protocolo, documento revisado, contrato disponível, lançamento criado/vencendo, avaliação corrigida, nova publicação, aula ao vivo próxima) | sino, `notificacoes.html` | catálogo API §3.5 (imediatas + sob demanda) | `notificacoes` | F0m · F0t + F1a–F8 | C |
| 17.24 | Turma e matrícula como evolução das liberações, sem quebrar `/api/liberacoes` nem a loja; enturmação pela coordenação | `#/matriculas`, `#/turmas` | §6.8.1–§6.8.2, §8.1–§8.2 | `matriculas`, `turmas`, `liberacoes` (inalterada) | F4a | C · L7 · L14 |
| 17.25 | Auth ampliada (CPF, link mágico, recuperação, 2FA, senha temporária) e contrato com a 2d | `acesso-link.html` com os modos `#pedir-link` e `#esqueci` e o uso do link (UX §8.5, F0p); login da 2d com o checklist da API §10.8 (CPF, passo do 2FA, links condicionados a `recursos()`, destino por papel), provado pelo `login-portal.spec.js` (§9.9 item 1a, D-71) | §6.1, §10 (2FA atrás de `PORTAL_2FA`, §10.4) | `auth_tokens`, `auth_2fa` | F0t · F0b · F0p · 2d | C · 2d |
| 17.26 | Backoffice: turmas, matrículas/enturmação, correção, revisão de documentos, lançamentos, contratos, publicações e banners, tipos de documento, regulamento, configurações, equipe (papéis, professor↔curso) | `professor.html` (UX §7) | §6.2, §6.6.2, §6.8–§6.12 | — | F8 + F1a–F7 (inclusive F4a e F4b) | C · L8–L11 |
| 17.27 | Relatórios (painéis + CSV): alunos por curso/turma, notas, frequência, documentos pendentes, financeiro, atendimentos | `#/relatorios` (UX §7.23), para a coordenação e, no grupo Ensino do menu, para o professor, com o índice que a API filtra por papel (UX §5.4, §7.1) | §6.11.3: grupo `relatorio` com `consultar` + `resumir` (KPIs e séries dos 7 painéis, sobre o conjunto filtrado inteiro); painel pelo grupo `painel` | — | F7 + donos | C |
| 17.28 | Busca no servidor com filtros | `pf-busca`, `busca.html` | §6.4 | grupo `busca` | F0t + provedores | C |
| 17.29 | Tutoriais com guias reais + tour de primeiro acesso | `tutoriais.html` com o catálogo de 17 guias (UX §6.17; critério da F0r-final em §8.5), `pf-tour` (UX §5.7) | — | — | F0r · F0s | C |
| 17.30 | Menus por papel; avatar com Perfil, Meus dados, Sair | UX §5.2–§5.4 | — | — | F0s · F8 | C |
| 17.31 | Curso com "nível" e parâmetros (carga mínima, frequência mínima, TCC); nota mínima por curso só admin, auditada; lato sensu só com IES | `#/configuracoes/cursos` (UX §7.22) | §6.7.1, §8.11 (critérios nas duas regras e TCC, DC-66) | `cursos.nivel/criterios`, `modulos.tipo`, `ies` | F3b | C |
| 17.32 | Encarregado (DPO) configurável, nunca inventado; retenção por tipo de dado | `#/configuracoes/privacidade`; rodapé; Meus dados | §6.10.5 | `configuracoes.encarregado/retencao` | F6a | C |
| 17.33 | Regulamento acadêmico publicado pela coordenação (fonte do RAG) e lido pelo aluno | `#/configuracoes/regulamento` (UX §7.22); leitura em `regulamento.html` com índice de seções e âncora por trecho (UX §6.20, D-81) | §6.10.5 (`GET /portal/regulamento` com `trechos:[{ id, titulo, inicio, fim }]`, DC-70) | `regulamentos` | F6a | C |
| 17.34 | Identidade DMC em todo o legado (reskin, sem neon) | UX §3 | — | — | F0r · F0s | C |
| 17.35 | Correções de autorização: catálogo sem acesso não entrega vídeo/material; `PUT /progresso` confere acesso; material link checado antes do redirect; cascata não apaga certificados | — | API §7.1–§7.4 | — | F1a | C |
| 17.36 | Bugs já mapeados: "Continuar" (`app.js:1330`), `#player-materiais` inexistente, URL de vídeo sem escape (`app.js:957-960`), listeners duplicados (`admin.js:958-964`), login sem `?next` (`app.js:56`), "Módulos 10" fixo (`dashboard.html:59`), `alert/confirm/prompt` | UX §6.2, §6.3, §7.16, §10 | — | — | F1b · F8 · F0b | C |
| 17.37 | Pedido da loja vira atendimento financeiro (fecha o "pré-atendimento" sem gateway) | `loja.html` [Finalizar pedido] e `obrigado.html?protocolo=` com protocolo, itens e total do servidor; sem a rota (404), o caminho legado com texto honesto de pedido não registrado (UX §6.19 com D-79); fila "Pedidos da loja" (UX §7.10) | `POST /portal/me/pedidos` (§6.9: preços do catálogo, `reaproveitado`, 409 `ja-liberado`, 5/h); `GET /portal/me/atendimentos/:protocolo` → `pedido`; `?pedido=1` na fila (§6.10.1) | `protocolos.pedido` | F5 · F6a · F0b (`DMC_bootLoja`/`DMC_bootObrigado`) · F0r (`loja.html`/`obrigado.html`) | C |

### M18 — Resumo da matriz

| Bloco | Linhas | Bloco | Linhas |
|---|---|---|---|
| M1 §1 visão geral | 11 | M10 §3.8 perfil | 21 |
| M2 §2 rotas | 16 | M11 §3.9 shell | 14 |
| M3 §3.1 Meus cursos e player | 30 | M12 §4 stack observada e melhorias | 20 |
| M4 §3.2 avaliação | 11 | M13 §5 modelo de dados | 24 |
| M5 §3.3 acadêmico | 18 | M14 §6 stack recomendada | 13 |
| M6 §3.4 financeiro | 18 | M15 §7 roadmap | 7 |
| M7 §3.5 aulas ao vivo | 10 | M16 §8 conformidade | 7 |
| M8 §3.6 documentação | 25 | **Blueprint (M1–M16)** | **264** |
| M9 §3.7 atendimento | 19 | M17 escopo revisado pelo CEO | 37 |
| | | **Total** | **301** |

Distribuição por status (uma linha pode ter dois códigos; contagem refeita por script depois da terceira revisão,
§17): **236** linhas só **C**; 22 só **A**; 13 só **R**; 26 com dois ou mais códigos; 4 só com exceção (3.4.16 e 6.7
E1, 3.9.9 E2, 6.8 E3); exceções do CEO em 19 linhas (E1 em 11, E2 em 2, E3 em 6), todas com o equivalente honesto que
fica no lugar; **8** linhas tocadas por lacunas (L3–L11 e L14, §12: 3.9.4, 5.22, 8.2, 8.4, 17.18, 17.22, 17.24,
17.26), nenhuma delas sem entrega: em todas há uma versão desta rodada e a lacuna diz o que falta decidir ou
acrescentar; **2** linhas "C · 2d" (6.3 e 17.25: a parte da principal entregue, a tela de entrada da 2d conferida no
§9.9 item 1a, D-71); **1** linha "C · A" (8.3: QR em declarações, certificados e contrato; código e hash por linha nos
comprovantes, D-72). Fechadas: L12 e L13 na primeira revisão (3.7.2 e 1.10) e L1 e L2 na segunda (3.1.8, 3.1.11 e
5.5 passaram a **C**, D-56). Nenhum item do blueprint ficou sem tela, endpoint ou exceção.

**Conferência da terceira revisão** (§17): a linha nova 1.11 cobre a coluna "Observado" do blueprint §1 que faltava
("Financeiro: mesma integração usada no pré-atendimento") e a 17.37 o pedido da loja (API DC-69, UX §6.19); 6.3 e
17.25 deixam de ser C pleno enquanto a 2d não entregar o checklist (D-71); 8.3 passa a "C · A" (D-72); 3.7.10, 17.7,
17.27, 17.29, 17.33 e 3.9.10 passam a citar as telas que a UX acrescentou (`regulamento.html`, pendências do
certificado, relatórios do professor, catálogo de guias); as linhas da F4 citam F4a ou F4b (D-78). As demais colunas
"Observado" do blueprint §1 (portal próprio, player em overlay com YouTube + Plyr, dados do ERP, EduqSign, "Cora",
`ajax_banners` e sino) já estavam em 1.3, 3.1.9, 3.1.28–3.1.29, 1.2, 3.6.21, 3.7.1, 2.14 e 3.9.6.

**Conferência da segunda revisão** (crítica de cobertura, §16): as linhas 3.7.14, 3.8.2, 3.8.17, 3.8.18, 3.8.21,
8.1, 3.6.12, 17.10, 8.4, 3.1.17, 3.1.30 e 8.5, que estavam C com tela ou rota faltando ou com API × UX em
contradição, foram conferidas uma a uma contra o texto revisado da API (§16) e da UX (§0.2): a UX ganhou o fluxo de
consentimento (§6.15, §6.16), a ouvidoria sem caixa de identidade (§6.12, §7.11), a aba Instituição (§7.22), a trilha
das respostas (§7.22) e a geração do código da aula no editor (§7.16); a API ganhou o plano estruturado (DC-61) e os
critérios do MEC nas duas regras com TCC (DC-66). O que ainda falta no texto de uma das duas está fechado por linha de
§11 (D-53 pedidos da API à UX, D-54 pedidos da UX à API, D-55 textos de gênero e etnia), que a linha da matriz cita.
Por isso nenhuma lacuna nova (L15+) foi aberta: não sobrou pergunta sem resposta, só propagação (§14 item 1).
**No G2** a principal roda `tests/tools/conferir-matriz.mjs` (D-58): toda linha **C** precisa citar uma seção da UX
(coluna Tela, quando o item tem tela) e uma da API (coluna Endpoint, quando tem rota), e o termo do item (tabela
`TERMOS` do script, ex. 3.8.2 → "nome social"/`nomeSocial`) precisa aparecer em cada seção citada; linha que cita
D-nn só passa se a propagação de §14 item 1 já levou o termo ao documento. A coluna Fatia usa os nomes da §8.1. Linha
"C · 2d" é conferida como C e, além disso, o script lê em `PROGRESS.md` o registro do item 1a de §9.9 (D-71): sem ele,
a linha sai na lista "pendente da 2d" do relatório, nunca como C pleno.

---

## 5. Papéis e acessos (resumo; detalhe em API §2 e UX §7.1)

### 5.1 Modelo
- `users.papel ∈ {'aluno','professor','admin'}`. `isAdmin` continua existindo e **manda**: `papelDe(user)` =
  `admin` se `isAdmin === true`; `professor` se `papel === 'professor'`; senão `aluno`. `papel:'admin'` e
  `isAdmin:true` são sempre gravados juntos; `papel:'admin'` sem `isAdmin` não dá privilégio (DC-17 da API).
  Usuário antigo sem `papel` → derivado. "Coordenação" é o rótulo do admin na interface.
- **Um papel por conta** (UX DC-15). Não existe "ver como". A equipe que abre página do aluno vê o menu do
  aluno com o item de rodapé "Portal do professor" ou "Coordenação"; no backoffice, "Área do aluno".
- Professor **não se cadastra**: só a coordenação cria ou promove (`POST /portal/admin/equipe`); conta nova
  recebe senha temporária exibida uma única vez e é obrigada a trocá-la (`exigirTrocaDeSenha`).
- **Docência** (`docencias {userId, cursoId, turmaId|null}`): geral (curso inteiro) ou de turma. Só vale com
  papel professor/admin; professor rebaixado perde o efeito mesmo com docência gravada. Professor não precisa
  de liberação para ver o curso que leciona e não ganha matrícula, progresso acadêmico nem certificado.
- Destino pós-login: `next` válido (`/^[a-z0-9_-]+\.html(\?.*)?$/i`) → senão professor `professor.html`,
  admin `admin.html` (contrato atual com a 2d), aluno `dashboard.html` (`DMC_Auth.destinoInicial()`).

### 5.2 Matriz resumida

Legenda: L ler · E escrever · "seus" = dos cursos/turmas da docência · 404 = recurso alheio não revela
existência.

| Recurso | Anônimo | Aluno (titular) | Aluno → dado de outro | Professor docente | Professor sem vínculo | Admin |
|---|---|---|---|---|---|---|
| Login, link mágico, recuperação, 2FA | E | — | — | — | — | — |
| Validação pública (DMC, DEC, FRQ, AVL, CTR) | L | L | L | L | L | L |
| Perfil completo | 401 | L/E (campos travados → pedido) | 404 | só nome, nome social, foto, e-mail | 404 | L (gênero/etnia "Restrito"), E com motivo |
| Conteúdo do curso (vídeo, material, plano) | 401 | L com liberação | — | L; edita plano, materiais, rótulo | 403 | L/E |
| Progresso legado (`PUT`/`DELETE /api/progresso/:aulaId`) | 401 | E próprio com liberação | 404 | E como hoje (grava; sem frequência, nota nem certificado; nunca 204, API DC-78) | 403 | E como hoje (nunca 204) |
| % assistido e itens feitos (`POST /portal/aulas/:id/assistido`, `POST /portal/conteudo/feito`) | 401 | E próprio com liberação | 404 | 204 sem gravar | 403 | 204 sem gravar |
| Avaliação (fazer) · banco · correção · concessão | 401 | faz (matrícula ativa) | 404 | prévia · E · corrige · concede | 403 | tudo |
| Agenda e "Entrar" · encontros e presenças | 401 | L/E da sua turma | — | L (URL sempre) · E das suas turmas | 403 | tudo |
| Acadêmico, comprovantes | 401 | L próprio | 404 | L dos seus alunos (visão restrita) | 404 | L |
| Declarações · certificados | 401 | E própria elegível | 404 | — | — | L, revogar |
| Turmas · matrículas | 401 | L próprias | 404 | L dos seus cursos | 403 | E |
| Documentos pessoais | 401 | L/E próprios | 404 | **403 sempre** | 403 | L, revisar, tipos |
| Contratos · financeiro | 401 | L próprios; assina os seus | 404 | 403 | 403 | E auditado |
| Atendimentos | 401 | E próprios | 404 | fila acadêmica dos seus cursos + atribuídos | atribuídos | tudo |
| Ouvidoria | 401 | E próprias | 404 | só encaminhadas, saneadas, + parecer | idem | tudo (identidade auditada) |
| Assistente de IA | 401 | E próprio (consentimento + vínculo) | 404 | E próprio | E próprio | E próprio; configuração; uso agregado; trilha só de metadados |
| Publicações | 401 | L do público-alvo | — | L + E para seus cursos/turmas | L; E 403 | tudo |
| Banners | imagem pública | L vigentes | — | L | L | E |
| Dúvidas da aula | 401 | L/E com liberação | 404 | responde e resolve nos seus cursos | 403 | tudo |
| Relatórios | 401 | 403 | — | L dos seus cursos (colunas restritas) | 403 | L tudo |
| Equipe, configurações, auditoria | 401 | 403 | — | 403 | 403 | E (auditoria só L) |

### 5.3 Regras transversais
- A autorização real é sempre do servidor; a guarda do front é conveniência. `userId` vem sempre de
  `req.user`; filtro por curso fora da docência → 403 `nao-docente`; id alheio ou inválido → 404 sem consulta.
- Visão do professor sobre o aluno: só `{nome, nomeSocial, email, fotoUrl}` (`perfis.publicos`); nunca CPF, RG,
  endereço, documentos, financeiro ou contratos (teste de varredura do JSON).
- Gênero e etnia: só o titular e estatística agregada (células < 5 viram "<5"). Conversas da IA: só o titular
  (admin vê uso agregado e a trilha `ia_trilha`, só de metadados; ler o conteúdo é a lacuna L5). A identidade do
  manifestante da ouvidoria nunca chega a professor, nos 4 tipos, e denúncia não se encaminha (API DC-46); o admin
  a vê com registro de auditoria.
- `requireAdmin` legado não muda (lê `isAdmin`): professor nunca ganha as rotas admin legadas.

### 5.4 Guardas do front (`DMC_Portal.iniciar` aplica; páginas legadas chamam direto)

| Guarda | Sem sessão | Papel insuficiente |
|---|---|---|
| `requireOrRedirect()` | `login.html?next=<página atual validada>` (corrige `app.js:56`) | — |
| `requireProfessorOrRedirect()` | idem | `dashboard.html` + toast "Área restrita à equipe." (via `sessionStorage` lido no destino) |
| `requireAdminOrRedirect(to)` | idem | `to` (padrão `dashboard.html`), **inalterado** (contrato estável, §7.2): o professor que abre página só de admin cai no `to`; páginas que precisam levá-lo ao backoffice usam a guarda de papel do `DMC_Portal` (`papeis:['admin']` → professor vai a `professor.html` com o toast "Área restrita à coordenação.") |
| guarda de papel do `DMC_Portal` (`papeis`) | idem | aluno → `dashboard.html` + toast; professor fora de `papeis` → `professor.html` + toast |
| seção de admin aberta por professor em `professor.html` | — | painel "Área da coordenação" (UX §7.21), o servidor já respondeu 403 |
| `parcerias.html` (exceção, D-48) | guarda própria de `parcerias-admin.js`: `login.html?next=parcerias.html` | `#pa-restrito` visível, sem redirecionar (como hoje; `parcerias.spec.js` da principal) |
| `user().precisaTrocarSenha` ou 403 `troca-de-senha-obrigatoria` | — | modo restrito (§7.4), conferido logo depois de `DMC_Auth.init()` e ANTES de qualquer outra chamada (D-63): fora de `perfil.html` leva a `perfil.html#seguranca` sem carregar catálogo, liberações nem progresso e sem rodar o boot; em `perfil.html` não redireciona (sem laço) e roda o boot com `ctx.restrito = true`. Os boots legados de `app.js` fazem a mesma conferência |

### 5.5 Contrato com a sessão 2d (resumo de API §10; o aviso é da principal)
1. Nada que a 2d usa muda de assinatura; `user()` só ganha campos (`papel`, `precisaTrocarSenha`, `temFoto`,
   `doisFatoresAtivo`, `emailVerificado`, `avisos`) e `nome` passa a ser o nome de exibição.
2. Campo "E-mail ou CPF" e validação local nova; `signIn(valor, senha)` continua.
3. Com 2FA ativo, `signIn` **rejeita** com `err.codigo === 'segundo-fator'` e `err.dados.desafio`; a 2d mostra
   o passo do código e chama `DMC_Auth.verificar2fa(desafio, codigo)`. A ativação do 2FA só existe com
   `PORTAL_2FA=1`, que a principal liga **depois** de a 2d entregar este passo e o aceite ficar registrado aqui
   (API §10.4, DC-51). Até lá ninguém ativa o 2FA e ninguém fica trancado fora.
4. Links "Esqueci minha senha" → `acesso-link.html#esqueci` e "Receber link de acesso" → `acesso-link.html#pedir-link`,
   só quando `DMC_Auth.recursos()` disser que existem (senão, a nota honesta da API §10.5). A 2d só põe os dois links:
   os formulários de pedir link e de criar nova senha são da principal (UX §8.5, F0p), e os e-mails levam a
   `acesso-link.html#acesso=`/`#redefinir=` (F0p), nunca ao `login.html` (que usa `#acesso` como âncora) (D-71).
4a. **Aceite da 2d** (D-71): a entrega do checklist da API §10.8 (campo "E-mail ou CPF", passo do código do 2FA, os dois
   links condicionados a `recursos()`, destino por papel e perfil "Professor" por `papel`) é conferida pelo
   `tests/e2e/login-portal.spec.js` (principal, com a 2d) e registrada aqui e em `PROGRESS.md`. Só depois dela a
   principal liga `PORTAL_2FA` (item 3) e as linhas 6.3 e 17.25 da matriz passam de "C · 2d" a C (§9.9 item 1a). Sem a
   entrega, o portal vai à homologação com link e recuperação pelas telas da principal, entrada só por e-mail no login
   da 2d e 2FA desligado (risco R26).
5. Destino por papel (`DMC_Auth.destinoInicial()`) e perfil "Professor" aceito com `papel === 'professor' ||
   isAdmin` (hoje só `isAdmin`, `business-school.js` l. 178).
6. `precisaTrocarSenha` → levar a `perfil.html#seguranca`.
7. A cada versão nova de `js/api-client.js` e `js/app.js`, a principal informa o `?v=` para o `login.html`.
7a. **Liberação de `server.js`** (D-70): no mesmo aviso, a principal pede à 2d que diga quando terminou os acréscimos de
    vitrine e bolsas em `server.js`, `db.js` e `config.js`, ou que combine por escrito uma janela para os três pontos da
    principal (§8.1). É critério de ENTRADA da fase 0; sem resposta, a fase 0 segue pelo plano B (§8.3).
8. O reskin não muda a aparência de `login-classico.html`: em `plataforma.css` o `:root` legado e as seções LOGIN
   e EIXO 3D só ganham os marcadores de comentário `@dmc-root-legado` e `@dmc-legado-login` (captura idêntica).
9. **Destino de `login-classico.html`** (D-44; decisão da 2d com o CEO, pendência §13). A página contraria a
   decisão CEO-5 (neon), não tem passo de 2FA e não aceita CPF. Proposta: **aposentar** — a 2d substitui o
   conteúdo por um aviso estático com link para `login.html` (ou apaga o arquivo) e a principal acrescenta ao
   `vercel.json` o redirecionamento permanente `/plataforma-ead/login-classico(.html)` → `/plataforma-ead/login.html`
   preservando a query (`?next=`). Alternativa, se a 2d preferir manter a página: reskin DMC feito pela própria 2d.
   Depois da aposentadoria, a F0r-final remove os trechos `@dmc-root-legado`/`@dmc-legado-login` de
   `plataforma.css` (só com a página fora do ar). **Enquanto a página existir**, `DMC_bootLogin` (F0b, `app.js`,
   mesma assinatura) passa a: aceitar e-mail **ou** CPF no modo de entrada (o cadastro continua só por e-mail);
   usar `next` válido ou `DMC_Auth.destinoInicial()` (também quando já há sessão); e, ao receber
   `codigo === 'segundo-fator'`, gravar `dmc:aviso` ("Esta conta usa verificação em duas etapas. Continue pelo
   login principal.") e levar a `login.html?next=<next válido>`. A aparência da página não muda (captura idêntica).
10. Acréscimos no servidor que a 2d não precisa tratar: JWT de 12 h para admin (o 401 no fim leva ao login como
    hoje) e senha temporária de 72 h (vencida = o 401 `credenciais-invalidas` de sempre).

---

## 6. Estrutura de arquivos

### 6.1 Árvore final (dono entre colchetes; a posse completa e as regras estão em §8.1)

```
complexodmc.com.br/plataforma-ead/
  index.html ............................................................. [F0b]  legado, redireciona por papel
  loja.html · obrigado.html .............................................. [F0r]  legado, reskin (markup dos boots: F0b, D-69)
  dashboard.html · meus-cursos.html · aula.html .......................... [F1b]  legado, evoluído
  ao-vivo.html ........................................................... [F3a]  legado, evoluído
  certificados.html · certificado.html ................................... [F3b]  legado, evoluído
  admin.html · parcerias.html ............................................ [F8]   legado, dentro do shell
  perfil.html · meus-dados.html · notificacoes.html · busca.html · acesso-link.html  [F0p]  novas (fase 1)
  tutoriais.html ......................................................... [F0r]  nova
  academico.html · comprovantes.html ..................................... [F3a]  novas
  validar.html · declaracao.html ......................................... [F3b]  novas
  documentos.html · contratos.html · contrato.html ....................... [F4b]  novas
  financeiro.html ........................................................ [F5]   nova
  atendimentos.html · ouvidoria.html · regulamento.html .................. [F6a]  novas (regulamento.html: D-81)
  assistente.html ........................................................ [F6b]  nova
  publicacoes.html · publicacao.html ..................................... [F7]   novas
  professor.html ......................................................... [F8]   nova (roteador por hash)
  login.html · login-classico.html ....................................... [2d]   PROIBIDOS
  css/plataforma.css ..................................................... [F0r]  reskin in-place; trechos entre
                                                                                  @dmc-root-legado e @dmc-legado-login intocados
  css/portal.css ......................................................... [F0s]  --pf-*, temas, @dmc-compat, .btn-primary, shell, catálogo
  css/portal-estudos.css [F1b] · portal-avaliacao.css [F2] · portal-academico.css [F3a] · portal-declaracoes.css [F3b]
  css/portal-secretaria.css [F4a] · portal-documentos.css [F4b] · portal-financeiro.css [F5] · portal-atendimento.css [F6a]
  css/portal-assistente.css [F6b]
  css/portal-comunicacao.css [F7] · portal-professor.css [F8] · parcerias-admin.css [F8]
  css/login.css [ninguém] · css/business-school.css [2d, PROIBIDO]
  js/api-client.js · js/app.js ........................................... [F0b]  núcleo; só acréscimos
  js/shell.js ............................................................ [F0s]  shell v2; só acréscimos ao contrato legado
  js/admin.js · js/parcerias-admin.js .................................... [F8]
  js/portal/*.js ......................................................... [por fatia, §6.2 e §8.1]
  js/vendor/qrcode-generator/{qrcode.js, LICENSE} ........................ [F0b]  MIT, SHA-256 registrado
  js/data.js · js/loja.js · js/eixo-3d.js · js/login/* · js/vendor/three/*  [ninguém]
  js/business-school.js .................................................. [2d, PROIBIDO]

server/
  src/server.js ............... PROIBIDO às fatias (principal: 3 pontos, §8.1) · src/db.js · src/config.js PROIBIDOS
  src/auth.js · src/throttle.js ............................................ [F0a] acréscimos (API §6.13)
  src/routes/auth.js ....................................................... [F0t] acréscimos (API §6.13)
  src/portal/{papeis,validacao,codigos,cripto,totp,csv,erros,config-portal}.js ............. [F0a] puros e erros
  src/portal/{montar,servicos,acesso,perfis-leitura,indices,auditoria,notificacoes,arquivos,
              email,limitador}.js ......................................................... [F0m] montagem e serviços
  src/portal/consentimentos-textos.js ...................................................... [F0t]
  src/portal/estudos/{video,repositorios,progresso}.js ..................................... [F1a]
  src/portal/avaliacoes/{avaliacao-motor,repositorios}.js .................................. [F2]
  src/portal/academico/{calculo-academico,servico-academico,repositorios}.js ............... [F3a]
  src/portal/certificacao/{declaracoes,repositorios}.js .................................... [F3b]
  src/portal/secretaria/{matriculas,repositorios}.js ....................................... [F4a]
  src/portal/documentacao/repositorios.js .................................................. [F4b] (D-78)
  src/portal/financeiro/  (pasta inteira) .................................................. [F5]
  src/portal/atendimento/protocolos.js · src/portal/ia/rag.js .............................. [F6a]
  src/portal/ia/{gemini,ferramentas,instrucao}.js .......................................... [F6b]
  src/portal/comunicacao/ (pasta inteira) .................................................. [F7]
  src/routes/portal/{auth-extra,perfil,meus-dados,cep,notificacoes,busca,auditoria,pendencias}.js
  src/routes/portal-equipe.js .............................................................. [F0t]
  src/routes/portal-conteudo.js · src/routes/{catalogo,progresso,materiais}.js ............. [F1a] (capas novas, D-56)
  src/routes/portal-avaliacoes.js .......................................................... [F2]
  src/routes/portal-{academico,encontros}.js · src/routes/lives.js ......................... [F3a]
  src/routes/portal-{cursos,declaracoes}.js · src/routes/certificados.js ................... [F3b]
  src/routes/portal-turmas.js · src/routes/liberacoes.js .................................. [F4a]
  src/routes/portal/{documentos,contratos}.js .............................................. [F4b]
  src/routes/portal/financeiro.js .......................................................... [F5]
  src/routes/portal/{atendimento,ouvidoria,configuracoes}.js ............................... [F6a]
  src/routes/portal/ia.js .................................................................. [F6b]
  src/routes/portal/{publicacoes,banners,relatorios}.js .................................... [F7]
  src/routes/portal-professor.js · src/routes/duvidas.js ................................... [F8]
  src/routes/{capas,contato,newsletter,parcerias,vitrine,bolsas}.js ........................ [ninguém]
  scripts/create-admin.js · scripts/seed-portal-qa.js ...................................... [F0m]
  scripts/migrar-materiais.js [F1a] · scripts/matriculas-de-liberacoes.js [F4a] · scripts/seed.js [ninguém]
  test/apoio/{banco-memoria,fixtures-portal,http,falsos}.js ................................ [F0a]
  test/portal-base-{papeis,util}.test.js [F0a] · test/portal-base-{indices,montagem,comuns,integracao}.test.js [F0m]
  test/portal-base-{auth,equipe,perfil,servicos}.test.js [F0t]
  test/estudos-* [F1a] · avaliacoes-* [F2] · academico-{calculo,rotas,encontros,comprovantes} [F3a]
  test/academico-{cursos,declaracoes,legado} [F3b] · secretaria-{matriculas,legado} [F4a] · secretaria-{documentos,contratos} [F4b]
  test/financeiro*.test.js [F5]
  test/atendimento-{protocolos,ouvidoria,config} [F6a] · atendimento-ia{,-config} [F6b] · comunicacao* [F7]
  test/professor-* [F8] · test/front-estatico.test.js [F0r] · test/servidor-erros.test.js [principal]

tests/
  e2e/_portal.js · portal-regressao-d5.spec.js · portal-ui.spec.js ........................ [F0b]  (_portal.js: PAGINAS, monitorarConsoleERede, confirmarNaTela, D-73, D-74, D-76)
  e2e/portal-shell.spec.js ................................................................ [F0s]  parte G0 (D-61)
  e2e/portal-titular.spec.js .............................................................. [F0p]  inclui os casos G1 do shell (D-61)
  e2e/portal-qualidade.spec.js · e2e/_qr.js ............................................... [F0r]
  e2e/portal-{estudos,avaliacoes,academico,declaracoes,secretaria,documentos,financeiro,atendimento,assistente,comunicacao,professor}.spec.js
                                                       [F1b · F2 · F3a · F3b · F4a · F4b · F5 · F6a · F6b · F7 · F8]
  e2e/portal-{titular,estudos,avaliacoes,academico,declaracoes,secretaria,documentos,financeiro,atendimento,assistente,comunicacao,professor}.paginas.js
                                                       [dona do spec de mesmo nome: F0p · F1b · F2 · F3a · F3b · F4a · F4b · F5 · F6a · F6b · F7 · F8] (D-74)
  fixtures/video-teste.mp4 ................................................................ [F1b]
  tools/versionar-ead.mjs · tools/cabecalho-ead.mjs · tools/contraste.mjs · tools/posse-ead.mjs  [F0r] (posse-ead: D-73)
  tools/conferir-posse.mjs · tools/conferir-matriz.mjs .................................... [principal] (D-58, D-59)
  server/* (inclui os provedores falsos e QA_SERVIDOR, D-41) · e2e/_site.js, specs do site e login-portal.spec.js [principal]
api/[...path].js [ninguém] · vercel.json · package.json · playwright.config.js · docs/dmc/* [principal]
```

`server/test/front-estatico.test.js` (F0r) é a guarda estática da UX §3 fase E: roda no `npm test` e falha com neon,
fontes antigas, `transition: all`, `font-weight` > 600, pílula `999px`, `bg-grid`, `glow-corner`, cor inline, emoji,
**`<script>` sem `src` e atributo `on*=`** em `plataforma-ead/**/*.{css,html,js}`. Exclusões, com o motivo escrito no
teste: os arquivos da 2d (`login.html`, `login-classico.html`, `css/business-school.css`, `js/business-school.js`),
`css/login.css`, `js/eixo-3d.js`, `js/login/*`, `js/vendor/*` e **os trechos entre marcadores** — `@dmc-root-legado`
e `@dmc-legado-login` em `plataforma.css`, `@dmc-compat` em `portal.css` (marcador sem par ou aninhado reprova).
Nenhuma exclusão usa número de linha. Os arquivos legados de outras fatias que ainda violam a guarda no G0 ficam na
lista `PENDENTES_FASE_1` do próprio teste (arquivo → fatia dona; regra em §8.3, D-46). O teste também usa
`POSSE` (caminho de `plataforma-ead/**` → fatia, copiado de §8.1 pela F0r; mudança de posse = pedido à F0r via
principal), que mora em `tests/tools/posse-ead.mjs` (F0r) para servir também ao `monitorarConsoleERede` do
`_portal.js` (D-73), e tem três modos (D-62): com `QA_FATIA=<fatia>` varre só os arquivos daquela fatia e reprova se algum deles
ainda está em `PENDENTES_FASE_1` (um arquivo novo de outra fatia, ainda em obra, não reprova a fatia que está rodando);
sem variável (G0 e integração de cada G1) varre tudo menos as entradas de `PENDENTES_FASE_1`; com `QA_ESTRITO=1` (G2)
varre tudo e reprova arquivo da plataforma sem dono em `POSSE`. `tests/tools/contraste.mjs` é promovido do rascunho
de UX (mede os contrastes e as distâncias ΔE_OK da UX §2.2–§2.3).

### 6.2 Páginas, módulos e CSS

Regra: uma página = um boot em `js/portal/<pagina>.js`, que termina com `DMC_Portal.iniciar(boot, opções)`; nenhum
`<script>` inline em página alguma (exceto as da 2d): os legados com boot inline (`index`, `loja`, `obrigado`,
`admin`) passam a `js/portal/boot-<pagina>.js` da fatia dona da página, e os que ganham módulo novo chamam o boot
dele. Um módulo expõe no máximo UM global `DMC_<Nome>` e só quando outra fatia precisa dele. `DMC_init` com
catálogo legado só nas páginas marcadas "sim".

| Página | `data-shell` | Módulos (`js/portal/`) | Global exposto | Papéis | Catálogo legado | CSS de domínio | Fatia |
|---|---|---|---|---|---|---|---|
| (todas) | — | `pre-pintura.js` (head, síncrono) · `ui.js` · `../shell.js` (+ `tour.js` sob demanda) · `qr.js` onde há documento | `DMC_UI`, `DMC_Portal`, `DMC_Shell`, `DMC_QR` | — | — | `portal.css` | F0b (`pre-pintura`, `ui`, `qr`) · F0s (`shell`, `tour`, `portal.css`) |
| `dashboard.html` | `inicio` (alias legado `conteudos`) | `estudos-dados.js`, `inicio.js` | `DMC_Estudos` | todos | sim | `portal-estudos.css` | F1b |
| `meus-cursos.html` | `meus-cursos` | `estudos-dados.js`, `meus-cursos.js` | — | todos | sim | idem | F1b |
| `aula.html` | `inicio` (modo foco) | `estudos-dados.js`, `video.js`, `avaliacao.js` (F2), `player.js` | `DMC_Video` | todos | sim | `portal-estudos.css` + `portal-avaliacao.css` | F1b (HTML) |
| `academico.html` | `academico` | `academico.js` | — | todos | não | `portal-academico.css` | F3a |
| `ao-vivo.html` | `ao-vivo` | `ao-vivo.js` (`DMC_bootAoVivo` vira apelido) | — | todos | não | idem | F3a |
| `comprovantes.html` | `comprovantes` | `comprovantes.js` (sem `qr.js`: código e hash por linha + URL de validação, D-16, D-72) | — | todos | não | idem | F3a |
| `certificados.html` | `certificados` | `declaracoes.js` (`DMC_bootCertificados` vira apelido) | — | todos | não | `portal-declaracoes.css` | F3b |
| `declaracao.html` | sem shell (titular ou admin) | `declaracao.js`, `qr.js` | — | titular, admin | não | idem | F3b |
| `certificado.html` | sem shell (pública, D5) | `declaracao.js` (modo certificado), `qr.js` | — | público | não | idem | F3b |
| `validar.html` | sem shell (pública) | `validar.js` | — | público | não | idem | F3b |
| `documentos.html` | `documentos` | `documentos.js` | — | todos | não | `portal-documentos.css` | F4b |
| `contratos.html` | `contratos` | `contratos.js` | — | todos | não | idem | F4b |
| `contrato.html` | `contratos` | `contrato.js`, `qr.js` | — | titular, admin | não | idem | F4b |
| `financeiro.html` | `financeiro` | `financeiro.js` | — | todos | não | `portal-financeiro.css` | F5 |
| `atendimentos.html` · `ouvidoria.html` | `atendimento` | `atendimentos.js` · `ouvidoria.js` | — | todos | não | `portal-atendimento.css`; subnavegação = `pf-subnav` de `portal.css` com o markup fixo de §7.10 (D-65) | F6a |
| `assistente.html` | `atendimento` | `assistente.js` | — | todos | não | `portal-assistente.css`; subnavegação = `pf-subnav` de `portal.css` com o markup fixo de §7.10 (D-65) | F6b |
| `regulamento.html` | — (sem item; entradas no rodapé, Tutoriais, Acadêmico e fontes do assistente) | `regulamento.js` | — | todos (inclusive equipe, no escopo dela) | não | `portal.css` (`pf-leitura`) | F6a |
| `publicacoes.html` · `publicacao.html` | `publicacoes` | `publicacoes.js` · `publicacao.js` (+ `video.js` da F1b) | — | todos (público-alvo) | não | `portal-comunicacao.css` | F7 |
| `perfil.html` | — (sem item) | `perfil.js`, `qr.js` (2FA) | — | todos (inclusive modo restrito) | não | `portal.css` | F0p |
| `meus-dados.html` · `notificacoes.html` · `busca.html` | — | `meus-dados.js` · `notificacoes.js` · `busca.js` | — | todos | não | `portal.css` | F0p |
| `acesso-link.html` | sem shell (pública) | `acesso-link.js` | — | público | não | `portal.css` | F0p |
| `index.html` | — | `boot-index.js` (redireciona por `next` válido ou `DMC_Auth.destinoInicial()`) | — | — | — | — | F0b |
| `tutoriais.html` | `tutoriais` | `tutoriais.js` | — | todos | não | `portal.css` | F0r |
| `loja.html` · `obrigado.html` | `loja` | `boot-loja.js` · `boot-obrigado.js` (chamam `DMC_bootLoja`/`DMC_bootObrigado` de `app.js`, cujo markup a F0b ajusta com as classes fixadas em D-69) | — | todos | sim | — | F0r |
| `professor.html` | `backoffice` (`data-pagina="professor"`) | `professor.js` (o único que chama `DMC_Professor.iniciar()`, D-66; passa `itens` ao `DMC_Portal.iniciar`, D-75); `avaliacao.js` (F2) **antes** de `prof-avaliacoes.js` (rota `#/avaliacoes/:id/previa`, `DMC_Avaliacao.montar({modo:'previa'})`); todos os `prof-*.js` de §6.3; `notificacoes.js`, `tutoriais.js`, `video.js`, `qr.js` | `DMC_Professor` | professor, admin | não | `portal-professor.css` + todos os `portal-*.css` | F8 |
| `admin.html` | `backoffice` (`data-shell-ativo="conteudo"`) | `../admin.js` (`DMC_bootAdmin`), `boot-admin.js` (passa `itens` ao `DMC_Portal.iniciar`, D-75), `professor.js` (só `MENU_ESTATICO`, sem roteador, D-66), `prof-conteudo.js` (só `DMC_PlanoEnsino`; registra rotas, mas nada é montado fora de `professor.html`) | — | professor, admin (DC-25 da UX; edição conforme §11 D-21) | sim | `portal-professor.css` + `portal-estudos.css` | F8 |
| `parcerias.html` | `backoffice` (`data-shell-ativo="parcerias"`) | `../parcerias-admin.js` (guarda própria: `#pa-restrito` e `login.html?next=parcerias.html`, D-48) + núcleo (`app.js`, `ui.js`, `shell.js`) + `professor.js` (`MENU_ESTATICO`, sem roteador, D-66); o shell do backoffice é montado só para admin, sem redirecionar ninguém, por `DMC_Shell.montar('parcerias', { area:'backoffice', itens: DMC_Professor.itensDoMenu('admin') })` chamado em `parcerias-admin.js` (D-75) | — | admin | não | `parcerias-admin.css` | F8 |

### 6.3 Rotas de `professor.html` → arquivo → fatia

Cada fatia registra as rotas do seu domínio (`DMC_Professor.registrar`, §7.8). As telas compostas por várias fatias
têm moldura da F8 e abas registradas com `pai` e `aba` (D-65): com `pai:'turmas/:id'`, `turmas/:id/alunos` (F8) e
`turmas/:id/frequencia|notas|encontros` (F3a); com `pai:'alunos/:userId'`, `alunos/:userId/academico` (F3a),
`…/matriculas` (F4a), `…/documentos|contratos` (F4b), `…/financeiro` (F5), `…/atendimentos` (F6a) e `…/cadastro` (F8).
`turmas/:id` e `alunos/:userId` sem aba levam à primeira aba visível ao papel. O roteamento só existe em
`professor.html` (D-66).

| Rotas (`#/…`) | Arquivo (`js/portal/`) | Fatia |
|---|---|---|
| `inicio` · `turmas` · `turmas/:id` · `turmas/:id/alunos` · `turmas/sem-turma` · `alunos` · `alunos/:userId` · `alunos/:userId/cadastro` · `duvidas` · `equipe` · `equipe/:userId` | `prof-visao.js` · `prof-turmas.js` · `prof-alunos.js` · `prof-duvidas.js` · `prof-equipe.js` | F8 |
| `cursos` · `cursos/:id/plano` | `prof-conteudo.js` (expõe `DMC_PlanoEnsino`) | F1b |
| `avaliacoes` · `avaliacoes/:id` · `avaliacoes/:id/configuracao\|questoes\|resultados` · `avaliacoes/:id/questoes/nova\|:qid` · `avaliacoes/:id/previa` · `correcao` · `correcao/:tentativaId` | `prof-avaliacoes.js` | F2 |
| `ao-vivo` · `ao-vivo/novo` · `ao-vivo/:encontroId` · `turmas/:id/frequencia\|notas\|encontros` · `alunos/:userId/academico` | `prof-academico.js` | F3a |
| `documentos/declaracoes` · `configuracoes/cursos` | `prof-certificacao.js` | F3b |
| `matriculas` · `matriculas/:id` · `turmas/nova` · `alunos/:userId/matriculas` | `prof-secretaria.js` | F4a |
| `documentos` · `documentos/:envioId` · `documentos/tipos` · `contratos` · `contratos/:id` · `alunos/:userId/documentos\|contratos` | `prof-documentos.js` (D-78) | F4b |
| `financeiro` · `financeiro/:lancamentoId` · `alunos/:userId/financeiro` | `prof-financeiro.js` | F5 |
| `atendimento` · `atendimento/:protocolo` · `ouvidoria` · `ouvidoria/:protocolo` · `alunos/:userId/atendimentos` · `configuracoes/regulamento\|privacidade\|instituicao` | `prof-atendimento.js` · `prof-configuracoes.js` | F6a |
| `configuracoes/ia` · `configuracoes/ia/uso` · `configuracoes/ia/trilha` | `prof-ia.js` | F6b |
| `publicacoes` · `publicacoes/nova` · `publicacoes/:id` · `banners` · `relatorios` · `relatorios/:painel` · `auditoria` | `prof-comunicacao.js` · `prof-relatorios.js` | F7 |
| `notificacoes` | `notificacoes.js` (montado como painel quando `DMC_Professor` existe) | F0p |
| `ajuda` · `ajuda/:guia` | `tutoriais.js` (idem) | F0r |

### 6.4 Cabeçalho e cascata (modelo único; detalhe em UX §2.1)

```html
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <script src="js/portal/pre-pintura.js?v=H"></script>           <!-- síncrono, PRIMEIRO; ajusta os 2 metas abaixo -->
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="color-scheme" content="dark">                       <!-- UM só; pre-pintura troca para "light" no claro -->
  <meta name="theme-color" content="#0b0c0e">                     <!-- UM só; pre-pintura troca para #f5f3ef no claro -->
  <title>{Tela} · Plataforma Complexo DMC</title>
  <link rel="icon" type="image/png" sizes="64x64" href="../assets/images/favicon-dmc.png">
  <link rel="apple-touch-icon" href="../assets/images/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..600&family=Newsreader:ital,opsz,wght@0,48,300;1,48,300&display=swap">
  <link rel="stylesheet" href="../assets/css/tokens.css?v=1">
  <link rel="stylesheet" href="../assets/css/components.css?v=3">
  <link rel="stylesheet" href="css/plataforma.css?v=H">
  <link rel="stylesheet" href="css/portal.css?v=H">
  <link rel="stylesheet" href="css/portal-{dominio}.css?v=H">     <!-- se houver -->
</head>
<body data-shell="{chave}" data-pagina="{chave}">
  <a class="dmc-skip" href="#conteudo">Pular para o conteúdo</a>
  <main id="conteudo" class="pf-main" tabindex="-1"> … markup mínimo + esqueleto + fallback sem JS (#pf-mapa) … </main>
  <script src="js/api-client.js?v=H"></script>
  <script src="js/app.js?v=H"></script>
  <script src="js/portal/ui.js?v=H"></script>
  <script src="js/shell.js?v=H"></script>
  <script src="js/portal/{dependência de outra fatia}.js?v=H"></script>
  <script src="js/portal/{pagina}.js?v=H"></script>               <!-- o boot mora aqui; nunca <script> inline -->
</body>
```

Regras: scripts no fim do `<body>`, sem `defer`; nenhum `<script>` de outra origem em página autenticada (o JWT
fica em `localStorage`); nenhum `<script>` inline nem `on*=` (CSP de §9.6); Google Fonts é só CSS (já usado pelo
site). Exatamente um `color-scheme` e um `theme-color` por página (UX §2.1 item 2). Páginas públicas (`validar`,
`certificado`, `acesso-link`) não carregam `shell.js` e nascem em papel. Cascata fixa: `tokens.css` →
`components.css` → `plataforma.css` (legado reskinado) → `portal.css` (vem depois de propósito: vence o `:root` neon
com a camada de compatibilidade da UX §3 fase A) → CSS do domínio.

### 6.5 Cache-busting `?v=`
- Valor = 8 primeiros hexadecimais do SHA-256 do conteúdo do arquivo; aplicado por `tests/tools/versionar-ead.mjs`
  (F0r escreve; a principal roda no G2). Nunca reescreve `login.html`/`login-classico.html`. `tokens.css?v=1` e
  `components.css?v=3` seguem o esquema do site.
- Fase 1: todas as fatias escrevem `?v=dev` (o servidor de QA responde `max-age=0, must-revalidate`).
- `tour.js` (carregado pelo `shell.js`) recebe o `?v=` por constante no `shell.js`, reescrita pelo mesmo script.
- Teste em `portal-qualidade.spec.js` (só no G2): todo `src`/`href` local das páginas da EAD (exceto 2d) com `?v=`
  igual ao hash atual e igual em todas as páginas. A principal informa à 2d os novos `?v=` de `api-client.js` e
  `app.js`.

---

## 7. Contratos JS globais (assinaturas exatas)

Contratos de servidor (módulos comuns, serviços com nome fixo, grupos de extensão, contrato de cada módulo de
rota e do agregador) estão em API §4 e §5 e não se repetem aqui. Abaixo, os globais do navegador.

### 7.0 Regras gerais
- Datas trafegam em ISO 8601 UTC; datas de calendário em `AAAA-MM-DD`; dinheiro em **centavos inteiros**; ids
  são strings; listas paginadas por `?pagina=&porPagina=` → `{itens, pagina, porPagina, total, totalPaginas}`;
  edição envia `versao` e trata 409 `conflito-versao` com [Recarregar]; erro `{error, codigo?, campos?}` com
  `codigo` em kebab-case (catálogo da API §1.4).
- Nenhum módulo monta HTML com dado sem `DMC_UI.html` (escape). Proibidos em código novo ou reescrito:
  `alert`, `confirm`, `prompt`, `onclick=` e qualquer `on*=` inline, `<script>` inline, `style=""` com cor,
  `console.log`, `innerHTML` com dado cru. O escape é a primeira defesa e a CSP aplicada (§9.6) a segunda: com o
  JWT em `localStorage`, um `innerHTML` esquecido seria tomada de conta (risco R7).
- Cada módulo guarda seus caminhos de API numa constante `API` no topo (um ajuste de rota muda um lugar só).
- Contrato publicado no fim da fase 0 não muda de assinatura; mudança = acréscimo opcional, pedido por escrito ao
  dono via principal.

### 7.1 `DMC_Api` (`js/api-client.js` · F0b) — estável + acréscimos

```js
// ESTÁVEIS (assinatura atual; o 4º/3º argumento é acréscimo opcional)
DMC_Api.get(caminho, opcoes?) → Promise<any>
DMC_Api.post(caminho, corpo = {}, opcoes?) → Promise<any>
DMC_Api.put(caminho, corpo = {}, opcoes?) → Promise<any>
DMC_Api.del(caminho, opcoes?) → Promise<any>                       // sem corpo (API DC-06)
DMC_Api.upload(caminho, arquivo, tipoConteudo?, opcoes?) → Promise<any>   // corpo cru (express.raw no servidor)
DMC_Api.blob(caminho, opcoes?) → Promise<Blob>                     // download autenticado por header
DMC_Api.token() → string|null
DMC_Api.setToken(token|null) → void
// opcoes = { silencioso404?: boolean,  // 404 resolve com null, sem lançar (endpoint de fatia ainda ausente)
//            sinal?: AbortSignal,
//            cabecalhos?: {[nome]: string} }   // ex.: {'X-Motivo': encodeURIComponent(motivo)} na substituição de contrato
// Erro lançado: Error { message /* = corpo.error, como hoje */, status, codigo?, campos?,
//                       requestId? /* corpo ou cabeçalho X-Request-Id, API §1.3 e §4.5 */, dados? /* corpo inteiro */ }
// 401 → setToken(null) (inalterado). Base: window.DMC_API_BASE || '/api'. Caminho '/api/...' vindo do servidor respeita a base.
```

### 7.2 `DMC_Auth` e `DMC_init` (`js/app.js` · F0b)

```js
// ESTÁVEIS — a 2d depende (login.html, login-classico.html, business-school.js)
DMC_Auth.init() → Promise<User|null>
DMC_Auth.isLogged() → boolean
DMC_Auth.user() → User|null
//   User = { id, email, nome /* nome de exibição: nome social se houver */, iniciais, isAdmin,
//            papel /* 'aluno'|'professor'|'admin'; ausente no servidor antigo → isAdmin ? 'admin' : 'aluno' */,
//            precisaTrocarSenha?, temFoto?, doisFatoresAtivo?, emailVerificado?, avisos? }
DMC_Auth.signIn(identificador /* e-mail OU CPF */, senha) → Promise<{token, user}>
//   2FA ativo: REJEITA com Error { message:'Digite o código do aplicativo autenticador.', codigo:'segundo-fator',
//   desafio, dados:{ segundoFator:true, desafio, expiraEm, metodos } } e NÃO grava token
DMC_Auth.signUp(email, senha, nome) → Promise<{token, user, session}>
DMC_Auth.signOut() → Promise<void>                                 // apaga só dmc:token
DMC_Auth.requireOrRedirect(to?) → boolean                          // sem sessão: to ?? 'login.html?next=<atual validado>'
DMC_Auth.requireAdminOrRedirect(to = 'dashboard.html') → boolean   // inalterado (professor também cai no `to`, §5.4)
window.DMC_bootLogin() → Promise<void>  // assinatura inalterada; comportamento novo só na §7.3 (login-classico.html)
window.DMC_init(opcoes?) → Promise<void>
//   DMC_init() = comportamento atual (sessão + catálogo + liberações + progresso)
//   DMC_init({ catalogo:false }) = só valida a sessão; memo por parte (uma 2ª chamada com catalogo:true carrega o que falta)
//   MODO RESTRITO (D-63): com user().precisaTrocarSenha === true, DMC_init (com ou sem catalogo) NÃO chama /api/catalogo,
//   /api/liberacoes/me nem /api/progresso e RESOLVE sem rejeitar (nunca redireciona: o login da 2d também o usa). Quem
//   redireciona é o DMC_Portal (§7.4) e, nas páginas legadas, cada boot de app.js (DMC_bootDashboard, DMC_bootPlayer,
//   DMC_bootMeusCursos, DMC_bootAoVivo, DMC_bootCertificados, DMC_bootLoja, DMC_bootObrigado), que logo depois do
//   DMC_init leva a perfil.html#seguranca sem desenhar nada (teste no portal-shell.spec.js com page.route, D-61).

// ACRÉSCIMOS (F0b, fase 0)
DMC_Auth.NEXT_RE                       // = /^[a-z0-9_-]+\.html(\?.*)?$/i  (a mesma regra do login da 2d)
DMC_Auth.validarNext(s) → string       // s se casar, senão ''
DMC_Auth.papel() → 'aluno'|'professor'|'admin'|null
DMC_Auth.temPapel(...papeis) → boolean // admin satisfaz qualquer papel
DMC_Auth.destinoInicial() → 'professor.html'|'admin.html'|'dashboard.html'
DMC_Auth.requireProfessorOrRedirect(to = 'dashboard.html') → boolean   // professor ou admin
DMC_Auth.recursos() → Promise<{ loginPorCpf, linkMagico, recuperacaoSenha, doisFatores, senhaTemporariaPelaCoordenacao }>
DMC_Auth.verificar2fa(desafio, codigo /* 6 dígitos ou 'XXXX-XXXX' */) → Promise<{token, user, codigosRestantes}>  // grava a sessão
DMC_Auth.pedirLinkMagico(email) → Promise<{ok, mensagem}>          // rejeita codigo 'email-indisponivel'
DMC_Auth.consumirLinkMagico(token) → Promise<{token, user}>        // pode rejeitar 'segundo-fator' | 'link-invalido'
DMC_Auth.esqueciSenha(email) → Promise<{ok, mensagem}>             // idem 'email-indisponivel'
DMC_Auth.redefinirSenha(token, novaSenha) → Promise<{ok}>          // não loga (leva ao login para não pular o 2FA)
DMC_Auth.trocarSenha(senhaAtual, novaSenha) → Promise<{ok}>        // regrava o token devolvido; derruba as outras sessões
```

### 7.3 Outros acréscimos fechados em `js/app.js` (F0b, fase 0)
- `DMC_Data.upsertAula(aula, moduloId)` passa a enviar `rotuloEncontro` quando a tela o carregou
  (`undefined` = não envia, mesmo cuidado do `roteiro`).
- `DMC_Data.atualizarMaterial(aulaId, materialId, {nome?, categoria?}) → Promise` (novo; usa o PUT legado de
  material, que passa a aceitar `categoria`, API §6.13); `renameMaterial(aulaId, materialId, nome)` continua.
- `DMC_Liberacoes.has(_email, cursoId)` (assinatura atual) passa a ser verdadeiro também com
  `curso.liberado === true` vindo do catálogo (professor docente, API §7.1); nada mais confia em `isAdmin` para
  professor.
- `DMC_Icons` ganha o conjunto da UX §4.12 (SVG próprio, viewBox 24, traço 1,5, `currentColor`), com as chaves:
  `navInicio, navMeusCursos, navAoVivo, navAcademico, navPublicacoes, navFinanceiro, navDocumentacao,
  navDocumentos, navDeclaracoes, navContratos, navComprovantes, navAtendimento, navTutoriais, navCursosDisponiveis,
  navVisaoGeral, navCursos, navTurmas, navAvaliacoes, navCorrecao, navDuvidas, navOuvidoria, navAlunos,
  navMatriculas, navEquipe, navRelatorios, navAuditoria, navConfig, navParcerias, navBanners, busca, sino, tema,
  fonteMenos, fonteMais, conta, sair, recolher, expandir, chevron, seta, fechar, check, estadoSucesso,
  estadoInfo, estadoAviso, estadoErro, estadoNeutro, play, video, pdf, slides, linkExterno, baixar, enviarArquivo,
  imprimir, qr, copiar, cadeado, calendario, relogio, enviar, anexo, mais, filtro, olho, escudo, telaCheia`; os 32
  ícones atuais mantêm os nomes e são redesenhados no mesmo traço.
- O `onclick=` inline do aside do player legado (`app.js:1019`) vira delegação de eventos (coberta pela regressão).
- `DMC_bootLogin` (usado só por `login-classico.html`, D-44): no modo de entrada aceita e-mail **ou** CPF (11
  dígitos, com ou sem máscara; o cadastro continua só com e-mail); destino = `next` válido ou
  `DMC_Auth.destinoInicial()`, também quando a página abre com sessão (hoje vai sempre a `dashboard.html`);
  rejeição `segundo-fator` → grava `dmc:aviso` e leva a `login.html?next=<next válido>`. Testes (D-61): destino por
  papel e entrada por e-mail no `portal-shell.spec.js` (G0); CPF e desvio do 2FA no `portal-titular.spec.js` (G1,
  depois da F0t); captura de `login-classico.html` idêntica em ambos.
- **Loja e obrigado** (D-69; markup gerado por `app.js`, páginas e estilo da F0r): `DMC_bootLoja` deixa de emitir
  `data-tilt`, `loja-card__shine` e o `attachTilt` (inclinação por `mousemove`) e troca o `style="opacity:.6"` da lista
  vazia de benefícios pela classe `loja-card__vazio`; o card mantém `loja-card`, `loja-card__pill` (modalidade) e
  `loja-card__stats` (carga), que a F0r reskina. `DMC_bootObrigado` mostra `#dev-pay-box` por `hidden = false` (o HTML
  da F0r nasce com `hidden`, sem `style`), escreve o resultado da simulação em `#dev-pay-status` com `className =
  'pf-alerta pf-alerta--sucesso'` ou `'pf-alerta pf-alerta--erro'` (sem `.style.*`, troca `app.js:1835-1837`) e o
  vazio "Nenhum curso recebido" como `pf-vazio` com link comum para `loja.html`. Ficam: `#cart-drawer`, `#cart-list`,
  `#cart-checkout`, `[data-cart-count]`, `#obrigado-list`, `[data-obrigado-total]`, `[data-obrigado-email]`,
  `#btn-dev-pay` (R10).
- **Pedido da loja** (API §6.9 item 4, DC-69; nomes e caminho do 404 por D-79): o envio do formulário de checkout em
  `DMC_bootLoja` chama `DMC_Api.post('/portal/me/pedidos', { cursoIds }, { silencioso404:true })` só com os ids do
  carrinho (nunca preço, título ou total), com o botão ocupado ("Registrando pedido…"). 201/200 → `Carrinho.clear()` e
  `obrigado.html?protocolo=<ATD>` (mais `&existente=1` quando `reaproveitado:true`); 409 `ja-liberado` → tira do
  carrinho os `cursoIds` devolvidos e mostra o alerta na gaveta; 400 (`campos.cursoIds`) → idem para os cursos
  recusados; 429 e 503 → alerta com a mensagem do servidor, carrinho mantido, sem navegar; **404** (F5 ainda não
  montada) → o caminho legado de hoje (`obrigado.html?cursos=&email=&total=`), para a D5 continuar verde (R10).
  `DMC_bootObrigado` usa `?protocolo=` só se casar com o regex ATD da API §1.5 e lê itens e total de
  `GET /portal/me/atendimentos/:protocolo` (`pedido`, F6a, com `silencioso404`), nunca da query; sem protocolo válido
  (inclusive o endereço legado do 404), mostra o texto honesto "Seu pedido ainda não foi registrado. Para concluir,
  fale com a equipe pelo Atendimento." com a lista dos cursos da query (como hoje) e o atalho
  `atendimentos.html?novo=1&categoria=financeiro`, e esvazia o carrinho como hoje. O texto "enviado ao administrativo",
  e-mail em 1 dia útil e Mercado Pago saem (UX §6.19).
- `Carrinho._notify` continua disparando `dmc:carrinho:change` em `window` (legado; §7.9).
- Fase 2 (F0b-final): `DMC_bootDashboard`, `DMC_bootPlayer`, `DMC_bootMeusCursos`, `DMC_bootAoVivo` e
  `DMC_bootCertificados` viram apelidos dos boots novos e o código morto sai, com prova por `grep` no PR.
  `DMC_bootLogin`, `DMC_bootLoja`, `DMC_bootObrigado`, `DMC_bootCertificadoPublico` e `DMC_bindHeader` ficam. O bloco
  `@dmc-compat` de `portal.css` sai na F0s-final, também com prova por `grep`.

### 7.4 `DMC_Portal` (`js/portal/ui.js` · F0b) — boot padrão das páginas novas

```js
DMC_Portal.iniciar(boot, {
  pagina,                              // chave do item ativo do menu (= body[data-shell])
  papeis = ['aluno','professor','admin'],
  catalogo = false,                    // true só onde se usam DMC_Data/DMC_Progress legados
  modo = 'padrao',                     // 'padrao' | 'foco' (player) | 'publica' (sem shell e sem guarda)
  area = 'aluno',                      // 'aluno' | 'backoffice'
  itens                                // D-75: array | (ctx) => array; só no backoffice. A função é chamada DEPOIS da guarda
                                       //   de papel, com o ctx parcial { user, papel }, e o resultado vai como está ao
                                       //   DMC_Shell.montar({ itens }) (o contrato do DMC_Shell não muda)
}) → Promise<void>
// boot(ctx), ctx = { user, papel, params: URLSearchParams, main: HTMLElement, sinal: AbortSignal, restrito: boolean }
// Ordem (D-63): DMC_Auth.init() → modo restrito (abaixo), ANTES de qualquer outra chamada → DMC_init({catalogo})
//        (que no modo restrito não carrega nada, §7.2) → guarda do papel (§5.4) → DMC_Shell.montar(pagina, {modo, area,
//        restrito, itens}) → boot(ctx) em try.
// Erro não tratado → DMC_UI.erroCarga(main, err, {tentarDeNovo}) + console.error('[DMC]', err) (só falha real).
// MODO RESTRITO (user().precisaTrocarSenha === true, ou 403 'troca-de-senha-obrigatoria' em qualquer chamada):
//   fora de perfil.html → location para perfil.html#seguranca, SEM rodar o boot; em perfil.html → NÃO redireciona
//   (sem laço) e roda o boot com ctx.restrito = true (perfil.js desenha só "Crie uma senha pessoal para continuar" e
//   não chama GET /portal/me/perfil nem GET /api/auth/2fa). Critério: 0 requisição 4xx no fluxo (UX §5).
// 401 → login.html?next=<atual validado>. Rascunho em sessionStorage (dmc:rascunho:<pagina>) SÓ em formulário marcado
//   com data-pf-rascunho, e nunca: campo type=password, autocomplete one-time-code, campo com autocomplete de dado
//   pessoal (name, given-name, family-name, email, tel, bday*, street-address, address-line*, postal-code, country*)
//   nem nas páginas/fluxos perfil, meus-dados, contrato (assinatura), Perfil › Senha e segurança e assistente (D-47).
// O sinal é abortado no 'pagehide'.
```

### 7.5 `DMC_UI` (`js/portal/ui.js` · F0b)

```js
// HTML seguro
DMC_UI.html`<p>${valor}</p>` → string           // interpolação escapada; arrays concatenam
DMC_UI.cru(htmlConfiavel) → {__cru: string}     // só markup estático e ícones de DMC_Icons
DMC_UI.esc(valor) → string                      // = DMC_escapeHtml
DMC_UI.icone(chave, {rotulo} = {}) → string     // aria-hidden; com rótulo: role="img" + aria-label

// Retorno ao usuário (UX DC-10)
DMC_UI.toast(mensagem, {tipo = 'info' /*'sucesso'|'aviso'|'erro'|'info'*/, duracaoMs = 6000,
                        acao /* {rotulo, aoClicar} */} = {}) → void
  // pausa no hover e no foco; tipo 'erro' não some sozinho (role=alert); demais role=status; máx. 3 empilhados;
  // com `acao`, `duracaoMs` é IGNORADO e o toast só sai por ação ou fechamento (WCAG 2.2.1, UX DC-10)
DMC_UI.anunciar(texto, {assertivo = false} = {}) → void
DMC_UI.confirmar({titulo, texto, rotuloConfirmar = 'Confirmar', rotuloCancelar = 'Cancelar', perigo = false,
                  motivo = false /* campo "Motivo (fica registrado na auditoria)", 10–500 */,
                  exigirTexto /* string a digitar */,
                  reautenticar = false, enviar /* acréscimo D-57, abaixo */}) → Promise<false | true | {motivo} | resultado>
                  // foco inicial em Cancelar; o botão de confirmar leva SEMPRE data-pf-acao="confirmar" e o de cancelar
                  // data-pf-acao="cancelar" (gancho estável da D5, D-76; entregue no S3)
DMC_UI.dialogo({titulo, conteudo /* string de DMC_UI.html | Node */, acoes /* [{rotulo, valor, tipo:'primario'|'secundario'|'perigo'}] */,
                largura = 'm' /*'p'|'m'|'g'*/, aoAbrir}) → Promise<valor|null>   // <dialog> + showModal(); < 30em vira folha inferior
DMC_UI.formulario({titulo, descricao, campos: [{nome, rotulo, tipo /* text|email|url|number|date|datetime-local|
                   textarea|select|checkbox|file|password */, obrigatorio, valor, opcoes, ajuda, max, aceitar}],
                   rotuloEnviar = 'Salvar', validar /* (valores) => {[campo]: msg}|null */,
                   reautenticar = false, enviar /* acréscimo D-57 */}) → Promise<valores | resultado | null>

// Reautenticação da coordenação (acréscimo D-57 ao D-34; UX DC-38 e §4.8; API §6.1 "Reautenticação da coordenação")
DMC_UI.reautenticar({ titulo = 'Confirme sua identidade', texto = 'Por segurança, esta ação pede a sua senha.',
                      rotuloConfirmar /* verbo da ação, ex. 'Salvar chave' */,
                      enviar /* (reautenticacao: { senha, codigo? }) => Promise<resultado> */ }) → Promise<resultado | null>
  // ação SEM diálogo próprio (salvar e remover a chave do Gemini): abre pf-dialogo--p com o fieldset pf-reautenticacao.
  // Ação COM diálogo (motivo): DMC_UI.confirmar/formulario({ …, reautenticar:true, enviar }) põem o MESMO fieldset no fim
  //   do próprio diálogo, depois do motivo (nunca dois diálogos empilhados); enviar recebe (valores, reautenticacao).
  // Campos: "Senha atual" (current-password, pf-senha) e, quando DMC_Auth.user().doisFatoresAtivo, "Código do aplicativo"
  //   (6 dígitos, inputmode numeric, one-time-code, colar permitido). O objeto vai no corpo da requisição como
  //   `reautenticacao`. O botão da ação só habilita com a senha preenchida; Enter confirma; null = cancelado.
  // O diálogo fica ABERTO durante enviar(): 400 campos.senha → "Senha incorreta." e 400 campos.codigo → "Código inválido."
  //   no campo, o resto do que foi digitado preservado; 429 muitas-tentativas → fecha, pf-toast--erro com a mensagem do
  //   servidor + "Por segurança, sua sessão foi encerrada. Entre de novo." (o 401 seguinte leva ao login); outro erro →
  //   pf-alerta--erro dentro do diálogo. Senha e código nunca vão a rascunho (D-47), toast, log ou URL; campos limpos ao
  //   fechar.

// Consentimento (acréscimo D-57; UX DC-39 e §4.3; CSS pf-consentimento da F0s)
DMC_UI.consentimento(el, { texto, versaoTexto /* LITERAIS do servidor: renderizados como texto em pf-leitura, nunca
                                                 reescritos, resumidos nem cortados */,
                           registro = null /* { em, versaoTexto } vigente → "Autorizado em dd/mm/aaaa · versão v1" */,
                           modo = 'caixa' /* 'caixa': pf-check que vai no MESMO envio do formulário (nome social, redes,
                                             gênero, etnia) | 'botoes': aceite avulso (foto, assistente) */,
                           rotulos = {} /* { caixa:'Concordo com este uso', aceitar, recusar, retirar } */,
                           aoAceitar, aoRecusar, aoRetirar /* () => Promise; o componente cuida de aria-busy e erro */ })
  → { aceite(): { aceito:true, versaoTexto } | null,   // modo 'caixa': o que vai em consentimentos.<finalidade>
      exigir({ texto, versaoTexto }): void,            // 428 consentimento-necessario: reabre com o texto novo e foco nele
      destruir(): void }

// Estados de tela
DMC_UI.esqueleto(el, {tipo = 'lista' /*'lista'|'cards'|'tabela'|'texto'|'heroi'*/, linhas = 3}) → void   // aria-busy
DMC_UI.estadoVazio(el, {icone, titulo, texto, acao /* {rotulo, href} | {rotulo, aoClicar} */}) → HTMLElement
DMC_UI.erroCarga(el, erro, {tentarDeNovo} = {}) → HTMLElement   // pf-alerta--erro + código recolhido
DMC_UI.ocupado(botao, ocupado, rotuloOcupado?) → void           // disabled + aria-busy; 10 s → "Ainda processando…"
DMC_UI.alerta(el, {tom /*'info'|'sucesso'|'aviso'|'erro'*/, titulo, texto, acao, compacto = false}) → HTMLElement

// Componentes
DMC_UI.estado(rotulo, tom = 'neutro' /*'sucesso'|'aviso'|'erro'|'info'|'neutro'*/, {destaque = false} = {}) → string
  // marcador pf-estado: glifo próprio por tom + texto; DMC_UI.chip = apelido
DMC_UI.tabela(el, { legenda /* <caption> obrigatório */,
  colunas: [{chave, rotulo, tipo = 'texto' /*'texto'|'numero'|'moeda'|'data'|'dataHora'|'status'|'acao'*/,
             render /* (linha) => string de DMC_UI.html */, ordenavel = false, secundaria = false}],
  linhas, chaveLinha, vazio /* {titulo, texto, acao} */, aoClicarLinha, selecao /* {acoes:[{rotulo, aoClicar(ids)}]} */,
  paginacao /* {mostrando, total, carregarMais()} */ }) → {atualizar(linhas, paginacao?): void, destruir(): void}
  // empilhada quando o contêiner pf-main < 44em; colunas 'secundaria' somem entre 44em e 64em; nunca rola na horizontal
DMC_UI.abas(el, {abas: [{id, rotulo, contador}], ativa, aoTrocar, hash = false}) → {ativar(id): void}
DMC_UI.filtros(el, {rotulo, opcoes: [{valor, rotulo, contador}], valor, aoMudar}) → {definir(valor): void}
  // pf-segmento (aria-pressed); < 30em: até 4 opções em 2×2, mais que isso vira <select> "Mostrar"
DMC_UI.kpis(el, [{rotulo, valor /* string formatada ou null → '—' */, nota, tom, href}]) → void
DMC_UI.donut(el, {pct, rotulo}) → void
DMC_UI.progresso(pct, {rotulo}) → string        // role=progressbar + texto visível
DMC_UI.barras(el, {legenda, linhas: [{rotulo, valor, texto}]}) → void   // sobre <table> real
DMC_UI.codigo(valor, {curto = false} = {}) → string                   // pf-codigo com [Copiar]
DMC_UI.imagemProtegida(img, caminhoApi) → Promise<void>               // foto privada via blob

// Arquivos
DMC_UI.baixar(caminhoApi, nomeArquivo) → Promise<void>  // blob refeito como application/octet-stream + <a download>
DMC_UI.abrirArquivo(caminhoApi, {nome}) → Promise<void>
  // D-47: o tipo é REFEITO no cliente pelos bytes (new Blob([buf], {type})), nunca copiado do Content-Type; só abre
  // em aba nova (aberta no gesto, troca para blob:) quando o tipo é application/pdf, image/jpeg, image/png ou
  // image/webp; qualquer outro tipo, ou aba bloqueada, vai para baixar(). Motivo: a página blob: herda a origem do
  // portal (com acesso ao localStorage do JWT) e não recebe o CSP sandbox do servidor.
DMC_UI.upload({titulo, formatos /* ['pdf','jpg','png'] */, maxBytes, avisoBaseLegal, enviar /* (File) => Promise */}) → Promise<resultado|null>
DMC_UI.carregarScript(src) → Promise<void>               // memoizado; só mesma origem (uso do shell)

// Formatação e validação (pt-BR, America/Sao_Paulo)
DMC_UI.fmt.data(iso, estilo = 'curta' /*'curta'|'longa'*/) · .dataHora(iso) · .hora(iso) · .relativo(iso)
DMC_UI.fmt.moeda(centavos) · .reais(numero) · .cpf(s) · .cpfMascarado(s) /* ***.456.789-** */ · .cep(s) · .telefone(s)
DMC_UI.fmt.bytes(n) · .numero(n, casas = 0) · .pct(n, casas = 0) · .nota(n) /* '7,5' */ · .duracao(minutos) · .horas(n) /* '42 h' */
DMC_UI.valida.cpf(s) · .email(s) · .cep(s) → boolean    // o mesmo algoritmo do servidor
DMC_UI.mascara(input, 'cpf'|'cep'|'telefone'|'data'|'moeda') → void   // aceita colar; só dígitos
```

### 7.6 `DMC_Shell` (`js/shell.js` · F0s)

```js
DMC_Shell.montar(ativo, { modo = 'padrao' /*'padrao'|'foco'*/, area = 'aluno' /*'aluno'|'backoffice'*/,
                          papel = DMC_Auth.papel(), itens /* backoffice: DMC_Professor.MENU_ESTATICO */,
                          restrito = !!DMC_Auth.user()?.precisaTrocarSenha } = {}) → void
  // idempotente; DMC_Shell.montar(ativo) legado continua válido; mantém no <body> has-shell, menu-recolhido,
  // menu-aberto e as variáveis --shell-top-h/--shell-side-w/--shell-side-w-min com os valores novos
DMC_Shell.definirAtivo(chave) → void
DMC_Shell.definirContador(chaveItem, n /* number|null; 0 ou null some */) → void
DMC_Shell.definirPendencia(chaveItem, temPendencia) → void      // ponto de aviso (UX §5.5)
DMC_Shell.notificacoes.atualizar() → Promise<number|null>       // GET /portal/me/notificacoes/resumo
DMC_Shell.notificacoes.abrir() → void ; .fechar() → void
DMC_Shell.tema.obter() → 'escuro'|'claro'|'auto' ; .definir(tema) → void ; .alternar() → void
DMC_Shell.fonte.obter() → -1|0|1|2 ; .definir(n) → void ; .aumentar() → void ; .diminuir() → void
DMC_Shell.busca.abrir({termo, tipo} = {}) → void                // GET /portal/busca
DMC_Shell.banner.atualizar() → Promise<void>   // 1) GET /portal/me/pendencias (avisos não dispensáveis) 2) "Conheça o novo portal"
                                               // 3) GET /portal/banners?local=topo — 404 = silêncio
DMC_Shell.banner.dispensar(id) → void          // só os dispensáveis; grava dmc:banner:<id>:dispensado
DMC_Shell.tour.iniciar(chave = 'primeiro-acesso') → Promise<void> ; .jaVisto(chave) → boolean
```
Comportamento: menus por papel da UX §5.3 (aluno) e §5.4 (professor, coordenação); topo, faixa, sino, conta,
gaveta, modo foco e tour como na UX §5. No backoffice, `itens` chega JÁ filtrado pela F8 (papel e, em `professor.html`,
rota registrada; fora dela, links `professor.html#/<rota>` filtrados só por papel, D-66), repassado pelo
`DMC_Portal.iniciar({ itens })` (D-75) ou, em `parcerias.html`, pela chamada direta de `parcerias-admin.js`: o
`DMC_Shell` só desenha o que recebe, sem conhecer rota nem papel. **Sem `DMC_UI`** (página legada antes de o cabeçalho trocar, ou `ui.js` com
defeito), o shell v2 não lança: desenha o topo e o menu com escape próprio mínimo e deixa de lado busca, sino e faixa
(D-60). **Modo restrito** (`restrito:true`, UX §5): o shell monta só o topo com a
marca e [Sair] — sem lateral, busca, sino, faixa, pendências, banners nem tour — e não faz NENHUMA chamada (nem
notificações, banners, pendências, busca, `GET /portal/configuracoes/publicas` ou foto: avatar por iniciais); tema e
A−/A+ continuam (são locais). O markup do shell v2 mantém `[data-cart-count]` na página da loja para o
`bindHeader` legado.

### 7.7 Globais de domínio (expostos porque outra página ou fatia usa)

```js
// F1b · js/portal/video.js — usado pelo player e por publicacoes/publicacao (F7)
DMC_Video.montar(el, video /* aula.video ou publicacao.video da API: {provedor:'youtube'|'vimeo'|'arquivo'|'externo',
                 id, hash, inicioSeg, src, medivel} */, { titulo, codigo,
                 aoProgresso /* (pct 0..100, posicaoSeg, duracaoSeg, fonte:'nativo'|'youtube'|'vimeo') => void */ } = {})
  → { destruir(): void, pct(): number }
  // iframe por DOM API (nunca innerHTML com URL); 'externo' vira link "Abrir vídeo em nova aba" (nunca iframe);
  // % por postMessage sem script do provedor, conferindo event.origin e event.source; falha → só o botão manual

// F1b · js/portal/estudos-dados.js — compartilhado pelas páginas da F1b (Início, Meus cursos, player); rotas da F1a
DMC_Estudos.meusCursos() → Promise<MeusCursos>                   // GET /portal/me/cursos (+ curso.capaVerticalUrl, D-56)
DMC_Estudos.trilha(cursoId) → Promise<Trilha>                    // GET /portal/cursos/:cursoId/trilha (+ modulos[].capaUrl, D-56)
DMC_Estudos.progresso(cursoId) → Promise<ProgressoCurso>         // GET /portal/cursos/:cursoId/progresso
DMC_Estudos.conteudo(moduloId) → Promise<Conteudo>               // GET /portal/modulos/:moduloId/conteudo
DMC_Estudos.assistido(aulaId, {posicaoSeg, duracaoSeg, pct, fonte}) → Promise<{aulaId, pctMax, concluida, concluidaEm, frequencia}>
DMC_Estudos.feito(chave /* 'plano:<moduloId>' | 'material:<matId>' de link */) → Promise<{chave, feitoEm}>
DMC_Estudos.concluirAula(aulaId, concluida) → Promise<void>      // PUT/DELETE /api/progresso/:aulaId (legado)

// F1b · js/portal/prof-conteudo.js — embutido pela F8 no admin.html (UX DC-24)
DMC_PlanoEnsino.montar(el, {cursoId, moduloId, somenteLeitura = false}) → Promise<{destruir(): void}>
  // lê GET /portal/professor/cursos/:cursoId/planos; grava PUT /portal/professor/modulos/:moduloId/plano no blur;
  // PlanoEnsino estruturado (API §3.2, DC-61): Objetivos (um por linha), Bibliografia em DOIS campos (Básica e
  // Complementar, uma referência por linha), Cronograma em linhas Encontro · Data · Tema; limites visíveis (30
  // objetivos, 50 referências por grupo, 60 linhas); [Montar a partir das aulas gravadas] usa `aulas` de `planos` (D-53)

// F2 · js/portal/avaliacao.js — montado pelo player da F1
DMC_Avaliacao.montar(el, {avaliacaoId, cursoId, moduloId, modo = 'aluno' /*'aluno'|'previa'*/}) → Promise<{destruir(): void}>
  // estados Apresentação → Em andamento → Revisão → Resultado → Gabarito (UX §6.4); o player NÃO calcula nota nem
  // situação e não chama a API de avaliação: só reage ao evento e relê o Conteudo

// F0b · js/portal/qr.js
DMC_QR.svg(texto, {tamanho = 128, margem = 4, nivel = 'M'} = {}) → string     // SVG com <title>
  // margem em módulos; padrão 4 = zona de silêncio da ISO/IEC 18004 (o QR de 28 mm do rodapé impresso fica junto de
  // código, hash e fio); fundo branco do próprio SVG, também no tema escuro
```

### 7.8 `DMC_Professor` (`js/portal/professor.js` · F8)

```js
DMC_Professor.registrar({
  rota,              // padrão sem '#/', ex.: 'correcao/:tentativaId' (tabela §6.3)
  titulo,            // vira o H1 e o document.title "<Seção> · Portal do Professor · Plataforma Complexo DMC" ("Coordenação" para admin)
  papeis,            // ['professor','admin'] | ['admin']
  montar(el, ctx),   // → void | {destruir()} | Promise<idem>
  resumo,            // opcional: (ctx) => Promise<{valor: number|null, rotulo, rota, tom?}> — KPI da Visão geral
  pai,               // opcional (D-65): 'alunos/:userId' | 'turmas/:id' — a rota é uma ABA dentro da moldura da F8
  aba                // obrigatório com `pai`: chave de abasDoAluno / abasDaTurma
}) → void
// ctx = { user, papel, rota, params, filtros: URLSearchParams, cursos: [{id, titulo, sigla}] /* do professor; admin = todos */,
//         navegar(rota, filtros?), definirTitulo(texto), api: DMC_Api, ui: DMC_UI, sinal: AbortSignal,
//         // só em rota com pai (D-65):
//         aluno /* pai 'alunos/:userId': { id, nome, nomeSocial, fotoUrl, email }, de GET /portal/professor/alunos/:userId/resumo */,
//         matriculaId /* matrícula escolhida no seletor do cabeçalho do aluno; null sem matrícula. O seletor vem de
//                        GET /portal/professor/alunos/:userId/matriculas (API §6.12, DC-73), buscado pela F8 UMA vez junto do
//                        resumo, vigentes primeiro; `semMatricula` (liberação ainda não materializada) vira aviso no
//                        cabeçalho "Liberação ainda sem matrícula", nunca matrícula criada pela leitura */,
//         turma /* pai 'turmas/:id': { id, codigo, cursoId } */ }
DMC_Professor.iniciar() → void   // D-66: começa o roteamento; chamado SÓ por professor.js, e só com body[data-pagina="professor"]
DMC_Professor.navegar(rota, filtros?) → void
DMC_Professor.MENU_ESTATICO   // [{rota, rotulo, grupo: null|'ensino'|'secretaria'|'relacionamento'|'gestao', icone, ordem, papeis, href?}]
                              // = menus da UX §5.4 (professor e coordenação); usado também por admin.html e parcerias.html
DMC_Professor.itensDoMenu(papel) → itens   // D-66: o que vai em DMC_Shell.montar({itens}); em professor.html filtra por papel
                                           // E rota registrada; fora dele, só por papel, com href 'professor.html#/<rota>'.
                                           // D-75: professor.js e boot-admin.js passam DMC_Portal.iniciar(boot, { …,
                                           // area:'backoffice', itens: ({ papel }) => DMC_Professor.itensDoMenu(papel) });
                                           // parcerias-admin.js chama DMC_Shell.montar direto (guarda própria, D-48)
DMC_Professor.abasDaTurma     // ['alunos','frequencia','notas','encontros']
DMC_Professor.abasDoAluno     // ['academico','matriculas','documentos','contratos','financeiro','atendimentos','cadastro']
```
- O menu do backoffice é **estático** (`MENU_ESTATICO`, rótulos e grupos da UX §5.4); `registrar` só registra
  rotas. **Quem filtra é a F8** (`itensDoMenu`, D-66): em `professor.html`, item cuja rota não está registrada ou cujo
  papel não permite não aparece; em `admin.html` e `parcerias.html`, que não carregam os `prof-*.js` (salvo
  `prof-conteudo.js` no `admin.html`), os itens viram links `professor.html#/<rota>` filtrados só por papel. O
  `DMC_Shell` só desenha o que recebe (§7.6). Contagens do menu vêm de uma chamada: `GET /portal/professor/resumo`
  (professor; inclui `ouvidoriaSemParecer`, D-54) ou `GET /portal/admin/relatorios/painel` (admin).
- **Roteador** (D-66): os `prof-*.js` só chamam `registrar` ao carregar. O roteamento começa SÓ quando `professor.js`
  chama `DMC_Professor.iniciar()` no `DOMContentLoaded`, e ele só chama com `body[data-pagina="professor"]`; em
  `admin.html` e `parcerias.html` nenhum hash é reescrito e nenhuma tela é montada (o `#lives-pane` e afins do editor
  legado continuam funcionando). Hash desconhecido → `#/inicio` sem toast; papel insuficiente → "Área da
  coordenação"; troca de rota: `destruir()` do anterior, aborta o `sinal`, rolagem ao topo, foco no H1
  (`tabindex="-1"`), anúncio em região viva, `DMC_Shell.definirAtivo`, fade de 160 ms só em opacidade.
- **Moldura das telas compostas** (D-65): rota registrada com `pai` não desenha H1 nem abas. A F8 desenha a moldura —
  em `alunos/:userId`, o cabeçalho do aluno da UX §7.5 (foto ou iniciais, nome de exibição, e-mail, matrícula e o
  `select` "Matrícula" quando há mais de uma); em `turmas/:id`, o cabeçalho da turma da UX §7.4 — e a barra
  `pf-abas` com as abas visíveis = `abasDoAluno`/`abasDaTurma` ∩ rotas registradas ∩ papel, na ordem dessas listas e
  com o `titulo` de cada rota como rótulo. Depois chama `montar(el, ctx)` com `el` = o painel da aba (`pf-abas__painel`,
  `role="tabpanel"`) e o `ctx` acima. Trocar de aba = trocar de rota (hash); trocar a matrícula no seletor =
  `destruir()` + `montar` de novo com o novo `ctx.matriculaId`. Os dados do cabeçalho são buscados UMA vez pela F8 e
  passados no `ctx` (a aba não repete a chamada).

### 7.9 Eventos e armazenamento local
- Eventos em `document` (`CustomEvent`): `dmc:tema` {tema} · `dmc:fonte` {nivel} · `dmc:notificacoes`
  {naoLidas} · `dmc:progresso` {cursoId, moduloId, chave, feito} (F1b) · `dmc:avaliacao` {avaliacaoId, moduloId,
  tipo, situacao, feito, nota} (F2) · `dmc:painel` {rota} (F8).
- Evento LEGADO em `window` (não em `document`): `dmc:carrinho:change`, disparado por `Carrinho._notify` e ouvido
  pelo `bindHeader` e pela gaveta da loja (`app.js` l. 502, 1767, 1866). Ouvinte novo (o carrinho do shell v2)
  escuta em `window`; o evento não muda de alvo (D5).
- `localStorage` (todas com prefixo `dmc:`): existentes `token`, `cursoEscolhido`, `carrinho`, `menuRecolhido`;
  novas `tema`, `fonte`, `banner:<id>:dispensado`, `tour:<chave>:<userId>`, `aoVivo:visao`, `correcaoCega`.
  `sessionStorage`: `dmc:aviso` (toast depois de redirecionar), `dmc:rascunho:<pagina>` (restauração depois de
  401, só nos formulários marcados e sem os campos excluídos de §7.4). Nada de dado pessoal, senha, código de
  verificação nem termo de busca em armazenamento local; `signOut` apaga só o token.

### 7.10 Markup fixo compartilhado entre fatias

Quando duas fatias escrevem o mesmo trecho de HTML, o texto abaixo é o contrato (mudança = pedido às duas via
principal):
- **Subnavegação do Atendimento** (D-65; UX §6.12; CSS `pf-subnav` do catálogo, em `portal.css` da F0s): igual em
  `atendimentos.html`, `ouvidoria.html` (F6a) e `assistente.html` (F6b), estático no HTML (funciona sem JS), com
  `aria-current="page"` só no link da página atual. Nenhuma das duas fatias estiliza a subnavegação no próprio CSS.
  ```html
  <nav class="pf-subnav" aria-label="Atendimento">
    <a class="pf-subnav__link" href="assistente.html">Assistente</a>
    <a class="pf-subnav__link" href="atendimentos.html">Seus atendimentos</a>
    <a class="pf-subnav__link" href="ouvidoria.html">Ouvidoria</a>
  </nav>
  ```
- **Loja e obrigado** (D-69, D-79): classes e ids de §7.3 (F0b gera, F0r estiliza e escreve o HTML estático); o bloco
  de alerta da gaveta é `<div class="pf-alerta" id="cart-alerta" role="status" hidden>` (F0r escreve, F0b preenche) e
  o texto honesto do obrigado sem protocolo fica em `<section id="obrigado-sem-pedido" hidden>` (idem).
- **Moldura do backoffice** (D-65): o painel da aba é sempre `<section class="pf-abas__painel" role="tabpanel"
  aria-labelledby="<id da aba>">`, criado pela F8; a sub-rota escreve só dentro dele.

---

## 8. Fatias, posse exclusiva, ordem e critérios de pronto

### 8.1 Tabela de posse (arquivo → fatia)

Regra: **cada arquivo tem um único dono durante todo o trabalho** (não há transferência de posse entre fases).
Caminhos de front relativos a `complexodmc.com.br/plataforma-ead/`; os demais, à raiz do repositório. Na primeira
revisão (D-37), quatro fatias grandes demais para um agente foram divididas sem mudar nenhum contrato: **F0a** → F0a
+ **F0t** (titular e equipe, fase 1); **F0b** → F0b + **F0r** (reskin e qualidade visual); **F3** → **F3a**
(acadêmico e frequência) + **F3b** (certificação); **F6** → **F6a** (atendimento, ouvidoria, configurações e
regulamento) + **F6b** (assistente de IA). Na segunda (D-59), três de novo, também sem mudar contrato: **F0a** →
**F0a** (puros, erros e apoio de teste) + **F0m** (montagem e serviços comuns); **F0b** → **F0b** (núcleo do front:
cliente da API, `DMC_Auth`, `DMC_UI`, `DMC_Portal`, regressão D5) + **F0s** (shell e catálogo visual) + **F0p**
(páginas do titular, fase 1); **F1** → **F1a** (servidor de estudos) + **F1b** (telas de estudos). A F4 foi avaliada
e ficou inteira na segunda (§16.3) e foi dividida na terceira (D-78), também sem mudar contrato de rota: **F4a**
(turmas, matrículas, liberações e migração) + **F4b** (documentos pessoais e contratos), com a escrita cruzada em
`matriculas.contratoId` só pelo serviço `secretaria.vincularContrato` da F4a.

| Fatia | Arquivos (exclusivos) |
|---|---|
| **F0a** · fundação do back: puros, erros e apoio de teste (fase 0) | `server/src/auth.js` · `server/src/throttle.js` (só parâmetros opcionais `chave`/`codigo`) · `server/src/portal/{papeis,validacao,codigos,cripto,totp,csv,erros,config-portal}.js` · `server/test/apoio/{banco-memoria,fixtures-portal,http,falsos}.js` · `server/test/portal-base-{papeis,util}.test.js` |
| **F0m** · fundação do back: montagem e serviços comuns (fase 0, depois da entrega P0a da F0a) | `server/src/portal/{montar,servicos,acesso,perfis-leitura,indices,auditoria,notificacoes,arquivos,email,limitador}.js` · `server/scripts/{create-admin,seed-portal-qa}.js` · `server/test/portal-base-{indices,montagem,comuns,integracao}.test.js` |
| **F0t** · titular e equipe: servidor (fase 1) | `server/src/routes/auth.js` · `server/src/routes/portal/{auth-extra,perfil,meus-dados,cep,notificacoes,busca,auditoria,pendencias}.js` · `server/src/routes/portal-equipe.js` · `server/src/portal/consentimentos-textos.js` · `server/test/portal-base-{auth,equipe,perfil,servicos}.test.js` |
| **F0b** · núcleo do front (fase 0) | `index.html` · `js/api-client.js` · `js/app.js` · `js/portal/{pre-pintura,ui,qr,boot-index}.js` · `js/vendor/qrcode-generator/{qrcode.js,LICENSE}` · `tests/e2e/{_portal.js,portal-regressao-d5.spec.js,portal-ui.spec.js}` |
| **F0s** · shell e catálogo visual (fase 0) | `js/shell.js` · `js/portal/tour.js` · `css/portal.css` · `tests/e2e/portal-shell.spec.js` |
| **F0p** · páginas do titular (fase 1, com ou depois da F0t) | `perfil.html` · `meus-dados.html` · `notificacoes.html` · `busca.html` · `acesso-link.html` · `js/portal/{perfil,meus-dados,notificacoes,busca,acesso-link}.js` · `tests/e2e/{portal-titular.spec.js,portal-titular.paginas.js}` |
| **F0r** · reskin e qualidade visual (fase 0; tutoriais na fase 1) | `loja.html` · `obrigado.html` · `tutoriais.html` · `js/portal/{boot-loja,boot-obrigado,tutoriais}.js` · `css/plataforma.css` · `server/test/front-estatico.test.js` · `tests/e2e/{portal-qualidade.spec.js,_qr.js}` · `tests/tools/{versionar-ead,cabecalho-ead,contraste,posse-ead}.mjs` |
| **F1a** · estudos: servidor | `server/src/routes/{catalogo,progresso,materiais}.js` · `server/src/routes/portal-conteudo.js` · `server/src/portal/estudos/{video,repositorios,progresso}.js` · `server/scripts/migrar-materiais.js` · `server/test/estudos-{conteudo,progresso,legado}.test.js` |
| **F1b** · estudos: telas | `dashboard.html` · `meus-cursos.html` · `aula.html` · `js/portal/{estudos-dados,inicio,meus-cursos,player,video,prof-conteudo}.js` · `css/portal-estudos.css` · `tests/e2e/{portal-estudos.spec.js,portal-estudos.paginas.js}` · `tests/fixtures/video-teste.mp4` |
| **F2** · avaliações | `js/portal/{avaliacao,prof-avaliacoes}.js` · `css/portal-avaliacao.css` · `server/src/routes/portal-avaliacoes.js` · `server/src/portal/avaliacoes/{avaliacao-motor,repositorios}.js` · `server/test/avaliacoes-{motor,rotas}.test.js` · `tests/e2e/{portal-avaliacoes.spec.js,portal-avaliacoes.paginas.js}` |
| **F3a** · acadêmico e frequência | `ao-vivo.html` · `academico.html` · `comprovantes.html` · `js/portal/{academico,ao-vivo,comprovantes,prof-academico}.js` · `css/portal-academico.css` · `server/src/routes/lives.js` · `server/src/routes/portal-{academico,encontros}.js` · `server/src/portal/academico/{calculo-academico,servico-academico,repositorios}.js` · `server/test/academico-{calculo,rotas,encontros,comprovantes}.test.js` · `tests/e2e/{portal-academico.spec.js,portal-academico.paginas.js}` |
| **F3b** · certificação (regras do curso, IES, códigos de aula, declarações, validação, certificados) | `certificados.html` · `certificado.html` · `validar.html` · `declaracao.html` · `js/portal/{declaracoes,validar,declaracao,prof-certificacao}.js` · `css/portal-declaracoes.css` · `server/src/routes/certificados.js` · `server/src/routes/portal-{cursos,declaracoes}.js` · `server/src/portal/certificacao/{declaracoes,repositorios}.js` · `server/test/academico-{cursos,declaracoes,legado}.test.js` · `tests/e2e/{portal-declaracoes.spec.js,portal-declaracoes.paginas.js}` |
| **F4a** · secretaria: turmas, matrículas e liberações (D-78) | `js/portal/prof-secretaria.js` · `css/portal-secretaria.css` · `server/src/routes/liberacoes.js` · `server/src/routes/portal-turmas.js` · `server/src/portal/secretaria/{matriculas,repositorios}.js` · `server/scripts/matriculas-de-liberacoes.js` · `server/test/secretaria-{matriculas,legado}.test.js` · `tests/e2e/{portal-secretaria.spec.js,portal-secretaria.paginas.js}` |
| **F4b** · documentação: documentos pessoais e contratos (D-78) | `documentos.html` · `contratos.html` · `contrato.html` · `js/portal/{documentos,contratos,contrato,prof-documentos}.js` · `css/portal-documentos.css` · `server/src/routes/portal/{documentos,contratos}.js` · `server/src/portal/documentacao/repositorios.js` · `server/test/secretaria-{documentos,contratos}.test.js` · `tests/e2e/{portal-documentos.spec.js,portal-documentos.paginas.js}` |
| **F5** · financeiro | `financeiro.html` · `js/portal/{financeiro,prof-financeiro}.js` · `css/portal-financeiro.css` · `server/src/routes/portal/financeiro.js` · `server/src/portal/financeiro/` (pasta inteira) · `server/test/financeiro.test.js` · `tests/e2e/{portal-financeiro.spec.js,portal-financeiro.paginas.js}` |
| **F6a** · atendimento, ouvidoria, configurações e regulamento | `atendimentos.html` · `ouvidoria.html` · `regulamento.html` · `js/portal/{atendimentos,ouvidoria,regulamento,prof-atendimento,prof-configuracoes}.js` · `css/portal-atendimento.css` · `server/src/routes/portal/{atendimento,ouvidoria,configuracoes}.js` · `server/src/portal/atendimento/protocolos.js` · `server/src/portal/ia/rag.js` · `server/test/atendimento-{protocolos,ouvidoria,config}.test.js` · `tests/e2e/{portal-atendimento.spec.js,portal-atendimento.paginas.js}` |
| **F6b** · assistente de IA | `assistente.html` · `js/portal/{assistente,prof-ia}.js` · `css/portal-assistente.css` · `server/src/routes/portal/ia.js` · `server/src/portal/ia/{gemini,ferramentas,instrucao}.js` · `server/test/atendimento-{ia,ia-config}.test.js` · `tests/e2e/{portal-assistente.spec.js,portal-assistente.paginas.js}` |
| **F7** · comunicação e relatórios | `publicacoes.html` · `publicacao.html` · `js/portal/{publicacoes,publicacao,prof-comunicacao,prof-relatorios}.js` · `css/portal-comunicacao.css` · `server/src/routes/portal/{publicacoes,banners,relatorios}.js` · `server/src/portal/comunicacao/` (pasta inteira) · `server/test/{comunicacao,comunicacao-relatorios}.test.js` · `tests/e2e/{portal-comunicacao.spec.js,portal-comunicacao.paginas.js}` |
| **F8** · portal do professor e backoffice legado | `professor.html` · `admin.html` · `parcerias.html` · `js/portal/{professor,prof-visao,prof-turmas,prof-alunos,prof-duvidas,prof-equipe,boot-admin}.js` · `js/admin.js` · `js/parcerias-admin.js` · `css/portal-professor.css` · `css/parcerias-admin.css` · `server/src/routes/duvidas.js` · `server/src/routes/portal-professor.js` · `server/test/professor-portal.test.js` · `tests/e2e/{portal-professor.spec.js,portal-professor.paginas.js}` |
| **Principal** (não é fatia) | `server/src/server.js` — SÓ três pontos, depois da liberação da 2d (D-70): (1) a linha `import { montarPortal, tratarErroGlobal } from './portal/montar.js';`, (2) a linha `app.use('/api', montarPortal())` (API §5.3), (3) `app.use(tratarErroGlobal);` no lugar do bloco anônimo de tratamento de erro (hoje l. 177-192), com as regras de D-42 dentro de `erros.js` da F0a (API DC-77, D-82) · `server/test/servidor-erros.test.js` (só a ligação, D-82) · `vercel.json` (CSP de `/plataforma-ead/`, D-43; `"includeFiles": "server/src/**"`, API §5.3; redirecionamento de `login-classico.html` se a 2d aceitar, D-44; `maxDuration` se o CEO decidir) · `package.json` · `playwright.config.js` · `tests/server/*` (provedores falsos e `QA_SERVIDOR`, D-41) · `tests/tools/{conferir-posse,conferir-matriz}.mjs` (D-58, D-59) · `tests/e2e/_site.js` e specs do site (inclusive `parcerias.spec.js` e `vercel-config.spec.js`) · `tests/e2e/login-portal.spec.js` (com a 2d: entrada por CPF, links condicionados a `recursos()` apontando para `acesso-link.html#pedir-link`/`#esqueci`, passo do código do 2FA, destino por papel e `next`, perfil "Professor" por `papel`; D-71, §9.9 item 1a) · `docs/dmc/*` · `server/README.md` · `server/.env.example` · `.gitignore` · operações mecânicas: aplicar `cabecalho-ead.mjs` (S2, D-60), `versionar-ead.mjs` e esvaziar `PENDENTES_FASE_1` (G2), integração de cada G1 num `git worktree` fora do repositório (D-62) |
| **Proibidos a todas as fatias** (2d) | `login.html` · `login-classico.html` · `css/business-school.css` · `js/business-school.js` · `server/src/db.js` · `server/src/config.js` · `server/src/server.js` (fora os três pontos da principal) |
| **Ninguém** (sem mudança prevista) | `server/src/routes/{capas,contato,newsletter,parcerias,vitrine,bolsas}.js` · `server/scripts/seed.js` · `server/test/{bolsas,contato,newsletter,parcerias,vitrine}.test.js` · `api/[...path].js` · `js/{data,loja,eixo-3d}.js` · `js/login/*` · `js/vendor/three/*` · `css/login.css` · `complexodmc.com.br/assets/css/{tokens,components}.css` (são do site; promoção de token = pendência P2) · `tests/lighthouse.mjs` |

Conferência mecânica refeita depois da terceira revisão (`tests/tools/conferir-posse.mjs` sobre esta tabela, com
expansão das chaves `{…}`; o mesmo script roda no G2 contra o disco): **19 fatias**, 262 caminhos distintos nas
fatias e 311 na tabela inteira (pasta inteira conta como um); **nenhum caminho em duas fatias**; nenhuma fatia
recebe `server.js`, `db.js`, `config.js`, `login.html`, `login-classico.html` nem `business-school.*` (os dois únicos
caminhos em duas linhas são `server.js` e `login-classico.html`, citados na linha da principal — três pontos de
`server.js` e o redirecionamento no `vercel.json` — e na dos proibidos); as 34 páginas (32 com dono entre as fatias + 2
da 2d; a nova é `regulamento.html`, F6a) e os 59 módulos `.js` do front citados em §6.1–§6.3 (novos: `prof-documentos.js`,
F4b, e `regulamento.js`, F6a) têm dono. Por fatia: F0a 16 · F0m 16 · F0t 15 · F0b 12 · F0s 4 · F0p 12 · F0r 14 · F1a 11
· F1b 13 · F2 10 · F3a 20 · F3b 19 · F4a 11 · F4b 15 · F5 9 · F6a 19 · F6b 12 · F7 15 · F8 19 caminhos (a F0s é pequena
em arquivos, mas `portal.css` é o catálogo inteiro da UX §4 e o `shell.js` v2; os 12 `portal-<x>.paginas.js` e o
`posse-ead.mjs` são os caminhos novos de teste, D-73 e D-74).

**Posse de dados** (coleções e campos; API §3): a fatia dona do módulo que ESCREVE é dona da coleção; leitura por
outra fatia só por serviço de §8.4 ou função pura de assinatura congelada (entregue no mini-portão P1, D-64).
Coleções novas: `erros_servidor` → F0a (`erros.js`) · `limites`, `auditoria`, `notificacoes`, `notificacoes_estado`,
`arquivos` → F0m · `perfis`, `consentimentos` (único escritor pelos serviços `consentimentos.*`, também para o
assistente, API DC-72), `auth_2fa`, `auth_tokens`, `cache_cep`, `docencias` → F0t (o núcleo só
lê `perfis`/`docencias` em `perfis-leitura.js` e `acesso.js`, da F0m) · `progresso_video`, `progresso_conteudo` → F1a ·
`avaliacoes`, `questoes`, `tentativas`, `avaliacoes_aluno` → F2 · `frequencias` → F3a · `ies`, `declaracoes` → F3b ·
`turmas`, `matriculas` → F4a (`matriculas.contratoId` só pelo serviço `secretaria.vincularContrato`, D-78) ·
`tipos_documento`, `documentos_enviados`, `contratos` → F4b · `lancamentos` → F5 ·
`protocolos` (inclusive `protocolos.pedido`, gravado por `atendimento.abrirProtocolo` a pedido da F5, DC-69),
`manifestacoes`, `regulamentos` → F6a · `conversas_ia`, `ia_uso_diario`, `ia_trilha` → F6b ·
`publicacoes`, `banners` → F7. `configuracoes` tem dono por documento: `assistente_ia` → F6b; `encarregado`,
`instituicao`, `retencao` → F6a. Campos novos em coleções existentes: `users.*` novos → F0t (escritos pelas rotas de
auth, perfil e equipe; a leitura em `auth.js` é da F0a); `cursos.{sigla, nivel, iesId, cargaHorariaHoras, criterios,
academicoVersao}`, `modulos.{chHoras, tipo}`, `aulas.codigo`, `certificados.*` novos → F3b; `lives.*` novos → F3a;
`cursos.capaVertical`, `modulos.{plano, materiais, capa}`, `aulas.{rotuloEncontro, materiais[].categoria,
materiais[].arquivoId}`, `progresso.origem` → F1a (D-56); `duvidas.respostas[].autorPapel` → F8; `liberacoes` → nada
novo.

### 8.2 Regras de convivência
1. Arquivo de outra fatia precisa mudar → pedido escrito ao dono, via principal; nunca edição direta.
2. Arquivos da fase 0 (F0a, F0m, F0b, F0s e o `plataforma.css` da F0r: `app.js`, `api-client.js`, `ui.js`,
   `pre-pintura.js`, `qr.js`, `shell.js`, `tour.js`, `portal.css`, `plataforma.css`, `server/src/portal/*` comuns,
   `auth.js`, `throttle.js`, `test/apoio/*`, `_portal.js`, `portal-regressao-d5.spec.js`) ficam **congelados** na fase 1:
   o dono só corrige defeito ou faz acréscimo pedido, sem quebrar assinatura, e testa nas portas da principal em
   janela combinada com ela (§9.1).
3. Operações mecânicas da principal não mudam a posse: são scripts revisados, idempotentes e com dry-run
   (`cabecalho-ead.mjs` troca só o bloco `<head>` entre marcadores, remove `glow-corner`/`bg-grid`/fontes
   antigas, troca `.gradient-text` por `<em>` e insere `ui.js` antes de `shell.js`; `versionar-ead.mjs` reescreve
   só `?v=`; no G2 a principal apaga a constante `PENDENTES_FASE_1`, já vazia por regra).
4. Nomes únicos: índice (`portal-base-indices`), par método + caminho entre módulos (`portal-base-montagem`),
   prefixo de classe `pf-` + `pf-<dominio>-` (`est` F1b, `av` F2, `ac` F3a, `dec` F3b, `sec` F4a, `doc` F4b, `fin` F5, `at` F6a,
   `ia` F6b, `com` F7, `prof` F8; classes do catálogo sem domínio só na F0s), chave de `localStorage` (§7.9).
5. `professor.html` (F8) já nasce com as tags `<script>`/`<link>` de todos os arquivos de §6.3 e de `avaliacao.js`
   (F2, antes de `prof-avaliacoes.js`); arquivo de outra fatia ainda ausente dá 404 só em desenvolvimento (risco R13).
6. Importar código de outra fatia só para as funções puras de assinatura congelada listadas em §8.4, e só DEPOIS do
   mini-portão P1 "contrato puro" (D-64): a dona entrega primeiro o arquivo com as funções implementadas e testadas,
   com a assinatura copiada da API — `server/src/portal/estudos/video.js` (`normalizarVideo`, F1a → F7),
   `server/src/portal/academico/calculo-academico.js` (`calcularFrequencia`, `situacaoModulo`, `situacaoCurso`,
   `calcularElegibilidade`, `horasDe`, `criteriosDe`, F3a → F3b) e `server/src/portal/ia/rag.js` (`fatiar`,
   `recuperar`, F6a → F6b) —, a principal anuncia o P1 de cada um e só então a consumidora acrescenta o `import`
   (antes disso ela trabalha nas outras partes). Todo o resto passa por serviço de nome fixo (API §4.4), com falso nos
   testes.
6a. **Arquivo sempre importável** (D-62, D-64): arquivo de servidor que outra fatia ou uma rota legada importa de forma
   estática só é salvo em estado que passa `node --check` e o teste da própria fatia. Em especial, `routes/auth.js`
   (F0t) só passa a delegar a `routes/portal/auth-extra.js` numa edição única, depois de `portal-base-auth` verde: um
   erro ali derrubaria o login de todas as fatias, e o isolamento por módulo do agregador (API §5.2) não cobre import
   estático.
6b. **Mini-portão P1f "hospedeiros de tela"** (D-74): várias fatias não têm página própria onde a interface delas roda
   (o `avaliacao.js` da F2 só é montado no player; as telas de backoffice de F2, F3a, F3b, F4a, F4b, F5, F6a, F6b e F7 só
   existem dentro de `professor.html`). No começo da fase 1, ANTES do E2E de G1 dessas fatias, a F8 entrega
   `professor.html` + `professor.js` (`registrar`, `iniciar`, `navegar`, `itensDoMenu`, moldura com `pai`/`aba` e o `ctx`
   de §7.8, guarda e shell) e a F1b entrega `aula.html` + `player.js` + `estudos-dados.js` + `video.js` montando a seção 4
   com `DMC_Avaliacao.montar` quando o global existe (sem ele, a seção some), cada um com o próprio teste verde; a
   principal anuncia o P1f como anuncia o P1. O P1f não espera o G1 da F8 nem o da F1b.
7. Asserção da regressão D5 só muda por pedido escrito ao dono (F0b) via principal, com justificativa (D-45).
7a. Markup que duas fatias escrevem igual segue o texto fixo de §7.10 (subnavegação do Atendimento, loja e obrigado,
   moldura do backoffice).
8. Agentes não commitam; processos só pelo próprio PID; portas e bancos de §9.1.

### 8.3 Ordem, fases e portões

| Fase | Quem trabalha | Saída | Portão para avançar |
|---|---|---|---|
| **0 · Fundação** | **F0a → F0m** (a F0m começa no P0a da F0a) **∥ F0b ∥ F0s ∥ F0r** + principal, com os pontos de sincronização S0–S3 abaixo | serviços e módulos comuns, agregador, auth do núcleo; contratos JS (§7); reskin do legado; shell v2 e catálogo; regressão D5 gravada ANTES de qualquer edição; servidor de QA com provedores falsos | **Entrada** (D-70): autorização do CEO (§14 item 5); aviso à 2d feito (§5.5); liberação de `server.js` pela 2d ou janela combinada (§5.5 item 7a) — sem ela, a fase 0 começa assim mesmo e vale o plano B. **G0-a** (abre a fase 1): `npm test` verde (188 + F0a + F0m, com o agregador montado nos testes por `montarPortal({...})`); `portal-regressao-d5` (§9.3) verde antes e depois; captura de `login-classico.html` idêntica antes/depois; `front-estatico.test.js` verde com `PENDENTES_FASE_1` só com arquivos de fatias da fase 1; `portal-shell.spec.js` (parte G0, D-61) e `portal-ui.spec.js` verdes; axe e detector de neon com o escopo abaixo; S2 feito; CSP estrita em report-only em `/plataforma-ead/`; `serve.mjs` com `QA_SERVIDOR` e provedores falsos; contratos de §7 publicados (S3); contrato da 2d entregue (§5.5). **G0-b** (abre o E2E e o G1 de toda fatia da fase 1): os três pontos de `server.js` aplicados pela principal, `servidor-erros.test.js` verde e, no `serve.mjs`, `GET /api/portal/saude` 200 com `carregados` igual aos módulos presentes |
| **1 · Domínios** | **F0t · F0p · F1a · F1b · F2 · F3a · F3b · F4a · F4b · F5 · F6a · F6b · F7 · F8 em paralelo** + F0r (tutoriais) | cada fatia: back + testes + front do seu domínio; primeiro o mini-portão P1 "contrato puro" das funções importadas por fatias irmãs (D-64) e o P1f "hospedeiros de tela" (F8 e F1b, D-74) | **G1** por fatia: critérios §8.5 + DoD §8.6, com as verificações isoladas por `QA_FATIA` (D-62); depois a principal integra a fatia num `git worktree` (HEAD commitado + arquivos da fatia) e roda `npm test` inteiro, a D5 inteira e o `front-estatico` sem `QA_FATIA` |
| **2 · Integração** | principal + F0b-final + F0s-final + F0r-final | `?v=` por hash; boots legados mortos e bloco `@dmc-compat` removidos (prova por `grep`); tutoriais conferidos com as telas reais; matriz §4 conferida por script (D-58); posse conferida por script contra o disco (D-59); links e menus de todos os papéis; CSP **aplicada**; `PENDENTES_FASE_1` vazia; revisão OWASP; commits por fatia | **G2**: QA §9 completo verde, inclusive 0 violação da CSP aplicada e `conferir-matriz.mjs` e `conferir-posse.mjs` limpos; `DECISIONS.md`, `PROGRESS.md`, `server/README.md` e `.env.example` atualizados; avisos à 2d enviados |
| **3 · Homologação** | principal | checklist D3 (§9.9), inclusive os itens bloqueantes de segurança, a leitura do QR com celular e o aceite do login da 2d (item 1a, D-71) | publicação só com decisão explícita do CEO na rodada |

**Plano B de `server.js`** (D-70). Sem a liberação da 2d, a fase 1 começa no G0-a. Até o G0-b, as fatias da fase 1
trabalham no servidor, nos testes de unidade (que montam o agregador dentro do próprio teste, API §9.1) e no front
sem E2E; o E2E e o G1 de cada fatia esperam o G0-b. A principal registra em `PROGRESS.md` a data do pedido à 2d e a da
liberação, e avisa o CEO se a espera passar de um dia de trabalho.

**Pontos de sincronização da fase 0** (D-60). Sem eles, as fases B e C do reskin trocariam literais por
`var(--pf-acento-rgb)` em páginas que ainda não carregam `portal.css` (a cor cairia e o tema claro nem existiria, então
a conferência bloco a bloco não mediria nada), e o shell v2 rodaria sem `ui.js`.

| Ponto | O que fica pronto | Quem entrega | O que libera |
|---|---|---|---|
| **S0** linha de base | `_portal.js` (papéis semeados; `PAGINAS_BASE` com as 34 páginas e o carregador `paginasDoPortal()` que junta os `portal-<x>.paginas.js` das fatias, D-74; `SELETORES_D5`; `monitorarConsoleERede` e `confirmarNaTela`, D-73 e D-76; sementes do R9, com perfil identificado, e do R9b, sem perfil, gravadas direto no banco descartável) + `portal-regressao-d5.spec.js` verde contra o código ATUAL + capturas "antes" 1440/390 de todas as páginas, inclusive `login-classico.html` (a pasta `antes/` citada no pedido não existe no disco: a linha de base é feita aqui) | F0b | qualquer edição em arquivo EXISTENTE da EAD (F0r em `plataforma.css`, F0s em `shell.js`, F0b em `app.js`). Arquivo novo que nenhuma página carrega ainda (`portal.css`, `tour.js`, `ui.js`, `pre-pintura.js`, `cabecalho-ead.mjs`) pode começar antes |
| **S1** cabeçalho pronto | `portal.css` fase A (tokens `--pf-*` dos dois temas, camadas 1–3 da UX §2.2, bloco `@dmc-compat`, sobreposição de `.btn-primary`, base tipográfica — texto literal da UX §3 fase A) · `pre-pintura.js` final · `ui.js` mínimo (`DMC_UI.html/esc/cru/icone` e `DMC_Portal.iniciar` funcionando) · `cabecalho-ead.mjs` com dry-run e idempotente | F0s · F0b · F0b · F0r | S2 |
| **S2** cabeçalho aplicado | a principal aplica `cabecalho-ead.mjs` em todas as páginas da EAD (fora as da 2d): toda página legada passa a carregar `tokens.css`, `components.css`, `plataforma.css`, `portal.css`, `pre-pintura.js` e `ui.js`; D5 verde e captura de `login-classico.html` idêntica no mesmo passo | principal | as fases B e C da F0r (que a partir daqui medem algo), o shell v2 e o catálogo da F0s |
| **S3** contratos publicados | `DMC_UI` completo (inclusive `reautenticar` e `consentimento`, D-57, e o gancho `data-pf-acao="confirmar"`/`"cancelar"` dos diálogos, D-76), `DMC_Portal` (com `itens`, D-75), acréscimos de `DMC_Auth`, `DMC_Api` e `DMC_Data` (§7.1–§7.5), `qr.js` + vendor | F0b | o uso pleno de `DMC_UI` pelo shell (antes disso ele degrada, §7.6) e o G0-a |

**Escopo da varredura estática, do axe e do detector de neon no G0** (D-46, D-67). No G0 o `front-estatico.test.js` e
o axe completo valem para os arquivos e as páginas da F0b, da F0s e da F0r e para o `<head>`/`body` tratado por
`cabecalho-ead.mjs`. O próprio teste traz `PENDENTES_FASE_1` (arquivo → fatia dona), com o que ainda viola a guarda e
não pode ser tocado na fase 0: `css/parcerias-admin.css` (neon em `rgba(0,231,252)`/`rgba(0,255,77)`, `999px`, pesos
700/800, `.glow-corner`), `js/admin.js` (`font-family:'Playfair Display'` e `style=` com cor), `js/parcerias-admin.js`,
`admin.html`, `parcerias.html` → F8 · o markup legado de `dashboard.html`, `aula.html`, `meus-cursos.html` → F1b ·
`ao-vivo.html` → F3a · `certificados.html`, `certificado.html` → F3b (a lista final é a que o teste encontrar no G0;
nenhum arquivo da F0b, da F0s ou da F0r pode estar nela). O guarda tolera essas entradas, exceto as da fatia em
`QA_FATIA` (o G1 de cada dona exige a sua entrada limpa), e ignora a lista com `QA_ESTRITO=1` (G2). Nas páginas
legadas de outras fatias, o axe do G0 roda só as regras de cor e contraste (`color-contrast`, `link-in-text-block`);
as estruturais (`label`, `button-name` e demais) entram no G1 da dona (a UX §7.16 já lista os campos do editor só com
placeholder como correção da F8). **Detector de neon e axe de cor no G0** (D-67): ficam de fora as páginas cujo CSS ou
JS está em `PENDENTES_FASE_1` — a lista `PAGINAS_PENDENTES_G0` do `portal-qualidade.spec.js`, derivada dela: hoje
`parcerias.html` (`parcerias-admin.css` l. 134-135, `rgba(0, 231, 252, 0.03)` e `0.07` em `tbody tr:hover` e
`tr.is-atual`, que o detector pega porque ignora o alfa) e `admin.html` (inline de `admin.js`), se acusar. Essas
páginas passam pelo detector e pelo axe de cor completos no G1 da F8 (`QA_FATIA=F8`) e de novo no G2.

**Ordem interna da fase 0** (cada passo cita o ponto de sincronização de que depende):
- **F0b**: (1) S0; (2) `pre-pintura.js` e `ui.js` mínimo (S1); (3) acréscimos de `api-client.js` e `app.js` (§7.1–§7.3),
  inclusive `DMC_bootLogin`, o modo restrito no `DMC_init` e nos boots legados (D-63) e o markup da loja e do obrigado
  (D-69); (4) `ui.js` completo + `DMC_Portal`, `qr.js` + vendor, `boot-index.js` (S3); (5) `portal-ui.spec.js`
  (escape, `abrirArquivo`, rascunho de 401, `reautenticar`, `consentimento`); (6) D5 verde de novo.
- **F0s**: (1) `portal.css` fase A (S1); (2) depois de S2: `shell.js` v2 (que degrada sem `DMC_UI`) e `tour.js`; (3)
  catálogo `pf-*` em `portal.css` (UX §4), inclusive `pf-subnav`, `pf-consentimento` e `pf-reautenticacao`; (4)
  `portal-shell.spec.js`, parte G0 (D-61).
- **F0r**: (1) depois de S0: marcadores `@dmc-root-legado`/`@dmc-legado-login` em `plataforma.css`, sem tocar regra, e
  captura idêntica; (2) `cabecalho-ead.mjs` com dry-run (S1); (3) `contraste.mjs`; (4) depois de S2: fases B e C da UX
  §3 em `plataforma.css`, bloco a bloco, com D5, axe e captura de `login-classico.html` a cada bloco; (5) `loja.html` e
  `obrigado.html` (caixa de desenvolvimento com `hidden` e `pf-alerta--aviso`, sem `style` nem emoji, UX §3 B3a), com
  `boot-loja.js`/`boot-obrigado.js` e o estilo das classes de D-69; (6) `front-estatico.test.js` (com `POSSE`,
  `PENDENTES_FASE_1` e os modos de D-62), `portal-qualidade.spec.js` (com `PAGINAS_PENDENTES_G0`, D-67) e `_qr.js`
  (D-68); (7) `versionar-ead.mjs`.
- **F0a**: (1) `test/apoio/*` e os puros (`papeis`, `validacao`, `codigos`, `cripto`, `totp`, `csv`, `erros` com
  `resumirErro` e `tratarErroPortal`, `config-portal` com a regra `QA_SERVIDOR`, D-41) → **P0a**, que libera a F0m;
  (2) `auth.js` (`sv`, `publicUser` com os campos novos, 12 h para admin) e `throttle.js`; (3)
  `portal-base-{papeis,util}`.
- **F0m** (a partir do P0a): (1) `indices`, `servicos`, `acesso` (com `equipe.*`), `perfis-leitura` (`perfis.*`),
  `auditoria`, `notificacoes`, `arquivos`, `email`, `limitador`; (2) `montar.js` (import literal, isolamento por módulo
  da API DC-67, `falharCedo`), `exigirTrocaDeSenha`, `exigirSegundoFatorAdmin`; (3) `seed-portal-qa.js` e
  `create-admin.js`; (4) `portal-base-{indices,montagem,comuns}` (e `integracao`, opcional).
- **Principal**: (1) desde o início: provedores falsos e `QA_SERVIDOR=1` no `serve.mjs` (D-41) e CSP estrita
  report-only de `/plataforma-ead/` no `vercel.json` (D-43); (2) S2; (3) com a liberação da 2d e o passo 2 da F0m: os
  três pontos de `server.js` e `servidor-erros.test.js` (G0-b).

**Início da fase 1** (D-64). Antes de qualquer `import` entre fatias irmãs, as donas entregam o P1 "contrato puro"
(§8.2 item 6): F1a `estudos/video.js`, F3a `academico/calculo-academico.js`, F6a `ia/rag.js`. A F0t entrega primeiro o
que outras fatias usam no E2E (equipe para a F8; perfil, consentimentos e notificações para a F0p) e só troca o
encadeamento de `routes/auth.js` numa edição única (§8.2 item 6a). A F4a entrega primeiro os serviços `secretaria.*` de
matrícula (API §4.4, inclusive `matriculaPorId` e `vincularContrato`, D-78), que F1a, F2, F3a, F3b, F4b e F5 consomem
em execução (nos testes, por falsos). A F8 e a F1b entregam primeiro o P1f (§8.2 item 6b, D-74), que libera o E2E das
fatias penduradas em `professor.html` e no player.

### 8.4 Dependências entre fatias

Dependência de **serviço** não bloqueia o trabalho: nos testes de servidor o fornecedor é um falso injetado
(`servicosFalsos`, API §9.1); no E2E, dados semeados; em execução, serviço ausente lança `ServicoIndisponivel` e o
consumidor mostra estado honesto ("—" + motivo), nunca número inventado. **Rota legada** com serviço de outra fatia
ausente segue o comportamento legado + `console.warn`, nunca 503 (API §4.4, DC-54: R9, R9b e os demais fluxos D5 não
dependem da ordem de entrega); os serviços da F0a e da F0m existem desde o G0 e não entram nessa exceção. Só quatro
tipos de dependência esperam: o **import estático** de função pura de fatia irmã (mini-portão P1, §8.2 item 6, D-64), o
**P0a** da F0a para a F0m, o **P1f** dos hospedeiros de tela (F8 e F1b, §8.2 item 6b, D-74) e o **E2E** de quem usa
rotas ou páginas de outra fatia (tabela "Dependências de E2E" abaixo), que pesa só no G1.

| Fatia | Consome | Entrega a outras | Enquanto o fornecedor não existe |
|---|---|---|---|
| F0a | — | P0a: puros (`papeis`, `validacao`, `codigos`, `cripto`, `totp`, `csv`), `erros.js` (`resumirErro`, `tratarErroPortal`, `tratarErroGlobal` para o terceiro ponto de `server.js`, `ErroPortal`; API DC-77), `INDICES_LEGADOS` no `banco-memoria.js` (API DC-76), `config-portal.js`, `test/apoio/*`; `auth.js` (`publicUser` com `papel`, `sv`, 12 h para admin), `throttle.js` | — |
| F0m | F0a (P0a; a montagem em `server.js` é da principal) | serviços `acesso`, `equipe.*`, `perfis.publicos`, `perfis.identificacao`, `auditoria`, `notificacoes`, `arquivos`, `email`, `cifra`, `assinador`, `contador`; infraestrutura dos grupos `busca`, `validador`, `exportador`, `relatorio`, `painel` (com a contribuição `sistema`), `aviso`, `notificacaoSobDemanda`, `aoConcluirAula`, `cascata`; `montar.js`, `exigirTrocaDeSenha`, `exigirSegundoFatorAdmin` | — |
| F0t | F0a, F0m; F4a (`matriculasDoAluno`); F4b (`secretaria.temContratoAssinado`); F6a (`atendimento.abrirProtocolo`, `configuracoes.publicas`); F6b (`ia.revogarConsentimento`) | rotas API §6.1–§6.4 (auth ampliada, equipe, perfil, CEP, Meus dados, notificações, pendências, busca, auditoria); serviços `consentimentos.{registrar,revogar,vigente}`, únicos escritores de `consentimentos` (API DC-72; a F6b usa); textos v1 de consentimento, inclusive gênero e etnia (D-55); avisos `perfil-incompleto`, `troca-de-senha`, `email-nao-verificado`, `2fa-obrigatorio`; relatório `diversidade`; exportadores `conta`, `perfil`, `consentimentos`, `notificacoes`; membro de `cascata` (docências) | sem F4b, os campos travados (`nomeRegistro`, `cpf`, `nascimento`, `passaporte`) respondem 503 `servico-indisponivel` no PUT (nunca destravam sem conferir); sem F6a, pedidos do titular 503 e a tela diz "pedidos indisponíveis no momento" |
| F0b | F0a (`publicUser` com `papel`); F0s (classes do catálogo que o `DMC_UI` desenha); F0r (`POSSE` de `tests/tools/posse-ead.mjs`, D-73); em execução, F5 (`POST /portal/me/pedidos`) e F6a (`GET /portal/me/atendimentos/:protocolo`) | `DMC_Api`, `DMC_Auth`, `DMC_UI` (com `reautenticar`, `consentimento` e o gancho `data-pf-acao`, D-57, D-76), `DMC_Portal` (com `itens`, D-75), `DMC_QR`, `DMC_Icons`, `DMC_Data`, markup e chamada do pedido em loja e obrigado (D-69, D-79), `_portal.js` (`paginasDoPortal`, `monitorarConsoleERede`, `confirmarNaTela`, D-73, D-74, D-76), D5, `portal-ui.spec` | antes do S2, componentes sem estilo só nos testes; sem F5, o checkout segue o caminho legado com texto honesto (§7.3) |
| F0s | F0b (`DMC_UI`, `DMC_Auth`; S1 e S3); F0t (notificações, pendências, busca); F6a (`/portal/configuracoes/publicas`); F7 (`/portal/banners`); F8 (`itens` do backoffice, `DMC_Professor.itensDoMenu`) | `DMC_Shell`, `portal.css` (tokens, temas, compatibilidade, catálogo `pf-*`), `tour.js`, `portal-shell.spec` | sem `DMC_UI`, o shell degrada (§7.6); 404 silencioso: faixa e contadores somem |
| F0p | F0t (auth ampliada, perfil, CEP, consentimentos, notificações, busca, Meus dados); F0b; F0s; F6a (`/portal/configuracoes/publicas`, `POST /portal/me/atendimentos`); F6b (`ia.revogarConsentimento`, pela rota da F0t) | `perfil.html`, `meus-dados.html`, `notificacoes.html` (e `#/notificacoes`), `busca.html`, `acesso-link.html`; `portal-titular.spec` com os casos G1 do shell (D-61) | sem F6a, Meus dados diz "pedidos indisponíveis no momento" e não mostra encarregado; o G1 espera as rotas da F0t |
| F0r | F0s (`portal.css` fase A e catálogo; `DMC_Shell.tour` para os tutoriais); F0b (`DMC_bootLoja`/`DMC_bootObrigado`, `DMC_QR` para o `_qr.js`) | `plataforma.css` reskinado, `front-estatico` e `posse-ead.mjs` (`POSSE`, também para o `_portal.js`), `portal-qualidade`, `_qr.js`, `cabecalho-ead.mjs`, `versionar-ead.mjs`, `contraste.mjs`, tutoriais | — |
| F1a | F0a, F0m; F2 (`avaliacoes.resumoDoModulo`); F3a (`academico.situacaoDoCurso`, ouvinte de `aoConcluirAula`); F3b (`cursos.sigla`/`aulas.codigo`); F4a (`secretaria.garantirMatricula`/`matriculaVigente`); F8 (`podeResponder`) | rotas da API §6.5 e §6.13 (estudos); capas (D-56); `estudos.progressoDoCurso`, `estudos.aulasDisponiveis`, disparo de `aoConcluirAula`, busca `cursos`/`aulas`, relatório `progresso`, exportador `progresso`, membro de `cascata`, `normalizarVideo` (P1; a F7 usa), PUT legado com `rotuloEncontro`/`categoria` | situação `null` → marcador some; sem matrícula → "Início em" some; seção Avaliação vazia não aparece; sem código → selo do código some |
| F1b | F1a (rotas de estudos e capas); F2 (`DMC_Avaliacao`); F0b, F0s; F7 (banners `inicio`) | P1f: `aula.html` + `player.js` hospedando `DMC_Avaliacao` (D-74); `DMC_Video`, `DMC_Estudos`, `DMC_PlanoEnsino` (a F8 embute no `admin.html`) | o G1 espera as rotas da F1a; sem F7 os destaques somem |
| F2 | F0a, F0m; F1a (`Conteudo`, rotas de estudos, no E2E); F1b (o player monta, P1f); F8 (`professor.html`, P1f, para banco, correção e prévia); F3a (`academico.criteriosDe`; padrão 7 se ausente); F4a (`secretaria.matriculaVigente`) | `DMC_Avaliacao`, `avaliacoes.notaDoModulo` (com `simular`), `.resumoDoModulo`, `.tentativasDoAluno`, `.correcoesPendentes`, validador `AVL`, avisos `avaliacao-disponivel` (L13), relatórios `notas`/`tentativas`/`correcoes-pendentes`, painel `academico.correcoesPendentes`, exportador `tentativas`, membro de `cascata` | sem matrícula ativa → 409 `matricula-nao-ativa` explicado na tela |
| F3a | F0a, F0m; F1a (`progressoDoCurso`, `aulasDisponiveis`); F2 (`notaDoModulo`, `tentativasDoAluno`); F4a (`matriculasDoAluno`, `garantirMatricula`, `turmasDoCurso`, `alunosDoCurso`); F8 (P1f, telas de backoffice) | P1: funções puras de `calculo-academico.js` importáveis pela F3b (`calcularFrequencia`, `situacaoModulo`, `situacaoCurso`, `calcularElegibilidade`, `horasDe`, `criteriosDe`, com os critérios nas duas regras, API DC-66); serviços `academico.criteriosDe`, `.situacaoDoCurso`, `.resumoMatricula`, `.proximosEncontros`, `.encontrosDoEscopo`; validador `FRQ`; ouvinte `aoConcluirAula`; sob demanda `encontro.proximo`; relatórios `frequencia`/`presencas`; painel `academico.encontrosProximos7d`; exportador `frequencias`; membro de `cascata` (frequência, presença) | média `null` sem F2 |
| F3b | F0a, F0m (`perfis.identificacao`, `assinador`); F3a (funções puras do P1 e `academico.situacaoDoCurso`; `notaMinima` do `criteriosDe`, D-80); F4a (`secretaria.concluirMatricula`, `garantirMatricula`, `matriculasDoAluno`); F5 (`financeiro.anosDeclaraveis`); F8 (P1f) | `declaracoes.emitir`; despacho público `GET /portal/validar/:codigo` + `conferir` (em `routes/portal-declaracoes.js`, D-38) e validadores `DMC`/`DEC`; regras do curso, IES, tipo do módulo e códigos de aula (`refazer` com motivo, D-54); selo do certificado e `hashPrefixo` (DC-65); exportadores `declaracoes`, `certificados`; membro de `cascata` (certificado, declaração) | quitação some sem F5 (`quitacao: []`); sem F3a ou F4a, certificado pela regra legada (DC-54) e declarações 503 `servico-indisponivel` |
| F4a | F0a, F0m (`perfis.identificacao`); F3a (`academico.resumoMatricula` no detalhe da matrícula); F4b (`contratos.situacaoPorMatricula`, D-78); F8 (P1f) | `secretaria.garantirMatricula`, `.concluirMatricula`, `.contagemAlunos`, `.matriculaVigente`, `.matriculasDoAluno`, `.turmasDoAluno`, `.turmasDoCurso`, `.alunosDoCurso` (API §4.4; primeiros da fase 1, §8.3) e os novos `.matriculaPorId` e `.vincularContrato` (D-78); `?userId=` em `GET /portal/admin/matriculas` (API DC-73); relatório `alunos`, painel `alunos`, exportador `matriculas`, membro de `cascata` (matrícula não cancelada; turmas vazias); simulação dev em `secretaria-legado` (D-49) | detalhe da matrícula sem `resumo`; sem F4b, a coluna e o campo `contrato` da matrícula são omitidos e a tela mostra "—" |
| F4b | F0a, F0m (`perfis.identificacao`, `arquivos`, `assinador`); F4a (`secretaria.matriculaPorId`, `.vincularContrato`, `.matriculasDoAluno`, D-78); F8 (P1f) | `secretaria.pendenciasDoAluno` (F6a), `secretaria.temContratoAssinado` (F0t), `contratos.situacaoPorMatricula` (F4a, D-78); busca `documentos`, validador `CTR`, avisos `contrato-pendente`, `documento-pendente`, `documento-nao-enviado`, relatórios `documentos-pendentes`/`contratos`, painel `documentos`/`contratos`, exportadores `documentos`, `contratos` | sem F4a, `GET /portal/me/documentos` (precisa dos cursos do aluno) e `POST /portal/admin/contratos` respondem 503 `servico-indisponivel` e nada grava (degradação de rota nova, API §4.4) |
| F5 | F0a, F0m (`acesso.contexto` no pedido); F4a (`matriculasDoAluno`); F3b (`declaracoes.emitir`); F6a (`configuracoes.instituicao`; `atendimento.abrirProtocolo` com `pedido`, DC-69); F8 (P1f) | `POST /portal/me/pedidos` (API §6.9, DC-69); `financeiro.resumoDoAluno`, `.anosDeclaraveis`, avisos de atraso e `lancamento-vencendo` (L13), sob demanda `lancamento.vencendo`, relatório `financeiro`, painel `financeiro`, exportador | quitação → 409 `dados-da-instituicao-pendentes`; pedido sem F6a → 503 e nada gravado (a loja mantém o carrinho) |
| F6a | F0a, F0m (`equipe.professoresDoCurso`, `contador`); F4b (`secretaria.pendenciasDoAluno`, para a fila); F6b (`ia.disponivel`); F8 (P1f) | P1: `rag.js` (`fatiar`, `recuperar`, que preserva os campos extras do trecho, inclusive `regulamentoId`, D-81); `regulamento.html` e `GET /portal/regulamento` com `trechos` (DC-70, D-81); `atendimento.abrirProtocolo` (com `pedido`, gravado congelado, e o filtro `?pedido=1`, DC-69), `.abertosDoAluno`, `.abertosDoEscopo`, `.ouvidoriaSemParecer` (D-54); `configuracoes.publicas/instituicao/retencao`; contribuição `sistema.instituicaoPendente` ao grupo `painel` (D-54); regulamento publicado; busca `atendimentos`; relatórios `atendimentos`/`ouvidoria`/`retencao`; painel `atendimentos`/`ouvidoria`; exportadores `atendimentos`, `ouvidoria` | `configuracoes.publicas.ia.disponivel = false` sem F6b |
| F6b | F0a, F0m (`cifra`, `contador`); F0t (`consentimentos.registrar/revogar/vigente`, DC-72); F1a–F5 (dados das ferramentas); F6a (`atendimento.abrirProtocolo`/`abertosDoAluno`, `recuperar` do P1, regulamento, `configuracoes.retencao`); F8 (P1f) | `fontes[]` com `regulamentoId` (D-81); rotas API §6.10.3–§6.10.4 (com `?categoria=&cursoId=` no escalonamento e `textoSha256` opcional no consentimento, D-54); `ia.revogarConsentimento` (F0t), `ia.disponivel` (F6a, D-39); painel `ia`; exportador `conversasIa` | ferramenta ausente devolve `{disponivel:false}` e o assistente diz "informação indisponível"; sem F6a, "Falar com a equipe" responde 503 e a tela leva a `atendimentos.html?novo=1` |
| F7 | F0a, F0m (`csv`, auditoria); F1a (`normalizarVideo` do P1); F1b (`DMC_Video`); F4a (`turmasDoAluno`, `turmasDoCurso`); F8 (P1f) | `/portal/banners`, busca `publicacoes`, sob demanda `publicacao.nova`, catálogo e rota de relatórios (com `resumir`), painel da coordenação, tela de auditoria | público por turma indisponível sem F4a (só "todos" e "curso") |
| F8 | F0m (`perfis.publicos`); F0t (`/portal/admin/equipe*`, `/portal/admin/usuarios/*`); F1a (rotas de professor do conteúdo e de capa); F1b (`DMC_PlanoEnsino`); F0b (`DMC_Data`); F2 (`correcoesPendentes`, `DMC_Avaliacao` na prévia); F3a (`resumoMatricula`, `situacaoDoCurso`, `encontrosDoEscopo`); F3b (`PUT …/modulos/:id/academico` e `POST …/codigos`); F4a (`alunosDoCurso`, `turmasDoCurso`, `contagemAlunos`, `matriculasDoAluno` para a moldura, DC-73); F6a (`abertosDoEscopo`, `ouvidoriaSemParecer`); todos os `prof-*.js` | P1f: `professor.html` + `professor.js` (D-74); `DMC_Professor` (moldura, `itensDoMenu`, `iniciar`, D-65/D-66), `GET /portal/professor/resumo`, `GET /portal/professor/alunos/:userId/matriculas` (DC-73), dúvidas do professor (`podeResponder`, notificação `duvida.respondida`), exportador `duvidas` | coluna sem fonte mostra "—" + motivo; aba de fatia ausente não aparece (rota não registrada) |

**Dependências de E2E** (D-74). No E2E da fase 1, `PORTAL_MODULOS` de uma fatia = os módulos dela **mais** os módulos
das fatias de que ela depende no E2E (coluna do meio), e as páginas hospedeiras já precisam existir pelo P1f. A F0t
continua entrando só no E2E da F0t, da F0p e da F8 (§9.1). Os módulos estão na API §5.1 (`MODULOS_PADRAO`, com `fatia`
por entrada, DC-75).

| Fatia | Módulos de outras fatias em `PORTAL_MODULOS` | Páginas hospedeiras (P1f) e URLs que o `portal-qualidade` visita por ela |
|---|---|---|
| F0p | F0t (os 9) | — (páginas próprias) |
| F1b | F1a (`portal-conteudo.js`) | — |
| F2 | F1a (`portal-conteudo.js`) | `aula.html?curso=<id>&modulo=<id>&item=avaliacao:<id>` (F1b) · `professor.html#/avaliacoes`, `#/correcao` (F8) |
| F3a | — | `professor.html#/ao-vivo`, `#/turmas/<id>/frequencia` (F8) |
| F3b | F3a (`portal-academico.js`, para a situação do curso) | `professor.html#/configuracoes/cursos`, `#/documentos/declaracoes` (F8) |
| F4a | — | `professor.html#/matriculas`, `#/turmas/nova` (F8); sem página do aluno |
| F4b | F4a (`portal-turmas.js`, para a matrícula do contrato) | `professor.html#/documentos`, `#/contratos` (F8) |
| F5 | F6a (`portal/atendimento.js`, para o pedido e o obrigado); F4a (`portal-turmas.js`) | `loja.html` e `obrigado.html` (F0r, fase 0) · `professor.html#/financeiro` (F8) |
| F6a | — | `professor.html#/atendimento`, `#/ouvidoria`, `#/configuracoes/regulamento` (F8) |
| F6b | F6a (`portal/atendimento.js`, `portal/configuracoes.js`) | `professor.html#/configuracoes/ia` (F8) |
| F7 | — | `professor.html#/publicacoes`, `#/banners`, `#/relatorios`, `#/auditoria` (F8) |
| F8 | F0t (os 9); F1a (`portal-conteudo.js`, para o editor) | — (páginas próprias) |

Cada fatia declara as próprias páginas e URLs hospedeiras em `tests/e2e/portal-<x>.paginas.js` (§9.6), com a
semeadura de que a URL precisa (ids de curso, avaliação, contrato, publicação, declaração).

### 8.5 Critérios de pronto por fatia (G0 para F0a, F0m, F0b, F0s e F0r; G1 para as demais e para o que a F0r faz na fase 1)

| Fatia | Pronto quando (além do DoD §8.6) |
|---|---|
| F0a | **G0-a**: P0a entregue antes de tudo (libera a F0m); `portal-base-{papeis,util}.test.js` verdes; `publicUser` e `GET /api/auth/me` só ganharam campos (teste de contrato com a 2d); `papelDe` com `isAdmin` mandando; JWT com `sv` e 12 h para admin; `config-portal` com a regra `QA_SERVIDOR` (`PORTAL_MODULOS` e URLs de provedor falso ignoradas, com aviso, com `VERCEL_ENV` presente, D-41); `resumirErro` sem corpo, `keyValue` nem cabeçalhos e `tratarErroPortal` resumindo antes do `next(err)`, E11000 não previsto → 409 `registro-duplicado` sem `keyValue` (log espião); TOTP nos vetores da RFC 6238 com segredo cifrado; CSV com BOM e anti-fórmula; emulador do Mongo com a lista fechada e com `INDICES_LEGADOS` (os 5 índices únicos de `users`, `liberacoes`, `progresso` e `certificados`, sempre somados e conferidos contra o fonte de `db.js`, API DC-76); `tratarErroGlobal` com os casos de `portal-base-util` (JSON quebrado → 400 `formato-invalido` sem logar o corpo; 413; erro do Mongo → 503; log só por `resumirErro`, API DC-77) |
| F0m | **G0-a**: `portal-base-{indices,montagem,comuns}.test.js` verdes, sem abrir Mongo; `exigirPapel` 401/403; o caso "módulo que lança no `montar` não derruba as rotas legadas" com routers STUB no lugar de `/api/catalogo` e `/api/auth/signin` (API DC-74; o mesmo caso com os routers reais é da F0t e da F1a); com `QA_FATIA`, `portal-base-{indices,montagem}` importam só os módulos da fatia pelo campo `fatia` de `MODULOS_PADRAO` (API DC-75); `montar.js` com `import()` literal por entrada, isolamento transacional por módulo e o caso "módulo que lança no `montar` não derruba `GET /api/catalogo` nem `POST /api/auth/signin`" (API DC-67), `falharCedo` só em teste e pares método + caminho únicos; `exigirTrocaDeSenha` bloqueia inclusive o LMS legado; serviços de nome fixo do núcleo registrados; auditoria `executar` que falha → 503 e nada muda; `emitir`/`varrer` de notificações e os vetores de `arquivos` (PDF ativo, EXIF) em `portal-base-comuns` (D-59); `seed-portal-qa.js` recusa banco sem `_qa` ou URI fora de 127.0.0.1. **G0-b**: agregador montado pela principal e `/api/portal/saude` 200 no `serve.mjs` |
| F0t | `portal-base-{auth,equipe,perfil,servicos}.test.js` verdes; troca e redefinição de senha incrementam `sessaoVersao` e derrubam tokens antigos; tokens de link de uso único, guardados como hash, consumo atômico, expiram (15 min link, 30 min redefinição) e a resposta é idêntica com ou sem conta, em tempo constante (1 bcrypt); limite persistente por identificador + rede no login; 2FA só com `PORTAL_2FA`; consentimentos registrados e revogáveis das 6 finalidades, com os textos v1 literais de `consentimentos-textos.js`, inclusive gênero e etnia (D-55); endereço no exterior; CEP pelo servidor com timeout e cache; grupo `busca` testado só com provedores falsos (os casos de aulas e atendimentos foram para F1a e F6a, D-64); `routes/auth.js` delegando a `auth-extra.js` numa edição única depois de `portal-base-auth` verde (§8.2 item 6a); nenhuma rota devolve `senhaHash`, segredo TOTP, token, chave ou binário fora de download; `consentimentos.{registrar,revogar,vigente}` como únicos escritores de `consentimentos` (`/me/dados/consentimentos` só aceita `perfil_*`, API DC-72); em `portal-base-auth`, o caso "módulo que lança no `montar` não derruba `POST /api/auth/signin`" com o router real (API DC-74) |
| F0b | **G0-a**: regressão D5 (R1–R14 e R9b de §9.3) verde antes e depois do reskin, sem mudar asserção; S1 e S3 entregues; `portal-ui.spec.js` verde — `DMC_UI.html` escapa `<script>` e atributos; `abrirArquivo` com `text/html` ou `image/svg+xml` baixa e não abre aba; rascunho de 401 só em formulário marcado e sem campo excluído; `reautenticar` mantém o diálogo aberto com o erro no campo em 400 e fecha com toast em 429; `consentimento` mostra o texto literal e reabre no 428 (D-57); `DMC_init` e os boots legados não chamam catálogo, liberações nem progresso com `precisaTrocarSenha` (D-63, com `page.route`); loja e obrigado sem `data-tilt`, `loja-card__shine`, `style=` nem `.style.*` de cor e R10 verde (D-69); checkout do pedido por `page.route` (D-79): 201 → `obrigado.html?protocolo=` com itens e total da resposta simulada do atendimento (nunca da query), 409 `ja-liberado` tira o curso e mostra o alerta, 429/503 mantêm o carrinho sem navegar, 404 segue o caminho legado com o texto honesto e o atalho; `confirmarNaTela` passa com o `confirm` nativo e com o `DMC_UI.confirmar` (`data-pf-acao`, D-76); `monitorarConsoleERede` tolera só a lista da fase (D-73) e reprova um 404 fora dela; `paginasDoPortal()` recusa entrada de `portal-<x>.paginas.js` com `fatia` de outra dona e página repetida (D-74). **F0b-final**: boots mortos removidos com prova de `grep` |
| F0s | **G0-a**: `portal-shell.spec.js` (parte G0, D-61) verde — destino por papel (aluno, professor e admin semeados direto no banco descartável), `?next=` validado, guarda de papel do `DMC_Portal`, `DMC_bootLogin` com e-mail (com e sem sessão), modo restrito do lado do cliente simulado por `page.route` (`/api/auth/me` com `precisaTrocarSenha:true`, `perfil.html` servido por stub): nenhuma chamada a catálogo, liberações ou progresso e navegação para `perfil.html#seguranca`; shell sem rolagem horizontal de 320 a 1920 nos níveis 0 e 2 de texto, com menu, busca, sino e diálogo abertos; shell que degrada sem `DMC_UI` (§7.6); foco preso e devolvido em gaveta e diálogos; tour só por teclado; axe 0 serious/critical no shell, nos dois temas, 1440 e 390; literais religados de `portal.css` iguais aos de `tokens.css` (teste estático); menu do backoffice desenhado a partir de `itens` falsos passados por `DMC_Portal.iniciar({ area:'backoffice', itens })`, em array e em função chamada depois da guarda (D-75). **F0s-final**: bloco `@dmc-compat` removido com prova de `grep` |
| F0p | **G1** (com as rotas da F0t no ar): `portal-titular.spec.js` verde — perfil completo (CEP pelo ViaCEP falso do servidor de QA; consentimentos de nome social, redes, gênero e etnia com o texto literal do servidor e o 428 que reabre o aceite sem perder o digitado; foto com [Concordo] antes de [Enviar foto]; 2FA com QR local; troca de senha), Meus dados (6 finalidades, [Retirar autorização] com `efeitoRevogacao`, exportação, pedidos), notificações, busca; `acesso-link.html` apaga o fragmento antes da chamada; e os casos que saíram do `portal-shell` (D-61): `DMC_bootLogin` com CPF, desvio do 2FA para `login.html?next=` com `dmc:aviso`, e modo restrito real — professor criado pela coordenação (`POST /portal/admin/equipe`) e aluno com senha gerada entram, caem em `perfil.html#seguranca`, trocam a senha e chegam ao destino do papel com 0 requisição 4xx; `acesso-link.html` nos modos `#pedir-link` e `#esqueci` (UX §8.5, D-71): pedir link e pedir redefinição com e sem conta (mesma mensagem, e-mail lido em `/__qa/emails` só quando há conta), 503 `email-indisponivel` e `recursos()` falso (formulário some, texto honesto), botão inativo por 60 s, link vencido → [Pedir novo link] → `#pedir-link` (acesso) ou `#esqueci` (redefinição), fragmento apagado antes da chamada e e-mail ausente da URL; `portal-titular.paginas.js` com as páginas da F0p |
| F0r | **G0-a**: marcadores postos sem mudar regra; captura de `login-classico.html` idêntica depois de cada bloco; `cabecalho-ead.mjs` com dry-run e idempotente, entregue em S1; fases B e C feitas só depois de S2; `front-estatico.test.js` com `POSSE` (importada de `tests/tools/posse-ead.mjs`, copiada de §8.1 e usada também pelo `_portal.js`, D-73), `PENDENTES_FASE_1` (só arquivos de fatias da fase 1) e os modos `QA_FATIA`/`QA_ESTRITO` (D-62); 0 cor neon computada e axe de cor e contraste limpo em todas as páginas legadas fora de `PAGINAS_PENDENTES_G0` (D-67), nos dois temas, 1440 e 390 (axe completo nas páginas da F0r); `contraste.mjs` com os pares e as distâncias ΔE da UX §2.2–§2.3; `loja.html`/`obrigado.html` sem `<script>` inline nem `style=`, R10 verde; `_qr.js` (D-68) pronto e testado contra um QR gerado na hora. **G1**: `tutoriais.html` só com guias de telas que existem (testado nas portas da principal, em janela combinada, §9.1). **F0r-final** (G2, UX §6.17): cada uma das 10 categorias com ≥ 1 guia conferido com a tela final; cada um dos 17 guias do catálogo publicado ou registrado no relatório de entrega como "fora desta rodada: <motivo>" (nunca aviso na central); guia que cita entrada por CPF ou 2FA só com o item 1a de §9.9 cumprido (D-71); trechos congelados de `plataforma.css` removidos só depois da aposentadoria de `login-classico.html` (D-44) |
| F1a | P1 entregue (`estudos/video.js` com a tabela de `normalizarVideo`, inclusive o caminho de mesma origem, caso movido de `portal-base-util`, D-64); `estudos-*.test.js` verdes (watch, youtu.be, shorts, live, embed, Vimeo com e sem hash, MP4 externo e de mesma origem; recusa `javascript:` e host fora da lista; busca `aulas` só de curso acessível, caso movido de `portal-base-servicos`); catálogo sem acesso não traz URL de vídeo nem material, mas mantém contagens (loja intacta); `PUT /progresso` 403 sem acesso; material link sem acesso 403 sem `Location`; DELETE de curso/módulo/aula com bloqueio → 409; `pctVideo` só cresce e conclui a ≥ 90% chamando `aoConcluirAula` uma vez; plano estruturado igual em `planos` e no `Conteudo` (DC-61); capas (D-56): JPG/PNG/WebP pelos bytes, ≤ 1 MB, metadados removidos, nome aleatório novo a cada envio e binário anterior apagado, imagem pública com cache longo, `capaVerticalUrl` em `me/cursos` e `modulos[].capaUrl` em `trilha` e `Conteudo`, professor 403; `migrar-materiais.js` com dry-run padrão, idempotente, sem apagar o disco; o caso "módulo que lança no `montar` não derruba `GET /api/catalogo`" com o router real em `estudos-legado` (API DC-74); `PUT`/`DELETE /api/progresso` de docente e admin gravam como hoje, nunca 204 (API DC-78); D5 R4, R5, R7, R9 e R11 verdes com `QA_FATIA=F1a` |
| F1b | **P1f** (D-74): `aula.html` + `player.js` + `estudos-dados.js` + `video.js` entregues primeiro, montando a seção 4 com `DMC_Avaliacao.montar` quando o global existe (sem ele, a seção some sem erro). **G1**: `portal-estudos.spec.js` verde: "Continuar" leva à 1ª pendente (R7); YouTube normalizado (`watch`, `youtu.be`, `shorts` → `www.youtube-nocookie.com/embed/<id>`, com `page.route` no lugar do provedor, D-77); navegação linear por itens com "n de N"; materiais aparecem e baixam; player 100% por teclado com "n de N" e conclusão anunciados; contagens iguais em Início, Meus cursos, player e certificados (E2E compara os quatro); capa vertical quando houver e, sem ela, recorte central ou capa tipográfica; miniatura do módulo com a capa ou o número; MP4 de mesma origem toca e mede %; ids e `data-*` de R4–R7 preservados (D5 com `QA_FATIA=F1b`); entradas da F1b fora de `PENDENTES_FASE_1` |
| F2 | `avaliacoes-*.test.js` verdes; nenhuma resposta ao aluno contém gabarito antes de finalizar nem `respostaReferencia` nunca, inclusive na prévia e no exportador (varredura do JSON, DC-62); prazo vencido = envio pelo servidor; uma tentativa aberta por vez (duas abas e corrida); dissertativa sem correção deixa nota `null` e "aguardando correção"; `limiteCaracteres` no snapshot e 400 `resposta-longa`; correção com `publicar:false` sem nota, AVL, selo, notificação nem auditoria e `efeito` igual ao calculado à mão; `publicar:true` publica (DC-63); entrega de TCC só no módulo `tcc` (PDF ativo 415, IDOR, selo com o sha256; DC-66), com envio e substituição por teclado; professor só corrige o que leciona (403/404); recorreção e concessão auditadas com antes/depois; banco insuficiente bloqueia a publicação; prévia na rota `#/avaliacoes/:id/previa` sem gravar nada; avaliação inteira por teclado; cronômetro com anúncios aos 10, 5 e 1 minuto; entrega de TCC por `POST` (substitui, API DC-71); E2E e `portal-qualidade` nas URLs hospedeiras de `portal-avaliacoes.paginas.js` (player e `professor.html`), depois do P1f, com `PORTAL_MODULOS` = F2 + `portal-conteudo.js` (D-74) |
| F3a | P1 entregue (`calculo-academico.js` com os critérios do curso nas DUAS regras, API DC-66); `academico-{calculo,rotas,encontros,comprovantes}.test.js` verdes; selo de frequência recalculável (`integro`); presença só na janela e idempotente; calendário por teclado (exceção de alvo do dia do Mês marcada, §9.6); KPI sem dado = "—" + motivo; mesma frequência em Acadêmico, Comprovantes, matriz da turma e relatório (E2E); `lives` legado inalterado sem `turmaId` e `#lives-lista` preservado (R8); impressão de Acadêmico e Comprovantes (emulação `print`): em Comprovantes, cada linha com o próprio código FRQ/AVL e o hash abreviado, URL de `validar.html` no rodapé e nenhum QR (D-16, D-72); o código de uma linha digitado em `validar.html` confere; `notaMinima` no `ResumoMatricula` (D-80) |
| F3b | `academico-{cursos,declaracoes,legado}.test.js` verdes; `certificado.html?codigo=` antigo valida e imprime; emissão bloqueada sem aprovação quando há modular publicada e liberada pela regra antiga quando não há, com os critérios (frequência, carga, TCC) nas duas regras (DC-66); emitidos continuam válidos; selo do certificado e `hashPrefixo` na lista, no GET e no despacho, e certificado antigo como "Emitido antes da verificação por selo" (DC-65); nome: social (ato da coordenação) → registro → conta, com a confirmação do nome e [Completar cadastro] antes de emitir quando `nomeOrigem:'conta'` (DC-64, D-53); R9 (conferindo `nomeOrigem:'registro'`) e R9b verdes; lato sensu recusado sem IES; validação pública sem dado pessoal (varredura de chaves nos 5 prefixos); `POST …/codigos` com `refazer:true` exige `motivo` (D-54); impressão de certificado e declaração com código, QR conferido por `_qr.js` (margem 4, matriz igual à esperada, ≥ 28 mm, D-68) e URL; `notaMinima` no `GET /api/cursos/:cursoId/certificado` e as `pendencias[]` com o link que resolve na tela (UX §6.9, D-80) |
| F4a | `secretaria-{matriculas,legado}.test.js` verdes; contrato de `/api/liberacoes` inalterado (R12 por API) e simulação dev coberta em `secretaria-legado.test.js` com `devSimularPagamento:true` injetado na fábrica de `liberacoes.js` — mesmo contrato e resposta, `garantirMatricula` chamado (D-49); serviços de matrícula entregues primeiro (§8.3), inclusive `matriculaPorId` e `vincularContrato` (único escritor de `matriculas.contratoId`, com auditoria `executar`, D-78); matrícula materializada sem duplicar (corrida); revogar liberação não cancela (`semAcesso`); `liberarAcesso:false` cria a matrícula sem liberação (D-79); `?userId=` em `GET /portal/admin/matriculas` (API DC-73); lista e detalhe com `contrato` vindo de `contratos.situacaoPorMatricula` e omitido sem a F4b; `matriculas-de-liberacoes.js` com dry-run e idempotente; E2E e `portal-qualidade` em `professor.html#/matriculas` e `#/turmas/nova` (P1f) |
| F4b | `secretaria-{documentos,contratos}.test.js` verdes; matriz IDOR (aluno A não lê documento/contrato de B; professor 403 em documentos); `POST /portal/admin/contratos` grava `matriculas.contratoId` só por `secretaria.vincularContrato` (falso nos testes) e, sem a F4a, responde 503 sem gravar nada (D-78); contrato assinado imutável e hash exibido = hash assinado; validações da assinatura na ordem da API; auditoria que falha → 503 e contrato intacto; reenvio preserva o histórico; PDF ativo e HTML disfarçado → 415; comprovante de assinatura com QR conferido por `_qr.js`; `portal-documentos.spec.js` verde com `PORTAL_MODULOS` = F4b + `portal-turmas.js` (D-74) |
| F5 | `financeiro.test.js` verde; estado vazio honesto (nenhum dado de exemplo); somas em centavos conferidas; virada de dia SP × UTC; KPIs não mudam com o chip; IDOR verde; pagar, estornar e cancelar auditados com antes/depois; campo de cartão descartado; quitação com todos os 409, idempotência e revogação por substituição; "Vence em N dias" com N ≤ 3 (D-18); impressão do Financeiro; nenhum texto ou botão de "Meus cartões" ou pagamento on-line; pedido da loja (API §6.9, DC-69): itens e total recalculados do catálogo (preço do cliente ignorado), item sem preço `null` e total `null`, 409 `ja-liberado`, `reaproveitado` em 24 h sem novo protocolo, 6º pedido na hora → 429, sem F6a → 503 sem gravar; E2E da loja ao obrigado com `PORTAL_MODULOS` = F5 + F6a + F4a: protocolo e valores do servidor em `obrigado.html?protocolo=`, carrinho vazio, o pedido na fila `?pedido=1` da coordenação (D-74, D-79) |
| F6a | P1 entregue (`rag.js`); `atendimento-{protocolos,ouvidoria,config}.test.js` verdes; roteamento por categoria e pela turma da matrícula; professor não vê ouvidoria não encaminhada; visão do professor sempre saneada nos 4 tipos e denúncia não se encaminha (409); 2º parecer no mesmo encaminhamento → 409 `transicao-invalida` (D-54); identidade só com `?identidade=1` auditado; prazo de 15 dias em `privacidade`; busca `atendimentos` sem atendimento alheio (caso movido de `portal-base-servicos`, D-64); instituição com `endereco` em texto e `motivo` obrigatório ao alterar dados já salvos, `sistema.instituicaoPendente` no painel e `ouvidoriaSemParecer` exato (D-54); regulamento: prévia não grava, publicar arquiva o anterior e incrementa `edicao`; âncoras (DC-70): `GET /portal/regulamento` com `trechos:[{ id, titulo, inicio, fim }]` e todo `trechoId` de `recuperar` presente na leitura, com o `regulamentoId` preservado (D-81); `regulamento.html` com índice de seções, âncora `r-<regulamentoId>-<trechoId>`, foco no H3 na chegada, trecho de edição substituída com o aviso e impressão (UX §6.20); `abrirProtocolo` com `pedido` congelado e `?pedido=1` só para a fila da coordenação (DC-69) |
| F6b | `atendimento-{ia,ia-config}.test.js` verdes com Gemini falso (zero rede); a chave não aparece em resposta, log nem auditoria; header `x-goog-api-key` e URL sem `key=`; instrução v1 literal; mascaramento de todo o corpo enviado; `userId` das ferramentas vem da sessão; saída do modelo renderizada como texto e `acoes` só do servidor; sem consentimento → 428; `textoSha256` divergente no consentimento → 409 `conflito-versao` (D-54); sem vínculo → 403 `ia-sem-curso`; prévia do escalonamento com `?categoria=&cursoId=` (D-54); trilha sobrevive ao "apagar histórico"; teto global diário; reautenticação para salvar e remover a chave (`DMC_UI.reautenticar`); `portal-assistente.spec.js` verde com o Gemini falso do servidor de QA (D-41); consentimento gravado só por `consentimentos.registrar` da F0t (API DC-72); `fontes[]` com `regulamentoId` e link que abre `regulamento.html` no trecho certo (D-81) |
| F7 | `comunicacao*.test.js` verdes; público-alvo aplicado no servidor (aluno fora da turma não vê) e revalidado em `PUT`, publicar e arquivar; vigência do banner no servidor; links só https com `rel="noopener noreferrer"`; professor só publica para os próprios cursos e turmas (403) e só vê relatórios deles, sem colunas `somenteAdmin`; `resumo` dos 7 painéis sobre o conjunto filtrado inteiro; CSV com proteção contra fórmula, teto de 20.000 linhas e sem CPF; painel com serviço ausente → bloco `null` |
| F8 | **P1f** (D-74): `professor.html` + `professor.js` entregues primeiro (`registrar`, `iniciar`, `navegar`, `itensDoMenu`, moldura com `pai`/`aba` e `ctx`), testados com uma rota falsa registrada no próprio spec. **G1**: `professor-portal.test.js` verde; `GET /portal/professor/alunos/:userId/matriculas` com `semMatricula` e sem criar matrícula na leitura, e o seletor "Matrícula" da moldura remontando a aba (API DC-73); depois de 3 reordenações "Adicionar módulo" cria exatamente 1 módulo (E2E); R11 (efeitos na API) verde e os caminhos de tela da coordenação para curso, liberação e encontro cobertos em `portal-professor.spec.js`; professor recebe 403 em curso não vinculado e não vê o item no menu; respostas ao professor sem CPF, RG, endereço ou documentos (teste); `parcerias.spec.js` verde com a guarda própria de `parcerias.html` (D-48); roteador com hash desconhecido, papel insuficiente, foco no H1 e título, e SÓ em `professor.html` (em `admin.html` nenhum hash reescrito, D-66); menu de `admin.html`/`parcerias.html` com links `professor.html#/…` filtrados por papel; moldura de `alunos/:userId` e `turmas/:id` com abas por papel e por rota registrada, troca de matrícula remontando a aba (D-65); envio de capa vertical e de capa do módulo e "Tipo do módulo: Regular \| TCC" (admin) no editor (D-56, D-53); contagem "Ouvidoria (encaminhadas)" pelo `ouvidoriaSemParecer`; `#lib-nome`, `#modal-import`, `#btn-import`, `#btn-reset` e Playfair removidos; inputs do editor com `<label>`; nenhum `alert/confirm/prompt` em `admin.js`; entradas da F8 fora de `PENDENTES_FASE_1` e detector de neon e axe de cor completos em `admin.html` e `parcerias.html` (D-67); `boot-admin.js` no lugar do boot inline |

### 8.6 Definição de pronto comum (toda fatia)
1. **Comando de unidade da fatia** verde (§9.1, D-62): os testes estáveis (os 5 arquivos legados e os da F0a e da
   F0m, verdes desde o G0) + os testes da fatia (fábricas + repositórios falsos, padrão `bolsas.test.js`) +
   `front-estatico.test.js` com `QA_FATIA=<fatia>`, cobrindo 401/403/404, validação, IDOR, `formato-invalido` com
   objeto em campo de texto, 409 de versão, auditoria das ações sensíveis e varredura de segredo no JSON (API §9.2).
   Um teste vermelho de outra fatia, ainda em obra no mesmo working tree, não reprova esta; o `npm test` inteiro roda
   na integração da principal (item 2a).
2. E2E da fatia + os casos de `portal-regressao-d5` que a fatia roda na fase 1 (coluna de §9.3) + `portal-qualidade`
   só nas páginas e URLs hospedeiras da fatia (`portal-<x>.paginas.js`, D-74), verdes no `serve.mjs` com
   `QA_SERVIDOR=1`, o `QA_PORT` da fatia, `QA_FATIA=<fatia>`, `QA_INTEGRADAS` (D-73), `PORTAL_MODULOS` = módulos da
   fatia + os das dependências de E2E declaradas em §8.4 (D-74) e, fora da F0t, da F0p e da F8,
   `PORTAL_MODULOS_IGNORAR` = os 9 módulos da F0t (§9.1). A verificação de links e de menus renderizados fica para o G2: na fase 1, os menus apontam para páginas de
   fatias que ainda não existem (R13).
2a. **Integração do G1** (principal, D-62): num `git worktree` fora do repositório, criado do HEAD commitado, com os
   arquivos da fatia copiados pela tabela de §8.1 e `node_modules` ligado por link simbólico, a principal roda o
   `npm test` inteiro, a D5 inteira e o `front-estatico` sem `QA_FATIA`; verde, commita a fatia com caminhos
   explícitos e remove o worktree (`git worktree remove`).
3. axe 0 serious/critical nos dois temas, 1440 e 390; 0 rolagem horizontal de 320 a 1920 (níveis 0 e 2 de
   texto); alvos ≥ 44 px abaixo de 1024 (exceção marcada `data-alvo-excecao`); 0 `console.error`/`pageerror`;
   0 violação da CSP estrita de `/plataforma-ead/` (report-only até o G2, aplicada no G2, §9.6); nenhum
   `<script>` inline nem `on*=`; 0 requisição 4xx/5xx inesperada; a entrada da fatia em `PENDENTES_FASE_1` limpa.
   "Inesperada" e a contagem de console e de `pageerror` são sempre medidas pelo helper único
   `monitorarConsoleERede(page, { fatia })` do `_portal.js` (D-73): ele tolera só (a) os 404 de `/api/portal/*` cujo
   prefixo pertence a fatia fora de `QA_INTEGRADAS` e fora da própria (mapa estático `PREFIXOS_API`, prefixo de rota →
   fatia, o mais longo vence), (b) os 404 de asset local cujo dono em `POSSE` é fatia ainda não integrada, (c) a
   mensagem "Failed to load resource" dessas mesmas URLs e (d) `pageerror`/`console.error` cuja origem (URL do script
   na pilha) é um asset dessas fatias; e as respostas que o próprio caso declara esperar (`esperar(page, { status,
   url })`: 401/403/404 de IDOR, 409, 429). A lista encolhe a cada integração de G1 e fica vazia no G2
   (`QA_ESTRITO=1` ignora `QA_INTEGRADAS` e não tolera nada).
4. Só tokens (nenhuma cor literal fora de `portal.css`), prefixo `pf-`/`pf-<dominio>-`, HTML só por
   `DMC_UI.html`; sem `alert/confirm/prompt`, `on*=` inline, `console.log` de depuração, arquivo `_np_*`,
   backup ou código comentado morto; nenhum link interno quebrado; nenhum CTA falsamente funcional.
5. Nada inventado (D7); vazios honestos; textos sóbrios (OAB 205/2021), sem "MEC"/"pós" indevido; pt-BR.
6. Serviços, grupos e auditoria registrados conforme API §4.4 e §3.4.
7. Relatório de entrega em texto (sem arquivo `.md` novo): arquivos tocados, endpoints, coleções e índices,
   serviços, decisões e pendências — a principal consolida em `DECISIONS.md`/`PROGRESS.md`/`server/README.md`.
8. Nenhum arquivo fora da posse; nenhuma asserção D5 alterada sem pedido aceito (§8.2 item 7); nenhum commit;
   processos encerrados só pelo próprio PID.

---

## 9. Plano de QA e regressão

### 9.1 Ambientes, portas e bancos (faixa 4630–4659; nada fora dela)

As 19 fatias não trabalham ao mesmo tempo: a fase 0 tem 5 (F0a, F0m, F0b, F0s, F0r) e a fase 1 tem 15 (14 + a F0r com
os tutoriais, que na fase 1 testa nas portas da principal, em janela combinada, como as correções de fase 0, D-78).
Por isso as portas são atribuídas por fase; banco manual `complexodmc_portal_<fatia>_qa` (ex.
`complexodmc_portal_f1a_qa`), e o da principal é `complexodmc_portal_qa`.

| Fase 1 · quem | Servidor manual (`PORT`) | Playwright (`QA_PORT`) | Na fase 0, a mesma dupla é de |
|---|---|---|---|
| principal / integração | 4630 | 4631 | principal |
| F0t | 4632 | 4646 | F0a |
| F0p | 4633 | 4647 | F0m |
| F4b | 4634 | 4648 | F0r |
| F1a | 4635 | 4649 | F0b |
| F1b | 4636 | 4650 | F0s |
| F2 | 4637 | 4651 | — |
| F3a · F3b | 4638 · 4639 | 4652 · 4653 | — |
| F4a · F5 | 4640 · 4641 | 4654 · 4655 | — |
| F6a · F6b | 4642 · 4643 | 4656 · 4657 | — |
| F7 · F8 | 4644 · 4645 | 4658 · 4659 | — |

A faixa inteira está ocupada na fase 1 (14 fatias com portas próprias + principal). Correção pedida a uma fatia da fase
0 durante a fase 1 (§8.2 item 2) e os tutoriais da F0r testam nas portas 4630/4631, em janela combinada com a principal.

- **Unidade por fatia** (fase 1, D-62): `NODE_ENV=test QA_FATIA=<fatia> node --test
  server/test/{bolsas,contato,newsletter,parcerias,vitrine}.test.js server/test/portal-base-{papeis,util,indices,montagem,comuns}.test.js
  <arquivos de teste da fatia, §8.1> server/test/front-estatico.test.js` (os dois primeiros grupos são os testes estáveis,
  verdes desde o G0; fatia sem teste de servidor — F0p, F1b — roda só eles e o estático). `portal-base-{indices,montagem}`
  ficam no grupo estável porque, com `QA_FATIA`, importam só os módulos da fatia pelo campo `fatia` de `MODULOS_PADRAO`
  (API DC-75). Fase 0, G2 e integração: `npm test` inteiro.
- **E2E por fatia** (fase 1): `QA_PORT=<porta> QA_WORKERS=2 QA_DATA=<AAAA-MM-DD>-<fatia> QA_FATIA=<fatia>
  QA_INTEGRADAS=<fatias já integradas, lista que a principal mantém em PROGRESS.md> PORTAL_MODULOS=<caminhos dos
  módulos da fatia + os das dependências de E2E de §8.4, API §5.1> [PORTAL_MODULOS_IGNORAR=<os 9 módulos da F0t>] npx
  playwright test tests/e2e/portal-<x>.spec.js tests/e2e/portal-regressao-d5.spec.js tests/e2e/portal-qualidade.spec.js`.
  Com `QA_FATIA`, a D5 roda só os casos marcados para a fatia (coluna "Roda na fase 1" de §9.3) e o `portal-qualidade`,
  só as entradas com `fatia === QA_FATIA` de `paginasDoPortal()` — páginas próprias e URLs hospedeiras (D-74). Os módulos da F0t entram só no E2E da F0t, da F0p e da F8 (que usam as rotas
  dela); nas demais fatias, `PORTAL_MODULOS_IGNORAR` os pula, para que trabalho da F0t em andamento não derrube o E2E de
  outra fatia (o `routes/auth.js` segue a regra do arquivo sempre importável, §8.2 item 6a). As rotas legadas entram
  sempre. Fase 0, integração de cada G1 e G2: sem `PORTAL_MODULOS`, sem `PORTAL_MODULOS_IGNORAR` e sem `QA_FATIA`, com
  `QA_INTEGRADAS` = as já integradas + a que entra (na fase 0, as cinco da fase 0) e `QA_ESTRITO=1` no G2.
- O `tests/server/serve.mjs` (principal) sobe e derruba sozinho um mongod descartável (nunca lê `server/.env`, trava
  a URI em loopback) e, a partir da fase 0, também (D-41): define `QA_SERVIDOR=1`; sobe em `127.0.0.1` um servidor
  falso com o Gemini (`GET /v1beta/models/:modelo`, `POST …:generateContent` com respostas roteirizadas por teste), o
  ViaCEP (`/ws/:cep/json/`) e o Resend (`POST /emails`, mensagens guardadas e lidas pelo E2E em `GET /__qa/emails`,
  rota só deste servidor); e define `PORTAL_GEMINI_URL`, `PORTAL_VIACEP_URL`, `PORTAL_RESEND_URL` apontando para ele,
  `RESEND_API_KEY='qa-falsa'`, `PORTAL_EMAIL_FROM='Plataforma QA <qa@exemplo.invalid>'` e
  `PORTAL_BASE_URL=http://127.0.0.1:<QA_PORT>` (o `serve.mjs` já define `VERCEL=1`, e sem essa variável os fluxos por
  link ficariam indisponíveis). `playwright.config.js` não muda (o `webServer` repassa o ambiente). Evidências em
  `docs/dmc/qa/…` (fora do git, T4).
- Verificação manual: a partir de `server/`, `PORT=<porta> MONGODB_DB=<banco>_qa node src/server.js &`, guardar `$!`,
  conferir antes que `MONGODB_URI` aponta para `127.0.0.1`; semente com `node scripts/seed.js` +
  `node scripts/seed-portal-qa.js` (recusa banco sem `_qa`); encerrar só com `kill <PID guardado>`. O servidor manual
  não envia a CSP da `vercel.json` (só o `serve.mjs` a reproduz); critério de CSP vale no E2E. Proibido:
  `complexodmc_local`, portas 4611/4612/3000/8090 e 4671–4691, `pkill`/`killall`/`kill -9` por nome.

### 9.2 Linha de base (F0b, antes de qualquer edição)
1. Capturas 1440 e 390 de todas as páginas atuais da EAD (inclusive `login-classico.html`, `admin.html` com curso
   aberto, player com vídeo, loja com carrinho aberto).
2. `portal-regressao-d5.spec.js` escrito contra o comportamento ATUAL e verde; continua verde depois do reskin e em
   toda a fase 1 sem mudar asserção. Ele verifica **invariantes de efeito** — rota, resposta da API e resultado
   persistido —, nunca texto, rótulo ou layout que a UX redesenha. Os únicos seletores de tela são os ids e `data-*`
   da coluna "obrigatórios" de §9.3, declarados em `SELETORES_D5` (`_portal.js`); a fatia dona é OBRIGADA a
   preservá-los. Tirar um seletor da lista ou mudar uma asserção = pedido escrito ao dono (F0b) via principal, com
   justificativa (D-45).
3. **Diálogos** (D-76): efeito cujo caminho de tela a própria dona é obrigada a trocar (`prompt` do link de material,
   exclusões com `confirm`, `alert` do 429, confirmação do nome antes de emitir) é disparado **pela API** na D5, com a
   sessão do papel semeado, e conferido na API (R6 apagar dúvida, R9b emitir, R11 material-link, exclusões e remover
   capa). Caso que continue pela tela e passe por confirmação usa `confirmarNaTela(page)` do `_portal.js`, que aceita
   o `dialog` nativo (aceita) e o `DMC_UI.confirmar` (clica em `[data-pf-acao="confirmar"]`, gancho exigido do `ui.js`
   no S3 e listado em `SELETORES_D5`); hoje nenhum caso da D5 depende dele, e os specs das fatias (F1b, F8) o usam
   para testar os mesmos fluxos pela tela antes e depois da troca. Vídeo na D5 só com Vimeo e MP4 de mesma origem,
   com `page.route` no lugar do provedor (D-77).

### 9.3 Fluxos existentes que não podem quebrar (`portal-regressao-d5.spec.js`)

Coluna "Roda na fase 1" (D-62): com `QA_FATIA`, cada fatia roda só os casos de que é dona ou que passam por rota de
servidor dela; a D5 inteira roda na integração de cada G1 (§8.6 item 2a) e no G2. Cada caso leva a marca das fatias
(`@F1a`, `@F1b`…) e o spec filtra por `QA_FATIA`.

| # | Fluxo | Invariante (rota, API, resultado) | Ids e `data-*` obrigatórios · dono | Fica em outra spec | Roda na fase 1 |
|---|---|---|---|---|---|
| R1 | `index.html` | sem token → `login.html`; token de aluno → `dashboard.html` | — · F0b | destino de professor e admin → `portal-shell.spec.js` (F0s) | só integração |
| R2 | Sessão expirada em página interna | 401 apaga `dmc:token` e a página termina em `login.html` (query livre) | — · F0b | `?next=<página>` → `portal-shell.spec.js` | só integração |
| R3 | Login da 2d | conta de aluno: `login.html` → `DMC_Auth.signIn` → `dashboard.html` | campos do formulário por nome acessível · 2d | destino de professor/admin e `next` → `login-portal.spec.js` (principal, com a 2d) | F0t (mexe no signin) |
| R4 | Início e catálogo | curso sem acesso: link para `loja.html?destacar=<id>`; curso liberado: trilha renderizada; marcar aula → `PUT /api/progresso/:aulaId` 2xx e a aula aparece em `GET /api/progresso`; a escolha persiste em `dmc:cursoEscolhido` | `#modules-list`, `[data-curso-id]` em cada cartão ou link de curso, `[data-aula-id]` em cada aula da trilha · F1b | carrossel, "Outros cursos", `data-stat-*`, sanfona → `portal-estudos.spec.js` | F1b · F1a |
| R5 | Player legado | `aula.html?id=X` abre a aula X (título vindo da API); a semente só usa Vimeo (`https://player.vimeo.com/video/<id>`) e MP4 de mesma origem (D-77): `iframe` cujo `src` começa por `https://player.vimeo.com/video/<id>` (com `page.route('https://player.vimeo.com/**')` devolvendo um stub, sem rede externa) e `<video>` cujo `src` (ou `<source>`) é o MP4 servido por `page.route` — presença e `src`, não reprodução; aula "em breve" por link direto não mostra vídeo; concluir grava em `/api/progresso` | `#player-root`, `#player-stage`, `#btn-done`, `#player-duvidas` · F1b | anterior/próximo e navegação por itens; YouTube (`watch`, `youtu.be` → `www.youtube-nocookie.com/embed/<id>`) e o MP4 que toca e mede % → `portal-estudos.spec.js` (F1b) | F1b · F1a |
| R6 | Dúvidas da aula | aluno pergunta pela tela → `POST /api/aulas/:aulaId/duvidas` 201 e a 2ª em menos de 15 s → 429 conferido na resposta de rede (o aviso na tela, hoje `alert`, não é asserção); resposta da coordenação (rota legada) aparece ao aluno; o autor apaga a sua **pela API** (`DELETE /api/duvidas/:id` → some de `GET /api/aulas/:aulaId/duvidas`; hoje a tela usa `confirm`, D-76) | `#player-duvidas`, `[data-duvida-form]` · F1b | resposta pela fila da coordenação; apagar pela tela → `portal-professor.spec.js` (F8) e `portal-estudos.spec.js` (F1b) | F1b · F8 |
| R7 | Meus cursos | lista só os cursos com acesso (títulos da semente) | `#meus-cursos-lista` · F1b | "Continuar" → 1ª pendente (hoje quebrado) → `portal-estudos.spec.js` | F1b · F1a |
| R8 | Aulas ao vivo | só encontros de cursos com acesso; situação pelo relógio (agendada / ao vivo / encerrada); link da sala só dentro da janela, na página e em `GET /api/lives` | `#lives-lista` · F3a | calendário → `portal-academico.spec.js` | F3a |
| R9 | Certificados | aluno com perfil identificado (nome de registro e CPF gravados direto no banco descartável pela semente) e 100% num curso sem avaliação: emitir → código `DMC-…`; `certificado.html?codigo=` valida sem login; impressão (`emulateMedia('print')`) mostra o código (a semente de perfil continua; o `nomeOrigem:'registro'`, que não existe no código de hoje, é conferido em `academico-legado.test.js` e `portal-declaracoes.spec.js`, nunca na D5, que nasce verde contra o código atual) | `#certificados-lista` · F3b | regra de aprovação e `nomeOrigem` → `portal-declaracoes.spec.js` | F3b · F1a |
| R9b | Certificado sem perfil (D-53, API DC-64) | aluno SEM perfil, 100% num curso sem avaliação: emite **pela API** (`POST /api/cursos/:cursoId/certificado`, porque a F3b acrescenta a confirmação do nome na tela, D-76) com o nome da conta, como hoje — a validação legada `GET /api/certificados/validar/:codigo` devolve o `nomeAluno` igual ao `users.nome` da semente, no formato de hoje (verde contra o código atual; o `nomeOrigem:'conta'` é conferido em `academico-legado.test.js`) | `#certificados-lista` · F3b | caminho de tela: confirmação "O certificado sairá com o nome «X», da sua conta…" com [Completar cadastro] → `perfil.html#identificacao` e [Emitir assim mesmo] → `portal-declaracoes.spec.js` | F3b |
| R10 | Loja → obrigado | adicionar/remover atualiza total e `[data-cart-count]`; finalizar → a página termina em `obrigado.html` (query livre) com `dmc:carrinho` vazio; **com a F5 montada** (conferido em `GET /api/portal/saude` → `carregados`), a URL traz `?protocolo=ATD-…` e `GET /api/portal/me/atendimentos/:protocolo` devolve `pedido` com os `cursoIds` do carrinho (D-79); sem a flag, `POST /api/liberacoes/dev/simular-pagamento` → 404 e o botão de desenvolvimento não libera curso | `#cart-drawer`, `#cart-list`, `#cart-checkout`, `[data-cart-count]` · F0r (markup de `DMC_bootLoja`: F0b, D-69; contador no shell: F0s) | simulação com a flag → `secretaria-legado.test.js` (F4a, D-49); valores do servidor, `reaproveitado`, 409 `ja-liberado` → `portal-financeiro.spec.js` (F5); 404/409/429/503 do lado do cliente → `portal-ui.spec.js` (F0b, `page.route`) | F0r · F4a · F5 |
| R11 | Admin cursos | **pelo editor**: criar curso, editar no blur, enviar capa, módulo criar/editar/reordenar (arrastar e setas), aula criar/editar / No ar–Em breve / roteiro, material PDF, exportar JSON; **pela API** (D-76: a F8 troca `prompt`, `confirm` e a confirmação embutida do módulo por formulário e `DMC_UI.confirmar`): criar material-link, excluir aula, material, módulo e curso, remover capa — cada ação conferida na API (`/api/catalogo`, `/api/capas/*`, `/api/materiais/*`) | `data-*` que `admin.js` usa para achar curso, módulo, aula e material (lista em `SELETORES_D5`) · F8 | rótulos, diálogos, layout e as exclusões pela tela (com `confirmarNaTela`) → `portal-professor.spec.js` | F8 · F1a |
| R12 | Liberações e encontros (legado) | conceder/revogar por e-mail (`/api/liberacoes`) e criar/editar/remover encontro (`/api/lives`) respondem como hoje e o efeito aparece ao aluno | — (por API) · F4a · F3a | o caminho de tela da coordenação, que a F8 leva para `#/matriculas` e `#/ao-vivo` → `portal-professor.spec.js` | F4a · F3a |
| R13 | `parcerias.html` | `tests/e2e/parcerias.spec.js` inteira (principal) | `#pa-restrito` e o redirecionamento `login.html?next=parcerias.html` · F8 (guarda própria, D-48) | — | F8 |
| R14 | Site | specs do site (navegação, home, rotas, console, `vercel-config`) | — · principal | `server.js` ganha três pontos; `vercel.json`, a CSP de `/plataforma-ead/` | só integração |

### 9.4 E2E por papel e jornadas
Papéis semeados por `_portal.js` (cadastro pela API + promoção no banco descartável, padrão `parcerias.spec.js`):
anônimo · aluno sem liberação · aluno A com liberação, matrícula, turma e perfil identificado · aluno B (mesma turma)
· professor vinculado ao curso X · professor sem vínculo · admin. Matriz mínima: a de §5.2, com as respostas
esperadas da API §2 (401/403/404/200) para conteúdo, avaliação, documento, contrato, lançamento, protocolo,
conversa de IA, perfil, ouvidoria, equipe, configurações, validação pública e `professor.html`.

Jornadas ponta a ponta (uma por papel, cronometradas; provedores externos sempre os falsos do `serve.mjs`, D-41):
- **Aluno**: entra, faz o tour, completa o perfil com CEP (ViaCEP falso), assiste a uma aula até 90% (MP4 de mesma
  origem `tests/fixtures/video-teste.mp4`, F1b), conclui materiais, faz a prévia e a modular (objetiva +
  dissertativa), vê "aguardando correção", envia documento, assina contrato, vê lançamento, conversa com o
  Assistente (Gemini falso) e escala para a equipe, abre protocolo, emite declaração e valida em `validar.html`,
  pede link de acesso e entra por ele (e-mail lido em `/__qa/emails`).
- **Professor**: entra com a senha temporária (modo restrito, 0 requisição 4xx), troca a senha, corrige a
  dissertativa, vê a nota no Acadêmico do aluno, registra encontro e confere presença, publica para a turma, responde
  dúvida.
- **Admin**: cria turma e matrícula, anexa contrato, revisa documento, lança e baixa parcela, configura a IA (chave
  falsa → "Testar conexão" contra o Gemini falso), concede nova tentativa, exporta CSV, consulta na auditoria o que
  foi feito.
Se o servidor falso não subir, as jornadas de IA, CEP e link ficam "bloqueadas" com o motivo (nunca "verdes"); os
casos equivalentes continuam cobertos nos testes de unidade (`fetchFalso`, `provedorGeminiFalso`).

### 9.5 Acessibilidade (WCAG 2.2 AA, critério de aceite — UX §11)
axe-core (`@axe-core/playwright`, já instalado) em toda página e em cada rota do `professor.html`, nos temas
escuro e claro, 1440 e 390, nos estados carregado, vazio, erro, diálogo aberto e gaveta aberta: 0 serious/
critical (no G0, com o escopo de §8.3). Estrutura (1 `h1`, `main#conteudo`, "Pular para o conteúdo",
`lang="pt-BR"`, nome acessível, `caption`); teclado nos fluxos críticos (assistir e concluir, fazer avaliação,
enviar documento, assinar contrato, corrigir e publicar, criar encontro, publicar avaliação, revisar documento,
baixar pagamento, salvar chave da IA); Esc fecha e devolve o foco; A+ no nível 2 sem rolagem horizontal em 320 px;
`prefers-reduced-motion` zera deslocamentos; `forced-colors` mantém forma do marcador e foco.

### 9.6 Qualidade transversal (`portal-qualidade.spec.js`, F0r, sobre `paginasDoPortal()` de `_portal.js`)

**Entradas** (D-74): `paginasDoPortal()` junta `PAGINAS_BASE` (as 34 páginas, cada uma com `{ pagina, fatia, url: () =>
'<pagina>' }`, do S0) com o que cada fatia declara em `tests/e2e/portal-<x>.paginas.js` — `PAGINAS = [{ pagina, fatia,
url(ctx), preparar?(ctx), hospedeira? }]`, em que `preparar` semeia o que a URL precisa (ids de `contrato.html?id=`,
`publicacao.html?id=`, `declaracao.html?id=`, `aula.html?…&item=avaliacao:<id>`) e `hospedeira:true` marca a URL de uma
página de outra fatia onde a tela desta roda (`professor.html#/avaliacoes`, o player). Um arquivo só declara entradas
com a própria `fatia`; página própria repetida reprova. Assim o `_portal.js`, congelado na fase 1, não precisa mudar
para cada fatia. Na fase 1 o spec roda só nas entradas com `fatia === QA_FATIA`; no G0, em todas as de `PAGINAS_BASE`
menos `PAGINAS_PENDENTES_G0` para o detector de neon e o axe de cor (D-67); na integração de cada G1 e no G2, em todas.
Console e Rede são medidos pelo `monitorarConsoleERede(page, { fatia })` do `_portal.js` (D-73, §8.6 item 3).

| Verificação | Critério |
|---|---|
| Rolagem horizontal | `scrollWidth ≤ innerWidth` em 320, 375, 390, 768, 1024, 1440, 1920, níveis 0 e 2 de texto, com gaveta, busca e diálogos abertos |
| Alvos de toque | interativos ≥ 44×44 px abaixo de 1024; exceção só com `data-alvo-excecao` (hoje apenas `calendario-dia` na visão Mês, UX §4.13, ≥ 24 px pela WCAG 2.5.8) |
| Temas | cada página nos dois temas; axe de contraste limpo; captura para revisão humana; captura também com `forced-colors: active` (alto contraste) de shell, marcadores e foco |
| Sem neon | para cada elemento visível (inclusive `::before` e `::after`) e para cada interativo com `:hover` e `:focus-visible` forçados (CDP `forcePseudoState`), lê as cores computadas de `color`, `background-color`, `border-top/right/bottom/left-color`, `outline-color`, `text-decoration-color`, `fill`, `stroke` e de cada cor dentro de `box-shadow` e `text-shadow`; converte r, g, b **ignorando o alfa** (pega `rgba(0, 255, 77, 0.45)`) e reprova matiz de 120° a 200° com saturação HSL acima de 60%. Pega `#00ff4d` (138°) e `#00e7fc` (185°) em qualquer alfa; a sálvia de sucesso (`#8ec899`, S ≈ 35%) e a info (≈ 213°) passam (conferido). Imagens e vídeos ficam fora. Prevalece sobre o texto da UX §3 fase E.2 (D-46). No G0, as páginas de `PAGINAS_PENDENTES_G0` (hoje `parcerias.html` e, se acusar, `admin.html`) ficam fora e passam no G1 da F8 (D-67) |
| Tipografia | H1 em Newsreader 300; corpo em Hanken Grotesk; nenhum peso > 600 |
| Impressão | `emulateMedia('print')` + `page.pdf()` de certificado, declaração, comprovantes, comprovante de assinatura, Acadêmico, Financeiro e regulamento: shell oculto, tinta preta, código/hash/QR/URL visíveis onde houver (QR só em certificado, declaração e comprovante de assinatura; comprovantes levam código e hash por linha e a URL no rodapé, D-72), 1 página por documento curto. **QR conferido de forma determinística** (`tests/e2e/_qr.js`, F0r, D-68; nenhuma dependência nova): sob `emulateMedia('print')`, `page.screenshot()` do bloco do QR vai à evidência e prova que ele aparece na impressão (o headless não rasteriza PDF); a matriz de módulos é lida do SVG gerado por `DMC_QR` e comparada, módulo a módulo, com a que o mesmo `qrcode-generator` vendorizado gera para a URL esperada de `validar.html?codigo=` (base de `PORTAL_BASE_URL`); conferem-se também a zona de silêncio ≥ 4 módulos no SVG e o lado impresso ≥ 28 mm (`getBoundingClientRect` sob `print`, 96 px = 25,4 mm). O `BarcodeDetector` não existe no Chromium do repositório (156.0.8078.4); a leitura com celular fica no checklist de homologação (§9.9), feita pela principal |
| Console | 0 `console.error`/`pageerror` (desktop e 390) fora da lista da fase do `monitorarConsoleERede` (D-73): na fase 1 tolera só o "Failed to load resource" e o erro cuja origem é asset de fatia fora de `QA_INTEGRADAS`; no G2 não tolera nada (o `tests/e2e/console.spec.js` do site continua com o próprio filtro) |
| CSP | G0 e G1: 0 `securitypolicyviolation` contra a CSP estrita em report-only de `/plataforma-ead/`; G2: a mesma política **aplicada** (`Content-Security-Policy`), 0 violação e todas as páginas funcionando (D-43). Política: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://i.ytimg.com; media-src 'self' blob: https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` em toda `/plataforma-ead/*` exceto `login.html` e `login-classico.html` (com e sem `.html`), que seguem com a report-only do site até a 2d tirar o script inline. A regra entra no `vercel.json` DEPOIS da regra global, e `vercel-config.spec.js` confere o cabeçalho efetivo de uma página da plataforma e de `login.html` |
| Rede | 0 respostas 4xx/5xx inesperadas, pela definição do `monitorarConsoleERede` (D-73: só os 404 de `/api/portal/*` e de assets de fatias ainda não integradas, mais o que o caso declara com `esperar`); nenhum `<script src>` de outra origem em página autenticada; nenhuma URL com `token=` |
| Links | **só no G2**: todo `href` interno (estático e dos menus renderizados para cada papel) responde 200 |
| Cache | **só no G2**: todo asset local com `?v=` igual ao hash atual, igual em todas as páginas |
| Desempenho | ≤ 2 idas ao servidor em série depois de `/auth/me`; CLS < 0,1; esqueleto no lugar de spinner |

### 9.7 Unidade e integração
`npm test` (raiz) = `NODE_ENV=test node --test server/test/*.test.js` — 188/188 hoje; roda inteiro na fase 0, na
integração de cada G1 e no G2 (na fase 1, cada fatia roda o comando de unidade dela, §9.1, D-62). Cresce com os
arquivos de API §9.3, com a redistribuição de D-40 e as mudanças de D-59/D-64: `portal-base-util` (F0a) fica com
`validacao`, `codigos`, `cripto`, `totp`, `csv` e `erros`; os casos de `arquivos` (`detectarTipo`, `pdfTemConteudoAtivo`,
`removerMetadadosImagem`) e de `notificacoes` (`emitir`/`varrer`) vão para o novo `portal-base-comuns` (F0m); o
`normalizarVideo` de mesma origem vai para `estudos-conteudo` (F1a); os casos de busca "aulas só de curso acessível" e
"atendimento alheio ausente" saem de `portal-base-servicos` (F0t, que testa o grupo `busca` só com provedores falsos)
para `estudos-conteudo` (F1a) e `atendimento-protocolos` (F6a). As regras do tratamento de erro global (JSON quebrado
contendo a senha → 400 `formato-invalido` e o log espião sem a senha; erro com `keyValue` e `body` → log só com nome,
código, índice e mensagem truncada; 413; Mongo → 503) são testadas em `portal-base-util` (F0a) sobre `tratarErroGlobal`
(API DC-77); o `servidor-erros.test.js` (principal) só confere a ligação em `server.js` (um JSON quebrado em
`POST /api/auth/senha/trocar` chega ao `tratarErroGlobal` e volta 400 `formato-invalido`). Também entra
`front-estatico.test.js`; o emulador do Mongo soma sempre os `INDICES_LEGADOS` (API DC-76), para que corrida e
idempotência do legado (signup, progresso, liberação, certificado) batam no E11000 real; sem rede e sem Mongo real
(fábricas com repositórios e serviços falsos; Gemini, Resend e ViaCEP sempre falsos); `portal-base-integracao.test.js`
só roda com `PORTAL_TESTE_MONGO_URI` e banco `_qa`.

### 9.8 Revisão de segurança (OWASP Top 10 · fase 2, principal, com evidência das fatias)
A01 matriz §5.2 + IDOR por id adivinhável · A02 bcrypt 12, AES-256-GCM/HKDF, selo HMAC, nenhum segredo em
resposta ou log · A03 leitor `texto()`, enum e ObjectId em todo filtro, regex escapada, `DMC_UI.html`, saída da IA
como texto, CSV anti-fórmula, upload por bytes · A04 regras no servidor (prazo, janela de presença, gabarito,
elegibilidade), limites persistentes, anti-enumeração · A05 `no-store`, downloads com `CSP sandbox`/`nosniff`,
`noindex`, **CSP aplicada** nas páginas da plataforma, `abrirArquivo` só para PDF e imagem · A06 nenhuma dependência
nova além do QR vendorizado com SHA-256 e licença · A07 bloqueio por identificador + rede, `sessaoVersao`, tokens de
uso único no fragmento, 2FA, JWT de 12 h para admin · A08 sha256 de arquivos, selo de frequência/avaliação/
declaração/contrato · A09 auditoria só de inserção; log resumido (`resumirErro`, sem corpo, `keyValue`, cabeçalhos,
CPF nem senha), inclusive no tratamento global do `server.js` (`tratarErroGlobal`, DC-77) · A10 servidor chama só hosts fixos (`api.resend.com`,
`viacep.com.br`, `generativelanguage.googleapis.com`); as URLs de provedor falso valem só no servidor de QA (D-41) e
produção as ignora com aviso.

### 9.9 Checklist de homologação (D3) — preparado, sem publicar
1. Testes críticos: `npm test`, E2E do portal e do site verdes no mesmo commit (`QA_ESTRITO=1`).
1a. **Login da 2d com o checklist da API §10.8 entregue** (D-71), provado por `tests/e2e/login-portal.spec.js`
   (principal, com a 2d): entrada por CPF (com e sem máscara), "Esqueci minha senha" e "Receber link de acesso"
   condicionados a `DMC_Auth.recursos()` e apontando para `acesso-link.html#esqueci` e `#pedir-link`, passo do código do
   2FA (com conta semeada com 2FA e `PORTAL_2FA=1` só no `serve.mjs`), destino por papel e `next`, perfil "Professor"
   por `papel`. Sem este item: as linhas 6.3 e 17.25 da matriz ficam "C · 2d", `PORTAL_2FA` continua desligado em
   produção (item 6) e o relatório de homologação diz o que falta (risco R26).
2. Sem erro bloqueante: §9.6 limpo, inclusive a CSP aplicada; matriz §4 conferida por `conferir-matriz.mjs` (cada
   linha C cita seção da UX e da API com o termo do item; A/R/E ou lacuna com decisão registrada, D-58); posse conferida
   por `conferir-posse.mjs` contra o disco (nenhum arquivo da plataforma sem dono nem com dois, D-59).
2a. QR dos documentos impressos (certificado, declaração, comprovante de assinatura) lido com celular pela principal,
   abrindo `validar.html` com o código certo; nos comprovantes (sem QR, D-16, D-72), o código de uma linha FRQ e de uma
   AVL digitado em `validar.html` confere com o hash impresso; registro na evidência (complementa o `_qr.js`, D-68).
3. Rollback: um commit por fatia (caminhos explícitos) em `feat/dmc-prime`; nenhuma migração destrutiva (coleções
   novas e campos aditivos); `migrar-materiais.js` e `matriculas-de-liberacoes.js` com dry-run padrão,
   idempotentes, rodados no banco do Daniel só com autorização dele.
4. Formulários e integrações: perfil/CEP (falso no QA, real em homologação), uploads ≤ 4 MB, e-mail (Resend
   configurado ou indisponibilidade honesta), Gemini desligado por padrão.
5. **Segurança — BLOQUEANTE** para publicar o portal e para ligar perfil, documentos e contratos em produção
   (incidente T3, `DECISIONS.md`): (a) senha de TODOS os usuários do MongoDB Atlas citados em `server/.env` e
   `server/.env.bak-atlas` trocada e Network Access do Atlas restrito; (b) o build antigo `.vercel/output/` e
   `server/.env.bak-atlas` (e a cópia por hardlink fora do repositório) apagados, com autorização do Daniel;
   (c) `JWT_SECRET` rotacionado na Vercel ANTES de colar a chave do Gemini, ligar o 2FA ou emitir o primeiro selo;
   (d) avaliação do incidente T3 pelo CEO e pelo jurídico à luz do art. 48 da LGPD — comunicação à ANPD e aos
   titulares se houver risco ou dano relevante aos dados que já estão no banco (`users`, `leads`, `parcerias`,
   `newsletter`, `bolsas`) —, registrada em `DECISIONS.md`; (e) `server/.env`, `server/.env.bak-atlas`,
   `server/src/*` e `server/uploads/*` respondendo 404 ou redirecionamento em produção (conferido por requisição).
   Enquanto (a)–(d) não fecham, o portal não coleta CPF, RG, documentos pessoais, gênero, etnia, contratos nem
   lançamentos em produção. Evidência de cada item no relatório de homologação.
6. Ambiente: variáveis na Vercel (`JWT_SECRET` novo, `MONGODB_*` com as credenciais novas, `RESEND_API_KEY`,
   `PORTAL_EMAIL_FROM`, `PORTAL_BASE_URL`, `GEMINI_API_KEY` opcional, `PORTAL_2FA` só depois do item 1a,
   `DEV_SIMULAR_PAGAMENTO` ausente; nenhuma `PORTAL_*_URL` de QA nem `QA_SERVIDOR`); `maxDuration` da função para o
   Assistente decidido; limite de 4,5 MB conferido.
7. CSP aplicada em `/plataforma-ead/` conferida no cabeçalho de produção, com 0 violação nas páginas.
8. Sem ação destrutiva sobre dados reais; `complexodmc_local` intocado.
9. Domínio e rotas: `vercel.json` e `api/[...path].js` sem mudança de rota (exceto o redirecionamento de
   `login-classico.html`, se a 2d aceitar); páginas novas respondem 200 com `noindex` e fora do `sitemap.xml`.
10. Publicação em produção: só com decisão explícita do CEO nesta rodada.

---

## 10. Riscos e mitigação

| # | Risco | Prob./impacto | Mitigação |
|---|---|---|---|
| R1 | 19 fatias + 2d no MESMO working tree | alta/alto | posse exclusiva conferida por script (§8.1, `conferir-posse.mjs`); proibidos explícitos; agregador tolerante a módulo ausente e isolamento por módulo; verificações isoladas por `QA_FATIA` (unidade, estático, E2E, D5) e integração de cada G1 num `git worktree` (D-62); arquivo sempre importável (§8.2 item 6a); só a principal commita, com caminhos explícitos |
| R2 | Regressão no núcleo (`app.js`, `shell.js`, `api-client.js`) derruba o login da 2d ou páginas legadas | média/alto | só acréscimos; `DMC_init()` idêntico; regressão D5 gravada antes; congelamento na fase 1; teste de contrato do `DMC_Auth` |
| R3 | Reskin altera `login-classico.html` ou quebra layout legado | média/médio | trechos `@dmc-root-legado`/`@dmc-legado-login` intocados (marcadores, nunca número de linha); remapeamento só em `portal.css`; captura idêntica a cada bloco; capturas 1440/390 |
| R4 | Tema claro ilegível no legado (cores literais) | média/médio | fase B do reskin (fundos, brancos, vermelhos) + axe de contraste nos dois temas |
| R5 | Acoplamento entre fatias no servidor | alta/médio | serviços com assinatura congelada, falsos nos testes, degradação honesta, E2E de integração cedo |
| R6 | Limites da Vercel: corpo 4,5 MB, função de 10 s (IA), disco efêmero | alta/médio | uploads ≤ 4 MB com aviso; binários em `arquivos`; materiais em disco migrados; `PORTAL_IA_TIMEOUT_MS` 8 s com `VERCEL=1` + decisão de `maxDuration` |
| R7 | XSS (63 `innerHTML` no legado: 36 em `app.js`, 23 em `admin.js`, 3 em `shell.js`, 1 em `parcerias-admin.js`; saída da IA; conteúdo de professor) com JWT em `localStorage` — um único escape esquecido vira tomada de conta, inclusive de admin | média/alto | `DMC_UI.html` obrigatório; IA como texto; nenhum script de terceiro; **CSP aplicada** em `/plataforma-ead/` sem `'unsafe-inline'` em `script-src` (report-only desde o G0, aplicada no G2, D-43); nenhum `<script>` inline nem `on*=`; `abrirArquivo` só para PDF e imagem; JWT de 12 h para admin |
| R8 | % assistido falsificável; protocolo de mensagens do YouTube não documentado | média/baixo | rótulo honesto ("medido pelo navegador"); teto de plausibilidade; botão manual; regra no servidor |
| R9 | Gemini: custo, privacidade, alucinação, indisponibilidade | média/alto | desligado por padrão; consentimento; só leitura do próprio aluno; sem dado sensível; aviso; limite; atalho humano sempre visível |
| R10 | Sem cron: lembretes só ao abrir o portal | alta/baixo | geração sob demanda documentada; e-mail de lembrete é decisão posterior |
| R11 | Conformidade OAB/MEC/LGPD em textos e cadastro sensível | média/alto | lato sensu só com IES (servidor); base legal por campo; consentimento; vocabulário proibido (UX §9); revisão de textos na fase 2 |
| R12 | Escopo integral em uma rodada | alta/alto | fatias verticais com critérios objetivos; matriz conferida no G2; o que não fechar vira lacuna/pendência registrada, nunca tela falsa |
| R13 | 404/erros de console transitórios enquanto arquivos de outra fatia não existem ou estão em obra | alta/baixo | QA completo só na fase 2; E2E e `portal-qualidade` da fase 1 restritos às entradas da fatia (`QA_FATIA`); lista fechada de 404 e erros tolerados por fase no `monitorarConsoleERede`, que encolhe a cada integração e fica vazia no G2 (D-73); links e menus só no G2 |
| R14 | Tutoriais e tour desatualizados | média/baixo | F0r-final confere cada guia com a tela real; tour (F0b) conferido junto |
| R15 | Dados reais (`complexodmc_local`: 9 cursos, 11 liberações, 2 materiais em disco) | baixa/alto | QA só em `_qa`/mongod descartável; scripts com dry-run e autorização do Daniel |
| R16 | Muitos CSS/JS por página sem bundler | média/baixo | módulos pequenos, cache por hash; `professor.html` é a única página pesada; orçamento medido (§9.6) |
| R17 | Implementador seguir o documento errado (API × UX × rascunho) | média/médio | precedência §0; divergências fechadas em §11; rascunho de arquitetura fora do repositório |
| R18 | Incidente T3: `JWT_SECRET` e `MONGODB_URI` com usuário e senha do Atlas expostos (`server/.env`, `server/.env.bak-atlas`, build antigo `.vercel/output/`), e o portal passa a gravar CPF, documentos, contratos e financeiro no MESMO banco | alta/alto | itens BLOQUEANTES de §9.9 item 5: senhas do Atlas trocadas e Network Access restrito, arquivos antigos apagados, `JWT_SECRET` rotacionado antes de cifra, 2FA ou selo, avaliação do art. 48 da LGPD registrada; nada pessoal coletado em produção antes disso (pendência §13) |
| R19 | A 2d edita `server.js` ao mesmo tempo ou demora a liberá-lo | média/médio | a principal só mexe nos três pontos (import, montagem, tratamento de erro) depois da liberação da 2d, pedida como critério de entrada da fase 0; sem ela, plano B: G0-a abre a fase 1 com o agregador montado só nos testes, e o E2E espera o G0-b (D-70) |
| R20 | `login-classico.html` fica neon, sem CPF e sem 2FA enquanto existir | média/médio | sem link em nenhuma página; `DMC_bootLogin` aceita CPF, usa o destino por papel e desvia o 2FA para `login.html` (§5.5 item 9); proposta de aposentadoria à 2d e ao CEO (D-44) |
| R21 | Variáveis de QA (`PORTAL_*_URL`, `PORTAL_MODULOS`) ligadas por engano em produção apontariam o servidor para outro host ou desligariam módulos | baixa/alto | só valem com `QA_SERVIDOR=1`, sem `VERCEL_ENV`, fora de `NODE_ENV=production` e com host `127.0.0.1`; fora disso são ignoradas com aviso no bloco `sistema` (D-41); checklist §9.9 item 6 |
| R22 | Log de erro com corpo da requisição (senha, chave, CPF) ou `keyValue` do Mongo | média/alto | `resumirErro` no tratamento global e no `tratarErroPortal`; JSON malformado → 400 sem log do corpo; teste com log espião (D-42) |
| R23 | Mais fatias = mais coordenação (19 agentes, imports entre fatias irmãs) | média/médio | contratos congelados no fim da fase 0; imports entre fatias só das funções puras listadas em §8.2 item 6 e só depois do mini-portão P1 (D-64); markup comum fixado em §7.10; moldura do backoffice com contrato (D-65); pedidos de mudança por escrito via principal |
| R24 | Reskin e shell medidos em páginas que ainda não carregam os tokens novos | alta/alto | pontos de sincronização S0–S3 (§8.3, D-60): `portal.css` fase A, `pre-pintura.js`, `ui.js` mínimo e `cabecalho-ead.mjs` prontos e aplicados ANTES das fases B e C e do shell v2; shell que degrada sem `DMC_UI` |
| R25 | Teste de fase 0 que depende de entrega da fase 1 (CPF, 2FA, `perfil.html`) travar o G0 | alta/alto | `portal-shell.spec.js` dividido: parte G0 com o que existe na fase 0 (e `page.route` para o modo restrito do cliente), parte G1 no `portal-titular.spec.js` da F0p (D-61) |
| R26 | A 2d não entrega o checklist da API §10.8 (CPF, passo do 2FA, links, destino por papel) a tempo | média/médio | pedir link e criar nova senha têm tela própria da principal (`acesso-link.html#pedir-link`/`#esqueci`, F0p) e a 2d só põe dois links (§5.5 item 4); aceite conferido por `login-portal.spec.js` no §9.9 item 1a; sem ele, `PORTAL_2FA` fica desligado (ninguém trancado fora), a entrada segue por e-mail, as linhas 6.3 e 17.25 ficam "C · 2d" e o relatório de homologação diz o que falta; a principal registra em `PROGRESS.md` a data do pedido e a da entrega (D-71) |
| R27 | Fatias sem página própria (F2 no player; F2–F7 no backoffice) sem onde rodar E2E, axe e neon, ou esperando o G1 da F8 e da F1b | alta/médio | mini-portão P1f (F8: `professor.html` + `professor.js`; F1b: `aula.html` + `player.js`) no começo da fase 1; dependências de E2E declaradas em §8.4 com `PORTAL_MODULOS` ampliado; URLs hospedeiras em `portal-<x>.paginas.js` (D-74) |
| R28 | F4 grande demais para um agente e no caminho crítico (matrículas, documentos e contratos juntos) | média/alto | divisão F4a × F4b (D-78) com a escrita cruzada em `matriculas.contratoId` só por `secretaria.vincularContrato` e a leitura do status do contrato por `contratos.situacaoPorMatricula`; serviços de matrícula da F4a primeiro (§8.3) |

---

## 11. Divergências entre API, UX e arquitetura resolvidas nesta consolidação

Cada linha fecha um conflito pela regra de precedência (§0); quando uma tela da UX perde uma função, a linha diz o
que a tela mostra no lugar. As linhas da segunda revisão que acrescentam rota, campo ou serviço (D-54, D-55, D-56)
trazem o dono e o contrato exato, que a principal leva à API na propagação. **Uma linha desta seção prevalece sobre
qualquer trecho de `PORTAL-API.md` e `PORTAL-UX.md`** (§0). D-01…D-36 vêm da consolidação e já estão no corpo da API e
da UX; D-37…D-51 vêm da primeira revisão (§15) e já estão na API (API §16.3), não na UX; D-52…D-70 vêm da segunda
revisão (§16) e, salvo o `textoSha256` de D-54 e a leitura do filtro de D-62 (já na API), não estão em nenhuma das duas;
D-71…D-82 vêm da terceira revisão (§17) e não estão em nenhuma das duas. Todas valem por esta regra até a principal
propagá-las (§14 item 1). A
principal registra estas decisões em `DECISIONS.md` (formato Decisão/Justificativa/Impacto/Aprovação) no G2.

| # | Conflito | Decisão | Quem ajusta |
|---|---|---|---|
| D-01 | Códigos de erro em MAIÚSCULO no rascunho de arquitetura e na UX (`SEGUNDO_FATOR`, `EMAIL_INDISPONIVEL`, `TROCA_DE_SENHA_OBRIGATORIA`) × kebab na API (DC-03) | kebab para todos: `segundo-fator`, `email-indisponivel`, `troca-de-senha-obrigatoria` (catálogo API §1.4) | F0b (`app.js`), aviso à 2d |
| D-02 | Caminhos indicativos do rascunho (`/api/notificacoes/resumo`, `/api/me/pendencias`, `/api/busca`, `/api/banners`, `/api/configuracoes/publicas`, `/api/equipe`) | valem os da API: `/api/portal/me/notificacoes/resumo`, `/api/portal/me/pendencias`, `/api/portal/busca`, `/api/portal/banners`, `/api/portal/configuracoes/publicas`, `/api/portal/admin/equipe` | todas (constante `API` de cada módulo) |
| D-03 | Prefixos `DCL`/`CMP` e despacho de validação na F0a (rascunho) | códigos `DMC`, `DEC`, `FRQ`, `AVL`, `CTR`; despacho único `GET /portal/validar/:codigo` (+ `conferir`) da F3b em `routes/portal-declaracoes.js` (era `portal-academico.js`; mudou com a divisão da F3, D-38); validadores DMC e DEC da F3b, FRQ da F3a, AVL da F2, CTR da F4b. O despacho nunca devolve nome completo: iniciais + "Conferir nome" nos 5 prefixos, inclusive DMC (sem `nomeAluno`), e rótulo genérico no contrato (sem o `titulo` livre) — API DC-55, UX DC-23; o legado `GET /api/certificados/validar/:codigo` e `certificado.html` seguem iguais (D5) | F3b, F3a, F2, F4b |
| D-04 | Relatórios: endpoint genérico na F0a e arquivo `routes/portal-relatorios.js` (rascunho) | rota e catálogo da F7 em `routes/portal/relatorios.js`; F0a fornece `csv.js` e o relatório `diversidade` | F7, F0a |
| D-05 | Prefixos de classe `est-`/`av-`… e tokens `--pf-sup-*`, `--np-accent`, `--pf-primario-*`, `--pf-vidro` (rascunho) | prefixo único `pf-` (+ `pf-<dominio>-`); tokens `--pf-painel*`, `--pf-acento-rgb`, `--pf-acao*`, `--pf-topo-fundo` (UX DC-01, DC-02). O `--np-accent` das páginas de solução do site não entra na EAD | F0b e todas |
| D-06 | Toast de 4 s, tabela empilhada a 720 px, ícones com traço 1,7 (rascunho) | toast 6 s com pausa (erro não some), tabela por contêiner 44em, traço 1,5 (UX DC-10, DC-09, DC-29); contratos §7.5 já atualizados | F0b |
| D-07 | Menu do aluno com dois submenus, "Loja" e "Cursos (admin)" (rascunho) | um submenu (Documentação); Atendimento com subnavegação local; "Cursos disponíveis"; "Cursos (admin)" sai; equipe vê "Portal do professor"/"Coordenação" no rodapé (UX DC-14, DC-15) | F0b |
| D-08 | Grupos do menu do backoffice (9 grupos no rascunho) e menu montado a partir de `registrar` | grupos `ensino · secretaria · relacionamento · gestao` (+ Visão geral sem grupo); menu **estático** em `DMC_Professor.MENU_ESTATICO` (UX §5.4); `registrar` só registra rotas (§7.8) | F8 |
| D-09 | UX §5.4/§7.1 dá "Banners" ao professor × API §2 (banners só admin) | banners só da coordenação; o menu do professor não tem "Banners" | F8, F7 |
| D-10 | UX DC-21 ("Privacidade não existe como categoria"; pedidos LGPD em Secretaria) × API (`categoria:'privacidade'` + `pedidoTitular`, DC-27 da API) | vale a API: pedidos do titular são protocolo `privacidade` com `pedidoTitular`; rótulo "Privacidade e dados pessoais"; prazo de 15 dias; atalho do admin `#/atendimento?categoria=privacidade` | F6, F0b |
| D-11 | `DMC_Avaliacao.resumo` (rascunho e UX §6.3) × `Conteudo.secoes.avaliacoes` já calculado no servidor | `resumo` sai do contrato; o player conta a seção 4 pelo `Conteudo` (fonte única); `montar` recebe `avaliacaoId` | F1, F2 |
| D-12 | Parâmetros do Acadêmico: `?curso=` + `#modulo-` (UX) × `?m=<matriculaId>` (links da API) | `academico.html` aceita `?m=`, `?curso=` e `#modulo-<id>` | F3 |
| D-13 | `atendimentos.html?id=` e `declaracao.html?codigo=` (UX) × endereçamento da API | `atendimentos.html?protocolo=<ATD>`, `ouvidoria.html?protocolo=<OUV>`, `declaracao.html?id=<id>` (o código vai para `validar.html?codigo=`) | F6, F3 |
| D-14 | Matrícula trancada no Histórico (UX §6.5) × "atuais = ativa/trancada" (API) | trancada fica em "Enturmação atual" com o marcador "Trancada" | F3 |
| D-15 | Declarações "Em análise"/"Indeferida" (UX §6.9) × emissão imediata (API) | sem fluxo de análise nesta rodada: emite ou responde 409 `nao-elegivel` com o motivo; histórico com Emitida · Revogada | F3 |
| D-16 | "QR do conjunto" na impressão de comprovantes (UX §6.11) | não existe código de conjunto: cada linha impressa leva o próprio código e hash; o rodapé traz a URL de `validar.html` | F3 |
| D-17 | Tema, fonte, tour visto e banners dispensados "vão ao servidor" (UX §2.7, §5.7, DC-35) × API sem preferências | nesta rodada só `localStorage` (§7.9); preferência no servidor fica como acréscimo futuro da F0a | F0b |
| D-18 | Janela de "Vence em N dias": 5 dias (UX) × 3 dias (notificação `lancamento.vencendo`, API §3.5) | 3 dias em todo lugar (marcador, pendência e notificação) | F5, F1 |
| D-19 | Atendimento do backoffice com nota interna, anexos, "Reabrir", "Assumir/Transferir" pelo professor (UX §7.10) × API | fora desta rodada (anexos já em API §13-33); reatribuição só pelo admin (`PUT /portal/admin/atendimentos/:protocolo`); encerrado é final ("Iniciar novo atendimento") | F6 |
| D-20 | Publicações agendadas e switch "Notificar o público" (UX §7.12) × API (`rascunho\|publicada\|arquivada`; `publicacao.nova` sob demanda) | sem agendamento nesta rodada; a notificação é sempre gerada para o público compatível | F7 |
| D-21 | Professor no editor de conteúdo (`admin.html`, UX DC-25 e §7.1: título, vídeo, "No ar/Em breve", excluir aula, título/resumo do módulo) × API (só admin no PUT legado; API §6.5 e §13-30) | `admin.html` abre para o professor (só cursos vinculados), mas ele edita apenas o que a API autoriza: plano de ensino, materiais do módulo, categoria de material, rótulo do encontro (rotas `/portal/professor/*` da F1); o resto aparece em leitura com a ajuda "Alteração feita pela coordenação". Ampliar = acréscimo da F1 + decisão do CEO (§13) | F8, F1 |
| D-22 | Rubrica por critérios, "em correção por" e prévia do efeito da nota mínima (UX P8) | fora: campo único "Pontos" por questão; sem aviso de concorrência; sem prévia (o motivo continua obrigatório) | F2, F3 |
| D-23 | Notificações da equipe (UX §7.20: dissertativa entregue, nova dúvida, documento enviado…) × catálogo da API §3.5 | nesta rodada só `protocolo.atribuido` e `ouvidoria.encaminhada` para a equipe; o resto aparece nas filas da Visão geral e nos contadores do menu | F8, F0a |
| D-24 | CSV com CPF opcional (`incluirCpf`, API §6.11.3) × "CPF nunca vai em CSV" (UX §7.23) | minimização: `incluirCpf` não é implementado; CPF nunca em CSV; reabrir só por decisão do CEO. Já aplicada na API (§6.11.3; o teste manda `incluirCpf=1` e confere que é ignorado) | F4a, F4b, F7 |
| D-25 | Retenção com "ao fim: excluir/anonimizar" por categoria (UX §7.22) × API (`prazosDescritivos`; TTL só em conversas da IA e notificações) | prazos descritivos por categoria + automáticos só onde há TTL; "excluir/anonimizar" vira texto informativo; relatório `retencao` apoia a decisão humana | F6 |
| D-26 | Formulário de IES (UX: nome, ato, contato) × API (nome, sigla, CNPJ obrigatório com DV, ato, site, ativa) | campos da API | F3 |
| D-27 | Ouvidoria com "professor relacionado" (UX) × API (`cursoId`) | só "Curso relacionado (opcional)"; o manifestante cita a pessoa no texto | F6 |
| D-28 | Limites de banner (UX: título 60, texto 140, faixa 90) × API (título 3–80, texto ≤ 160) | validação da API; a faixa do topo limita o texto a 90 caracteres no front (subconjunto) | F7 |
| D-29 | Campo "Rótulo do encontro" no formulário do encontro (UX §7.9) × rótulo em `aulas.rotuloEncontro` (API) | no encontro, prévia somente leitura do rótulo derivado da data; o campo editável é o da aula gravada, no editor de aulas | F3, F1, F8 |
| D-30 | "Professores" no formulário de nova turma (UX §7.4) × `turmas` sem esse campo | o formulário encadeia `POST /portal/admin/turmas` + `POST /portal/admin/docencias` (turma) | F4a |
| D-31 | "Usada em N tentativas" e "Questões com mais erros" (UX §7.6) × API sem agregação | fora nesta rodada; a linha da questão mostra "já sorteada" (`questoes.sorteada`) | F2 |
| D-32 | Extras de UX sem endpoint: [Reenviar aviso] de contrato (§7.17), PDF da NFS-e e filtros turma/forma no financeiro (§7.18), tamanho máximo por tipo de documento (§7.15) | fora nesta rodada; teto único de 4 MB; filtros da API | F4b, F5 |
| D-33 | Transferência de posse dos HTML legados entre fases (rascunho) × exigência de posse exclusiva | cada HTML tem um dono só; a troca de cabeçalho da fase 0 é mecânica (`cabecalho-ead.mjs`, escrito pela F0r, aplicado pela principal no S2 da fase 0, antes das fases B e C, D-60) | F0r, principal |
| D-34 | Acréscimos de contrato para componentes da UX que o rascunho não previa | `DMC_UI.alerta`, `.barras`, `.codigo`, `.upload`, `.fmt.cpfMascarado`, `.fmt.horas`; `DMC_UI.confirmar` com `motivo` devolve `{motivo}`; `DMC_Shell.definirPendencia`; `DMC_Api` com `cabecalhos` (`X-Motivo`); `DMC_PlanoEnsino` (UX DC-24); na segunda revisão, `DMC_UI.reautenticar`, `DMC_UI.consentimento` e `reautenticar`/`enviar` em `confirmar` e `formulario` (D-57) | F0b, F1b |
| D-35 | Herói do Início com turma e carga (UX §6.1) × `GET /portal/me/cursos` sem esses campos | o Início pede `me/cursos` e `me/academico` em paralelo (turma e carga do `CardMatricula`); continua ≤ 2 idas em série | F1 |
| D-36 | Miniatura de vídeo do provedor em Publicações (UX §6.13) × CSP `img-src` (só `i.ytimg.com`) | YouTube usa `i.ytimg.com`; Vimeo e demais usam capa tipográfica (nenhuma mudança de CSP) | F7 |
| D-37 | Fatias grandes demais para um agente (F0a, F0b, F3, F6) e caminho crítico da fase 0 longo | divisão sem mudança de contrato: F0a (núcleo do back, fase 0) + F0t (titular e equipe, fase 1); F0b (núcleo do front) + F0r (reskin e qualidade visual), ambas na fase 0; F3a (acadêmico e frequência) + F3b (certificação); F6a (atendimento, ouvidoria, configurações, regulamento) + F6b (IA). Na API e na UX, "F0a/F0b/F3/F6" valem como o par; a §8.1 diz o dono de cada arquivo. Serviços consumidos no G0 ficam no núcleo: `equipe.*` em `acesso.js` e `perfis.*` no novo `portal/perfis-leitura.js` (F0a; da F0m depois de D-59) | todas |
| D-38 | Despacho de validação e declarações misturados ao Acadêmico em `routes/portal-academico.js` | módulo novo `routes/portal-declaracoes.js` (F3b) com API §6.7.5 e §6.7.6; `routes/portal-cursos.js` (F3b) com §6.7.1; `routes/portal-academico.js` (F3a) com §6.7.3–§6.7.4; `MODULOS_PADRAO` (API §5.1) ganha a entrada, com `import()` literal: 27 módulos | F3a, F3b, F0a |
| D-39 | Configuração do Assistente (API §6.10.4) sem arquivo definido; `fatiar` usado na publicação do regulamento | §6.10.3 e §6.10.4 em `routes/portal/ia.js` (F6b); `routes/portal/configuracoes.js` (F6a) só com §6.10.5; `portal/ia/rag.js` é da F6a (publicação do regulamento usa `fatiar`) e a F6b importa `recuperar` (assinatura da API §6.10.5); serviço novo `ia.disponivel() → B` (F6b) alimenta `configuracoes.publicas.ia.disponivel` (ausente → `false`) | F6a, F6b |
| D-40 | Casos de teste de um arquivo que passou a ter dois donos | `emitir`/`varrer` de `portal-base-servicos` → `portal-base-util` (F0a; com D-59, → `portal-base-comuns`, F0m); §6.10.4 de `atendimento-config` → `atendimento-ia-config` (F6b); §6.7.1 de `academico-rotas` → `academico-cursos` (F3b); §6.7.4 de `academico-declaracoes` → `academico-comprovantes` (F3a); casos de `lives` de `academico-legado` → `academico-encontros` (F3a). Os casos continuam os da API §9.3 | F0a, F6b, F3a, F3b |
| D-41 | E2E com provedores falsos sem ponto de injeção (hosts fixos, A10) e `PORTAL_MODULOS` ignorado com `VERCEL=1`, que o `serve.mjs` define | `config-portal.js` (F0a) honra `PORTAL_MODULOS`, `PORTAL_MODULOS_IGNORAR`, `PORTAL_GEMINI_URL`, `PORTAL_VIACEP_URL` e `PORTAL_RESEND_URL` SÓ quando `QA_SERVIDOR === '1'` (definido apenas pelo `serve.mjs`), `VERCEL_ENV` ausente (a Vercel real sempre o define), `NODE_ENV !== 'production'` e, nas URLs, esquema `http:` com host `127.0.0.1`; fora disso as variáveis são ignoradas, com aviso em `avisosDeConfiguracao` e no bloco `sistema`. O `serve.mjs` (principal) sobe o servidor falso e define `PORTAL_BASE_URL` e `PORTAL_EMAIL_FROM` de QA (§9.1). Substitui, para o E2E, a regra "ignorada com `vercel`" da API §4.17/§5.2 | F0a, principal |
| D-42 | `express.json` global falha antes do agregador e o handler global faz `console.error(err)` com `body`; `tratarErroPortal` repassa o erro cru (`keyValue` do E11000) | `erros.js` (F0a) exporta `resumirErro(err) → { nome, codigo, indice, mensagem (≤ 200, dados pessoais mascarados) }`, nunca `body`, `keyValue` nem cabeçalhos; `montar.js` o reexporta. `tratarErroPortal` loga e repassa só o resumo e mapeia E11000 não previsto para 409 `registro-duplicado` ("Este registro já existe.", código novo no catálogo da API §1.4). A principal, depois do aviso da 2d, muda o tratamento global de `server.js`: `err.type === 'entity.parse.failed'` → 400 `{ error:'Formato inválido.', codigo:'formato-invalido' }` sem logar o corpo, e todo log por `resumirErro`. Teste: `servidor-erros.test.js` (principal) | F0a, principal |
| D-43 | CSP só report-only e com `'unsafe-inline'`; 10 páginas legadas da EAD com `<script>` inline; o servidor local não envia CSP | política estrita de §9.6 para `/plataforma-ead/*` (exceto `login.html` e `login-classico.html`), em report-only desde o G0 e APLICADA no G2; boots inline vão para `js/portal/boot-<pagina>.js` ou para o módulo da página, pela fatia dona; o `serve.mjs` reproduz o cabeçalho do `vercel.json` (o servidor manual não, declarado em §9.1); critério de G2: 0 violação com a CSP aplicada | principal, todas |
| D-44 | `login-classico.html` (2d) neon, sem CPF, sem 2FA e com destino fixo, congelado pelo contrato | proposta à 2d e ao CEO: aposentar (aviso estático ou remoção pela 2d + redirecionamento no `vercel.json` pela principal, preservando `?next=`); alternativa: reskin pela 2d. Enquanto existir, `DMC_bootLogin` aceita CPF, usa `destinoInicial()` e desvia o 2FA para `login.html?next=` (§5.5 item 9, §7.3) | 2d, F0b, principal |
| D-45 | Regressão D5 "verde sem mudar asserção" sobre fluxos que a UX redesenha (R1–R5, R7, R12) | D5 = invariantes de efeito com os seletores obrigatórios de `SELETORES_D5`; R1/R2 por papel e `next` → `portal-shell`; R3 por papel → `login-portal.spec.js` (principal com a 2d); R7 "Continuar" → `portal-estudos`; caminho de tela de R12 → `portal-professor`; mudar asserção ou seletor = pedido escrito ao dono via principal | F0b, F1, F8, principal |
| D-46 | G0 impossível: violações em arquivos da fase 1 que F0b/F0r não podem editar; detector de neon com furos; UX §3 E.2 com regra mais fraca | `PENDENTES_FASE_1` no teste estático (tolerância por fatia, esvaziada no G1 de cada dona, vazia no G2); axe do G0 nas páginas legadas só com regras de cor e contraste; detector de neon de §9.6 (120–200°, S > 60%, qualquer alfa, todas as propriedades de cor, pseudo-elementos e `:hover`/`:focus-visible`), que prevalece sobre a UX §3 E.2 | F0r, todas |
| D-47 | Endurecimentos de cliente: `blob:` aberto em aba herda a origem; rascunho de 401 guardava dado pessoal; zona de silêncio do QR curta | `abrirArquivo` só para PDF e imagem com tipo refeito no cliente (§7.5); rascunho só em formulário marcado e sem campos sensíveis, nunca em perfil, Meus dados, contrato, senha e assistente (§7.4); `DMC_QR` com margem 4 e leitura do QR conferida no PDF (§7.7, §9.6) | F0b, F3a, F3b, F4b |
| D-48 | `parcerias.html` com a guarda padrão quebraria `parcerias.spec.js` (da principal) | mantém a guarda própria de `parcerias-admin.js` (`#pa-restrito` e `login.html?next=parcerias.html`); o shell do backoffice é montado só para admin, sem redirecionar | F8 |
| D-49 | Simulação de pagamento impossível no E2E (`serve.mjs` força `DEV_SIMULAR_PAGAMENTO='false'`; rota registrada no import) | coberta em `secretaria-legado.test.js` com `devSimularPagamento:true` injetado na fábrica de `liberacoes.js`; no E2E, R10 confere só o 404 sem a flag. `QA_DEV_SIMULAR=1` no `serve.mjs` fica opcional, a critério da principal | F4a, principal |
| D-50 | Lacunas que a revisão da API já fechou | L12 fechada (`estado.limites.caracteresPorMensagem`); L13 fechada (avisos `avaliacao-disponivel` F2 e `lancamento-vencendo` F5 no grupo `aviso`, API §4.4); L5 em parte (`ia_trilha` só de metadados e rota admin sem conteúdo; ler o conteúdo continua lacuna) | F2, F5, F6b |
| D-51 | Modo restrito (senha temporária) sem contrato no `DMC_Portal`/`DMC_Shell`; `duracaoMs` do toast com ação | `ctx.restrito`, sem redirecionar em `perfil.html`, shell só com marca e [Sair] e sem nenhuma chamada (§7.4, §7.6, UX §5); `duracaoMs` ignorado quando há `acao` (§7.5, UX DC-10); `color-scheme`/`theme-color` únicos ajustados pelo `pre-pintura.js` e `apple-touch-icon` no cabeçalho (§6.4, UX §2.1) | F0b |
| D-52 | DC-61…DC-68 da segunda revisão da API mudaram contrato sem passar pelo índice | registradas como divergências resolvidas: DC-61 `PlanoEnsino` estruturado (objetivos em lista, bibliografia básica e complementar, cronograma com encontro, data, tema e aula; `planos` com `aulas`); DC-62 dissertativa com `orientacao`, `limiteCaracteres` (100–10.000, padrão 4.000, no snapshot) e `respostaReferencia` (nunca ao aluno); DC-63 correção em rascunho (`publicar:false`), `efeito` simulado e publicação explícita; DC-64 nome no certificado social (ato da coordenação) → registro → conta, CPF fora do certificado (R9b); DC-65 selo do certificado e `hashPrefixo`; DC-66 critérios do MEC nas duas regras e TCC por questão `arquivo` (PDF ≤ 4 MB) no módulo `tcc`; DC-67 isolamento transacional por módulo no agregador; DC-68 propagação de D-37…D-51 à API. Pendências novas: API §13-38 e §13-39 (§13 daqui) | F1a, F1b, F2, F3a, F3b, F0m, F8 |
| D-53 | Pedidos da API à UX (API §16.5) que a UX, revista em paralelo, não aplicou | valem por esta linha até a propagação: UX §6.4 — gabarito com "pontos e devolutiva" (sai "nota por critério", D-22), contador da dissertativa por `limiteCaracteres` e `orientacao` acima do campo, questão de arquivo (TCC) com [Enviar PDF] e [Substituir PDF], nome, tamanho e "Enviado às …" (PDF ≤ 4 MB); UX §6.9 — com `nomeOrigem:'conta'` no GET do certificado, confirmação "O certificado sairá com o nome «X», da sua conta. Para que conste o nome de registro, complete o cadastro antes." + [Completar cadastro] (`perfil.html#identificacao`) e [Emitir assim mesmo]; UX §7.3 — Bibliografia em DOIS campos (Básica e Complementar, uma referência por linha) no lugar do separador, limites visíveis (30 objetivos, 50 referências por grupo, 60 linhas de cronograma), [Montar a partir das aulas gravadas] com `aulas` de `GET …/planos` (rótulo e data do encontro); UX §7.6 — o editor grava `orientacao`, `limiteCaracteres` e `respostaReferencia` (já desenhados) e ganha o tipo "Arquivo (PDF)" só na avaliação do módulo de TCC, com "Arquivos [n]" na composição; UX §7.7 — cada questão salva com `publicar:false`, o resumo usa `efeito`, [Publicar correção] envia `publicar:true` e o professor baixa a entrega de TCC; UX §7.16 — no módulo, "Tipo do módulo: Regular · TCC" (admin edita por `PUT /portal/admin/modulos/:id/academico`; professor lê); UX §7.22 — aviso "TCC exigido sem avaliação publicada" na linha do curso em Critérios (vem dos avisos do servidor); UX §8.1/§8.2 — hash abreviado do certificado pelo `hashPrefixo` do despacho e, com `null`, "Emitido antes da verificação por selo" | F2, F3b, F1b, F8; a principal propaga |
| D-54 | Pedidos da UX à API (UX P16) que a API, revista em paralelo, não aplicou | valem por esta linha (acréscimos aditivos): (a) `GET /portal/me/ia/conversas/:id/escalonamento?categoria=&cursoId=` recalcula `filaPrevista`, `omitiriaMensagens` e o resumo sugerido para a categoria e o curso escolhidos (sem os parâmetros, como hoje; `privacidade` → 400) — F6b; (b) `ouvidoriaSemParecer:N\|null` no `GET /portal/professor/resumo`, pelo serviço novo `atendimento.ouvidoriaSemParecer(userId) → N` (encaminhamentos ao professor sem `parecer`); ausente → `null` e a contagem do menu não aparece — F6a, F8; (c) chave `sistema.instituicaoPendente:B` no painel, contribuição da F6a ao grupo `painel` (bloco `sistema`), `true` sem `configuracoes.instituicao` — F6a; (d) `motivo` (10–500) no `PUT /portal/admin/configuracoes/instituicao`, obrigatório só quando já há dados salvos (400 `campos.motivo`), gravado em `config.instituicao_alterada`; e no `POST /portal/admin/cursos/:cursoId/codigos`, obrigatório com `refazer:true`, quando a auditoria `aula.codigos_gerados` passa a `executar` — F6a, F3b; (e) `configuracoes.instituicao.endereco` = texto multilinha opcional, até 3 linhas e 300 caracteres (o que a UX §7.22 desenha) — F6a; (f) segundo parecer do mesmo professor no mesmo encaminhamento → 409 `transicao-invalida` ("Parecer já enviado."), sem edição nesta rodada — F6a; (g) `POST /portal/me/ia/consentimento` aceita `textoSha256` opcional: presente e diferente do hash do texto vigente → 409 `conflito-versao` e a tela relê `estado` antes de novo aceite (os prazos do texto vêm da configuração e podem mudar entre a exibição e o aceite) — F6b | F6a, F6b, F3b, F8 |
| D-55 | Textos v1 de consentimento de gênero e etnia: a API remete à UX ("já descrito na UX §6.15") e a UX ao servidor (`textosConsentimento.perfil_genero`); nenhum dos dois traz o texto | textos v1 LITERAIS em `server/src/portal/consentimentos-textos.js` (F0t), com revisão jurídica pendente (§13, LGPD): `perfil_genero` — "Autorizo o registro do meu gênero para estatísticas agregadas de diversidade da plataforma. A informação aparece só para mim; a coordenação vê apenas totais de grupos com 5 ou mais pessoas, e ela nunca é usada em decisões sobre mim nem mostrada à equipe. Posso retirar a autorização em Meus dados, e a informação é apagada."; `perfil_etnia` — o mesmo texto, com "minha cor ou etnia (classificação do IBGE)" no lugar de "meu gênero" | F0t |
| D-56 | L1 (capas verticais) e L2 (capa do módulo) aguardavam o CEO ("há imagens?"), embora o blueprint peça as duas (§3.1, §5) e a dúvida não impeça construir o campo e o envio (`DECISIONS.md` D9: não travar entrega por falta de imagem) | fechadas como acréscimo da F1a, sem tocar em `capas.js`: `cursos.capaVertical` e `modulos.capa` = `{ arquivo:'cap-<12 hex>.<ext>', arquivoId:OID, mime }\|null`; `arquivos.contexto` ganha `'capa'`; em `routes/portal-conteudo.js`, `POST`/`DELETE /portal/admin/cursos/:cursoId/capa-vertical` e `POST`/`DELETE /portal/admin/modulos/:moduloId/capa` (só admin; corpo cru JPG/PNG/WebP pelos bytes, ≤ 1 MB = `bannerMaxBytes`, metadados removidos, nome aleatório novo a cada envio, binário anterior apagado; auditoria `curso.capa_alterada`/`modulo.capa_alterada` por `registrar`) e a imagem pública `GET /portal/conteudo/imagens/:arquivo` (`public, max-age=31536000, immutable`; filtro pelo nome no curso ou no módulo e depois `{ _id, contexto:'capa' }`, como os banners); índices parciais `uq_cursos_capa_vertical` e `uq_modulos_capa`. Leitura: `capaVerticalUrl` no curso de `me/cursos` e `capaUrl` em `trilha.modulos[]` e em `Conteudo.modulo`. Tela: campos de envio no curso (bloco Identidade) e no módulo, só admin, no editor (UX §7.16, F8); sem imagem, a reserva atual (recorte central da 16:9, capa tipográfica, miniatura numerada). `capaFoco` (UX §4.11) não entra: o recorte é central | F1a, F1b, F8 |
| D-57 | Sem contrato de front para a reautenticação da coordenação (API §6.1) nem para o consentimento literal (UX DC-39): cada fatia faria o próprio diálogo, ou nenhuma | acréscimo ao D-34: `DMC_UI.reautenticar`, `DMC_UI.consentimento` e as opções `reautenticar`/`enviar` em `confirmar` e `formulario` (assinaturas em §7.5), da F0b, com o CSS `pf-reautenticacao`/`pf-consentimento` da F0s. O diálogo de reautenticação fica aberto durante o envio para mostrar o erro no campo (UX §4.8); por isso recebe `enviar` em vez de devolver só `{ senha, codigo? }`. Nada vai a rascunho (D-47) | F0b, F0s; usam F0p, F6b, F8 |
| D-58 | Linhas da matriz marcadas C sem tela, sem rota ou com API × UX em contradição | linhas conferidas uma a uma depois das revisões da API e da UX (§4, M18); onde o texto ainda falta, a linha cita D-53, D-54 ou D-55; nenhuma lacuna nova, porque nenhuma pergunta ficou aberta. No G2, `tests/tools/conferir-matriz.mjs` (principal) reprova linha C sem seção da UX (quando há tela) e da API (quando há rota) que contenha o termo do item (tabela `TERMOS`) | principal |
| D-59 | F0b, F0a e F1 ainda grandes demais para um agente; F0b no caminho crítico | divisão sem mudança de contrato (§8.1): F0a (puros, erros, `auth.js`, `config-portal`, apoio de teste) + F0m (montagem e serviços comuns, a partir do P0a); F0b (cliente da API, `DMC_Auth`, `DMC_UI`, `DMC_Portal`, `qr.js`, D5) + F0s (`shell.js`, `tour.js`, `portal.css`, `portal-shell.spec`) + F0p (páginas do titular, fase 1); F1a (servidor de estudos) + F1b (telas). Testes: `portal-base-util` fica com os puros; arquivos e notificações vão para o novo `portal-base-comuns` (F0m); `portal-ui.spec.js` (F0b) testa `DMC_UI`. Portas por fase (§9.1). A F4 foi avaliada e não se divide (§16.3) | todas |
| D-60 | A F0r trocaria literais por `var(--pf-*)` antes de as páginas legadas carregarem `portal.css`; o shell v2 rodaria sem `ui.js` | pontos de sincronização S0–S3 (§8.3): `portal.css` fase A (F0s), `pre-pintura.js` e `ui.js` mínimo (F0b) e `cabecalho-ead.mjs` (F0r) primeiro; a principal aplica o cabeçalho logo em seguida (S2, não no G0); só então as fases B e C e o shell v2. O shell degrada sem `DMC_UI` (§7.6) | F0b, F0s, F0r, principal |
| D-61 | O G0 da F0b exigia CPF, desvio do 2FA e modo restrito real, que dependem da F0t e de `perfil.html` (fase 1): o G0 não fechava e travava a fase 1 | `portal-shell.spec.js` (F0s) fica com o que existe no G0: destino por papel, `?next=`, guarda de papel, `DMC_bootLogin` com e-mail e o modo restrito do lado do cliente por `page.route` (`perfil.html` servido por stub). CPF, desvio do 2FA e modo restrito real (professor criado pela coordenação e aluno com senha gerada, 0 requisição 4xx) passam ao `portal-titular.spec.js` (F0p, G1). Na UX, as frases de teste de §5 ("teste em `portal-shell.spec.js`, com professor recém-criado pela coordenação…") e de §6.15 passam a apontar o `portal-titular.spec.js` | F0s, F0p, F0b |
| D-62 | Verificações de uma fatia contaminadas pelo trabalho em andamento de outra (npm test inteiro, estático varrendo tudo, módulos da F0t sempre montados, D5 inteira) | comando de unidade por fatia (§9.1) com os testes estáveis + os da fatia + `front-estatico` com `QA_FATIA`; `front-estatico` com `POSSE` e três modos (§6.1); no E2E, módulos da F0t só para F0t, F0p e F8, pulados nas demais por `PORTAL_MODULOS_IGNORAR` (que passa a valer também para os módulos "da F0a" da API §5.2: acréscimo de leitura do filtro na F0m) e arquivo sempre importável (§8.2 item 6a); D5 por fatia pela coluna de §9.3; integração de cada G1 num `git worktree` (§8.6 item 2a) | F0r, F0b, F0m, F0t, principal |
| D-63 | Em página com `catalogo:true`, o `DMC_init` chamava catálogo, liberações e progresso antes de conferir o modo restrito; o 403 `troca-de-senha-obrigatoria` virava `erroCarga` e quebrava os boots legados | `DMC_Portal` confere o modo restrito logo depois de `DMC_Auth.init()`, antes de qualquer outra chamada; `DMC_init` não carrega nada com `precisaTrocarSenha` e resolve sem rejeitar (não redireciona, porque o login da 2d o usa); os boots legados de `app.js` levam a `perfil.html#seguranca` (§5.4, §7.2, §7.4) | F0b |
| D-64 | Imports estáticos entre fatias irmãs (F3b ← F3a, F6b ← F6a, F7 ← F1a) de arquivos que só nascem na fase 1; casos de teste atribuídos a quem não tem o código | mini-portão P1 "contrato puro" no início da fase 1 (§8.2 item 6, §8.3): a dona entrega primeiro o arquivo com as funções implementadas e testadas, com a assinatura da API; a consumidora só importa depois do anúncio da principal. Casos movidos: `normalizarVideo` de mesma origem e busca de aulas → `estudos-conteudo` (F1a); atendimento alheio na busca → `atendimento-protocolos` (F6a); a F0t testa o grupo `busca` só com provedores falsos | F1a, F3a, F6a, F0t, F3b, F6b, F7 |
| D-65 | Telas compostas do backoffice (`#/alunos/:userId`, `#/turmas/:id`) sem dono da moldura; subnavegação do Atendimento com CSS numa fatia e HTML em outra | `DMC_Professor.registrar({ …, pai, aba })`, moldura e `ctx.aluno`/`ctx.matriculaId`/`ctx.turma` da F8 (§7.8); subnavegação pelo `pf-subnav` do catálogo (F0s) com markup fixo (§7.10), igual nas três páginas | F8, F3a, F4a, F4b, F5, F6a, F6b |
| D-66 | Menu do backoffice vazio em `admin.html`/`parcerias.html` (rotas não registradas) e roteador que reescreveria o hash do editor legado | roteador só em `professor.html`, por `DMC_Professor.iniciar()` chamado por `professor.js` com `body[data-pagina="professor"]`; `itensDoMenu(papel)` da F8 filtra os itens (rota registrada + papel em `professor.html`; só papel, com links `professor.html#/<rota>`, fora dele); o `DMC_Shell` só desenha o que recebe | F8, F0s |
| D-67 | O detector de neon do G0 reprovaria `parcerias.html` por `parcerias-admin.css` (F8, intocável na fase 0), embora D-46 já tolerasse o arquivo na guarda estática | detector e axe de cor do G0 sem as páginas cujo CSS ou JS está em `PENDENTES_FASE_1` (`PAGINAS_PENDENTES_G0`: `parcerias.html` e, se acusar, `admin.html`); essas páginas passam pelo detector completo no G1 da F8 e no G2 | F0r, F8 |
| D-68 | Leitura do QR por `BarcodeDetector`, que não existe no Chromium do repositório, e rasterização de PDF sem ferramenta | verificação determinística em `tests/e2e/_qr.js` (F0r): matriz do SVG do `DMC_QR` comparada módulo a módulo com a que o `qrcode-generator` vendorizado gera para a URL esperada, zona de silêncio ≥ 4, lado ≥ 28 mm sob `print`, captura do bloco para a evidência; leitura com celular só na homologação (§9.9 item 2a) | F0r, F3b, F4b (F3a saiu com D-72) |
| D-69 | Markup da loja e do obrigado é gerado por `app.js` (F0b), mas a tela redesenhada (UX §6.19) é da F0r | a F0b ajusta `DMC_bootLoja`/`DMC_bootObrigado` no passo 3 da fase 0 com as classes e ids fixados em §7.3 e §7.10; a F0r escreve o HTML estático e o estilo; ids de R10 preservados | F0b, F0r |
| D-70 | O G0 exigia o agregador em `server.js`, que só pode ser editado depois de a 2d liberar o arquivo, sem prazo nem plano B | a liberação (ou janela combinada) é pedida à 2d como critério de ENTRADA da fase 0 (§5.5 item 7a, §14 item 3); sem ela, o portão se divide em G0-a (abre a fase 1, com o agregador montado só nos testes) e G0-b (três pontos de `server.js`; abre o E2E e o G1 das fatias) | principal |
| D-71 | Telas de Auth só no `login.html` da 2d (entrar por CPF, pedir link mágico, "Esqueci minha senha", passo do 2FA); `acesso-link.html` só consumia links; nenhum portão conferia a entrega da 2d, e as linhas 6.3 e 17.25 estavam C | pedir link e criar nova senha passam a ter tela da principal: `acesso-link.html#pedir-link` e `#esqueci` (UX §8.5, F0p, com anti-enumeração, 503/`recursos()` falso honestos e [Pedir novo link]); a 2d só põe os dois links (§5.5 item 4). O aceite da 2d (checklist da API §10.8) vira o item 1a de §9.9, provado por `login-portal.spec.js` (entrada por CPF, links por `recursos()`, passo do código do 2FA, destino por papel). Até ele: matriz 6.3 e 17.25 "C · 2d" (código novo de §0), `PORTAL_2FA` desligado, entrada só por e-mail no login da 2d e guias de CPF/2FA fora da central; risco R26 | F0p, principal, 2d |
| D-72 | Índice com `qr.js` em `comprovantes.html`, "QR dos comprovantes" no G1 da F3a e na homologação, contra D-16 e a UX §6.11 (não há QR do conjunto; nada diz o que ele codificaria) | mantida D-16 (saída "a" da crítica): comprovantes sem QR; cada linha impressa leva o próprio código FRQ/AVL e o hash abreviado, e o rodapé a URL de `validar.html`. `qr.js` sai de `comprovantes.html` (§6.2), o G1 da F3a confere código, hash e URL (§8.5), a homologação digita o código de uma linha FRQ e de uma AVL (§9.9 item 2a) e a matriz 8.3 vira "C · A" (QR em certificado, declaração e comprovante de assinatura; código e hash por linha nos comprovantes) | F3a, F0r |
| D-73 | "0 requisição 4xx/5xx inesperada" sem definição: o shell v2 chama notificações, pendências, banners e configurações públicas em toda página, e páginas carregam `<script>`/`<link>` de fatias ainda ausentes; nenhuma página com shell passaria no G1 | helper único `monitorarConsoleERede(page, { fatia })` no `_portal.js` (F0b, S0) com a lista fechada de tolerâncias da fase: 404 de `/api/portal/*` cujo prefixo (mapa estático `PREFIXOS_API`, prefixo → fatia, o mais longo vence) é de fatia fora de `QA_INTEGRADAS` e fora da própria; 404 de asset local cujo dono em `POSSE` é fatia não integrada; o "Failed to load resource" dessas URLs; `pageerror`/`console.error` com origem em asset dessas fatias (trabalho em obra no mesmo working tree); e o que o caso declara com `esperar`. `QA_INTEGRADAS` (lista da principal em `PROGRESS.md`) cresce a cada integração; no G2, `QA_ESTRITO=1` não tolera nada. `POSSE` sai de dentro do `front-estatico.test.js` para `tests/tools/posse-ead.mjs` (F0r), usado pelos dois. Citado em §8.6 item 3 e §9.6 | F0b, F0r, principal |
| D-74 | Fatias sem página própria (F2 no player; F2, F3a, F3b, F4a, F4b, F5, F6a, F6b e F7 em `professor.html`) sem E2E nem `portal-qualidade` possíveis com `PORTAL_MODULOS` só da fatia; `PAGINAS_PORTAL = [{pagina, fatia}]` sem como abrir páginas que exigem id; `_portal.js` congelado na fase 1 | (1) mini-portão **P1f** no começo da fase 1: a F8 entrega `professor.html` + `professor.js` e a F1b entrega `aula.html` + `player.js` montando `DMC_Avaliacao`, antes do E2E de G1 das fatias penduradas (§8.2 item 6b), sem esperar o G1 delas; (2) dependências de E2E em §8.4 (F2 ← F1a, F1b, F8; F3a, F3b, F4a, F4b, F5, F6a, F6b, F7 ← F8); (3) `PORTAL_MODULOS` = módulos da fatia + os das dependências declaradas (ex.: F2 = `portal-avaliacoes.js` + `portal-conteudo.js`); (4) `PAGINAS_PORTAL` vira `paginasDoPortal()` = `PAGINAS_BASE` (S0) + `tests/e2e/portal-<x>.paginas.js` de cada fatia, com `{ pagina, fatia, url(ctx), preparar?, hospedeira? }`; fatia sem página roda o `portal-qualidade` nas URLs hospedeiras que declara (`aula.html?curso=&modulo=&item=avaliacao:<id>`, `professor.html#/avaliacoes`) | F8, F1b, F0b, todas |
| D-75 | `DMC_Portal.iniciar` chamava `DMC_Shell.montar(…, { itens })` sem receber `itens`, e a F0b não pode depender do `DMC_Professor` da F8: `professor.html` e `admin.html` não tinham caminho contratual para o menu | `DMC_Portal.iniciar` ganha a opção `itens` (array ou função chamada depois da guarda de papel, com `{ user, papel }`), cujo resultado vai como está ao `DMC_Shell.montar` (o contrato do `DMC_Shell` não muda). `professor.js` e `boot-admin.js` passam `itens: ({ papel }) => DMC_Professor.itensDoMenu(papel)`; `parcerias-admin.js` (guarda própria, D-48) chama `DMC_Shell.montar` direto. Coberto em `portal-shell.spec.js` com itens falsos (§8.5 F0s) | F0b, F0s, F8 |
| D-76 | A D5 passava por diálogos nativos que as donas são obrigadas a trocar (R6: `confirm` e `alert` em `app.js` l. 1202 e 1233; R11: dois `prompt` em `admin.js` l. 594-597 e `confirm` em l. 404, 631, 664 e 903, mais a confirmação embutida do módulo; R9b: confirmação do nome que a F3b acrescenta): a D5 quebraria quando a dona cumprisse o próprio critério | na D5, esses efeitos são disparados pela API e conferidos na API (R6 apagar dúvida; R9b emitir; R11 material-link, excluir aula, material, módulo e curso, remover capa); o 429 do R6 é conferido na resposta de rede. Para caso de tela com confirmação, `confirmarNaTela(page)` no `_portal.js` aceita o `dialog` nativo e o `DMC_UI.confirmar`, pelo gancho estável `data-pf-acao="confirmar"`/`"cancelar"` exigido do `ui.js` no S3 e listado em `SELETORES_D5` (§7.5, §9.2 item 3). Como a D5 só nasce no S0, a mudança não é troca de asserção (D-45) | F0b, F1b, F3b, F8 |
| D-77 | O R5 esperava `iframe` de `www.youtube-nocookie.com`, mas o código atual (`app.js` l. 957) não reconhece esse host e põe `youtube.com` sem normalizar: nenhuma URL do YouTube satisfaz a asserção antes e depois da F1b; o Vimeo real faz rede externa no headless; a API §9.1 dizia "R5 MP4 toca" | a D5 semeia só Vimeo (`https://player.vimeo.com/video/<id>`, asserção por prefixo do `src`, com `page.route('https://player.vimeo.com/**')` devolvendo um stub) e MP4 de mesma origem (presença e `src` do `<video>`, não reprodução). A normalização do YouTube (`watch`, `youtu.be`, `shorts` → `nocookie`) e "o MP4 toca e mede %" são critérios da F1b em `portal-estudos.spec.js`; prevalece sobre a frase "R5 MP4 toca" da API §9.1 | F0b, F1b |
| D-78 | F4 com 20 caminhos e quatro subdomínios (turmas e matrículas com máquina de estados, materialização e migração; liberações legadas; documentos; contratos com assinatura, selo e reautenticação), no caminho crítico; os motivos de §16.3 para não dividir tinham solução simples | divisão sem mudar rota: **F4a** (turmas, matrículas, `liberacoes.js`, `matriculas-de-liberacoes.js`, `prof-secretaria.js` com matrículas e turmas, `portal-secretaria.css`, `secretaria/{matriculas,repositorios}.js`, `secretaria-{matriculas,legado}`, `portal-secretaria.spec`) e **F4b** (`documentos.html`, `contratos.html`, `contrato.html`, `routes/portal/{documentos,contratos}.js`, `prof-documentos.js`, `portal-documentos.css` com prefixo `pf-doc-`, `documentacao/repositorios.js`, `secretaria-{documentos,contratos}`, `portal-documentos.spec`). Serviços novos: `secretaria.matriculaPorId(matriculaId) → Matricula\|null` e `secretaria.vincularContrato(matriculaId, contratoId\|null, { req }) → Matricula` (F4a; único escritor de `matriculas.contratoId`, auditoria `executar` `matricula.contrato_vinculado`; matrícula inexistente → `ErroPortal(404)`), e `contratos.situacaoPorMatricula(matriculaIds) → Map<matriculaId, { id, status }>` (F4b; lido pela lista e pelo detalhe de matrícula, que omitem `contrato` sem o serviço). Os nomes `secretaria.*` da API §4.4 não mudam; muda o dono: `pendenciasDoAluno` e `temContratoAssinado` são da F4b, os demais da F4a. `MODULOS_PADRAO` marca `routes/portal/{documentos,contratos}.js` com `fatia:'F4b'`. Portas: F4b herda 4634/4648 (da F0r na fase 0); os tutoriais da F0r testam na janela da principal (§9.1) | F4a, F4b, principal |
| D-79 | Pedido da loja com nomes diferentes na API e na UX (`ja-liberado` × `curso-ja-liberado`, `reaproveitado` × `jaExistia`, `origem:'humano'` + `pedido` × `origem:'loja'`, `?pedido=1` × `?origem=loja`, rota da F5 × "da F6"); 404 da rota: a API leva ao obrigado legado com texto honesto e a UX "nunca ao obrigado sem protocolo"; a UX pede `pedido.itens[]` com matrícula, lançamentos e acesso por curso e o protocolo de origem na matrícula e no lançamento | valem os nomes da API (§0): 409 `ja-liberado`, `reaproveitado` (a loja acrescenta `&existente=1` à URL do obrigado), `origem:'humano'` com `protocolos.pedido`, fila `?pedido=1`, rota `POST /portal/me/pedidos` da F5 e limite de 5/h. 404 segue a API: caminho legado com o texto honesto "Seu pedido ainda não foi registrado…", porque o 404 só existe antes de a F5 entrar e é ele que mantém o R10 verde na fase 0 (§7.3, §9.3). Fora desta rodada: o enriquecimento por curso e o protocolo de origem como campo; o bloco Pedido mostra cursos, valores e total, e [Criar matrícula e lançamentos] preenche os formulários com os dados do pedido, com "Pedido ATD-…" na `descricao` do lançamento. `liberarAcesso` em `POST /portal/admin/matriculas` é booleano (padrão `true`); a criação a partir do pedido envia `false` e [Liberar acesso] usa o fluxo de UX §7.14 | F5, F6a, F0b, F0r, F4a |
| D-80 | A UX §6.9 mostra a regra do certificado com a nota mínima do servidor ("7,0" fixo era o defeito), mas `GET /api/cursos/:cursoId/certificado` e `ResumoMatricula` não trazem `notaMinima` | acréscimo aditivo `notaMinima:N` (de `criteriosDe(curso)`) no GET do certificado não emitido (F3b) e no `ResumoMatricula` (F3a); sem o campo, a frase sai sem o número (UX P17) | F3b, F3a |
| D-81 | Regulamento sem leitura pelo aluno e "Fontes" do assistente não conferíveis; a API deu `trechos[].id` (`e<edicao>-t<nnn>`) e `fontes[].trechoId`, mas o id do trecho se repete entre o regulamento geral e os de curso | página nova `regulamento.html` (F6a, `regulamento.js`, `pf-leitura` da F0s; UX §6.20) com âncora `r-<regulamentoId>-<trechoId>`; `fontes[]` do assistente ganha `regulamentoId` (F6b) e `recuperar` (P1 da F6a) devolve os objetos de trecho recebidos com os campos extras preservados (sem mudar a assinatura), para a F6b saber o regulamento de cada fonte; link de fonte de edição arquivada fica só com o título | F6a, F6b |
| D-82 | DC-69…DC-78 da terceira revisão da API mudaram contrato sem passar pelo índice | registradas: DC-69 pedido da loja (`POST /portal/me/pedidos`, F5; D-79 resolve os nomes com a UX); DC-70 `trechos` do regulamento (D-81); DC-71 entrega do TCC por `POST`; DC-72 `consentimentos.{registrar,revogar,vigente}` da F0t como únicos escritores; DC-73 `GET /portal/professor/alunos/:userId/matriculas` (F8) e `?userId=` (F4a); DC-74 routers stub no `portal-base-montagem` e o caso real em `portal-base-auth` e `estudos-legado`; DC-75 `fatia` em `MODULOS_PADRAO` e varredura por `QA_FATIA`; DC-76 `INDICES_LEGADOS`; DC-77 `tratarErroGlobal` em `erros.js` e o terceiro ponto de `server.js` = `app.use(tratarErroGlobal)` (o ponto 1 importa `tratarErroGlobal` em vez de `resumirErro`); DC-78 progresso legado sem 204 (§5.2 dividida) | F0a, F0m, F0t, F1a, F2, F4a, F5, F6a, F6b, F8, principal |
---

## 12. Lacunas a resolver na revisão

Itens em que o blueprint ou uma tela decidida pela UX não têm, hoje, endpoint, campo ou decisão na API. Nenhum foi
inventado nesta consolidação: cada um tem a versão que vai ao ar nesta rodada ("Enquanto isso") e a proposta de
fechamento. As linhas da matriz afetadas estão marcadas com o código. Situação depois da segunda revisão (§16): 9
abertas (L3, L4, L6–L11, L14), L5 em parte, L12 e L13 fechadas (D-50), L1 e L2 fechadas (D-56). Nenhuma lacuna nova:
as linhas da matriz conferidas na segunda revisão têm contrato fechado na UX, na API ou em §11 (D-58).

| # | Lacuna | Origem | O que falta | Enquanto isso (nesta rodada) | Proposta de fechamento | Decide | Linhas da matriz |
|---|---|---|---|---|---|---|---|
| L1 | ~~Capas verticais 2:3 do curso~~ — **fechada (D-56)** | blueprint §3.1; UX §4.11, P9 | — | `cursos.capaVertical` com envio no editor e `capaVerticalUrl` em `me/cursos`; sem imagem, recorte central da 16:9 e capa tipográfica | — | revisão (feito; as imagens são da coordenação, quando houver) | 3.1.8 |
| L2 | ~~Capa do módulo~~ — **fechada (D-56)** | blueprint §5 `Modulo(…, capa)`; UX §6.3 | — | `modulos.capa` com envio no editor e `capaUrl` na trilha; sem imagem, miniatura numerada | — | revisão (feito) | 3.1.11, 5.5 |
| L3 | Busca do backoffice por Alunos, Turmas e Matrículas; CPF exato (admin, exibido mascarado) | UX DC-37, §5.2 | provedores `alunos`, `turmas`, `matriculas` no grupo `busca` e valores novos em `tipos=` | busca do backoffice com os 5 tipos da API (cursos, aulas, publicações, atendimentos, documentos) | F4a registra os 3 provedores (professor só alunos das suas turmas, campos de `perfis.publicos`); CPF exato só admin, resposta nunca traz o CPF | revisão (acréscimo F4a + F0t) | 3.9.4 |
| L4 | Histórico de alterações do cadastro visível ao titular | UX §6.16 item 5; blueprint §8.2; LGPD art. 18 | rota do titular sobre a auditoria (hoje só admin) | a seção não aparece em Meus dados | F0t: `GET /portal/me/dados/alteracoes` (auditoria com `alvoUserId` = titular e ações `perfil.*`, `auth.email_alterado`, `consentimento.*`; só data, campo e "Você/Coordenação", nunca valores) | revisão | 8.2, 17.18 |
| L5 | "Trilha das respostas" da IA acessível à coordenação — **em parte (D-50)** | blueprint §8.4; UX §7.22 (abrir conteúdo com motivo auditado) | API decidiu que a coordenação vê uso agregado e a trilha `ia_trilha` só de metadados (data, modelo, `versaoInstrucao`, ferramentas, fontes, escalonamento, `sha256Resposta`), em `GET /portal/admin/configuracoes/assistente-ia/trilha`, auditada; ler o CONTEÚDO das conversas continua fora | trilha completa de metadados para a coordenação + `conversas_ia` por resposta (visível ao titular) + uso agregado; conteúdo só para o titular | se a coordenação precisar ler conversas: base legal, texto de consentimento e rota admin auditada com motivo | CEO + jurídico | 8.4 |
| L6 | Descrição (texto alternativo) da imagem do banner | UX §7.13; WCAG 1.1.1 | campo `banners.imagem.descricao` | banner de Início só com imagem decorativa (`alt=""`), o título e o texto precisam bastar | F7: `imagem.descricao` (3–160, obrigatório quando há imagem) | revisão (acréscimo F7) | 5.22, 17.22 |
| L7 | Aba "Acessos sem matrícula" | UX DC-26, §7.14 | listagem de liberações sem matrícula vigente | botão [Gerar matrículas a partir das liberações] (`POST /portal/admin/matriculas/sincronizar`) com o resultado `{criadas, jaExistiam}` | F4a: `GET /portal/admin/matriculas/sem-matricula` (paginado) | revisão (acréscimo F4a) | 17.24 |
| L8 | Diretório de alunos com agregados (matrículas ativas, cadastro completo, documentos pendentes) e busca por CPF exato | UX §7.5 | agregados em `GET /portal/admin/usuarios` | colunas Nome, E-mail, Criada em, Último acesso | F0t: `?papel=aluno&agregados=1` (valores por serviço, `null` quando ausente) e `cpf=` exato só admin | revisão | 17.26 |
| L9 | Indicadores por turma (frequência média, média, pendências) | UX §7.4 | agregados por turma | colunas omitidas (não "—" permanente) | F3a: indicadores por turma no boletim ou rota própria | revisão | 17.26 |
| L10 | Visão da equipe por aula no Acadêmico do aluno (% assistido, data) | UX §7.5 | progresso por aula para docente/admin | a linha expandida mostra tentativas e registros de frequência (comprovantes do professor) | F1a: `GET /portal/professor/matriculas/:matriculaId/progresso` | revisão | 17.26 |
| L11 | "Encerrar" avaliação pelo professor (ninguém mais inicia; continua valendo para a nota) | UX §7.6 | estado `encerrada` (a API só tem despublicar, que muda a regra de aprovação e com tentativas é só do admin) | o botão "Encerrar" não aparece | F2: estado `encerrada` + `POST …/encerrar` (docente geral, auditado) | revisão + CEO (efeito na regra CEO-4) | 17.26 |
| L12 | ~~Limite de caracteres do assistente no front~~ — **fechada (D-50)** | UX §6.12 (1.000) | `limites.caracteresPorMensagem` em `GET /portal/me/ia/estado` | fechada (D-50): `GET /portal/me/ia/estado` devolve `limites.caracteresPorMensagem` (API §6.10.3); o front usa o valor do servidor | — | revisão (feito) | 3.7.2 |
| L13 | ~~Pendências do Início: avaliação disponível não feita; lançamento vencendo~~ — **fechada (D-50)** | UX §6.1 | avisos `avaliacao-disponivel` (F2) e `lancamento-vencendo` (F5) no grupo `aviso` | fechada (D-50): os avisos `avaliacao-disponivel` (F2) e `lancamento-vencendo` (F5, janela de 3 dias, D-18) entram no grupo `aviso` (API §4.4), sem chave em `contadores` | — | revisão (feito) | 1.10 |
| L14 | Conta de aluno criada pela coordenação ("Criar conta para este e-mail" na nova matrícula) | UX §7.14 | rota que crie conta com papel aluno (a equipe hoje só cria professor/admin) | matrícula manual exige que o aluno já tenha se cadastrado pelo login | F0t: aceitar `papel:'aluno'` na criação pela coordenação, com link de acesso ou senha temporária | CEO (aceite de termos e consentimento de quem não se cadastrou) | 17.24 |

---

## 13. Pendências para o CEO

Propostas já aplicadas na especificação enquanto a decisão não vem (nada é inventado). A única exceção a "nada fica
bloqueado" é a primeira linha: os itens do incidente T3 BLOQUEIAM a publicação do portal e a coleta de dado pessoal em
produção (§9.9 item 5). Referências: API §13 (número) e UX §14 (P*n*).

| Tema | Pendência | Proposta aplicada enquanto isso | Ref. |
|---|---|---|---|
| Segurança · **BLOQUEANTE** | Incidente T3 (`DECISIONS.md`): (a) trocar a senha de TODOS os usuários do MongoDB Atlas citados em `server/.env` e `server/.env.bak-atlas` e restringir o Network Access; (b) autorizar apagar o build antigo `.vercel/output/` e `server/.env.bak-atlas` (e a cópia por hardlink fora do repositório); (c) rotacionar `JWT_SECRET` ANTES de colar a chave do Gemini, ativar 2FA ou emitir o primeiro selo — ou aprovar chave mestra dedicada; (d) avaliar com o jurídico, pelo art. 48 da LGPD, a comunicação à ANPD e aos titulares sobre os dados que já estão no banco (`users`, `leads`, `parcerias`, `newsletter`, `bolsas`) e registrar a decisão em `DECISIONS.md` | publicar o portal e ligar perfil, documentos, contratos e financeiro em produção só depois de (a)–(d); material = `JWT_SECRET` (decisão CEO-2) | API 2; §9.9 item 5; R18 |
| Segurança | Pentest independente (blueprint §8.7) além da revisão OWASP interna | revisão OWASP na fase 2 com evidências | §9.8 |
| Segurança | Senha mínima: 8 para novas senhas × 6 no cadastro da 2d | 8 nas rotas novas; cadastro segue 6 (D5) | API 3 |
| IA | Conta Gemini com faturamento (no gratuito o Google pode usar o conteúdo), texto de consentimento (transferência internacional) e destino da trilha ao "apagar histórico" | IA desligada por padrão; consentimento v1; apagar remove o conteúdo e mantém só o evento | API 12 |
| IA | `maxDuration` da função na Vercel para o Assistente | timeout de 8 s com `VERCEL=1` | API 11 |
| IA | Coordenação pode ler conversas? | não; a coordenação vê uso agregado e a trilha só de metadados (L5 em parte) | L5, P15 |
| IA | Retenção da trilha da IA (`trilhaIaDias`, proposta 730 dias) e teto global diário do assistente (proposta 1.000 mensagens) | valores propostos, marcados [CONFIRMAR] | API 36 |
| LGPD | Fontes locais (Hanken Grotesk e Newsreader servidas pela própria plataforma) para não enviar o IP ao Google Fonts | mesmo link do site; Google Fonts declarado como operador em Meus dados | API 37 |
| LGPD | Política de privacidade da plataforma citando Google (Gemini), ViaCEP, Resend, retenção e encarregado | recursos externos só ligam depois da política | API 16 |
| LGPD | Prazos de retenção por tipo de dado; conversas da IA (proposta 180 dias) e notificações | "A definir" com aviso; TTL padrão 180 dias onde existe | API 18, P4 |
| LGPD | Encarregado (DPO) | "Encarregado ainda não indicado pela coordenação"; nunca inventado | §6.10.5 da API |
| LGPD | Menores de idade: idade mínima (proposta 12) e consentimento do responsável | `menorDeIdade` calculado; sem fluxo de responsável | API 4 |
| LGPD | Eliminação/anonimização: procedimento e o que fica retido por obrigação legal | pedido vira protocolo `privacidade`; execução manual | API 7 |
| LGPD | Finalidade e redação do consentimento de gênero e etnia (estatística agregada) — revisão jurídica dos textos v1 | campos opcionais com os textos v1 literais de D-55 | P3, API 1, D-55 |
| LGPD | Registros de acesso (Marco Civil art. 15) com IP completo por 6 meses? | só IP truncado | API 14 |
| LGPD | CPF em CSV | nunca (D-24) | D-24 |
| Acadêmico | Arredondamento (6,95 → 7,0 aprova) e média simples × ponderada por carga | meio para cima; média simples | API 19 |
| Acadêmico | 5ª situação "Concluído" para módulo sem avaliação modular | adotada | API 21 |
| Acadêmico | % assistido exigido para a frequência gravada (`frequenciaGravadaExigeVideo`) | desligado por curso | API 22 |
| Acadêmico | Presença ao vivo = "entrou na janela" (permanência exigiria integração paga) | adotado, texto honesto | API 23 |
| Acadêmico | Travar a modular até concluir as aulas do módulo? | sem trava | API 24 |
| Acadêmico | Conclusão automática da matrícula na emissão do certificado | adotada | API 27 |
| Acadêmico | Concessão depois do gabarito expõe respostas: exigir banco ≥ 2× o sorteio ou só avisar | só aviso ao professor | API 28 |
| Acadêmico | Nível dos cursos atuais | `null` ("—") até a coordenação definir | API 29 |
| Acadêmico | Uma avaliação por (módulo, tipo) | adotado | API 32 |
| Acadêmico | "Encerrar" avaliação | não existe nesta rodada (L11) | L11 |
| Acadêmico | Lato sensu: certificado e declaração de conclusão pela IES parceira; validar regras MEC com a IES | adotado; nenhuma IES cadastrada | API 20; linha 8.5 da matriz |
| Acadêmico | Entrega do TCC por PDF de até 4 MB (questão `arquivo` só no módulo `tcc`); TCC maior exige storage externo (custo) ou link | adotado (API DC-66); confirmar com a coordenação e, em lato sensu, com a IES | API 39 |
| Acadêmico | Nome no certificado de quem não preencheu o perfil: emitir com o nome da conta (como hoje, com aviso e [Completar cadastro]) ou exigir o nome de registro de todos | emite com o nome da conta (`nomeOrigem:'conta'`, R9b); CPF fora do certificado em qualquer caso | API 38 |
| Acadêmico | Redação fixa das declarações de matrícula e de frequência em lato sensu ("ofertado por <IES> … com execução pelo Complexo DMC") — revisão jurídica | redação aplicada e marcada para revisão; `iesAtoCredenciamento` nos `dados` (pedido da UX à API §8.9) | P14 |
| Acadêmico | Gabarito liberado em data (`avaliacoes.gabaritoLiberaEm`, opcional): antes da data, finalizar mostra só acertou/errou | opcional, só quando o professor preenche | API 34 |
| Segurança | 2FA obrigatório também nas rotas admin LEGADAS (editor de cursos, liberações, lives) e para professor | obrigatório só em `/portal/admin/*` e `/portal/professor/*` com `PORTAL_2FA=1`; professor recomendado (D5) | API 35 |
| Acadêmico | Tempo adicional por aluno na avaliação (acomodação de acessibilidade) | não implementado | P10 |
| Secretaria | Significado e obrigatoriedade de DOC, DIP, CERT, HIS, RES por curso | sugeridos inativos | API 8 |
| Secretaria | Texto do aceite e fundamentação da assinatura eletrônica simples (revisão jurídica) | texto v1 exibido literal | API 9, P11 |
| Secretaria | Nome social em declarações, contratos e certificados | nome de registro; social a pedido | API 10 |
| Secretaria | Rematrícula reaproveita progresso e separa frequência; trancamento mantém acesso | adotado | API 26, 31 |
| Secretaria | Limite de arquivo 4 MB e recusa de PDF com conteúdo ativo | adotados | API 5, 6 |
| Secretaria | Coordenação criar conta de aluno | não (L14) | L14 |
| Secretaria | Papel "secretaria" separado da coordenação | admin faz tudo; exige novo acordo com a 2d | API 13 |
| Financeiro | Dados da instituição (razão social, CNPJ) para a quitação anual | cadastro pela coordenação; nada automático | API 15 |
| Conteúdo | Professor editar título, vídeo, ordem e "No ar/Em breve" das aulas | só admin (D-21) | API 30 |
| Conteúdo | Roteiro de gravação visível ao professor | só se a API devolver | P7 |
| Conteúdo | Imagens das capas verticais e das capas de módulo (o campo e o envio existem, D-56) | sem imagem, recorte central da 16:9, capa tipográfica e miniatura numerada; a coordenação sobe quando tiver | P9, D-56 |
| Visual | Botão primário no tema claro: preto (DESIGN-SYSTEM) ou ouro profundo | preto | P1 |
| Visual | Promover a `tokens.css` a cor de aviso (`#dd881b` no escuro, `#9a5518` no claro, UX DC-04) e o erro em papel (`#9b463e`) | só em `portal.css` | P2 |
| Visual | Rótulo "Cursos disponíveis" no lugar de "Loja" | adotado (reversível) | P5 |
| Login | Admin cair em `professor.html#/inicio` depois do login | `admin.html` (contrato atual com a 2d) | P6 |
| Login | Destino de `login-classico.html` (2d): aposentar com redirecionamento para `login.html?next=` ou reskin pela 2d (D-44) | a página continua sem link; `DMC_bootLogin` aceita CPF, usa o destino por papel e desvia o 2FA para `login.html` | §5.5 item 9 |
| Login | Prioridade da entrega, pela 2d, do checklist da API §10.8 (campo "E-mail ou CPF", passo do código do 2FA, os dois links para `acesso-link.html`, destino por papel) | link de acesso e nova senha pelas telas da principal (`acesso-link.html`); entrada só por e-mail; 2FA desligado; linhas 6.3 e 17.25 "C · 2d" | §5.5 item 4a, §9.9 item 1a, R26, D-71 |
| Infra | E-mail transacional: domínio remetente verificado no Resend (`PORTAL_EMAIL_FROM`) e `PORTAL_BASE_URL` na Vercel | sem eles, link mágico, recuperação e troca de e-mail ficam indisponíveis com mensagem honesta | API 17 |
| Fora do ciclo | Gateway, NFS-e automática e "Meus cartões" (E1); provedor de assinatura e Mux/Bunny (E3); Sentry; Atlas Search; avisos por e-mail dos eventos; anexos em protocolos e ouvidoria; denúncia anônima sem login | não entram; modelo preparado onde cabe | API 33 |

---

## 14. Registro e próximos passos

1. **Propagação das revisões** (principal, antes da fase 0; até lá vale a regra de §0):
   - **API — parte de D-37…D-51: FEITA** pela própria API (API §16.3, DC-68), inclusive os pedidos que a UX tinha
     deixado à API na primeira revisão (`iesAtoCredenciamento` em §8.9, modo restrito em §1.7, `escalar` sem
     `privacidade` em §6.10.3). Falta levar à API: D-54 (escalonamento com `?categoria=&cursoId=`,
     `ouvidoriaSemParecer` e o serviço `atendimento.ouvidoriaSemParecer`, `sistema.instituicaoPendente`, `motivo` na
     instituição e no `refazer`, `endereco` em texto, 409 no 2º parecer, `textoSha256` opcional); D-55 (textos v1 de
     gênero e etnia em §6.3.1); D-56 (capas: campos em §3.2, `contexto:'capa'` em §3.3, rotas em §6.5, índices,
     auditoria em §3.4); D-62 (`PORTAL_MODULOS_IGNORAR` também para os módulos da F0t em §5.2) e D-64 (casos de
     `normalizarVideo` e de busca de `portal-base-util`/`portal-base-servicos` para `estudos-conteudo` e
     `atendimento-protocolos` em §9.3); na coluna Fatia e nas notas de §0/§9.3, os nomes F0m, F0s, F0p, F1a e F1b (D-59).
     Da terceira revisão: D-77 (frase "R5 MP4 toca" de §9.1 → critério da F1b); D-78 (F4a/F4b em §0, §4.4 — dono de cada
     `secretaria.*`, os novos `secretaria.matriculaPorId`, `secretaria.vincularContrato` e `contratos.situacaoPorMatricula`
     —, §3.4 `matricula.contrato_vinculado`, §5.1 `fatia` de `routes/portal/{documentos,contratos}.js`, §6.8 e §9.3);
     D-79 (`liberarAcesso` booleano em §6.8.2); D-80 (`notaMinima` em §6.7.3 e §6.7.7); D-81 (`fontes[].regulamentoId`
     em §3.3 e §6.10.3 e a nota de `recuperar` em §6.10.5); D-71 (§10.5 e §10.8: os dois links da 2d apontam para
     `acesso-link.html#pedir-link` e `#esqueci`, e o aceite é o `login-portal.spec.js`).
   - **UX — falta tudo desde D-37**: D-37…D-51 (linhas `Fatia:` com F0r, F3a/F3b, F6a/F6b e agora F0s, F0p, F1a, F1b;
     §3 fase E.2 com o detector de §9.6), os pedidos da API (D-53: §6.4, §6.9, §7.3, §7.6, §7.7, §7.16, §7.22,
     §8.1/§8.2), as capas (D-56: §7.16 com os campos de envio no curso e no módulo; §4.11 sem `capaFoco`), a frase de
     teste de §5 e de §6.15 (D-61: `portal-titular.spec.js`), a subnavegação do Atendimento pelo `pf-subnav` da F0s
     (D-65: §6.12 sem CSS no `portal-atendimento.css`) e a confirmação de que P16 foi atendida por D-54. Da terceira
     revisão: D-79 em §6.19, §6.12 e §7.10 (`ja-liberado`, `reaproveitado` com `&existente=1`, `?pedido=1`, rota da F5,
     404 pelo caminho legado honesto, sem enriquecimento por curso nem protocolo de origem), D-81 em §6.20 e §6.12
     (âncora com `regulamentoId`), D-72 em §8.4 (comprovantes sem QR, já coerente com §6.11), D-78 (F4a/F4b nas linhas
     `Fatia:`) e a confirmação de que P17 foi atendida por D-71, D-79, D-80 e D-81.
   - Depois da propagação, a principal roda `conferir-matriz.mjs` em modo de ensaio (as linhas que citam D-nn devem
     passar sem a D-nn) e registra o resultado em `PROGRESS.md`.
2. **Registro** (principal): em `DECISIONS.md`, as decisões do CEO de 18/10/2026 (§2.1), a regra de posse
   exclusiva com operações mecânicas da principal (D-33), as divisões das fatias (D-37, D-59), o ponto único de
   montagem do agregador e os três pontos de `server.js` (API §5.3, DC-30, D-42, D-70), a CSP aplicada (D-43), a ordem
   da fase 0 com pontos de sincronização (D-60), o isolamento das verificações por fatia (D-62) e as divergências que
   alteram contrato (D-01, D-02, D-03, D-08, D-10, D-11, D-21, D-24, D-34, D-38, D-39, D-41, D-42, D-44, D-45, D-52,
   D-53, D-54, D-55, D-56, D-57, D-63, D-64, D-65, D-66, D-71, D-73, D-74, D-75, D-76, D-78, D-79, D-80, D-81, D-82); em
   `PROGRESS.md`, o status objetivo: "especificação consolidada e revista três vezes (API, UX, índice); propagação de
   D-37…D-82 pendente; implementação não iniciada; fase 0 aguarda autorização e a liberação de `server.js` pela 2d;
   aceite do login da 2d (checklist API §10.8) pendente; publicação bloqueada pelos itens de segurança do incidente
   T3".
3. **Aviso à 2d** (principal): itens de §5.5 (inclusive os dois links para `acesso-link.html#pedir-link`/`#esqueci` do
   item 4 e o aceite por `login-portal.spec.js` do item 4a, D-71, a proposta do item 9 sobre `login-classico.html` e o
   pedido de liberação de `server.js`, item 7a, D-70) e UX P12, antes de qualquer mudança em `app.js`/`api-client.js` e
   antes dos três pontos de `server.js`.
4. **Ao CEO**: a primeira linha de §13 (incidente T3, bloqueante), o destino de `login-classico.html`, a prioridade do
   checklist da 2d (D-71) e as pendências do certificado (nome da conta, API 38) e do TCC por PDF (API 39).
5. **Fase 0** (F0a → F0m ∥ F0b ∥ F0s ∥ F0r + principal) só com autorização, com os pontos de sincronização S0–S3 e o
   portão G0-a/G0-b de §8.3. Publicação em produção: decisão do CEO na rodada, depois de §9.9.

---

## 15. Revisão de 18/10/2026 — críticas acolhidas, acolhidas em parte e não acolhidas

Revisão por quatro lentes (cobertura, segurança, viabilidade, design) sobre este índice, mais os pedidos que os
revisores da API e da UX fizeram a ele. 19 críticas: 15 acolhidas por inteiro, 4 acolhidas em parte (com o motivo em
§15.3), nenhuma recusada.

### 15.1 Pedidos dos revisores da API e da UX ao índice

| Pedido | Onde está |
|---|---|
| API: linha 17.27 aponta para `resumir`; 17.13 ganha `GET /portal/admin/declaracoes`; 3.1.21, 3.5.10 e 17.11 citam `POST /portal/professor/encontros` | matriz §4 |
| API: L12 fechada; L5 em parte | §12, D-50; matriz 3.7.2 passa a **C** |
| API: posse de `portal/ia/instrucao.js` (F6), `portal/consentimentos-textos.js` (F0a), `tests/fixtures/video-teste.mp4` (F1); `includeFiles` no `vercel.json` (principal) | §8.1 — com a divisão, `instrucao.js` é da F6b e `consentimentos-textos.js` da F0t (usado pelas rotas de perfil) |
| API: `err.requestId` e `User.emailVerificado`; `DMC_bootLogin` trata `segundo-fator` | §7.1, §7.2, §7.3, §5.5 itens 1 e 9 |
| API: rota legada com serviço ausente segue o legado | §8.4 (DC-54) |
| API: comando E2E por fatia com `PORTAL_MODULOS` | §9.1 (e D-41, que resolve o conflito com `VERCEL=1` no `serve.mjs`) |
| API: R9 exige perfil identificado | §9.3 R9 (semente grava o perfil direto no banco descartável) |
| API: despacho de validação sem `nomeAluno` | §11 D-03 e D-38 (API DC-55, UX DC-23) |
| API: pendências 34–37 | §13 |
| UX: "§11 prevalece sobre API e UX" | §0 e introdução de §11 |
| UX: exclusões por marcadores (`@dmc-root-legado`, `@dmc-legado-login`, `@dmc-compat`), nunca por linha | §6.1, §6.4, §5.5 item 8 |
| UX: um `color-scheme` e um `theme-color` ajustados pelo `pre-pintura.js`; `apple-touch-icon` | §6.4 (D-51) |
| UX: modo restrito no `DMC_Portal` e no `DMC_Shell` | §5.4, §7.4, §7.6 (D-51) |
| UX: `duracaoMs` ignorado com ação | §7.5 |
| UX: impressão de Acadêmico, Financeiro e Comprovantes; exceção de alvo do dia do Mês; neon com `:hover`/`:focus-visible`; captura em alto contraste | §9.6; §8.5 F3a e F5 |
| UX: matriz 3.1.26 sem `aria-pressed` | matriz §4 |
| UX: P2 com aviso `#dd881b` | §13 |

### 15.2 Críticas do índice acolhidas

| Crítica (lente · gravidade) | Onde entrou |
|---|---|
| Destino de `login-classico.html` e `DMC_bootLogin` sem CPF, 2FA e destino por papel (cobertura · média) | §5.5 item 9, §7.2, §7.3, §13, R20 (D-44) |
| §0 × §11: decisões não aplicadas nos textos da API e da UX (cobertura · média) | as duas saídas: regra "§11 prevalece" em §0 e conferência por busca de que a API e a UX já aplicaram D-01…D-36 (`incluirCpf` só no teste que o ignora; `privacidade` em DC-21, §6.16 e §7.22; professor sem Banners; ≤ 3 dias; sem "Em análise/Indeferida") |
| Incidente T3 bloqueante: Atlas, arquivos antigos, `JWT_SECRET`, art. 48 da LGPD (segurança · bloqueante) | §9.9 item 5, §13 (primeira linha), R18, §14 item 4 |
| Log com corpo da requisição e `keyValue` (segurança · média) | D-42: `resumirErro`, terceiro ponto da principal em `server.js`, `tratarErroPortal` resumido, 409 `registro-duplicado`, `servidor-erros.test.js`; §8.1, §9.7, §9.8 A09, R22 |
| `abrirArquivo` com `blob:` na origem do portal (segurança · baixa) | §7.5 (D-47), §8.5 F0b, matriz 4.17 |
| Rascunho de 401 com dado pessoal (segurança · baixa) | §7.4 e §7.9 (D-47), reforçada: além da lista de exclusão, o rascunho passou a ser opcional por formulário (`data-pf-rascunho`) |
| G0 impossível com violações em arquivos da fase 1 (viabilidade · bloqueante) | §8.3 escopo do G0, `PENDENTES_FASE_1`, §6.1, §8.6 item 3 (D-46) |
| `/dev/simular-pagamento` intestável no E2E (viabilidade · média) | §8.5 F4, §9.3 R10 (D-49) |
| `professor.html` sem `avaliacao.js` para a prévia (viabilidade · baixa) | §6.2, §8.2 item 5 |
| `requireAdminOrRedirect` "inalterado" × §5.4 (viabilidade · baixa) | §5.4 (linha corrigida, guarda de papel do `DMC_Portal`), §7.2 |
| `dmc:carrinho:change` disparado em `window` (viabilidade · baixa) | §7.9, §7.3, §7.6 (`[data-cart-count]` mantido) |
| `parcerias.html` com a guarda padrão quebraria `parcerias.spec.js` (viabilidade · baixa) | §5.4, §6.2, §8.5 F8, R13 (D-48) |
| Links e menus de outras fatias na fase 1; `PAGINAS_PORTAL` sem fatia (viabilidade · baixa) | §8.6 item 2, §9.6 (Links e Cache só no G2), `PAGINAS_PORTAL = [{ pagina, fatia }]` e `QA_FATIA` (§8.3, §9.1) |
| Detector de neon com furos (design · média) | §9.6 (120–200°, S > 60%, qualquer alfa, todas as propriedades de cor, pseudo-elementos, `:hover` e `:focus-visible`), conferido contra as cores de estado; prevalece sobre a UX §3 E.2 (D-46) |
| QR com margem 2 (design · baixa) | §7.7 (margem 4), §9.6 (leitura do QR no PDF), §8.5 F3b (D-47) |

### 15.3 Críticas acolhidas em parte (motivo)

| Crítica | O que mudou em relação ao pedido | Por quê |
|---|---|---|
| CSP aplicada (segurança · alta) | política adotada com quatro diferenças: `style-src` inclui `https://fonts.googleapis.com` e `font-src` inclui `https://fonts.gstatic.com` (o link de fontes do site é decisão de identidade, API §13-37); `media-src 'self' blob: https:` e `form-action 'self'` acrescentados; fica em report-only desde o G0 e passa a aplicada no G2, não antes; **não** há `setHeaders` no `express.static` de `server.js` | a política sugerida bloquearia as fontes de todas as páginas e o vídeo de arquivo externo; aplicá-la antes do G2 quebraria a D5 nas páginas legadas que ainda têm boot inline até o G1 da dona (o report-only estrito já acusa cada violação no E2E da fatia); o `serve.mjs` já reproduz os cabeçalhos do `vercel.json` no E2E, e um quarto ponto em `server.js`, que a 2d está editando, só serviria à verificação manual (declarado em §9.1) |
| D5 como invariantes de efeito (viabilidade · alta) | acolhida, mas o R3 não sai inteiro da D5: fica o invariante "conta de aluno: `login.html` → `dashboard.html`"; só destino de professor/admin e `next` vão para `login-portal.spec.js` | o risco R2 (acréscimo em `app.js` derrubar o login da 2d) precisa de cobertura na regressão que roda em toda fatia; o caminho do aluno não muda com o redesenho da 2d |
| Provedores falsos no E2E (viabilidade · alta) | adotada a proposta principal, com outra guarda: as variáveis valem com `QA_SERVIDOR=1` **e** sem `VERCEL_ENV` e fora de `NODE_ENV=production`, em vez de "ignoradas com Vercel"; a alternativa (testes de unidade) fica como rede de segurança quando o servidor falso não sobe (jornada "bloqueada", nunca verde) | o `serve.mjs` define `VERCEL=1`, então "ignorar na Vercel" desligaria também o QA; a Vercel real sempre define `VERCEL_ENV`. A mesma regra resolve o `PORTAL_MODULOS` por fatia, que a API ignorava pelo mesmo motivo (D-41) |
| Divisão de F0a, F0b, F3 e F6 (viabilidade · média) | acolhida com quatro ajustes: os serviços consumidos no G0 (`equipe.*`, `perfis.*`) ficam no núcleo, em `acesso.js` e no novo `perfis-leitura.js`; a F0r não recebe `portal.css` (a camada de compatibilidade fica com a F0b, texto literal da UX §3 fase A) e passa a dona de loja, obrigado, tutoriais e `portal-qualidade`; `rag.js` fica com a F6a (a publicação do regulamento usa `fatiar`) e a configuração da IA (API §6.10.4) vai para a F6b; a F3b ganha `prof-certificacao.js`, `portal-declaracoes.css` e `portal/certificacao/*` | sem `perfis.identificacao` no G0, a rota legada de certificado — que não tem a exceção da DC-54 para serviços da F0a — ficaria sem nome de registro; `portal.css` em duas fatias violaria a posse exclusiva; a F6a precisa de `fatiar` desde o primeiro dia; a conferência mecânica foi refeita (§8.1: 14 fatias, 282 caminhos, nenhum em duas fatias) |

### 15.4 Críticas não acolhidas
Nenhuma. As quatro acolhidas em parte estão em §15.3, com o motivo.

---

## 16. Segunda revisão de 18/10/2026 — críticas acolhidas, acolhidas em parte e não acolhidas

Quinze críticas sobre este índice (cobertura × 3, viabilidade × 12; uma bloqueante, três altas, onze médias), mais
os pedidos que os revisores da API e da UX fizeram a ele depois das próprias revisões (API §16.5; UX P16 e retorno do
revisor). 11 críticas acolhidas por inteiro, 4 acolhidas em parte (§16.3), nenhuma recusada. Todos os pedidos da API
e da UX ao índice foram aplicados; os que eles fizeram um ao outro, e que nenhum dos dois aplicou porque as revisões
correram em paralelo, ficaram decididos aqui (D-53, D-54, D-55) e entram na propagação (§14 item 1).

### 16.1 Pedidos dos revisores da API e da UX ao índice

| Pedido | Onde está |
|---|---|
| API: marcar como feita a parte da API da propagação de D-37…D-51 | §14 item 1 (e §0) |
| API: novo R9b (aluno sem perfil emite com o nome da conta, caminho até `perfil.html`); R9 conferindo `nomeOrigem:'registro'` | §9.3 R9b; o `nomeOrigem` é conferido fora da D5 (§16.3) |
| API: critérios de pronto novos (isolamento por módulo e "montar que lança não derruba o catálogo"; `publicar:false`, `respostaReferencia` e TCC; selo, `hashPrefixo`, critérios nas duas regras, R9b) | §8.5 F0m, F2, F3a, F3b |
| API: registrar DC-61…DC-68 e as pendências §13-38 e §13-39 | §11 D-52; §13 (linhas "Entrega do TCC por PDF" e "Nome no certificado de quem não preencheu o perfil") |
| API: linhas da matriz do plano, da correção, do hash do certificado e de MEC/TCC | §4: 3.1.17, 17.2 (plano); 17.4, 5.11 (correção); 8.3, 17.7 (selo); 8.5, 17.31, 5.5 (MEC e TCC) |
| API → UX (§16.5 da API: §6.4, §6.9, §7.3, §7.6, §7.7, §7.16, §7.22, §8.1/§8.2) | §11 D-53, valendo até a propagação |
| UX: rotas `configuracoes/instituicao` (F6a) e `configuracoes/ia/uso·trilha` (F6b) na tabela de rotas | §6.3 |
| UX: `DMC_UI.reautenticar` e `pf-consentimento` como contrato da F0b | §7.5 (D-57; o CSS é da F0s depois de D-59) |
| UX: linhas 3.6.12 e 17.10 citando a aba Instituição | §4 (UX §7.22 Instituição e §7.2) |
| UX → API (P16: escalonamento com parâmetros, `ouvidoriaSemParecer`, aviso da instituição no `sistema`, `motivo`, tipo do `endereco`, 2º parecer, `textoSha256`, textos v1 de gênero e etnia) | §11 D-54 e D-55 |

### 16.2 Críticas do índice acolhidas

| Crítica (lente · gravidade) | Onde entrou |
|---|---|
| L1 e L2 travadas à espera do CEO (cobertura · média) | D-56: campos, rotas em `routes/portal-conteudo.js`, imagem pública, leitura em `me/cursos`/`trilha`/`Conteudo`, envio no editor; §4 linhas 3.1.8, 3.1.11 e 5.5 em **C**; §12 L1 e L2 fechadas; §8.1 posse de dados; §8.5 F1a e F8 |
| G0 impossível: `portal-shell.spec` exigia CPF, 2FA e modo restrito real (viabilidade · bloqueante) | D-61; §8.3 (G0-a); §8.5 F0s e F0p; §7.3; §6.1 e §8.1 (`portal-titular.spec.js` da F0p); §10 R25 |
| Fase 0 sem pontos de sincronização: reskin e shell medidos em páginas sem os tokens novos (viabilidade · alta) | D-60; §8.3 (S0–S3, ordem interna por fatia); §7.6 (shell degrada sem `DMC_UI`); §10 R24. Com a divisão de D-59, quem entrega `portal.css` fase A é a F0s, no mesmo ponto S1 que a crítica pedia à F0b |
| Verificações de uma fatia contaminadas pelas outras (viabilidade · alta) | D-62; §9.1 (comando de unidade por fatia, módulos da F0t só na F0t, F0p e F8); §6.1 (`front-estatico` com `POSSE` e três modos); §9.3 (coluna "Roda na fase 1"); §8.6 itens 1, 2 e 2a (integração em `git worktree`); §8.2 item 6a (arquivo sempre importável) |
| Modo restrito depois do `DMC_init` (viabilidade · média) | D-63; §5.4; §7.2; §7.4; §8.5 F0b e F0s |
| Imports estáticos entre fatias irmãs e casos de teste mal atribuídos (viabilidade · média) | D-64; §8.2 item 6 (mini-portão P1); §8.3 (início da fase 1); §8.4; §9.7 (casos movidos) |
| Roteador e menu fora de `professor.html` (viabilidade · média) | D-66; §7.6; §7.8 (`iniciar`, `itensDoMenu`); §6.2 (`professor.html` com `data-pagina`); §8.5 F8 |
| Detector de neon reprovando `parcerias.html` no G0 (viabilidade · média) | D-67; §8.3 (escopo do G0); §9.6; §8.5 F0r e F8 |
| QR "lido" por `BarcodeDetector` inexistente (viabilidade · média) | D-68; §9.6 Impressão (`_qr.js`); §9.9 item 2a; §8.5 F3a, F3b, F4; §8.1 (`_qr.js` da F0r) |
| Markup da loja e do obrigado sem dono (viabilidade · média) | D-69 (opção 1 da crítica); §7.3; §7.10; §8.3 passos da F0b e da F0r; §8.5 F0b e F0r |
| `server.js` sem prazo nem plano B (viabilidade · média) | D-70; §3.4; §5.5 item 7a; §8.3 (entrada, G0-a/G0-b, plano B); §14 item 3; §10 R19 |

### 16.3 Críticas acolhidas em parte (motivo)

| Crítica | O que mudou em relação ao pedido | Por quê |
|---|---|---|
| Contrato `DMC_UI.reautenticar({ titulo, texto }) → Promise<{ senha, codigo? } \| null>` (cobertura · média) | acolhida com outra assinatura: `reautenticar({ …, enviar })` e as opções `reautenticar`/`enviar` em `confirmar` e `formulario` (§7.5, D-57) | a UX (§4.8, DC-38) exige o erro de senha ou código NO CAMPO, com o diálogo aberto e o resto preservado, e o bloco no fim do diálogo da própria ação quando ela tem motivo; devolvendo só `{ senha, codigo? }`, o diálogo já teria fechado quando a API responde 400 |
| Linhas C da matriz sem tela, sem rota ou em contradição: "reclassificar como L15+ ou voltar a C só depois de UX e API corrigidas" (cobertura · média) | seguida a segunda saída, conferindo cada linha contra a UX e a API revisadas; onde o texto de uma delas ainda não tem o acréscimo, a linha cita a decisão de §11 que o fixa (D-53, D-54, D-55); nenhuma L15+ aberta; acrescentada a conferência por script no G2 (D-58) | as revisões paralelas da UX e da API fecharam a maior parte (consentimento, ouvidoria, instituição, trilha, código da aula, plano estruturado, MEC/TCC); o que sobrou tem resposta, falta só propagar. Lacuna, aqui, é pergunta aberta (§0); abrir L15+ para algo já decidido mandaria a fatia esperar uma decisão que existe |
| Fatias grandes: dividir F0b em núcleo + F0s + F0p, F0a em dois e avaliar F1 e F4 (viabilidade · alta) | F0b, F0a e F1 divididas (D-59); a F0b dividida mantém o nome F0b para o núcleo (as referências "F0b" da API e da UX continuam certas para `app.js`, `api-client.js` e `ui.js`); na F0a, `erros.js`, `auth.js` e `config-portal.js` ficam com os puros, porque a principal precisa de `resumirErro` para os três pontos de `server.js` e todas as fatias usam o `publicUser`; a F4 foi avaliada e **não** se divide | dividir a F4 em turmas/matrículas × documentos/contratos criaria escrita cruzada de coleção (`POST /portal/admin/contratos` grava `matriculas.contratoId`), obrigaria a partir `prof-secretaria.js` e `portal-secretaria.css` e um serviço de escrita novo só para isso; o risco de tamanho da F4 fica mitigado pela ordem interna (serviços de matrícula primeiro, §8.3) e pelo fato de a matrícula já ser consumida por serviço. As portas da faixa 4630–4659 também se esgotam exatamente com 14 fatias na fase 1 (§9.1) |
| Moldura das telas compostas e subnavegação do Atendimento com classes `pf-at-subnav*` (F6a define, F6b usa) (viabilidade · média) | moldura acolhida como pedida (`pai`, `aba`, `ctx.aluno`, `ctx.matriculaId`, `ctx.turma`, D-65); a subnavegação usa o `pf-subnav` que já está no catálogo da UX (§4.3, agora da F0s), com markup fixo em §7.10 | o componente já existe no catálogo comum; uma classe `pf-at-` faria a página da F6b depender do CSS de domínio da F6a, que é exatamente o acoplamento que a crítica queria tirar |
| Pedido da API: R9 passa a conferir `nomeOrigem:'registro'` | a semente de perfil continua no R9, mas `nomeOrigem` é conferido em `academico-legado.test.js` e `portal-declaracoes.spec.js`; o R9b confere o nome da conta pela validação legada | a D5 nasce verde contra o código ATUAL e não muda de asserção (D-45); `nomeOrigem` não existe hoje, então a asserção reprovaria o S0 |

### 16.4 Críticas não acolhidas
Nenhuma. As adaptações estão em §16.3, com o motivo.

### 16.5 O que foi conferido para esta revisão
- Texto integral da API revisada (inclusive §16) e da UX revisada (inclusive §0.2, §14 P16 e §15), linha a linha nas
  seções citadas pela matriz.
- Matriz recontada por script (M18): 299 linhas; 238 só C; 22 só A; 13 só R; 26 com dois códigos; 8 linhas com lacuna.
- Posse conferida por script (§8.1): 18 fatias, nenhum caminho em duas fatias, nenhuma com `server.js`, `db.js`,
  `config.js`, `login*` ou `business-school*`.
- Código lido para as decisões concretas: `css/parcerias-admin.css` l. 134-135 (neon com alfa em `tbody tr:hover` e
  `tr.is-atual`); `js/app.js` l. 75-79 (`Data.init` sem tratamento de erro), l. 1605-1645 (`data-tilt`,
  `loja-card__shine`, `attachTilt`) e l. 1776-1837 (`#dev-pay-box`, `#dev-pay-status` com `.style.*`); `obrigado.html`
  l. 58-65 (caixa de desenvolvimento com `style` e emoji); `server/test/` (os 5 arquivos legados que formam, com os da
  F0a e da F0m, os testes estáveis do comando por fatia); `package.json` (`npm test` = todo `server/test/*.test.js`).

---

## 17. Terceira revisão de 18/10/2026 — críticas acolhidas, acolhidas em parte e não acolhidas

Oito críticas sobre este índice (cobertura × 2, viabilidade × 6; três altas, cinco médias), mais os pedidos que os
revisores da API (API §17.4) e da UX (UX P17 e §15) fizeram a ele depois das próprias terceiras revisões. Quatro
críticas acolhidas por inteiro, quatro acolhidas com ajuste (§17.3), nenhuma recusada. Os pedidos da API e da UX ao
índice foram aplicados; onde a API e a UX, revistas em paralelo, decidiram o mesmo fluxo de jeitos diferentes (pedido da
loja, nota mínima, âncora do regulamento), a decisão ficou aqui (D-79, D-80, D-81) e o que não entrou está em §17.4.

### 17.1 Pedidos dos revisores da API e da UX ao índice

| Pedido | Onde está |
|---|---|
| API: linha 17.37 (pedido da loja) e M1/M6 apontando para §6.9 | §4: 1.11 (coluna "Observado" do blueprint §1: "mesma integração usada no pré-atendimento"), 17.37, nota de abertura de M6 |
| API: dividir a linha "Progresso, % assistido" (legado nunca 204, DC-78) | §5.2 (duas linhas) |
| API: `DMC_bootLoja`/`DMC_bootObrigado` com o pedido e `?protocolo=` | §7.3 (pedido da loja), §7.10 (ids do alerta e do texto sem pedido), D-79 |
| API: `ctx.matriculaId` e seletor pela rota nova; `semMatricula` como aviso | §7.8 (DC-73) |
| API: pontos 1 e 3 de `server.js` com `tratarErroGlobal`; `servidor-erros` só a ligação | §3.4, §8.1 (Principal), §9.7, §9.8 A09, D-82 |
| API: §8.4 (consentimentos da F0t, F6b ← F0t, F5 ← F6a e F0m, `abrirProtocolo` com `pedido` e `?pedido=1`, F8 ← F4, `tratarErroGlobal` e `INDICES_LEGADOS` da F0a) | §8.4 (linhas F0a, F0t, F5, F6a, F6b, F8; a F4 da API é a F4a, D-78) |
| API: §8.5 (F0a, F0m com stubs e `QA_FATIA`, F0t e F1a com routers reais, F5 pedido, F6a âncoras e pedido, F8 matrículas da moldura) | §8.5 (linhas F0a, F0m, F0t, F1a, F5, F6a, F8) |
| API: §9.1 e §9.7 (`portal-base-{indices,montagem}` no grupo estável, DC-75) | §9.1 (comando de unidade), §9.7 |
| API: R10 com o fluxo do pedido | §9.3 R10 — acolhido com ajuste (§17.3) |
| UX: `regulamento.html` (F6a) em §6.1, §6.2, §8.1 e nas páginas do `portal-qualidade` | §6.1, §6.2, §8.1, `PAGINAS_BASE` com 34 páginas e `portal-atendimento.paginas.js` (D-74, D-81) |
| UX: M1 (pré-atendimento) e 17.33 (leitura pelo aluno) | §4 linhas 1.11 e 17.33 (e 3.7.10 com o link da fonte) |
| UX: asserção de R10 e D-69 | §9.3 R10 (ajuste em §17.3); §7.10 com os dois blocos novos da loja e do obrigado |
| UX: critério da F0r-final (≥ 1 guia por categoria; catálogo publicado ou "fora desta rodada" no relatório) | §8.5 F0r; matriz 3.9.10 e 17.29 com o catálogo de 17 guias |
| UX: testes do `acesso-link` na F0p | §8.5 F0p |
| UX: §5.5 item 4 e API §10.5 (links da 2d para `#pedir-link` e `#esqueci`) | §5.5 itens 4 e 4a; §14 item 1 (propagação à API §10.5 e §10.8), D-71 |
| UX → API (P17: rota do pedido, `origem:'loja'`, `jaExistia`, `curso-ja-liberado`, `?origem=loja`, enriquecimento por curso, protocolo de origem, `trechos` e `regulamentoId`, `notaMinima`) | D-79 (nomes da API; enriquecimento e protocolo de origem fora, §17.4), D-80, D-81 |

### 17.2 Críticas do índice acolhidas

| Crítica (lente · gravidade) | Onde entrou |
|---|---|
| Auth com tela só no login da 2d; nenhum portão confere o checklist §10.8; 6.3 e 17.25 como C (cobertura · alta) | D-71; §0 (código "2d"); matriz 6.3 e 17.25 "C · 2d"; §3.4; §5.5 itens 4 e 4a; §8.5 F0p (modos `#pedir-link` e `#esqueci`) e F0r-final; §8.1 (conteúdo do `login-portal.spec.js`); §9.9 item 1a e item 6; §10 R26; §13; §14 itens 3 e 4 |
| QR dos comprovantes contra D-16 (cobertura · média) | D-72 (saída "a"); §6.2 (`comprovantes.html` sem `qr.js`); §8.5 F3a; §9.6 Impressão; §9.9 item 2a; matriz 3.6.22 e 8.3 ("C · A") |
| R5 sem URL do YouTube que passe antes e depois; Vimeo com rede externa (viabilidade · média) | D-77; §9.2 item 3; §9.3 R5; §8.5 F1b (normalização do YouTube e MP4 que toca); §14 item 1 (frase da API §9.1) |
| F4 grande demais e no caminho crítico (viabilidade · média) | D-78; §0; §1; §6.1; §6.2; §6.3; §8.1 (F4a e F4b, posse de dados); §8.2 item 4 (`doc`); §8.3; §8.4; §8.5; §9.1 (portas: F4b com 4634/4648, tutoriais da F0r na janela da principal); §9.3 R10 e R12; §10 R28; §12 L3 e L7; matriz (linhas da F4 citam F4a ou F4b) |

### 17.3 Críticas acolhidas com ajuste (motivo)

| Crítica | O que mudou em relação ao pedido | Por quê |
|---|---|---|
| 404 esperados sem definição: helper `monitorarConsoleERede(page, { fatia })` com (a) rotas de módulos fora de `PORTAL_MODULOS`, (b) assets de outra fatia, (c) "Failed to load resource" (viabilidade · alta) | acolhida (D-73), com três acréscimos: (d) `pageerror`/`console.error` cuja origem é asset de fatia não integrada; o critério "fatia não integrada" vem de `QA_INTEGRADAS` (lista da principal), não de `PORTAL_MODULOS`; `POSSE` sai do `front-estatico.test.js` para `tests/tools/posse-ead.mjs` (F0r) | no mesmo working tree, o arquivo de outra fatia pode existir em obra e lançar erro, não só faltar; `PORTAL_MODULOS` muda por fatia e não diz o que já foi integrado (na integração de cada G1 não há `PORTAL_MODULOS`); e importar um arquivo `*.test.js` dentro do `_portal.js` rodaria os testes dele |
| Fatias sem página própria: P1f, dependências de E2E, `PORTAL_MODULOS` com dependências, `{ pagina, fatia, url(ctx) }` vindo de `portal-<x>.paginas.js` (viabilidade · alta) | acolhida (D-74) com dois ajustes: o P1f não espera o G1 da F8 nem o da F1b (só os arquivos hospedeiros e o próprio teste deles); a lista das 34 páginas continua no `_portal.js` (`PAGINAS_BASE`, S0) e os arquivos das fatias só acrescentam ou detalham as próprias entradas, com recusa de entrada alheia | esperar o G1 inteiro das duas hospedeiras serializaria nove fatias atrás de duas; sem a base, o G0 não teria páginas para o detector de neon e o axe (as fatias da fase 1 ainda não escreveram os arquivos delas) |
| `itens` no `DMC_Portal.iniciar`, "repassada sem tratamento ao `DMC_Shell.montar`" (viabilidade · média) | acolhida (D-75), mas a função é chamada pelo `DMC_Portal` depois da guarda de papel e só o array chega ao `DMC_Shell`; `parcerias.html` monta o shell direto em `parcerias-admin.js` | assim o contrato do `DMC_Shell` (§7.6, F0s) não muda e a função recebe o papel já conferido; `parcerias.html` tem guarda própria e não passa pelo `DMC_Portal` (D-48) |
| D5 robusta à troca de diálogos: R6, R9b e R11 pela API; `confirmarNaTela` com `data-pf-acao="confirmar"` (viabilidade · média) | acolhida (D-76), com duas ampliações: a exclusão de módulo (confirmação embutida em `admin.js` l. 279-288, que a F8 também troca) e a de curso (`confirm` em l. 664) também vão para a API; o 429 do R6 é conferido na resposta de rede. Com isso nenhum caso da D5 depende hoje do `confirmarNaTela`, que fica para os specs das fatias e para casos futuros | qualquer confirmação que a dona é obrigada a trocar quebraria a D5 no G1 dela; o gancho `data-pf-acao` continua exigido do `ui.js` no S3 para os specs que testam os mesmos fluxos pela tela |
| API §17.4: R10 = "finalizar → `POST` 201 → `obrigado.html?protocolo=` com protocolo e valores do servidor; sem a F5 (404), caminho legado com o texto de pedido não registrado" | R10 fica com o invariante de efeito que vale hoje e depois (termina em `obrigado.html` com o carrinho vazio) e, **quando a F5 está montada** (`/api/portal/saude`), confere `?protocolo=` e o `pedido` na API; valores, `reaproveitado` e `ja-liberado` vão para `portal-financeiro.spec.js` (F5), e os ramos 404/409/429/503 do cliente para `portal-ui.spec.js` (F0b, `page.route`) | a D5 nasce verde contra o código ATUAL no S0 e nunca confere texto (D-45); o texto honesto do 404 não existe hoje, e o caso condicional à F5 mantém a mesma asserção do S0 ao G2 |
| Divisão da F4 (viabilidade · média) | acolhida (D-78) com três complementos: além de `secretaria.vincularContrato`, os serviços `secretaria.matriculaPorId` (F4a) e `contratos.situacaoPorMatricula` (F4b); o arquivo `server/src/portal/documentacao/repositorios.js` (F4b); `portal-secretaria.css` fica com a F4a (telas de matrículas e turmas) e a F4b ganha `portal-documentos.css` (`pf-doc-`) | a F4b precisa ler a matrícula antes de criar o contrato (404 e `matriculaNumero` congelado) sem tocar na coleção da F4a; a lista e o detalhe de matrícula mostram o status do contrato (API §6.8.2), que é dado da F4b; o `repositorios.js` da secretaria era compartilhado e teria dois donos |

### 17.4 Críticas não acolhidas (e pedidos não acolhidos, com o motivo)

Nenhuma das oito críticas do índice foi recusada. Ficaram de fora, por decisão desta revisão, quatro partes de pedidos
cruzados:

| Pedido | Decisão | Por quê |
|---|---|---|
| UX §6.19: rota do pedido ausente (404) → "nenhuma navegação ao obrigado sem protocolo", carrinho mantido | não acolhido; vale a API §6.9 item 4: 404 → caminho legado com o texto honesto "Seu pedido ainda não foi registrado…" e o atalho para o Atendimento (D-79) | o 404 só acontece antes de a F5 ser integrada; é esse caminho que mantém o R10 verde na fase 0 e no começo da fase 1, sem trocar asserção da D5; o texto é honesto e nenhuma tela promete o que não aconteceu. 409, 429 e 503 seguem a UX (fica na loja, carrinho mantido) |
| UX P17: `origem:'loja'`, `jaExistia`, 409 `curso-ja-liberado`, filtro `?origem=loja`, "rota da F6" | não acolhido; valem `origem:'humano'` com `protocolos.pedido`, `reaproveitado`, `ja-liberado`, `?pedido=1` e a rota da F5 (D-79) | rota, campo, enum e código de erro são da API (§0); a UX só ganha `&existente=1` na URL do obrigado, que é do front |
| UX P17: `pedido.itens[]` com `matricula`, `lancamentos` e `liberado` por curso na leitura do protocolo | fora desta rodada (D-79) | exigiria que a F6a lesse matrículas (F4a), lançamentos (F5) e liberações a cada leitura de protocolo, três dependências novas num fluxo que a coordenação já acompanha pela moldura do aluno (`#/alunos/:userId`); o bloco Pedido mostra cursos, valores e total |
| UX P17: protocolo de origem aceito por `POST /portal/admin/matriculas` e `POST …/financeiro/lancamentos` | fora desta rodada (D-79); o formulário preenchido a partir do pedido grava "Pedido ATD-…" na `descricao` do lançamento | o vínculo vira texto rastreável sem campo novo em duas fatias (F4a e F5); a matrícula guarda `historico` e a auditoria `matricula.criada` identifica quem criou |

### 17.5 O que foi conferido para esta revisão
- Texto integral da API (inclusive §12 DC-69…DC-78 e §17) e da UX (inclusive §0.3, §6.17, §6.19, §6.20, §8.5, P17 e
  §15), nas seções que a matriz e as fatias citam.
- Matriz recontada por script (M18): 301 linhas (264 do blueprint + 37 de M17); 236 só C; 22 só A; 13 só R; 26 com
  dois ou mais códigos; 4 só com exceção; 8 com lacuna; 2 "C · 2d"; 1 "C · A".
- Posse conferida por script (§8.1): 19 fatias, 262 caminhos nas fatias, 311 na tabela, nenhum caminho em duas fatias,
  nenhuma fatia com `server.js`, `db.js`, `config.js`, `login*` ou `business-school*`; 34 páginas e 59 módulos `.js`
  com dono.
- Código lido para as decisões concretas: `js/app.js` l. 957-960 (regex do player sem `youtube-nocookie.com`, URL sem
  normalizar), l. 1202 (`alert` do 429), l. 1233 e 1248 (`confirm` das dúvidas), l. 1738-1749 (checkout que só navega
  com `cursos`, `email` e `total` na query) e l. 1776-1790 (`DMC_bootObrigado` esvazia o carrinho); `js/admin.js`
  l. 279-288 (confirmação embutida da exclusão de módulo), l. 404, 594-597, 631, 664, 903, 1111 e 1220 (`confirm` e
  `prompt` nativos).

Este documento foi revisado sem alterar nenhum outro arquivo do repositório.
