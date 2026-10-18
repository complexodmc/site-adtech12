# PORTAL-UX — Especificação de UX/UI do Portal do Aluno e do Portal do Professor

Plataforma Complexo DMC (`complexodmc.com.br/plataforma-ead/`) · direção C · Híbrido Executivo ·
consolidação de 18/10/2026, revista no mesmo dia com as críticas de segurança, viabilidade e design, numa
segunda rodada com as críticas de cobertura contra a API revisada e, numa terceira, com as críticas de cobertura
sobre loja e pedido, acesso por link, regulamento, relatórios do professor, certificado e tutoriais (registro em
§0.1, §0.2, §0.3 e §15); no mesmo dia, a sessão principal propagou para este texto as decisões D-37…D-82 do índice
(`PORTAL-ACADEMICO.md` §11 e §14 item 1), com os nomes atuais das 19 fatias (registro em §0.4).
Status: **especificação para implementação** (nenhum código foi alterado para escrevê-la).

Fontes consolidadas: rascunho de UX do aluno, rascunho de UX do professor e coordenação, rascunho de
arquitetura em fatias, blueprint integral do CEO, `assets/css/tokens.css`, `assets/css/components.css`,
`docs/dmc/DESIGN-SYSTEM.md`, `css/business-school.css` (login da sessão 2d), `css/plataforma.css`,
`js/shell.js`, e os rascunhos de back (só para conferir nomes de campo, enum e regra).

## 0. Como ler

**Precedência** (combinada na arquitetura e mantida aqui):
- tela, texto, ordem de menu, componente e estado → **este documento**;
- nome de arquivo, módulo JS, posse e fatia → índice (`PORTAL-ACADEMICO.md` §6 e §8.1, 19 fatias);
- rota de API, campo, enum e regra de negócio → spec de back (`PORTAL-API.md`). Onde este documento cita endpoint, é
  só a família (`/api/portal/me/financeiro…`), e o nome definitivo é o do back;
- as decisões D-01…D-82 do índice (`PORTAL-ACADEMICO.md` §11) **estão aplicadas no corpo** deste documento: D-01…D-36
  desde a consolidação, D-37…D-82 pela propagação registrada em §0.4 (cada trecho afetado cita o D-nn). Se sobrar
  algum conflito, vale o índice §11. As lacunas abertas do índice §12 (L3, L4, L5 em parte, L6–L11, L14) aparecem como
  "(L*n*: nesta rodada …)": a tela mostra só a versão desta rodada. L1 e L2 (capas, D-56) e L12 e L13 (D-50) estão
  fechadas.

**Fatias** (donas de cada tela; cada seção de tela traz a linha `Fatia:` com o nome exato da fatia do índice §8.1;
D-37, D-59 e D-78 dividiram F0a, F0b, F1, F3, F4 e F6 sem mudar contrato):

| Fatia | Domínio | Telas do aluno | Rotas do backoffice |
|---|---|---|---|
| F0a | fundação do back: funções puras, erros (`resumirErro`, `tratarErroGlobal`), `auth.js`, `config-portal` e apoio de teste (fase 0) | — (só API) | — |
| F0m | fundação do back: montagem do agregador e serviços comuns (acesso, auditoria, notificações, arquivos, e-mail, limitador) (fase 0) | — (só API) | — |
| F0t | titular e equipe, servidor: auth ampliada, perfil, CEP, Meus dados, consentimentos e seus textos v1, notificações, pendências, busca, auditoria, equipe (fase 1) | — (só API) | — |
| F0b | núcleo do front: `DMC_Api`, `DMC_Auth`, `DMC_UI` (inclusive `reautenticar`, `consentimento`, `abrirArquivo`), `DMC_Portal`, `DMC_QR`, `DMC_Icons`, `pre-pintura.js`, markup e chamada do pedido em `DMC_bootLoja`/`DMC_bootObrigado` (D-69, D-79), regressão D5 (fase 0) | `index` | — |
| F0s | shell e catálogo visual: `shell.js` v2, `tour.js`, `portal.css` (tokens `--pf-*`, temas, `@dmc-compat`, catálogo `pf-*` de §4.3, impressão) (fase 0) | o shell de todas as páginas (§5) | topo, menu e gaveta do backoffice (os itens chegam prontos da F8, D-66, D-75) |
| F0p | páginas do titular (fase 1) | `perfil`, `meus-dados`, `notificacoes`, `busca`, `acesso-link` | `#/notificacoes` (montado por `notificacoes.js`) |
| F0r | reskin e qualidade visual: `plataforma.css`, loja e obrigado (HTML e estilo), tutoriais, guardas estática e de tela (fase 0; tutoriais na fase 1) | `loja`, `obrigado`, `tutoriais` | `#/ajuda` (montado por `tutoriais.js`) |
| F1a | estudos, servidor: conteúdo em seções, progresso, materiais, capas do curso e do módulo (D-56) | — (só API) | — |
| F1b | estudos, telas | `dashboard`, `meus-cursos`, `aula` (player, vídeo, seções) | `#/cursos` (+ componente `DMC_PlanoEnsino`) |
| F2 | avaliações e correção | avaliação dentro de `aula` | `#/avaliacoes*`, `#/correcao*` |
| F3a | acadêmico, aulas ao vivo, frequência, comprovantes | `academico`, `ao-vivo`, `comprovantes` | `#/ao-vivo*`, abas Frequência/Notas/Encontros da turma, aba Acadêmico do aluno |
| F3b | certificação: regras do curso, IES, códigos de aula, declarações, validação, certificados | `certificados`, `certificado`, `validar`, `declaracao` | `#/documentos/declaracoes`, `#/configuracoes/cursos` |
| F4a | secretaria: turmas, matrículas, liberações e migração (D-78) | — | `#/matriculas*`, `#/turmas/nova`, aba Matrículas do aluno |
| F4b | documentação: documentos pessoais e contratos (D-78) | `documentos`, `contratos`, `contrato` | `#/documentos`, `#/documentos/:envioId`, `#/documentos/tipos`, `#/contratos*`, abas Documentos/Contratos do aluno |
| F5 | financeiro e rota do pedido da loja (`POST /portal/me/pedidos`, D-79) | `financeiro` | `#/financeiro*`, aba Financeiro do aluno |
| F6a | atendimento, ouvidoria (inclusive a visão do professor), configurações (regulamento, privacidade, instituição), regulamento | `atendimentos`, `ouvidoria`, `regulamento` | `#/atendimento*` (inclusive o bloco Pedido), `#/ouvidoria*`, `#/configuracoes/regulamento·privacidade·instituicao`, aba Atendimentos do aluno |
| F6b | assistente de IA | `assistente` | `#/configuracoes/ia*` |
| F7 | comunicação, relatórios, auditoria (tela) | `publicacoes`, `publicacao` | `#/publicacoes*`, `#/banners`, `#/relatorios*`, `#/auditoria` |
| F8 | casca do backoffice (roteador, menu filtrado, moldura das telas compostas, D-65, D-66) e legado do admin | — | `professor.html` (roteador), `#/inicio`, `#/turmas`, `#/turmas/:id` (moldura) e `#/turmas/:id/alunos`, `#/turmas/sem-turma`, `#/alunos*` (moldura e Cadastro), `#/duvidas`, `#/equipe*`, `admin.html`, `parcerias.html` |

Regra de leitura: os **tokens e o catálogo** (`portal.css`) são da F0s, o **reskin** de `plataforma.css` é da F0r e o
**comportamento** dos componentes (`DMC_UI`) é da F0b; os três ficam congelados na fase 1 (índice §8.2 item 2). Uma
fatia que precise de um componente novo **não** edita `portal.css`: cria a classe no CSS do próprio domínio com o
prefixo da regra §4.1 e, se o componente for reutilizável, pede a promoção à F0s (e à F0b, se houver comportamento),
por escrito, via principal.

**Ilustrações.** Números, nomes, datas e códigos dos esquemas (ex.: "38%", "APE-2026-1", "R$ 499,00")
são ilustração de layout. Nenhum deles entra como conteúdo fixo (D7). Tudo o que a tela mostra vem da API;
sem dado, a tela mostra "—" e uma frase honesta.

### 0.1 Revisão de 18/10/2026 (onde cada crítica foi aplicada)

| Tema | Onde |
|---|---|
| Pedidos do titular = categoria `privacidade` + `pedidoTitular`, prazo do servidor | DC-21, §6.12, §6.16, §7.10, §7.22 |
| Trilha da IA para a coordenação = uso agregado + trilha só de metadados; ler conversas continua fora (L5 em parte, D-50) | §7.22 Assistente › Uso e Trilha das respostas, §13 (revisto em §0.2) |
| Troca obrigatória de senha sem laço de 403 | §5 (modo restrito), §6.15, §10 |
| Reskin por marcadores, `.btn-primary` sobreposto, `eixo-pulse` mantido, commits | §3 |
| D-01…D-36 e lacunas aplicadas no corpo | em cada tela (cita D-nn / L*n*) |
| Escopo local de tema (`.pf-escopo-claro` / `.pf-escopo-escuro`) | §2.2, §2.7 |
| Regras de `components.css` religadas | §4.2 |
| Véu do herói e rótulo do código sobre vídeo | §6.1, §6.3 |
| `color-scheme`, `theme-color`, controles nativos | §2.1, §2.7, §4.5 |
| Alto contraste (`forced-colors`) | §11 |
| Sinais só por cor; "Ao vivo agora" sem ouro; ícone de tema | §2.3, §5.2, §5.3, §5.5, §6.6, §7.2, §7.9, DC-17 |
| Cor de aviso no escuro (`#dd881b`) e regras no claro | §2.3, DC-04, §14 P2 |
| Reflow em 320 px no nível 2 (topo, Mês, KPIs, rodapé do player) | §4.9, §4.13, §5.1, §6.3, §6.6 |
| Impressão sem modo empilhado | §12 |
| Toast com ação não some sozinho | DC-10, §4.10 |
| Painel de detalhe como coluna (sem foco encoberto) | §4.8, §4.13 |
| Prévia de PDF sem embutir (CSP) | §7.15, §7.17 |
| Movimento: `live-pulse` 3×, textura SVG estática | §2.5, §2.6, §3 |
| Redação da declaração em lato sensu; regra de vocabulário proibido | §8.3, §9 |
| Botão de conclusão sem estado duplicado | §6.3 |
| Tour sem véu | §5.7 |
| Destaque fora de linhas de tabela e lista | §2.3, §4.7 |
| Rodapé e links soltos com alvo de 44 px | §5.6, §4.11 |
| Pesos do navegador, cor inline do legado, foco em contêiner com rolagem, checkbox/rádio/switch | §3, §4.3, §4.5 |
| Críticas acolhidas só em parte | §15 |

### 0.2 Segunda revisão de 18/10/2026 — cobertura contra a API revisada

| Crítica (gravidade) | Onde foi aplicada |
|---|---|
| Consentimento registrado de nome social, redes e foto no Perfil; 6 finalidades em Meus dados (alta) | DC-39, §4.3 `pf-consentimento`, §6.15, §6.16 item 2, §2.3 rótulos, §13 |
| Texto de consentimento do assistente renderizado do servidor, sem paráfrase (alta) | DC-39, §6.12 Assistente |
| Aba Instituição em Configurações e aviso de dados pendentes (alta) | §7.22 Instituição, §7.2 Avisos do sistema, §6.9, §13 |
| Reautenticação da coordenação nas ações críticas (alta) | DC-38, §4.3, §4.8, §7.5, §7.19, §7.22 |
| Visão do professor na Ouvidoria (encaminhadas, saneadas, parecer) (alta) | DC-40, §5.4, §7.1, §7.11, §2.3 rótulos |
| Caixa "resguardar identidade" sem efeito; coluna Identidade (média) | DC-40, §6.12 Ouvidoria, §7.11 |
| Trilha das respostas, escalonadas, teto global, retenção da trilha (média) | §7.22 Assistente › Uso, Limites e Trilha das respostas; §7.22 Privacidade › Retenção; §7.2 |
| Código da aula gerado pelo `admin.html` (média) | §7.16 Identidade e Aula |
| "Falar com a equipe": anexo desmarcado, prévia do escalonamento (média) | §6.12 Assistente |
| Acolhidas em parte (com o motivo) | §15 (linhas desta revisão) |

### 0.3 Terceira revisão de 18/10/2026 — cobertura (loja, acesso, regulamento, relatórios, certificado, tutoriais)

| Crítica (gravidade) | Onde foi aplicada |
|---|---|
| Loja e obrigado com texto falso: o checkout não registrava nada, citava "Mercado Pago" e "e-mail em 1 dia útil"; elo "Financeiro: mesma integração usada no pré-atendimento" sem tela (alta) | §6.19 ([Finalizar pedido] registra o pedido como atendimento ATD financeiro; obrigado com o número e texto honesto); §6.12 (origem "Pedido de curso" e bloco Pedido); §7.10 (filtro "Pedidos da loja", bloco Pedido, [Criar matrícula e lançamentos]); §7.14 e §7.18 (formulários preenchidos a partir do pedido); §9 (nome de gateway proibido); §13; P17 |
| Acesso por link sem tela para PEDIR link mágico nem recuperação de senha (alta) | §8.5 (modos `#pedir-link` e `#esqueci`; [Pedir novo link] no link vencido; `#email=` e `#verificar=` descritos); §13; P17 (contrato com a 2d) |
| Regulamento acadêmico sem leitura pelo aluno; "Fontes" do assistente não conferíveis (média) | §6.20 `regulamento.html` (nova); §6.12 (fonte = link ao trecho); §6.5 e §5.6 (entradas); §6.17 (Tutoriais); §7.22 (diálogo de publicação); §13; P17 |
| Professor sem Relatórios no menu, contra API §6.11.3 e índice §5.2 (média) | §5.4 (item Relatórios no grupo Ensino); §7.1 (linha própria); §7.23 (índice pelo catálogo do papel, filtros limitados à docência); §7.20 (guia); §13 |
| Motivo de "não apto" fixo com "7,0", sem frequência, carga e TCC (média) | §6.9 item 1 (regra com a `notaMinima` do servidor, lista de `pendencias[]` com o link que resolve, "Ainda não apurado", confirmação do nome pedida pela API §16.5); §6.3 (`aula.html?curso=`); §6.11 (filtros na URL); §13; P17 |
| Tutoriais sem catálogo de guias; critério de pronto satisfeito com central vazia (média) | §6.17 (catálogo mínimo de 17 guias, um por fluxo, cada um com a tela descrita; ≥ 1 por categoria; guia fora do ar marcado com o motivo); §7.20; §13; pedido ao índice §8.5 em P17 |
| Acolhidas em parte (com o motivo) | §15 (linhas desta revisão) |

### 0.4 Propagação das decisões D-37…D-82 do índice (18/10/2026, sessão principal)

Feita a pedido do índice §14 item 1 ("UX — falta tudo desde D-37"). Nenhuma decisão foi reaberta: o texto abaixo
leva ao corpo o que o índice §11 já decidiu, com os nomes atuais das 19 fatias (F0a, F0m, F0t, F0b, F0s, F0p, F0r,
F1a, F1b, F2, F3a, F3b, F4a, F4b, F5, F6a, F6b, F7, F8). Decisões só de servidor, teste ou processo, sem efeito em
tela, texto ou componente, não mudam este documento: D-40, D-41, D-49, D-58, D-62, D-64 e D-70 (as linhas da matriz
do índice que citam UX encontram aqui o termo do item, D-58).

| Decisão | Onde foi aplicada |
|---|---|
| D-37, D-59, D-78 (divisão das fatias) | §0 (tabela das 19 fatias e regra de leitura); todas as linhas `Fatia:` de §6, §7 e §8; DC-01 (prefixos `ac`, `dec`, `doc`, `ia`); §3 (donos do reskin); §4.3 (coluna Dono: F0s, F1b, F3a, F4b, F6a, F6b); §5 (F0s); §13 (coluna Fatia) |
| D-38 (despacho de validação na F3b) | §8.1 |
| D-39 (Assistente na F6b; regulamento e `fatiar` na F6a) | §7.22 (Assistente de IA, Regulamento) |
| D-42 (`registro-duplicado`) | §9 Erros |
| D-43 (CSP aplicada; sem `<script>` inline) | §2.1 item 7 |
| D-44 (`login-classico.html`) | §14 P12 |
| D-45 (D5 por invariantes de efeito e `SELETORES_D5`) | §3 fase E item 3; seletores preservados em §6.1, §6.2, §6.3, §6.6, §6.9, §6.19; §7.9 e §7.14 (R12 pela API) |
| D-46, D-67 (detector de neon do índice §9.6; páginas pendentes no G0) | §3 fase E itens 1 e 2; §7.25 |
| D-47 (`abrirArquivo`, rascunho de 401, zona de silêncio do QR) | §4.11 (Abrir arquivo); §4.8; §6.3, §6.8, §6.10, §6.15, §6.16; §10 item 6; §9 Erros; §12 |
| D-48, D-75, D-66 (guarda de `parcerias.html`; `itens` pelo `DMC_Portal`; roteador só em `professor.html`) | §5 (abertura), §5.4, §7.1, §7.16, §7.25 |
| D-50 (L12, L13 fechadas; L5 em parte) | §0; §6.1 Pendências; §6.12 (compositor) |
| D-51, D-63 (modo restrito antes de qualquer chamada; toast com ação; metas do tema) | §5 (Modo restrito); DC-10; §2.1 item 7 |
| D-52 (DC-61…DC-68 da API) | pelos itens de D-53: §6.3 (plano estruturado), §6.4, §6.9, §7.3, §7.6, §7.7, §7.16, §7.22, §8.1, §8.2 |
| D-53 (pedidos da API à UX) | §6.4 (pontos e devolutiva; `orientacao` e `limiteCaracteres`; questão de arquivo do TCC com [Enviar PDF]/[Substituir PDF]); §6.9 (confirmação do nome com `nomeOrigem:'conta'`; `hashPrefixo`); §7.3 (bibliografia em dois campos, limites, montar pelas `aulas`); §7.6 (`orientacao`, `limiteCaracteres`, `respostaReferencia`, tipo "Arquivo (PDF)", "Arquivos [n]"); §7.7 (`publicar:false`, `efeito`, [Publicar correção], baixar a entrega); §7.16 ("Tipo do módulo: Regular · TCC"); §7.22 (aviso "TCC exigido sem avaliação publicada"); §8.1 e §8.2 (`hashPrefixo`; "Emitido antes da verificação por selo") |
| D-54 (pedidos da UX à API; P16) | §5.4 (`ouvidoriaSemParecer`); §6.12 (`?categoria=&cursoId=`; `textoSha256` e 409 `conflito-versao`); §7.2 (`sistema.instituicaoPendente`); §7.11 (409 no 2º parecer); §7.16 (`motivo` no `refazer`); §7.22 Instituição (`motivo`, `endereco` em texto); §14 P16 confirmada |
| D-55 (textos v1 de gênero e etnia) | DC-39; §6.15 (Consentimentos no Perfil); §14 P3 |
| D-56 (capas vertical e do módulo) | §4.3 (Capa); §4.11 (sem `capaFoco`, recorte central); §6.1, §6.2, §6.3; §7.16 (envio da capa vertical no bloco Identidade e da capa do módulo); §14 P9 |
| D-57 (`DMC_UI.reautenticar`, `consentimento`, `enviar`) | DC-38, DC-39; §4.3; §4.8; §6.15; §7.22 (Assistente de IA) |
| D-60 (pontos S0–S3) | §2.1 item 6; §3 (abertura, fases B, C e D) |
| D-61 (testes do modo restrito) | §5 (Modo restrito: `portal-shell.spec.js` só do lado do cliente; fluxo real em `portal-titular.spec.js`); §6.15 |
| D-65 (moldura das telas compostas; subnavegação do Atendimento) | §4.3 (Subnavegação); §6.12 (markup fixo do índice §7.10, sem CSS em `portal-atendimento.css` nem em `portal-assistente.css`); §7.4; §7.5 |
| D-68 (QR conferido por `_qr.js`) | §4.3 (Documento imprimível); §8.2, §8.3, §8.4; §12 |
| D-69 (markup da loja e do obrigado) | §3 fase A e B3a; §6.19 |
| D-71 (telas de pedir link e nova senha da principal; aceite da 2d) | §6.15 (2FA só com `recursos().doisFatores`); §6.17 (guias de CPF e 2FA só depois do aceite); §8.5; §13 (Auth); §14 P12 e P17 |
| D-72 (comprovantes sem QR; código e hash por linha) | §4.3; §6.11; §8.4; §12; §13 |
| D-73 (`monitorarConsoleERede`) | §10 item 7 |
| D-74 (hospedeiros de tela P1f) | §6.3, §6.4, §7.1 e as linhas `Fatia:` das telas de backoffice penduradas em `professor.html` |
| D-76 (gancho `data-pf-acao`) | DC-11; §4.3 (Diálogo); §4.8 (Confirmação); §6.9; §7.16 (correções obrigatórias) |
| D-77 (normalização do YouTube; MP4 de mesma origem) | §6.3 (palco) |
| D-79 (pedido da loja com os nomes da API) | §6.12 (filtro Origem sem "Pedido de curso"; bloco Pedido sem enriquecimento); §6.19 (`ja-liberado`, `reaproveitado` com `&existente=1`, rota da F5, 404 pelo caminho legado honesto, limite de 5/h); §7.10 (`?pedido=1`, `liberarAcesso:false`, 409 `matricula-vigente-existe`); §7.14 (`liberarAcesso` booleano; origem Manual); §7.18 (`?pedido=1`; "Pedido ATD-…" na descrição); §13; §14 P17 |
| D-80 (`notaMinima` no certificado e no `ResumoMatricula`) | §6.5; §6.9; §13 |
| D-81 (`regulamento.html`, âncora com `regulamentoId`) | §6.12 (Fontes; edição arquivada só com o título); §6.20; §13 |
| D-82 (DC-69…DC-78 da API) | §6.4 (entrega do TCC por `POST`, DC-71); §6.15 (`consentimentos.*` da F0t, DC-72); §7.5 (`GET /portal/professor/alunos/:userId/matriculas` e `?userId=`, DC-73); §6.19 (DC-69, com os nomes de D-79); §6.20 (DC-70) |

Confirmações pedidas pelo índice: **P16 atendida por D-54** (e por D-57 e pelo índice §6.3) e **P17 atendida por
D-71, D-79, D-80 e D-81**, com os itens que D-79 deixou fora desta rodada registrados em §14.

---

## 1. Decisões de consolidação

Os três rascunhos divergiam nestes pontos. A decisão abaixo vale para todas as fatias; quando ela
altera um contrato da arquitetura, a coluna "Efeito" diz o quê.

| # | Tema | Decisão | Motivo | Efeito em contrato |
|---|---|---|---|---|
| DC-01 | Prefixo de classe | **Um só prefixo, `pf-`**. Componentes do catálogo (§4) usam `pf-<componente>`. Classe que uma fatia criar fora do catálogo usa `pf-<dominio>-…` com `est` (F1b), `av` (F2), `ac` (F3a), `dec` (F3b), `sec` (F4a), `doc` (F4b), `fin` (F5), `at` (F6a), `ia` (F6b), `com` (F7), `prof` (F8) (índice §8.2 item 4; `doc` e `dec`/`ac` vêm das divisões D-78 e D-37). Os componentes de domínio já nomeados no catálogo (§4.3: `pf-heroi`, `pf-calendario`, `pf-sigla`, `pf-chat`…) mantêm o nome e moram no CSS da fatia dona; classe **nova** sem prefixo de domínio só na F0s. A classe de JS ativo no `<html>` é `pf-js` | um vocabulário só, sem colisão entre fatias | substitui os prefixos soltos `est-`, `av-`… e o antigo `pt-` |
| DC-02 | Nomes dos tokens | `--pf-painel`, `--pf-painel-2`, `--pf-painel-3` (não `--pf-sup-*`); `--pf-acento-rgb` em todo CSS **escrito** para a plataforma (não `--np-accent`); `--pf-acao`, `--pf-acao-hover`, `--pf-acao-texto` (não `--pf-primario-*`); `--pf-topo-fundo` (não `--pf-vidro`). Como `components.css` lê `--np-accent`, `--text-1..3`, `--color-line*` e `--focus-color`, o `portal.css` **religa** esses tokens da casa a partir dos `--pf-*` (§2.2 camada 2, §4.2) | uma palavra por ideia, em português | tabela §2.2 é a lista fechada |
| DC-03 | Superfície de fundo | `--pf-fundo` = `--surface-0` `#0b0c0e` (o mesmo do site e do login da 2d); painel = `--surface-1`, painel-2 = `--surface-2`, painel-3 = `--surface-3` | o portal precisa conversar com o login da 2d, que usa `--surface-0` no fundo e no campo | contrastes recalculados (§2.2) |
| DC-04 | Cor de aviso e de erro no papel | aviso = laranja queimado `#dd881b` (escuro) / `#9a5518` (claro), não o cobre do E4 nem o âmbar `#e39b62` do rascunho; erro no claro = `#9b463e`, não `--color-error-ink`. Medida em OKLab: no escuro, aviso fica a ΔE 0,097 do ouro e 0,100 do erro (o âmbar ficava a 0,053 do ouro). No claro não há folga para AA: `#9a5518` (ΔE 0,047 do ouro profundo) só aparece com triângulo + texto, nunca como ponto ou fio isolado e nunca vizinho de `--pf-acento` no mesmo componente | âmbar colide com o ouro (o mesmo motivo que levou o E4 a cobre); `--color-error-ink` dá 4,27:1 no papel-2 e reprova | `tokens.css` não muda (pendência P2 para promover); `tools/contraste.mjs` mede ΔE (§2.3) |
| DC-05 | Reskin de `plataforma.css` | o bloco `:root` legado e as seções LOGIN e EIXO 3D **não** mudam; ficam entre marcadores de comentário (`@dmc-root-legado`, `@dmc-legado-login`) e nunca são referidos por número de linha. O remapeamento neon → ouro e a sobreposição de `.btn-primary` moram em `portal.css`. `--green` vira **sucesso** (era "feito/ok"), não ouro | `login-classico.html` (2d) lê esse `:root` sem `tokens.css` | §3 |
| DC-06 | A−/A+ | **4 níveis**: −1 = 93,75% · 0 = 100% · 1 = 112,5% · 2 = 125%. Acima disso vale o zoom do navegador | é o contrato `DMC_Shell.fonte` (−1…2) e o pior caso já desenhado no backoffice | aceite de reflow em 320 px no nível 2 |
| DC-07 | Tema padrão | **escuro** (identidade da casa). Em Perfil › Preferências há "Automático (segue o aparelho)" | decisão de identidade do CEO; o automático continua possível | `pre-pintura.js` sempre grava `data-pf-tema` |
| DC-08 | Medidas do shell | topo **64 px** abaixo de 1024 e **72 px** a partir de 1024 (`--header-h`, `--header-h-lg` da casa); lateral 264 / 72 px | mesma altura de cabeçalho do site e do login | `--shell-top-h` legado recebe o mesmo valor |
| DC-09 | Tabela responsiva | `pf-tabela` vira lista empilhada quando o contêiner `pf-main` tem menos de **44em** (≈ 704 px no nível 0). Entre 44em e 64em, colunas marcadas como secundárias somem (o dado continua no detalhe). **Nenhuma** tabela rola na horizontal | usa contêiner em `em`, então reage ao A+ e à lateral aberta | `DMC_UI.tabela` troca o limiar de 720 px por `@container pf-main (min-width: 44em)` |
| DC-10 | Retorno temporário e alertas | aviso temporário = **`pf-toast`** (`DMC_UI.toast`), 6 s, pausa no hover e no foco; erro **e toast com ação** ("Desfazer", "Ver") não somem sozinhos (WCAG 2.2.1); caixa de aviso no fluxo = **`pf-alerta`**; erro de carga = `pf-alerta--erro` com "Tentar de novo" | três nomes para "aviso" geravam ambiguidade com o estado `aviso`; quem usa teclado ou leitor de tela não alcança a ação em 6 s | `DMC_UI.toast` padrão `duracaoMs = 6000`, **ignorado quando há `acao`** (índice D-51); `DMC_UI.erroCarga` desenha `pf-alerta--erro` |
| DC-11 | Confirmação destrutiva | sempre `pf-dialogo` por `DMC_UI.confirmar` (foco inicial em "Cancelar"). Ação que exige motivo = diálogo com campo "Motivo (fica registrado na auditoria)". Os botões levam o gancho estável `data-pf-acao="confirmar"` / `data-pf-acao="cancelar"` (D-76) | um padrão só; o `mod-confirma` inline do `admin.js` fica até a F8 migrar | a regressão D5 dispara pela API os efeitos que passavam por `confirm`/`prompt` e, nos casos de tela, usa `confirmarNaTela` sobre o gancho (índice §9.2 item 3) |
| DC-12 | Abas × filtro | `pf-abas` (sublinhado, `role=tablist`) **troca de painel**; `pf-segmento` (grupo com fio, `aria-pressed`) **filtra** a lista. Contagem sempre entre parênteses: "Em aberto (6)". Abaixo de 30em: até 4 opções em grade 2×2; mais de 4 opções viram `<select>` rotulado "Mostrar" | o rascunho do professor usava o segmentado como aba | — |
| DC-13 | Cabeçalho de página | um só `pf-cabecalho` nos dois portais: contexto (overline com o grupo do menu, ou link "← Voltar" em tela de detalhe) → H1 → descrição → ações | "mesmo componente lê igual em todas as páginas" | — |
| DC-14 | Menu do aluno | ordem e rótulos do rascunho do aluno (§5.3). **Documentação** é o único submenu (pede o blueprint); **Atendimento** é um item com subnavegação local. "Loja" passa a "Cursos disponíveis" | menu curto; submenu só onde o blueprint pede | a lista do shell na arquitetura é substituída pela §5.3 |
| DC-15 | Troca de área | não existe "Ver como". A conta tem **um** papel. Equipe que abre página do aluno vê o menu do aluno com o item de rodapé "Portal do professor" (professor) ou "Coordenação" (admin); no backoffice, o rodapé tem "Área do aluno". O item "Cursos (admin)" sai do menu do aluno | papel é único (contrato com a 2d); simulação de papel no cliente confundiria a autorização | — |
| DC-16 | Grupos do backoffice | **Ensino · Secretaria · Relacionamento · Gestão** (Visão geral sem grupo) | rótulos do rascunho do professor | `DMC_Professor.registrar({menu:{grupo}})` aceita `ensino` · `secretaria` · `relacionamento` · `gestao` |
| DC-17 | Contadores e indicadores | contagem é neutra: no menu, número tabular `--pf-texto-2`; no sino, marca retangular `--pf-texto-1` com número `--pf-fundo`. **Nenhum indicador de estado usa `--pf-acento`** (nem "Ao vivo agora", nem pendência, nem encontro próprio): estado = glifo + texto nas cores de §2.3 ou neutro | princípio "ouro só em ação, linha ativa e foco"; WCAG 1.4.1 | — |
| DC-18 | Calendário | aluno e equipe usam o mesmo `pf-calendario` com **Hoje · Semana · Mês · Lista**. Semana = 7 colunas com encontros empilhados (sem grade de horas) | legível, acessível e sem biblioteca | — |
| DC-19 | Esqueleto | pulso de opacidade (0,6 ↔ 1, 1,2 s), igual ao `bs-card--esqueleto` da 2d; estático com movimento reduzido | conversa com o login; sem brilho deslizante | — |
| DC-20 | Tamanho de upload | documentos, contrato, 2ª via, PDF de publicação e anexo de atendimento até **4 MB**; foto até 2 MB | limite de corpo da Vercel (4,5 MB) | textos de ajuda usam esses números (o rascunho do aluno dizia 10 MB) |
| DC-21 | Categorias de atendimento | **Acadêmico · Secretaria · Financeiro · Acesso e tecnologia · Privacidade e dados pessoais** (enum do back: `academico`, `secretaria`, `financeiro`, `tecnico`, `privacidade`). Pedido do titular (LGPD) = categoria `privacidade` + `pedidoTitular` (Acesso · Correção · Eliminação · Informação sobre compartilhamento · Revogação de consentimento · Outro); o servidor calcula o prazo de resposta (15 dias, LGPD art. 19) e a tela mostra `prazoRespostaEm` | D-10 do índice; o prazo e o roteamento à coordenação dependem da categoria | atalho do admin `#/atendimento?categoria=privacidade` |
| DC-22 | Gênero e etnia | visíveis **só ao titular** e em estatística agregada; a coordenação vê "Restrito". Nome de registro, CPF, nascimento e passaporte ficam **travados** para o titular depois de contrato assinado ou certificado emitido | regra do back (LGPD, minimização) | tela de Cadastro do aluno no backoffice mostra "Restrito" |
| DC-23 | Validação pública | uma página, `validar.html?codigo=`, para todos os prefixos (certificado, declaração, comprovante, contrato). Mostra **iniciais** do titular e o campo "Conferir nome" (nunca o nome completo, CPF ou e-mail) | resposta pública do back devolve iniciais + conferência por nome | o back deve apontar a URL de verificação de contrato para `validar.html` (hoje cita `verificar-contrato.html`) |
| DC-24 | Plano de ensino | componente único `DMC_PlanoEnsino` (F1b, `prof-conteudo.js`), editado em `#/cursos` e embutido pela F8 na aba "Plano de ensino" do módulo em `admin.html` | uma tela de edição; posse respeitada | contrato da F1b no índice §7.7: `DMC_PlanoEnsino.montar(el, {cursoId, moduloId, somenteLeitura})`, com o plano estruturado (DC-61 da API, D-53) |
| DC-25 | Editor de conteúdo para professor | `admin.html` ("Conteúdo") abre para **professor e admin**; o professor vê só os cursos vinculados e edita **só** plano de ensino, materiais do módulo, categoria de material e rótulo do encontro (D-21); título, vídeo, ordem, "No ar/Em breve" e exclusão de aula e de módulo aparecem em leitura com a ajuda "Alteração feita pela coordenação." (§7.16) | o blueprint pede o professor editando plano, materiais e aulas; a API autoriza só esse conjunto | guarda `requireProfessorOrRedirect` em `admin.html`; ampliar = acréscimo da F1a + decisão do CEO |
| DC-26 | Matrículas × Turmas | `#/matriculas` tem as abas **Matrículas · Acessos sem matrícula**; nesta rodada (L7) a 2ª aba é só o botão [Gerar matrículas a partir das liberações] com o resultado "N criadas · M já existiam"; a lista de turmas fica só em `#/turmas` (F8) e a criação em `#/turmas/nova` (F4a) | evita a mesma tabela em dois lugares | — |
| DC-27 | Prévia como aluno | sem modo especial: professor do curso já tem acesso e abre o player normal, com a faixa "Você está vendo este curso como professor. Seu progresso não entra em notas nem relatórios." A prévia de avaliação (F2) não grava nada | menos código, mesmo resultado | — |
| DC-28 | Autor da resposta em dúvida | nome de exibição + papel ("Ana Lima · Professora", "Coordenação"); a palavra "instrutor" sai | vocabulário fixo (§9) | — |
| DC-29 | Ícones | conjunto próprio em `DMC_Icons` (`app.js`, F0b), 24×24, **traço 1,5**, `currentColor`. Não existe `js/pf-icones.js` | posse da arquitetura; traço do rascunho do aluno (mais leve, conversa com os ícones do login) | lista de ícones §4.12 |
| DC-30 | Pré-pintura | `js/portal/pre-pintura.js` (síncrono, primeiro no `<head>`). Não existe `js/pf-preferencias.js` | nome da arquitetura | — |
| DC-31 | Destino pós-login do admin | continua `admin.html` (contrato com a 2d). `professor.html#/inicio` fica como recomendação (pendência P6) | não mudar contrato sem avisar a 2d | — |
| DC-32 | URL do player | `aula.html?curso=&modulo=&item=<tipo>:<id>`; `aula.html?id=<aulaId>` continua abrindo a aula | contrato da F1b (rotas da F1a) e D5 | — |
| DC-33 | Margem de impressão | A4, **18 mm** em toda impressão | um valor só | — |
| DC-34 | Nome do assistente | "Assistente acadêmico", com "Em fase de testes" ao lado do título; sem persona, sem "BETA" | identidade própria; sem selo em inglês | — |
| DC-35 | Faixa do topo | uma por vez; chave de dispensa `dmc:banner:<id>:dispensado` só em `localStorage` (D-17: preferência no servidor fica para depois) | contrato do shell | — |
| DC-36 | Locais de banner | `topo` (só texto, até 90 caracteres no front) e `inicio` (título 3–80, texto até 160, imagem opcional; D-28). Enquanto não houver `imagem.descricao` (L6), a imagem é decorativa (`alt=""`) e título + texto precisam bastar | rascunho do professor + API | — |
| DC-37 | Busca do backoffice | alvo: Alunos · Turmas · Aulas · Atendimentos · (admin) Matrículas · Documentos. **Nesta rodada (L3)**: Tudo · Cursos · Aulas · Publicações · Atendimentos · (admin) Documentos | rascunho do professor | pedido (L3, índice §12): provedores `alunos`, `turmas`, `matriculas` da F4a no grupo `busca`, com os campos de `perfis.publicos` (F0t) |
| DC-38 | Reautenticação da coordenação | **um componente**, `pf-reautenticacao` (senha atual + código do aplicativo quando o admin tem 2FA), exigido antes de toda ação que a API marca com `reautenticacao` (§4.8). Ação que já tem diálogo próprio (motivo) recebe o bloco no fim do MESMO diálogo; ação sem diálogo (salvar e remover a chave do Gemini) abre o diálogo "Confirme sua identidade" | a API responde 400 `campos.senha` sem esse corpo; dois diálogos empilhados confundem foco e leitor de tela | contrato do índice §7.5 (D-57): `DMC_UI.reautenticar({ rotuloConfirmar, enviar })` (F0b) recebe `enviar(reautenticacao)` e devolve o resultado ou `null`; nas ações com diálogo, `DMC_UI.confirmar`/`formulario({ reautenticar:true, enviar })` põem o mesmo bloco no fim; o diálogo fica **aberto** durante o envio para mostrar o erro no campo. CSS `pf-reautenticacao` da F0s |
| DC-39 | Textos de consentimento | todo texto de consentimento é **literal do servidor** e nunca reescrito pela tela: assistente = `estado.consentimento.texto` (`GET /portal/me/ia/estado`); perfil = `textosConsentimento.<finalidade>.texto` (`GET /portal/me/perfil`; os textos v1, inclusive gênero e etnia, moram em `server/src/portal/consentimentos-textos.js`, F0t, D-55). A tela só põe título, botões, data e versão. O componente é um só, `pf-consentimento`, usado no Perfil, em Meus dados e no Assistente | a API grava o `textoSha256` do texto exibido; paráfrase faria o aluno consentir com outro texto (LGPD art. 8º) | comportamento `DMC_UI.consentimento` (F0b) e CSS `pf-consentimento` (F0s), D-57 (§4.3) |
| DC-40 | Ouvidoria e identidade | a identidade do manifestante **nunca** chega a professor, nos 4 tipos (API DC-46); o formulário do aluno não tem caixa de "resguardar identidade", só o aviso fixo; denúncia não se encaminha; o professor tem a visão "Ouvidoria (encaminhadas)", saneada, com parecer à coordenação | um controle sem efeito engana quem o marca; a notificação `ouvidoria.encaminhada` leva o professor a `#/ouvidoria/<OUV>` | §5.4, §7.1, §7.11 |

---

## 2. Fundamentos visuais da plataforma

### 2.1 Carregamento (todas as páginas, aluno, equipe e públicas)

Ordem fixa no `<head>` (modelo da arquitetura, com os ajustes de tema):

1. `<script src="js/portal/pre-pintura.js?v=…"></script>` síncrono e **primeiro** (≈ 1 KB). Lê
   `localStorage` (`dmc:tema`, `dmc:fonte`), grava `data-pf-tema`, `data-pf-fonte` e a classe `pf-js`
   no `<html>` antes da primeira pintura e ajusta os dois metas abaixo para o tema resolvido.
2. **Um** `<meta name="color-scheme" content="dark">` e **um** `<meta name="theme-color" content="#0b0c0e">`
   (valores do padrão escuro, DC-07); o `pre-pintura.js` troca para `light` e `#f5f3ef` no tema claro. O CSS
   repete a regra (§2.7), então o resultado não depende do sistema operacional.
3. Favicon `../assets/images/favicon-dmc.png` (64×64) e `<link rel="apple-touch-icon"
   href="../assets/images/apple-touch-icon.png">` (o arquivo já existe no site). `RINO_logo.png` e
   `LOGO_RINOCERONTE.png` (turquesa) saem de toda a plataforma, inclusive do certificado.
4. Google Fonts: **o mesmo link do site e do login** (Hanken Grotesk 400..600 + Newsreader opsz 48,
   peso 300, normal e itálico, `display=swap`) por `<link rel="stylesheet">` comum. Sem o truque
   `media=print onload` (seria handler inline). É CSS de terceiro, não script: não lê `localStorage`.
5. `../assets/css/tokens.css?v=1` → `../assets/css/components.css?v=3` → `css/plataforma.css` (legado
   reskinado) → `css/portal.css` (camada `--pf-*`, temas, compatibilidade, shell, componentes) →
   `css/portal-<dominio>.css` (só o da página; `professor.html` carrega todos).
6. Sai de todas as páginas: link de DM Sans/Raleway/Playfair, `<div class="glow-corner">`, a classe
   `bg-grid` do `<body>` e `.gradient-text` (vira `<em>`). Enquanto o HTML não for trocado, o CSS os
   neutraliza (§3, fase A). A troca do `<head>` das páginas legadas é mecânica: `tests/tools/cabecalho-ead.mjs` (F0r)
   aplicado pela principal no ponto S2 da fase 0 (D-60, índice §8.3).
7. Nenhum `<script>` inline nem atributo `on*=` em página da plataforma (exceto `login.html` e `login-classico.html`,
   da 2d): o boot mora em `js/portal/<pagina>.js` ou, nos legados com boot inline (`index`, `loja`, `obrigado`,
   `admin`), em `js/portal/boot-<pagina>.js` da fatia dona. A CSP estrita de `/plataforma-ead/` (índice §9.6) fica em
   report-only desde o G0 e passa a **aplicada** no G2 (D-43); por isso nenhum componente desta especificação depende
   de handler inline, `style=` com cor ou script de outra origem. O item 2 (um `color-scheme` e um `theme-color`
   ajustados pelo `pre-pintura.js`) e o `apple-touch-icon` do item 3 são do D-51.

### 2.2 Tokens semânticos `--pf-*` (lista fechada, declarada em `css/portal.css`)

Regra: o CSS da plataforma consome **só** `--pf-*` e os tokens neutros de `tokens.css` (espaço, raio,
movimento, camadas, fontes, `--hit`). Nenhuma cor literal fora de `portal.css`. Os valores apontam para
tokens da casa sempre que existem (`var(--surface-1)` e não `#121416`), **exceto** os que a própria
plataforma religa (abaixo): esses levam no escuro o literal idêntico ao de `tokens.css` (`#f5f3f0`,
`#bfbdb9`, `#9a9893`, `rgba(255,255,255,.10)`, `rgba(255,255,255,.18)`), com teste em
`front-estatico.test.js` que confere a igualdade, porque apontar para `--text-1` criaria ciclo.

**Três camadas em `portal.css`** (uma propriedade customizada que usa `var()` é resolvida no elemento onde
é declarada e herdada já calculada; por isso trocar só o fundo, como faz `.dmc-on-paper`, deixa o texto
claro dentro do papel):
1. **Base por tema** (valores dos quadros abaixo):
   `:root, html[data-pf-tema="escuro"], .pf-escopo-escuro { …escuro }` e
   `html[data-pf-tema="claro"], .pf-escopo-claro { …claro }`.
2. **Derivados, recalculados em cada escopo** — seletor `:root, .pf-escopo-claro, .pf-escopo-escuro`
   (e a lista de componentes do item 3): apelidos legados (`--ink*`, `--line*`, `--bg*`, `--cyan*`,
   `--green*`, `--gradient*`, `--shadow`, §3 fase A) e tokens da casa lidos por `components.css`:
   `--text-1/2/3: var(--pf-texto-1/2/3)`, `--color-line: var(--pf-linha)`, `--color-line-strong:
   var(--pf-linha-forte)`, `--focus-color: var(--pf-foco)`, `--np-accent: var(--pf-acento-rgb)` (no claro
   isso dá `130, 96, 46`).
3. **Superfícies que invertem** entram nas mesmas listas de seletor das camadas 1 e 2, sem depender de
   classe no HTML: **sempre claras** `.pf-documento` (certificado, declaração, comprovantes, comprovante de
   assinatura) e `html[data-pf-tema="escuro"] .pf-leitura`; **sempre escuras** `.pf-heroi`, `.pf-palco`,
   `.pf-capa`, `.pf-publicacao__midia` (miniatura de vídeo). As classes `.pf-escopo-claro` /
   `.pf-escopo-escuro` ficam para uso explícito (prévia de banner nos dois temas, §7.13). Cada escopo também
   declara `color: var(--pf-texto-1); background: var(--pf-fundo)` (exceto mídia, que tem imagem) e
   `color-scheme` do seu tema (§2.7).

`.dmc-on-paper` **não** é usado dentro da plataforma (substituído por `.pf-escopo-claro`). Os blocos
invertidos entram no axe dos dois temas (§11).

Superfícies e linhas:

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--pf-fundo` | `--surface-0` `#0b0c0e` | `--color-paper` `#f5f3ef` | tela, lateral (separada por fio) |
| `--pf-topo-fundo` | `--surface-glass` `rgba(11,12,14,.72)` + blur 16 | `rgba(245,243,239,.92)` + blur 16 | barra superior |
| `--pf-painel` | `--surface-1` `#121416` | `--color-white` | objeto: tabela, formulário, diálogo, popover, mídia, conversa |
| `--pf-painel-2` | `--surface-2` `#1a1c1f` | `--color-paper-2` `#e9e6e0` | hover, selecionado, cabeçalho de tabela, mensagem do aluno |
| `--pf-painel-3` | `--surface-3` `#24272a` | `#dedad3` | **sem texto fino**: esqueleto, avatar de iniciais, miniatura vazia |
| `--pf-campo` | `--surface-0` | `--color-white` | fundo de campo (igual ao `bs-input` da 2d) |
| `--pf-veu` | `rgba(11,12,14,.72)` | `rgba(11,12,14,.48)` | véu de gaveta e diálogo (o tour não tem véu, §5.7) |
| `--pf-linha` | `rgba(255,255,255,.10)` (= `--color-line`) | `--color-line-ink` `rgba(11,12,14,.14)` | fio decorativo e separador |
| `--pf-linha-forte` | `rgba(255,255,255,.18)` (= `--color-line-strong`) | `rgba(11,12,14,.24)` | borda de botão secundário, divisor de seção, hover de cartão |
| `--pf-controle` | `--color-control` `#67696c` | `--color-control-ink` `#7f8285` | borda de campo, checkbox, rádio, switch |
| `--pf-controle-forte` | `#7d7f83` | `#6e7175` | campo sobre `--pf-painel-2` ou `--pf-painel-3` |
| `--pf-trilha` | `--color-graphite-600` `#36383c` | `#d9d5cd` | trilho de progresso e de donut |
| `--pf-sombra` | `--shadow-overlay` | `0 24px 48px -28px rgba(11,12,14,.28)` | **só** popover, menu, gaveta, diálogo, toast |

Texto, acento e ação:

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--pf-texto-1` | `#f5f3f0` (= `--text-1`) | `--text-ink-1` `#0b0c0e` | texto principal |
| `--pf-texto-2` | `#bfbdb9` (= `--text-2`) | `--text-ink-2` `#4a4d52` | secundário |
| `--pf-texto-3` | `#9a9893` (= `--text-3`) | `--text-ink-3` `#616368` | meta e legenda, nunca abaixo de 13 px |
| `--pf-acento` | `--color-gold` `#d6b069` | `--color-gold-deep` `#82602e` | texto, fio e ícone ativos |
| `--pf-acento-rgb` | `214, 176, 105` | `130, 96, 46` | `rgba(var(--pf-acento-rgb), a)` |
| `--pf-acento-hover` | `--color-gold-soft` `#e7d3b1` | `#6b4e24` | hover de link em acento |
| `--pf-acao` / `--pf-acao-hover` | `#d6b069` / `#e7d3b1` | `--color-black` / `--color-graphite-700` | fundo do botão primário (DESIGN-SYSTEM: sobre papel, fundo preto) |
| `--pf-acao-texto` | `--text-on-gold` `#0b0c0e` | `--color-paper` `#f5f3ef` | texto do primário |
| `--pf-foco` | `--color-gold` | `--color-gold-deep` | outline 2 px, offset 3 px (`--focus-width`, `--focus-offset`); `-2px` dentro de contêiner com rolagem própria (§4.3) |

Contraste medido (WCAG 2.x, `tools/contraste.mjs`), na ordem fundo · painel · painel-2 · painel-3:

| Par | Escuro | Claro (fundo papel · branco · papel-2 · painel-3) |
|---|---|---|
| `--pf-texto-1` | 17,67 · 16,67 · 15,42 · 13,56 | 17,66 · 19,57 · 15,71 · 14,05 |
| `--pf-texto-2` | 10,43 · 9,84 · 9,10 · 8,00 | 7,66 · 8,49 · 6,81 · 6,09 |
| `--pf-texto-3` | 6,79 · 6,41 · 5,92 · 5,21 | 5,43 · 6,01 · 4,83 · **4,32 ✗** |
| `--pf-acento` (texto e foco) | 9,57 · 9,03 · 8,35 · 7,35 | 5,17 · 5,73 · 4,60 · **4,12 ✗** |
| `--pf-acento-hover` | 13,37 · 12,62 · 11,67 · 10,26 | 6,91 · 7,66 · 6,15 · — |
| texto do primário sobre `--pf-acao` | 9,57 (hover 13,37) | 17,66 (hover 13,55) |
| `--pf-controle` (UI ≥ 3:1) | 3,55 · 3,35 · 3,10 · **2,73 ✗** | 3,49 · 3,86 · 3,10 · **2,77 ✗** |
| `--pf-controle-forte` | 4,88 · 4,60 · 4,26 · 3,74 | 4,43 · 4,90 · 3,94 · 3,52 |
| preenchimento acento × `--pf-trilha` | 5,75 | 3,92 |

Regras derivadas (ficam no CSS, não dependem da tela):
1. Campo dentro de `--pf-painel-2` ou `--pf-painel-3` usa `--pf-controle-forte`.
2. No tema claro, `--pf-painel-3` não recebe texto abaixo de `--pf-texto-2`, acento nem marcador de
   estado. Ele só serve a esqueleto, avatar de iniciais e miniatura vazia.
3. O trilho de progresso não carrega informação sozinho: o percentual vem sempre em texto ao lado.

### 2.3 Cores de estado (sóbrias, derivadas da casa; ouro nunca é estado)

Sucesso usa a sálvia do E2, info a ardósia do E3 (níveis `accent`/`deep` da casa). Erro usa
`--color-error` no escuro e um tom mais fechado no papel (DC-04). Aviso é laranja queimado, mais escuro e
mais cromático que o ouro (DC-04).

| Token | Escuro (texto/ícone) | Claro (texto/ícone) | Fundo de destaque (escuro · claro) | Contraste escuro (fundo · painel · painel-2 · destaque) | Contraste claro (papel · branco · papel-2 · destaque) |
|---|---|---|---|---|---|
| `--pf-sucesso` | `#8ec899` | `#466e59` | `rgba(142,200,153,.12)` · `rgba(70,110,89,.08)` | 10,13 · 9,56 · 8,84 · 7,64 | 5,21 · 5,78 · 4,64 · 5,17 |
| `--pf-aviso` | `#dd881b` | `#9a5518` | `rgba(221,136,27,.12)` · `rgba(154,85,24,.08)` | 7,09 · 6,69 · 6,19 · 5,68 (painel-3: 5,44) | 5,14 · 5,70 · 4,57 · 5,09 |
| `--pf-erro` | `#e88f84` (= `--color-error`) | `#9b463e` | `rgba(232,143,132,.12)` · `rgba(155,70,62,.08)` | 8,10 · 7,64 · 7,07 · 6,34 | 5,67 · 6,29 · 5,05 · 5,59 |
| `--pf-info` | `#8caed7` | `#4d688a` | `rgba(140,174,215,.12)` · `rgba(77,104,138,.08)` | 8,53 · 8,05 · 7,44 · 6,63 | 5,17 · 5,73 · 4,60 · 5,16 |
| `--pf-neutro` | `--pf-texto-2` | `--pf-texto-2` | `rgba(255,255,255,.06)` · `rgba(11,12,14,.05)` | ≥ 8,00 | ≥ 6,81 |

Cada estado declara também `--pf-<estado>-rgb` para os alfas (ex.: `--pf-erro-rgb: 232,143,132` no
escuro e `155,70,62` no claro). Destaque claro foi medido sobre branco. **`--destaque` é proibido dentro de
`pf-tabela`, `pf-lista` e `pf-linha-tempo`**: papel-2 é o hover e o selecionado dessas linhas e, no claro, o
marcador com destaque cai abaixo de AA ali (aviso 4,13, info 4,17, sucesso 4,20). Nessas linhas o marcador
é só glifo + texto (sobre papel-2: 4,64 · 4,57 · 5,05 · 4,60). `tools/contraste.mjs` mede esses pares e,
no escuro, exige ΔE_OK ≥ 0,08 entre aviso, erro e acento; no claro registra a exceção do aviso (ΔE 0,047 do
ouro profundo, 0,061 do erro) e a guarda de forma de DC-04.

**Forma também codifica** (WCAG 1.4.1). Todo marcador tem glifo SVG de 14 px **e** texto visível. A
lista de rótulos é **única** para aluno e equipe: o mesmo rótulo tem sempre o mesmo estado.

| Glifo | Estado | Rótulos |
|---|---|---|
| círculo cheio com check | sucesso | Aprovado, Concluído, Pago, Pago em dd/mm, Assinado, Emitida, Presente, Presença registrada, Publicada, No ar, Ativa (matrícula), Ativo (equipe), Conexão confirmada, Corrigida, Autorizado (consentimento), Parecer enviado (professor), Parecer recebido (coordenação) |
| meio círculo | info | Cursando, Em andamento (turma), Em revisão, Em correção, Aguardando correção, Aguardando parecer, Respondido, Aberto (protocolo e manifestação) |
| triângulo com "!" | aviso | Pendente (com motivo), Em recuperação, Vence em N dias, A corrigir, Parecer pendente, Rascunho, Prazo a definir, Chave recusada no teste, Teto atingido hoje, Não cadastrado (dados da instituição) |
| losango com "×" | erro | Reprovado, Em atraso, Falta, Ausente, Revogada, Recusada |
| círculo vazado | neutro | Não iniciado, Não enviado, Agendado (encontro e banner), Em aberto (lançamento), Encerrado/Encerrada, Cancelado/Cancelada, Trancada, Em breve, Sem turma, Sem avaliação, Planejada, Arquivada, Desativado, Substituído, Não autorizado (consentimento nunca dado ou retirado) |

"Em análise" e "Indeferida" (declarações, D-15) e "Agendada" (publicação, D-20) não existem nesta rodada.

**"Ao vivo agora"** não é estado de cor: anel neutro de 8 px (borda 2 px `--pf-texto-1`) + o texto "Ao vivo
agora" em Hanken 600 `--pf-texto-1`; o anel pulsa só em opacidade **3 vezes** (≈ 4 s) e fica estático (e
estático com movimento reduzido). Nunca em `--pf-acento` (DC-17). Contagem de fila não é estado (DC-17).
O ícone do botão de tema (sol/lua, §5.2) é diferente do glifo info.

### 2.4 Tipografia e escala da plataforma

- **Newsreader 300** (normal e itálico): H1 de página, H2 de seção, título do herói do curso, número
  de KPI, número de módulo ("01"), percentual do donut, nota do resultado. O itálico em `--pf-acento`
  substitui o antigo `.gradient-text` (no máximo **uma** palavra por título; nunca em tela de fila ou
  tabela do backoffice, exceto a saudação da Visão geral).
- **Hanken Grotesk 400/500/600** (teto 600): todo o resto. Botão 14 px/600 em caixa de sentença, sem
  caixa-alta e sem espaçamento largo; menu 15 px/500; tabela 15 px com `tnum`; rótulo de campo 15 px/500.
- **Pesos do navegador**: a base de `portal.css` fixa `b, strong, th, h1–h6, legend { font-weight:
  var(--fw-semibold) }` (Hanken só vem de 400 a 600); todo título em Newsreader leva `font-weight:
  var(--fw-light); font-synthesis-weight: none` (sem negrito falso; `<strong>` dentro dele herda 300).
- **Overline**: 12 px, 600, caixa-alta, .16em, `--pf-texto-3` — inclusive `.dmc-overline`, que no
  `components.css` é ouro e aqui é sobrescrita nos dois temas (§4.2). Só onde orienta (contexto do
  cabeçalho, rótulo de KPI, seção do player). Nunca em todo bloco.
- Código da aula, protocolo, matrícula, hash: Hanken 500, `tnum`, `letter-spacing: .04em`,
  `overflow-wrap: anywhere`. Sem fonte mono (seria a terceira família).
- Números: `font-feature-settings: var(--font-numeric)` em KPI, tabela, valor, data, cronômetro.
- Parágrafo até `--measure` (38rem); leitura longa até `--container-text` (46rem). Altura de linha:
  corpo 1,6; UI 1,4; título 1,15.

Escala `--pf-fs-*` (em rem para o A−/A+ escalar tudo; menor que a do site, que é editorial):

| Token | Valor | Px no nível 0 (320 → 1440) | Uso |
|---|---|---|---|
| `--pf-fs-titulo` | `clamp(1.75rem, 1.5rem + 1.1vw, 2.5rem)` | 28 → 40 | H1 de página, título do herói (Newsreader 300) |
| `--pf-fs-secao` | `clamp(1.375rem, 1.25rem + .55vw, 1.75rem)` | 22 → 28 | H2 de seção (Newsreader 300) |
| `--pf-fs-kpi` | `clamp(2rem, 1.75rem + 1.1vw, 2.75rem)` | 32 → 44 | número de KPI, nota, percentual do donut (Newsreader 300, `tnum lnum`) |
| `--pf-fs-h3` | `1.125rem` | 18 | H3, título de ferramenta, título de cartão (Hanken 600) |
| `--pf-fs-corpo` | `1rem` | 16 | corpo e campos (16 evita o zoom do iOS) |
| `--pf-fs-ui` | `.9375rem` | 15 | menu, linha de tabela, rótulo |
| `--pf-fs-botao` | `.875rem` | 14 | botão, aba, segmentado |
| `--pf-fs-meta` | `.8125rem` | 13 | meta e legenda (piso) |
| `--pf-fs-overline` | `.75rem` | 12 | overline em caixa-alta |

Medidas: `--pf-lateral-w` 16.5rem (264) · `--pf-lateral-w-min` 4.5rem (72) · `--pf-conteudo-max` 72rem
(1152) · `--pf-conteudo-largo` 90rem (1440: calendário, player, correção, tabelas largas) ·
`--pf-gutter` `var(--gutter)` (16 → 48) · altura do topo `var(--header-h)` / `var(--header-h-lg)`.

### 2.5 Forma, espaço e superfícies

- Raio: botão, campo, segmentado e marcador com destaque **2 px** (`--radius-1`); mídia, painel e
  miniatura **4 px** (`--radius-2`); menu, popover, diálogo e gaveta **8 px** (`--radius-3`, teto).
  Círculo só em avatar, rádio, ponto de status e donut. Nada de pílula.
- Superfície: **fio, não caixa**. Painel (`--pf-painel` + borda `--pf-linha`) só para objeto (tabela,
  formulário, diálogo, mídia, conversa, cartão de matrícula). Lista é linha com fio inferior. KPI é
  coluna separada por fio vertical. Nada de card dentro de card. Card só para mídia (capa de curso,
  publicação).
- Espaço: escala 4/8 de `tokens.css`. Entre seções da página `--space-8` (48) no desktop e
  `--space-7` (40) no mobile; dentro de painel `--space-5` (24) / `--space-4` (16).
- Sombra: só `--pf-sombra` em sobreposições.
- Textura tecnológica: um desenho de rede (nós e conexões) aparece **só** na capa tipográfica (curso sem
  imagem) e no estado vazio do Início, como **SVG estático inline** (traço 1 px, opacidade 6–8%,
  `aria-hidden`). Sem `<canvas>`, sem `requestAnimationFrame` e sem importar `assets/js/rede-neural.js` na
  EAD (numa grade de capas, várias animariam juntas). Sem grade de fundo, sem brilho, sem halo.

### 2.6 Movimento

- Só `transform` e `opacity` (`--transition-move`); troca de cor por `--transition-state`. Proibido:
  `transition: all`, animar `width`, `height`, `padding`, `box-shadow`, `top`, `left`, `filter`.
- Catálogo: gaveta `translateX(-100%) → 0` em `--dur-base` com `--ease-out` (saída `--ease-exit`);
  popover com `dmc-drop`; troca de aba e de rota com fade de 160 ms; sublinhado ativo com `scaleX`;
  fio do item de menu ativo com `scaleY`; barra de progresso com `transform: scaleX(p)` e
  `transform-origin: left`; sanfona abre sem animar altura (fade do conteúdo); painel de detalhe entra
  com `translateX(24px)` + opacidade em 240 ms; toast com `translateY(8px)` + opacidade.
- Movimento reduzido: `tokens.css` leva as durações a 1 ms. Esqueleto estático, anel "ao vivo" parado,
  vídeo não toca sozinho, tour sem deslocamento.
- Nada se move sozinho por mais de 5 s (WCAG 2.2.2): sem carrossel automático, faixa estática;
  `live-pulse` com `animation-iteration-count: 3` (≈ 4 s) e depois parado; `mat-pulse` e o pulso do
  esqueleto ficam porque marcam carregamento (somem quando o dado chega).

### 2.7 Tema claro e escuro

- `data-pf-tema="escuro|claro"` no `<html>`, gravado por `pre-pintura.js` a partir de `dmc:tema`.
  Sem preferência: **escuro** (DC-07). Preferência "Automático" grava `dmc:tema = auto` e o script
  resolve por `prefers-color-scheme`. Sem JS, o CSS cai no escuro (`:root`).
- Troca: botão de tema no topo (alterna claro/escuro) e Perfil › Preferências (rádio Automático ·
  Claro · Escuro). Nesta rodada a escolha fica **só neste navegador** (`localStorage`, D-17); preferência
  no servidor é acréscimo futuro (D-17; hoje seria da F0t, dona das rotas do titular). Evento `dmc:tema` em `document`.
- Controles nativos seguem o tema escolhido, não o sistema: `html[data-pf-tema="escuro"], .pf-escopo-escuro
  { color-scheme: dark }` · `html[data-pf-tema="claro"], .pf-escopo-claro { color-scheme: light }` ·
  `@media print { :root { color-scheme: light } }` (barras de rolagem da lateral e do player, lista do
  `<select>`, `date`/`datetime-local` do `DMC_UI.formulario`, `<progress>`). `accent-color: var(--pf-acento)`
  em checkbox, rádio e `progress`. A seta do `select` é `mask-image` com `background-color: currentColor`
  (o data-URI de traço fixo `#bfbdb9` do `bs-input` dá 1,88:1 no campo branco).
- Mídia não inverte: herói, palco do vídeo, capa e miniatura de vídeo são **escopo escuro** nos dois temas
  (§2.2 camada 3): texto, marcador e botão dentro deles usam os valores escuros.
- Marca no claro: rinoceronte com `filter: brightness(0)` (monocromático preto) e "DMC" em
  `--pf-acento` (= ouro profundo, §4.2).
- Superfície de leitura longa (`pf-leitura`: aceite do contrato, editor do regulamento, prévia do plano de
  ensino, resposta na correção): no escuro é **escopo claro** (papel com texto, acento, foco e campo do
  papel); no claro vira `--pf-painel` (branco) com fio.
- Impressão: sempre papel (§12), independente do tema.

### 2.8 Tamanho do texto (A−/A+)

- `data-pf-fonte` no `<html>`: `-1` · `0` (padrão) · `1` · `2` → `font-size` 93,75% · 100% · 112,5% ·
  125% (porcentagem, para somar à preferência do navegador). Chave `dmc:fonte`, evento `dmc:fonte`.
- Toda medida de texto, espaço e alvo é em rem, então o nível escala a interface inteira. Ícone e fio
  ficam em px, e também os botões de ícone do topo (44 px fixos).
- Layout interno por **container query em em** sobre `.pf-main { container: pf-main / inline-size }`.
  A troca lateral ↔ gaveta é do JS do shell: `modoGaveta = innerWidth / escala < 1024`.
- Limites: A− inativo no −1, A+ inativo no 2 (`aria-disabled="true"`, opacidade .4, rótulo "Tamanho
  mínimo"/"Tamanho máximo"). Rótulo acessível com o nível: "Aumentar texto, tamanho atual 112,5%".
  Sem tecla de atalho. O zoom do navegador continua funcionando.
- Aceite: **0 overflow horizontal em 320 px no nível 2** (≈ 256 px CSS no nível 0). Isso exige
  tabela empilhada, `minmax(0,1fr)`, `overflow-wrap: anywhere` em código e protocolo, nenhum
  `white-space: nowrap` fora de número curto e as quatro medidas que o nível 2 estourava: alvos do topo em
  **px** (§5.1), Mês do calendário em colunas flexíveis (§6.6), valor de KPI por `cqi` (§4.9) e rodapé do
  player compacto (§6.3).
- Lugar: topo a partir de 1024 (grupo A− A+); abaixo disso, dentro do menu da conta, em "Aparência e
  leitura", junto com o tema.

---

## 3. Plano de reskin de `css/plataforma.css` (F0r, fase 0; `portal.css` da F0s)

Donos (D-37, D-59): o reskin de `plataforma.css`, os marcadores, `cabecalho-ead.mjs`, `contraste.mjs` e as guardas da
fase E são da **F0r**; a camada `--pf-*`, o bloco `@dmc-compat` e a sobreposição de `.btn-primary` em `portal.css` são
da **F0s**; a cor inline que mora em `app.js` (B3a) é da **F0b**. Ordem (D-60, índice §8.3): S0 linha de base (F0b) →
marcadores (F0r) → S1 `portal.css` fase A (F0s), `pre-pintura.js` e `ui.js` mínimo (F0b), `cabecalho-ead.mjs` com
dry-run (F0r) → S2 a principal aplica o cabeçalho em todas as páginas legadas → só então as fases B e C (antes disso
as páginas não carregam `portal.css` e a conferência bloco a bloco não mediria nada).

Inventário no arquivo de hoje (4195 linhas): `var(--cyan*)` 91 · `var(--green*)` 35 ·
`rgba(0,231,252,a)` 91 · `rgba(0,255,77,a)` 61 · hex neon 7 · `var(--gradient)` 25 · `var(--glow-*)` 11
· `linear-gradient` 21 / `radial-gradient` 7 · texto em degradê 6 · `box-shadow` 68 · peso 700/800 92 ·
`var(--font-display)` (Raleway em botão e rótulo) 86 · pílula `999px` 13 · raios 10–22 px 13 ·
vermelhos `#ff5a5a` e afins ≈ 29 · `transition: all` 4 · z-index literal 13 · breakpoints 1024/900/720.
Seções que mais concentram neon: Loja, Painel admin, Liberar cursos, Catálogo, Dúvidas, Obrigado, Módulos.

**Fase 0 — linha de base e marcadores.** Antes de qualquer edição de regra: capturas 1440/390 de todas as
páginas (inclusive `login-classico.html`) e `portal-regressao-d5.spec.js` verde contra o código atual.
Depois, a **única** mudança permitida em `plataforma.css` nesta fase: envolver os trechos congelados em
comentários-marcadores, sem tocar em nenhuma regra — `/* @dmc-root-legado:inicio */ … /* @dmc-root-legado:fim */`
em volta do `:root` legado e `/* @dmc-legado-login:inicio */ … /* @dmc-legado-login:fim */` em volta das
seções LOGIN e EIXO 3D (inclui `.btn-primary`, `@keyframes eixo-pulse` e o bloco de movimento reduzido do
eixo). Captura do `login-classico.html` idêntica depois dos marcadores. A partir daqui nenhuma exclusão,
guarda ou regra de posse se apoia em número de linha de `plataforma.css` (números citados abaixo servem só
para localizar o trecho no arquivo de hoje).

**Fase A — ponte de tokens (só `portal.css`).** `plataforma.css` não muda nesta fase (além dos marcadores).
- Seção de compatibilidade em `portal.css` (vence o `:root` legado porque vem depois). É a **camada 2** de
  §2.2, por isso o seletor inclui os escopos e as superfícies que invertem:

```css
:root, .pf-escopo-claro, .pf-escopo-escuro /* + lista da camada 3 de §2.2 */ {
  --cyan: var(--pf-acento);   --cyan-deep: var(--pf-acento);   --cyan-soft: var(--pf-acento-hover);
  --green: var(--pf-sucesso); --green-soft: var(--pf-sucesso);              /* era "feito/ok" */
  --bg: var(--pf-fundo);      --bg-elev: var(--pf-painel);     --bg-card: var(--pf-painel);
  --line: var(--pf-linha);    --line-soft: var(--pf-linha);    --line-strong: var(--pf-linha-forte);
  --ink: var(--pf-texto-1);   --ink-2: var(--pf-texto-2);      --ink-3: var(--pf-texto-3);
  --gradient: linear-gradient(var(--pf-acento), var(--pf-acento));          /* sólido, tipo válido */
  --gradient-soft: linear-gradient(var(--pf-painel-2), var(--pf-painel-2));
  --shadow: var(--pf-sombra);
  --glow-cyan: 0 0 0 transparent;  --glow-green: 0 0 0 transparent;
  --radius: var(--radius-2);
  --font-display: "Newsreader", "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --font-body: var(--font-text);
  /* tokens da casa lidos por components.css (§4.2) */
  --text-1: var(--pf-texto-1); --text-2: var(--pf-texto-2); --text-3: var(--pf-texto-3);
  --color-line: var(--pf-linha); --color-line-strong: var(--pf-linha-forte);
  --focus-color: var(--pf-foco); --np-accent: var(--pf-acento-rgb);
}
```

- `--font-display` volta ao valor da casa porque o legado o redeclara como Raleway. Os 86 usos de
  `var(--font-display)` em botão e rótulo do legado são trocados na fase C (senão botão ficaria serifado).
- Neutralizar sem tocar HTML, **entre `/* @dmc-compat:inicio */` e `/* @dmc-compat:fim */` em `portal.css`**
  (o teste estático exclui o trecho marcado): `.bg-grid::before, .glow-corner, .glow-corner--alt {
  display: none }` e `.gradient-text { background: none; -webkit-text-fill-color: currentColor; color:
  var(--pf-acento); font-style: italic; font-weight: inherit }`. O bloco sai na limpeza da F0s-final,
  depois que `cabecalho-ead.mjs` tirou essas classes do HTML (prova por `grep`). `.eixo-stage__halo,
  .loja-card__shine { display: none }` fica fora do bloco (não contém string barrada) até a fatia dona
  remover o elemento (o `loja-card__shine` sai do markup de `DMC_bootLoja` no passo 3 da F0b, D-69).
- Base: `html { font-size }` por `data-pf-fonte`; corpo Hanken; pesos do navegador de §2.4 (`b, strong, th,
  h1–h6, legend` em 600; Newsreader com `font-synthesis-weight: none`); `:focus-visible` com outline
  `--pf-foco`; `color-scheme` por tema (§2.7); fallback local de fonte com `size-adjust` (o mesmo de
  `business-school.css`).

**Fase B — literais (só depois do S2; regra a regra, revisado à mão, um bloco por vez com regressão D5 e captura do
`login-classico.html`; fora dos trechos marcados; commit só pela sessão principal).**
- B1 `rgba(0,231,252,a)` → `rgba(var(--pf-acento-rgb), a)`, com teto de alfa (fundo > .12 cai para
  .08; borda > .35 vira `var(--pf-linha-forte)`). Hex ciano → `var(--pf-acento)`. `#0a7d8c` (impressão do
  certificado) → `var(--color-gold-deep)`.
- B2 `rgba(0,255,77,a)` e `#00ff4d`: **não** vão para ouro em bloco. Nos seletores de "feito/ok"
  viram `rgba(var(--pf-sucesso-rgb), a)`: `.meu-curso__selo`, `.cert-card.is-emitido`,
  `.cert-toolbar__ok`, `.aula.is-done .aula__check`, `.duvida.is-respondida`, `.resposta__avatar`,
  `.tag-instrutor`, `.duvida__badge.is-ok`, `.aside-aula.is-done .aside-aula__check`,
  `.loja-card__badge--owned`, `.loja-cta--access`, `.toast`, `.obrigado-card__icon`,
  `.obrigado-item__icon`, `.curso-item__active`, `.dv-row.is-respondida`, `.aula-status.is-on`,
  `.roteiro-status.is-ok`. Os usos decorativos (degradê de cartão, pílula "online/híbrido", ícone de
  curso, halo) viram `--pf-painel` sólido ou saem.
- B3 vermelhos (`#ff5a5a`, `#ff4d4d`, `#ff6b6b`, `#ff8f8f`, `#d33a3a`, `#ffd2d2`, `#ffb3c1`,
  `rgba(255,90|77,…)`) → `var(--pf-erro)` / `rgba(var(--pf-erro-rgb), a)`.
- B3a **cor inline fora do CSS** (reprova a guarda da fase E e, no verde de 142°, o detector de neon):
  `app.js:1835-1837` (status do pagamento simulado) → `className = 'pf-alerta pf-alerta--sucesso'` ou
  `'pf-alerta pf-alerta--erro'` em `#dev-pay-status` · `app.js:726, 914, 932` (estados
  vazios com `style="…color:var(--ink-2)"`) → `pf-vazio` · `app.js:1786` (vazio do obrigado com link
  `color:var(--cyan)`) → `pf-vazio` com link comum — dono **F0b** (D-69); `obrigado.html:59-62` (caixa de
  desenvolvimento com `rgba(34,197,94,…)`, `#86efac`, emoji "⚠️" e "Útil só pra teste") → `#dev-pay-box` que nasce
  com `hidden` (sem `style`), como `pf-alerta--aviso` com o texto "Modo de desenvolvimento: libera os cursos deste
  pedido sem aprovação. Disponível só neste ambiente." (sem emoji, inclusive no comentário HTML) — HTML e estilo da
  **F0r**, o `hidden = false` que mostra a caixa é do `DMC_bootObrigado` (**F0b**, D-69); `admin.js:197`
  (`style="…color:var(--ink-3)…"`) → classe `pf-prof-…` — dono **F8**. Os números de linha deste item são do
  código de hoje, para achar o trecho; a guarda da fase E procura o padrão, não a linha.
- B4 fundos escuros literais (`rgba(10,10,10,a)`, `rgba(13,17,21,a)`, `rgba(0,0,0,a)`, hex escuros) →
  `--pf-painel-2` (hover), `--pf-campo` (input), `--pf-veu` (véu), `--pf-topo-fundo` (barra); brancos
  com alfa → `--pf-linha*` ou `--pf-texto-*`. **Sem B4 o tema claro quebra** (input preto sobre papel).

**Fase C — forma, tipo e movimento (só depois do S2, com as mesmas conferências da fase B).**
- `font-weight: 700|800|900` → `var(--fw-semibold)`.
- `font-family: var(--font-display)` → `var(--font-text)` em todo o legado, exceto a lista fechada de
  títulos que ficam Newsreader 300: `.pagina-hero h1`, `.dash-hero h1`, `.section-title-row h2`,
  `.player-meta h1`, `.obrigado-card h1`, `.cert-doc__nome`, `.summary-stat__num`, `.module__num`.
  `.estado-vazio h3` fica Hanken 600.
- Botões legados (`.btn-ghost`, `.btn-linha`, `.btn-icon`, `.btn-mini`, `.course-card__cta`,
  `.loja-cta*`): visual de `dmc-btn` (14 px/600, sem caixa-alta, raio 2, altura ≥ 44 px; `.btn-mini` e
  `.mat-row .btn-icon` sobem para `--hit`). Hover só por cor. Saem `translateY(-2px)`, `filter: brightness`
  e sombra.
- **`.btn-primary` mora no trecho congelado** (LOGIN) e é usado fora dele: `#btn-done` do player,
  `admin.html` (4×), `loja.html`, `obrigado.html` (2×) e 12 ocorrências em `app.js`/`admin.js`. Por isso a
  correção é uma **sobreposição completa em `portal.css`** (que o `login-classico.html` não carrega), com o
  visual de `dmc-btn--primary`: `.btn-primary { background: var(--pf-acao); color: var(--pf-acao-texto);
  box-shadow: none; transform: none; filter: none; font: 600 var(--pf-fs-botao)/1.2 var(--font-text);
  text-transform: none; letter-spacing: .01em; width: auto; margin-top: 0; min-height: 3rem;
  border-radius: var(--radius-1); transition: var(--transition-state) }` + `:hover { background:
  var(--pf-acao-hover); box-shadow: none; transform: none; filter: none }` + `:focus-visible { outline:
  var(--focus-width) solid var(--pf-foco); outline-offset: var(--focus-offset); box-shadow: none }` +
  `:disabled, [aria-disabled="true"] { opacity: .4; cursor: not-allowed }`. Onde o legado precisa de
  largura total (formulário < 30em), a classe de contexto da página define `width: 100%`.
- Texto em degradê (6×) → `background: none; -webkit-text-fill-color: currentColor; color:
  var(--pf-texto-1)` (obrigatório para o modo de alto contraste).
- `border-radius: 999px` → `--radius-1` (exceto avatar e ponto); raios 10–22 px → no máximo `--radius-3`.
- `box-shadow`: só `--pf-sombra` em `.shell-search__results`, `.modal`, `.cart-drawer__panel` e no
  toast. Anel de foco por sombra → `outline` em `:focus-visible`.
- Movimento: `.progress-bar__fill` de `width` para `scaleX`; `.shell-side` e `.has-shell .*-shell`
  deixam de animar `width`/`padding-left`; saem `pulseGreen` e `slideDown` (anima altura); saem também
  `.bg-grid::before`, `.glow-corner` e `@keyframes float` (seção FUNDO TECH, fora do trecho congelado; o
  `login-classico.html` não usa essas classes — conferido no arquivo de hoje), para que a guarda da fase E
  passe no G0 sem exceção por linha; **`eixo-pulse` fica**
  (está no trecho LOGIN/EIXO e serve ao `login-classico.html`); ficam `live-pulse` (com 3 iterações, §2.6)
  e `mat-pulse` (só opacidade). `transition: all` → `var(--transition-state)`. Hover com `translateY(-3px)`
  em card sai; vira borda `--pf-linha-forte`.
- z-index literal → `--z-header`, `--z-sticky`, `--z-menu`, `--z-drawer`, `--z-modal`, `--z-toast`.
  Breakpoints 720/900 → 768/1024; o que depende só do conteúdo vira `@container pf-main`.
- Toast duplicado (hoje por volta das l. 2735 e 4054, só para localizar): fica um, reskinado como `pf-toast`.

**Fase D — shell e cabeçalhos das páginas.** Depois do S2, o `shell.js` v2 (F0s) passa a emitir o shell novo
(`pf-topo`, `pf-lateral`, `pf-gaveta`); sem `DMC_UI` ele não lança: desenha topo e menu com escape próprio mínimo e
deixa de lado busca, sino e faixa (D-60, índice §7.6). As regras `.shell-*` (seção SHELL, hoje l. 466-754) ficam
inertes e saem na limpeza final.
O `<body>` **mantém** `has-shell`, `menu-recolhido` e `menu-aberto`, e as variáveis `--shell-top-h`,
`--shell-side-w`, `--shell-side-w-min` recebem os valores novos (o deslocamento das páginas legadas, l.
690-755, depende delas). Todas as páginas recebem o `<head>` de §2.1. `admin.html` e `parcerias.html`
trocam o `header.app-nav` pelo shell do backoffice (F8, fase 1).

**Fase E — guarda contra regressão** (F0r; regras de escopo e tolerância no índice §6.1, §8.3 e §9.6, D-46, D-62,
D-67).
1. Teste estático (`server/test/front-estatico.test.js`, no `npm test`): varre `plataforma-ead/**/*.{css,html,js}`,
   com o mapa `POSSE` (caminho → fatia, de `tests/tools/posse-ead.mjs`), a lista `PENDENTES_FASE_1` (arquivos
   legados de fatias da fase 1 que ainda violam a guarda no G0; cada dona esvazia a sua entrada no próprio G1; vazia no
   G2) e três modos — `QA_FATIA=<fatia>` (só os arquivos da fatia), sem variável (tudo menos `PENDENTES_FASE_1`) e
   `QA_ESTRITO=1` (tudo, e arquivo sem dono reprova). Exceções fixas: `login.html`,
   `login-classico.html`, `css/login.css`, `css/business-school.css`, `js/business-school.js`,
   `js/eixo-3d.js`, `js/login/*`, `js/vendor/*` e **os trechos entre marcadores** `@dmc-root-legado`,
   `@dmc-legado-login` (em `plataforma.css`) e `@dmc-compat` (em `portal.css`) — motivo escrito no teste;
   marcador sem par ou aninhado faz o teste falhar. Falha com
   `#00e7fc|#00ff4d|#00b8cc|#00cfb6|#00f5b4|#0a7d8c`, `rgba(0,\s*(231|255)`, `Raleway|DM Sans|Playfair|Poppins`,
   `-webkit-text-fill-color:\s*transparent`, `var(--glow`, `font-weight:\s*(700|800|900)`,
   `border-radius:\s*999px`, `transition:\s*all`, `bg-grid`, `glow-corner`, cor inline
   `style="…(color|background|border)…"` e `.style.(color|background|borderColor)\s*=` em JS, emoji
   (`\p{Extended_Pictographic}`), `<script>` sem `src`, atributo `on*=` e o literal `#bfbdb9` em data-URI. Também
   confere que os literais do escuro religados (§2.2) são iguais aos de `tokens.css`.
2. Teste de tela (`portal-qualidade.spec.js`, sobre `paginasDoPortal()`): toda página × {escuro, claro} × {390,
   1440}. **Detector de neon** (o do índice §9.6, que prevalece sobre a versão anterior deste item, D-46): para cada
   elemento visível, **inclusive `::before` e `::after`**, e para cada interativo com `:hover` e `:focus-visible`
   forçados (CDP `forcePseudoState`), lê as cores computadas de `color`, `background-color`,
   `border-top/right/bottom/left-color`, `outline-color`, `text-decoration-color`, `fill`, `stroke` e de cada cor
   dentro de `box-shadow` e `text-shadow`; converte r, g, b **ignorando o alfa** e reprova matiz de **120° a 200°**
   com saturação HSL **acima de 60%** — pega `#00ff4d` (138°) e `#00e7fc` (185°) em qualquer alfa; a sálvia de
   sucesso (`#8ec899`, S ≈ 35%) e a info (≈ 213°) passam. Imagens e vídeos ficam fora. No G0, as páginas de
   `PAGINAS_PENDENTES_G0` (hoje `parcerias.html` e, se acusar, `admin.html`) ficam fora do detector e do axe de cor e
   passam no G1 da F8 (D-67). Overflow em 320, 375, 390, 768, 1024, 1440, 1920 nos níveis 0 e 2 de texto.
3. Regressão D5 (`portal-regressao-d5.spec.js`, F0b) antes e depois, e captura de `login-classico.html`
   idêntica antes e depois de cada bloco; a 2d é avisada antes do merge. A D5 confere **invariantes de efeito**
   (rota, resposta da API, resultado persistido) e, de tela, só os ids e `data-*` de `SELETORES_D5`, que o reskin é
   obrigado a preservar (D-45); mudar seletor ou asserção = pedido escrito à F0b via principal. Agentes não
   commitam: cada bloco é entregue verde à sessão principal, que commita com caminhos explícitos.

Seletores de alto impacto (com eles nenhuma tela do aluno fica neon): `:root` de compatibilidade,
`.overline`, `.gradient-text`, `.bg-grid`, `.glow-corner`, `.btn-primary` e **`.btn-primary:hover`**
(sobreposição em `portal.css`), `.user-avatar`, `.btn-ghost`,
`.pagina-hero`, `.estado-vazio`, `.meu-curso*`, `.live-card*`, `.cert-card*`, `.cert-doc*` + impressão,
`.summary-stat*`/`.progress-bar*`, `.module*`/`.aula*`, `.player-*`, `.mat-card*`, `.duvida*`/
`.resposta*`, `.catalog-*`/`.course-card*`, `.toast`, `.modal*`. Loja, obrigado e admin na mesma
passada, com prioridade menor.

---

## 4. Componentes (vocabulário único)

### 4.1 Regras de nome e de estado

- BEM em português: `pf-bloco`, `pf-bloco__elemento`, `pf-bloco--variante`.
- Estado por ARIA quando existe (`aria-current`, `aria-expanded`, `aria-pressed`, `aria-selected`,
  `aria-invalid`, `aria-busy`, `aria-disabled`, `[disabled]`, `[open]`); senão `is-*` (`is-recolhido`,
  `is-arrastando`, `is-copiado`). O CSS estiliza o atributo, não uma classe paralela.
- Classe fora do catálogo: `pf-<dominio>-…` (DC-01). Promoção ao catálogo só pela F0s (CSS) e, quando houver
  comportamento, pela F0b (`DMC_UI`), por pedido escrito via principal.
- Os componentes da casa continuam `dmc-*` e são **reutilizados, nunca copiados**: `dmc-btn` (+
  `--primary`, `--secondary`, `--link`), `dmc-skip`, `dmc-sr-only`, `dmc-overline`, `dmc-brand`, `dmc-lead`,
  `dmc-small`, o comportamento de `.dmc-drawer` — sempre com os tokens religados de §4.2. `dmc-on-paper` não
  é usado na plataforma (vira `.pf-escopo-claro`, §2.2). O campo segue o desenho de `bs-campo`/`bs-input` da
  2d (mesma altura, borda, raio e foco), reimplementado como `pf-campo` sem importar `business-school.css`.
- HTML com dado só por `DMC_UI.html` (escape). Nenhum `style=""` com cor.

### 4.2 Botões (`dmc-btn`, religado aos temas)

`portal.css` religa as cores num único bloco, para o mesmo botão funcionar nos dois temas:

| Variante | Padrão | Hover | Foco | Inativo | Ocupado |
|---|---|---|---|---|---|
| `dmc-btn--primary` | fundo `--pf-acao`, texto `--pf-acao-texto` | `--pf-acao-hover` | outline `--pf-foco` 2 px, offset 3 | opacidade .4, `aria-disabled` com motivo visível ao lado | `aria-busy="true"`, rótulo "Salvando…"/"Enviando…", inativo; após 10 s, "Ainda processando…" |
| `dmc-btn--secondary` | texto `--pf-texto-1`, borda `--pf-linha-forte`, seta `--pf-acento` | borda `--pf-acento` | idem | idem | idem |
| `dmc-btn--link` | texto `--pf-texto-1`, sublinhado `--pf-linha-forte` offset .5em | sublinhado e texto `--pf-acento` | idem | idem | — |
| `pf-btn--perigo` (modificador) | texto `--pf-erro`, borda `rgba(var(--pf-erro-rgb), .5)` | borda `--pf-erro` | idem | idem | idem |
| `pf-btn-icone` | 44×44, ícone 20, raio 2, sem borda | fundo `--pf-painel-2` | idem | idem | — |

**Regras de `components.css` reaproveitadas e o valor com que ficam** (o `components.css` entra em toda
página e foi escrito para o escuro; a camada 2 de §2.2 religa os tokens que ele lê, e `portal.css`
sobrescreve só o que não depende de token):

| Regra de `components.css` | Lê | Na plataforma (escuro · claro / escopo claro) |
|---|---|---|
| `.dmc-overline` | `rgb(var(--np-accent))` | sobrescrita nos dois temas: `color: var(--pf-texto-3)` (§2.4) |
| `.dmc-brand b` | `--color-gold` (literal da casa) | sobrescrita nos dois temas: `color: var(--pf-acento)` → ouro · ouro profundo (5,17:1 no papel) |
| `.dmc-lead` · `.dmc-small` | `--text-2` · `--text-3` | religados: `#bfbdb9` · `#9a9893` / `#4a4d52` · `#616368` |
| `.dmc-btn:focus-visible` | `--focus-color` | religado: ouro / ouro profundo (deixa de dar 1,84:1 no papel) |
| `.dmc-btn--primary` (+ `:hover`) | `--color-gold`, `--text-on-gold`, `--color-gold-soft` | sobrescrita: `--pf-acao`, `--pf-acao-texto`, `--pf-acao-hover` (preto sobre papel no claro, P1) |
| `.dmc-btn--secondary` (+ `:hover`, `svg`) | `--color-line-strong`, `--text-1`, `--np-accent` | religados: borda `--pf-linha-forte`, texto `--pf-texto-1`, seta e hover `--pf-acento` |
| `.dmc-btn--link` (+ `:hover`) | `--text-1`, `--color-line-strong`, `--np-accent` | religados (mesmo efeito da linha acima) |
| `.dmc-skip` · `.dmc-skip:focus` | `--color-gold`/`--text-on-gold` · contorno `--text-1` | fundo e texto mantidos (ouro com preto, 9,57:1 nos dois temas); contorno religado = `--pf-texto-1` |
| `.dmc-drawer :focus-visible` | `--focus-color` | religado |
| `.dmc-footer__list a` | `--text-2`, `--hit`, `--color-line-strong` | religados (padrão do `pf-rodape` abaixo de 1024, §5.6) |
| `.dmc-on-paper *` | — | não usado |

Medidas: altura 48 (link 44), texto `--pf-fs-botao`/600, sem caixa-alta. **Um primário por bloco
visível.** Rótulo = verbo no infinitivo + objeto. `pf-btn-icone` sempre com nome acessível e, no
desktop, `pf-dica` no hover e foco. Abaixo de 30em, o primário de um formulário ocupa a largura total.

### 4.3 Catálogo

Coluna "Dono" = fatia que implementa o CSS do componente; "CSS" = arquivo onde ele mora. Componente da F0s mora em
`portal.css` e pode ser usado por todas as fatias; quando o componente tem função em `DMC_UI` (índice §7.5: `toast`,
`alerta`, `confirmar`, `dialogo`, `formulario`, `reautenticar`, `consentimento`, `tabela`, `abas`, `filtros`, `kpis`,
`donut`, `progresso`, `barras`, `esqueleto`, `estadoVazio`, `erroCarga`, `estado`, `codigo`, `upload`), o comportamento é
da F0b (D-34, D-57). Os componentes de domínio (linhas com fatia de domínio) moram no CSS da fatia dona e mantêm o
nome sem prefixo de domínio (DC-01).

**Foco em contêiner com rolagem própria** (regra geral do catálogo): todo interativo dentro de um contêiner
com `overflow` (lateral, coluna de módulos do player, lista de conversas, painel do sino, `pf-detalhe`,
gaveta, listas de diálogo) usa `outline-offset: -2px`; se o desenho exigir o anel por fora, o contêiner
ganha `padding-inline` ≥ 5 px. Assim o anel nunca é cortado pela borda de rolagem.

| Componente | Classes | Estados obrigatórios | Dono · CSS | Regras |
|---|---|---|---|---|
| Aplicação | `pf-app` (body), `pf-app--foco` (player), `pf-main` (contêiner `pf-main`, `main#conteudo`) | lateral recolhida (`is-recolhido`), gaveta aberta | F0s · portal | aliases `has-shell`, `menu-recolhido`, `menu-aberto` mantidos |
| Topo | `pf-topo`, `__menu`, `__acoes`; `pf-marca` | hover, foco, `aria-expanded` | F0s · portal | §5.2 |
| Busca global | `pf-busca`, `__campo`, `__painel`, `__filtros`, `__grupo`, `__opcao`, `__vazio` | fechada, digitando, carregando, resultados, vazio, erro, opção ativa (`aria-selected`) | F0s · portal | combobox ARIA 1.2 |
| Faixa do topo | `pf-faixa`, `--pendencia`, `--novidade`, `__fechar` | visível, dispensada | F0s · portal | uma por vez |
| Tema e texto | `pf-tema`, `pf-fonte` | limite (`aria-disabled`) | F0s · portal | §2.7, §2.8 |
| Sino | `pf-sino`, `__contador`; painel `pf-notificacoes`; linha `pf-notificacao`, `--nao-lida` | 0, n, "9+", aberto, carregando, vazio, erro | F0s · portal | §5.2 |
| Conta | `pf-conta`, `__avatar`, `__painel` | aberto, foto ou iniciais | F0s · portal | disclosure (não `role=menu`) |
| Lateral e menu | `pf-lateral`, `pf-menu`, `__titulo`, `__item`, `__icone`, `__rotulo`, `__grupo`, `__sub`, `__ponto`, `__contagem` | padrão, hover, atual, foco, recolhido + dica, submenu aberto, flyout, com pendência, com contagem | F0s · portal | §5.3 |
| Gaveta | `pf-gaveta`, `__cabeca`, `__corpo`, `__rodape` | aberta, fechando | F0s · portal | `role=dialog` modal |
| Tour | `pf-tour`, `__passo`, `__alvo` (sem véu) | passo n de N, último | F0s · portal | §5.7 |
| Rodapé | `pf-rodape`, `#pf-mapa` | — | F0s · portal | §5.6 |
| Cabeçalho de página | `pf-cabecalho`, `__contexto`, `__titulo`, `__desc`, `__acoes`, `__mais` | — | F0s · portal | §4.4 |
| Subnavegação | `pf-subnav`, `__link` | `aria-current="page"` | F0s · portal | links, não abas ARIA; no Atendimento, markup fixo do índice §7.10, estático no HTML, e nenhum CSS de domínio a estiliza (D-65) |
| Abas | `pf-abas`, `__aba`, `__contador`, `__painel` | `aria-selected`, foco móvel | F0s · portal | troca de painel (DC-12) |
| Segmentado (filtro) | `pf-segmento`, `__opcao`, `__contagem` | `aria-pressed`, foco, inativo | F0s · portal | filtra (DC-12) |
| Barra de filtros | `pf-filtros`, `__linha`, `__botao` ("Filtros (n)"), `__painel` | aberto (celular), com n aplicados | F0s · portal | §4.6 |
| Marcador de estado | `pf-estado`, `--sucesso` · `--aviso` · `--erro` · `--info` · `--neutro`, `--destaque`, `__glifo` | — | F0s · portal | §2.3; `DMC_UI.estado` |
| Alerta | `pf-alerta`, `--info` · `--sucesso` · `--aviso` · `--erro`, `--compacto`, `__titulo`, `__acao`, `__detalhe` | — | F0s · portal | fio esquerdo 2 px na cor do estado + fundo de destaque |
| Toast | `pf-toast`, `--erro`, `__acao`, `__fechar` | entrando, visível, saindo | F0s · portal | DC-10; substitui `.toast` e `alert()` |
| Diálogo | `pf-dialogo` sobre `<dialog>`, `__cabeca`, `__corpo`, `__acoes`, `--p` · `--m` · `--g` | aberto, enviando (`aria-busy`) | F0s · portal | substitui `.modal-overlay`, `confirm()`, `prompt()`; em `DMC_UI.confirmar`, botões com `data-pf-acao="confirmar"` / `"cancelar"` (gancho estável da D5, D-76) |
| Reautenticação | `pf-reautenticacao` (`fieldset`), `__senha`, `__codigo` | só senha, senha + código, conferindo, erro no campo, bloqueado (429) | F0s · portal | §4.8, DC-38; `DMC_UI.reautenticar` |
| Painel de detalhe | `pf-detalhe`, `__cabeca`, `__corpo`, `__acoes` | coluna do grid (≥ 1024), página (< 1024) | F0s · portal | §4.8 |
| Popover | `pf-popover` | aberto | F0s · portal | sino, conta, flyout, "Mais ações" |
| Dica | `pf-dica` (`role=tooltip`) | hover, foco, Esc fecha | F0s · portal | só em menu recolhido e botão de ícone |
| Campo | `pf-campo`, `pf-rotulo`, `pf-input`, `pf-ajuda`, `pf-erro-campo`, `pf-grupo` (fieldset), `pf-check`, `pf-radio`, `pf-switch`, `pf-senha` | padrão, hover, foco, preenchido, inválido, inativo, somente leitura, travado, carregando | F0s · portal | §4.5 |
| Resumo de erros | `pf-erros` | com n erros, foco ao enviar | F0s · portal | lista com link para cada campo |
| Tabela | `pf-tabela`, `--empilhar`, `__num`, `__acoes`, `__secundaria`, `__selecao` | cabeçalho fixo, hover, ordenada (`aria-sort`), vazia, carregando, seleção em massa | F0s · portal | §4.7, DC-09; sem `--destaque` no marcador |
| Lista | `pf-lista`, `__linha`, `__titulo`, `__meta`, `__acao` | link inteiro, hover | F0s · portal | "fio, não caixa"; sem `--destaque` no marcador |
| KPIs | `pf-kpis`, `pf-kpi`, `--link`, `__rotulo`, `__valor`, `__nota` | carregando, sem dado ("—" + motivo), erro | F0s · portal | 4–5 por linha; 2 por linha < 30em |
| Progresso | `pf-progresso`, `__barra`, `__texto` | 0%, parcial, 100% (`--pf-sucesso`) | F0s · portal | `role=progressbar` + texto visível |
| Donut | `pf-donut` | — | F0s · portal | SVG estático, `role="img"` |
| Barras | `pf-barras` | selecionada | F0s · portal | barras horizontais por `scaleX`, `aria-hidden`, sobre `<table>` real |
| Esqueleto | `pf-esqueleto`, `--texto` · `--bloco` · `--capa` · `--linha` | carregando | F0s · portal | DC-19 |
| Vazio | `pf-vazio`, `__titulo`, `__texto`, `__acoes` | — | F0s · portal | §10 |
| Leitura em papel | `pf-leitura` | — | F0s · portal | escopo claro no tema escuro (§2.2, §2.7) |
| Consentimento | `pf-consentimento`, `__texto`, `__versao`, `__check`, `__acoes`, `__registro` | pendente (caixa ou botão), registrando (`aria-busy`), registrado ("Autorizado em dd/mm/aaaa · versão v1"), exigido pelo servidor (428), retirado | F0s · portal (comportamento `DMC_UI.consentimento`, F0b, D-57) | DC-39: texto literal do servidor em `pf-leitura`, nunca reescrito; usado em Perfil, Meus dados e Assistente |
| Código | `pf-codigo`, `__copiar` | copiado ("Copiado" em `role=status` por 2 s) | F0s · portal | `tnum`, `overflow-wrap: anywhere` |
| Envio de arquivo | `pf-upload`, `__alvo`, `__arquivo`, `__progresso` | vazio, arrastando, escolhido, enviando, erro, enviado | F0s · portal | botão "Escolher arquivo" é o caminho principal |
| Linha do tempo | `pf-linha-tempo`, `__item`, `--sistema` | — | F0s · portal | atendimento, ouvidoria, histórico; sem `--destaque` no marcador (§2.3); nota interna fora (D-19) |
| Paginação | `pf-mais` | carregando, fim ("Isso é tudo.") | F0s · portal | "Carregar mais"; nunca rolagem infinita |
| Capa | `pf-capa`, `--vertical` (2:3), `--larga` (16:9), `--tipografica` | carregando, erro de imagem (cai na tipográfica) | F0s · portal | escopo escuro (§2.2); `alt=""` quando o título está ao lado; recorte sempre central, sem `capaFoco` (D-56, §4.11) |
| Documento imprimível | `pf-documento`, `__cabeca`, `__corpo`, `__rodape`; `pf-qr` | tela, impressão | F0s · portal | sempre papel; `pf-qr` (SVG de `DMC_QR`, F0b) com zona de silêncio de 4 módulos e ≥ 28 mm impresso (D-47, D-68), só em certificado, declaração e comprovante de assinatura (D-72) |
| Calendário | `pf-calendario`, `--hoje` · `--semana` · `--mes` · `--lista`, `__dia`, `__hoje`; `pf-encontro`, `--ao-vivo`, `--encerrado`, `--cancelado` | agendado, ao vivo, encerrado, presença registrada, cancelado | F3a · portal-academico | usado também pelo backoffice (F3a, `#/ao-vivo`) |
| Herói do curso | `pf-heroi`, `__midia`, `__veu`, `__texto`, `__meta`, `__acoes` | com capa, sem capa, sem curso | F1b · portal-estudos | §6.1 |
| Pendências | `pf-pendencias`, `__item` | nenhuma | F1b · portal-estudos | §6.1 |
| Grade de capas | `pf-capas`, `__item` | atual (`aria-current`) | F1b · portal-estudos | §6.1 |
| Player | `pf-player`, `__topo`, `__rodape`; `pf-modulos`, `pf-modulo`, `__mini`; `pf-secao`, `__contador`; `pf-conteudo-item`; `pf-palco`, `__codigo` | atual, concluído, em breve, aberto | F1b · portal-estudos | §6.3 |
| Avaliação | `pf-avisos-avaliacao`, `pf-questao`, `__alternativa`, `pf-cronometro`, `--alerta`, `--critico`, `pf-navegador-questoes`, `pf-resultado`, `pf-gabarito`, `__correta`, `__incorreta` | apresentação, em andamento, revisão, enviando, resultado, gabarito | F2 · portal-avaliacao | §6.4 |
| Pontuação da dissertativa | `pf-pontos` (campo único "Pontos"); `pf-rubrica` por critérios fica fora desta rodada (D-22) | editando, salvo | F2 · portal-avaliacao | §7.7 |
| Cartão de matrícula | `pf-matricula`, `__dados` | aberto, fechado | F3a · portal-academico | único "card" de dados do Acadêmico |
| Matriz | `pf-matriz` (aluno × encontro / módulo) | agrupada por módulo | F3a · portal-academico | §7.4 |
| Sigla | `pf-sigla` | — | F4b · portal-documentos | §6.8 (classes novas da F4b: `pf-doc-`, D-78) |
| Assinatura | `pf-assinatura`, `__passo` | bloqueado, pronto, assinando, assinado, erro | F4b · portal-documentos | §6.10 |
| Chat | `pf-chat`, `__historico`, `__conversa`, `__msg--aluno`, `__msg--assistente`, `__sugestoes`, `__compositor`, `__aviso` (usa `DMC_UI.consentimento`, F0b, e `pf-consentimento`, F0s) | consentir, saudação, enviando, erro, limite, indisponível | F6b · portal-assistente | §6.12 |
| Compositor de resposta | `pf-compositor` | resposta, enviando | F6a · portal-atendimento | atendimento e ouvidoria do backoffice; sem nota interna nem anexo nesta rodada (D-19) |
| Cartão de publicação | `pf-publicacao`, `--nova` | nova, vista | F7 · portal-comunicacao | card justificado: é mídia |

### 4.4 Cabeçalho de página (`pf-cabecalho`, igual nos dois portais)

```
[contexto]   overline com o grupo do menu ("Documentação", "Ensino")  ou  "← Turmas" (44 px) em detalhe
[H1]         Newsreader 300 --pf-fs-titulo; no máximo uma palavra em itálico --pf-acento
[descrição]  uma frase, --pf-texto-2, ≤ 38rem
[ações]      à direita a partir de 48em; abaixo do texto antes disso
             no máximo 1 dmc-btn--primary + 1 --secondary; o resto em "Mais ações" (pf-btn-icone "⋯")
fio --pf-linha com --space-6 de respiro
```

Não há trilha longa: em detalhe, só o link de volta. Exceções: Início do aluno (herói), player (topo
próprio) e Visão geral (saudação "Boa noite, *Daniel*").

### 4.5 Campo (`pf-campo`)

- Rótulo visível acima (`--pf-fs-ui`/500, `--pf-texto-1`), campo de 48 px (`min-height: 3rem`), fundo
  `--pf-campo`, borda 1 px `--pf-controle` (`--pf-controle-forte` sobre painel-2/3), raio 2, texto 16 px.
- Hover: borda `--pf-texto-2`. Foco: borda `--pf-acento` + outline 2 px `--pf-foco` (como o `bs-input`).
- Inválido: borda `--pf-erro`, `aria-invalid="true"`, mensagem `pf-erro-campo` com glifo "!" ligada por
  `aria-describedby`. Ao enviar com erro: `pf-erros` no topo do formulário, com link para cada campo, e
  foco no resumo.
- Ajuda: `pf-ajuda` 13 px `--pf-texto-2`, abaixo do campo, ligada por `aria-describedby`.
- Obrigatório: `required` real + asterisco `aria-hidden` + legenda "Campos com * são obrigatórios." no
  topo do formulário (o leitor de tela anuncia "obrigatório" pelo atributo).
- Somente leitura: sem borda, texto `--pf-texto-1` sobre `--pf-painel-2`. **Travado** (perfil): ícone de
  cadeado + ajuda "Para corrigir este dado, peça em Meus dados."
- Máscaras (CPF, CEP, celular, valor) não bloqueiam colar e aceitam só dígitos. `autocomplete` correto
  em todo campo. Data de nascimento como texto com máscara dd/mm/aaaa (não `type=date`).
- **`pf-check`** (checkbox nativo com `appearance: none`, semântica preservada): caixa de 20 px, raio 2,
  borda 1 px `--pf-controle` (`--pf-controle-forte` sobre painel-2/3); marcado = fundo `--pf-acento` e check
  SVG em `--pf-acao-texto`; indeterminado = traço. Alvo de 44 px pelo rótulo inteiro clicável.
- **`pf-radio`** (rádio nativo com `appearance: none`): círculo de 20 px (círculo é permitido em rádio),
  borda 1 px `--pf-controle`; marcado = borda `--pf-acento` + ponto central de 10 px `--pf-acento`.
- **`pf-switch`** (`<button role="switch" aria-checked>`): trilho 36×20 com **raio 2** (nada de pílula,
  §2.5), alvo 44; desligado = borda 1 px `--pf-controle-forte`, botão 14×14 raio 1 em `--pf-texto-2`;
  ligado = fundo `--pf-acento`, botão em `--pf-fundo`, deslocado por `translateX`. Estado escrito ao lado
  ("No ar" / "Em breve"), nunca só a posição.
- Contraste do estado marcado (≥ 3:1, WCAG 1.4.11), medido em `tools/contraste.mjs` nos dois temas: acento
  contra fundo/painel 9,57/9,03 (escuro) e 5,17/5,73 (claro); botão do switch ligado contra o trilho 9,57
  (escuro) e 5,17 (claro); borda desligada `--pf-controle-forte` 4,88 (escuro) e 4,43 (claro). Checkbox,
  rádio e `<progress>` nativos não desenhados levam `accent-color: var(--pf-acento)` (§2.7).
- `select`: seta por `mask-image` com `background-color: currentColor` (§2.7); `date` e `datetime-local`
  do `DMC_UI.formulario` herdam o `color-scheme` do tema.
- `pf-senha`: botão "Mostrar senha" de 44 px dentro do campo (padrão `bs-senha__ver`).
- Salvamento: edição contínua (editor de cursos, plano de ensino, rascunho de correção) salva no
  `blur` com "Salvo às 21:14" em `role=status`; formulário de ação tem botão explícito; seção de perfil
  tem botão por seção. Saída com alteração não salva: aviso "Há alterações não salvas" + `beforeunload`.

### 4.6 Abas, segmentado e filtros

- **`pf-abas`**: `role=tablist`, setas, Home, End, tabindex móvel; aba 44 px, `--pf-fs-botao`/600,
  `--pf-texto-2`; atual `--pf-texto-1` + fio 2 px `--pf-acento` embaixo (`scaleX`, padrão `bs-abas`; em
  alto contraste o fio vira `border-bottom`, §11).
  Cada aba com hash próprio quando outra tela linka para ela (`#historico`, `#/turmas/:id/notas`).
  Abaixo de 30em: abas em colunas iguais (2 a 4) ou, com mais de 4, `<select>` "Seção".
- **`pf-segmento`**: grupo com fio `--pf-linha-forte` e raio 2; opção 44 px (48 no mobile), texto
  `--pf-fs-botao`/500 `--pf-texto-2`; selecionada: fundo `--pf-painel-2`, texto `--pf-texto-1`, fio
  inferior 2 px `--pf-acento`; `aria-pressed`; grupo com `role="group"` e rótulo ("Filtrar
  lançamentos"). Contagem real entre parênteses, `tnum`. Abaixo de 30em: até 4 opções em grade 2×2;
  mais de 4 viram `<select>` "Mostrar". Nunca rola na horizontal. O filtro vai para a URL (`?status=`
  ou hash do backoffice).
- **`pf-filtros`** (curso, turma, período, origem): a partir de 48em em linha, campos compactos de 44
  px; abaixo, botão "Filtros (2)" que abre diálogo de tela cheia com "Aplicar" e "Limpar".

### 4.7 Tabela (`pf-tabela`) e lista

- `<table>` real com `<caption>` (pode ser `dmc-sr-only`), `th[scope]`, ordenação por botão no
  cabeçalho com `aria-sort`. Cabeçalho: fundo `--pf-painel-2`, overline 12 px/600 `--pf-texto-2`,
  fixo (`position: sticky`) abaixo do topo.
- Linha ≥ 56 px, fio inferior `--pf-linha`, hover `--pf-painel-2`. O alvo acessível é o link da 1ª
  coluna; a linha inteira recebe o cursor. Número à direita com `tnum`; data em `<time datetime>`.
- Texto longo trunca em 1 linha e aparece inteiro no detalhe (nunca só em `title`).
- Seleção em massa só onde há ação em massa (enturmar, exportar): checkbox de 44 px e barra fixa no pé
  "3 selecionadas · Enturmar · Limpar seleção".
- **Empilhada** abaixo de 44em de contêiner (DC-09): cada linha vira bloco com fio superior; 1ª célula
  como título (600) + marcador de estado na mesma linha; demais em `dl` de 2 colunas "rótulo / valor";
  ações em linha própria e largura total. Com `display:block`, a semântica é preservada com
  `role="table/rowgroup/row/cell/columnheader"` explícitos; o rótulo vem de `data-rotulo` por `::before`
  e também em `dmc-sr-only`.
- Colunas `__secundaria` somem entre 44em e 64em. Matrizes (frequência, notas) agrupam por módulo em
  sanfona. **Nenhuma tabela rola na horizontal.**
- Paginação: "Mostrando 1–50 de 214" + `pf-mais` "Carregar mais 50".

### 4.8 Diálogo, painel de detalhe, popover

- **`pf-dialogo`**: `<dialog>` nativo com `showModal()` (foco preso e fundo inerte nativos),
  `aria-labelledby`, foco no título, Esc fecha (exceto durante envio), foco volta ao gatilho. Larguras
  `--p` 28rem · `--m` 36rem · `--g` 48rem. Abaixo de 30em vira **folha inferior** de largura total
  com `padding-bottom: env(safe-area-inset-bottom)`.
- **Confirmação** (`DMC_UI.confirmar`): título em pergunta ("Apagar esta conversa?"), consequência em
  uma frase com número quando houver ("12 alunos perdem o registro de conclusão."), botões "Cancelar" e
  o verbo ("Apagar conversa", `pf-btn--perigo` quando destrutivo). Foco inicial em "Cancelar". O botão do verbo leva
  sempre `data-pf-acao="confirmar"` e o de cancelar `data-pf-acao="cancelar"` (gancho estável listado em
  `SELETORES_D5`, entregue no S3; D-76): os testes de tela das fatias usam `confirmarNaTela(page)` sobre ele, e a
  troca de `confirm()`/`prompt()` por este diálogo não quebra a regressão D5.
- **Motivo auditado**: campo obrigatório "Motivo (fica registrado na auditoria)", 10–500 caracteres.
- **Reautenticação** (`pf-reautenticacao`, DC-38; contrato do índice §7.5, D-57: ação sem diálogo usa
  `DMC_UI.reautenticar({ rotuloConfirmar, enviar })`; ação com diálogo usa `DMC_UI.confirmar`/`DMC_UI.formulario` com
  `reautenticar:true` e `enviar(valores, reautenticacao)`; em ambos o componente chama `enviar` com o diálogo aberto e
  devolve o resultado, ou `null` se cancelado): `fieldset` com legenda "Confirme sua
  identidade", a frase "Por segurança, esta ação pede a sua senha." e os campos **Senha atual** (`pf-senha`,
  `autocomplete="current-password"`) e, quando `DMC_Auth.user().doisFatoresAtivo`, **Código do aplicativo** (6
  dígitos, `inputmode="numeric"`, `autocomplete="one-time-code"`, colar permitido). Vai no corpo da requisição como
  `reautenticacao:{ senha, codigo? }`.
  - Onde aparece: ação **com** diálogo próprio (alterar papel, gerar senha temporária, redefinir a verificação em
    duas etapas, alterar e-mail, desativar conta, adicionar à equipe com papel Coordenação) → o bloco fica no fim do
    mesmo diálogo, depois do motivo, e o botão da ação só habilita com a senha preenchida; ação **sem** diálogo
    ([Salvar chave], [Remover chave] do Gemini) → abre `pf-dialogo--p` "Confirme sua identidade" com o bloco e os
    botões [Cancelar] e o verbo da ação ("Salvar chave"). Nunca dois diálogos empilhados.
  - Erros no campo, com o diálogo aberto e o que foi digitado nos outros campos preservado: 400 `campos.senha`
    "Senha incorreta." e 400 `campos.codigo` "Código inválido." (a API nunca responde 401 aqui, então a sessão não
    cai). 429 `muitas-tentativas`: o diálogo fecha, `pf-toast--erro` com a mensagem do servidor e "Por segurança,
    sua sessão foi encerrada. Entre de novo." (a API encerra a sessão ao estourar o limite compartilhado de senha;
    o 401 seguinte leva ao login pelo caminho de §10). Outro erro da ação: `pf-alerta--erro` dentro do próprio
    diálogo, que continua aberto.
  - Senha e código nunca vão para rascunho (`sessionStorage`, D-47), toast, log ou URL; os campos são limpos ao fechar.
    Foco inicial na senha; Enter confirma.
- **`pf-detalhe`** (backoffice): a partir de 1024 é **uma coluna do grid**, nunca sobreposição: a área de
  conteúdo vira `grid-template-columns: minmax(0, 1fr) min(32rem, 45%)` (40rem na correção e na revisão de
  documento); a lista encolhe e, abaixo de 44em de contêiner, cai no modo empilhado (DC-09). Assim nenhuma
  linha focável fica sob o painel (WCAG 2.4.11). Elemento: `<section class="pf-detalhe" role="region"
  aria-labelledby>` com `--pf-painel` e fio esquerdo `--pf-linha-forte`, sem sombra. Ao abrir, o hash muda e
  o foco vai ao título do painel (`tabindex="-1"`); **Esc** (handler próprio no painel, porque não é
  `<dialog>`), o botão "Fechar" (44 px) e o Voltar do navegador fecham e devolvem o foco à linha de origem
  (guardada pelo id da linha; se ela sumiu da lista, foco no H1). Abaixo de 1024, a mesma rota vira página
  com "← Voltar" e barra de ações fixa no pé (`position: sticky; bottom: 0`, alvos 48).
- **`pf-popover`**: 8 px de raio, `--pf-sombra`, `--pf-painel`, fecha com Esc, clique fora e saída do
  foco, devolvendo o foco ao botão.

### 4.9 KPIs, progresso, donut, barras

- **`pf-kpis`**: linha com fio vertical de 1 px entre itens (≥ 48em) ou grade de 2 colunas com fios
  (< 48em; o 5º ocupa a linha inteira). Item: rótulo overline, valor Newsreader `tnum lnum`, nota 13 px
  `--pf-texto-3`. Cada `pf-kpi` é contêiner (`container-type: inline-size`) e o valor usa `font-size:
  clamp(1rem, 14cqi, var(--pf-fs-kpi))`, com `white-space: nowrap` (número curto). Abaixo de 18em de
  contêiner `pf-main` (320 e 390 px no nível 2) a grade passa a **1 coluna**; com isso "R$ 4.990,00"
  (≈ 4,9em em Newsreader) nunca estoura a coluna. Sem dado: "—" e a nota diz por quê ("Sem notas ainda"). Erro: "—" +
  "Não foi possível carregar · Tentar de novo". Variante `--link` (backoffice): o item inteiro é link
  para a fila filtrada; hover sublinha o rótulo. Valor vem formatado pela API; `null` nunca vira 0.
- **`pf-progresso`**: trilho 4 px (2 px em linha de tabela) `--pf-trilha`, preenchimento `--pf-acento`
  (100%: `--pf-sucesso`) por `scaleX`; percentual sempre em texto ao lado; `role="progressbar"` com
  `aria-valuenow` ou barra `aria-hidden` + texto. (O preenchimento é o "fio ativo" do ouro, não estado: o
  estado vem do marcador ao lado.)
- **`pf-donut`**: SVG 160 px (120 no mobile), trilho `--pf-trilha`, arco `--pf-acento`, número
  Newsreader no centro, `role="img" aria-label="90% de acerto"`. Só na tela do aluno.
- **`pf-barras`**: barras horizontais (`--pf-texto-2` sobre `--pf-trilha`; selecionada `--pf-acento`)
  sobre uma `<table>` que é o dado real. Sem biblioteca, sem pizza.

### 4.10 Toast, alerta, vazio, erro

- **`pf-toast`**: canto inferior direito a partir de 48em (máx. 24rem) / faixa inferior de largura total
  abaixo (acima da área segura). Fundo `--pf-painel-2`, texto `--pf-texto-1`, glifo do estado, botão
  fechar 44 px, ação opcional ("Desfazer", "Ver"). Sucesso/info **sem ação**: 6 s, pausa no hover e no foco,
  `role=status`. **Com ação**: não some sozinho (fica até ser fechado ou a ação ser usada; `duracaoMs` é
  ignorado), e a mesma ação continua disponível na tela (ex.: "Desfazer" também no item). Erro: fica até
  ser fechado, `role=alert`. Máximo de 3 empilhados. Texto no particípio:
  "Encontro salvo.", "Correção publicada. O aluno foi notificado."
- **`pf-alerta`**: fio esquerdo 2 px na cor do estado + fundo de destaque, raio 2, glifo + título opcional
  + texto + ação. `role=alert` só para erro de ação; resultado em `role=status`; informação fixa sem
  papel ARIA. `--compacto` (motivo de pendência inline) sem título.
- **`pf-vazio`**: frase que diz o estado real + o que fazer quando há ação. No máximo um ícone de 32 px em
  `--pf-texto-3`; sem ilustração, sem círculo neon.
- **Erro de carga**: `pf-alerta--erro` no lugar do conteúdo ("Não foi possível carregar as turmas
  agora.") + [Tentar de novo] + `__detalhe` recolhido com o código ("Código 503") para quem for
  reportar. A página não cai.

### 4.11 Código, upload, capa

- **Links de ação soltos** ("Trocar de curso ↓", "Ver todos →", "Baixar convite (.ics)", "Ver
  comprovantes →"): `display: inline-flex; align-items: center; min-height: var(--hit)`.
- **`pf-codigo`**: valor + botão "Copiar" (44 px); depois de copiar, "Copiado" por 2 s em `role=status`.
  Hash longo em `overflow-wrap: anywhere`; em lista, hash curto (8–16 caracteres) com cópia completa.
- **`pf-upload`** (diálogo): nome do documento, formatos e tamanho aceitos ("PDF, JPG ou PNG, até 4
  MB"), área de soltar (melhoria) + **[Escolher arquivo]** (caminho principal), arquivo escolhido (nome e
  tamanho) com "Trocar", aviso de base legal, [Cancelar] [Enviar documento] com `<progress>`. Erros no
  campo: "Formato não aceito. Envie PDF, JPG ou PNG." · "Arquivo maior que 4 MB." Nenhuma ação depende de
  arrastar (WCAG 2.5.7).
- **`pf-capa`**: 16:9 (`capaUrl`, capa legada do curso) e 2:3 (`capaVerticalUrl` em `GET /portal/me/cursos`, campo
  `cursos.capaVertical`, D-56). Sem vertical, **recorte central** da 16:9 (`object-fit: cover; object-position:
  center`; não existe `capaFoco`, D-56); sem imagem, **capa tipográfica**: grafite, sigla do curso em Newsreader
  itálico a 12% e a rede neural a 6%. Miniatura do módulo: `capaUrl` do módulo (`trilha.modulos[]` e
  `Conteudo.modulo`, campo `modulos.capa`, D-56) ou o número. As imagens são enviadas pela coordenação no editor
  (§7.16); nenhuma imagem inventada.
- **Abrir arquivo** (`DMC_UI.abrirArquivo`, D-47): só PDF e imagem (JPG, PNG, WebP), com o tipo refeito no cliente a
  partir dos bytes, abrem em nova aba; qualquer outro tipo, ou aba bloqueada pelo navegador, vira download
  (`DMC_UI.baixar`). Vale para material, documento, 2ª via, contrato e entrega de TCC.

### 4.12 Ícones (`DMC_Icons`, F0b)

SVG próprio, viewBox 24, traço **1,5**, `stroke-linecap/linejoin: round`, `fill: none` (exceto ponto e
triângulo de play), `currentColor`, 20 px no menu e 16 px em linha de texto, `aria-hidden="true"
focusable="false"`. Nada de Material Symbols, Font Awesome ou CDN. Os 32 ícones atuais são redesenhados
no mesmo traço e mantêm os nomes.

Conjunto mínimo: navegação do aluno (pórtico/Início, camadas/Meus cursos, ponto com arcos/Aulas ao
vivo, barras/Acadêmico, play em retângulo/Publicações, recibo/Financeiro, pasta/Documentação, cartão de
identificação/Documentos, folha com selo/Declarações, pena sobre linha/Contratos, folha com
check/Comprovantes, balão/Atendimento, "?"/Tutoriais, grade 2×2/Cursos disponíveis); navegação da equipe
(grade/Visão geral, livro aberto/Cursos, dois bustos/Turmas, prancheta com check/Avaliações, pena com
marca/Correção, balão com "?"/Dúvidas, caixa de entrada/Atendimento, balão com escudo/Ouvidoria, busto/
Alunos, crachá/Matrículas, busto com engrenagem/Equipe, barras/Relatórios, lista com relógio/Auditoria,
controles/Configurações, aperto de mãos/Parcerias, megafone/Banners); utilitários (busca, sino, sol e
lua/tema (o ícone mostra o tema que o clique ativa; nunca o meio círculo do estado info), A−, A+, conta, sair, recolher, expandir, chevron, seta, fechar, check, os 5 glifos de
estado, play, vídeo, PDF, slides, link externo, download, upload, imprimir, QR, copiar, cadeado,
calendário, relógio, enviar, anexo, mais "⋯", filtro, olho, escudo, tela cheia).

### 4.13 Breakpoints por componente

Larguras de referência: 320 · 375 · 390 · 768 · 1024 · 1440 · 1920. Comportamento interno por contêiner
(em), shell pela largura da janela dividida pela escala.

| Componente | 320 | 375 / 390 | 768 | 1024 | 1440 | 1920 |
|---|---|---|---|---|---|---|
| Topo | Menu · rino (link de 44) · busca (ícone) · sino · conta; 5 alvos de **44 px fixos** (não escalam com A+), ícone 20, espaço 4 px = 236 px ≤ 280 úteis no nível 2 | idem | + marca completa, busca em campo; Tutoriais vira ícone; tema e A± na conta | sem botão Menu; tema, A± e Tutoriais no topo; altura 72 | idem | idem |
| Lateral | gaveta `min(22rem, 88vw)` | idem | idem | fixa; nasce recolhida (72) até 1279 sem preferência | aberta 264 | aberta 264; conteúdo centrado no espaço restante |
| `pf-cabecalho` | ações abaixo, primário em largura total | idem | ações à direita | idem | idem | idem |
| `pf-kpis` | 2 colunas no nível 0, 1 coluna no nível 2 (< 18em); valor por `cqi` (§4.9) | idem | 1 linha (4–5) | idem | idem | idem |
| `pf-tabela` | empilhada | empilhada | tabela, secundárias ocultas | tabela (secundárias conforme o contêiner) | completa | completa |
| `pf-segmento` | 2×2 ou `select` | idem | linha | linha | linha | linha |
| `pf-filtros` | botão "Filtros (n)" | idem | em linha | em linha | em linha | em linha |
| `pf-dialogo` | folha inferior | folha inferior | centrado | centrado | centrado | centrado |
| `pf-detalhe` | página + barra fixa | idem | página | coluna do grid 32/40rem (lista empilha se faltar espaço) | idem | idem |
| Grade de capas (2:3) | 2 colunas | 2 | 3 | 4 | 5 | 5 (até 72rem) |
| Publicações | 1 coluna | 1 | 2 | 3 | 3 | 3 |
| Player | coluna em diálogo; rodapé compacto (‹ e ✓ só ícone; < 30em), em 2 linhas a partir do nível 1 | idem | idem; palco com margem | coluna em painel sobreposto (botão Módulos) | 2 colunas fixas (coluna 22rem) | palco até 60rem centrado |
| Calendário | Lista padrão; Mês = grade `repeat(7, minmax(0,1fr))` (≈ 40 px por coluna, exceção registrada à regra dos 44) + lista do dia | idem (390 nível 0: colunas de 44) | Mês em grade com texto | + Semana em 7 colunas | idem | até 90rem |
| Correção | empilhada + barra fixa com total | idem | empilhada | 2 colunas 7/5, pontos fixos ao rolar | idem | idem |
| Matriz (frequência/notas) | lista por aluno em sanfona | idem | idem | matriz agrupada por módulo | idem | idem |
| Editor de cursos | `select` de curso; aula empilhada com rótulos | idem | idem | lista de cursos 18rem + aula em 1 linha | idem | idem |
| Painel do sino | tela cheia | tela cheia | popover 24rem | idem | idem | idem |
| Chat do assistente | conversa em largura total; lista de conversas em diálogo | idem | idem | lista 18rem + conversa | idem | idem |

Aceite comum: 0 rolagem horizontal em todas as larguras, nos dois temas e nos níveis 0 e 2 de texto,
com gaveta, busca, sino e diálogo abertos; alvos ≥ 44 px abaixo de 1024, com uma exceção registrada: o
dia do Mês do calendário abaixo de 22em de contêiner (≈ 40 px de largura × 44 de altura; acima dos 24 px
da WCAG 2.5.8), marcado `data-alvo-excecao="calendario-dia"` para o teste de alvos.

---

## 5. Shell por papel (F0s · `js/shell.js`, `portal.css`; guarda e modo restrito no `DMC_Portal` da F0b)

O shell continua injetado por `shell.js` (`<body data-shell="chave">`; `DMC_Shell.montar(ativo)` legado
segue válido; acréscimos `{modo, area, papel, itens, restrito}`, índice §7.6). No backoffice, os `itens` chegam
**prontos** da F8 (`DMC_Professor.itensDoMenu(papel)`, D-66), repassados por `DMC_Portal.iniciar({ area:'backoffice',
itens })` (D-75) — em `parcerias.html`, pela chamada direta de `parcerias-admin.js` (D-48) —; o shell só desenha o que
recebe, sem conhecer rota nem papel. Sem `DMC_UI` (página legada antes do S2 ou `ui.js` com defeito), o shell não
lança: desenha topo e menu com escape próprio mínimo, sem busca, sino e faixa (D-60). Cada página traz, no HTML
estático, o **fallback sem JS**: `a.dmc-skip` "Pular para o conteúdo" + `header` mínimo com a marca e um link "Menu"
para `#pf-mapa` (lista simples de links no rodapé).

**Modo restrito (senha temporária; D-51, D-63).** Com `DMC_Auth.user().precisaTrocarSenha === true`, o servidor só
deixa passar `recursos`, `senha/trocar`, validação pública, imagens de banner e capas (API §5.2); todo o
resto responde 403 `troca-de-senha-obrigatoria`. Por isso, nesse estado:
- `DMC_Portal.iniciar` confere o modo restrito logo depois de `DMC_Auth.init()`, **antes de qualquer outra chamada**
  (D-63), e leva a `perfil.html#seguranca` **só se a página atual não for `perfil.html`** (sem
  laço de redirecionamento) e não roda o `boot` da página; em `perfil.html` roda o boot com `ctx.restrito = true`;
- páginas legadas com catálogo: `DMC_init` não carrega catálogo, liberações nem progresso e resolve sem rejeitar, e
  os boots legados de `app.js` levam a `perfil.html#seguranca` (D-63);
- o shell monta só o topo com a marca e [Sair]: **sem** lateral, busca, sino, faixa, pendências, banners,
  configurações públicas e **sem pedir a foto** (avatar por iniciais); tema e A± continuam (são locais);
- `perfil.html` desenha só o bloco de §6.15 "Crie uma senha pessoal para continuar" e não faz nenhuma outra
  chamada (nem `GET /portal/me/perfil`, nem `GET /api/auth/2fa`);
- critério: 0 requisição 4xx nesse fluxo. Testes (D-61): o **lado do cliente** fica no `portal-shell.spec.js` (F0s,
  G0), com `/api/auth/me` devolvendo `precisaTrocarSenha:true` por `page.route` e `perfil.html` servido por stub —
  nenhuma chamada a catálogo, liberações ou progresso e ida a `perfil.html#seguranca`; o **fluxo real** fica no
  `portal-titular.spec.js` (F0p, G1), com professor recém-criado pela coordenação e aluno com senha gerada, que
  entram, caem em `perfil.html#seguranca`, trocam a senha e chegam ao destino do papel com 0 requisição 4xx.

### 5.1 Anatomia

```
1440 (≥ 1024, lateral aberta)
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ [rino] COMPLEXO DMC │ Plataforma  [⌕ Buscar cursos, aulas, publicações…  Ctrl K] ? A− A+ ◐ Sino·3 (DM)▾│ 72
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▲ Há um contrato aguardando sua assinatura.   Assinar contrato →                               │ faixa 44+
├────────────────┬──────────────────────────────────────────────────────────────────────────────┤
│ ESTUDOS        │  main#conteudo.pf-main · máx. 72rem (90rem nas telas largas), centrado        │
│ ▣ Início       │                                                                              │
│ ▤ Meus cursos  │                                                                              │
│ ◉ Aulas ao vivo│                                                                              │
│ ▥ Acadêmico    │                                                                              │
│ ▶ Publicações  │                                                                              │
│ SECRETARIA     │                                                                              │
│ ▦ Financeiro   │                                                                              │
│ ▱ Documentação▾│                                                                              │
│   Documentos…  │                                                                              │
│   Declarações… │                                                                              │
│   Contratos   •│                                                                              │
│   Comprovantes │                                                                              │
│ AJUDA          │                                                                              │
│ ◌ Atendimento  │                                                                              │
│ ? Tutoriais    │                                                                              │
│ ⌗ Cursos disp. │                                                                              │
│────────────────│                                                                              │
│ ‹ Recolher menu│                                                                              │
└────────────────┴──────────────────────────────────────────────────────────────────────────────┘
  264 px (72 recolhida)

390 (< 1024: gaveta)
┌──────────────────────────────────────┐
│ ☰  [rino]            ⌕  Sino·3  (DM) │ 64 · cabe em 320 também no nível 2 (5 alvos de 44 px fixos)
├──────────────────────────────────────┤
│ ▲ Contrato aguardando assinatura  →  │ faixa: quebra em 2 linhas, nunca trunca
├──────────────────────────────────────┤
│ conteúdo em 1 coluna, gutter 16      │
```

- 1024–1279: lateral aberta ou recolhida conforme `dmc:menuRecolhido`; sem preferência, nasce recolhida.
- 768–1023: gaveta; busca como campo; Tutoriais como ícone; tema e A−/A+ no menu da conta.
- < 768: gaveta; busca, sino e conta como ícones de **44 px fixos** (ícone 20, espaço 4 px; não escalam
  com A+, o texto escala); a marca mostra só o rinoceronte num link de 44 px (nome acessível "Complexo
  DMC, início"). Soma: 5 × 44 + 4 × 4 = 236 px, dentro dos 280 úteis de 320 px no nível 2. Fora da matriz
  (janela < 300 px), a marca vai para o cabeçalho da gaveta.
- 1920: lateral 264 e conteúdo centrado no espaço restante.
- `scroll-padding-top` = topo + faixa + 16 px (o foco nunca fica sob o topo — WCAG 2.4.11).

### 5.2 Topo (`pf-topo`, `<header>`)

Ordem no DOM e na tela (desktop): Menu (< 1024) → marca → busca → Tutoriais/Ajuda → A−/A+ → tema →
sino → conta. Cada controle leva `data-tour` (`menu`, `busca`, `tutoriais`, `fonte`, `tema`,
`notificacoes`, `perfil`).

**Marca** (`pf-marca`, base `.dmc-brand`, com `.dmc-brand b` religado a `--pf-acento`, §4.2):
`rino-marca.webp` 22 px + "COMPLEXO **DMC**" (DMC em `--pf-acento`: ouro no escuro, ouro profundo no claro)
+ fio vertical + rótulo de contexto em Hanken 500 `--pf-texto-2`: **Plataforma** (área do
aluno), **Professor** ou **Coordenação** (backoffice). Link para `dashboard.html` (aluno) ou
`professor.html#/inicio` (backoffice).

**Busca global com filtros** (`pf-busca`):
- Desktop: campo de até 30rem, `role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-autocomplete="list"`, dica visual "Ctrl K" / "⌘K" (atalho com modificador). Mobile: o ícone abre
  diálogo de tela cheia com o campo no topo e "Cancelar".
- Placeholder: aluno "Buscar cursos, aulas, publicações…"; professor "Buscar curso, aula, publicação ou
  código da aula"; admin "Buscar curso, aula, protocolo ou documento" (nesta rodada, L3).
- Painel (popover de 35rem; no mobile ocupa o diálogo): `pf-segmento` de tipos — aluno **Tudo · Cursos ·
  Aulas · Publicações · Atendimentos · Documentos**; backoffice nesta rodada (L3) **Tudo · Cursos · Aulas ·
  Publicações · Atendimentos** + (admin) **Documentos**; Alunos, Turmas e Matrículas entram quando a F4a
  registrar os provedores (DC-37, L3) — no mobile o grupo vira `select` "Mostrar" (DC-12). Resultados agrupados por tipo (overline), até 5 por grupo + "Ver todos os N de Aulas" →
  `busca.html?q=&tipo=`. Resultado (`role=option`, 52 px): ícone do tipo, título com o termo em `<mark>`
  (fundo `rgba(var(--pf-acento-rgb), .18)`, texto `--pf-texto-1`), contexto ("Curso · Módulo 03",
  "ATD-2026-000123 · Respondido", "Documento · Pendente", "MAT-2026-000123 · Ativa · APE-2026-01") e
  cadeado quando o curso não está liberado (leva a `loja.html?destacar=`).
- Teclado: ↓/↑ com `aria-activedescendant`, Enter abre, Esc fecha e limpa, Tab sai.
- Regras: mínimo 2 caracteres, espera de 200 ms, `AbortController`; contagem em `role=status` ("7
  resultados"); escopo aplicado pelo servidor (aluno: só o próprio; professor: alunos das suas turmas e
  conteúdo dos seus cursos; busca por CPF exato do admin só quando L3 fechar, e nunca exibe o CPF). `href`
  só é seguido se passar em `DMC_Auth.NEXT_RE`.
- Estados: carregando (3 linhas de esqueleto); vazio ("Nada encontrado para "holding". Tente outro termo
  ou mude o filtro." — backoffice acrescenta "ou busque pelo código da aula, ex.: APE-M01-A01");
  erro ("A busca não respondeu. Tente de novo.").

**Faixa do topo** (`pf-faixa`, logo abaixo do topo, 44 px mínimo, fio inferior, `role="region"
aria-label="Avisos"`, sem `aria-live`). Uma por vez, sem rotação, por prioridade:
1. **Pendência** (não dispensável, vinda dos avisos do servidor): contrato pendente (aviso `contrato-pendente`,
   F4b) e lançamento em atraso (F5). `--pendencia`: fio esquerdo 2 px `--pf-aviso` + glifo + "Há um contrato aguardando sua
   assinatura." + link "Assinar contrato" (com 2+: "Há 2 contratos aguardando assinatura." →
   `contratos.html`); "Há um lançamento em atraso." + "Ver financeiro".
2. **Novidade embutida** "Conheça o novo portal" (dispensável) → `tutoriais.html#novo-portal` (aluno) ou
   `#/ajuda` (backoffice).
3. **Banners gerenciados** de local `topo` (F7), no período e para o público do aluno; dispensáveis.
Visual: fundo `--pf-painel`, texto 14 px `--pf-texto-1`, link sublinhado; × de 44 px "Dispensar aviso"
(DC-35). Altura reservada de forma síncrona quando há candidato conhecido (sem salto de layout).
Endpoint ausente (404) = silêncio. No backoffice só aparece a novidade embutida.

**Tutoriais/Ajuda**: desktop, link de texto com ícone "?" ("Tutoriais" no aluno, "Ajuda" no
backoffice); 768–1023 só ícone; < 768 dentro da conta.

**A−/A+** (`pf-fonte`): `div[role=group][aria-label="Tamanho do texto"]` com dois botões de 44 px ("A−"
14 px e "A+" 18 px, Hanken 600). §2.8.

**Tema** (`pf-tema`): botão de 44 px com ícone de **sol** (no escuro: ativa o claro) ou **lua** (no claro:
ativa o escuro) — nunca o meio círculo, que é o glifo do estado info; `aria-label` "Ativar tema claro" /
"Ativar tema escuro" (o rótulo diz a ação; sem `aria-pressed`).

**Sino** (`pf-sino`): botão 44 px com contador (DC-17): marca retangular raio 2, mín. 18 px, fundo
`--pf-texto-1`, número `--pf-fundo` 12 px/600 `tnum`, "9+" acima de 9; `aria-label="Notificações, 3 não
lidas"`, `aria-expanded`, `aria-controls`. Painel (`pf-notificacoes`) `role="dialog" aria-modal="false"`
de 25rem (tela cheia no mobile): título "Notificações" + "Marcar todas como lidas"; 10 mais recentes
(ícone do tipo, título 600 quando não lida + ponto `--pf-texto-1` e "não lida" oculto, uma linha de
contexto, `<time>` relativo com data absoluta oculta); clique abre o destino e marca como lida; rodapé
"Ver todas as notificações" → `notificacoes.html` (aluno) ou `#/notificacoes` (backoffice). Foco no
título ao abrir e no sino ao fechar; Esc e clique fora fecham. Atualiza a cada 60 s com a aba visível e
ao voltar o foco; a contagem muda o rótulo **sem** anunciar; "Marcar todas" anuncia em `role=status`.
Estados: vazio "Nenhuma notificação por enquanto."; carregando 3 linhas; erro "Não foi possível
carregar. Tentar de novo".

**Conta** (`pf-conta`): botão circular 36 px (foto via `DMC_UI.imagemProtegida` ou iniciais Hanken 600
sobre `--pf-painel-3`) com alvo de 44 e chevron. Popover de 18rem (lista de links, não `role=menu`):
cabeçalho com nome de exibição (nome social se houver) e e-mail (`--pf-texto-3`) → **Meu perfil** →
**Meus dados** → (< 1024) **Aparência e leitura**: tema (rádio Claro · Escuro · Automático) + A−/A+ →
(< 768) Tutoriais/Ajuda → **Rever o tour** → troca de área (DC-15: "Portal do professor",
"Coordenação" ou "Área do aluno") → fio → **Sair**.

### 5.3 Menu do aluno (`area: 'aluno'`)

Grupos com título visível (overline `--pf-texto-3`; vira fio de 24 px quando recolhido).

| Grupo | Rótulo | Destino | `data-shell` | Ícone | Indicador (nunca só cor, DC-17) |
|---|---|---|---|---|---|
| Estudos | Início | `dashboard.html` | `inicio` (alias legado `conteudos`) | pórtico | — |
| | Meus cursos | `meus-cursos.html` | `meus-cursos` | camadas | — |
| | Aulas ao vivo | `ao-vivo.html` | `ao-vivo` | ponto com arcos | a palavra "Agora" (13 px/600 `--pf-texto-1`, com anel neutro de 6 px) quando há encontro ao vivo |
| | Acadêmico | `academico.html` | `academico` | barras | — |
| | Publicações | `publicacoes.html` (+ `publicacao.html`) | `publicacoes` | play em retângulo | — |
| Secretaria | Financeiro | `financeiro.html` | `financeiro` | recibo | triângulo de aviso (12 px) com lançamento em atraso |
| | **Documentação ▾** | submenu (abre e fecha) | `documentacao` | pasta | herda o triângulo dos filhos (recolhido) |
| | › Documentos pessoais | `documentos.html` | `documentos` | cartão de identificação | triângulo de aviso com documento pendente/não enviado exigido |
| | › Declarações e certificados | `certificados.html` | `certificados` | folha com selo | — |
| | › Contratos | `contratos.html` (+ `contrato.html`) | `contratos` | pena sobre linha | triângulo de aviso com contrato pendente |
| | › Comprovantes | `comprovantes.html` | `comprovantes` | folha com check | — |
| Ajuda | Atendimento | `assistente.html` (subnavegação: Assistente · Seus atendimentos `atendimentos.html` · Ouvidoria `ouvidoria.html`) | `atendimento` | balão | — (resposta nova chega pelo sino; a lista marca "nova resposta" em texto) |
| | Tutoriais | `tutoriais.html` | `tutoriais` | "?" | — |
| | Cursos disponíveis | `loja.html` (+ `obrigado.html`) | `loja` | grade 2×2 | — |
| Rodapé | Portal do professor / Coordenação (só equipe) | `professor.html#/inicio` | — | — | — |
| Rodapé | Recolher menu / Expandir menu | (preferência `dmc:menuRecolhido`) | — | — | — |

Sem item no menu (acesso pelo topo, conta, sino ou links): `notificacoes.html`, `perfil.html`,
`meus-dados.html`, `busca.html`, `regulamento.html` (rodapé, Tutoriais, Acadêmico e fontes do assistente, §6.20);
o player (`aula.html`) roda em modo foco.

### 5.4 Menu do backoffice (`area: 'backoffice'`, `professor.html`, `admin.html`, `parcerias.html`)

`<body data-shell="backoffice" data-shell-ativo="<chave>">`. Contagem de fila: número tabular 13 px/600
`--pf-texto-2` à direita do item, sem fundo; no nome acessível ", 4 a corrigir". Zero ou sem dado: não
aparece. Uma requisição de resumo alimenta contagens e a Visão geral (campo `null` + motivo = sem número).

**Professor**

| Grupo | Rótulo | Destino | Contagem |
|---|---|---|---|
| — | Visão geral | `professor.html#/inicio` | — |
| Ensino | Meus cursos | `#/cursos` | — |
| | Turmas | `#/turmas` | — |
| | Conteúdo | `admin.html` | — |
| | Avaliações | `#/avaliacoes` | — |
| | Correção | `#/correcao` | dissertativas a corrigir |
| | Aulas ao vivo | `#/ao-vivo` | — ("Agora" em `--pf-texto-1` quando há encontro ao vivo) |
| | Relatórios | `#/relatorios` | — (índice pelo catálogo do papel, só dos seus cursos e turmas, §7.23) |
| Relacionamento | Dúvidas | `#/duvidas` | dúvidas sem resposta |
| | Atendimento | `#/atendimento` | protocolos abertos do escopo |
| | Ouvidoria (encaminhadas) | `#/ouvidoria` | manifestações encaminhadas a ele ainda sem parecer: `ouvidoriaSemParecer:N\|null` de `GET /portal/professor/resumo`, pelo serviço `atendimento.ouvidoriaSemParecer` da F6a (D-54 b); `null` ou campo ausente: a contagem não aparece |
| | Publicações | `#/publicacoes` | — |
| Rodapé | Área do aluno · Ajuda (`#/ajuda`) · Recolher menu | | |

**Coordenação (admin)**

| Grupo | Rótulo | Destino | Contagem |
|---|---|---|---|
| — | Visão geral | `#/inicio` | — |
| Ensino | Cursos · Turmas · Conteúdo (`admin.html`) · Avaliações · Correção · Aulas ao vivo · Dúvidas | `#/cursos` · `#/turmas` · `admin.html` · `#/avaliacoes` · `#/correcao` · `#/ao-vivo` · `#/duvidas` | Correção, Dúvidas |
| Secretaria | Alunos · Matrículas · Documentos · Contratos · Financeiro | `#/alunos` · `#/matriculas` · `#/documentos` · `#/contratos` · `#/financeiro` | Documentos (em revisão), Contratos (pendentes), Financeiro (em atraso) |
| Relacionamento | Atendimento · Ouvidoria · Publicações · Banners | `#/atendimento` · `#/ouvidoria` · `#/publicacoes` · `#/banners` | Atendimento, Ouvidoria (abertas) |
| Gestão | Equipe · Relatórios · Auditoria · Configurações · Parcerias ↗ | `#/equipe` · `#/relatorios` · `#/auditoria` · `#/configuracoes/ia` · `parcerias.html` | — |
| Rodapé | Área do aluno · Ajuda · Recolher menu | | |

O menu é estático (`DMC_Professor.MENU_ESTATICO`, D-08) e **filtrado pela F8** (`DMC_Professor.itensDoMenu(papel)`,
D-66): em `professor.html`, por papel e por rota registrada (rota de fatia ausente não aparece); em `admin.html` e
`parcerias.html`, que não têm roteador, só por papel, com os destinos `professor.html#/<rota>` (nenhum hash é
reescrito nessas páginas). `professor.js` e `boot-admin.js` passam os itens por `DMC_Portal.iniciar({ itens })` (D-75).
As contagens vêm de UMA chamada: `GET /portal/professor/resumo` (professor) ou `GET /portal/admin/relatorios/painel`
(coordenação) (índice §7.8). Banners são só da coordenação (D-09): o menu do
professor não tem esse item. Relatórios aparece para os dois papéis, em grupos diferentes (Ensino para o professor,
que só consulta as próprias turmas; Gestão para a coordenação), com o mesmo ícone e a mesma rota. "Ouvidoria (encaminhadas)" é a visão saneada do professor (§7.11, DC-40); para a
coordenação o item continua "Ouvidoria", com a fila inteira. O servidor autoriza (403); o menu só esconde o que o papel não usa. Seção de
admin aberta por professor (link antigo, hash digitado) mostra o estado "Área da coordenação" (§7.21).

### 5.5 Estados do item de menu (`pf-menu__item`, link de 44 px; 48 na gaveta)

| Estado | Visual (escuro; no claro, os mesmos tokens) |
|---|---|
| padrão | texto `--pf-texto-2` 15 px/500, ícone `--pf-texto-3` |
| hover | fundo `--pf-painel-2`, texto `--pf-texto-1` |
| atual (`aria-current="page"`) | texto `--pf-texto-1`, ícone `--pf-acento`, fio vertical 2 px `--pf-acento` à esquerda (`scaleY` 0→1 em 240 ms), fundo `rgba(var(--pf-acento-rgb), .08)`; em alto contraste, `border-left: 2px solid Highlight` (§11) |
| foco | outline 2 px `--pf-foco`, offset −2 px (dentro do item) |
| com pendência | glifo de aviso (triângulo de 12 px, `--pf-aviso`) — nunca ponto — + ", 1 pendência" no nome acessível |
| recolhido | só ícone; nome acessível = rótulo; `pf-dica` visível no hover e no foco (ligada por `aria-describedby`, some com Esc) |

**Submenu Documentação**: `button.pf-menu__grupo[aria-expanded][aria-controls]` + lista dos 4 links
recuados 36 px com fio vertical `--pf-linha`. Abre sozinho quando a página atual é um dos 4. No menu
recolhido abre como **flyout** (`pf-popover` à direita do ícone, 15rem), que fecha com Esc, clique fora
ou saída do foco e devolve o foco ao botão.

Landmark: `<aside class="pf-lateral">` > `<nav class="pf-menu" aria-label="Menu principal">`.

### 5.6 Gaveta, modo foco e rodapé

- **Gaveta** (< 1024): `button.pf-topo__menu` "Menu" (44 px, `aria-expanded`, `aria-controls`) abre
  `<div role="dialog" aria-modal="true" aria-label="Menu">` pela esquerda, `width: min(22rem, 88vw)`,
  altura total, `overscroll-behavior: contain`, safe-area. Conteúdo: cabeçalho (marca + "Fechar" 44 px),
  o mesmo `pf-menu` (grupos e submenu em sanfona, com o grupo do item atual aberto) e rodapé (troca de
  área, Tutoriais/Ajuda, Sair). Comportamento de `.dmc-drawer`: foco preso, `html.dmc-lock`, Esc e clique
  no véu fecham, foco volta ao botão.
- **Modo foco** (`pf-app--foco`, só `aula.html`): sem lateral e sem o topo global; topo próprio do player
  (§6.3). A lateral fica fora da ordem de tabulação.
- **Rodapé** (`pf-rodape`, no fluxo, não fixo): "Complexo DMC · Plataforma" · Política de privacidade
  (`../pages/politica-de-privacidade.html`) · Meus dados · Encarregado de dados (nome e contato **da
  configuração**; sem configuração, o link vai para Meus dados) · Regulamento acadêmico (`regulamento.html`,
  §6.20) · Tutoriais. A partir de 1024: uma linha
  13 px `--pf-texto-3` com links separados por "·" (alvo do link com `min-height: var(--hit)` por
  `inline-flex`). **Abaixo de 1024: lista vertical** no padrão `.dmc-footer__list` (cada link com
  `min-height: var(--hit)`, 13 px `--pf-texto-2`), sem separadores. `#pf-mapa` (todos os links do menu do
  papel) fica visualmente oculto, exceto sem JS e no foco.

### 5.7 Tour de primeiro acesso (`pf-tour`)

- Dispara uma vez por usuário neste navegador (`localStorage dmc:tour:<chave>:<userId>`; preferência no
  servidor fica para depois, D-17), depois que o conteúdo carregou: no Início (aluno) ou na Visão geral
  (equipe). Não dispara com contrato pendente nem em modo restrito (§5).
- **Aluno** (5 passos, ancorados no elemento real): (1) Menu — "Aqui ficam suas áreas: estudos,
  secretaria e ajuda. Documentação reúne documentos, declarações, contratos e comprovantes."; (2)
  Busca — "Encontre cursos, aulas, publicações, atendimentos e documentos."; (3) Sino — "Correções,
  documentos revisados, contratos e aulas ao vivo chegam aqui."; (4) Tema e texto — "Ajuste o tema e o
  tamanho do texto. Sua escolha fica salva."; (5) Tutoriais — "Guias de uso de cada área. Você pode rever
  este tour pelo menu da sua conta."
- **Equipe** (5 passos): (1) Menu — "Suas áreas: ensino e relacionamento (e, para a coordenação,
  secretaria e gestão)."; (2) Indicadores — "O que pede ação hoje. Cada número abre a fila
  correspondente."; (3) Conteúdo — "Plano de ensino e materiais de cada módulo." (coordenação: "Plano de
  ensino, materiais, aulas e avaliações de cada módulo."); (4) Correção — "Dissertativas entregues
  aguardando a sua nota."; (5) Sino — "Atendimentos atribuídos a você e manifestações encaminhadas chegam
  aqui. Entregas e dúvidas aparecem nas filas da Visão geral." (D-23)
- No mobile os alvos mudam (botão Menu, ícone de busca, sino, conta; o passo de tema aponta a conta).
- Componente: `pf-popover` `role="dialog" aria-modal="false"`, **sem véu** (a página continua operável e
  legível, e nada sugere um modal que não existe): título, texto, "Passo 2 de 5", [Anterior], [Próximo]
  (último: [Concluir]) e [Pular tour]. O alvo ganha só o contorno 2 px `--pf-foco` offset 4 (em alto
  contraste, `Highlight`); troca de passo por fade de 160 ms. Em 390, o popover ocupa a largura total acima
  ou abaixo do alvo. Foco no título do passo; Tab percorre os botões do passo e depois segue a página (o
  passo continua aberto até Pular/Concluir); Esc = Pular; ao terminar, o foco volta ao `<main>`. "Rever o
  tour" na conta, em Tutoriais/Ajuda e em Perfil › Preferências.

---

## 6. Telas do aluno

Padrão: `pf-cabecalho` (§4.4) → conteúdo → `pf-rodape`. `<title>` "<Tela> · Plataforma Complexo DMC".
Cada tela abaixo traz **Fatia** (dona do HTML, do módulo JS e do CSS de domínio), layout em 1440 e 390,
componentes, microcopy principal e estados. Esquemas com números são ilustração (D7).

### 6.1 Início — `dashboard.html`

**Fatia: F1b** (tela; rotas da F1a) · `data-shell="inicio"` · `js/portal/estudos-dados.js` + `inicio.js` ·
`portal-estudos.css` · preserva `#modules-list`, `[data-curso-id]`, `[data-aula-id]` (seletores de R4 em
`SELETORES_D5`, D-45), `#catalog-track` (ou o render novo no mesmo boot) e `dmc:cursoEscolhido` (D5).

Ordem dos blocos (igual em todas as larguras): ① herói do curso ativo → ② Para você agora (pendências +
próxima aula ao vivo) → ③ Meus cursos (capas verticais) → ④ destaques gerenciados (0–2) → ⑤ Trilha do
curso (preservada) → ⑥ Outros cursos (catálogo preservado).

```
1440
┌ ① pf-heroi (22rem, raio 4, escopo escuro; capa cobre o bloco; véu .86 sólido sob o texto até 42%) ──┐
│ Arquitetura Patrimonial *Estratégica*     (Newsreader 300, --pf-fs-titulo, ≤ 18ch)  .6 → 0 [capa  │
│ ◐ Cursando  ·  Início em 03/11/2026  ·  Turma APE-2026-1  ·  42 h                       visível]    │
│ ▬▬▬▬▬▬▬▬░░░░░░░░  38% concluído · 17 de 45 aulas                                                   │
│ [ Acessar aulas → ]  [ Acadêmico ]      Trocar de curso ↓                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
┌ ② Pendências ────────────────────────────────────┬ Próxima aula ao vivo ──────────────────────────────┐
│ ◆ Lançamento em atraso                   Ver →  │  SEX   Módulo 03 · Holding familiar               │
│ ▲ Contrato aguardando assinatura      Assinar → │  14    19:00–22:00 · Turma APE-2026-1             │
│ ▲ 2 documentos pendentes               Enviar → │  NOV   A sala abre 15 minutos antes do início.    │
│ ▲ Cadastro incompleto              Completar →  │        Baixar convite (.ics)                      │
└──────────────────────────────────────────────────┴────────────────────────────────────────────────────┘
③ Meus cursos                                                                     Ver todos →
[capa 2:3] [capa 2:3] [capa 2:3] [capa 2:3] [capa 2:3]   (título 2 linhas · marcador · barra fina + %)
④ [imagem 16:6 | título · uma frase · Saiba mais →]  (até 2, empilhados, dispensáveis)
⑤ Trilha do curso                                                          Abrir no player →
   01  Fundamentos do Patrimônio Estratégico     4 de 5 aulas · 3h50    ● Concluído    ⌄
⑥ Outros cursos  (3 colunas: capa 16:9 · título · carga · modalidade · preço · Conhecer o curso →)

390
[faixa] → bloco escuro do herói (escopo escuro também no tema claro): capa 16:9 em largura total (raio 0)
→ texto embaixo sobre o fundo sólido do bloco: título 28 px → ◐ Cursando · Início em 03/11/2026 →
Turma APE-2026-1 · 42 h → barra + "38% · 17 de 45 aulas" → [Acessar aulas] e [Acadêmico] em largura
total → "Trocar de curso ↓" → Pendências (linhas de 56 px) → Próxima aula ao vivo (Entrar em largura
total) → Meus cursos em 2 colunas (320: 2 × 136 px) → destaques empilhados → Trilha em sanfona →
Outros cursos em lista (miniatura 96 px + título + preço + link)
```

- **Curso ativo**: `?curso=ID`, senão `dmc:cursoEscolhido`, senão o de progresso mais recente, senão o
  primeiro liberado. Clicar numa capa de ③ (link `dashboard.html?curso=ID`, funciona sem JS) redesenha
  herói e trilha, leva o foco ao H1 do herói, move `aria-current="true"` e anuncia "Curso ativo: …".
- **Herói**: capa `capaUrl` (16:9) com recorte central (sem `capaFoco`, D-56); sem capa, capa tipográfica. Status
  vindo do servidor: Cursando · Concluído (100% sem avaliação publicada) · Aprovado · Em recuperação ·
  Reprovado. "Início em" vem da matrícula (sem matrícula, não aparece); turma só com enturmação; carga
  do curso. "Acessar aulas" abre o próximo conteúdo não concluído (100% concluído: "Rever aulas");
  "Acadêmico" abre `academico.html?curso=<id>`. Os quatro números antigos viram meta + barra; o "Módulos
  10" fixo do HTML some. Turma e carga vêm do `CardMatricula`: o Início pede `me/cursos` e `me/academico`
  em paralelo (D-35; continua ≤ 2 idas em série).
- **Véu do herói** (regra da casa, DESIGN-SYSTEM): o herói é **escopo escuro** nos dois temas (§2.2), então
  texto, marcador info, botão primário e foco usam os valores escuros. A partir de 1024, `--hero-veil` (.86)
  **sólido** de 0 a 42% da largura, depois `--hero-veil-mid` (.6) e `--hero-veil-off` (0); entre 768 e 1023,
  sólido até 62%. A coluna de texto (`pf-heroi__texto`) tem `max-width` igual à faixa sólida, então o texto
  fica sempre sobre véu ≥ .80: medido sobre a área branca de uma capa clara, `--pf-texto-2` dá 7,25:1 e o
  info `#8caed7` 5,92:1 (com véu .6 dariam 2,76 e 2,25). Abaixo de 768, imagem em cima e texto embaixo, no
  fundo sólido do bloco. `portal-qualidade.spec.js` mede o herói com uma capa de teste branca nos dois temas.
- **Professor do curso** (DC-27): o herói ganha `pf-alerta--info` "Você está vendo este curso como
  professor. Seu progresso não entra em notas nem relatórios."
- **Pendências** (`pf-pendencias`): até 5 linhas por gravidade (erro → aviso → info), vindas dos avisos do
  servidor (`GET /portal/me/pendencias`): contrato pendente, documento pendente ou não enviado, lançamento
  em atraso, cadastro incompleto, avaliação disponível não feita (aviso `avaliacao-disponivel`, F2) e lançamento
  vencendo em ≤ 3 dias (aviso `lancamento-vencendo`, F5, D-18) — L13 fechada (D-50: os dois avisos estão no grupo
  `aviso` da API §4.4; aviso de fatia ainda não integrada simplesmente não vem); nota de dissertativa corrigida chega
  pelo sino.
  Linha inteira é link de 56 px; marcador sem destaque (§2.3). Sem nada: linha neutra "Nada pendente no
  momento."
- **Próxima aula ao vivo**: encontro mais próximo dos cursos liberados; bloco de data (dia da semana e
  mês em overline, dia em Newsreader 40 px). "Entrar na sala" (primário) só na janela (15 min antes até o
  fim) e registra presença (§6.6). Fora dela: "A sala abre 15 minutos antes do início." + "Baixar
  convite (.ics)" (gerado no cliente). Sem encontro: "Nenhuma aula ao vivo agendada." + "Ver calendário".
- **Meus cursos** (`pf-capas`): capa 2:3 (`capaVerticalUrl` de `GET /portal/me/cursos`, D-56; sem ela, recorte
  central da capa 16:9 e, sem imagem, capa tipográfica, §4.11); título Hanken 600 16 px (2 linhas com reticências; título
  completo no nome acessível), marcador e barra fina + % (`tnum`). Colunas 2/2/3/4/5/5 (§4.13). Hover:
  fio `--pf-linha-forte` e imagem `scale(1.02)` em 400 ms; sem sombra.
- **Destaques** (`pf-banner`, local `inicio`, F7): imagem 16:6 (nesta rodada decorativa, `alt=""`, até
  existir `imagem.descricao` — L6), título 20 px/600, uma frase, link de 44 px; × dispensável; texto nunca
  dentro da imagem; sem carrossel.
- **Trilha** (preservada): sanfona `button[aria-expanded]` (hoje `div` clicável). Linha: número
  Newsreader 32 px `--pf-texto-3` (atual em `--pf-acento`), título, resumo (1 linha; oculto < 48em),
  "4 de 5 aulas · 3h50" (conta **só** conteúdo disponível — mesma função do servidor para Início, Meus
  cursos, player e certificados) e marcador.
- **Outros cursos**: só os não liberados; grade de 3 colunas (desktop) ou lista (mobile), sem carrossel
  nem setas. "Conhecer o curso" → `loja.html?destacar=ID`. Preço com `DMC_UI.fmt.reais`, sem urgência.
  Bloco some sem outros cursos.
- **Sem curso liberado**: o herói vira `pf-vazio` com capa tipográfica genérica (rino a 8%): "Você ainda
  não tem um curso liberado." · "Quando sua matrícula for confirmada, o curso aparece aqui." · [Ver
  cursos disponíveis] [Falar com o atendimento].
- **Carregando**: esqueleto do herói (bloco de 22rem com 3 barras), 4 linhas de pendência, 5 capas.
  **Erro**: `pf-alerta--erro` "Não foi possível carregar seus cursos." + [Tentar de novo] (troca o
  `alert()`).

### 6.2 Meus cursos — `meus-cursos.html`

**Fatia: F1b** (tela; rotas da F1a) · `data-shell="meus-cursos"` · `meus-cursos.js` · `portal-estudos.css` ·
preserva `#meus-cursos-lista` (R7, `SELETORES_D5`).

- H1 "Meus cursos"; descrição "Cursos liberados na sua conta."; `pf-segmento` **Em andamento ·
  Concluídos · Todos** (com contagem).
- Mesma grade de capas verticais do Início (`capaVerticalUrl`, com o mesmo recorte central e a mesma capa
  tipográfica de reserva, D-56); sob cada capa: título, nível (quando cadastrado), marcador,
  barra + %, e o link **Continuar** (primeiro conteúdo pendente; corrige o `aula.html?id=undefined` de
  `app.js:1330`) ou **Rever aulas** (100%).
- Vazio: "Você ainda não tem um curso liberado." + [Ver cursos disponíveis]. Filtro sem resultado:
  "Nenhum curso concluído ainda."

### 6.3 Player — `aula.html` (modo foco)

**Fatia: F1b** (player, vídeo, seções; rotas da F1a) · **F2** (palco de avaliação, `DMC_Avaliacao`) · `player.js`,
`video.js` (`DMC_Video`), `estudos-dados.js`, `avaliacao.js` (F2) · `portal-estudos.css` + `portal-avaliacao.css` ·
preserva `#player-root`, `#player-stage`, `#btn-done`, `#player-duvidas` e `[data-duvida-form]` (R5 e R6,
`SELETORES_D5`) · a F1b entrega primeiro o player montando a seção 4 com `DMC_Avaliacao.montar` quando o global existe
(sem ele, a seção some sem erro): é o hospedeiro de tela da F2 (P1f, D-74) ·
URL `aula.html?curso=&modulo=&item=<tipo>:<id>` (legado `?id=` continua); só `?curso=<id>` abre o próximo
conteúdo não concluído do curso (o mesmo destino de [Acessar aulas] do Início; destino do link "Continuar as aulas"
das pendências do certificado, §6.9).

```
1440
┌ pf-player__topo (56 px) ──────────────────────────────────────────────────────────────────────────┐
│ ← Início   Arquitetura Patrimonial Estratégica   ▬▬▬▬░░ 38% do curso       [Aparência]  [Módulos]* │
├────────────────────────────┬───────────────────────────────────────────────────────────────────────┤
│ MÓDULOS (11)               │ MÓDULO 03 · AULAS GRAVADAS                                            │
│ [01] Fundamentos…        ● │ O patrimônio como sistema, não como evento     (Newsreader --pf-fs-secao)
│      36 h · 9 de 9 · 100%  │ APE-M03-A02 [Copiar] · 41 min · Encontro: Sexta · noite (07/11) · ◐   │
│ [03] Planejamento…       ◐ │ ┌ vídeo 16:9 (máx. 60rem) — rótulo APE-M03-A02 sobre o vídeo ─────────┐│
│      36 h · 4 de 9 · 44% ▾ │ └─────────────────────────────────────────────────────────────────────┘│
│  PLANO DE ENSINO     1/1   │ Assistido 64% (medido pelo navegador) · conclui sozinha a partir de 90%│
│   ● Plano de ensino        │                                                                       │
│  MATERIAL DE APOIO   2/5   │ Dúvidas da aula  (#player-duvidas, preservado)                        │
│   Leitura · Slides · Compl.│                                                                       │
│  AULAS GRAVADAS      1/4   │                                                                       │
│ ▌◐ Sábado · manhã  (atual) │                                                                       │
│  AVALIAÇÃO           0/1   │                                                                       │
│   ○ Atividade modular      │                                                                       │
├────────────────────────────┴───────────────────────────────────────────────────────────────────────┤
│ [← Anterior]          5 de 9 · Módulo 03          [○ Marcar como concluído]  [Próximo conteúdo →]  │ 64
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
 coluna 22rem com rolagem própria          * "Módulos" só abaixo de 1280, onde a coluna vira painel

390
┌ ← │ Arquitetura Patrimonial… │ Módulos ┐ 56
│ vídeo 16:9 em largura total (sem raio) │
│ MÓDULO 03 · AULAS GRAVADAS              │
│ título 24 px · APE-M03-A02 [Copiar]     │
│ Encontro: Sexta · noite · Assistido 64% │
│ Dúvidas da aula                         │
├─────────────────────────────────────────┤
│ [‹]  5 de 9  [○]   [ Próximo › ]        │ 64 + safe-area (‹ e ○/✓ só ícone, 44 px)
└─────────────────────────────────────────┘
"Módulos" abre diálogo de tela cheia com a mesma coluna (sanfona por módulo).
Nível 1 ou 2 de texto (< 48em): rodapé em 2 linhas — "5 de 9 · Módulo 03" em cima; [‹] [○] [Próximo ›] embaixo.
```

- **Coluna de módulos** (`pf-modulos`): módulo = `button[aria-expanded]` com miniatura numerada 56×56
  (raio 4; capa do módulo — `capaUrl` de `trilha.modulos[]`, D-56 — com recorte central quando houver, senão
  `--pf-painel-3` com o número em Newsreader 24; a imagem é decorativa, `alt=""`, porque o título está ao lado), título (2
  linhas), "36 h · 4 de 9 · 44%" (`tnum`; CH do módulo; % = feitos sobre disponíveis), barra fina e
  glifo (Concluído com check de sucesso · Cursando · Não iniciado · Em breve com cadeado). Abre o módulo
  atual.
- **Seções padronizadas**, sempre nesta ordem, com overline + contador `feitos/total`: **Plano de
  ensino** · **Material de apoio** (subgrupos Leitura, Slides, Complementar; subgrupo vazio some) ·
  **Aulas gravadas** (rótulo do item = rótulo do encontro, "Sexta · noite"; sem encontro, o título) ·
  **Avaliação** (Atividade prévia e/ou Atividade modular, contadas por `Conteudo.secoes.avaliacoes`, que o
  servidor já calcula — D-11; `DMC_Avaliacao.montar` recebe `avaliacaoId`). Seção vazia não aparece.
- **Item** (`pf-conteudo-item`, link de 44 px): ícone do tipo (vídeo, PDF, slides, link, avaliação),
  título e glifo. Atual: `aria-current="page"`, fio esquerdo 2 px `--pf-acento`, fundo `--pf-painel-2`.
  Em breve: cadeado, `--pf-texto-3`, sem link, "Em breve" no nome acessível.
- **Palco** (`pf-palco`) por tipo:
  - *Aula gravada*: `DMC_Video.montar` (YouTube — `watch`, `youtu.be` e `shorts` — →
    `www.youtube-nocookie.com/embed/ID`; Vimeo → `player.vimeo.com/video/ID`; arquivo de mesma origem →
    `<video controls preload="metadata">`, que toca e mede o %; critérios da F1b em `portal-estudos.spec.js`, D-77;
    vídeo `externo` vira o link "Abrir vídeo em nova aba", nunca iframe), montado por DOM API,
    `title="Vídeo: <título>"`, `allowfullscreen`. **Código da aula** na meta (com Copiar) e como rótulo
    sobre o vídeo (`pf-palco__codigo`: fundo `--hero-veil`, raio 2, padding `--space-1` `--space-2`, texto
    13 px/500 `--pf-texto-1` do escopo escuro, `tnum`; `pointer-events: none`; some 3 s depois de tocar e
    volta na pausa; fixo com movimento reduzido). O palco é escopo escuro nos dois temas (§2.2). "Assistido 64% (medido pelo navegador)" de `pctVideo`; sem medição:
    "Conclua manualmente ao terminar."
  - *Plano de ensino*: documento legível (máx. 46rem) a partir do `PlanoEnsino` estruturado (DC-61 da API, D-52):
    Ementa, Objetivos (lista), Bibliografia em dois blocos, **Básica** e **Complementar** (bloco vazio não aparece), e
    Cronograma (tabela Encontro · Data · Tema; quando a linha traz a aula, o tema é link para ela). Conta como feito
    ao marcar "Concluído".
  - *Material*: tipo e tamanho, [Abrir material] (download autenticado por header → `DMC_UI.abrirArquivo`: PDF abre
    em nova aba com o tipo refeito no cliente, outro tipo baixa, D-47; nada de token na URL) e descrição. O player
    passa a ter `#player-materiais` (corrige o bug).
  - *Avaliação*: §6.4.
  - *Indisponível*: `pf-vazio` "Este conteúdo ainda não foi liberado." + [Ir para o próximo disponível].
- **Rodapé linear** (`<nav aria-label="Navegação do módulo">`): [Anterior] · "**5 de 9**" (posição entre
  **todos** os conteúdos do módulo, na ordem das seções; `aria-live="polite"`) · botão de conclusão
  (secundário) · primário [Próximo conteúdo]. O botão de conclusão **troca o rótulo e não usa
  `aria-pressed`** (evita "Concluído, pressionado"): não feito = círculo vazado + "Marcar como concluído";
  feito = "Desmarcar conclusão", e o estado aparece fora do botão, no marcador "Concluído" (sucesso) da meta
  e do item da coluna. No último: "Concluir módulo"; com tudo feito, "Ir para o Módulo 04" (último módulo:
  "Voltar ao início"). No vídeo, ao chegar a 90% a aula conclui sozinha, o botão passa a "Desmarcar
  conclusão", o marcador vira "Concluído" e `role=status` anuncia "Aula concluída automaticamente." **Sem**
  avanço automático.
- **Rodapé compacto** (reflow em 320/390 no nível 2): abaixo de 30em de contêiner, [Anterior] e o botão de
  conclusão ficam **só ícone** (44 px, padding `--space-3`, nome acessível "Conteúdo anterior" e "Marcar
  como concluído"/"Desmarcar conclusão"; o ícone troca entre círculo vazado e check cheio); o primário
  mantém o texto curto "Próximo" (é a ação principal). Nos níveis 1 e 2 de texto, abaixo de 48em, o rodapé
  passa a 2 linhas: posição "5 de 9 · Módulo 03" em cima, botões embaixo. Soma em 320/nível 2: 44 + 44 +
  ≈ 110 + espaços = ≈ 214 px de 280 úteis.
- **Topo do player**: ← Início · nome do curso (link para o herói) · progresso do curso · [Aparência]
  (popover com tema e A−/A+) · [Módulos] (< 1280). Busca e sino ficam fora (modo foco).
- **Erros**: falha ao salvar progresso → `pf-toast--erro` "Não foi possível salvar seu progresso.
  Tentaremos de novo." + nova tentativa automática (troca `alert()`). Sem acesso: `pf-vazio` "Este curso
  não está liberado na sua conta." + [Ver cursos disponíveis].
- **Teclado**: controles do vídeo são os do provedor; sem atalho de letra; Tab percorre topo → coluna →
  palco → rodapé; "Pular para o conteúdo" leva ao palco; `scroll-padding-bottom` = rodapé + 16 px.

### 6.4 Avaliação — dentro do player (`DMC_Avaliacao.montar`)

**Fatia: F2** · `avaliacao.js` · `portal-avaliacao.css` · montado pelo player da F1b (hospedeiro de tela, P1f, D-74).
Estados: **Apresentação → Em andamento → Revisão → Resultado → Gabarito** (só depois de finalizar).

```
1440 · Apresentação                                  390 · Em andamento
MÓDULO 03 · AVALIAÇÃO                                ┌ Questão 3 de 10        42:10 ┐ (fixo)
Atividade *modular*                                  │ ▬▬▬░░░░░  Salvo às 14:32       │
Conta para a nota do módulo. Nota mínima: 7,0.       ├────────────────────────────────┤
┌ Avisos importantes ──────────────────────────┐     │ Enunciado (17 px, 1,6)         │
│ Tentativas  2 de 3 disponíveis               │     │ ( ) A  Texto da alternativa    │ ≥ 56 px
│ Tempo       60 minutos a partir do início    │     │ (•) B  Texto da alternativa    │
│ Questões    10, sorteadas a cada tentativa   │     ├────────────────────────────────┤
│ Correção    objetivas na hora; dissertativas │     │ [‹ Anterior] [Questões] [Próxima ›]
│             pelo professor                   │     └────────────────────────────────┘
│ Gabarito    só depois de finalizar; finalizar│
│             encerra as tentativas            │
└──────────────────────────────────────────────┘
[ Iniciar tentativa 2 de 3 ]   Histórico de tentativas ↓

1440 · Resultado
( donut 160 · 90% )  Tentativa 1 · nota 9,0
                     Você acertou 9 de 10 questões objetivas.
                     Início 12/11/2026 às 14:02 · Fim 12/11/2026 às 14:41 (39 min)
                     ● Aprovado no módulo (nota 9,0; mínima 7,0)
[ Finalizar e ver gabarito ]  [ Melhorar nota ]          Confira sua nota no Acadêmico →
Histórico: Tentativa · Início · Fim · Acertos · Nota · Situação  (pf-tabela)
```

- **Tipos**: Atividade prévia ("Não conta para a nota.") e Atividade modular ("Conta para a nota do
  módulo. Nota mínima: 7,0", com a nota mínima do curso vinda do servidor).
- **Avisos importantes** (`pf-avisos-avaliacao`): `dl` em painel com fio esquerdo 2 px `--pf-acento`.
  Tempo "Livre" ou "N minutos a partir do início"; tentativas "N de M disponíveis"; instruções do
  professor abaixo.
- **Início com tempo**: diálogo "O cronômetro começa ao confirmar e não pausa se você sair da página."
  [Cancelar] [Começar agora].
- **Em andamento**: uma questão por tela; barra de progresso; navegador "Questões" (botões de 44 px,
  estados Respondida / Em branco / Atual em forma e texto; no mobile, diálogo). Objetiva = `fieldset` +
  `legend` (enunciado) + rádios em linhas de ≥ 56 px (a linha inteira clica; letra A–F em 600).
  Dissertativa = a `orientacao` do professor, quando houver, em texto acima do campo (ligada por
  `aria-describedby`) + `textarea` (mín. 8 linhas) com contador pelo `limiteCaracteres` do snapshot da tentativa
  (100–10.000; padrão 4.000): "1.240 de 4.000 caracteres", e "Resposta salva automaticamente"; o campo não aceita
  além do limite e, se o servidor responder 400 `resposta-longa`, o erro aparece no campo (D-53, DC-62 da API).
  **Questão de arquivo (TCC)** — só na avaliação de um módulo do tipo TCC (D-53, DC-66): enunciado, orientação e
  `pf-upload` com [Enviar PDF] (PDF até 4 MB; `POST …/respostas/:questaoId/arquivo`, DC-71); depois do envio, a linha
  "<nome do arquivo> · 1,2 MB · Enviado às 14:32" (`role=status`) e o secundário [Substituir PDF], que troca a
  entrega anterior. Erros no campo: "Arquivo maior que 4 MB." · "Este PDF não pode ser aceito. Gere um novo PDF e
  tente de novo." (415 `pdf-ativo`) · "O tempo acabou. Suas respostas foram enviadas." (409 `tempo-esgotado`). Envio
  e substituição por teclado, sem depender de arrastar. Salvamento a cada resposta e a cada 10 s, indicador "Salvo às
  14:32" (`role=status`).
- **Cronômetro** (`pf-cronometro`, `role="timer"`, sem `aria-live`): mm:ss `tnum`; < 5 min
  `--pf-aviso` + "Restam 4 min"; < 1 min `--pf-erro`. Anúncios em `role=status` aos 10, 5 e 1 minuto.
  Fim do tempo: o servidor finaliza; a tela mostra "O tempo acabou. Suas respostas foram enviadas." Sem
  tempo, o cronômetro não aparece.
- **Revisão**: lista "Questão n · Respondida / Em branco" com link + [Enviar respostas]; confirmação
  "Enviar a tentativa 2? Questões em branco contam como erradas."; envio com `aria-busy`.
- **Resultado** (`pf-resultado`): donut (`pf-donut`), "Você acertou X de Y questões objetivas.", início
  e fim com data e hora e duração, nota da tentativa, situação do módulo: Aprovado · Em recuperação
  ("nota 5,5; você tem mais 1 tentativa") · Reprovado · **Aguardando correção** ("2 questões
  dissertativas aguardam correção do professor. Sua nota sai depois da correção."; com entrega de TCC, "A entrega do
  TCC aguarda correção do professor…"). A correção salva pelo professor como rascunho (`publicar:false`) não aparece
  aqui: o aluno só vê a nota depois de [Publicar correção] (D-53, DC-63).
- **Ações adaptativas**: nota ≥ mínima → primário "Finalizar e ver gabarito"; nota < mínima com
  tentativas → primário "Melhorar nota" e "Finalizar…" secundário; sem tentativas → "Melhorar nota"
  inativo com o motivo ("Você usou as 3 tentativas"). Finalizar pede confirmação com o texto obrigatório
  da API (§6.6.1): título "Finalizar e ver o gabarito?", texto "Ao finalizar, você não poderá fazer novas
  tentativas. Sua nota será a maior obtida até agora (9,0)." + "Abaixo de 7,0, o módulo fica Reprovado."
  quando for o caso; botões [Cancelar] [Finalizar e ver gabarito]. Link "Confira sua nota no Acadêmico" →
  `ResultadoAluno.linkAcademico` (`academico.html?m=<matriculaId>`) + `#modulo-<id>` (D-12).
- **Gabarito** (`pf-gabarito`): por questão, enunciado, "Sua resposta" (glifo + "Correta"/"Incorreta"),
  "Resposta correta" e comentário do professor; dissertativa e entrega de TCC com **pontos e devolutiva** ("7,5 de 10
  pontos" + o texto do professor; a nota por critério sai, D-22, D-53). A `respostaReferencia` nunca aparece ao aluno.
  Nenhum gabarito antes de finalizar (nem pela busca nem pela API).
- **Nova tentativa concedida**: `pf-alerta--info` "Uma nova tentativa foi liberada para você." +
  notificação.
- **Prévia do professor** (`#/avaliacoes/:id/previa`, F2): o mesmo componente com faixa fixa
  "Pré-visualização — nada é registrado · Sortear outra tentativa · Sair".

### 6.5 Acadêmico — `academico.html`

**Fatia: F3a** · `data-shell="academico"` · `academico.js` · `portal-academico.css` · aceita `?m=<matriculaId>`,
`?curso=` e `#modulo-<id>` (D-12).

```
1440
Acadêmico  (H1) · "Notas, frequência e situação de cada matrícula."
[ Enturmação atual | Histórico ]                                        (pf-abas, #atual / #historico)
┌ pf-matricula ───────────────────────────────────────────────────────────────────────────────────┐
│ Arquitetura Patrimonial Estratégica (Newsreader 24)                               ◐ Cursando     │
│ Nº da matrícula   Turma        Nível        Carga total   Início       Situação                  │
│ MAT-2026-000123   APE-2026-1   Curso livre  42 h          03/11/2026   Ativa                     │
│ [ Ocultar desempenho ⌃ ]                                                                         │
│ MÉDIA PARCIAL │ FREQUÊNCIA GERAL │ MÓDULOS │ CARGA HORÁRIA │ EM ANDAMENTO                         │
│ 8,2           │ 76%              │ 11      │ 16 h de 42 h  │ 2 módulos                            │
│ Módulo                    │ CH  │ Média │ Frequência                    │ Faltas │ Situação      │
│ 01 Fundamentos…           │ 4 h │ 9,0   │ 100% · ao vivo 100% · gravado │ 0      │ ● Aprovado    │
│ 03 Planejamento…          │ 4 h │ 5,5   │ 68% · ao vivo 50% · gravado 86%│ 1     │ ▲ Em recuper. │
│ Nota mínima 7,0. A média do módulo é a maior nota da avaliação modular. Frequência = presença ao  │
│ vivo ou conclusão da aula gravada do encontro. Ver comprovantes → · Regulamento acadêmico →      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
390: abas em 2 colunas (48 px) · matrícula: título → marcador → dl em 2 colunas · [Ver desempenho ⌄] ·
KPIs em 2 colunas (o 5º na linha inteira; 1 coluna no nível 2; valor por `cqi`) · tabela empilhada:
  03 Planejamento Sucessório Avançado / ▲ Em recuperação / CH 4 h · Média 5,5 · Faltas 1 /
  Frequência 68% (ao vivo 50% · gravado 86%)
```

- **Cartão da matrícula** (`pf-matricula`, o único card de dados da tela): nº, código da turma ("Sem
  turma: curso gravado"), **nível** (`nivelRotulo` do servidor: Curso livre · Extensão · Aperfeiçoamento;
  "Pós-graduação lato sensu" só com IES parceira cadastrada, seguido de "· ofertado por <IES>", nunca com
  "reconhecido"; nível não definido = "—"), carga total, data de início e status. Matrícula trancada fica
  aqui, com o marcador "Trancada" (D-14). Com uma matrícula ativa, o desempenho já vem aberto; com várias,
  só a primeira (`button[aria-expanded]`; na impressão todas abrem, §12).
- **KPIs**: Média parcial ("—" + "Sem notas ainda"), Frequência geral, Módulos (o "Disciplinas" do
  blueprint), Carga horária ("16 h de 42 h"), Em andamento.
- **Tabela por módulo**: Módulo (nº + nome, âncora `#modulo-<id>`) · CH · Média (vírgula; "—" com "Sem
  avaliação"; "Em correção" quando aguarda o professor) · **Frequência** (geral em 600 + "ao vivo X% ·
  gravado Y%" em 13 px) · Faltas · Situação (Não iniciado · Cursando · Aguardando correção · Em
  recuperação · Aprovado · Reprovado · Concluído). A frequência vem da **fonte única** — o mesmo número
  de Comprovantes.
- **Nota abaixo da tabela**: a nota mínima do curso vem do servidor — `notaMinima` do `ResumoMatricula` (D-80); sem o
  campo, a frase sai sem o número, nunca "7,0" fixo; links de 44 px "Ver
  comprovantes" (`comprovantes.html?curso=<id>`) e "Regulamento acadêmico" (`regulamento.html`, §6.20).
- **Histórico**: matrículas concluídas e canceladas em lista: curso, nº, período, situação final, nota
  final, carga, [Ver certificado] (se emitido) e [Declaração de conclusão] (não aparece em lato sensu, que
  é emitida pela IES). Vazio: "Nenhuma matrícula encerrada."
- Sem matrícula (liberação antiga): "Sua matrícula está sendo registrada pela coordenação. Seu progresso
  continua em Meus cursos." (sem números). Carregando: esqueleto do cartão e de 5 linhas, `aria-busy`.

### 6.6 Aulas ao vivo — `ao-vivo.html`

**Fatia: F3a** · `data-shell="ao-vivo"` · `ao-vivo.js` (o boot legado `DMC_bootAoVivo` vira apelido) ·
`#lives-lista` mantido (R8, `SELETORES_D5`) · `portal-academico.css`.

```
1440
Encontros *ao vivo*  · "Sua presença é registrada quando você entra na sala pelo portal."
[‹] [Hoje] [›]   Semana de 10 a 16 de novembro de 2026  (h2, aria-live)        Curso [Todos ▾]
                                                            [ Hoje | Semana | Mês | Lista ]
┌ SEG 10 ┬ TER 11 ┬ QUA 12 ┬ QUI 13 ┬ SEX 14 ───────┬ SÁB 15 ─────────┬ DOM 16 ┐
│        │        │        │        │ 19:00–22:00   │ 09:00–12:00     │ …       │
│        │        │        │        │ Módulo 03     │ 14:00–17:00 …   │         │
│        │        │        │        │ APE-2026-1    │                 │         │
└────────┴────────┴────────┴────────┴───────────────┴─────────────────┴─────────┘
390 (padrão Lista)
[ Hoje | Semana ] [ Mês | Lista ] (2×2) · Curso [Todos ▾] · [‹] Novembro de 2026 [›]
Sexta, 14 de novembro
  19:00–22:00                          ◉ Ao vivo agora
  Módulo 03 · Holding familiar · Turma APE-2026-1
  [ Entrar na sala ]  (largura total)
  Sua presença é registrada ao entrar.
Mês no mobile: grade de 7 colunas com ponto nos dias com encontro; tocar no dia lista abaixo. A partir de
22em de contêiner, colunas `minmax(2.75rem, 1fr)`; abaixo (320 em qualquer nível, 390 no nível 2),
`repeat(7, minmax(0, 1fr))` ≈ 40 px por coluna, dia com altura de 44 px (exceção registrada, §4.13).
```

- Visões `pf-segmento` Hoje · Semana · Mês · Lista (padrão Semana a partir de 1024, Lista abaixo;
  escolha em `dmc:aoVivo:visao`). ‹ Hoje › muda o período; título do período em `h2` com
  `aria-live="polite"`; filtro por curso em `select` nativo. Calendário por teclado (setas no Mês).
- **Evento** (`pf-encontro`): horário, título, **módulo**, **código da turma**, curso e estado: Agendado
  · Ao vivo agora (anel neutro + texto, §2.3; nunca ouro) · Encerrado · Cancelado · Presença registrada às
  19:04 (sucesso). Em Mês e
  Semana o evento é botão que abre o diálogo do encontro (data e hora, duração, módulo, turma,
  plataforma, descrição, ação, "Baixar convite (.ics)").
- **Entrar** (só na janela, link vindo do servidor): `<a target="_blank" rel="noopener">` "Entrar na
  sala"; o clique dispara o registro de presença com `keepalive` (não depende de pop-up). Depois:
  "Presença registrada às 19:04" em `role=status` e marcador na linha. Falha no registro: a sala abre
  assim mesmo + `pf-alerta--aviso` "Não conseguimos registrar sua presença. Avise o atendimento." com
  link. Fora da janela: "A sala abre às 18:45."
- **Encerrado com gravação vinculada**: "Assistir gravação" → player da aula gravada (conta frequência
  gravada).
- Vazio: "Nenhum encontro ao vivo agendado para os seus cursos." Carregando: esqueleto da grade. Erro:
  `pf-alerta--erro` + Tentar de novo.

### 6.7 Financeiro — `financeiro.html`

**Fatia: F5** · `data-shell="financeiro"` · `financeiro.js` · `portal-financeiro.css` · EXCEÇÃO 1.

```
1440
Financeiro · "Lançamentos registrados pela coordenação do Complexo DMC."
┌ pf-alerta--info ──────────────────────────────────────────────────────────────────────────────┐
│ ◐ O pagamento on-line ainda não está disponível no portal. Para pagar, use a 2ª via de cada    │
│   lançamento ou fale com o atendimento.                                                         │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
TOTAL         │ EM ABERTO      │ PAGO          │ EM ATRASO
R$ 4.990,00   │ R$ 3.992,00    │ R$ 998,00     │ R$ 0,00          (Newsreader, tnum)
8 lançamentos │ 6              │ 2             │ nenhum
[ Todos (8) | Em aberto (6) | Em atraso (0) | Pagos (2) ]
Lançamento            │ Vencimento │ Forma   │ NFS-e    │      Valor │ Situação           │
Parcela 2/10          │ 10/12/2026 │ Boleto  │ —        │  R$ 499,00 │ ○ Em aberto        │ 2ª via
Arquitetura Patrim…   │            │         │          │            │ ▲ Vence em 3 dias  │
Matrícula             │ 03/11/2026 │ Pix     │ 2026/123 │  R$ 499,00 │ ● Pago em 03/11/2026│
Atalhos: Abrir atendimento financeiro → · Seus atendimentos → · Declaração anual de quitação →
390: KPIs 2×2 (1 coluna no nível 2; valor por `cqi`, §4.9) · segmentado 2×2 (48 px) · lançamento empilhado:
  Parcela 2/10 ……… R$ 499,00 / Arquitetura Patrimonial Estratégica / Vence 10/12/2026 · Boleto ·
  ○ Em aberto / NFS-e — / [2ª via] (largura total)
```

- **KPIs**: Total, Em aberto, Pago, Em atraso, somados no servidor (centavos) a partir de lançamentos
  reais; nota com a quantidade. "Em atraso" usa `--pf-erro` só quando > 0. Sem lançamento: KPIs somem e
  entra `pf-vazio` "Nenhum lançamento registrado na sua conta." + "Se você fez um pagamento e ele não
  aparece aqui, fale com o atendimento." [Abrir atendimento].
- **Filtro** `pf-segmento` Todos · Em aberto · Em atraso · Pagos (+ Cancelados quando houver), na URL
  `?status=`.
- **Colunas**: Lançamento (tipo: Matrícula · Parcela n/N · Taxa, com curso e nº da matrícula em 13 px) ·
  Vencimento · Forma (Boleto · Pix · Cartão · Transferência; "—") · **NFS-e** (número ou "—") · Valor
  (direita, `tnum`) · Situação (Em aberto · Vence em N dias (≤ 3, aviso; D-18) · Em atraso · Pago em dd/mm/aaaa
  · Cancelado) · Ação: **2ª via** (link https com ↗ e `rel="noopener"`, ou PDF por download
  autenticado); sem 2ª via: "Pedir 2ª via" (abre atendimento Financeiro já preenchido).
- **Atalhos** (lista de links, sem cards): Abrir atendimento financeiro (`atendimentos.html?novo=1&
  categoria=financeiro`) · Seus atendimentos (`atendimentos.html?categoria=financeiro`, os "Protocolos"
  do blueprint) · Declaração anual de quitação (`certificados.html?tipo=quitacao#solicitar`, F3b).
- "Meus cartões" **não** aparece (EXCEÇÃO 1); nenhum placeholder "em breve".

### 6.8 Documentos pessoais — `documentos.html` (Documentação)

**Fatia: F4b** (D-78) · `data-shell="documentos"` · `documentos.js` · `portal-documentos.css` (classes fora do catálogo
com `pf-doc-`) · `GET /portal/me/documentos` precisa dos cursos do aluno (serviço da F4a): sem ele, 503
`servico-indisponivel` → erro de carga com [Tentar de novo] (§10).

```
1440
Documentos *pessoais* · "Envie os documentos exigidos para a sua matrícula. Só você e a coordenação
têm acesso aos arquivos."        3 de 5 aprovados  ▬▬▬▬▬▬░░░░
┌────┬────────────────────────────────────────────────────┬────────────────┬──────────────────┐
│DOC │ Documento de identificação com foto                 │ ● Aprovado     │ Ver arquivo      │
│    │ RG, CNH ou passaporte. PDF, JPG ou PNG, até 4 MB.   │                │                  │
│DIP │ Diploma de graduação                                │ ▲ Pendente     │ [ Reenviar ]     │
│    │ Motivo: imagem cortada no verso. Envie frente e verso.│              │                  │
│CERT│ Certidão de nascimento ou casamento                  │ ◐ Em revisão   │ Ver arquivo      │
│HIS │ Histórico escolar                                    │ ○ Não enviado  │ [ Enviar ]       │
└────┴────────────────────────────────────────────────────┴────────────────┴──────────────────┘
390: bloco por documento: [DIP] nome / marcador / motivo (pf-alerta--compacto) / [Reenviar] largura total
```

- **Sigla** (`pf-sigla`): quadrado de 48 px, fio `--pf-linha-forte`, Hanken 600 13 px `tnum`
  `--pf-texto-2`. É informativa; o nome do documento é o texto principal. Siglas, nomes, orientação,
  formatos e obrigatoriedade vêm da configuração por curso (DOC, DIP, CERT, HIS, RES e outras).
- **Situação**: Não enviado · Em revisão · Aprovado · Pendente (motivo logo abaixo do nome em
  `pf-alerta--aviso --compacto`, também no nome acessível da linha).
- **Enviar / Reenviar** → diálogo `pf-upload` (§4.11) com aviso "Base legal: execução do contrato de
  matrícula. O arquivo fica guardado pelo prazo da política de retenção." Reenvio vale para Não enviado,
  Pendente e Em revisão; **Aprovado não se reenvia** (texto: "Para trocar um documento aprovado, fale com
  a secretaria.").
- **Ver arquivo**: download autenticado → `DMC_UI.abrirArquivo` (PDF e imagem em nova aba com o tipo refeito no
  cliente; outro tipo baixa, D-47). Nada de link público.
- Vazio: "Nenhum documento exigido no momento." Erros de envio no campo (formato, tamanho, PDF com
  conteúdo ativo: "Este PDF não pode ser aceito. Gere um novo PDF e tente de novo.").

### 6.9 Declarações e certificados — `certificados.html` (Documentação)

**Fatia: F3b** (página, declarações, certificados) · botão de quitação chama o serviço da **F5** ·
`declaracoes.js` · `portal-declaracoes.css` · o boot legado `DMC_bootCertificados` vira apelido · preserva
`#certificados-lista` (R9 e R9b, `SELETORES_D5`).

Três seções na mesma página (âncoras `#certificados`, `#solicitar`, `#historico`; conteúdo curto, lido
de cima a baixo, sem abas):
1. **Certificados**: linha por curso (sem caixa): curso, carga, emitido em, código (`tnum`), hash abreviado
   (`hashPrefixo` da lista, 16 hex em grupos; `null` → "Emitido antes da verificação por selo", DC-65, D-53), [Ver e
   imprimir] e [Copiar link de validação]. Certificados já emitidos continuam válidos. Para os cursos sem
   certificado, a tela lê `GET /api/cursos/:cursoId/certificado` (API §6.7.7: `elegivel`, `regra`, `pendencias[]`,
   `total/concluidas`, `nomePrevisto`, `nomeOrigem`) e nunca escreve regra ou número fixo:
   - **Apto** (`elegivel:true`): primário [Emitir certificado]. Com `nomeOrigem:'conta'` no GET do certificado
     (nome: social por ato da coordenação → registro → conta, DC-64; CPF fora do certificado), o clique abre antes a
     confirmação pedida pela API (D-53, `DMC_UI.confirmar`): "O certificado sairá com o nome «<nomePrevisto>», da sua
     conta. Para que conste o nome de registro, complete o cadastro antes." + [Completar cadastro]
     (`perfil.html#identificacao`, secundário) e [Emitir assim mesmo] (primário, `data-pf-acao="confirmar"`, D-76).
     409 `nao-elegivel` na emissão redesenha a linha com as `pendencias` da resposta. Teste do caminho de tela em
     `portal-declaracoes.spec.js` (R9b); a regressão D5 emite pela API (índice §9.3).
   - **Não apto**: uma frase com a regra, montada com o dado do servidor — regra `aulas`: "Para emitir: concluir 100%
     das aulas disponíveis."; regra `aprovacao`: "Para emitir: concluir 100% das aulas disponíveis e ser aprovado em
     todos os módulos com avaliação (nota mínima <notaMinima>)." (`notaMinima:N` do GET do certificado não emitido,
     acréscimo aditivo da F3b, D-80, formatado "7,0"; sem o campo, o parêntese não aparece — nunca um valor literal).
     Os critérios do curso (frequência, carga, TCC) valem nas duas regras (DC-66). Abaixo, "O que
     falta" (`pf-lista`; cada linha com glifo de aviso sem destaque, o `pendencias[].texto` **literal** do servidor e
     um link de 44 px para a tela que resolve):

     | `tipo` | Link |
     |---|---|
     | `aulas` | "Continuar as aulas" → `aula.html?curso=<id>` (próximo conteúdo não concluído, §6.3) + o progresso "17 de 45 aulas" (`concluidas`/`total`) |
     | `modulo` | "Ver no Acadêmico" → `academico.html?curso=<id>#modulo-<moduloId>` (D-12) |
     | `frequencia` | "Ver comprovantes de frequência" → `comprovantes.html?curso=<id>&tipo=frequencia` (§6.11) |
     | `tcc` com `moduloId` | "Ver no Acadêmico" → `#modulo-<moduloId>` do módulo de TCC |
     | `tcc` sem `moduloId` e `carga` (configuração do curso, não do aluno) | "Falar com o atendimento" → `atendimentos.html?novo=1&categoria=academico&curso=<id>` |

     `certificado-pela-ies` (lato sensu): sem lista e sem botão, só o texto do servidor ("Neste curso, o certificado é
     emitido pela instituição parceira."). `elegivel:false` **sem** pendências: marcador neutro "Ainda não apurado",
     sem botão. Teste em `portal-declaracoes.spec.js`: curso com frequência mínima de 75% e aluno com 60% mostra a
     pendência de frequência com o link para Comprovantes, nenhum [Emitir certificado] e nenhum "7,0" que não venha do
     curso.
2. **Solicitar declaração** (formulário curto): Tipo (`select`: Declaração de matrícula · Declaração de
   frequência · Declaração de conclusão · Declaração financeira anual (quitação)) → Curso ou Ano (o campo
   muda pelo tipo e só lista opções elegíveis; tipo sem elegibilidade mostra o motivo em texto, ex.:
   "Disponível quando houver pagamento registrado no ano.") → [Solicitar declaração]. Geração imediata;
   não elegível responde com o motivo do servidor (409 `nao-elegivel`), sem fluxo de análise (D-15). Em
   lato sensu, "Declaração de conclusão" não aparece (emitida pela IES). Na quitação, os anos vêm de
   `quitacao[]` (`disponivel`, `motivo`); com 409 `dados-da-instituicao-pendentes` a tela mostra, sem culpar o
   aluno: "A declaração anual está indisponível no momento: a coordenação ainda não cadastrou os dados da
   instituição." + link "Avisar o atendimento" (`atendimentos.html?novo=1&categoria=financeiro`).
3. **Histórico de solicitações** (`pf-tabela`): Solicitada em · Tipo · Referência (curso ou ano) · Código
   de validação · Situação (Emitida · Revogada; D-15) · Ações ([Abrir], [Copiar link]).
- Documento: `declaracao.html?id=<id>` (D-13; o código vai para `validar.html?codigo=`, §8.3). Vazio de
  certificados: "Nenhum certificado emitido ainda."

### 6.10 Contratos — `contratos.html` e `contrato.html` (Documentação)

**Fatia: F4b** (D-78) · `data-shell="contratos"` · `contratos.js`, `contrato.js` (+ `qr.js` no comprovante) ·
`portal-documentos.css` (classes fora do catálogo com `pf-doc-`). O número da matrícula vem da F4a (o contrato é
anexado à matrícula pelo serviço `secretaria.vincularContrato`, D-78).

- **Lista**: `pf-segmento` Pendentes (n) · Assinados · Cancelados · Todos. Linha: título, **nº da
  matrícula**, curso, data (disponibilizado em / assinado em), marcador (Pendente · Assinado ·
  Cancelado), ações [Visualizar] e, se pendente, primário [Assinar]; assinado tem [Comprovante de
  assinatura]. Vazio: "Nenhum contrato disponível para você."
- **Visualizar e assinar** (`contrato.html?id=`): cabeçalho (título, matrícula, disponibilizado em) →
  **Documento**: [Abrir contrato (PDF)] (`DMC_UI.abrirArquivo`: blob autenticado em nova aba, tipo refeito no
  cliente, D-47; a CSP não permite embutir) e o
  **SHA-256** completo com [Copiar] → **Assinatura eletrônica** (`pf-assinatura`, 4 passos visíveis):
  1. "Abra e leia o contrato." — o passo 2 só habilita depois de abrir (o texto explica por quê);
  2. texto de aceite **literal** do servidor em `pf-leitura` + caixa "Li e concordo com os termos deste
     contrato";
  3. "Confirme sua senha" (`current-password`; com 2FA ativo, também "Código do aplicativo", 6 dígitos,
     `one-time-code`);
  4. [Assinar contrato] → diálogo do que será registrado: "seu nome, a data e a hora (horário de
     Brasília), o endereço de rede da conexão, a identificação do navegador e o código do documento
     (SHA-256)". [Cancelar] [Assinar].
- **Sucesso**: marcador Assinado + "Assinado em 12/11/2026 às 14:05 · Código de verificação
  CTR-XXXX-XXXX-XXXX" + [Comprovante de assinatura] (documento imprimível com evidências e QR, §8.4) + link de
  validação pública (`validar.html?codigo=`). A senha e o código digitados no passo 3 nunca vão a rascunho (D-47).
- **Erros** (do servidor, texto da tela): "Abra o contrato antes de assinar." · "O documento mudou desde
  que foi aberto. Abra novamente." · "Senha incorreta." (no campo) · "Código inválido." (no campo) ·
  "Complete seu cadastro antes de assinar: nome de registro e CPF ou passaporte." + [Completar cadastro]
  → `perfil.html#identificacao` · "Este contrato não está mais pendente." · 409 `reautenticacao-necessaria`:
  a mensagem do servidor ("Por segurança, a assinatura fica disponível 72 horas depois de a coordenação redefinir o
  seu acesso…") em `pf-alerta--info` acima do passo 4, com o link "Falar com o atendimento".
- A faixa de pendência (§5.2) some quando não há contrato pendente. Provedor externo (EXCEÇÃO 3): o
  mesmo layout de lista, com "Assinar" levando ao fluxo do provedor quando existir.

### 6.11 Comprovantes — `comprovantes.html` (Documentação)

**Fatia: F3a** · `comprovantes.js` (sem `qr.js`: não há QR nesta tela, D-72) · `portal-academico.css`.

```
1440
Comprovantes · "Registro das suas avaliações e da sua frequência, com código verificável."
Curso [Arquitetura… ▾]  [ Tudo | Avaliações | Frequência ]  De [__/__/____] Até [__/__/____]
                                                                       [ Imprimir comprovantes ]
Data e hora       │ Tipo               │ Descrição                          │ Resultado     │ Código · hash
14/11/2026 19:04  │ Frequência ao vivo │ Encontro Sexta · noite · Módulo 03 │ Presente      │ FRQ-7K2M-… · 9f3a…c21e ⧉ ✓
12/11/2026 14:41  │ Avaliação          │ Módulo 03 · Atividade modular · T1 │ 90% de acerto │ AVL-Q4HD-… · 41bd…7a02 ⧉ ✓
10/11/2026 21:12  │ Frequência gravada │ APE-M03-A01 concluída              │ Concluída     │ …
Horário de Brasília. ⧉ copiar código · ✓ verificar (abre validar.html?codigo= com o código FRQ/AVL da linha)
390: linhas empilhadas (data e hora → tipo + resultado → descrição → código e hash com Copiar e Verificar)
```

- Fonte: Frequência (fonte única) e tentativas corrigidas; os mesmos números do Acadêmico. Tentativa
  aguardando correção aparece como "Aguardando correção", sem código.
- Filtros na URL (`?curso=&tipo=avaliacoes|frequencia&de=&ate=`), para que o Acadêmico e as pendências do certificado
  (§6.9) abram a tela já filtrada.
- Registro anulado pela equipe: "Registro anulado em dd/mm/aaaa" (neutro), mantido na trilha.
- **Imprimir comprovantes**: versão em papel com cabeçalho (nome de registro, matrícula, curso, período
  filtrado, data e hora de emissão) e tabela completa em que **cada linha leva o próprio código (`FRQ-…` ou `AVL-…`)
  e o hash abreviado**; o rodapé traz a URL de `validar.html` (`urlValidacao` da resposta). **Não há QR** nesta
  impressão: não existe código do conjunto que um QR pudesse levar (D-16, D-72). A conferência é
  digitar o código de uma linha em `validar.html` (homologação: uma linha FRQ e uma AVL, índice §9.9).
- Vazio: "Nenhum registro no período." Carregando: esqueleto de 6 linhas.

### 6.12 Atendimento — `assistente.html`, `atendimentos.html`, `ouvidoria.html`

**Fatia: F6a** (`atendimentos.html`, `ouvidoria.html` · `atendimentos.js`, `ouvidoria.js` · `portal-atendimento.css`)
· **F6b** (`assistente.html` · `assistente.js` · `portal-assistente.css`) · `data-shell="atendimento"` nas três.
Subnavegação local `pf-subnav` igual nas três (`<nav class="pf-subnav" aria-label="Atendimento">`):
**Assistente · Seus atendimentos · Ouvidoria**, com o **markup fixo do índice §7.10** (estático no HTML, funciona sem
JS, `aria-current="page"` só no link da página atual) e o CSS `pf-subnav` do catálogo, em `portal.css` (F0s). Nem
`portal-atendimento.css` nem `portal-assistente.css` estilizam a subnavegação (D-65); mudar o markup = pedido às duas
fatias via principal.

**Assistente** (`assistente.html`)

```
1440
┌ Conversas (18rem) ────────┬ Assistente acadêmico · Em fase de testes ─────── [ Falar com a equipe ] ┐
│ [ + Nova conversa ]       │ Olá, Daniel.  (Newsreader 28)                                           │
│ HOJE                      │ Posso ajudar com seus cursos, notas, frequência, documentos e prazos.   │
│ ▌Minhas notas do módulo 3 │ [Como está meu desempenho?] [Estou em risco de reprovação?]             │
│ ESTA SEMANA               │ [Quais documentos estão pendentes?] [Quais são meus prazos?]            │
│  Documentos pendentes     │            ┌ pergunta do aluno (painel-2, à direita) ┐                  │
│                           │ ┃ resposta (sem caixa, fio esquerdo)                                    │
│                           │ ┃ Fontes: Regulamento acadêmico, seção 4                                │
│                           │ ┃ Abrir Acadêmico →                                                     │
│ Apagar todo o histórico   │ [ Escreva sua pergunta…                                       Enviar ]  │
│                           │ Respostas geradas por IA podem conter imprecisões. Confira no Acadêmico │
│                           │ ou com a equipe. O assistente não presta orientação jurídica.           │
└───────────────────────────┴─────────────────────────────────────────────────────────────────────────┘
390: cabeçalho do chat com [Conversas] (diálogo com a lista) e [Equipe]; sugestões quebram linha;
compositor fixo no rodapé (+ safe-area); mensagens em largura total.
```

- **Consentimento antes do 1º uso** (`pf-consentimento`, DC-39; aparece quando `estado.consentimento.necessario`
  e bloqueia o compositor): título "Antes de começar" (a única frase própria da tela) → o texto
  `estado.consentimento.texto` de `GET /portal/me/ia/estado` renderizado **literal**, como texto (parágrafos por
  quebra de linha; nada de HTML, resumo, corte ou "ler mais"), em `pf-leitura` → "Versão
  `estado.consentimento.versaoTexto` do texto" (13 px `--pf-texto-3`) → link "Política de privacidade" →
  [Concordo e quero usar] (primário) · [Agora não, falar com a equipe] (secundário, abre o diálogo "Falar com a
  equipe" sem conversa). Concordar envia `POST /portal/me/ia/consentimento { aceito:true, versaoTexto, textoSha256 }`
  com a versão que estava na tela e o SHA-256 do texto exibido (calculado no navegador por `crypto.subtle.digest`
  sobre o mesmo `texto` renderizado; D-54 g); 201 → o bloco some e entram saudação e sugestões; 409 `conflito-versao`
  (os prazos do texto mudaram entre a exibição e o aceite) → a tela relê `GET /portal/me/ia/estado`, troca o texto,
  põe o foco no bloco e mostra "O texto da autorização foi atualizado. Leia a versão atual antes de concordar."; nada
  é aceito sem novo clique; outro erro (inclusive 503 `servico-indisponivel`) → `pf-alerta--erro` no bloco,
  o texto continua visível. Se uma mensagem voltar 428 `consentimento-necessario` (consentimento retirado em outra
  aba), o compositor guarda o texto digitado, o bloco reaparece com o texto novo de `estado` e, depois do aceite, a
  mensagem é reenviada pelo aluno ([Enviar]). Nenhum texto de consentimento fica fixo no HTML ou no JS da página.
  Revogável em Meus dados (§6.16).
- **Saudação** "Olá, <nome social ou primeiro nome>." e **4 perguntas sugeridas** (botões secundários de
  44 px): desempenho, risco de reprovação, documentos pendentes, prazos. Somem após a 1ª mensagem; voltam
  em "Nova conversa".
- **Mensagens** (`pf-chat`, `role="log" aria-live="polite"`): pergunta à direita em `--pf-painel-2`,
  raio 4, máx. 36rem; resposta sem caixa, fio esquerdo 2 px `--pf-linha-forte`, rótulo "Assistente" 13 px,
  texto como **texto** (parágrafos e listas simples; nunca HTML), links de ação para telas do portal,
  "Fontes" quando veio do regulamento: cada item de `fontes[]` (`{ trechoId, titulo, regulamentoId }`; o
  `regulamentoId` é acréscimo da F6b, D-81) é um link de 44 px com o `titulo` do trecho para
  `regulamento.html#r-<regulamentoId>-<trechoId>` (§6.20), para o aluno conferir a regra no texto publicado. **Fonte de
  edição arquivada fica só com o título, sem link** (D-81; cada edição publicada tem o próprio `regulamentoId`, e a
  leitura do aluno só traz as publicadas): na primeira resposta com fontes exibida na página, o `assistente.js` lê uma
  vez `GET /portal/regulamento` (a mesma rota da §6.20, fora do caminho de carga da página) e só faz link para os
  `regulamentoId` que estão nela; se essa leitura falhar, o link segue para a página, que trata a âncora que não
  existe mais (§6.20). Fonte sem `regulamentoId` (resposta anterior ao acréscimo): só o título. "Assistente
  escrevendo…" em `role=status`, sem animação de digitação.
- **Compositor**: `textarea` 1–6 linhas, limite de `estado.limites.caracteresPorMensagem` caracteres (padrão
  2.000; L12 fechada, D-50; o servidor valida) com contador perto do fim; Enter
  envia, Shift+Enter quebra linha (dica em `aria-describedby`); [Enviar] 44 px inativo durante a resposta.
  Aviso de imprecisão permanente embaixo (13 px `--pf-texto-3`).
- **Histórico lateral**: Hoje · Esta semana · Anteriores; título da 1ª pergunta; atual com fio ouro;
  "⋯" por conversa com [Apagar conversa] (confirmação); [Apagar todo o histórico] (confirmação).
- **Falar com a equipe** (secundário no cabeçalho, sempre visível; `pf-dialogo--m`):
  - Ao abrir a partir de uma conversa, o diálogo chama `GET /portal/me/ia/conversas/:id/escalonamento` (extrativo,
    sem nova chamada ao Google; esqueleto nos campos enquanto carrega) e preenche **Categoria** com
    `categoriaSugerida` (Acadêmico · Secretaria · Financeiro · Acesso e tecnologia; Privacidade fica fora, ver
    abaixo) e **Resumo** com `resumoSugerido` (editável, 10–4.000, contador). Campos: Categoria · Curso relacionado
    (opcional; aparece em Acadêmico) · Assunto (5–140) · Resumo. Sem conversa (consentimento recusado, estado
    indisponível ou conversa nova ainda vazia) não há escalonamento nem caixa de anexo: o botão abre o diálogo
    "Iniciar atendimento" de Seus atendimentos (`POST /portal/me/atendimentos`, origem direta).
  - Linha "Quem atende" (texto, não estado): "Coordenação" quando `filaPrevista === 'coordenacao'`; "Professores
    do curso" quando `'professores_do_curso'`. Trocar a categoria ou o curso pede de novo a prévia
    (`GET …/escalonamento?categoria=&cursoId=`, D-54 a: o servidor recalcula `filaPrevista`, `omitiriaMensagens` e o
    resumo sugerido para a escolha); "Quem atende" e o aviso de omissão acompanham a resposta. O campo Resumo só é
    trocado pelo novo `resumoSugerido` se o aluno ainda não o editou (o texto digitado nunca é sobrescrito). A
    categoria Privacidade não está no `select` (a API responde 400 a `privacidade`; ver o último item).
  - Caixa **"Anexar esta conversa ao atendimento"** (`pf-check`), **desmarcada** por padrão (minimização; a API
    também nasce `incluirConversa:false`), com a ajuda "A equipe que atender verá esta conversa." Marcada e com
    fila de professores e `omitiriaMensagens > 0`: `pf-alerta--info --compacto` "N perguntas sobre documentos,
    contratos ou financeiro (e as respostas) não serão anexadas. Elas continuam na sua conversa." (a API conta
    pares pergunta + resposta). `incluirConversa:true` só vai no corpo quando a caixa está marcada.
  - [Abrir atendimento] → `POST …/escalar` → "Atendimento ATD-2026-000123 aberto. A equipe responde por aqui e
    você recebe uma notificação." + [Ver atendimento] (`atendimentos.html?protocolo=`, D-13); com `anexo` não
    nulo, a confirmação acrescenta "A conversa foi anexada." (e, com `anexo.omitidas > 0`, "Os trechos sobre
    documentos, contratos ou financeiro ficaram de fora."). 409 `ja-escalada`:
    "Esta conversa já virou o atendimento ATD-…" + [Ver atendimento].
  - Pedido sobre os próprios dados pessoais não sai daqui: a ajuda do diálogo diz "Para pedidos sobre seus dados
    pessoais, use Meus dados." (exige `pedidoTitular`).
- **Estados honestos** (por `estado.motivo`): desligado, sem chave ou chave ilegível — "O assistente não está
  disponível no momento." + [Iniciar atendimento com a equipe] (sem compositor); `teto-global` — "O assistente
  atingiu o limite de uso de hoje. Tente amanhã ou fale com a equipe."; `sem-curso` — "O assistente atende alunos
  com curso liberado ou matrícula ativa." + [Iniciar atendimento com a equipe]; erro ou tempo esgotado — "Não consegui responder
  agora. Tente de novo ou fale com a equipe." [Tentar de novo]; limite — "Você atingiu o limite de mensagens
  por hora. Tente de novo às 15:20 ou fale com a equipe."; recusa (tema fora ou pedido jurídico
  individual) — a resposta do servidor + o atalho para a equipe.

**Seus atendimentos** (`atendimentos.html`)
- Cabeçalho com primário [Iniciar atendimento]. Filtros: `pf-segmento` Todos · Abertos · Respondidos ·
  Encerrados; campo "Buscar por protocolo ou assunto"; `select` Categoria; `select` Origem (Todas ·
  Assistente · Direto), que é o `?origem=ia|humano` da API. O pedido da loja é um atendimento `origem:'humano'` da
  categoria Financeiro com o assunto "Pedido de matrícula" (D-79): não tem filtro próprio para o aluno.
- Tabela: Protocolo (`ATD-AAAA-XXXXXX`, `tnum`) · Assunto · Categoria · Aberto em · Última atualização ·
  Situação (Aberto · Respondido · Encerrado); quando a equipe respondeu (`aguardando:'aluno'`), o texto
  "Aguardando você" ao lado da situação; em `privacidade`, a coluna Prazo mostra "Resposta até dd/mm/aaaa"
  (`prazoRespostaEm`, calculado pelo servidor).
- **Conversa** (`atendimentos.html?protocolo=<ATD>`, D-13): cabeçalho (protocolo, assunto, situação,
  aberto em; em `privacidade`, tipo de pedido e "Prazo de resposta: até dd/mm/aaaa") + `pf-linha-tempo`
  (autor "Você" / "Equipe Complexo DMC" + data e hora) + [Responder] (se não encerrado) + [Encerrar
  atendimento] (confirmação). Encerrado é final: aparece [Iniciar novo atendimento] (D-19). Conversa vinda
  do assistente aparece como anexo recolhível. Atendimento aberto por **pedido de curso** (§6.19; `pedido` não nulo
  em `GET /portal/me/atendimentos/:protocolo`, D-79): acima da linha do tempo, o bloco **Pedido** (`pf-lista`, sem
  caixa) com cada curso (`pedido.itens[].titulo`), o valor registrado no pedido (`valorCentavos`) e o total
  (`totalCentavos`), todos congelados pelo servidor no momento do pedido; valor ausente (`null`) = "a confirmar pela
  coordenação", e total `null` idem, nunca R$ 0,00; e a frase fixa "A coordenação responde aqui com as formas de
  pagamento e libera o acesso depois da confirmação." Matrícula, lançamentos e acesso por curso não aparecem no bloco
  nesta rodada (D-79): chegam ao aluno pela resposta da coordenação, pelas notificações e pelas telas Acadêmico e
  Financeiro.
- **Iniciar** (diálogo; `?novo=1&categoria=&curso=` pré-preenche): Categoria (Acadêmico · Secretaria · Financeiro
  · Acesso e tecnologia · Privacidade e dados pessoais), Curso relacionado (opcional), Assunto, Mensagem
  (10–4.000). Com **Privacidade e dados pessoais**, aparece o `select` obrigatório "Tipo de pedido" (Acesso
  aos meus dados · Correção · Eliminação · Informação sobre compartilhamento · Revogação de consentimento ·
  Outro) e a ajuda "A coordenação responde em até 15 dias." → "Atendimento ATD-… aberto. Resposta até
  dd/mm/aaaa." (data do servidor).
- Vazio: "Você ainda não abriu nenhum atendimento." + [Iniciar atendimento].

**Ouvidoria** (`ouvidoria.html`)
- Texto: "Canal para elogios, sugestões, reclamações e denúncias sobre a plataforma, os cursos e o
  atendimento. A coordenação responde por aqui."
- **Registrar manifestação**: Tipo em `fieldset` de rádios grandes (4 linhas de 56 px, uma frase cada):
  Elogio · Sugestão · Reclamação · Denúncia → Assunto (5–140), Mensagem (20–6.000, contador), Curso relacionado
  (opcional; quem quiser citar uma pessoa a cita no texto, D-27). **Aviso fixo, igual nos 4 tipos** (`pf-alerta--info`
  sem título, logo acima do botão; não depende do tipo escolhido): "Sua identidade nunca é mostrada a professores.
  A coordenação vê quem escreveu para poder responder; o próprio texto pode identificar você." Não existe caixa de
  "resguardar identidade" (DC-40: a API ignora o campo e saneia a visão do professor sempre). Na Denúncia, a frase
  do rádio é "Apurada só pela coordenação; não é encaminhada a professores." → [Registrar manifestação] →
  protocolo `OUV-AAAA-XXXXXX`.
- **Minhas manifestações**: Protocolo · Tipo · Assunto · Data · Situação (Aberto · Respondido ·
  Encerrado) → detalhe com a resposta. Vazio: "Nenhuma manifestação registrada."

### 6.13 Publicações — `publicacoes.html` e `publicacao.html`

**Fatia: F7** · `data-shell="publicacoes"` · `publicacoes.js`, `publicacao.js` (+ `DMC_Video` da F1b) ·
`portal-comunicacao.css`.

- Filtros: `pf-segmento` Todas · Vídeos · Textos · Links · PDFs + `select` Curso.
- Grade de **cards de mídia** (`pf-publicacao`; o card se justifica): 3 colunas (1440, 1024), 2 (768), 1
  (390). Miniatura 16:9 (`pf-publicacao__midia`, escopo escuro): vídeo do YouTube usa a imagem de
  `i.ytimg.com` (única origem de imagem externa na CSP); Vimeo, texto, link e PDF usam a capa tipográfica
  com o tipo em overline (D-36); ícone de play 48 px sobre `--hero-veil` + título (Hanken 600 17 px, 2 linhas) + autor
  ("Ana Lima · Professora" ou "Coordenação"), data e curso em 13 px (sem chip) + "Nova" (ponto
  `--pf-texto-1` e texto) quando não vista. O card inteiro é o link; o título é o nome acessível.
- **Detalhe** (`publicacao.html?id=`): título, autor, data, público; conteúdo por tipo: vídeo (embed
  seguro), texto (máx. 46rem), link externo ([Abrir link ↗] + domínio visível), PDF ([Baixar PDF],
  autenticado).
- Vazio: "Nenhuma publicação para você ainda."

### 6.14 Notificações — `notificacoes.html`

**Fatia: F0p** (tela; rotas da F0t) · `notificacoes.js` (o mesmo módulo monta `#/notificacoes` no backoffice).

- `pf-segmento` Todas · Não lidas + [Marcar todas como lidas]. Lista agrupada Hoje · Ontem · Esta semana
  · Anteriores. Linha (`pf-notificacao`): ícone do tipo, título (600 + ponto se não lida, "não lida"
  oculto), descrição, `<time>`, botão de ícone 44 px "Marcar como lida". Clicar abre o destino e marca.
- Textos-padrão (gerados pelo servidor): "O professor respondeu sua dúvida em <aula>" · "Nova resposta no
  atendimento ATD-…" · "Seu <documento> foi aprovado" / "…precisa ser reenviado" · "Contrato disponível
  para assinatura" · "Parcela 3/10 vence em 10/12/2026" · "Sua avaliação do Módulo 03 foi corrigida" ·
  "Nova publicação: <título>" · "Aula ao vivo hoje às 19:00".
- `pf-mais` "Carregar mais". Vazio: "Nenhuma notificação."

### 6.15 Perfil — `perfil.html`

**Fatia: F0p** (front) · F0t (API, inclusive os textos v1 de consentimento) · `perfil.js` (+ `qr.js` no 2FA) ·
`portal.css`.

```
1440
Meu *perfil* · "Seus dados cadastrais. Alterações ficam registradas com data e hora."
Cadastro 80% completo — faltam: Celular, CEP.                                    (pf-alerta--info)
┌ Seções (sticky, 14rem) ┬ Formulário (máx. 46rem) ──────────────────────────────────────────────┐
│ ▌Identificação         │ IDENTIFICAÇÃO                         Quem vê: você e a coordenação   │
│  Documentos            │ Base legal: execução do contrato de matrícula.                        │
│  Dados pessoais        │ Nome de registro *        [___________________________]  (cadeado)    │
│  Contato e redes       │ Nome social               [___________________________]               │
│  Endereço              │   Se preenchido, é o nome usado no portal e na comunicação com você.  │
│  Foto                  │ CPF *  [___.___.___-__]   ☐ Sou estrangeiro(a) sem CPF                │
│  Senha e segurança     │ Data de nascimento * [__/__/____]                                     │
│  Preferências          │ Nacionalidade * [Brasileira]   Naturalidade [Cidade] [UF ▾]           │
│  Meus dados →          │                                          [ Salvar identificação ]     │
└────────────────────────┴────────────────────────────────────────────────────────────────────────┘
390: "Seções" vira <details> no topo com as âncoras; 1 coluna; salvar de cada seção em largura total.
```

Cada seção é um `<form>` com salvar próprio (auditoria por seção; "Identificação salva." em
`role=status`). Cabeçalho de cada seção: título (overline), "Quem vê" e "Base legal".

| Seção | Campos (rótulo; * obrigatório para cadastro completo) | Base legal | Quem vê | UX |
|---|---|---|---|---|
| Identificação | Nome de registro*, Nome social, CPF* (ou Passaporte* + País emissor* para estrangeiro sem CPF), Data de nascimento*, Nacionalidade*, Naturalidade (cidade, UF, país) | contrato (nome social: consentimento registrado, `perfil_nome_social`) | você e a coordenação; professor vê nome social (ou nome), foto e e-mail | CPF com máscara, `inputmode="numeric"`, validação dos dígitos ao sair ("CPF inválido. Confira os números."); CPF de outra conta: "Este CPF já está vinculado a outra conta. Fale com a secretaria."; nome de registro, CPF, nascimento e passaporte **travados** após contrato assinado ou certificado emitido; **nome social com `pf-consentimento`** logo abaixo do campo (regra "Consentimentos no Perfil", abaixo) |
| Documentos | RG: número, órgão emissor, UF, data de expedição | contrato | você e a coordenação | seção opcional: "Necessário quando o seu curso ou contrato exigir." |
| Dados pessoais | Estado civil (opcional); **Gênero** (opcional): Feminino · Masculino · Não binário · Outro · Prefiro não informar; **Etnia/cor** (opcional, IBGE): Branca · Preta · Parda · Amarela · Indígena · Prefiro não informar | estado civil: contrato; gênero e etnia: **consentimento específico** | estado civil: você e a coordenação; gênero e etnia: **só você** (estatística agregada) | gênero e etnia em `fieldset` próprio, cada um com o seu `pf-consentimento` (textos `textosConsentimento.perfil_genero` e `perfil_etnia`, literais; o v1 trata de estatísticas agregadas de diversidade, nunca de decisão sobre você nem de exibição individual à equipe); escolher valor diferente de "Prefiro não informar" pede a caixa de consentimento; "Retirar autorização e apagar" quando houver valor |
| Contato e redes | Celular* (`tel`), E-mail* (somente leitura + [Alterar e-mail] com senha → link de confirmação ao novo endereço; sem e-mail configurado: "Para alterar o e-mail, peça à secretaria."), Instagram (@usuário), Facebook (usuário ou endereço) | contrato; redes: consentimento registrado (`perfil_redes`) | celular: você e a coordenação; e-mail também o professor; redes: você e a coordenação (nunca professores nem outros alunos) | prefixo visual "@"; validação leve; **um `pf-consentimento` para as duas redes**, abaixo de Facebook |
| Endereço | País (Brasil), CEP*, Logradouro*, Número*, Complemento, Bairro*, Cidade*, UF* | contrato e obrigação legal | você e a coordenação | CEP com 8 dígitos consulta **no servidor** (`aria-busy` no grupo, "Buscando endereço…" em `role=status`); sucesso preenche e põe o foco em Número ("Endereço preenchido pelo CEP. Confira e complete."); falha: "Não encontramos o CEP. Preencha o endereço."; campos nunca travam; fora do Brasil: "Código postal" sem consulta |
| Foto | foto atual (96 px, círculo), autorização (`pf-consentimento` com o texto `perfil_foto` e [Concordo]) **antes** de [Enviar foto] (JPG, PNG ou WebP até 2 MB), [Remover foto] | consentimento registrado antes do envio (`perfil_foto`) | você, coordenação e professores das suas turmas | sem autorização vigente, [Enviar foto] não aparece; prévia antes de salvar, recorte central quadrado, erro de tipo ou tamanho no campo; detalhes abaixo |
| Senha e segurança | Trocar senha (atual, nova, confirmar; regra mostrada antes; [Mostrar senha]); Verificação em duas etapas: situação, [Ativar] → QR gerado localmente + chave em texto + código de 6 dígitos + códigos de recuperação ([Baixar] / [Imprimir]); [Desativar] com senha; [Sair dos outros aparelhos] | contrato e segurança | só você | o bloco de verificação em duas etapas só aparece quando `DMC_Auth.recursos().doisFatores` é verdadeiro ou a conta já tem o 2FA ativo (`user().doisFatoresAtivo`, para poder desativar): o servidor só liga o 2FA (`PORTAL_2FA=1`) depois do aceite do login da 2d (índice §9.9 item 1a, D-71); até lá o bloco não aparece, sem "em breve". Sem e-mail configurado: "Recuperação de senha por e-mail indisponível. Guarde seus códigos de recuperação." (a segunda frase só com 2FA ativo). Troca obrigatória (senha temporária): ver "Modo restrito" abaixo da tabela. Senha e código nunca vão a rascunho (D-47) |
| Preferências | Tema (Automático · Claro · Escuro), Tamanho do texto (4 níveis com prévia), [Rever o tour do portal] | fica só neste navegador (`localStorage`; nada vai ao servidor nesta rodada, D-17) | só você | aplica na hora e anuncia "Preferência aplicada neste navegador." |

Legenda "Campos com * são obrigatórios." no topo; erro no campo com texto e glifo; resumo de erros com
foco; `autocomplete` correto (`name`, `bday`, `tel`, `email`, `postal-code`, `address-line1`,
`current-password`, `new-password`, `one-time-code`).

**Consentimentos no Perfil** (DC-39; API §6.3.1, DC-48). Nome social, redes (Instagram e Facebook juntos), foto,
gênero e etnia só são gravados com autorização registrada (pelos serviços `consentimentos.*` da F0t, únicos
escritores, API DC-72). Os textos v1 são literais do servidor (`server/src/portal/consentimentos-textos.js`, F0t); os
de gênero e etnia estão fixados no índice D-55, com revisão jurídica pendente (P3). O componente é
`DMC_UI.consentimento` (F0b, D-57) com o CSS `pf-consentimento` (F0s). Os textos e o estado vêm de `GET /portal/me/perfil`
(`textosConsentimento.<finalidade>` = `{ versaoTexto, texto }`; `consentimentos.{ nomeSocial, redes, foto, genero,
etnia }`). Um `pf-consentimento` por finalidade, sempre com o texto **literal** do servidor em `pf-leitura`:
- **Já autorizado** (registro vigente): no lugar da caixa, a linha "Autorizado em dd/mm/aaaa · versão v1" +
  link "Retirar autorização e apagar" (confirmação com o efeito: "O <dado> é apagado agora."; chama
  `POST /portal/me/dados/consentimentos/:finalidade/revogar`; sucesso limpa o campo e anuncia em `role=status`).
- **Nome social e redes, sem autorização vigente**: o bloco aparece quando o campo ganha valor (vazio, não aparece
  e nada é pedido); traz o texto e a caixa `pf-check` "Concordo com este uso" (`required` enquanto o campo tiver
  valor). Ao salvar a seção, o MESMO `PUT /portal/me/perfil` leva `consentimentos.nomeSocial` ou
  `consentimentos.redes` = `{ aceito:true, versaoTexto }` (a versão exibida). Caixa desmarcada com valor = erro no
  campo, sem ir ao servidor: "Para salvar o nome social, marque a autorização." / "…os perfis de redes sociais…".
  Apagar o valor do campo não retira a autorização (isso é o link acima ou Meus dados).
- **Foto**: sem autorização vigente, a seção mostra o texto `perfil_foto` e o botão [Concordo] (secundário), que
  chama `POST /portal/me/dados/consentimentos { finalidade:'perfil_foto', aceito:true, versaoTexto }`; 201 troca o
  bloco pela linha "Autorizado em …" e aí aparece [Enviar foto] (o seletor de arquivo precisa do clique do próprio
  aluno, por isso o aceite vem antes e não no meio do envio).
- **428 `consentimento-necessario`** (autorização retirada em outra aba, ou versão do texto mudou): a tela não
  perde o que foi digitado nem a foto escolhida; reabre o `pf-consentimento` da `finalidade` devolvida com o texto
  atual (novo `GET /portal/me/perfil`), põe o foco nele e mostra "Confirme a autorização para salvar." Na foto, o
  botão vira [Concordo e enviar], que registra o aceite e reenvia o mesmo arquivo.
- **Gênero e etnia**: mesma regra, um bloco para cada um, só quando o valor escolhido não é "Prefiro não informar";
  o aceite vai no mesmo PUT (`consentimentos.genero`/`consentimentos.etnia`).

**Modo restrito — "Crie uma senha pessoal para continuar"** (`user().precisaTrocarSenha === true`, §5):
`perfil.html` não monta as seções, nem o índice lateral, nem chama `GET /portal/me/perfil`,
`GET /api/auth/2fa` ou `/portal/configuracoes/publicas` (todas dariam 403 `troca-de-senha-obrigatoria`).
Desenha só um bloco, em coluna de 28rem: título "Crie uma senha pessoal para continuar", texto "Você entrou
com uma senha temporária criada pela coordenação. Defina agora a sua senha pessoal." e o formulário Senha
temporária (`current-password`) · Nova senha (`new-password`, regra visível antes: 8 a 72 caracteres,
diferente do e-mail e do CPF) · Confirmar nova senha · [Mostrar senha] · primário [Criar senha]. Envio por
`DMC_Auth.trocarSenha()` (`POST /api/auth/senha/trocar`, única chamada liberada); erro no campo ("Senha
atual incorreta." chega como 400, nunca 401). Sucesso: `DMC_Auth.init()`, aviso "Senha criada." gravado em
`sessionStorage dmc:aviso` e `location.replace(DMC_Auth.destinoInicial())` (o destino recarrega o portal
no modo normal). Teste em `portal-titular.spec.js` (F0p, G1; D-61): professor recém-criado pela coordenação
(`POST /portal/admin/equipe`) e aluno com senha gerada entram, caem aqui, trocam a senha e chegam ao destino do papel
com 0 resposta 4xx no caminho; o lado do cliente (modo restrito simulado por `page.route`, esta página servida por
stub) fica no `portal-shell.spec.js` (F0s, G0).

### 6.16 Meus dados — `meus-dados.html` (canal do titular)

**Fatia: F0p** (front) · F0t (API) · F6a (configuração do encarregado e pedidos por `POST /portal/me/atendimentos`;
sem a F6a, "Pedidos indisponíveis no momento" e o encarregado não aparece) · `meus-dados.js`. Nada desta página vai a
rascunho de 401 (D-47).

1. **Seus dados no Complexo DMC**: tabela Dado · Para quê · Base legal · Quem acessa · Por quanto tempo,
   gerada da configuração do servidor (nada fixo no HTML); lista de operadores (ex.: Google, quando o
   assistente estiver ligado).
2. **Autorizações (consentimentos)**: lista (`pf-lista`, não tabela) das **6 finalidades** devolvidas por
   `GET /portal/me/dados/consentimentos`, na ordem da API (assistente de IA, gênero, etnia, nome social, redes,
   foto). Linha: `rotulo` (600) · marcador **Autorizado** (sucesso) ou **Não autorizado** (neutro) · "desde
   dd/mm/aaaa · versão v1" (de `em` e `versaoTexto`; retirado: "retirada em dd/mm/aaaa") · ação.
   - Autorizado → [Retirar autorização] (`pf-btn--perigo`, 44 px; o verbo do Perfil, para ler igual nas duas telas;
     a API chama de revogação). Confirmação `DMC_UI.confirmar`: título
     "Retirar a autorização de <rótulo>?", consequência = `efeitoRevogacao` do servidor, **literal** (ex.: o dado é
     apagado na hora; o assistente deixa de funcionar), botões [Cancelar] [Retirar autorização]. Só no assistente
     de IA, a caixa "Apagar também o histórico de conversas" (marcada; `apagarHistorico`). Chama
     `POST /portal/me/dados/consentimentos/:finalidade/revogar`; sucesso → a linha passa a "Não autorizado" e
     `role=status` anuncia "Autorização retirada."; 404 (já não estava vigente) → recarrega a lista.
   - Não autorizado → link de onde se autoriza ("Autorizar em Meu perfil" → seção do campo; "Abrir o
     assistente"), nunca um aceite por aqui sem o texto completo.
   - Nada é fixo no HTML: rótulos, efeitos e datas vêm da API. Endpoint ausente: "Autorizações indisponíveis no
     momento." (`pf-alerta--erro` com [Tentar de novo]).
3. **Exportar meus dados**: [Gerar arquivo (JSON)] → download; o texto lista o que entra (cadastro,
   matrículas, progresso, notas, frequência, lançamentos, lista de documentos enviados sem os arquivos,
   contratos, atendimentos, conversas com o assistente).
4. **Pedidos sobre os seus dados** (canal do titular, LGPD art. 18): formulário curto com "Tipo de pedido"
   (Acesso aos meus dados · Correção · Eliminação · Informação sobre compartilhamento · Revogação de
   consentimento · Outro), "O que você precisa" e "Por quê" (opcional). Abre atendimento na categoria
   **Privacidade e dados pessoais** com `pedidoTitular` (DC-21; `POST /portal/me/atendimentos`,
   `categoria:'privacidade'`). Depois de enviar: "Pedido ATD-… registrado. Resposta até dd/mm/aaaa."
   (`prazoRespostaEm`, calculado pelo servidor: 15 dias). Abaixo, a lista "Seus pedidos" (`GET
   /portal/me/atendimentos?categoria=privacidade`) com protocolo, tipo, situação e prazo. Texto sóbrio:
   "Alguns registros precisam ser mantidos por obrigação legal ou para a defesa de direitos (ex.: registros
   acadêmicos e financeiros)." Endpoint ausente: "Pedidos indisponíveis no momento. Use o Atendimento."
5. **Histórico de alterações do seu cadastro**: Data e hora · Campo · Feito por (Você / Coordenação);
   mostra o campo, nunca o valor. **Nesta rodada a seção não aparece** (L4: falta a rota do titular sobre
   a auditoria).
6. **Encarregado de dados**: nome e contato **da configuração**. Sem configuração: "Para assuntos de
   privacidade, use os pedidos acima. Eles chegam à coordenação." Nunca um nome inventado. Link para a
   Política de privacidade.

### 6.17 Tutoriais — `tutoriais.html` (central de ajuda)

**Fatia: F0r** (fase 1, testada nas portas da principal em janela combinada; índice §9.1) · `tutoriais.js` (monta
também `#/ajuda` no backoffice, com os guias da equipe, §7.20) · `portal.css`.

- Busca local "Buscar nos tutoriais" + categorias: Primeiros passos (inclui **Conheça o novo portal**
  `#novo-portal`: o que mudou, onde ficou cada coisa, como achar Certificados em Documentação) · Aulas e
  player · Avaliações e notas · Acadêmico e frequência · Aulas ao vivo e presença · Financeiro ·
  Documentos, declarações e contratos · Atendimento e assistente · Conta, segurança e privacidade ·
  Acessibilidade (tema, tamanho do texto, teclado).
- Desktop: categorias à esquerda (`nav` com âncoras) e artigo à direita (máx. 46rem). Mobile: categorias
  em `<details>`.
- Artigo: título, passos numerados (`ol`, número em Newsreader), nomes de botão em negrito iguais aos da
  tela, captura real só quando existir (nada de imagem simulada). Rodapé: [Rever o tour do portal] ·
  "Ainda com dúvida? Iniciar atendimento".
- Na coluna das categorias, abaixo da lista, o link "Regulamento acadêmico" (`regulamento.html`, §6.20): as regras
  ficam no regulamento; os guias explicam o uso das telas.
- Guias são HTML estático versionado, escritos sobre o que **já existe**; guia de função que não está no
  ar não é publicado (a F0r confere cada guia com a tela final na fase 2, F0r-final). Trecho que depende de recurso
  opcional leva `data-recurso="linkMagico|recuperacaoSenha|doisFatores"` e some quando `DMC_Auth.recursos()` diz que o
  recurso não existe (nada de "em breve"). Guia ou trecho que cita **entrada por CPF** ou o **passo do código do 2FA no
  login** só é publicado depois do aceite do login da 2d (índice §9.9 item 1a, D-71); até lá o guia `seguranca` cobre
  senha, link de acesso e criar nova senha pelas telas da principal (`acesso-link.html#pedir-link` e `#esqueci`, §8.5).

**Catálogo mínimo de guias do aluno** (um por fluxo; âncora estável `tutoriais.html#<id>`; a coluna "Tela descrita"
é a referência com que a F0r confere o guia na fase 2):

| Categoria | Guia (título do artigo) | `#id` | Tela descrita |
|---|---|---|---|
| Primeiros passos | Conheça o novo portal: o que mudou, onde ficou cada coisa, Certificados em Documentação | `novo-portal` | shell §5, menu §5.3 |
| | Pedir um curso e acompanhar o pedido | `pedido` | §6.19, §6.12 Seus atendimentos |
| Aulas e player | Assistir a uma aula e marcar como concluída | `aula` | §6.3 |
| Avaliações e notas | Fazer uma avaliação, melhorar a nota e ver o gabarito | `avaliacao` | §6.4 |
| Acadêmico e frequência | Entender notas e frequência no Acadêmico | `academico` | §6.5, §6.11 |
| | Consultar o regulamento acadêmico | `regulamento` | §6.20 |
| Aulas ao vivo e presença | Entrar numa aula ao vivo e registrar presença | `ao-vivo` | §6.6 |
| Financeiro | Ver lançamentos, 2ª via e declaração de quitação | `financeiro` | §6.7, §6.9 item 2 |
| Documentos, declarações e contratos | Enviar documentos | `documentos` | §6.8 |
| | Assinar um contrato | `contrato` | §6.10 |
| | Emitir certificado e declarações | `certificados` | §6.9 |
| | Imprimir comprovantes e validar um documento | `validar` | §6.11, §8.1 |
| Atendimento e assistente | Falar com a equipe e usar o assistente | `atendimento` | §6.12 Assistente e Seus atendimentos |
| | Registrar uma manifestação na Ouvidoria | `ouvidoria` | §6.12 Ouvidoria |
| Conta, segurança e privacidade | Completar o perfil e usar Meus dados | `perfil` | §6.15, §6.16 |
| | Senha, link de acesso e verificação em duas etapas | `seguranca` | §6.15 Senha e segurança, §8.5 |
| Acessibilidade | Tema, tamanho do texto e navegação por teclado | `aparencia` | §2.7, §2.8, §5.2, §11 |

Critério de aceite da central (índice §8.5, linha F0r; P17 atendida). **G1**: só guias de telas que já existem. **F0r-final
(G2)**: cada uma das 10 categorias tem **≥ 1 guia conferido com a tela final**, e cada guia do catálogo está
**publicado** ou registrado no relatório de entrega como "fora desta rodada: <motivo>" (ex.: a tela da fatia dona
não passou no G1). Guia fora do ar não aparece na central, nem como aviso ("em breve" é proibido); categoria sem guia
publicado também não aparece.

### 6.18 Busca — `busca.html`

**Fatia: F0p** (tela; grupo `busca` da F0t, com provedores de cada fatia) · `busca.js`. `?q=&tipo=`: campo grande +
`pf-segmento` de tipos (o mesmo do painel) +
resultados agrupados por tipo (lista com título, contexto e cadeado) + `pf-mais` por grupo. Vazio: "Nada
encontrado para "termo". Tente outro termo ou mude o filtro."

### 6.19 Loja, obrigado e entrada — `loja.html`, `obrigado.html`, `index.html`

**Fatia: F0r** (HTML estático e estilo de `loja.html` e `obrigado.html`, `boot-loja.js`, `boot-obrigado.js`) · **F0b**
(markup gerado por `DMC_bootLoja`/`DMC_bootObrigado` e a chamada do pedido, índice §7.3, D-69, D-79; boots legados
mantidos — D5; `index.html` com `boot-index.js`) · rota do pedido da **F5** (`POST /portal/me/pedidos`, API §6.9,
DC-69) e
leitura do protocolo da **F6a** (`GET /portal/me/atendimentos/:protocolo` → `pedido`). Nomes, códigos e o caminho do
404 são os da API (D-79). Rótulo no menu: "Cursos disponíveis".

**Por que muda o texto.** Hoje o checkout (`app.js:1738-1748`) só leva a `obrigado.html?cursos=&email=&total=` e não
registra nada; `obrigado.html:26-47` diz "Seu pedido foi enviado ao administrativo", "Recebemos o e-mail com sua
seleção", "link de pagamento por e-mail (até 1 dia útil)" e "Concluir o pagamento no Mercado Pago", e
`loja.html:63` diz "Você será encaminhado para o pagamento". Nada disso acontece, a coordenação nunca fica sabendo do
pedido e o gateway ficou para depois (E1). A partir desta rodada o pedido é **registrado como atendimento** na
categoria Financeiro (blueprint §1: "Financeiro: mesma integração usada no pré-atendimento"), e o texto diz só o que
acontece.

- **Loja** (`loja.html`): sem vitrine com brilho; overline "Cursos disponíveis"; H1 "Programas de formação Complexo
  *DMC*" (`<em>` no lugar de `.gradient-text`); texto "Selecione um ou mais cursos e finalize o pedido. Ele é registrado
  como atendimento com a coordenação, que responde com as formas de pagamento e libera o acesso depois da
  confirmação." Card de curso em painel (`loja-card`, com `loja-card__pill` para a modalidade e `loja-card__stats` para
  a carga; lista vazia de benefícios em `loja-card__vazio`, sem `style`) com capa 16:9, título, carga, modalidade,
  preço em Newsreader `tnum` (preço ausente: "Valor a confirmar", nunca R$ 0,00); "Adicionar" secundário. Sem
  inclinação por `mousemove`, `data-tilt` nem `loja-card__shine` (D-69). Gaveta do carrinho com o comportamento atual
  (foco preso, Esc). Sem urgência, sem "promoção".
- **[Finalizar pedido]** (primário da gaveta; era "Finalizar compra"; `#cart-checkout` mantido): ajuda abaixo do
  botão "O pedido é registrado como atendimento. A coordenação responde por lá com as formas de pagamento e libera o
  acesso depois da confirmação. Nada é cobrado agora." (sai "Você será encaminhado para o pagamento"). O clique envia
  só os `cursoIds` do carrinho (`POST /portal/me/pedidos { cursoIds }`, com `silencioso404`; nunca preço, título ou
  total); o servidor confere cada curso, calcula valores e total a partir do cadastro (nunca do navegador) e abre o
  atendimento ATD da categoria Financeiro, `origem:'humano'`, assunto "Pedido de matrícula", com o `pedido` congelado
  (D-79). Estados do botão: `aria-busy`, "Registrando pedido…", inativo (evita pedido duplo). Os avisos da gaveta saem
  no bloco fixo `<div class="pf-alerta" id="cart-alerta" role="status" hidden>` (HTML da F0r, preenchido pela F0b;
  índice §7.10). Respostas:
  - 201 → `Carrinho.clear()` (o carrinho só esvazia depois do registro) e ida a `obrigado.html?protocolo=ATD-…`;
    o endereço não leva e-mail nem total;
  - 200 com `reaproveitado:true` (já existe, nas últimas 24 h, pedido não encerrado da mesma conta para os mesmos
    cursos) → carrinho vazio e ida a `obrigado.html?protocolo=ATD-…&existente=1`, onde a primeira frase passa a "Você
    já tinha um pedido aberto para estes cursos, no atendimento ATD-…." (o resto igual);
  - 409 `ja-liberado` (+ `cursoIds`) → esses cursos saem do carrinho e `#cart-alerta` mostra `pf-alerta--info` "Você já
    tem acesso a <curso>. Ele saiu do pedido.";
  - 400 `validacao` com `campos.cursoIds` (curso inexistente ou fora de venda) → os cursos recusados saem do carrinho
    e `pf-alerta--aviso` "<curso> não está mais disponível e saiu do pedido.";
  - 429 (limite de 5 pedidos por hora) e 503 `servico-indisponivel` → `pf-alerta--erro` com a mensagem do servidor;
    carrinho mantido, sem navegar;
  - **404** (rota ainda não montada: a F5 não entrou) → o caminho legado de hoje, `obrigado.html?cursos=&email=&total=`,
    que mostra o texto honesto de pedido **não registrado** (abaixo). É esse caminho que mantém o R10 verde antes de a
    F5 entrar (D-79);
  - rede ou outro 5xx → `pf-alerta--erro` "Não foi possível registrar o pedido agora. Seu carrinho foi mantido. Tente
    de novo em alguns minutos." + [Tentar de novo]; nenhuma navegação.
- **Obrigado** (`obrigado.html?protocolo=ATD-…`; o parâmetro só é usado se casar com o regex ATD da API §1.5,
  `^ATD-\d{4}-[2-9A-HJ-NP-Z]{6}$`):
  carrega `GET /portal/me/atendimentos/:protocolo` (§6.12, com `silencioso404`) e mostra:
  - `<title>` "Pedido registrado · Plataforma Complexo DMC"; glifo de sucesso (sem anel neon); overline "Cursos
    disponíveis"; H1 "Pedido *registrado*";
  - texto: "Seu pedido foi registrado no atendimento ATD-2026-000123. A coordenação responde por aqui com as formas de
    pagamento e libera o acesso depois da confirmação." + primário [Ver atendimento]
    (`atendimentos.html?protocolo=ATD-…`) e secundário [Ver cursos disponíveis] (`loja.html`);
  - "Itens do pedido" (`#obrigado-list`) e "Total" (`[data-obrigado-total]`) do `pedido` **do servidor**, em `tnum`,
    nunca da query; item com `valorCentavos:null` = "Valor a confirmar" e total `null` = "A confirmar pela
    coordenação"; "E-mail da conta" (`[data-obrigado-email]`, de `DMC_Auth.user()`);
  - "Próximos passos" (`ol`): "A coordenação responde no atendimento com as formas de pagamento." · "Você recebe uma
    notificação no portal quando houver resposta." · "Depois da confirmação do pagamento, o curso aparece em Meus
    cursos." Saem "Recebemos o e-mail com sua seleção", "Aguardar o link de pagamento por e-mail (até 1 dia útil)",
    "Concluir o pagamento no Mercado Pago" e "Receber a liberação automática";
  - **sem `protocolo` válido** — inclusive o endereço legado do 404, `?cursos=&email=&total=` —: a seção
    `<section id="obrigado-sem-pedido" hidden>` (HTML da F0r, mostrada pela F0b; índice §7.10) com o texto "Seu pedido
    ainda não foi registrado. Para concluir, fale com a equipe pelo Atendimento.", a lista dos cursos da query (como
    hoje) e o atalho [Falar com a equipe] → `atendimentos.html?novo=1&categoria=financeiro`; o carrinho é esvaziado
    como hoje (índice §7.3). Saem "enviado ao administrativo" e o vazio "Nenhum curso recebido…" com cor inline (§3
    B3a);
  - 404 do protocolo (protocolo de outra conta, ou F6a ainda não montada): "Não encontramos este pedido." + [Ver seus
    atendimentos]; erro de carga: `pf-alerta--erro` + [Tentar de novo].
  - A caixa de desenvolvimento (`#dev-pay-box`, só em localhost com a flag) nasce com `hidden` no HTML (sem `style`) e
    o `DMC_bootObrigado` a mostra por `hidden = false` (D-69): `pf-alerta--aviso` sem cor inline nem emoji, título
    "Modo de desenvolvimento", texto "Libera os cursos deste pedido sem aprovação. Disponível só neste ambiente." e
    [Simular pagamento aprovado] (`#btn-dev-pay`) secundário, com os `cursoId` dos itens do pedido (ou da query, no
    caminho legado); o resultado sai em `#dev-pay-status` com `className` `pf-alerta pf-alerta--sucesso` ou
    `pf-alerta pf-alerta--erro` (troca o `style` de `app.js:1835-1837`).
- Ids de R10 preservados (`#cart-drawer`, `#cart-list`, `#cart-checkout`, `[data-cart-count]`, `#obrigado-list`,
  `[data-obrigado-total]`, `[data-obrigado-email]`, `#btn-dev-pay`). A regressão R10 (índice §9.3, D-45) confere
  efeito, não texto: finalizar termina em `obrigado.html` com `dmc:carrinho` vazio; com a F5 montada, a URL traz
  `?protocolo=ATD-…` e o `pedido` do protocolo tem os `cursoIds` do carrinho. Os 404/409/429/503 do lado do cliente são
  testados no `portal-ui.spec.js` (F0b, `page.route`); valores do servidor, `reaproveitado` e `ja-liberado`, no
  `portal-financeiro.spec.js` (F5).
- Na equipe, o pedido cai na fila **"Pedidos da loja"** da coordenação (`#/atendimento?categoria=financeiro&pedido=1`,
  §7.10, D-79), com [Criar matrícula e lançamentos].
- `index.html` (F0b, `boot-index.js`): só redirecionamento (sem token → `login.html`; com token → `next` válido ou o
  destino do papel, `DMC_Auth.destinoInicial()`).

### 6.20 Regulamento acadêmico — `regulamento.html`

**Fatia: F6a** (dona do regulamento e do `rag.js`; página nova do índice, D-81) · `regulamento.js` · `portal.css`
(`pf-leitura`, F0s) · sem item no menu, como `perfil.html`. Lê `GET /portal/regulamento` (API §6.10.5: o regulamento
geral e os dos cursos do usuário, só os publicados). É o mesmo texto que o assistente consulta: aqui o aluno confere a
"Fonte" de uma resposta (§6.12) e a promessa do diálogo de publicação (§7.22) passa a ter tela.

```
1440
Ajuda (overline) · Regulamento *acadêmico* · "Regras publicadas pela coordenação. É o mesmo texto que o assistente
consulta."                                                                            [ Imprimir ] (secundário)
┌ Seções (sticky, 14rem) ─────────┬ pf-leitura (máx. 46rem) ─────────────────────────────────────────────────┐
│ REGULAMENTO GERAL               │ Regulamento geral  (H2 Newsreader)                                        │
│ ▌1. Matrícula                   │ Edição 3 · publicada em 02/10/2026                        (13 px, texto-3) │
│  2. Avaliação e nota mínima     │ 1. Matrícula  (H3 Hanken 600, id="r-<regulamentoId>-<trechoId>")         │
│  3. Frequência                  │ parágrafos…                                                               │
│ ARQUITETURA PATRIMONIAL         │ …                                                                         │
│  1. Regras específicas          │ Regulamento — Arquitetura Patrimonial Estratégica (H2) · Edição 1 · …    │
└─────────────────────────────────┴───────────────────────────────────────────────────────────────────────────┘
390: "Seções" vira <details> no topo (como no Perfil); texto em 1 coluna; [Imprimir] some abaixo de 30em
(o menu do navegador imprime).
```

- **Índice de seções** (`nav aria-label="Seções do regulamento"`): agrupado por regulamento (overline com "Regulamento
  geral" ou o `cursoTitulo`), um link por trecho com o `titulo` do servidor; o item da seção visível ganha o fio
  `--pf-acento` (`aria-current="location"`).
- **Texto**: renderizado como **texto** (nunca HTML), parágrafos por linha em branco; cada trecho com o H3 do seu
  `titulo` e a âncora `r-<regulamentoId>-<trechoId>` (D-81: o `trechoId` `e<edicao>-t<nnn>` se repete entre o
  regulamento geral e os de curso, por isso a âncora leva também o id do regulamento). A divisão em trechos é a do
  servidor (o mesmo `fatiar` do assistente), para que âncora e "Fonte" coincidam: `GET /portal/regulamento` traz, por
  regulamento, `id`, `edicao`, `publicadoEm` e `trechos:[{ id, titulo, inicio, fim }]` (API §6.10.5, DC-70), e o front
  corta `texto` em `[inicio, fim)`. Regulamento que viesse sem `trechos` (defeito) sai inteiro, sem índice nem âncoras
  — nunca uma divisão própria do front que não bata com as fontes.
- **Chegada por âncora** (link de fonte do assistente): rola até o trecho, foco no H3 (`tabindex="-1"`, respeitando
  `scroll-padding-top`). Âncora que não existe na página — cada edição publicada tem o próprio `regulamentoId`, então
  âncora de edição arquivada ou de regulamento despublicado não casa com nenhum trecho; o assistente já não faz link
  para elas (§6.12), mas o endereço pode ter sido guardado —: foco no H1 + `pf-alerta--info` "O trecho citado era da
  edição N, que não está mais em vigor. Abaixo, o texto em vigor." (N tirado do `trechoId`; sem ele, "O trecho citado
  não está mais em vigor.").
- **Estados**: carregando (esqueleto de 6 linhas, `aria-busy`); vazio "A coordenação ainda não publicou o
  regulamento." (sem ação; o aluno continua com Atendimento e Tutoriais pelo rodapé); erro `pf-alerta--erro` + [Tentar
  de novo]. Modo restrito (§5): não carrega (403), como as demais páginas.
- **Entradas**: rodapé (§5.6), Tutoriais (§6.17: link na coluna de categorias e o guia `#regulamento`), nota da tabela
  do Acadêmico (§6.5) e fontes do assistente (§6.12). Equipe que abre a página vê o mesmo texto do seu escopo.
- **Impressão**: §12 (papel, índice oculto, título e edição de cada regulamento no topo, URL da página no rodapé).

---

## 7. Portal do professor e coordenação (backoffice)

Princípio: tela de trabalho, não vitrine. Densidade média, fio no lugar de caixa, ouro só na ação
principal, na linha ativa e no foco. Os mesmos componentes do aluno; o mesmo rótulo de estado (§2.3).

### 7.1 Casca, rotas e permissões

**Fatia: F8** · `professor.html` + `js/portal/professor.js` (`DMC_Professor`) · `portal-professor.css` +
todos os `portal-<dominio>.css`. Cada fatia registra as rotas do seu domínio (`DMC_Professor.registrar`, índice §6.3 e
§7.8); a F8 entrega primeiro `professor.html` + `professor.js` (hospedeiro de tela das fatias penduradas, P1f, D-74).
O roteamento existe **só** em `professor.html`: começa quando `professor.js` chama `DMC_Professor.iniciar()` com
`body[data-pagina="professor"]`; em `admin.html` e `parcerias.html` nenhum hash é reescrito e nenhuma tela é montada
(D-66). Rotas `#/secao[/id[/sub]][?filtros]`; filtros no hash
(`#/correcao?curso=c1&estado=pendente`), então notificação, Voltar e recarregar devolvem a mesma tela.

Ao trocar de rota: `destruir()` do painel anterior; fade de 160 ms só em opacidade; rolagem ao topo;
`document.title = "<Seção> · Portal do Professor · Plataforma Complexo DMC"` ("Coordenação" para admin);
foco no H1 (`tabindex="-1"`); anúncio em região viva ("Turmas carregadas"); `aria-current` no item do
menu (`DMC_Shell.definirAtivo`). Hash desconhecido → `#/inicio` sem toast. 401 →
`login.html?next=professor.html%23/<rota>`. Seção fora do papel → §7.21.

| Ação | Professor (escopo = cursos ou turmas vinculados) | Coordenação (admin) |
|---|---|---|
| Ver turmas e alunos (nome social, foto, e-mail) e o acadêmico completo | sim | sim |
| Ver CPF, RG, endereço, documentos, financeiro, contratos do aluno | não | sim |
| Ver gênero e etnia do aluno | não | não ("Restrito"; só estatística agregada) |
| Editar identidade do curso (título, descrição, preço, capa), criar e excluir curso | não (leitura, sem preço) | sim |
| Criar, excluir e reordenar módulos; CH do módulo | não | sim |
| Editar plano de ensino, materiais do módulo, categoria de material, rótulo do encontro da aula | sim (docência geral do curso) | sim |
| Editar título e resumo do módulo; título, vídeo, ordem e No ar/Em breve da aula | não — leitura com "Alteração feita pela coordenação." (D-21) | sim |
| Excluir aula | não (D-21) | sim, com aviso de quantos alunos perdem o registro ("Use Em breve para tirá-la do ar sem apagar o histórico.") |
| Roteiro de gravação | quando a API devolver (pendência P7) | sim |
| Avaliações: banco, configuração, publicar, pré-visualizar; corrigir; conceder nova tentativa (motivo). "Encerrar" não existe nesta rodada (L11); despublicar com tentativas é só da coordenação | sim | sim |
| Responder dúvidas | sim | sim |
| Encontros ao vivo: criar, editar, cancelar; registrar e anular presença (motivo) | sim (suas turmas) | sim |
| Atendimento | categoria Acadêmico dos seus cursos e os atribuídos a ele: responder e encerrar (reatribuir é só da coordenação, D-19) | todas, inclusive Privacidade e dados pessoais |
| Publicações | público restrito aos seus cursos e turmas | inclusive "Todos os alunos" |
| Banners | não (D-09) | sim |
| Nota mínima, nível e critérios do curso | vê o valor | edita (motivo, auditado) |
| Ouvidoria | só as manifestações encaminhadas a ele, sempre saneadas (nenhum dado de quem escreveu), com parecer à coordenação (§7.11) | todas; responde, encerra, encaminha (exceto denúncia) e vê a identidade com registro na auditoria |
| Relatórios (painéis e CSV) | sim, só dos seus cursos e turmas: Alunos por curso e turma, Progresso, Notas, Frequência e as tabelas Tentativas, Correções pendentes e Presenças, sem as colunas da coordenação (§7.23; API §6.11.3) | todos |
| Alunos, matrículas, secretaria, contratos, financeiro, equipe, configurações, auditoria, parcerias | não | sim (ações críticas de equipe, conta e chave do Gemini pedem reautenticação, DC-38) |

### 7.2 Visão geral — `#/inicio`

**Fatia: F8** (`prof-visao.js`; cada fatia contribui com `resumo` no registro de rota).

- `pf-cabecalho` sem contexto: H1 "Bom dia | Boa tarde | Boa noite, *<primeiro nome>*" (itálico só no
  nome); descrição com a data ("Sábado, 18 de outubro").
- `pf-kpis --link` — professor (5): **Alunos ativos** · **Correções pendentes** · **Dúvidas abertas** ·
  **Atendimentos abertos** · **Próximas aulas ao vivo** (nota: o próximo, "sex., 24/10 · 19:30"). Admin:
  a mesma linha com overline "Ensino" + segunda linha "Secretaria": **Documentos em revisão** ·
  **Contratos pendentes** · **Lançamentos em atraso** (nota com a soma em R$). Cada KPI abre a fila
  filtrada. "Alunos ativos" conta matrículas ativas; enquanto houver liberação sem matrícula, a nota diz
  "inclui 4 acessos sem matrícula".
- Abaixo, grade 7/5 colunas separadas por fio vertical (sem caixas):
  - **Para fazer** (larga): até 3 filas curtas, cada uma com H2 de ferramenta (Hanken 600 18 px) + 5
    itens mais antigos + "Ver todas (n)": Para corrigir (aluno · avaliação · há X), Dúvidas sem resposta
    (aluno · código da aula · há X), Atendimentos (protocolo · assunto · há X). Admin acrescenta
    Documentos em revisão e Contratos pendentes há mais de 7 dias.
  - **Agenda** (estreita): encontros dos próximos 7 dias (dia e hora `tnum`, título, turma); o encontro
    em andamento ganha "Ao vivo agora" (anel neutro + texto, §2.3) + [Abrir sala ↗]. Abaixo (admin), **Avisos do sistema**, só
    estados reais, cada um levando à tela que resolve: "Assistente de IA desligado", "Chave do Gemini
    recusada no último teste", "Teto diário do assistente atingido hoje" (`ia.tetoGlobalAtingidoHoje`) →
    `#/configuracoes/ia`, "3 liberações sem matrícula", "Encarregado de dados não configurado", "Dados da
    instituição não cadastrados: a declaração anual de quitação fica indisponível" → `#/configuracoes/instituicao`
    (chave `sistema.instituicaoPendente:true` do painel, contribuição da F6a ao bloco `sistema`, D-54 c), "Prazo de
    retenção a definir", "Envio de e-mail não configurado".
- Mobile: KPIs 2 colunas; **Agenda sobe** para depois dos KPIs; filas empilhadas.
- Estados: professor sem curso vinculado → KPIs "—" e um bloco: "Você ainda não está vinculado a nenhum
  curso. A coordenação faz esse vínculo em Equipe." Zero real → "0" e "Nada pendente aqui." Fonte que
  falhou → "—" + motivo (nunca 0).

### 7.3 Cursos — `#/cursos` (professor: "Meus cursos")

**Fatia: F1b** (`prof-conteudo.js`, expõe `DMC_PlanoEnsino` — DC-24; rotas `/portal/professor/*` do conteúdo da F1a).

- Lista (não grade): linha de 88 px com capa 16:9 de 120 px (raio 4), título (600), "Sigla APE · Curso
  livre" (nível real) e números reais: turmas ativas, alunos ativos, aulas no ar / total, avaliações
  modulares publicadas / módulos.
- Ações (links 44 px): **Editar conteúdo** (`admin.html?curso=<id>`) · **Plano de ensino**
  (`#/cursos/<id>/plano`) · **Avaliações** (`#/avaliacoes?curso=<id>`) · **Turmas**
  (`#/turmas?curso=<id>`) · **Ver como aluno** (`dashboard.html?curso=<id>`, DC-27). Mobile: capa 72 px,
  números em `dl` 2×2, ações em "⋯".
- **Plano de ensino** (`#/cursos/<id>/plano?modulo=<id>`, componente `DMC_PlanoEnsino`; `PlanoEnsino` estruturado,
  DC-61 da API, D-53): `select` do módulo + Ementa (textarea) · Objetivos (um por linha → lista; contador "12 de 30
  objetivos") · Bibliografia em **dois campos**, **Básica** e **Complementar** (uma referência por linha em cada um;
  contador "até 50 referências por grupo"; sai o separador opcional) · Cronograma (linhas repetíveis Encontro · Data
  opcional · Tema · Aula (opcional); contador "até 60 linhas"; [Montar a partir das aulas gravadas] cria uma linha por
  aula com o rótulo e a data do encontro vindos de `aulas` de `GET /portal/professor/cursos/:id/planos`). Os limites
  ficam visíveis antes de serem atingidos; no limite, o botão de acrescentar linha fica inativo com o motivo ao lado.
  Salva no `blur` com "Salvo às 21:14". Prévia "Como o aluno vê" em `pf-leitura` (o mesmo desenho do palco do player,
  §6.3).
- Vazio: professor — o texto da Visão geral; admin — "Nenhum curso cadastrado. Crie o primeiro em
  Conteúdo." + [Abrir Conteúdo].

### 7.4 Turmas — `#/turmas`, `#/turmas/:id`

**Fatia: F8** (lista, moldura de `#/turmas/:id` com cabeçalho e `pf-abas`, aba Alunos) · **F3a** (abas Frequência,
Notas, Encontros, `prof-academico.js`) · **F4a** (Nova turma, `#/turmas/nova`, `prof-secretaria.js`). Moldura (D-65,
índice §7.8): a F8 desenha o cabeçalho da turma e a barra de abas; cada aba é uma rota registrada pela fatia dona com
`pai:'turmas/:id'` e `aba`, recebe `ctx.turma` e escreve só dentro do `<section class="pf-abas__painel"
role="tabpanel">` (markup fixo do índice §7.10); aba de fatia ausente não aparece; `#/turmas/:id` sem aba abre a
primeira aba visível ao papel.

**Lista**: `pf-cabecalho` "Turmas" + (admin) primário [Nova turma]. Filtros: curso (`select`) e
`pf-segmento` Em andamento · Planejadas · Encerradas · Todas. `pf-tabela`: **Código** (link, `tnum`) ·
**Curso** · **Período** ("03/11/2026 – 30/05/2027") · **Modalidade** (Ao vivo · Gravado · Híbrido) ·
**Alunos**; **Frequência média**, **Média** e **Pendências** entram quando houver agregado por turma (L9) —
nesta rodada as colunas não aparecem (nada de "—" permanente). Linha
especial no topo (admin): "12 alunos sem turma em Arquitetura Patrimonial · Enturmar" → `#/matriculas`;
professor vê os alunos do curso sem turma em `#/turmas/sem-turma?curso=<id>`.

**Nova turma** (F4a, painel `pf-detalhe`): Curso * · Código * (sugestão `SIGLA-AAAA-NN`, editável, único) ·
Início * · Fim · Modalidade * · Professores (multi, só os vinculados ao curso). Com alunos: datas e
professores editáveis; curso não. Salvar encadeia `POST /portal/admin/turmas` e um `POST
/portal/admin/docencias` por professor (docência da turma, D-30); falha parcial mostra a turma criada e
"Não foi possível vincular <nome>. Tente de novo." com [Tentar de novo].

**Detalhe**: "← Turmas"; H1 = código; descrição "Arquitetura Patrimonial Estratégica · Híbrido ·
03/11/2026 – 30/05/2027 · Prof. Ana Lima". Ações: secundário [Exportar notas (CSV)]; "⋯" → Exportar
frequência (CSV), (admin) Editar turma. `pf-abas` **Alunos · Frequência · Notas · Encontros**.
- **Alunos** (F8): busca por nome + filtro de situação. Colunas: Aluno (foto/iniciais 32 px + nome
  social 600 + e-mail `--pf-texto-3`, link para `#/alunos/:id`) · Progresso ("64%" + trilho 2 px;
  mesma conta do aluno) · Média ("—" sem avaliação; "a corrigir" em aviso) · Frequência (geral) ·
  Situação (Cursando · Aprovado · Em recuperação · Reprovado; matrícula trancada/cancelada mostra o
  status da matrícula) · Última atividade ("há 3 dias"). Mobile: nome + situação; `dl` de 3 colunas.
- **Frequência** (F3a, `pf-matriz`): ≥ 1024, linhas = alunos (`th` de linha), colunas = encontros ("Sex
  · noite 24/10", `th` de coluna); célula = glifo + texto oculto: presente ao vivo (check), presente pela
  gravação (check com "G"), ausente (×), futuro (—). Mais de 8 encontros → agrupado por módulo em
  sanfona (nunca rola na horizontal). < 1024: lista por aluno "presente em 9 de 12 · ao vivo 7 · gravado
  2 · faltas 3" com sanfona dos registros.
- **Notas** (F3a): linhas = alunos, colunas = módulos com avaliação modular publicada, célula = melhor
  nota com glifo de situação; acima de 6 colunas, agrupado como acima.
- **Encontros** (F3a): lista de encontros passados e futuros com presença "18 de 24" e link `#/ao-vivo/:id`.

### 7.5 Alunos — `#/alunos` e detalhe `#/alunos/:userId`

**Fatia: F8** (diretório; moldura de `#/alunos/:userId` com cabeçalho, seletor "Matrícula" e `pf-abas`; aba Cadastro)
· **F3a** (aba Acadêmico) · **F4a** (aba Matrículas) · **F4b** (abas Documentos e Contratos) · **F5** (aba Financeiro)
· **F6a** (aba Atendimentos). Moldura (D-65, índice §7.8): cada aba é uma rota registrada pela fatia dona com
`pai:'alunos/:userId'` e `aba`, na ordem `academico · matriculas · documentos · contratos · financeiro · atendimentos ·
cadastro`, filtrada por papel e por rota registrada; recebe `ctx.aluno` e `ctx.matriculaId` e escreve só no
`pf-abas__painel` (índice §7.10); os dados do cabeçalho são buscados uma vez pela F8 e a aba não repete a chamada.

- **Diretório** (admin): todas as contas de aluno, inclusive sem matrícula. Colunas: **Aluno** (nome
  social + e-mail) · **Criada em** · **Último acesso**; as colunas **Matrículas** (n ativas), **Cadastro**
  (Completo · Incompleto) e **Documentos** (n pendentes) e a busca por CPF exato entram quando a API
  devolver os agregados (L8). Busca por nome ou e-mail. Ação em massa [Exportar CSV] (sem CPF).
- **Cabeçalho do aluno**: foto/iniciais 56 px, H1 = nome de exibição (admin vê abaixo "Nome de registro:
  …" rotulado), e-mail, matrícula (nº, situação, turma, início); com mais de uma, `select` "Matrícula". As matrículas
  vêm de `GET /portal/professor/alunos/:userId/matriculas` (vigentes primeiro; DC-73 da API, D-82), lido uma vez pela
  F8 junto do resumo do aluno; `semMatricula` (liberação ainda não materializada) vira a linha "Liberação ainda sem
  matrícula" no cabeçalho, nunca uma matrícula criada pela leitura. Trocar a matrícula no seletor remonta a aba atual
  com o novo `ctx.matriculaId`.
- `pf-abas`: professor vê **Acadêmico** (+ **Atendimentos** acadêmicos dele); admin vê também
  **Matrículas · Documentos · Contratos · Financeiro · Atendimentos · Cadastro**.
- **Acadêmico** (F3a) = a mesma leitura do `academico.html` (mesmo componente, visão da equipe): KPIs
  sem link; tabela por módulo com a coluna extra **Avaliação** ("2 de 3 tentativas · melhor 6,4"). A
  linha expande e mostra: tentativas (início e fim, % de acerto, nota, estado da correção, [Ver
  respostas]) e registros de frequência com origem e hash curto + [Copiar hash]; a lista de aulas com %
  assistido e data entra quando houver a visão da equipe por aula (L10). Ação na linha:
  [Conceder nova tentativa] (§7.7) quando há modular publicada e o aluno está Em recuperação, Reprovado ou
  sem tentativas.
- **Cadastro** (F8, admin): campos agrupados (Identificação · Contato · Endereço · Documentos) em
  leitura; gênero e etnia como "Restrito"; [Editar] abre o formulário com motivo obrigatório (auditado).
  Ações de conta, cada uma num diálogo com **Motivo** (10–500) e o bloco `pf-reautenticacao` no fim (DC-38, §4.8):
  [Gerar senha temporária] (quando o e-mail transacional não está configurado; `POST …/senha-temporaria`) mostra a
  senha **uma vez** com [Copiar] e "Entregue ao aluno por um canal seguro. Ela vale por 72 horas e só até o primeiro
  acesso, quando ele cria a própria senha." · [Alterar e-mail] (`PUT …/email`) · "⋯" [Redefinir verificação em duas
  etapas] (só quando ativa; `POST …/2fa/redefinir`; ajuda "Use depois de confirmar a identidade do aluno fora da
  plataforma.") · "⋯" [Desativar conta] (`POST …/desativar`; consequência "O aluno sai de todas as sessões e não
  entra mais até ser reativado.") / [Reativar conta] (só motivo). Os três primeiros avisam no próprio diálogo: "O
  aluno recebe um aviso de segurança e só poderá assinar contratos 72 horas depois." (API §6.8.4).
- Matrículas, Documentos, Contratos, Financeiro, Atendimentos: a lista da respectiva seção filtrada por
  este aluno (mesmos componentes), com o primário da seção. A aba Matrículas (F4a) usa `GET
  /portal/admin/matriculas?userId=` (DC-73, D-82).
- Professor em aluno fora das suas turmas → 403 → §7.21.

### 7.6 Avaliações — `#/avaliacoes`, `#/avaliacoes/:id`

**Fatia: F2** (`prof-avaliacoes.js`, `portal-avaliacao.css`) · telas hospedadas em `professor.html` da F8 (P1f, D-74);
a prévia `#/avaliacoes/:id/previa` monta `DMC_Avaliacao` (`avaliacao.js` carregado antes de `prof-avaliacoes.js`).

- **Lista**: descrição "Cada módulo pode ter uma atividade prévia (não conta nota) e uma atividade modular
  (define a nota do módulo)."; filtro de curso (`pf-segmento` até 4 cursos, senão `select`). Tabela por
  módulo: **Módulo** · **Atividade prévia** (estado) · **Atividade modular** (estado) · **Banco** ("14
  objetivas · 3 dissertativas"; no módulo de TCC, também "1 arquivo") · **Por tentativa** ("8 + 2") · **Tentativas** · **Tempo** ("Livre" ·
  "60 min") · [Editar] / [Criar]. Estados: Sem avaliação · Rascunho · Publicada ("Encerrada" não existe
  nesta rodada, L11).
- **Editor** — `pf-abas` **Configuração · Banco de questões (17) · Resultados**. Cabeçalho: contexto
  "Avaliações · APE · Módulo 03", H1 "Atividade modular", estado; ações: secundário [Pré-visualizar como
  aluno], primário [Publicar] (rascunho). Publicada: sem [Encerrar] nesta rodada (L11); [Despublicar] no
  "⋯" só sem tentativas (docente geral) ou pela coordenação (com motivo; muda a regra de aprovação).
  - *Configuração* (2 colunas ≥ 1024): Tipo (rádio "Atividade prévia — não conta para a nota do módulo" /
    "Atividade modular — a melhor tentativa vira a nota do módulo"; uma modular por módulo, opção inativa
    com o motivo) · Título · Instruções ao aluno · Composição ("Objetivas [8] de 14 no banco" +
    "Dissertativas [2] de 3 no banco" + — só na avaliação de módulo do tipo TCC — "Arquivos [1] de 1 no banco"
    (D-53), atualiza ao vivo) · Tentativas [1–10] · Tempo (Livre / Limite de
    [60] minutos) · `pf-switch` Embaralhar alternativas · linha informativa "Nota mínima do curso: 7,0 —
    definida pela coordenação." (admin: link para Critérios) · prévia de "Avisos importantes" como o aluno
    verá (`pf-leitura`).
  - *Banco*: `pf-segmento` Todas · Objetivas · Dissertativas · (módulo de TCC) Arquivos · Arquivadas; busca no
    enunciado; primário
    [Nova questão]. Linha: nº · tipo · enunciado (1 linha) · valor · "Já sorteada" quando
    `questoes.sorteada` (sem contagem, D-31) · Editar, Duplicar, Arquivar (questão sorteada não se apaga:
    desativa).
  - *Editor de questão* (`pf-detalhe`, `#/avaliacoes/:id/questoes/nova|:qid`): Tipo (`pf-segmento`
    Objetiva | Dissertativa | **Arquivo (PDF)** — a 3ª opção só existe na avaliação de um módulo do tipo TCC; fora dele
    não aparece e a API responderia 400 `modulo-nao-tcc`, D-53, DC-66) · Enunciado (texto simples com parágrafos; sem HTML) · Objetiva: alternativas
    A–F (mín. 2), rádio "Correta" único, [Adicionar alternativa], "Comentário do gabarito (o aluno vê depois
    de finalizar)", Pontos · Dissertativa: Orientação ao aluno (`orientacao`, aparece acima do campo de resposta),
    Limite de caracteres [4000] (`limiteCaracteres`, 100–10.000; vai ao snapshot da tentativa, então mudar não afeta
    tentativa já iniciada), **Pontos** (campo único; rubrica por critérios fica fora desta rodada, D-22), Resposta de
    referência (`respostaReferencia`: só quem corrige vê; nunca vai ao aluno, nem na prévia nem no gabarito; DC-62,
    D-53) · Arquivo (PDF): Orientação ao aluno e **Pontos**, com a ajuda "O aluno envia um PDF de até 4 MB. A entrega
    é corrigida em Correção." Validação em linha ("Marque a alternativa correta."). Questão já sorteada:
    `pf-alerta--aviso` "Esta questão já foi sorteada. As tentativas já feitas mantêm a versão original."
    Ações [Salvar questão] · [Salvar e criar outra].
  - *Publicar*: diálogo com checklist calculado (glifo + texto): banco suficiente para a composição,
    toda objetiva com correta, toda dissertativa e toda questão de arquivo com pontos; item reprovado deixa o botão inativo e em
    destaque. Texto fixo "Os alunos do curso recebem uma notificação." (a API sempre notifica). Toast
    "Avaliação publicada. Os alunos já veem a atividade no Módulo 03."
  - *Resultados* (publicada): KPIs reais (Alunos que fizeram "12 de 30" · Média das melhores notas ·
    Aprovados · Em recuperação · A corrigir), contados sobre a lista de resultados; tabela por aluno.
    "Questões com mais erros" fica fora desta rodada (D-31).

### 7.7 Correção — `#/correcao`, `#/correcao/:tentativaId` e nova tentativa

**Fatia: F2** (`prof-avaliacoes.js`; hospedada em `professor.html`, P1f, D-74). Fluxo da API §6.6.2 (DC-63, D-53):
cada questão é salva como **rascunho** (`publicar:false`) e a correção só chega ao aluno em [Publicar correção]
(`publicar:true`).

- **Fila**: `pf-segmento` A corrigir (4) · Corrigidas; filtros curso e avaliação; `pf-switch` "Ocultar
  nome dos alunos durante a correção" (`dmc:correcaoCega`; troca o nome por "Aluno 1, 2…"). Tabela, mais
  antiga primeiro: Aluno · Curso · Módulo · Avaliação · Entregue ("há 2 dias") · Dissertativas pendentes ·
  [Corrigir] ("Em correção por" fica fora, D-22). Vazio: "Nenhuma dissertativa aguardando correção."
- **Tela de correção**: "← Correção"; contexto "APE · Módulo 03 · Atividade modular"; H1 "Corrigir
  tentativa"; descrição "Aluno · tentativa 2 de 3 · entregue em 17/10/2026 às 21:14"; "Questão 1 de 2" +
  Anterior | Próxima.
  - ≥ 1024, 2 colunas 7/5: à esquerda enunciado, resposta do aluno em `pf-leitura`, "1.842 de 4.000
    caracteres" (o `limiteCaracteres` do snapshot), "Orientação ao aluno" e "Resposta de referência" recolhidas;
    na **entrega de TCC** (questão de arquivo), no lugar da resposta: nome, tamanho, "Enviado em dd/mm/aaaa às hh:mm"
    e [Baixar entrega (PDF)] (`GET /portal/professor/tentativas/:id/respostas/:questaoId/arquivo` por `DMC_UI.baixar`;
    nada embutido, CSP; D-53); à direita (fixa ao rolar) **Pontos** da questão: campo numérico
    de 0 ao valor da questão (passo 0,25, botões −/+ de 44 px), "Pontos da questão: 7,5 de 10" (D-22),
    "Devolutiva para o aluno" (textarea com contador; ajuda "Diga o que sustentou a nota e o que
    faltou."), primário [Salvar e ir para a próxima].
  - < 1024: empilhado; barra fixa no pé com total + [Salvar e próxima].
  - Cada questão salva ao avançar com `PUT …/tentativas/:id/correcao { itens, publicar:false, versao }`: é rascunho —
    sem nota gravada, código AVL, selo, notificação nem auditoria, e o aluno não vê nada; a tentativa segue
    "Aguardando correção" mesmo com todas as questões pontuadas ("Salvo às 21:32"); sair não perde o que já foi
    salvo.
  - Última questão → resumo: "Objetivas: 6 de 8 (corrigidas automaticamente) · Dissertativas: 15,5 de 20
    pts · Nota da tentativa: 7,2" + o **`efeito`** devolvido pelo servidor a cada salvamento (simulado, sem gravar:
    `notaTentativa`, `notaModulo`, `situacaoModulo`, `restantes`): "Com esta nota o Módulo 03 fica
    **Aprovado**." / "… **Em recuperação** (1 tentativa restante)." / "… **Reprovado** (sem tentativas).
    Você pode conceder nova tentativa no Acadêmico do aluno."; com `contaParaNota:false` (atividade prévia), "Esta
    atividade não conta para a nota do módulo."; com `completa:false`, "Faltam pontos em N questões." e o primário
    inativo com esse motivo. Primário [Publicar correção] → `publicar:true` (pode ir com `itens:[]`) → toast
    "Correção publicada. O aluno foi notificado." Correção já publicada → 409 `transicao-invalida`: a tela recarrega e
    oferece [Revisar correção].
  - Concorrência: sem aviso de "quem está corrigindo" (D-22); conflito na gravação (409
    `conflito-versao`) recarrega a versão atual com o alerta "Alguém alterou esta correção enquanto você
    editava." + [Recarregar].
  - Correção publicada: [Revisar correção] (motivo; auditado; aluno notificado).
- **Conceder nova tentativa** (diálogo 36rem, a partir do Acadêmico do aluno, dos Resultados e do resumo
  da correção): resumo "Atividade modular · Módulo 03 · 3 de 3 tentativas usadas · melhor nota 5,8 ·
  Reprovado"; Motivo *; se o aluno já viu o gabarito: "O aluno já viu o gabarito. A nova tentativa sorteia
  questões do banco (14 objetivas para 8 por tentativa) e pode repetir questões."; primário [Conceder 1
  tentativa]; toast "Nova tentativa concedida. O aluno foi notificado."

### 7.8 Dúvidas — `#/duvidas`

**Fatia: F8** (`prof-duvidas.js`; mesmas rotas de dúvidas de hoje, agora com o professor do curso).

- `pf-segmento` Sem resposta (n) · Respondidas · Todas; filtro curso; mais antigas primeiro.
- Item (lista com fio): iniciais + nome social · "APE · Módulo 03 · APE-M03-A02 Holding na prática" ·
  "há 5 h" · texto (preserva quebras) · respostas anteriores (autor + quando) · Responder (textarea que
  cresce + primário pequeno [Publicar resposta]) · links "Marcar como resolvida sem responder" e "Abrir
  aula ↗".
- Ajuda fixa: "A resposta aparece na aula para todos os alunos com acesso ao curso e marca a dúvida como
  resolvida." Autor exibido ao aluno: nome + papel (DC-28).
- Vazio: "Nenhuma dúvida em aberto nos seus cursos."

### 7.9 Aulas ao vivo — `#/ao-vivo`, `#/ao-vivo/novo`, `#/ao-vivo/:encontroId`

**Fatia: F3a** (`prof-academico.js`; mesmo `pf-calendario` do aluno — DC-18; hospedada em `professor.html`, P1f,
D-74). O caminho de tela da coordenação para encontros (antes em `admin.html`) é coberto em `portal-professor.spec.js`;
a regressão D5 confere o encontro pela API (R12, D-45).

- Barra: [Hoje] · ‹ › ("Período anterior/seguinte") · título do período · `pf-segmento` Hoje · Semana ·
  Mês · Lista · filtros curso e turma · primário [Novo encontro]. Evento do próprio professor leva o texto
  "Seu encontro"; o de outro professor leva o nome dele ("Prof. Ana Lima"); o fio esquerdo é o mesmo
  (`--pf-linha-forte`) para os dois — a diferença nunca é só a cor (DC-17). Mês < 768: pontos + lista do dia. Lista é o
  padrão no celular: hora · título · turma · módulo · estado (Agendado · Ao vivo agora · Encerrado ·
  Cancelado) · presença "18 de 24" quando encerrado. Em andamento: [Abrir sala ↗]. Encontros antigos
  sem turma: "Curso inteiro (sem turma)".
- **Criar/editar** (`pf-detalhe`): Turma * · Módulo · Aula gravada correspondente ("Definir depois") ·
  Título * (sugestão "Encontro — Módulo 03") · Data * · Início * · Duração em minutos * · prévia **somente
  leitura** do rótulo derivado da data e hora ("Sexta · noite" — manhã < 12 h, tarde < 18 h, noite), com a
  ajuda "O rótulo editável fica na aula gravada, no editor de conteúdo." (D-29) · Plataforma (Zoom · Google Meet · Microsoft Teams · YouTube · Outra) · Link da sala (https) ·
  Descrição. Ajudas: "O link só chega ao navegador do aluno 15 minutos antes do início." · "Quem não puder
  estar ao vivo recebe a frequência ao concluir esta aula gravada." Validação: conflito na turma ("A turma
  já tem encontro sex., 24/10 às 19:30."); link não https. Ações [Salvar encontro] · (edição) [Duplicar
  para a semana seguinte] · [Cancelar encontro] (motivo; com presença registrada não se exclui, só se
  cancela; os alunos da turma são sempre notificados — texto fixo no diálogo).
- **Detalhe com lista de presença**: resumo "Presentes ao vivo 18 · Pela gravação 3 · Ausentes 3 ·
  Total 24"; tabela Aluno · Situação (Presente ao vivo · Pela gravação · Ausente · Ajuste) · Registrado
  em · Origem (ao vivo · gravado · ajuste) · Comprovante (hash curto + copiar). Texto fixo: "A presença ao
  vivo é registrada quando o aluno clica em Entrar durante o encontro (de 15 minutos antes até o fim)."
  Por linha: [Registrar presença] (motivo) · [Anular registro] (motivo; o comprovante passa a dizer
  "Registro anulado em …") · [Desfazer anulação]. [Exportar CSV].

### 7.10 Atendimento — `#/atendimento`, `#/atendimento/:protocolo`

**Fatia: F6a** (`prof-atendimento.js`; hospedada em `professor.html`, P1f, D-74).

- **Fila**: `pf-segmento` Abertos (n) · Respondidos · Encerrados · Todos; filtros Categoria (Acadêmico ·
  Secretaria · Financeiro · Acesso e tecnologia · Privacidade e dados pessoais; professor só Acadêmico),
  curso, origem (Assistente · Aluno, o `?origem=ia|humano` da API), (admin) responsável (Comigo · Sem responsável ·
  pessoa) e (admin) a caixa "Só pedidos da loja" (`?pedido=1`, D-79).
  Tabela: **Protocolo** (link) · **Aluno** · **Assunto** · **Categoria** · **Origem** · **Situação** ·
  **Responsável** · **Prazo** (só em privacidade: "até dd/mm/aaaa", com glifo de aviso e o texto "vence em N
  dias" a partir de 3 dias antes; dado do servidor, `prazoRespostaEm`) · **Atualizado** ("há 4 h"). Mais
  antigo sem resposta primeiro. Filtros pela URL: `#/atendimento?categoria=privacidade` e **"Pedidos da loja"**
  `#/atendimento?categoria=financeiro&pedido=1` (D-79: a API lista só os protocolos abertos pela loja e traz
  `pedido:{ itens, totalCentavos }` em cada item; atalho também em §7.18; só a coordenação, porque Financeiro é fila
  dela).
- **Conversa** (`pf-detalhe` ≥ 1024; página abaixo): topo com protocolo, assunto (H1 de ferramenta),
  aluno (link ao detalhe), curso/matrícula, categoria, origem, aberto em, situação. `pf-linha-tempo`:
  aluno à esquerda (`--pf-painel`), equipe à direita (`--pf-painel-2`), eventos do sistema em
  `--pf-texto-3` ("Coordenação atribuiu a Ana Lima · 18/10 · 10:02"). Origem IA: bloco recolhido "Conversa
  com o assistente que originou este protocolo". Nota interna e anexos ficam fora desta rodada (D-19).
- **Compositor** (`pf-compositor`, fixo no pé): textarea; primário [Enviar resposta] (situação →
  Respondido; aluno notificado); "⋯": [Encerrar atendimento] (professor e coordenação) · (só coordenação)
  [Reatribuir] — diálogo com categoria, curso, responsável (professor do curso ou coordenação) e motivo.
  Encerrado é final: não há "Reabrir" (D-19); mensagem do aluno em "Respondido" volta para "Aberto".
- **Pedidos do titular** (categoria **Privacidade e dados pessoais**, só coordenação): o topo mostra o tipo
  de pedido (`pedidoTitular`: Acesso · Correção · Eliminação · Informação sobre compartilhamento ·
  Revogação de consentimento · Outro) e "Prazo de resposta: até dd/mm/aaaa" calculado pelo servidor (15
  dias, LGPD art. 19); a execução (corrigir, exportar, eliminar) é manual pela coordenação e a resposta
  registra o que foi feito.
- **Pedido da loja** (categoria Financeiro, `origem:'humano'` com `pedido` não nulo, só coordenação; aberto pelo aluno
  em Cursos disponíveis, §6.19; nomes da API, D-79): acima da linha do tempo, o bloco **Pedido** — uma linha por curso
  (`pf-lista`): curso (`pedido.itens[].titulo`) e valor registrado no pedido (`valorCentavos`, ou "a confirmar"), mais
  o total (`totalCentavos`, ou "a confirmar"); tudo congelado pelo servidor no momento do pedido. O bloco **não**
  mostra matrícula, lançamentos nem acesso por curso: esse enriquecimento e o protocolo de origem como campo ficam fora
  desta rodada (D-79), e a tela nunca os deduz; a coordenação confere em Matrículas e Financeiro filtrados pelo aluno
  (§7.5). Ações por curso:
  - **[Criar matrícula e lançamentos]** (primário em cada linha) → `#/matriculas?nova=1&protocolo=ATD-…&curso=<id>`
    (§7.14) com aluno e curso preenchidos e o acesso **desligado** (`liberarAcesso:false`); 409
    `matricula-vigente-existe` (+ `matriculaId`) → o painel diz "<aluno> já tem a matrícula MAT-… neste curso." e
    oferece [Lançar para esta matrícula]; ao salvar a matrícula (ou nesse atalho), segue para
    `#/financeiro?lancar=1&matricula=<id>&protocolo=ATD-…` (§7.18) com matrícula, tipo, o valor do pedido e "Pedido
    ATD-…" na descrição preenchidos; ao salvar, volta a este atendimento com o toast "Matrícula MAT-… e lançamentos
    criados para o pedido ATD-…. Responda ao aluno com as formas de pagamento." O `protocolo` na URL serve só para
    preencher os formulários e voltar; não é gravado na matrícula. Pedido com vários cursos: um curso por vez, na
    ordem do bloco;
  - **[Liberar acesso]** (secundário) → [Conceder acesso] de §7.14 preenchido com o e-mail e o curso, com a
    confirmação "Liberar o acesso de <aluno> a <curso>? Confira antes, em Financeiro, que o pagamento foi baixado.";
  - a resposta ao aluno (formas de pagamento, 2ª via) é escrita no compositor de sempre; nada é enviado sozinho.

### 7.11 Ouvidoria — `#/ouvidoria`, `#/ouvidoria/:protocolo`

**Fatia: F6a** (`prof-atendimento.js`) · coordenação **e** professor, com visões diferentes na
mesma rota (o servidor decide: `/portal/admin/ouvidoria*` para admin, `/portal/professor/ouvidoria*` para professor).
DC-40: a identidade de quem escreveu nunca chega a professor, em nenhum tipo.

**Coordenação (admin)**
- `pf-segmento` Abertas (n) · Respondidas · Encerradas; filtros tipo (Elogio · Denúncia · Reclamação ·
  Sugestão) e curso. Tabela: **Protocolo** (`OUV-…`) · **Tipo** · **Assunto** · **Curso** · **Situação** ·
  **Recebida** · **Encaminhada** (nome do professor ou "—"). Sem coluna de identidade: a lista nunca traz quem
  escreveu.
- Detalhe (`pf-detalhe`): tipo, assunto, curso, recebida em, texto em `pf-leitura`, conversa em `pf-linha-tempo`
  (respostas assinadas "Ouvidoria"). **Identidade**: fechada por padrão; [Ver identidade de quem escreveu] carrega
  `GET /portal/admin/ouvidoria/:protocolo?identidade=1` e mostra nome, e-mail e matrícula, com a frase fixa "Esta
  consulta fica registrada na auditoria." (vale nos 4 tipos). Compositor igual ao do atendimento ([Enviar
  resposta], "⋯" [Encerrar]).
- **Encaminhamentos** (bloco no detalhe): uma linha por encaminhamento — professor, encaminhada em, observação
  da coordenação e o parecer: "Parecer recebido em dd/mm/aaaa" (sucesso) + texto em `pf-leitura`, ou "Aguardando
  parecer" (info). [Encaminhar ao professor] só em **elogio, sugestão e reclamação** (diálogo: Professor * —
  professores com docência no curso da manifestação, ou todos quando sem curso — e Observação * 10–1.000; texto
  fixo "O professor recebe tipo, assunto, texto e curso. Nunca recebe o nome, o e-mail nem a matrícula de quem
  escreveu."). Em **denúncia** o botão não existe; no lugar, a frase "Denúncias são apuradas só pela coordenação e
  não são encaminhadas a professores." (a API responde 409 `encaminhamento-nao-permitido`).

**Professor — "Ouvidoria (encaminhadas)"**
- Lista (`GET /portal/professor/ouvidoria`): só o que foi encaminhado a ele. `pf-segmento` Sem parecer (n) ·
  Com parecer · Todas. Tabela: **Protocolo** · **Tipo** (Elogio · Sugestão · Reclamação) · **Assunto** ·
  **Curso** · **Encaminhada em** · **Parecer** (Parecer pendente · Parecer enviado). Sem coluna de situação nem de
  autor: a visão do professor não tem esses dados. Vazio: "Nenhuma manifestação encaminhada a você."
- Detalhe (`GET …/:protocolo`; destino da notificação `ouvidoria.encaminhada`): protocolo, tipo, assunto, curso,
  recebida em, encaminhada em, **observação da coordenação** (`pf-alerta--info` sem título) e o texto em
  `pf-leitura`. Aviso fixo acima do texto: "A identidade de quem escreveu não é mostrada a professores. Seu parecer
  vai só para a coordenação." Nenhum nome, e-mail, matrícula, turma, conversa ou situação interna aparece.
- **Parecer para a coordenação**: `textarea` 10–4.000 com contador, ajuda "Descreva o contexto e o que você
  propõe. O aluno não vê o parecer." e primário [Enviar parecer] (`POST …/:protocolo/parecer`). Depois de enviado:
  "Parecer enviado em dd/mm/aaaa às hh:mm" e o texto em leitura (sem edição nesta rodada). Toast "Parecer enviado
  à coordenação." Segundo parecer no mesmo encaminhamento (outra aba, clique duplo) → 409 `transicao-invalida`: a tela
  mostra "Parecer já enviado." no lugar do formulário e recarrega o detalhe (D-54 f). A contagem do menu sai do
  `ouvidoriaSemParecer` do resumo (§5.4).
- Protocolo que não foi encaminhado a ele → 404 → "Não encontramos esta manifestação." + link para a lista (não
  cai em "Área da coordenação").

### 7.12 Publicações — `#/publicacoes`, `#/publicacoes/nova`, `#/publicacoes/:id`

**Fatia: F7** (`prof-comunicacao.js`).

- Lista: `pf-segmento` Publicadas · Rascunhos · Arquivadas (sem agendamento nesta rodada, D-20); filtro
  público. Linha: título ·
  tipo (Texto · Vídeo · Link · PDF) · público ("APE-2026-01", "Arquitetura Patrimonial", "Todos os
  alunos") · autor · data · estado. Primário [Nova publicação].
- **Editor** (≥ 1024, formulário 7 · prévia 5; empilhado abaixo): Tipo (`pf-segmento`) · Título * (3–140)
  · Resumo (até 280, aparece no card) · por tipo: Texto (corpo em texto simples), Vídeo (URL YouTube
  ou Vimeo, validada ao sair: "Vídeo do YouTube reconhecido — será exibido incorporado." / "Use um link do
  YouTube ou do Vimeo."), Link (https + rótulo do botão), PDF (até 4 MB) · Público * (rádio "Todos os
  alunos" só admin · Cursos · Turmas; professor só vê os seus) · texto fixo "Ao publicar, o público
  recebe uma notificação." (sem agendamento nem switch, D-20). Prévia = o card do aluno (`pf-publicacao`).
  Ajuda discreta: "Texto visto pelos alunos: informativo e sóbrio, sem promessa de resultado." Ações
  [Salvar rascunho] · [Publicar] · "⋯" Arquivar.

### 7.13 Banners — `#/banners`

**Fatia: F7** · só coordenação (D-09).

- Lista em ordem de exibição: miniatura, título, local (Faixa do topo · Destaque no Início), público,
  período ("20/10 – 31/10"), estado derivado (Agendado · No ar · Encerrado), ordem (↑ ↓ de 44 px). No
  topo, só leitura: "Conheça o novo portal — banner do sistema · leva aos Tutoriais · o aluno pode
  dispensar".
- Formulário (`pf-detalhe`): Local * — **Faixa do topo** (só texto, até 90 caracteres, contador; uma por
  vez no portal) | **Destaque no Início** (título 3–80, texto até 160 — D-28; imagem opcional JPG/PNG/WebP
  até 1 MB, decorativa nesta rodada: "Descrição da imagem" entra com L6, até lá a ajuda diz "A imagem é
  decorativa: o título e o texto precisam bastar."; texto nunca dentro da imagem) · Link (caminho interno
  ou https) + rótulo ("Saiba mais") · Público · Início * e Fim * (até 366 dias) · prévia ao vivo nos temas
  escuro e claro lado a lado ≥ 1024 (cada uma dentro de `.pf-escopo-escuro` / `.pf-escopo-claro`, §2.2).

### 7.14 Matrículas — `#/matriculas`, `#/matriculas/:id`

**Fatia: F4a** (`prof-secretaria.js`, `portal-secretaria.css`; evolução das liberações sem quebrar a liberação nem a
loja; hospedada em `professor.html`, P1f, D-74). O caminho de tela da coordenação para liberações (antes em
`admin.html`) é coberto em `portal-professor.spec.js`; a regressão D5 confere `/api/liberacoes` pela API (R12, D-45).

- Cabeçalho "Matrículas"; descrição "A matrícula registra o vínculo acadêmico; o acesso aos conteúdos
  continua sendo a liberação do curso."; primário [Nova matrícula]; secundário [Conceder acesso].
- `pf-abas` **Matrículas · Acessos sem matrícula (n)** (DC-26).
- *Matrículas*: filtros situação (Ativa · Concluída · Trancada · Cancelada · Todas), curso, turma ("Sem
  turma"), origem (Liberação de acesso · Manual · Migração — `?origem=liberacao|admin|migracao` da API), busca
  (nome, e-mail, nº). Tabela:
  seleção · **Nº** · **Aluno** · **Curso** · **Turma** (ou "Sem turma") · **Situação** · **Início** ·
  **Contrato** (Pendente · Assinado · Cancelado · —; vem de `contratos.situacaoPorMatricula`, da F4b, D-78: sem
  esse serviço a API omite o campo e a coluna mostra "—") · **Origem**. Ações em massa: [Enturmar] (só turmas do mesmo
  curso; seleção mista explica "Selecione matrículas de um único curso.") · [Exportar CSV].
- *Acessos sem matrícula*: nesta rodada (L7), sem lista: texto "Liberações antigas ganham matrícula
  automaticamente na primeira leitura do aluno. Para gerar todas agora:" + [Gerar matrículas a partir das
  liberações] (confirmação "O acesso dos alunos não muda.") → resultado "N criadas · M já existiam" em
  `role=status`. A lista paginada entra quando a F4a expuser `matriculas/sem-matricula` (L7).
- **Nova matrícula** (`pf-detalhe`): Aluno * (e-mail de conta existente; não encontrado → "Não há conta
  com este e-mail. O aluno precisa se cadastrar na tela de entrada antes da matrícula." — criar conta de
  aluno pela coordenação fica para depois, L14) · Curso * · Turma (filtrada) · Data de início * (hoje) ·
  `pf-switch` "Liberar o acesso aos conteúdos agora" (ligado; é o booleano `liberarAcesso` do `POST
  /portal/admin/matriculas`, padrão `true`, D-79) · `pf-switch` "Anexar contrato agora" (abre o fluxo de §7.17
  depois de criar). 409 `matricula-vigente-existe` (+ `matriculaId`): "Este aluno já tem a matrícula MAT-… neste
  curso." + link [Abrir matrícula].
  Toast "Matrícula MAT-2026-000124 criada." Conta sem e-mail confirmado (409 `email-nao-verificado`, API §6.8.2): o
  mesmo painel mostra "Esta conta ainda não confirmou o e-mail. Conta criada em dd/mm/aaaa · último acesso dd/mm/aaaa."
  e pede **Motivo** (10–500) para [Matricular assim mesmo] (`confirmarSemVerificacao:true`, auditado).
- **A partir de um pedido da loja** (`#/matriculas?nova=1&protocolo=ATD-…&curso=<id>`, vindo de §7.10): a linha "Pedido
  ATD-… · <curso> · <preço>" no topo do painel (leitura); Aluno = autor do pedido (leitura) e Curso = o do pedido;
  "Liberar o acesso aos conteúdos agora" nasce **desligado**, com a ajuda "O pedido informa ao aluno que o acesso é
  liberado depois da confirmação do pagamento." — o envio leva `liberarAcesso:false` (D-79). A matrícula nasce com a
  origem Manual: guardar o protocolo de origem como campo fica fora desta rodada (D-79), e o vínculo com o pedido
  fica na descrição dos lançamentos (§7.18). Ao salvar, segue para o lançamento (§7.18); 409
  `matricula-vigente-existe` → [Lançar para esta matrícula] (§7.10).
- **Conceder acesso** (o formulário atual de liberação, reskin): e-mail + cursos (checkbox com título e
  meta) → liberação + matrícula materializada (origem Liberação de acesso; ou ligada à matrícula que já existe). Aberto
  por [Liberar acesso] de um pedido (§7.10), chega com o e-mail e o curso marcados e volta ao atendimento depois de
  salvar; é também o caminho de [Liberar acesso] para a matrícula criada sem acesso (D-79).
- **Detalhe**: dados, histórico de situação (auditoria filtrada), contrato (situação por
  `contratos.situacaoPorMatricula`, F4b; omitido sem o serviço), lançamentos, documentos, resumo acadêmico
  (`academico.resumoMatricula`, F3a; sem ele, o bloco não aparece);
  ações [Enturmar / Trocar turma] · [Trancar] · [Concluir] · [Cancelar] (motivo; `pf-switch` "Revogar o
  acesso aos conteúdos", ligado em cancelar, desligado em trancar).

### 7.15 Documentos — `#/documentos`, `#/documentos/:envioId`, `#/documentos/tipos`, `#/documentos/declaracoes`

**Fatia: F4b** (Revisão, Tipos; `prof-documentos.js`, `portal-documentos.css`, D-78) · **F3b** (Declarações emitidas;
`prof-certificacao.js`) · hospedadas em `professor.html` (P1f, D-74).

`pf-abas` **Revisão · Tipos exigidos · Declarações emitidas**.
- **Revisão**: `pf-segmento` Em revisão (n) · Pendentes · Aprovados · Todos; filtros curso e tipo.
  Tabela: **Aluno** · **Documento** ("DIP · Diploma de graduação") · **Curso** · **Enviado** ("há 1
  dia") · **Versão** ("2º envio") · **Situação**. Mais antigo primeiro.
- **Tela de revisão** (`pf-detalhe` 40rem ≥ 1024; página abaixo): **imagem** (JPG/PNG) com prévia
  embutida por blob autenticado em `<img>` (a CSP aceita `img-src blob:`), zoom e [Abrir em tamanho real];
  **PDF** sem embutir (a CSP tem `frame-src` sem `blob:` e `object-src 'none'`): metadados (nome gerado,
  tamanho, SHA-256 com Copiar) + [Abrir PDF em nova aba] por `DMC_UI.abrirArquivo`; ao lado, aluno (nome de registro e nome social
  rotulados), tipo, curso, orientação do tipo, histórico de envios (motivos anteriores). Primário
  [Aprovar] · secundário [Marcar pendente] (motivo: Ilegível · Documento vencido · Não corresponde ao
  tipo · Incompleto · Outro + texto que o aluno lê) · `pf-switch` "Abrir o próximo depois de decidir"
  (ligado) · "⋯" [Solicitar novo envio] (documento aprovado → pendente, com motivo). Toast "Documento aprovado. O aluno foi notificado."
- **Tipos exigidos**: catálogo (sigla 2–6 · nome · orientação ao aluno · formatos; tamanho máximo único
  de 4 MB, D-32) com
  sugestão inicial editável DOC, DIP, CERT, HIS, RES. Por curso: matriz tipo × curso (≥ 1024 tabela com
  `pf-switch` "Exigido"; abaixo, lista por curso). Tipo em uso não se apaga: desativa.
- **Declarações emitidas** (F3b): código, aluno, tipo (matrícula · frequência · conclusão · quitação
  anual), curso, emitida em; [Ver] e [Revogar] (motivo; a validação pública passa a dizer "Revogada em
  …"). É a fonte do histórico de solicitações que o aluno vê.

### 7.16 Conteúdo — `admin.html` (editor de cursos)

**Fatia: F8** (`admin.js`, `boot-admin.js` no lugar do boot inline, reskin e correções) · usa endpoints da **F1a**
(conteúdo e capas, D-56) e da **F3b** (`PUT …/modulos/:id/academico`, `POST …/codigos`) e o componente
`DMC_PlanoEnsino` da F1b (DC-24) · guarda `requireProfessorOrRedirect` (DC-25) · `data-shell="backoffice"
data-shell-ativo="conteudo"` · sem roteador: nenhum hash é reescrito aqui e o menu vem de
`DMC_Professor.itensDoMenu(papel)` com links `professor.html#/<rota>`, passado por `boot-admin.js` a
`DMC_Portal.iniciar({ itens })` (D-66, D-75).

- **Integração**: o shell do backoffice substitui `header.app-nav` (que quebra em 390: "PAINEL DO ALUNO"
  em 2 linhas). `<head>` de §2.1; saem DM Sans, Raleway e o "Playfair Display" inline (`admin.js:265`).
  Deep link `admin.html?curso=&modulo=&aula=` abre o curso, expande o módulo e rola até a aula com foco no
  título (destino de "Editar conteúdo", da busca e dos links "Editar aula"). Os painéis "Aulas ao vivo",
  "Dúvidas das aulas" e "Liberar cursos" continuam aqui, reskinados, até `#/ao-vivo`, `#/duvidas` e
  `#/matriculas` passarem na regressão; depois `admin.html#lives-pane`, `#duvidas-pane`,
  `#liberacoes-pane` redirecionam para os hashes novos.
- **Layout**: `pf-cabecalho` contexto "Ensino", H1 "Conteúdo dos cursos", descrição "Edite direto na
  tela: cada campo é salvo ao sair dele." (sai "Importar JSON"); secundário [Ver como aluno]; "⋯" (admin)
  Exportar estrutura (JSON) · Novo curso. Coluna **Cursos** (≥ 1024, 18rem): lista de **botões** (hoje
  `div` clicável) com capa 48×27, título, "11 módulos · 46 aulas", `aria-current` com fio ouro; < 1024,
  `select` "Curso". Professor só vê os cursos vinculados.
- **Editor do curso** (blocos com fio, sem caixa): (1) **Identidade** — admin edita, professor lê (sem
  preço); campos atuais + **Sigla** (2–5 maiúsculas; ajuda "Ex.: APE. A sigla compõe o código das
  aulas.") + linha de critérios "Nível: Curso livre · Nota mínima 7,0 · Frequência mínima 75% ·
  Professores: Ana Lima" (valores reais; vazio "Não definido"; admin com link "Critérios em
  Configurações") + (admin) **Capa vertical (2:3)** (D-56): prévia da imagem atual (ou da reserva: recorte central da
  capa larga, ou capa tipográfica), [Enviar capa vertical] (JPG, PNG ou WebP até 1 MB, tipo conferido pelos bytes;
  `POST /portal/admin/cursos/:cursoId/capa-vertical`, corpo cru) e [Remover capa vertical] (confirmação; `DELETE`), com
  a ajuda "Usada na grade de Meus cursos. Sem ela, o portal recorta o centro da capa larga." e os erros no campo
  "Formato não aceito. Envie JPG, PNG ou WebP." · "Arquivo maior que 1 MB." (o professor vê só a imagem) + (admin)
  linha **Códigos das aulas**: com sigla e aulas sem código, "N aulas sem código" (soma de
  `modulos[].aulasSemCodigo` de `GET /portal/admin/cursos/:id/academico`) + secundário [Gerar códigos que faltam]
  (`POST /portal/admin/cursos/:id/codigos { refazer:false }` → toast "N códigos gerados." e as linhas de aula
  atualizadas com `itens[]`); com todas codificadas, "Todas as aulas têm código."; sem sigla, "Defina a sigla do
  curso para gerar os códigos." (409 da API cai no mesmo texto). "Refazer todos os códigos" fica só no "⋯" do
  cabeçalho (admin), com confirmação e motivo: "Refazer os códigos das 46 aulas pela ordem atual? Comprovantes já
  emitidos mantêm o código antigo." (`refazer:true` com `motivo` obrigatório, 10–500, D-54 d; a auditoria
  `aula.codigos_gerados` passa a `executar` nesse caso);
  (2) **Estrutura** — busca, abrir e recolher (mantidos) + módulos; (3) (admin) **Zona de
  exclusão** — [Excluir curso] com confirmação e números ("Excluir "Arquitetura Patrimonial" com 11
  módulos, 46 aulas, 2 turmas e 30 alunos com acesso? Não dá para desfazer."); com matrículas ativas,
  bloqueado: "Encerre ou transfira as 30 matrículas antes."
- **Módulo** (espelha o player): linha com miniatura numerada 40×40 (a mesma do player), nº, título,
  **CH (h)** (admin), [n aulas ▾], "⋯" (admin: Mover para cima/baixo, Excluir); arrastar mantido (admin)
  **com** alternativa por botões. Título e resumo do módulo: admin edita; professor lê (D-21). **Tipo do módulo:
  Regular · TCC** (D-53): admin escolhe por `pf-segmento` (`PUT /portal/admin/modulos/:id/academico`, F3b); professor
  lê; ajuda "Num módulo de TCC, a avaliação pode ter a questão de envio de PDF.". **Capa do módulo** (D-56, só admin):
  miniatura atual, [Enviar capa do módulo] e [Remover] (`POST`/`DELETE /portal/admin/modulos/:moduloId/capa`, mesmas
  regras da capa vertical), com a ajuda "Aparece na miniatura do módulo no player. Sem ela, o número.". Aberto:
  Resumo + `pf-abas` **Plano de ensino · Material de apoio (n) ·
  Aulas gravadas (n) · Avaliação (estado)**:
  - *Plano de ensino*: `DMC_PlanoEnsino` embutido (edição para quem pode).
  - *Material de apoio*: agrupado em Leitura · Slides · Complementar; linha = tipo (PDF · Link), nome
    editável, tamanho/host, categoria (`select`), abrir, remover (confirmação). [Anexar PDF] (categoria
    antes; vários arquivos; "Enviando 2 de 3…") e [Adicionar link] como formulário inline (nome, URL
    https, categoria), substituindo os `prompt()` (`admin.js:594-597`). Materiais presos a uma aula
    aparecem também aqui com o código ("de APE-M03-A02"); sem categoria = Leitura.
  - *Aulas gravadas*: linhas de aula (abaixo).
  - *Avaliação*: estado da prévia e da modular + [Editar avaliação] / [Criar avaliação] → `#/avaliacoes`.
- **Aula**: ≥ 1024, uma linha: ↑↓ · **Código** (`APE-M03-A02`, leitura, `tnum`, copiar) · Título ·
  **Rótulo do encontro** (`datalist`: Sexta · noite, Sábado · manhã, Sábado · tarde, Domingo · manhã) ·
  Duração · Vídeo (URL) · `pf-switch` No ar / Em breve · "⋯" (Excluir). Para o **professor** (D-21), só o
  Rótulo do encontro e a categoria dos materiais são editáveis (rotas `/portal/professor/*` da F1a); título,
  duração, vídeo, ordem, No ar/Em breve e Excluir aparecem em leitura, com a ajuda "Alteração feita pela
  coordenação." Abaixo: materiais da aula
  (legado) e Roteiro de gravação (quando disponível). < 1024: bloco empilhado com **rótulos visíveis**
  (hoje só placeholder). Vídeo validado ao sair: "YouTube reconhecido: será incorporado." · "Vimeo
  reconhecido." · "Arquivo de vídeo (.mp4)." · "Link não reconhecido. Use YouTube, Vimeo ou um arquivo
  .mp4." O código é estável (reordenar não muda; aviso uma vez por sessão: "Os códigos não mudam ao
  reordenar, para não invalidar comprovantes."); curso sem sigla: "—" e, para o admin, "Defina a sigla
  do curso para gerar os códigos." **Geração automática** (API §8.12: aula criada no editor legado nasce com
  `codigo:null`): depois do primeiro salvamento de uma aula nova (`PUT /api/aulas/:id` de id novo) e depois de mover
  para outro módulo uma aula ainda sem código, o `admin.js` chama `POST /portal/admin/cursos/:id/codigos
  { refazer:false }` e preenche a célula Código com o valor de `itens[]` ("Código gerado: APE-M03-A05" em
  `role=status`). Aula que já tem código não muda ao ser movida (o código é estável; "Refazer todos" realinha).
  Falha da geração não desfaz o salvamento da aula: a célula fica "—" e a linha "N aulas sem código" do bloco
  Identidade oferece [Gerar códigos que faltam].
- **Correções obrigatórias** (bugs do código atual): (1) listeners duplicados em `redesenharModulos`
  (`admin.js:958-964`) → delegação de eventos ligada uma vez; (2) trocar de curso não recarrega lives,
  dúvidas e liberações; (3) `alert/confirm/prompt` (e a confirmação embutida do módulo) → `DMC_UI.confirmar` e
  formulários, com o gancho `data-pf-acao` (D-76; a D5 confere essas exclusões pela API); (4) rótulos com `for`/`id` em todos os
  campos; (5) `#lib-nome` removido (criar conta de aluno pela coordenação é L14); (6) `#modal-import`, `#btn-import`,
  `#btn-reset` e o Playfair removidos; (7) toast único com `role=status`; (8) aula empilhada abaixo de 1024; (9) visual neon →
  tokens.

### 7.17 Contratos — `#/contratos`, `#/contratos/:id`

**Fatia: F4b** (`prof-documentos.js`, `portal-documentos.css`, D-78; hospedada em `professor.html`, P1f, D-74).

- `pf-segmento` Pendentes (n) · Assinados · Cancelados · Todos. Tabela: **Aluno** · **Matrícula** ·
  **Curso** · **Situação** · **Disponibilizado em** · **Assinado em** · **Código de verificação**.
- [Anexar contrato] (`pf-detalhe`): Matrícula * (busca) · PDF * (até 4 MB) → ao subir mostra "SHA-256:
  3f9a…c21e" (completo em copiar) · Título exibido ao aluno · texto fixo "O aluno é notificado quando o PDF
  é anexado." (a API sempre notifica). Enquanto pendente, o portal do aluno mostra a faixa de assinatura. O vínculo
  com a matrícula é gravado só pelo serviço `secretaria.vincularContrato` da F4a (D-78): sem ele, a API responde 503
  `servico-indisponivel` sem gravar nada e o painel mostra `pf-alerta--erro` "Não foi possível anexar o contrato
  agora. Nada foi gravado." + [Tentar de novo].
- Detalhe: o PDF **não é embutido** (CSP: `frame-src` sem `blob:`, `object-src 'none'`): metadados (título,
  tamanho, SHA-256 com Copiar) + [Abrir PDF em nova aba] por `DMC_UI.abrirArquivo`; **Evidências** (depois
  de assinado): aceite autenticado por <aluno/e-mail>,
  data e hora, hash do PDF assinado, código de verificação, versão do texto de aceite, IP truncado,
  navegador. Ações: [Baixar comprovante de assinatura] · [Cancelar contrato] (motivo; assinado não se
  edita; pendente pode ter o PDF substituído com motivo, o que zera a visualização do aluno). [Reenviar
  aviso] fica fora desta rodada (D-32). Campo "Provedor: Assinatura nativa"
  (sem seletor até haver contrato com provedor — EXCEÇÃO 3).

### 7.18 Financeiro — `#/financeiro`, `#/financeiro/:lancamentoId`

**Fatia: F5** (`prof-financeiro.js`; EXCEÇÃO 1; hospedada em `professor.html`, P1f, D-74).

- `pf-alerta--info` de uma linha: "Lançamentos registrados pela coordenação. Boleto, Pix e NFS-e
  automáticos entram quando o gateway for contratado."
- Link de 44 px no cabeçalho, ao lado das ações: **"Pedidos da loja"** → `#/atendimento?categoria=financeiro&
  pedido=1&status=aberto` (§7.10, D-79), com a contagem real de abertos quando o resumo trouxer o número (sem o
  número, só o link).
- `pf-kpis --link` (R$, reais, no filtro atual): **Total** · **Em aberto** · **Pago** · **Em atraso**.
  Filtros: período de vencimento (mês atual por padrão), curso, origem, busca por nome ou e-mail (turma e
  forma ficam fora desta rodada, D-32). `pf-segmento` Todos · Em aberto · Em atraso · Pagos · Cancelados.
- Tabela: **Aluno** · **Matrícula** · **Tipo** (Matrícula · Parcela 3/12 · Taxa) · **Vencimento** ·
  **Valor** · **Forma** · **Situação** (Em aberto · Em atraso · Pago em 12/10 · Cancelado) · **NFS-e** ·
  **2ª via** (ícone quando anexada) · "⋯".
- [Lançar] (`pf-detalhe`): Matrícula * · Tipo * · Valor * (R$, máscara) · Vencimento * · Forma prevista ·
  Descrição; modo "Gerar parcelas" (nº de 1 a 60, valor, 1º vencimento; as demais no mesmo dia dos meses
  seguintes, último dia do mês quando o dia não existe) com prévia em tabela antes de confirmar ("Gerar 12 parcelas de R$ 415,00 · total R$ 4.980,00").
  **A partir de um pedido** (`#/financeiro?lancar=1&matricula=<id>&protocolo=ATD-…`, vindo de §7.14): Matrícula
  preenchida (leitura), Tipo "Matrícula", Valor = preço do curso registrado no pedido (editável; sem preço, vazio e
  obrigatório), Descrição "Pedido ATD-…"; Vencimento continua obrigatório e em branco (nada é inventado); "Gerar
  parcelas" disponível com o mesmo valor como total a dividir. O vínculo com o pedido fica só na `descricao` "Pedido
  ATD-…" (o protocolo de origem como campo do lançamento fica fora desta rodada, D-79) e, ao salvar, a tela volta ao
  atendimento (§7.10).
- "⋯": **Baixar pagamento** (data *, forma *, valor pago *; diferente do devido pede observação) ·
  **Estornar pagamento** (pagos; motivo) · **Anexar 2ª via** (PDF ou link https) · **Informar NFS-e**
  (número * e data de emissão; PDF da NFS-e fora desta rodada, D-32) · **Remover NFS-e** (motivo) ·
  **Editar** (só em aberto e manual; motivo) · **Cancelar** (motivo; pago precisa ser estornado antes). Tudo auditado. Detalhe mostra Origem (Manual · Gateway) e ID
  externo ("—").

### 7.19 Equipe — `#/equipe`, `#/equipe/:userId`

**Fatia: F8** (`prof-equipe.js`; API da F0t).

- Tabela: **Nome** · **E-mail** · **Papel** (Professor · Coordenação) · **Docências** ("APE (curso) ·
  HFA-2026-01") · **Verificação em duas etapas** (Ativa · Não ativa) · **Situação** (Ativo · Desativado).
- [Adicionar à equipe] (`pf-detalhe`): e-mail * · **Papel** * (rádio Professor · Coordenação; padrão
  Professor) → conta existente: "Promover <nome> a <papel>" com "Conta criada em dd/mm/aaaa · último acesso
  dd/mm/aaaa" para conferir que é a pessoa certa (conta sem e-mail confirmado: "A senha escolhida no cadastro será
  descartada e uma senha temporária será gerada."); senão nome * e criação com senha temporária exibida uma vez
  (72 h; [Copiar]). Docências por curso (todas as turmas) ou por turma (multi). Com **Coordenação** escolhida, o
  bloco `pf-reautenticacao` entra no fim do formulário (DC-38). Professor não se cadastra sozinho.
- Detalhe: ações em diálogo com **Motivo** e o bloco `pf-reautenticacao` no fim (DC-38, §4.8): **Alterar papel**
  (bloqueios "A plataforma precisa de ao menos uma conta de coordenação." e "Peça a outra conta de coordenação
  para alterar o seu próprio papel.") · **Gerar senha temporária** (alvo professor; exibida uma vez) · **Redefinir
  verificação em duas etapas** (só quando ativa) · **Alterar e-mail** · **Desativar acesso** ("A pessoa sai de
  todas as sessões."); **Reativar** pede só motivo. Incluir e remover docências não pedem senha (remover com
  turma em andamento avisa quantas correções ficam sem responsável). Estado do e-mail com honestidade: "Envio de
  e-mail não configurado: use a senha temporária." Erros de senha e código aparecem no campo, com o diálogo
  aberto; a sessão não cai (só no estouro do limite, §4.8).

### 7.20 Ajuda e notificações do backoffice — `#/ajuda`, `#/notificacoes`

**Fatia: F0r** (`#/ajuda`, `tutoriais.js`) · **F0p** (`#/notificacoes`, `notificacoes.js`) — os mesmos módulos das
páginas do aluno, montados como painel em `professor.html`.

- **Ajuda**: guias reais, um por fluxo, com passos numerados e captura quando a tela existir: "Montar um
  módulo: plano, materiais e aulas" · "Criar e publicar uma avaliação" · "Corrigir dissertativas" ·
  "Agendar um encontro e acompanhar a presença" · "Responder dúvidas e atendimentos" · "Dar parecer numa manifestação encaminhada" ·
  "Consultar relatórios e exportar CSV" (professor: só as próprias turmas, §7.23) · (admin)
  "Matricular e enturmar" · "Atender um pedido de Cursos disponíveis" (§7.10) · "Revisar documentos" · "Lançar e
  baixar pagamentos" · "Responder pedidos dos titulares" · "Configurar o assistente de IA" · "Publicar o regulamento
  acadêmico" · "Cadastrar os dados da instituição". [Rever o tour] no topo. O guia do professor sobre
  conteúdo cobre só o que ele edita (plano, materiais, rótulo do encontro, D-21). Mesma regra de §6.17: guia só de tela
  que existe, conferido com a tela final na F0r-final.
- **Notificações**: o mesmo `pf-notificacao`; `pf-segmento` Não lidas · Todas; cada item abre um hash do
  portal. Nesta rodada (D-23) a equipe recebe só **atendimento atribuído a você** (`protocolo.atribuido`) e
  **manifestação encaminhada** (`ouvidoria.encaminhada`), além das notificações que valem para qualquer
  usuário (publicação nova). Dissertativa entregue, nova dúvida, documento enviado, contrato pendente,
  lançamento em atraso e pedido do titular aparecem nas filas da Visão geral e nas contagens do menu, não no
  sino. Vazio: "Nenhuma notificação por enquanto."

### 7.21 Área da coordenação (acesso restrito)

**Fatia: F8**. Seção de admin aberta por professor: H1 "Área da coordenação"; descrição "Esta seção é
usada pela coordenação. Se você precisa de algo daqui, fale com a coordenação."; [Ir para a visão geral].
O servidor já respondeu 403; nada sensível chegou. Página do backoffice aberta por aluno: o guarda leva a
`dashboard.html` com o toast "Área restrita à equipe."

### 7.22 Configurações — `#/configuracoes/*`

Navegação interna: lateral de 14rem (≥ 1024) ou `pf-abas` (abaixo; com 5 seções, `<select>` "Seção" abaixo de
30em, DC-12): **Assistente de IA · Regulamento · Privacidade e dados · Instituição · Critérios dos cursos**.

**Assistente de IA** (`#/configuracoes/ia`) — **Fatia: F6b** (`prof-ia.js`, `portal-assistente.css`; decisão 2 do CEO;
D-39: configuração em `routes/portal/ia.js`).
`pf-abas` **Configuração · Uso · Trilha das respostas** (`#/configuracoes/ia`, `#/configuracoes/ia/uso`,
`#/configuracoes/ia/trilha`); Configuração reúne descrição, liga/desliga, chave, modelo, teste e limites.
- Descrição: "O assistente responde aos alunos com base nos dados acadêmicos de cada um e no regulamento
  publicado. Ele só lê: não altera dados nem decide nada acadêmico."
- `pf-switch` "Assistente disponível para os alunos". Desligado ou sem chave: "Os alunos veem o
  assistente indisponível e o atalho Falar com a equipe."
- **Chave da API do Google Gemini**: campo de senha (nunca pré-preenchido; [Mostrar]); ajuda "Cole a
  chave criada no Google AI Studio. Ela é guardada cifrada no servidor e nunca volta para o navegador."
  Situação (dado real de `chave`): "Configurada pelo painel · termina em ••••7Kq2 · alterada em 18/10/2026" (de
  `final4` e `salvaEm`; a API não devolve o nome de quem trocou, e o autor fica na auditoria: link "Ver na
  auditoria" → `#/auditoria?area=ia`) | "Definida no servidor (GEMINI_API_KEY) — tem prioridade. Para trocar,
  altere a variável no ambiente de hospedagem." (campo inativo) | "Nenhuma chave configurada." | `legivel:false`:
  "A chave salva não pode mais ser lida (o segredo do servidor mudou). Cole a chave de novo." (aviso). Ações:
  primário [Salvar chave] · secundário [Testar conexão] · link [Remover chave]. **[Salvar chave] e [Remover chave]
  abrem o diálogo "Confirme sua identidade"** (`pf-reautenticacao`, DC-38; `DMC_UI.reautenticar({ rotuloConfirmar:
  'Salvar chave', enviar })`, D-57, com o diálogo aberto durante o envio): salvar envia `PUT …/assistente-ia/chave
  { chave, testarAntes:true, reautenticacao }` (400 `chave-recusada-pelo-provedor` → erro no campo da chave: "O
  Google recusou esta chave. Nada foi salvo."); remover envia `POST …/chave/remover { reautenticacao }`, e o diálogo
  diz a consequência ("O assistente fica indisponível para os alunos até uma nova chave ser salva."). Erro de senha
  ou código fica no campo do diálogo (§4.8); a chave digitada continua no campo da página (nunca em rascunho).
- **Modelo**: texto, padrão `gemini-2.5-flash`, ajuda "Use o identificador exato do modelo."
- **Testar conexão** (`role=status`): "Conexão confirmada: o modelo gemini-2.5-flash respondeu em 0,8 s."
  · "O Google recusou a chave (403). Confira se ela está ativa e com acesso à API Gemini." · "Modelo não
  encontrado (404). Confira o nome." · "Limite de uso do projeto atingido (429). Tente mais tarde." ·
  "Sem resposta em 15 s. Tente de novo."
- **Limites**: "Mensagens por aluno por hora", "Mensagens por aluno por dia", "Caracteres por mensagem" e
  **"Mensagens por dia, somando todos os alunos"** (`limites.mensagensPorHora`, `mensagensPorDia`,
  `caracteresPorMensagem`, `mensagensGlobaisPorDia`), com a ajuda do último: "Ao atingir este teto, o assistente
  fica indisponível para todos até a meia-noite (horário de Brasília). Protege o custo da conta do Google." (valor
  proposto pela API, a confirmar pela coordenação, P4). Os prazos de guarda (conversas e trilha técnica) ficam em
  Privacidade e dados (retenção). Texto do consentimento ao aluno: só leitura, o mesmo `texto` que o aluno vê
  (DC-39).
- **Uso** (`GET /portal/admin/configuracoes/assistente-ia/uso`, agregado, sem aluno): `pf-kpis` (30 dias) —
  Conversas (`totais.conversas30d`) · Levadas à equipe (`totais.escalonadas30d`) · Teto diário (`tetoGlobal.porDia`,
  com o marcador "Teto atingido hoje" (aviso) quando `tetoGlobal.atingidoHoje`) — e tabela + `pf-barras` por dia:
  dia · mensagens · levadas à equipe (`escalonadas`) · tokens de entrada · tokens de saída. Link "Atendimentos
  abertos pelo assistente" → `#/atendimento?origem=ia` (a fila mostra o total real).
- **Trilha das respostas** (`#/configuracoes/ia/trilha`; checklist §8 do blueprint; L5 em parte, D-50): visão só de
  **metadados** de cada resposta do assistente, sem o texto de perguntas e respostas. `pf-alerta--info` fixo no
  topo: "Cada consulta fica registrada na auditoria. A trilha não contém o texto das conversas." Filtros: **De** e
  **Até** (padrão: últimos 7 dias; intervalo máximo de 92 dias, validado antes de enviar: "Escolha um intervalo de
  até 92 dias.") e **Aluno** (opcional; busca por nome ou e-mail com `GET /portal/admin/usuarios?q=`, mínimo 3
  caracteres). A consulta só roda em [Consultar] (nunca ao abrir a tela, porque cada consulta é auditada). Tabela
  (`GET …/assistente-ia/trilha`, 50 por página, "Carregar mais"): **Quando** · **Aluno** (link `#/alunos/:id`) ·
  **Modelo** · **Versão da instrução** · **Ferramentas** (nomes legíveis, separados por "·") · **Fontes** (títulos
  dos trechos do regulamento) · **Levada à equipe** (Sim · Não) · **SHA-256 da resposta** (`pf-codigo`, hash curto
  com cópia completa; serve para conferir uma cópia anexada a um atendimento). A linha expande e mostra também
  "Bloqueada pelo filtro de segurança", "Sugeriu falar com a equipe" e tokens. Vazio: "Nenhuma resposta no
  período." Ler o **conteúdo** das conversas pela coordenação continua fora (L5: depende de base legal e de novo
  texto de consentimento, P15).

**Regulamento acadêmico** (`#/configuracoes/regulamento`) — **Fatia: F6a** (`prof-configuracoes.js`; o `fatiar` do
`rag.js` é da F6a, D-39)
- Editor em `pf-leitura` com marcação mínima (linha iniciada por "# " = título de seção); [Salvar
  rascunho] · [Publicar edição] (diálogo "Publicar a edição 4? O assistente passa a consultar este texto e os alunos
  passam a ver esta edição em Regulamento acadêmico."; a palavra é "edição", como no campo `edicao` da API). Situação
  "Edição 3 publicada em 02/10/2026 por … · 42 trechos consultáveis pelo assistente" (contagem real) + link "Ver como
  o aluno vê" → `regulamento.html` (§6.20). Histórico de edições. Vazio: "Nenhum regulamento publicado. Sem ele, o
  assistente responde só com os dados do aluno e encaminha dúvidas de regras para a equipe."

**Privacidade e dados** (`#/configuracoes/privacidade`) — **Fatia: F6a** (`prof-configuracoes.js`)
- Encarregado (nome, e-mail, telefone opcional). Vazio: "Encarregado não configurado. O canal Meus dados
  mostra só o e-mail da coordenação até que um nome seja informado." Nunca preencher por sugestão.
- Retenção (D-25): **automática** só onde há expiração no banco — "Conversas com o assistente" e
  "Notificações" (30 a 730 dias, padrão 180) e **"Trilha técnica do assistente"** (180 a 1.825 dias; padrão
  proposto 730, a confirmar, P4; ajuda "Registro sem o texto das conversas, mantido para auditoria mesmo depois
  que o aluno apaga o histórico.") + [Reaplicar prazos] (recalcula as datas de expiração e informa quantas mudaram
  em cada uma: "Conversas: N · Notificações: N · Trilha: N"). Nos prazos de conversas e da trilha, a ajuda lembra:
  "O aluno vê este prazo no texto de autorização do assistente." Para as demais categorias (Cadastro · Documentos pessoais · Frequência e
  avaliações · Lançamentos financeiros · Contratos e evidências · Protocolos e ouvidoria · Auditoria): base
  legal (só leitura) e **prazo descritivo** em texto ("enquanto durar a matrícula + 5 anos"), com a nota
  "Exclusão ou anonimização ao fim do prazo é feita pela coordenação, com apoio do relatório Retenção."
  Prazo vazio = "A definir" (aviso) e aviso na Visão geral.
- Atalho [Pedidos dos titulares] → `#/atendimento?categoria=privacidade` (fila da categoria **Privacidade
  e dados pessoais**, com o prazo de 15 dias calculado pelo servidor; §7.10).

**Instituição** (`#/configuracoes/instituicao`) — **Fatia: F6a** (`prof-configuracoes.js`)
- Descrição: "Dados do emissor das declarações financeiras anuais (quitação). Nada é preenchido automaticamente."
- Formulário (`GET` · `PUT /portal/admin/configuracoes/instituicao`, com `versao`): **Razão social** * (3–160) ·
  **Nome fantasia** (opcional) · **CNPJ** * (máscara 00.000.000/0000-00, `inputmode="numeric"`, dígitos
  verificadores conferidos ao sair: "CNPJ inválido. Confira os números.") · **Endereço** (`textarea` opcional de até
  3 linhas e 300 caracteres, com contador; `instituicao.endereco` é texto multilinha, D-54 e). Na primeira gravação,
  só o botão [Salvar dados da instituição]; ao **alterar** dados já salvos, o campo "Motivo (fica registrado na
  auditoria)" (10–500) é obrigatório, porque muda o emissor das próximas declarações (`motivo` no `PUT`, gravado em
  `config.instituicao_alterada`; sem ele, 400 `campos.motivo` no campo; D-54 d). Ajuda fixa:
  "Declarações já emitidas mantêm os dados da época."
- Situação no topo: "Cadastrado em dd/mm/aaaa" (sucesso) ou, sem dados, o vazio **"Dados da instituição não
  cadastrados: a declaração anual de quitação fica indisponível."** (marcador "Não cadastrado", aviso) — o mesmo
  aviso aparece em "Avisos do sistema" da Visão geral (§7.2, `sistema.instituicaoPendente`, D-54 c) e leva para cá. Conflito de versão → 409
  `conflito-versao` com [Recarregar].

**Critérios dos cursos** (`#/configuracoes/cursos`) — **Fatia: F3b** (`prof-certificacao.js`)
- Tabela: **Curso** · **Sigla** · **Nível** · **Nota mínima** (padrão 7,0) · **Frequência mínima** ·
  **Carga mínima** · **TCC** · **IES parceira**.
- Editar (`pf-detalhe`): Sigla · Nível (Curso livre · Extensão · Aperfeiçoamento · Pós-graduação lato
  sensu — inativa com "Exige IES parceira cadastrada." enquanto não houver) · Nota mínima (0–10, passo
  0,5) · Frequência mínima (%) · Carga horária mínima (h) · `pf-switch` Exige TCC · IES parceira. Mudar a
  nota mínima pede motivo (auditado); sem prévia do efeito nesta rodada (D-22): a ajuda diz "A situação dos
  alunos é recalculada com a nova nota mínima; matrículas concluídas não mudam." Avisos não bloqueantes do
  servidor, em `pf-alerta--aviso --compacto` na linha do curso e no painel de edição (ex.: lato sensu com carga
  mínima abaixo de 360 h; **"TCC exigido sem avaliação publicada"** quando o curso exige TCC e o módulo do tipo TCC
  ainda não tem avaliação modular publicada, D-53). O módulo de TCC é marcado no editor de conteúdo ("Tipo do módulo",
  §7.16); sem módulo de TCC, o certificado mostra a pendência `tcc` ao aluno (§6.9).
- **Instituições parceiras** (D-26): nome *, sigla, CNPJ * (dígitos verificados), ato de credenciamento
  (texto), site (https), ativa; ajuda normativa (tela da coordenação, pode citar o MEC, §9): "Cadastre
  somente com parceria formalizada. Sem IES parceira, a plataforma não oferece pós-graduação lato sensu nem
  afirma reconhecimento pelo MEC." Vazio: "Nenhuma IES parceira cadastrada."

### 7.23 Relatórios — `#/relatorios`, `#/relatorios/:painel`

**Fatia: F7** (`prof-relatorios.js`; cada fatia registra o seu relatório) · professor (grupo Ensino do menu) e
coordenação (grupo Gestão), com o mesmo componente; o servidor decide o que cada papel vê (API §6.11.3).

- **Índice** em lista (não grade), montado pelo catálogo do papel (`GET /portal/professor/relatorios`, que já vem
  filtrado; o front não esconde nem acrescenta itens): título do servidor + uma frase do que mostra. Dois grupos:
  - **Painéis** (KPIs, barras e tabela): Alunos por curso e turma · Progresso · Notas · Frequência · (coordenação)
    Documentos pendentes · Financeiro · Atendimentos;
  - **Tabelas para exportar** (relatórios sem `resumo`, abrem direto na tabela): Tentativas · Correções pendentes ·
    Presenças · (coordenação) Contratos · Ouvidoria · Retenção · Diversidade (só leitura em tela, sem CSV; células
    com menos de 5 pessoas aparecem como "<5").
  - Professor vê: Alunos por curso e turma, Progresso, Notas, Frequência, Tentativas, Correções pendentes e Presenças.
    Descrição do índice para ele: "Dados das turmas e cursos em que você leciona."
- **Filtros**: curso e turma (`select`) limitados à docência (`GET /portal/professor/cursos` e as turmas de cada um;
  admin vê todos) + período. Curso fora da docência no hash (403 `nao-docente`): o filtro volta a "Todos os seus
  cursos" com `pf-alerta--info` "Este curso não está entre os que você leciona." Professor só de turma não vê a opção
  "Todas as turmas" do curso.
- **Painel**: filtros → até 4 KPIs reais (`resumo.kpis`; `null` = "—" + motivo) → `pf-barras` (`resumo.series`:
  alunos por turma; média por módulo; frequência por encontro; documentos pendentes por tipo; recebido × em aberto por
  mês; atendimentos por categoria e tempo até a 1ª resposta) → tabela (20 linhas + "Carregar mais") → secundário
  [Exportar CSV]. As colunas são as que o catálogo devolve para o papel: para o professor, sem as `somenteAdmin`
  (e-mail, celular, documentos, contrato e lançamentos do aluno); a tela nunca mostra coluna que não veio.
- **Erros**: 413 `relatorio-grande` → "O resultado passa de 20.000 linhas. Filtre por curso, turma ou período."; 429
  → mensagem do servidor (limite de 20 consultas por hora); 404 de relatório fora do papel → §7.21.
- CSV: UTF-8 com BOM, separador ";", cabeçalhos em português, datas dd/mm/aaaa, decimais com vírgula,
  proteção contra fórmula. Aviso ao exportar: "O arquivo contém dados pessoais de alunos. A exportação fica
  registrada na auditoria." CPF nunca vai em CSV. O professor também exporta notas e frequência de uma turma pela
  página da turma (§7.4); é o mesmo relatório, já filtrado.

### 7.24 Auditoria — `#/auditoria`

**Fatia: F7** (tela, registrada pela F7 conforme o índice §6.3; API de auditoria da F0t).

- `pf-alerta--info` "Registros de auditoria não podem ser editados nem apagados."
- Filtros: período (7 · 30 · 90 dias · personalizado), pessoa, área (Notas · Frequência · Cadastro ·
  Financeiro · Contratos · Documentos · Papéis e equipe · Configurações · Exportações · Assistente de IA ·
  Ouvidoria), busca por objeto (nº de matrícula, protocolo, e-mail).
- Tabela: **Quando** ("18/10/2026 · 21:14:03") · **Quem** (nome + papel) · **Ação** (frase: "concedeu
  nova tentativa", "alterou a nota mínima de 7,0 para 6,0") · **Objeto** (link) · **Motivo**. Linha
  expande: antes → depois por campo; segredo mascarado. [Exportar CSV].

### 7.25 Parcerias — `parcerias.html`

**Fatia: F8**. Item "Parcerias ↗" em Gestão abre a página própria (mesma aba). Recebe `data-shell=
"backoffice" data-shell-ativo="parcerias"`, o `<head>` de §2.1 e o reskin de `parcerias-admin.css` (selo
verde neon → `pf-estado`; `pa-tabela-wrap` sem rolagem horizontal → lista empilhada abaixo de 44em).
A página mantém a **guarda própria** de `parcerias-admin.js` (`#pa-restrito` e `login.html?next=parcerias.html`; não usa
a guarda padrão do `DMC_Portal`, D-48): o shell do backoffice é montado só para admin, sem redirecionar ninguém, por
`DMC_Shell.montar('parcerias', { area:'backoffice', itens: DMC_Professor.itensDoMenu('admin') })` chamado em
`parcerias-admin.js` (D-75), com os links `professor.html#/<rota>` (D-66). As rotas e `parcerias.spec.js` não mudam;
`parcerias-admin.js` só ganha essa montagem; o `header.app-nav` próprio sai. Detector de neon e axe de cor completos
nesta página no G1 da F8 (no G0 ela fica em `PAGINAS_PENDENTES_G0`, D-67).

---

## 8. Páginas públicas, documentos e acesso por link

Sem shell, sem guarda de papel (exceto `declaracao.html`), sempre em **papel** (claro, independente do
tema), `noindex`, rodapé com link para o site. `pre-pintura.js` não aplica tema escuro nelas.

### 8.1 Validação pública — `validar.html?codigo=`

**Fatia: F3b** (página e despacho único `GET /portal/validar/:codigo` + `conferir`, em `routes/portal-declaracoes.js`,
D-38) · `validar.js`. Validadores por prefixo (grupo `validador`, D-03, D-78): `DMC` e `DEC` da F3b, `FRQ` da F3a,
`AVL` da F2, `CTR` da F4b.

- Topo: rinoceronte em grafite + "COMPLEXO **DMC**" (DMC em `--color-gold-deep`) + "Validação de
  documentos". H1 "Validar *documento*".
- Formulário: "Código de validação" (aceita colar, ignora espaços e caixa) + [Validar]. O QR já traz
  `?codigo=` e valida ao abrir.
- **Válido** (marcador de sucesso "Documento válido"): tipo (Certificado · Declaração de matrícula ·
  Declaração de frequência · Declaração de conclusão · Declaração financeira anual · Comprovante de
  frequência · Comprovante de avaliação · Contrato assinado), emitido ou assinado em, **iniciais do
  titular** ("J. S."), curso e nível quando houver, código e **hash** abreviado em grupos (`hashPrefixo` do
  despacho, 16 hex em grupos) com a instrução "Compare com o código impresso no documento."; certificado emitido
  antes desta rodada (`hashPrefixo:null`): no lugar do hash, "Emitido antes da verificação por selo" (DC-65, D-53).
  Contrato aparece com o rótulo genérico "Contrato de prestação de serviços educacionais", nunca com o título livre
  da coordenação (D-03). Campo **Conferir nome do titular** + [Conferir]
  → "O nome confere com o titular deste documento." / "O nome não confere." (nunca devolve o nome).
- **Revogado, cancelado ou anulado** (aviso): "Este documento foi revogado em dd/mm/aaaa." /
  "…cancelado…" / "Este registro foi anulado em …".
- **Não encontrado** (erro): "Não encontramos documento com este código. Confira as letras e os
  números." Sem revelar se o código "quase" existe.
- **Limite**: "Muitas consultas seguidas. Tente em alguns minutos."
- Nunca exibe CPF, e-mail, matrícula completa ou nota individual.

### 8.2 Certificado — `certificado.html?codigo=`

**Fatia: F3b** (`declaracao.js` em modo certificado, `qr.js`; D5: o link antigo continua validando e imprimindo).
O hash abreviado vem do `hashPrefixo` do despacho (`GET /portal/validar/:codigo`); com `null`, o rodapé diz "Emitido
antes da verificação por selo" no lugar do hash (DC-65, D-53).
Folha A4 em papel: rinoceronte em grafite, "COMPLEXO **DMC**", título Newsreader 300 ("Certificado"),
nome do aluno em Newsreader (o `cert-doc__nome`), curso, carga horária, nível cadastrado (sem MEC; curso
lato sensu não tem certificado da plataforma: é emitido pela IES, 409 `certificado-pela-ies`), data, código, QR (28 mm,
zona de silêncio de 4 módulos, D-47, D-68) para `validar.html?codigo=`, hash abreviado. Cor `#0a7d8c` vira
`--color-gold-deep`; logotipo turquesa sai. [Imprimir ou salvar em PDF] some na impressão.

### 8.3 Declaração — `declaracao.html?id=<id>` (D-13)

**Fatia: F3b** (`declaracao.js`, `qr.js`) · acesso do titular ou da coordenação; o código de validação leva a
`validar.html?codigo=`.
Folha A4 (margem 18 mm, `pf-documento`, sempre papel): cabeçalho com o rinoceronte e "COMPLEXO **DMC**",
título Newsreader 300, corpo Hanken 11 pt, local e data, rodapé com código, QR (28 mm, zona de silêncio de 4 módulos,
D-47, D-68) + URL de validação e hash abreviado. Texto sóbrio, montado pelo front a partir dos `dados` congelados (API §8.9), sem afirmar
reconhecimento:
- **Curso livre, extensão, aperfeiçoamento ou nível não definido**: "Declaramos que <nome de registro> está
  matriculado(a) no curso <curso> (<nível, se definido>), carga horária de <N> h, matrícula <MAT>, com início
  em <data>." (frequência e conclusão seguem o mesmo molde, com os números do servidor).
- **Pós-graduação lato sensu com IES cadastrada** (matrícula e frequência; a conclusão é da IES, 409
  `certificado-pela-ies`): redação fixa "Declaramos que <nome de registro> está matriculado(a) no curso de
  pós-graduação lato sensu <curso>, ofertado por <IES> (<ato de credenciamento>), com execução pelo Complexo
  DMC, matrícula <MAT>, com início em <data>." Sem ato cadastrado, o parêntese não aparece. Nenhuma outra
  frase menciona MEC ou reconhecimento. Redação marcada para revisão jurídica (P14).
- A declaração financeira anual lista os pagamentos do ano (data, referência, valor) e o total; nenhum dado
  inventado. [Imprimir ou salvar em PDF].

### 8.4 Comprovantes imprimíveis

- **Comprovantes de frequência e avaliação** (`comprovantes.html`, modo impressão, F3a): §6.11 — cada linha com o
  próprio código (`FRQ-…` ou `AVL-…`) e o hash abreviado, a URL de `validar.html` no rodapé e **nenhum QR** (D-16,
  D-72; a matriz do índice marca o item como "C · A"). O G1 da F3a confere código, hash e URL na impressão.
- **Comprovante de assinatura** (`contrato.html?id=`, modo comprovante, F4b): título do contrato,
  matrícula, signatário (nome de registro), data e hora (horário de Brasília), versão e texto do aceite,
  SHA-256 completo do PDF, código `CTR-…`, IP truncado e navegador, QR para `validar.html?codigo=` (28 mm, zona de
  silêncio de 4 módulos, conferido por `tests/e2e/_qr.js`, D-68).

### 8.5 Acesso por link — `acesso-link.html`

**Fatia: F0p** (D-59, D-71; rotas da F0t) · `acesso-link.js` · página pública, sem shell. Faz duas coisas: **pedir** um link
(de acesso ou para criar nova senha) e **usar** o link que chegou por e-mail. O modo vem do fragmento; o token, quando
há, é apagado do endereço (`history.replaceState`) antes de qualquer chamada. O e-mail digitado nunca vai para a URL.
- Layout do login da 2d (mesma marca, `pf-campo` igual ao `bs-input`), em coluna única de 28rem; link "Voltar à
  entrada" (`login.html`) no pé de todos os modos.
- **Pedir** — telas da principal (D-71): os formulários de pedir link e de criar nova senha são desta página; a 2d só
  põe no login os dois links "Receber link de acesso" → `acesso-link.html#pedir-link` e "Esqueci minha senha" →
  `acesso-link.html#esqueci`, quando `DMC_Auth.recursos()` diz que existem (índice §5.5 item 4; P17 atendida). Os
  e-mails levam a `acesso-link.html#acesso=`/`#redefinir=`, nunca ao `login.html`. Até o aceite do login da 2d
  (índice §9.9 item 1a), a entrada é só por e-mail e o 2FA fica desligado (`PORTAL_2FA` ausente): o passo do código
  em `#acesso=` só aparece para conta com 2FA ativo. Modos:
  - `#pedir-link` — H1 "Receber link de *acesso*", campo E-mail (`type=email`, `autocomplete="email"`), primário
    [Receber link de acesso] → `DMC_Auth.pedirLinkMagico(email)`;
  - `#esqueci` — H1 "Criar nova *senha*", campo E-mail, primário [Enviar link para criar nova senha] →
    `DMC_Auth.esqueciSenha(email)`.
  - Resposta (202): **sempre** a `mensagem` genérica do servidor em `role=status` (ex.: "Se houver uma conta com esse
    e-mail, enviamos um link de acesso válido por 15 minutos."), com ou sem conta (anti-enumeração, API §6.1), + "Não
    chegou? Confira a caixa de spam ou peça de novo em alguns minutos." O botão fica inativo por 60 s.
  - Indisponível — `recursos().linkMagico` (ou `recuperacaoSenha`) falso, verificado ao abrir, ou 503
    `email-indisponivel` no envio: no lugar do formulário, "O envio de e-mail não está configurado. Peça uma senha
    temporária à coordenação." + [Voltar à entrada]. 429: a mensagem do servidor ("Muitas tentativas…").
  - Com sessão aberta: "Você já está conectado como <e-mail>." + [Ir para o portal] (`DMC_Auth.destinoInicial()`),
    sem o formulário.
- **Usar** o link (`#acesso=`, `#redefinir=`, `#email=`, `#verificar=`): "Verificando seu link…" (`aria-busy`) →
  - `#acesso=` → sucesso leva ao destino do papel; 2FA ativo: "Digite o código do aplicativo autenticador." (6
    dígitos, `one-time-code`, colar permitido) e, confirmado, o destino;
  - `#redefinir=` → "Nova senha" e "Confirmar nova senha" com a regra visível antes de digitar (8 a 72 caracteres,
    diferente do e-mail e do CPF) e [Mostrar senha] → "Senha alterada. Entre com a nova senha." + [Ir para a entrada]
    (a redefinição não loga, para não pular o 2FA);
  - `#email=` (troca de e-mail) → "E-mail alterado. Entre de novo com o novo endereço." + [Ir para a entrada]; 409
    `email-em-uso`: "Este e-mail já está vinculado a outra conta. Fale com a secretaria.";
  - `#verificar=` → "E-mail confirmado." + [Ir para o portal] (ou [Ir para a entrada] sem sessão);
  - link vencido, usado ou inválido (410 `link-invalido`): "Este link expirou ou já foi usado." + primário **[Pedir
    novo link]**, que leva a `#pedir-link` (link de acesso) ou a `#esqueci` (link de redefinição) sem sair da página;
    em `#email=` e `#verificar=` o pedido de novo link é feito logado (Perfil), então o botão é [Ir para a entrada].
- Teste em `portal-titular.spec.js` (F0p): pedir link e pedir redefinição com e sem conta (mesma mensagem), 503
  `email-indisponivel` e `recursos()` falso (formulário some, texto honesto), link vencido → [Pedir novo link] →
  `#pedir-link`, fragmento apagado antes da chamada e e-mail ausente da URL.

---

## 9. Microcopy

**Tom**: informativo, frase curta, segunda pessoa ("você"), sem exclamação, sem "parabéns", sem promessa
("garantido", "sucesso", "transforme"), sem urgência comercial (Provimento 205/2021). Títulos:
"<Tela> · Plataforma Complexo DMC"; no backoffice, "<Seção> · Portal do Professor · Plataforma Complexo
DMC" (ou "Coordenação"). A EAD não é renomeada para Business School nas páginas internas.

**Botões**: verbo no infinitivo + objeto ("Enviar documento", "Assinar contrato", "Gerar declaração",
"Iniciar atendimento", "Publicar correção", "Conceder nova tentativa"). Caixa de sentença. Nada de "OK",
"Enviar" solto ou "Clique aqui". **Toast**: particípio + ponto ("Encontro salvo.").

**Formatos** (`DMC_UI.fmt`, `pt-BR`, `America/Sao_Paulo`): data 18/10/2026; data longa "18 de outubro de
2026"; lista "sex., 24/10 · 19:30"; hora 14:05 (24 h; documentos dizem "horário de Brasília"; navegador em
outro fuso ganha o sufixo); relativo "há 2 dias" com a data completa no detalhe; dinheiro "R$ 1.234,56"
(a API manda centavos); nota "7,5" (vírgula, 1 casa); percentual "76%"; carga "42 h"; intervalo
"19:00–22:00"; protocolos e códigos em maiúsculas com hífen (`MAT-2026-000123`, `ATD-2026-K7M2QX`,
`OUV-…`, `CTR-XXXX-XXXX-XXXX`, `APE-M01-A01`).

**Vocabulário fixo** (as mesmas palavras em todas as telas): curso · módulo · conteúdo · plano de ensino ·
material de apoio · aula gravada · aula ao vivo / encontro · avaliação (Atividade prévia, Atividade
modular) · tentativa · nota · nota mínima · frequência · situação · matrícula · turma · enturmação ·
lançamento · 2ª via · atendimento (protocolo) · manifestação (ouvidoria) · declaração · certificado ·
contrato · comprovante · coordenação · professor/professora · secretaria · assistente acadêmico. Pessoa:
sempre o **nome social** quando informado; nome de registro só nas telas de secretaria, rotulado.

**Proibidos** em texto **visto pelo aluno** (portal do aluno, documentos, notificações, e-mails) e em
páginas públicas: "pós-graduação" (exceto o rótulo de nível vindo do cadastro de curso com IES parceira e
a redação fixa da declaração, §8.3), "MEC", "reconhecido", "diploma" como entrega do curso. Telas da
coordenação podem citar o MEC e a pós-graduação em **ajuda normativa** (Critérios dos cursos, IES, avisos
de carga mínima) e nas opções do campo Nível. Em **todo** texto do portal: "garantia de resultado", números
de satisfação ou aprovação sem fonte (D7), nome de persona para a IA, "BETA", "instrutor", jargão de TI
("payload", "sync"), emojis (também em comentários do HTML), exclamação, nome de gateway ou de pagamento on-line que
não está contratado ("Mercado Pago", "pague on-line", "liberação automática"; E1) e promessa de envio ou prazo que
o sistema não cumpre ("você receberá por e-mail em até 1 dia útil"). A revisão de textos da fase 2
aplica a regra por público, não por palavra solta.

**Estados vazios** (o que não há + o que fazer): "Nada pendente no momento." · "Você ainda não tem um
curso liberado." · "Nenhum lançamento registrado na sua conta." · "Nenhum documento exigido no momento." ·
"Nenhum contrato disponível para você." · "Nenhum encontro ao vivo agendado para os seus cursos." ·
"Você ainda não abriu nenhum atendimento." · "Nenhuma manifestação registrada." · "Nenhuma publicação
para você ainda." · "Nenhuma notificação." · "Nenhuma matrícula encerrada." · "Nenhum registro no
período." · "Nenhum certificado emitido ainda." · "Nenhuma dissertativa aguardando correção." ·
"Nenhuma dúvida em aberto nos seus cursos." · "Nenhuma manifestação encaminhada a você." · "Nenhuma resposta no
período." (trilha do assistente) · "Você ainda não está vinculado a nenhum curso. A
coordenação faz esse vínculo em Equipe." · "Nenhuma IES parceira cadastrada." · "Nenhum regulamento
publicado. …".

**Erros** (o que houve + o que fazer, sem código técnico na frase): "Não foi possível carregar <coisa>."
+ [Tentar de novo] · "Sua sessão terminou. Entre de novo para continuar; o que você digitou foi
guardado." (só nos formulários com rascunho, §10 item 6; nos demais: "Sua sessão terminou. Entre de novo para
continuar.") · "Este registro já existe." (409 `registro-duplicado`, D-42) · "Você não tem acesso a este conteúdo." · "Sem conexão. Verifique a internet e tente de
novo." · "Alguém alterou este registro enquanto você editava. Recarregue para ver a versão atual." +
[Recarregar] · campo: "<Campo> inválido. <Como corrigir>." · "Arquivo maior que 4 MB." · "Formato não
aceito. Envie PDF, JPG ou PNG."

**Confirmações destrutivas**: título em pergunta ("Apagar esta conversa?"), consequência em uma frase
com número, botões "Cancelar" e o verbo; foco começa em "Cancelar".

---

## 10. Carregando, vazio e erro (regra geral)

1. Shell e `pf-cabecalho` aparecem na hora; só a região de dados espera. Primeira carga = **esqueleto**
   com a forma final (`pf-esqueleto`), região com `aria-busy="true"` e texto oculto "Carregando <coisa>".
   Nunca spinner sequencial (defeito apontado no blueprint). No máximo 2 idas ao servidor em série depois
   da sessão; no backoffice, resumo e lista em paralelo.
2. Ação do usuário: botão com `aria-busy`, rótulo "Salvando…"/"Enviando…" e inativo; depois de 10 s,
   "Ainda processando…". Resultado em `pf-toast` ou `role=status` local.
3. Vazio honesto (§9), com uma ação quando existe. Filtro sem resultado diz o filtro ("Nenhum lançamento
   em atraso.") e oferece [Limpar filtros].
4. Erro de carga no lugar do conteúdo (`pf-alerta--erro` + [Tentar de novo] + código recolhido), sem
   derrubar a página. Erro de ação em `pf-toast--erro` (não some sozinho) ou no campo.
5. Fonte parcial (um serviço indisponível): o bloco mostra "—" + "Informação indisponível no momento.";
   nunca 0 nem número estimado.
6. 401 no meio do uso: ida a `login.html?next=<página>` (corrige `app.js:56`) e, **só nos formulários marcados com
   `data-pf-rascunho`**, rascunho em `sessionStorage` (`dmc:rascunho:<pagina>`) restaurado na volta. Nunca vão a
   rascunho (D-47, índice §7.4): campo de senha, código de verificação, campo com dado pessoal (nome, e-mail,
   telefone, nascimento, endereço, CEP, país) nem nada de Perfil, Meus dados, assinatura de contrato, Senha e
   segurança e Assistente; nessas telas a mensagem não promete que o texto foi guardado. 403 `troca-de-senha-obrigatoria` (D-01) → modo restrito
   (§5): `perfil.html#seguranca`, sem redirecionar de novo quando já está lá.
   403 comum → `pf-vazio` "Você não tem acesso a este conteúdo." (ou §7.21 no backoffice). 404 de registro
   → "Não encontramos este <registro>." + link para a lista. 409 de versão → alerta com [Recarregar].
   Rede caída → toast de erro "Sem conexão…" e nova tentativa manual.
7. Endpoint opcional ausente (fatia ainda não integrada): silêncio na faixa e nos contadores; a tela que
   depende dele mostra o erro de carga normal. Nos testes da fase 1, esses 404 só são tolerados pela lista fechada do
   `monitorarConsoleERede` (fatias fora de `QA_INTEGRADAS`, D-73); no G2 nenhum é tolerado.

---

## 11. Acessibilidade (WCAG 2.2 AA — critério de aceite)

- **Estrutura**: `lang="pt-BR"`; `<title>` único por tela e por rota do backoffice; `a.dmc-skip` "Pular
  para o conteúdo" → `main#conteudo`; landmarks `header` (topo), `nav` (menu principal, subnavegação,
  navegação do módulo), `main`, `aside` (lateral, conversas da IA), `footer`. Um H1 por página ou rota;
  títulos sem salto.
- **Teclado**: tudo operável; ordem de foco = ordem visual; só gaveta e diálogo prendem o foco (de
  propósito); Esc fecha gaveta, diálogo, busca, sino, conta, popover, dica e tour, devolvendo o foco;
  atalho só com modificador (Ctrl/⌘ K). Foco visível sempre (outline 2 px ouro / ouro profundo, ≥ 3:1),
  inclusive em linha de tabela e item de lista.
- **Foco não encoberto (2.4.11)**: `scroll-padding-top` = topo + faixa + 16 px; no player,
  `scroll-padding-bottom` = rodapé fixo + 16 px; barras fixas do mobile idem; `pf-detalhe` é coluna, nunca
  sobreposição (§4.8). **Foco não cortado**: interativo dentro de contêiner com rolagem usa `outline-offset:
  -2px` (§4.3).
- **Alvos (2.5.8)**: 44×44 em todo controle (links do rodapé e links de ação soltos inclusive, §5.6,
  §4.11); itens de lista no mobile com 48–56 px. Única exceção registrada: dia do Mês do calendário abaixo
  de 22em (≈ 40 × 44 px, §4.13).
- **Arrastar (2.5.7)**: upload tem botão; reordenar tem ↑↓.
- **Ajuda consistente (3.2.6)**: Tutoriais/Ajuda e Atendimento no mesmo lugar em todas as páginas.
- **Entrada redundante (3.3.7)**: CEP preenche o endereço; o perfil preenche atendimento, declaração e
  assinatura; nada é pedido duas vezes no mesmo fluxo.
- **Autenticação acessível (3.3.8)**: colar permitido em senha e código; `autocomplete` correto;
  "Mostrar senha"; sem teste cognitivo.
- **Tempo (2.2.1)**: sessão de 7 dias; formulário não expira em silêncio; cronômetro da avaliação avisado
  antes de começar, com alertas aos 10, 5 e 1 minuto; autossalvamento na correção e nas dissertativas; toast
  com ação não some sozinho (DC-10).
- **Movimento (2.2.2)**: "Ao vivo agora" pulsa 3 vezes e para; nada se move sozinho por mais de 5 s (§2.6).
- **Componentes ARIA**: abas (setas, Home, End, tabindex móvel); segmentado (`aria-pressed` em grupo
  rotulado); sanfona (`button[aria-expanded][aria-controls]`); combobox da busca (ARIA 1.2); diálogos
  (`<dialog>` + `showModal()`, `aria-labelledby`); painel do sino (diálogo não modal, sem `aria-live`
  automático, contagem no rótulo); calendário por teclado; `role="timer"` no cronômetro; `role="log"` no
  chat.
- **Tabelas**: `<caption>`, `th[scope]`, `aria-sort`; matriz com `th` de linha e de coluna e glifo +
  texto oculto; empilhada com `role`s explícitos.
- **Formulários**: rótulo visível ligado; obrigatório no atributo e na legenda; erro com texto e glifo por
  `aria-describedby`, `aria-invalid`; resumo de erros focável; máscara que aceita colar.
- **Mídia**: iframe com `title`; vídeo nativo com `<track kind="captions">` quando houver legenda (falta de
  legenda é pendência de conteúdo, não de interface); nada toca sozinho.
- **Cor e contraste**: tabelas §2.2 e §2.3; cor nunca sozinha (glifo + texto); nenhum indicador de estado
  em ouro (DC-17); blocos de escopo invertido (herói, palco, capa, `pf-leitura`, `pf-documento`) entram no
  axe dos dois temas.
- **Alto contraste do Windows** (`@media (forced-colors: active)` em `portal.css`): o modo apaga
  `background` de bloco e de pseudo-elemento, então todo indicador desenhado por fundo ganha equivalente:
  aba atual (`pf-abas`) e opção pressionada (`pf-segmento`) → `border-bottom: 2px solid Highlight` (ou
  `forced-color-adjust: none` + `background: Highlight` no `::after`); item de menu atual e item atual do
  player → `border-left: 2px solid Highlight`; `pf-progresso`, `pf-barras` e o arco do `pf-donut` →
  `forced-color-adjust: none`, preenchimento `Highlight` sobre trilho com borda 1 px `CanvasText`;
  `pf-switch`, `pf-check` e `pf-radio` → borda e botão/marca em `CanvasText` (marcado: `Highlight`); glifos
  de estado com `fill`/`stroke: CanvasText`; alvo do tour com `outline-color: Highlight`; foco sempre por
  `outline` (nunca `box-shadow`); nada de texto transparente. `portal-qualidade.spec.js` captura cada
  componente com `emulateMedia({ forcedColors: 'active' })` para revisão e confere que aba atual, item atual
  e progresso continuam distinguíveis.
- **Reflow e espaçamento (1.4.10, 1.4.12)**: 320 px sem rolagem horizontal no nível 2 de texto; texto
  aguenta 1,5 / 2 / 0,12 / 0,16 sem corte (sem altura fixa em bloco de texto).
- **Movimento**: §2.6; nada pisca acima de 3 Hz.
- **Anúncios**: `role=status` para salvo, copiado, presença registrada, aula concluída, resultado da busca,
  troca de rota; `role=alert` só para erro que bloqueia a ação.
- **Libras/VLibras**: fora (decisão do CEO, EXCEÇÃO 2); nenhum script de terceiro em página autenticada.
- **QA**: axe sem violação séria ou crítica em toda página e em cada rota do backoffice, nos dois temas,
  em 1440 e 390, nos estados carregado, vazio, erro, diálogo aberto e gaveta aberta; navegação só por
  teclado nos fluxos críticos (assistir e concluir, fazer avaliação, enviar documento, assinar contrato,
  pedir um curso, pedir link de acesso, corrigir e publicar, criar encontro, publicar avaliação, revisar documento,
  atender um pedido da loja, baixar pagamento, salvar chave da IA).

---

## 12. Impressão

`@media print` em `portal.css` (F0s) vale para toda a plataforma:
- Esconde `pf-topo`, `pf-lateral`, `pf-faixa`, `pf-player__rodape`, `pf-rodape`, botões, filtros e
  tudo com `.pf-nao-imprimir`; mostra `.pf-so-impressao`.
- Força os valores claros de `--pf-*` (fundo branco, texto `--text-ink-1`, ouro → `--color-gold-deep`),
  independente do tema da tela, inclusive dentro dos escopos escuros (§2.2) e com `color-scheme: light`.
- `@page { size: A4; margin: 18mm }` (DC-33); `break-inside: avoid` em linha de tabela, questão, bloco
  de assinatura e cartão de matrícula; cabeçalho de tabela repetido por página (`display:
  table-header-group`).
- QR em 28 mm com zona de silêncio de 4 módulos (`DMC_QR`, margem 4, D-47), **só** em certificado, declaração e
  comprovante de assinatura; os comprovantes de frequência e avaliação levam código e hash abreviado por linha e a URL
  no rodapé, sem QR (D-16, D-72); código de validação, hash e URL de validação por extenso; links internos sem URL
  impressa. A matriz do QR, a zona de silêncio e o lado impresso são conferidos por `tests/e2e/_qr.js` (F0r, D-68); a
  leitura com celular fica na homologação (índice §9.9).
- Documentos (`pf-documento`: certificado, declaração, comprovantes, comprovante de assinatura) nascem em
  papel: na impressão sai exatamente o que está na tela, 1 página por documento curto.
- Telas comuns (Acadêmico, Financeiro, Comprovantes, Regulamento acadêmico) imprimem limpas: H1, filtros aplicados em texto
  ("Período: 01/11/2026 a 30/11/2026"), tabela completa, data e hora de emissão. Como uma A4 com margem de
  18 mm tem ≈ 657 px CSS de largura útil (≈ 41em no nível 0), a container query do modo empilhado (DC-09)
  dispararia no papel. Por isso:
  - o empilhamento e a ocultação das colunas `__secundaria` ficam dentro de `@media screen` (a container
    query vai aninhada nele);
  - em `@media print`: tabela sempre como tabela (`display: table` e família), `__secundaria` visível,
    `html { font-size: 100% }` (o nível A± não vai ao papel), corpo de 10 a 11 pt, e todo
    `pf-matricula`, sanfona (`[aria-expanded]` e o painel ligado) e `<details>` **expandidos** (no
    Acadêmico com várias matrículas, todas saem);
  - o teste de impressão do índice (§9.6) cobre também Acadêmico (2 matrículas), Financeiro e Comprovantes,
    conferindo tabela completa e nenhuma matrícula recolhida.

---

## 13. Matriz de cobertura do blueprint (lado da interface)

Legenda: tela/componente → fatia, com os nomes do índice §8.1 (D-37, D-59, D-78); a primeira fatia da coluna é a dona
da tela. "E1/E2/E3" = exceções do CEO. A matriz de endpoints e coleções é da
spec de back; aqui cada item tem a tela que o mostra ou opera.

| Blueprint | Item | Onde (tela · componente) | Fatia |
|---|---|---|---|
| §1 | Central de atendimento + secretaria + financeiro + LMS num só shell | §5 shell único, menu por papel | F0s · F0b · F8 |
| §1 | IA na porta do atendimento, antes do protocolo | §6.12 Assistente + "Falar com a equipe" em toda resposta e estado; §7.10 origem IA | F6b · F6a |
| §1 | Financeiro: "mesma integração usada no pré-atendimento" | pedido de Cursos disponíveis registrado como atendimento ATD Financeiro (`origem:'humano'` com `pedido`; nomes da API, D-79), com obrigado honesto e o caminho legado quando a rota não existe (§6.19); bloco Pedido para o aluno (§6.12); fila "Pedidos da loja" (`?pedido=1`), bloco Pedido e [Criar matrícula e lançamentos] / [Liberar acesso] (§7.10) com formulários preenchidos e `liberarAcesso:false` (§7.14, §7.18) | F5 · F6a · F0b · F0r · F4a |
| §2 | `inicio` | `dashboard.html` §6.1 | F1b · F1a |
| §2 | `novo_atendimento` · `protocolos` · `ouvidoria` | `assistente.html` · `atendimentos.html` · `ouvidoria.html` §6.12 | F6b · F6a |
| §2 | `academico` · `calendario` | `academico.html` §6.5 · `ao-vivo.html` §6.6 | F3a |
| §2 | `financeiro` | `financeiro.html` §6.7 | F5 |
| §2 | `documentos` · `assinaturas` | `documentos.html` §6.8 · `contratos.html`/`contrato.html` §6.10 | F4b |
| §2 | `declaracoes` · `comprovantes` | `certificados.html` §6.9 · `comprovantes.html` §6.11 | F3b · F3a |
| §2 | `publicacoes` · `perfil` | `publicacoes.html` §6.13 · `perfil.html` §6.15 | F7 · F0p |
| §2 | Shell primeiro, dados depois | §10 esqueleto + `aria-busy` (sem spinner) | F0s · F0b |
| §3.1 | Herói: capa, nome, status, data de início, barra de progresso | `pf-heroi` §6.1 | F1b · F1a |
| §3.1 | CTAs Acessar aulas e Acadêmico | `pf-heroi__acoes` §6.1 | F1b |
| §3.1 | Grid "Meus cursos" com capas verticais | `pf-capas` §6.1, §6.2 (`capaVerticalUrl`, recorte central sem `capaFoco`, D-56); envio da capa vertical no editor §7.16 | F1b · F1a · F8 |
| §3.1 | Player full-screen | `aula.html` em modo foco + tela cheia do vídeo §6.3 | F1b |
| §3.1 | Módulos: miniatura numerada, CH, status, %, check | `pf-modulos` §6.3 (capa do módulo `capaUrl`, D-56); envio da capa do módulo no editor §7.16 | F1b · F1a · F8 |
| §3.1 | Seção 1 Plano de ensino (ementa, objetivos, bibliografia, cronograma) | palco §6.3; edição `DMC_PlanoEnsino` §7.3/§7.16 (bibliografia Básica e Complementar em dois campos, limites visíveis, [Montar a partir das aulas gravadas] pelas `aulas` de `planos`, D-53) | F1b · F1a · F8 |
| §3.1 | Seção 2 Material de apoio: Leitura · Slides · Complementar | `pf-secao` §6.3; categorias no editor §7.16 | F1b · F1a · F8 |
| §3.1 | Seção 3 Aulas gravadas por encontro (Sexta · noite…) | rótulo do encontro §6.3, §7.9, §7.16 | F1b · F1a · F3a · F8 |
| §3.1 | Seção 4 Atividade/Avaliação | `DMC_Avaliacao` no palco §6.4 | F2 · F1b |
| §3.1 | Contador feitos/total por seção | `pf-secao__contador` §6.3 | F1b |
| §3.1 | Rodapé Anterior · "n de N" · Próximo conteúdo / Concluído (linear) | `pf-player__rodape` §6.3 | F1b |
| §3.1 | Vídeo YouTube + Plyr | `DMC_Video` (YouTube, Vimeo, arquivo) com controles do provedor; Plyr não entra (zero libs) | F1b · F1a |
| §3.1 | Código da aula sobre o vídeo | `pf-palco__codigo` + meta com Copiar §6.3; geração pelo `admin.html` ao criar aula e [Gerar códigos que faltam]; "Refazer todos" com motivo (D-54) §7.16 | F1b · F3b · F8 |
| §3.1 → CEO | % assistido e conclusão automática ≥ 90% + botão manual | §6.3 | F1b · F1a |
| §3.2 | Avisos importantes: tentativas, tempo, nº de questões | `pf-avisos-avaliacao` §6.4; prévia em §7.6 | F2 |
| §3.2 | Banco de questões com sorteio; objetivas e dissertativas | §7.6 banco e editor (`orientacao`, `limiteCaracteres`, `respostaReferencia`; tipo "Arquivo (PDF)" no módulo de TCC, D-53); §7.7 correção em rascunho e [Publicar correção] (D-53); §6.4 envio do PDF | F2 |
| §3.2 | Resultado: início/fim, donut de % de acerto, "Você acertou X de Y" | `pf-resultado`, `pf-donut` §6.4 | F2 |
| §3.2 | Melhorar nota · Finalizar e ver gabarito · link Acadêmico | ações adaptativas + `pf-gabarito` §6.4 | F2 |
| §3.2 | Atividade prévia e Atividade modular | §6.4 tipos; §7.6 configuração | F2 |
| CEO 4 | Nota mínima 7, melhor tentativa, situações, nova tentativa auditada; certificado exige aprovação | §6.4, §6.5 (`notaMinima` do `ResumoMatricula`, D-80), §7.7, §7.22 Critérios; §6.9 (regra com a `notaMinima` do GET do certificado, D-80, e `pendencias[]` com o link que resolve, nunca "7,0" literal; confirmação do nome com `nomeOrigem:'conta'`, D-53) | F2 · F3a · F3b |
| §3.3 | Abas Enturmação atual / Histórico | `pf-abas` §6.5 | F3a |
| §3.3 | Card: nº da matrícula, turma, nível, carga total, data, status | `pf-matricula` §6.5 | F3a |
| §3.3 | KPIs: média parcial, frequência geral, disciplinas, carga horária, em andamento | `pf-kpis` §6.5 | F3a |
| §3.3 | Tabela: CH, média, frequência ao vivo % · gravado %, faltas, situação | `pf-tabela` §6.5; equipe §7.4, §7.5 | F3a |
| §3.4 | KPIs Total, Em aberto, Pago, Em atraso | §6.7; §7.18 | F5 |
| §3.4 | Filtros Todos / Em aberto / Em atraso / Pagos | `pf-segmento` §6.7 | F5 |
| §3.4 | Lançamento: tipo, status, vencimento, forma, curso, NFS-e, valor, 2ª via | tabela §6.7; lançar e baixar §7.18 | F5 |
| §3.4 | Atalhos Atendimento e Protocolos | §6.7 atalhos | F5 |
| §3.4 | Meus cartões, boleto e NFS-e automáticos | alerta honesto §6.7, §7.18 | E1 |
| §3.4 → escopo | Declaração anual de quitação | §6.9 (botão da F5; motivo honesto sem dados da instituição), §8.3; dados do emissor em §7.22 Instituição (`motivo` ao alterar e endereço em texto, D-54) + aviso §7.2 (`sistema.instituicaoPendente`, D-54) | F3b · F5 · F6a |
| §3.5 | Calendário Hoje / Mês / Semana / Lista | `pf-calendario` §6.6, §7.9 | F3a |
| §3.5 | Evento com horário, módulo, código da turma; filtro por curso | `pf-encontro` §6.6 | F3a |
| §3.5 → §6 | Entrar registra presença; encontro ↔ turma, módulo, aula gravada | §6.6; §7.9 | F3a |
| §3.6 | Documentos: sigla, status (Não enviado/Em revisão/Aprovado/Pendente), Enviar, reenvio | §6.8; revisão e tipos §7.15 | F4b |
| §3.6 | Declarações por ano e por curso + histórico de solicitações + código e QR | §6.9, §8.3; emitidas §7.15 | F3b |
| §3.6 | Contratos: status, data, nº da matrícula, Visualizar, Assinar | §6.10; anexar e evidências §7.17 (vínculo com a matrícula só por `secretaria.vincularContrato`, D-78) | F4b · F4a |
| §3.6 | Assinatura no onboarding (aviso enquanto pendente) | faixa de pendência §5.2 + pendências do Início §6.1 | F0s · F4b |
| §3.6 | Comprovantes imprimíveis: avaliação e frequência com data/hora e hash | §6.11, §8.4 (código `FRQ`/`AVL` e hash abreviado por linha, URL de validação no rodapé, sem QR: D-16, D-72) | F3a |
| §3.7 | IA: histórico lateral, saudação, sugestões, aviso de imprecisão | §6.12 Assistente | F6b |
| CEO 2 | Consentimento (texto literal do servidor, DC-39), apagar histórico, estado sem chave; chave colada no painel com reautenticação (DC-38), modelo, liga/desliga, testar, limites e teto diário | §6.12 (aceite com `textoSha256` e 409 `conflito-versao`, D-54); §6.16; §7.22 Assistente de IA (`DMC_UI.reautenticar`, D-57) | F6b · F0b · F0s |
| CEO 2 · §6 | RAG sobre o regulamento acadêmico publicado pela coordenação | publicação §7.22 Regulamento; leitura pelo aluno `regulamento.html` §6.20 (índice de seções, edição, data, âncora `r-<regulamentoId>-<trechoId>`, D-81); cada "Fonte" do assistente é link ao trecho, e a de edição arquivada fica só com o título (`fontes[].regulamentoId`, D-81, §6.12); entradas no rodapé, Tutoriais e Acadêmico | F6a · F6b |
| §3.7 | Seus atendimentos com filtro, Iniciar atendimento, conversa, status | §6.12; fila e conversa §7.10 | F6a |
| §3.7 | Ouvidoria: Elogio, Denúncia, Reclamação, Sugestão; Aberto, Respondido, Encerrado; identidade resguardada | §6.12 (aviso fixo nos 4 tipos: identidade nunca mostrada a professores); §7.11 (coordenação; professor só encaminhadas, saneadas, com parecer; denúncia não se encaminha) — DC-40 | F6a |
| §3.8 | Nome de registro, nome social, CPF, passaporte, nascimento | Perfil › Identificação §6.15 (nome social com consentimento registrado `perfil_nome_social`) | F0p · F0t |
| §3.8 | RG: número, órgão emissor, data de expedição, UF | Perfil › Documentos §6.15 | F0p · F0t |
| §3.8 | Gênero, etnia (consentimento, "Prefiro não informar"), estado civil | Perfil › Dados pessoais §6.15 (textos v1 literais de gênero e etnia, D-55) | F0p · F0t |
| §3.8 | Nacionalidade, naturalidade | Perfil › Identificação §6.15 | F0p · F0t |
| §3.8 | Celular, e-mail, Instagram, Facebook | Perfil › Contato e redes §6.15 (redes com consentimento registrado `perfil_redes`) | F0p · F0t |
| §3.8 | Endereço com CEP e preenchimento automático (servidor; falha → manual) | Perfil › Endereço §6.15 | F0p · F0t |
| §3.8 | Foto com upload (JPG/PNG/WebP ≤ 2 MB) | Perfil › Foto §6.15 (aceite `perfil_foto` registrado antes do envio; 428 reabre o aceite) | F0p · F0t |
| §3.8 → escopo | Base legal por campo, quem vê, auditoria, Meus dados (6 finalidades de consentimento com data, versão e revogação), troca de senha (inclusive obrigatória, modo restrito) | §6.15, §6.16, §5 (modo restrito, D-51, D-63; teste real em `portal-titular.spec.js`, D-61); Cadastro na equipe §7.5; histórico ao titular = L4 | F0p · F0t · F0b · F8 |
| §3.9 | Sidebar com ícones e submenu Documentação | `pf-menu` §5.3–5.5; ícones §4.12 | F0s · F0b · F8 |
| §3.9 | Busca global com filtros | `pf-busca` §5.2; `busca.html` §6.18 (tipos da equipe: L3) | F0s · F0p · F0t |
| §3.9 | Banner "Conheça o novo portal" + banners gerenciados | `pf-faixa` §5.2; destaques §6.1; gestão §7.13 | F0s · F7 |
| §3.9 | Notificações (sino + página) | `pf-sino` §5.2; §6.14; §7.20 | F0s · F0p · F0t |
| §3.9 | Tema claro/escuro; A− / A+ | §2.7, §2.8, §5.2 | F0s · F0b |
| §3.9 | Libras (VLibras) | — | E2 |
| §3.9 | Tutoriais + tour de primeiro acesso | §6.17 (catálogo mínimo de 17 guias, ≥ 1 por categoria, cada um com a tela descrita); `pf-tour` §5.7; Ajuda §7.20 | F0r · F0s |
| §3.9 | Avatar com Perfil, Meus dados, Sair | `pf-conta` §5.2 | F0s |
| §3.9 | Visual navy + dourado, cards arredondados, chips coloridos | grafite + ouro DMC, raios 2/4/8, marcador `pf-estado` e `pf-segmento` (identidade própria) | F0s · F0r |
| §4 | Token em query string | todo download por header → blob (`DMC_UI.baixar/abrirArquivo`) | F0b |
| §4 | Bibliotecas demais | zero libs de terceiros; JS por página; QR vendorizado só onde há documento | F0b |
| §4 | Frequência inconsistente | uma fonte para Acadêmico, Comprovantes, Turma e relatórios | F3a |
| §4 | Spinners sequenciais | §10 | F0b · F0s |
| §5 | Pessoa, Curso (código, nível, carga, capa), Turma, Matrícula | Perfil §6.15; editor §7.16 (capa vertical, D-56); Critérios §7.22; Turmas §7.4; Matrículas §7.14 | F0p · F0t · F8 · F3b · F1a · F4a |
| §5 | Módulo, Conteúdo (seção, tipo, código), Progresso (pct_video) | player §6.3; editor §7.16 ("Tipo do módulo: Regular · TCC", D-53; capa do módulo, D-56); acadêmico do aluno §7.5 | F1b · F1a · F3b · F8 |
| §5 | Encontro, Frequência (origem, hash) | §6.6, §6.11, §7.9 | F3a |
| §5 | Avaliação, Tentativa, Nota | §6.4, §6.5, §7.6, §7.7 | F2 · F3a |
| §5 | Lançamento, DocumentoExigido/Enviado, Contrato, Declaração | §6.7–§6.10; §7.15, §7.17, §7.18 | F5 · F4b · F3b |
| §5 | Protocolo, Manifestação, ConversaIA | §6.12; §7.10, §7.11, §7.22 | F6a · F6b |
| §5 | Publicação, Banner, Notificação | §6.13, §6.1, §6.14; §7.12, §7.13 | F7 · F0p · F0t |
| §5 | Frequência = presença ao vivo **ou** conclusão da gravada | nota do Acadêmico §6.5; ajuda do encontro §7.9 | F3a |
| §6 | Auth: e-mail ou CPF, link mágico, recuperação, 2FA | login da 2d (só os dois links para `acesso-link.html`, a entrada por CPF e o passo do 2FA; aceite pelo `login-portal.spec.js`, índice §9.9 item 1a, D-71; até lá "C · 2d"); `acesso-link.html` §8.5 (pedir link mágico `#pedir-link`, pedir recuperação `#esqueci`, usar `#acesso=`/`#redefinir=`/`#email=`/`#verificar=`, [Pedir novo link] no link vencido); Segurança §6.15 (2FA só com `recursos().doisFatores`); senha temporária, troca de e-mail, redefinição do 2FA e desativação pela coordenação com reautenticação §4.8, §7.5, §7.19 | 2d · F0p · F0t · F0b · F8 |
| §6 | Vídeo Mux/Bunny; assinatura por provedor | provedores atuais; assinatura nativa | E3 |
| §6 | Acessibilidade: fonte, tema, WCAG AA | §2.7, §2.8, §11 | F0s · F0b |
| §6 | Observabilidade | Auditoria §7.24 (log de erros é do servidor, sem tela) | F7 · F0t |
| §7 | Backoffice: cursos, turmas, correção, revisão de documentos, relatórios | §7.16, §7.4, §7.7, §7.15, §7.23 (professor com Relatórios no menu, só dos seus cursos e turmas, §5.4, §7.1) | F8 · F1b · F2 · F4b · F7 |
| §7 → escopo | Matrículas/enturmação, lançamentos, contratos, publicações e banners, tipos de documento, regulamento, configurações, equipe | §7.14, §7.18, §7.17, §7.12, §7.13, §7.15, §7.22, §7.19 | F4a · F5 · F4b · F7 · F6a · F6b · F8 |
| §8 | LGPD: base legal, consentimento, retenção, encarregado, canal do titular | §6.15 (consentimentos registrados por finalidade; textos v1 de gênero e etnia, D-55), §6.16 (6 finalidades revogáveis; pedidos = categoria `privacidade` + `pedidoTitular`, prazo de 15 dias do servidor), §7.10, §7.22 Privacidade (inclusive trilha técnica do assistente) | F0p · F0t · F6a |
| §8 | Auditoria de notas, frequência, cadastro (+ financeiro, contratos, papéis) | motivo nos diálogos; §7.24; histórico em §6.16 | todas · F7 |
| §8 | Comprovantes e declarações com hash/QR verificável | §6.9–§6.11, §8 (QR em certificado, declaração e comprovante de assinatura, conferido por `_qr.js`, D-68; comprovantes com código e hash por linha, sem QR, D-72; `hashPrefixo` do certificado e "Emitido antes da verificação por selo", D-53) | F3b · F3a · F2 · F4b |
| §8 | IA: aviso, sem decisão automática, trilha | §6.12 (fontes e ferramentas por resposta, visíveis ao titular); §7.22 Uso agregado e **Trilha das respostas** só de metadados, auditada (D-50); ler o conteúdo das conversas = L5 | F6b |
| §8 | MEC: nível, carga mínima, frequência mínima, TCC, IES | §7.22 Critérios (aviso "TCC exigido sem avaliação publicada", D-53); "Tipo do módulo" §7.16 e questão de arquivo §6.4, §7.6 (D-53); pendências `frequencia`, `carga` e `tcc` do certificado em §6.9; vocabulário proibido §9 | F3b · F2 · F8 |
| §8 | Identidade 100% própria | §2–§4 (nada de navy, Material Symbols, persona) | F0s · F0r |
| §8 | OWASP (apoio de UX) | sem HTML em conteúdo de usuário, sem token em URL, 403 tratado, CSV sem CPF | todas |

---

## 14. Pendências de decisão

| # | Para | Pendência | Enquanto isso |
|---|---|---|---|
| P1 | CEO | Primário no tema claro: preto com texto papel (regra do DESIGN-SYSTEM) ou ouro profundo | segue o DESIGN-SYSTEM (preto) |
| P2 | CEO | Promover a `tokens.css` a cor de aviso (`#dd881b` escuro / `#9a5518` claro, DC-04, reavaliada com ΔE_OK) e o erro em papel (`#9b463e`) | ficam só em `portal.css` |
| P3 | CEO / jurídico | Finalidade e redação do consentimento de gênero e etnia (estatística agregada) | campos opcionais com os textos v1 **literais** fixados no índice D-55 e servidos por `consentimentos-textos.js` (F0t); revisão jurídica pendente (índice §13) |
| P4 | Coordenação | Prazos de retenção (conversas da IA e notificações: padrão da API 180 dias, 30–730; trilha técnica do assistente: proposta 730 dias, 180–1.825; demais categorias descritivas), limites de mensagens e teto diário global do assistente (proposta 1.000) | valores propostos marcados "a confirmar"; "A definir" com aviso; nada inventado |
| P5 | CEO | Rótulo "Cursos disponíveis" no lugar de "Loja" | adotado (reversível) |
| P6 | CEO + 2d | Admin cair em `professor.html#/inicio` depois do login | `admin.html` (contrato atual) |
| P7 | CEO + back F1a | Roteiro de gravação visível ao professor do curso | aparece só se a API devolver |
| P8 | — | **Fechada por D-22**: rubrica por critérios, "em correção por" e prévia do efeito ficam fora desta rodada; a contagem de trechos do regulamento existe na API (§6.10.4) | campo único "Pontos", sem aviso de concorrência, sem prévia |
| P9 | Coordenação | Imagens das capas verticais 2:3 por curso e das capas de módulo (o campo e o envio existem: L1 e L2 fechadas por D-56; envio só da coordenação em §7.16) | sem imagem, recorte central da 16:9 (sem `capaFoco`), capa tipográfica e miniatura numerada; a coordenação sobe quando tiver (D9: não travar entrega por falta de imagem) |
| P10 | CEO | Tempo adicional por aluno na avaliação (acomodação de acessibilidade; fora do blueprint) | não implementado |
| P11 | jurídico | Texto de aceite do contrato (versão v1 do back) | exibido literal, marcado para revisão |
| P12 | 2d | Avisar: reskin não toca `login-classico.html` (só ganha marcadores de comentário em `plataforma.css`); novos `?v=` de `app.js`/`api-client.js`; `user().nome` = nome social; `segundo-fator` (D-01); `next`; `precisaTrocarSenha` → `perfil.html#seguranca`; os dois links do login para `acesso-link.html#pedir-link` e `#esqueci` e o aceite pelo `login-portal.spec.js` (D-71); proposta de aposentar `login-classico.html` com redirecionamento para `login.html?next=` (D-44) | aviso da sessão principal antes do merge (índice §5.5 e §14 item 3) |
| P13 | arquitetura e back | Acréscimos de contrato desta consolidação: DC-09 (limiar da tabela), DC-10 (toast 6 s; `duracaoMs` ignorado com ação), DC-16 (grupos), DC-23 (URL de verificação do contrato), DC-24 (`DMC_PlanoEnsino`), DC-37 (provedores de busca da equipe, L3); modo restrito de §5 no `DMC_Portal`/`DMC_Shell`; `iesAtoCredenciamento` nos `dados` da declaração (§8.3) | **atendida**, salvo DC-37: limiar de 44em e toast no `DMC_UI` (índice §7.5, D-06, D-34, D-51), grupos no `MENU_ESTATICO` (D-08), `urlValidacao` = `validar.html?codigo=` (API §6.7.6), `DMC_PlanoEnsino` no índice §7.7, modo restrito no `DMC_Portal`/`DMC_Shell` (D-51, D-63), `iesAtoCredenciamento` (API §8.9). DC-37 continua lacuna L3 (provedores da F4a) |
| P14 | jurídico | Redação fixa da declaração de matrícula e de frequência em lato sensu ("ofertado por <IES> … com execução pelo Complexo DMC", §8.3) | redação aplicada, marcada para revisão; nenhuma IES cadastrada hoje |
| P15 | CEO + jurídico | Coordenação ler o conteúdo das conversas do assistente (L5): base legal e texto de consentimento | uso agregado e trilha só de metadados, auditada (§7.22, D-50) |
| P16 | back (F3b, F6a, F6b, F8) e índice | Acréscimos de contrato pedidos na segunda revisão: `?categoria=&cursoId=` em `GET …/ia/conversas/:id/escalonamento`; `ouvidoriaSemParecer` no resumo do professor; aviso "dados da instituição" no bloco `sistema`; `motivo` no `PUT …/configuracoes/instituicao` e no `POST …/cursos/:id/codigos` com `refazer:true`; tipo do campo `instituicao.endereco`; rota `configuracoes/instituicao` e `configuracoes/ia/uso·trilha` na tabela de rotas do índice §6.3; `DMC_UI.reautenticar` no contrato do índice §7.5; `textoSha256` exibido no aceite do assistente (§15) | **Atendida** (confirmado na propagação): o índice D-54 fecha os sete acréscimos de API — (a) escalonamento com `?categoria=&cursoId=` (F6b), (b) `ouvidoriaSemParecer:N\|null` pelo serviço `atendimento.ouvidoriaSemParecer` (F6a, F8), (c) `sistema.instituicaoPendente` (F6a), (d) `motivo` na instituição e no `refazer` (F6a, F3b), (e) `endereco` em texto de até 3 linhas e 300 caracteres (F6a), (f) 409 `transicao-invalida` no 2º parecer (F6a), (g) `textoSha256` opcional no consentimento do assistente (F6b) —; as rotas estão no índice §6.3 e `DMC_UI.reautenticar` no §7.5 (D-57). As degradações provisórias saíram do texto: §5.4, §6.12, §7.2, §7.11, §7.16 e §7.22 usam os campos diretamente |
| P17 | back (F6a, F6b, F3a, F3b, F4a, F5), índice e 2d | Acréscimos pedidos na terceira revisão: rota do pedido de curso, origem própria do pedido e enriquecimento por curso; protocolo de origem na matrícula e no lançamento; `trechos` e `id` no `GET /portal/regulamento` e `regulamentoId` nas fontes; `notaMinima` no certificado e no `ResumoMatricula`; `regulamento.html` no índice; asserção de R10; critério da F0r-final; links da 2d para `acesso-link.html` | **Atendida** (confirmado na propagação) por D-71, D-79, D-80 e D-81, com os nomes do índice e da API: **D-79** — rota `POST /portal/me/pedidos` da F5 (não da F6), `reaproveitado` (não `jaExistia`, com `&existente=1` no obrigado), 409 `ja-liberado` (não `curso-ja-liberado`), `origem:'humano'` com `protocolos.pedido` (não `origem:'loja'`), fila `?pedido=1` (não `?origem=loja`), limite próprio de 5 por hora, 404 pelo caminho legado com texto honesto (não "nenhuma navegação"), `liberarAcesso` booleano; **não acolhidos nesta rodada** (D-79): o enriquecimento por curso no bloco Pedido (matrícula, lançamentos, acesso) e o protocolo de origem como campo da matrícula e do lançamento — o vínculo fica em "Pedido ATD-…" na descrição; **D-80** — `notaMinima` no GET do certificado (F3b) e no `ResumoMatricula` (F3a); **D-81** — `regulamento.html` (F6a) com `trechos:[{ id, titulo, inicio, fim }]` (DC-70) e `fontes[].regulamentoId` (F6b), fonte de edição arquivada só com o título; **D-71** — telas de pedir link e nova senha da principal, a 2d só põe os dois links e o aceite é o `login-portal.spec.js`. No índice: `regulamento.html` em §6.1, §6.2 e §8.1, `paginasDoPortal()` (D-74), linhas 1.11, 17.33 e 17.37 da matriz, R10 em §9.3 e critério da F0r-final em §8.5. Texto aplicado em §6.5, §6.9, §6.12, §6.17, §6.19, §6.20, §7.10, §7.14, §7.18 e §8.5 |

---

## 15. Críticas não acolhidas (ou acolhidas em parte)

Registro histórico das três revisões. Onde uma linha abaixo diz "pedido à API (P16)" ou "pedido ao índice (P17)", o
pedido já foi atendido pelo índice (D-54, D-57, D-71, D-79, D-80, D-81; ver §14) e o corpo do documento usa o contrato
final; a linha fica como estava para explicar a decisão de tela.

| Crítica | O que foi feito | Por quê |
|---|---|---|
| Aviso no escuro `#ee8a3c` | adotado `#dd881b` no lugar | `#ee8a3c` fica a ΔE 0,075 do erro, abaixo do próprio mínimo de 0,08 que a crítica pede; `#dd881b` (mesmo croma, mais escuro) fica a 0,097 do ouro e 0,100 do erro, com 7,09:1 no fundo e 5,44:1 no painel-3 |
| Topo em 320 px: "abaixo de 360 px úteis, a marca sai do topo" | alvos em 44 px fixos adotados; a marca **fica** no topo em toda a matriz (sai para a gaveta só abaixo de 300 px de janela) | com px fixos a soma é 236 px para 280 úteis no pior caso (320, nível 2); tirar o rinoceronte do topo em 320 perderia o reconhecimento da marca sem necessidade |
| Rodapé do player: "‹, › e Concluído só com ícone" | ‹ e o botão de conclusão viram ícone; o primário mantém o texto curto "Próximo" | "Próximo" é a ação principal da tela; com ícone só, a ação dominante perderia o rótulo visível (a soma cabe: ≈ 214 px de 280 úteis) |
| Botão de conclusão: duas alternativas | escolhida a troca de rótulo **sem** `aria-pressed` ("Marcar como concluído" ↔ "Desmarcar conclusão"), com o estado no marcador ao lado | rótulo fixo "Concluído" num botão ainda não pressionado se lê como "já concluído" para quem enxerga |
| Tour: modal **ou** sem véu | sem véu | com `showModal()` o `::backdrop` cobre também o alvo destacado, e o tour deixaria de mostrar o elemento real; sem véu, nada parece modal e a página segue operável |
| Prévia de PDF: "ou incluir `blob:` em `frame-src`" | não incluído | abrir a CSP de quadro para `blob:` amplia a superfície de ataque numa página com JWT em `localStorage`; abrir em nova aba resolve sem mudar a CSP |
| Declaração lato sensu: redação fixa **ou** emitir pela IES | redação fixa (§8.3) | mantém o contrato da API (`nivelRotulo`, `iesNome` já congelados) e atribui a oferta à IES de forma explícita; fica marcada para revisão jurídica (P14) |
| Mês do calendário: grade flexível **ou** ocultar Mês | grade flexível com exceção registrada | ocultar Mês em 320 tiraria uma visão que o blueprint pede; 40 px de largura passa com folga dos 24 px da WCAG 2.5.8 |
| Reautenticação: "diálogo único 'Confirme sua identidade' que abre antes" das ações críticas (2ª revisão) | componente único (`pf-reautenticacao`, `DMC_UI.reautenticar`), mas **embutido no fim do diálogo da própria ação** quando ela já tem diálogo com motivo; o diálogo "Confirme sua identidade" só abre sozinho em [Salvar chave] e [Remover chave] | dois `<dialog>` empilhados (motivo e depois senha) dobram a troca de foco e o anúncio do leitor de tela, e a pessoa perde de vista o que está confirmando; o contrato da API (`reautenticacao` no mesmo corpo da ação) é atendido do mesmo jeito |
| Consentimento do assistente: "enviar `texto` e `versaoTexto`" no `POST …/ia/consentimento` (2ª revisão) | a tela renderiza `estado.consentimento.texto` literal e envia só `{ aceito:true, versaoTexto }` | é o corpo que a API aceita (§6.10.3); o servidor regrava o texto final e o `textoSha256` no aceite. Se a coordenação mudar um prazo entre a exibição e o aceite, o hash gravado é o do texto novo: pedido à API (P16) aceitar também o `textoSha256` exibido e responder 409 quando divergir |
| Ouvidoria do professor: "contagem das que ainda não têm parecer" no menu (2ª revisão) | contagem prevista, alimentada pelo resumo do professor | o menu lê UMA requisição de resumo (§5.4) e `GET /portal/professor/resumo` não traz esse número; pedido à API (P16). Sem o campo, a contagem não aparece (nunca número calculado por outra lista) |
| Escalonamento: "N mensagens … não serão anexadas" (2ª revisão) | "N perguntas sobre documentos, contratos ou financeiro (e as respostas) não serão anexadas" | a API conta pares pergunta + resposta (`anexoConversa.omitidas`); "N mensagens" daria a metade do número real |
| Instituição: "motivo/auditoria" na aba nova (2ª revisão) | motivo obrigatório só ao **alterar** dados já salvos; o primeiro cadastro não pede motivo | a gravação já é auditada (`config.instituicao_alterada`); o motivo só agrega quando muda o emissor de declarações futuras. O campo depende de acréscimo na API (P16) |
| Código da aula: "chamar a geração depois de criar **ou mover** uma aula" (2ª revisão) | geração automática depois de criar uma aula e depois de mover uma aula **ainda sem código**; aula com código não muda ao mover | a API gera só os ausentes e o código é estável por regra (§8.12); realinhar códigos existentes é o "Refazer todos", com confirmação e motivo |
| Pedido da loja: [Finalizar pedido] cria atendimento ATD Financeiro; [Criar matrícula e lançamentos] "leva a §7.14 e §7.18 já preenchidas" (3ª revisão) | acolhida, com três ajustes: a ação abre os dois formulários **em sequência**, um curso por vez; o acesso nasce **desligado** e ganha a ação própria [Liberar acesso]; o obrigado recebe só `?protocolo=` | a matrícula precisa existir antes do lançamento (o lançamento pede `matriculaId`); ligar o acesso no ato contradiria o texto que o aluno leu ("libera o acesso depois da confirmação"); e-mail e total na URL iriam para histórico e `Referer` sem necessidade, e o total da URL podia ser forjado (agora vem do servidor). A asserção de R10 muda com o fluxo: pedido ao índice (P17) |
| Acesso por link: "[Pedir novo link] leva a `#pedir-link`" (3ª revisão) | link de acesso vencido → `#pedir-link`; link de **redefinição** vencido → `#esqueci`; `#email=` e `#verificar=` vencidos → [Ir para a entrada] | quem clicou num link de redefinição quer uma senha nova, não um link de acesso; troca e verificação de e-mail são pedidas de novo com sessão aberta (Perfil), não por esta página |
| Regulamento: "seção `#regulamento` em `tutoriais.html` **ou** página `regulamento.html`" (3ª revisão) | página própria `regulamento.html` (F6a); Tutoriais ganha o link e o guia `#regulamento` | regra acadêmica não é guia de uso; a página é da fatia dona do regulamento e do `fatiar`, que garante que âncora e "Fonte" do assistente coincidam; imprime sozinha |
| Relatórios do professor: "Alunos, Progresso, Notas, Frequência e Correções pendentes" (3ª revisão) | esses cinco + Tentativas e Presenças | o índice é montado pelo catálogo que a API já filtra por papel (§6.11.3 dá ao professor também `tentativas` e `presencas`); esconder no front o que o servidor autoriza seria uma segunda regra de acesso |
| Certificado: pendências com link para "player, Acadêmico `#modulo-<id>`, Comprovantes" (3ª revisão) | acolhida; `carga` e `tcc` sem módulo levam a "Falar com o atendimento"; sem `notaMinima` na resposta, a frase sai sem o número | carga mínima e ausência de módulo ou avaliação de TCC são configuração do curso: o aluno não resolve sozinho; a rota do certificado ainda não devolve a nota mínima (pedido em P17) e um "7,0" fixo seria exatamente o defeito apontado |
| Tutoriais: catálogo com 15 guias e "marcado 'fora desta rodada' com o motivo" (3ª revisão) | 17 guias (+ "Pedir um curso e acompanhar o pedido" e "Consultar o regulamento acadêmico"); o "fora desta rodada" fica no relatório de entrega, não na central | os dois fluxos novos desta revisão precisam de guia; um aviso de guia ausente na central seria o placeholder "em breve" que §6.7 já proíbe |
