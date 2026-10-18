# Nova home do Complexo DMC — Relatório final ao CEO

Arquiteto fullstack · 2026-10-17 · branch `feat/dmc-prime` sobre o HEAD b26a462 · **nada foi commitado nem
publicado**. Este documento consolida o trabalho de conteúdo, design, front-end, back-end, mídia e QA da nova
página inicial e lista o que depende de decisão sua.

Fontes: `docs/dmc/HOME_REDESIGN.md` (especificação), `home-redesign/copy.json` (texto final),
`home-redesign/integracao/README.md` e `correcoes-r1.md`, `home-redesign/aceite/{conformidade,correcoes}.md`,
`home-redesign/midia-relatorio.md`, QA em `docs/dmc/qa/2026-10-17-home-v2-r2/`.

---

## 1. Resumo em uma página

- A home passou de uma página com catálogo de 18 cartões, busca interna e blocos de "fatos" para **dez seções
  com um só percurso**: situação do cliente → eixo responsável → como trabalhamos → onde estamos → o que
  publicamos → como conduzimos → contato.
- Tudo o que não devia mudar **não mudou**: cabeçalho e menu, herói com o filme, seção "Sobre" (`#conheca`),
  formulário de contato, bloco de vídeo e estrutura do rodapé.
- Texto inteiramente revisado sob o Provimento 205/2021 e a D7: nenhum número institucional, nenhuma promessa
  de resultado, cada ato reservado atribuído a quem a lei habilita.
- **Qualidade medida, não estimada**: 684 testes automáticos aprovados (0 falhas, duas execuções), 129 testes
  da API aprovados, Lighthouse móvel da home **100 / 100 / 100 / 100** (antes 99), LCP 1,65 s (antes 1,96 s).
- **Não está publicado.** Publicar depende das condições da D3/T3 (rotação de credenciais, política de
  privacidade sem marcadores `[CONFIRMAR]`) e da sua autorização expressa.

---

## 2. Seção por seção

### 01 · Herói (`#hero`)
- **O que alteramos:** nada no desenho ou no texto. Apenas o cartaz móvel do filme foi recomprimido
  (39,8 KB → 21,3 KB, sem perda visível) e os dois scripts de animação saíram do topo da página para o fim.
- **Por que:** o cartaz é o primeiro elemento grande que o visitante vê no celular; reduzir o peso e tirar
  concorrência de download acelera a primeira impressão.
- **Benefício comercial:** a página "aparece pronta" 0,3 s mais cedo no celular (LCP 1,96 s → 1,65 s).
- **Evidência:** `docs/dmc/qa/2026-10-17-home-v2-r2/lighthouse/resumo.json`; captura
  `home-redesign/aceite/sec-1440-hero.png`.
- **Situação:** concluído.

### 02 · Sobre (`#conheca`)
- **O que alteramos:** nada. Mantida exatamente como no HEAD (abas por eixo, rede neural, link para
  `pages/sobre.html`), por sua decisão.
- **Por que:** a seção foi aprovada em rodada anterior (T6); a especificação propunha substituí-la e você optou
  por manter.
- **Benefício comercial:** preserva o trabalho já validado e a mensagem central aprovada ("O Complexo DMC
  integra seis eixos de especialidade…").
- **Evidência:** `aceite/sec-1440-conheca.png`, `aceite/sec-390-conheca.png`; teste `movimento` (canvas pára
  fora da tela e com movimento reduzido).
- **Situação:** concluído (sem alteração). Duas sugestões de texto ficam para você — ver §5, itens 1 e 14.

### 03 · Seis eixos (`#features`)
- **O que alteramos:** a antiga grade de 18 cartões com busca e "destaque sorteado" virou uma grade sóbria de
  **seis eixos** (ícone, número, nome, descrição curta, botão "Explorar soluções") e, abaixo, um catálogo
  recolhido "Todas as soluções por eixo" com os 21 links para as páginas existentes.
- **Por que:** o visitante chegava a um catálogo antes de entender a lógica da casa; a busca interna não tinha
  conteúdo para buscar; a grade antiga era a principal fonte de rolagem infinita no celular.
- **Benefício comercial:** seis portas de entrada claras; os 28 links de outras páginas que apontam para
  `#features` continuam válidos; todos os alvos de toque têm ≥ 44 px.
- **Evidência:** `aceite/sec-1440-features.png`, `aceite/view-390-features.png`,
  `aceite/focus-1440-vertical-cta.png`; teste `eixos` 15/15 (inclusive sem JavaScript).
- **Situação:** concluído.

### 04 · Por que o Complexo DMC? (`#porque`)
- **O que alteramos:** seção nova. Seis razões em painel de papel com introdução fixa à esquerda. É a **única**
  parte da home com a fórmula completa de quem faz o quê ("advogados parceiros redigem…; contadores e
  auditores habilitados…; cartórios conveniados…").
- **Por que:** substitui os antigos blocos de "fatos" e "resultados" (números e promessas, vetados pela D7) por
  argumentos de método.
- **Benefício comercial:** responde "por que vocês?" sem expor a empresa a questionamento ético; concentra a
  atribuição legal em um ponto, em vez de repeti-la em cada seção.
- **Evidência:** `aceite/sec-1440-porque.png`, `aceite/sec-390-porque.png`; teste `home-secoes › conformidade`.
- **Situação:** concluído.

### 05 · Verticais de negócio (`#verticais`)
- **O que alteramos:** seção nova, de alta prioridade. Cinco painéis grandes — construção e incorporação,
  empresas familiares, grupos empresariais, investidores e patrimônio, famílias com imóveis e terras — cada
  um com uma pergunta direta ao leitor, um título, uma frase e um botão para a página do eixo. Cada painel
  tem uma **cena procedural com movimento** (loop de 6 s, sem som), que só é carregada em telas ≥ 1024 px,
  só quando o painel está visível e nunca para quem pede movimento reduzido ou economia de dados. No celular,
  imagem fixa e texto fora da imagem.
- **Por que:** o cliente se reconhece pelo setor e pela situação, não pelo nome da especialidade.
- **Benefício comercial:** cinco caminhos de conversão por segmento; peso zero no celular; imagens com
  nomes fixos, prontas para troca por fotografia licenciada (D9) sem retrabalho.
- **Evidência:** `aceite/sec-1440-verticais.png`, `aceite/view-1440-verticais-loop.png`,
  `aceite/hover-1440-vertical-1.png`, `home-redesign/midia-contact-sheet.png`; teste `movimento` (0 vídeos em
  390 px e com movimento reduzido); `audit.json › videos-1440` (5 vídeos pausados fora da tela).
- **Situação:** concluído. Pendente de conferência manual em Chrome/Safari reais (loops não são auditáveis
  em modo headless — item 4 de `aceite/correcoes.md`).

### 06 · Presença (`#presenca`)
- **O que alteramos:** seção nova. Mapa do Brasil em SVG com a sede em São Paulo e uma camada de movimento
  em canvas (pulsos discretos) ligada apenas quando a seção está na tela. Texto literal da D9: "Sede em São
  Paulo. Atendimento em todo o Brasil e no exterior, com parceiros habilitados e cartórios conveniados
  definidos conforme o caso."
- **Por que:** a home não dizia onde a empresa atende; a D9 autoriza afirmar alcance nacional e internacional
  sem números.
- **Benefício comercial:** remove a objeção "só atendem em SP" sem inventar praças.
- **Evidência:** `aceite/sec-1440-presenca.png`, `aceite/view-390-presenca.png`; teste `movimento` (390 px →
  sem canvas; movimento reduzido → `still`; aba oculta → pausa; 0 requisições externas).
- **Situação:** concluído. Observação: o mapa marca as 27 unidades federativas como decoração; se preferir
  evitar a leitura "presença em 27 estados", é ajuste de 1 linha — item 8 de `aceite/conformidade.md`.

### 07 · Inteligência e publicações (`#publicacoes`)
- **O que alteramos:** seção nova, sem imagem. Um destaque real ("Por que planejar a sucessão em vida" →
  `pages/por-que-urgente.html`) e um quadro "Em preparação" com o convite "Receber quando sair" → newsletter.
  Sem data de revisão (aguarda [CEO 7]) e sem títulos fictícios.
- **Por que:** cria o espaço editorial que alimenta a newsletter sem simular conteúdo que ainda não existe.
- **Benefício comercial:** demonstra autoridade com material já publicado e captura interesse para o que vier.
- **Evidência:** `aceite/sec-1440-publicacoes.png`, `aceite/hover-1440-publi.png`.
- **Situação:** concluído. A frase do destaque ganhou "e o que fica com advogados parceiros e cartórios
  conveniados" para cumprir a regra de atribuição — **a ratificar pelo diretor de conteúdo**.

### 08 · Método e formação (`#treinamentos`)
- **O que alteramos:** a antiga vitrine de cursos virou **quatro etapas do método** (diagnóstico → cenários
  e decisão → estruturação → acompanhamento) com um quadro lateral sobre o programa "Arquitetura Patrimonial
  Estratégica" e o botão "Conhecer a plataforma". Carga horária e modalidade foram retiradas até confirmação.
- **Por que:** o catálogo de cursos exibia itens não confirmados na plataforma (fonte depreciada); o id
  `#treinamentos` foi mantido porque 28 páginas apontam para ele.
- **Benefício comercial:** explica como a empresa trabalha — o que o cliente precisa saber antes de ligar — e
  mantém a porta para a DMC Business School sem anunciar o que não pode cumprir.
- **Evidência:** `aceite/sec-1440-treinamentos.png`, `aceite/sec-1024-treinamentos.png` (sem sobreposição
  com os botões flutuantes).
- **Situação:** concluído. Rótulo "Treinamentos" no menu × "Método e formação" na seção: decisão sua ([CEO 15]).

### 09 · Newsletter (`#newsletter`)
- **O que alteramos:** seção nova com formulário (nome, e-mail, empresa opcional, consentimento LGPD) ligado a
  uma rota nova no servidor (`POST /api/newsletter`), página de descadastro
  (`pages/newsletter-descadastro.html`) e trecho correspondente na política de privacidade. Sucesso só é exibido
  quando o servidor confirma; mensagens de erro por campo.
- **Por que:** a home não tinha nenhum mecanismo de relacionamento continuado.
- **Benefício comercial:** base própria de contatos qualificados, com consentimento registrado.
- **Evidência:** `aceite/sec-1440-newsletter.png`; testes `newsletter` 12/12 e `newsletter-descadastro` 15/15
  contra a API real com banco descartável; `server/test/newsletter.test.js`.
- **Situação:** concluído tecnicamente. **Bloqueio de publicação [CEO 9]:** a política de privacidade ainda tem
  12 marcadores `[CONFIRMAR]` (CNPJ/razão social, encarregado, retenção, transferência internacional, data). O
  consentimento remete a essa página; a seção ficou visível (ocultá-la quebraria contato, rodapé e testes), e
  o fechamento dos marcadores passa a ser condição de publicação.

### Vídeo (`#video`)
- **O que alteramos:** só texto: título "O Complexo DMC em vídeo." e aviso "em preparação" no espaço vazio.
- **Por que:** evitar prazo implícito ("em breve").
- **Benefício comercial:** nenhum CTA falso; espaço pronto para o vídeo institucional.
- **Evidência:** `aceite/sec-1440-video.png`.
- **Situação:** concluído. Aguarda o ID do vídeo ([CEO 11]).

### 10 · Contato (`#contact`)
- **O que alteramos:** formulário intocado. Título passa a "Comece pela decisão a tomar."; introdução sem
  afirmação de equipe ("O especialista do eixo…" saiu). O WhatsApp flutuante ganha texto qualificado com o eixo
  que o visitante acabou de ver.
- **Por que:** alinhar o texto ao percurso da nova home e ao [CEO 8].
- **Benefício comercial:** lead chega identificado pelo eixo, sem triagem manual.
- **Evidência:** `aceite/sec-1440-contact.png`; teste `formulario` 8/8 (API real).
- **Situação:** concluído.

### Rodapé (`#rodape`)
- **O que alteramos:** "Área do aluno" → "DMC Business School"; "Ad-tech" → "ADTECH" (mesmos destinos);
  novo link "Newsletter"; frase da marca com "no Brasil e no exterior" (D9). Link "Parcerias" **não** incluído,
  conforme sua orientação.
- **Evidência:** `aceite/sec-1440-rodape.png`; verificação local desta revisão (rodapé contém exatamente
  Newsletter / DMC Business School / ADTECH; 0 ocorrências de "Parcerias").
- **Situação:** concluído.

---

## 3. Lista resumida de alterações (commit 53a412d)

`git diff --stat`: 20 arquivos rastreados alterados (+2 858 / −1 634 linhas); 255 arquivos novos (a maior parte
evidências de QA em `docs/dmc/qa/` e documentação em `docs/dmc/home-redesign/`).

| Área | Arquivos | O que mudou |
|---|---|---|
| Página | `complexodmc.com.br/index.html` | 10 seções na ordem `hero → conheca → features → porque → verticais → presenca → publicacoes → treinamentos → newsletter → video → contact`; 84,6 KB (antes 98,5 KB). Versões de cache: `components.css?v=3`, `styles.css?v=c7`, `navbar.js?v=c4`, `main.js?v=c4`, `rede-neural.js?v=2`, `brasil.js?v=1`. |
| Estilos | `assets/css/styles.css` | Blocos antigos removidos (`.fatos`, `.np-*`, `.treinos*`, `.adtech*`); estilos das seções novas fundidos no fim (bloco "HOME v2", decisão S16). 52,5 KB bruto / 12,7 KB comprimido. `components.css`, `tokens.css` e `navbar.js` **não** editados. |
| Scripts | `assets/js/main.js` (alterado), `assets/js/brasil.js` + `assets/js/data/brasil-capitais.js` (novos) | Saem busca, sorteio de destaque e painel antigo; entram verticais (loops), newsletter, âncoras dos eixos e WhatsApp qualificado; mapa em módulo próprio sem dependência externa. |
| Mídia | `assets/images/home/` (20), `assets/videos/home/` (10), `assets/images/hero-dmc-poster-mobile.webp` | Renders procedurais das cinco verticais (660 KB de imagens; 6,2 MB de vídeo sob demanda); cartaz móvel do herói recomprimido. |
| Newsletter | `pages/newsletter-descadastro.html` + `pages/css/newsletter-descadastro.css` + `pages/js/newsletter-descadastro.js`; `pages/politica-de-privacidade.html` | Página de saída da lista (fora do sitemap, `noindex`); trecho "Newsletter" na política. |
| Servidor | `server/src/routes/newsletter.js` (novo), `server/src/{server,config,db}.js`, `server/src/routes/contato.js`, `server/.env.example`, `server/README.md`, `server/test/newsletter.test.js` | Rota de inscrição e descadastro, limites de taxa e tamanho, sem gravação de IP por padrão. |
| Sobre | `pages/sobre.html`, `pages/css/sobre.css`, `assets/images/sobre/` | Ajustes da rodada anterior (T6) já presentes na árvore; não fazem parte desta entrega, mas seguem no mesmo commit se você aprovar. |
| Testes | `tests/e2e/{eixos,home-secoes,newsletter,newsletter-descadastro}.spec.js` (novos), `movimento.spec.js`, `_site.js`, `tests/server/serve.mjs`; `home.spec.js` removido | Suíte reescrita para a nova estrutura. |
| Ferramentas | `tools/midia-home/` (9 arquivos) | Pipeline de render e codificação (fica fora da pasta pública). |
| Documentação | `docs/dmc/HOME_REDESIGN.md`, `docs/dmc/home-redesign/**`, `docs/dmc/{DECISIONS,PROGRESS,QA}.md` | Especificação, copy, relatórios de cada frente, evidências. |

**Inalterados:** `vercel.json`, `complexodmc.com.br/sitemap.xml`, `robots.txt`, `assets/js/navbar.js`,
`assets/css/components.css`, `assets/css/tokens.css`, `assets/js/rede-neural.js`, pasta `plataforma-ead/`.

---

## 4. Evidências dos testes (números reais)

Rodada final: `docs/dmc/qa/2026-10-17-home-v2-r2/` (suíte completa sobre a árvore de trabalho, banco MongoDB
descartável, servidor `tests/server/serve.mjs`).

| Verificação | Resultado | Detalhe |
|---|---|---|
| Testes de ponta a ponta (Playwright) | **684 / 684 aprovados**, 0 bloqueados, 184 s | a11y 58 · console 58 · eixos 15 · formulário 8 · home-secoes 35 · movimento 14 · navegação 40 · newsletter 12 · newsletter-descadastro 15 · parcerias 73 · rotas 121 · seo 31 · vercel-config 1 · viewports 203 |
| Reexecução parcial (estabilidade) | **84 / 84** | `2a-execucao/e2e/resumo.json` |
| Testes da API (`npm test`, sem banco) | **129 / 129** em 24 suítes | `server-test.log` |
| Lighthouse móvel da home (mediana de 3) | **Performance 100 · Acessibilidade 100 · Boas práticas 100 · SEO 100** | FCP 1,35 s · **LCP 1,65 s** · CLS 0,003 · TBT 3 ms · 1 192 KB. Antes desta entrega (HEAD): 99 / 100 / 100 / 100, LCP 1,80–1,96 s |
| Largura 320–1920 px | 0 px de transbordo horizontal em 7 larguras, antes e depois de rolar | `aceite/audit.json`, teste `viewports` 203/203 |
| Acessibilidade (axe, serious/critical) | 0 violações por seção em 390 e 1440 px | `home-secoes › axe por seção` (22 testes) |
| Conformidade de texto | 0 promessa/percentual/número sem fonte; todo ato citado tem atribuição na mesma seção | `home-secoes › conformidade` |
| Links internos | 27 destinos → 200, 0 âncora quebrada; `#features`, `#treinamentos`, `#contact` preservados (28/28/44 links de entrada) | `integracao/verificacao.json`; teste `rotas` 121/121 |
| Revisão do arquiteto (esta rodada, porta 4670) | 0 erros de console, 0 requisições falhas, 0 respostas 4xx em 390 e 1440 px; ordem das 11 seções correta; 1 `h1`; `role=tab` só em `#conheca`; 390 px → 0 vídeo carregado, mapa estático; 1440 px → loops carregados só após entrar na tela e pausados ao sair; rodapé sem "Parcerias" | script em sessão, resultado reproduzido acima em `integracao/verificacao.json` |
| Revisão de código | diff sem `console.log` de depuração, sem arquivos `_np_*`/backup; `home.css` provisório removido (S16) | `git diff`, `git status` |

Evolução das rodadas: r1 (665 testes, 19 falhas — todas por contrato de teste ou texto, não por defeito de
página) → correções em `integracao/correcoes-r1.md` → r2 (684/684).

---

## 5. Pendências e dependências do CEO (§8 da especificação, atualizada)

| # | Pendência | Estado hoje na página | O que precisamos de você |
|---|---|---|---|
| 1 | Cobertura fora de SP | **Resolvida (D9)** | — |
| 2 | Nomes "Blindagem Patrimonial", "Blindagem Contratual", "Defesa Empresarial" | Catálogo da home usa "Separação Patrimonial", "Arquitetura Contratual", "Gestão do Contencioso Trabalhista"; os títulos das três páginas continuam com os nomes antigos | Decidir: renomear as páginas (recomendado) ou voltar os rótulos da home |
| 3 | Cursos ativos na plataforma | Só "Arquitetura Patrimonial Estratégica", sem carga horária nem modalidade | Confirmar o catálogo real para repor carga horária/modalidade |
| 4 | ADTECH (tribunais, cartórios, API, PCD) | Fora da home | Liberar o que pode ser dito publicamente |
| 5 | Parceiros nomeados | Só por categoria, uma vez (seção 04) | Autorizar nomes, se desejar |
| 6 | Vertical "Agronegócio" | Painel "Famílias que detêm imóveis e terras" | Confirmar o rótulo |
| 7 | Data de revisão em Publicações | Removida | Confirmar data e revisor habilitado para exibir |
| 8 | "Um responsável por eixo" (`sobre.html`) | Home não amplia afirmações de equipe ("uma coordenação") | Revisar `pages/sobre.html` |
| 9 | **Política de privacidade com 12 `[CONFIRMAR]`** | Newsletter visível e ligada à política inacabada | **Condição de publicação:** CNPJ/razão social, encarregado, prazos de retenção, transferência internacional, data |
| 10 | Página de Auditoria Empresarial / slug `contabilidade` | CTA E4 → `contabilidade.html` | Decidir se haverá página própria |
| 11 | ID do vídeo da home | Espaço reservado ("em preparação") | Enviar o ID do YouTube |
| 12 | Fotografia real nas verticais | Renders procedurais com nomes fixos (§6) | Opcional; troca sem retrabalho |
| 13 | Esconder o WhatsApp até a seção 04 | Visível desde o início, com texto qualificado | Decidir |
| 14 | Rinoceronte em vídeo na seção Sobre | Não entra (S15) | Opcional |
| 15 | Rótulo "Treinamentos" (menu e 28 rodapés) × seção "Método e formação" | Rótulo mantido; `id="treinamentos"` preservado | Aprovar "Método" (ou manter) — aplicação de uma vez em `navbar.js` e rodapés, por outra sessão |
| 16 | Títulos do contato e do vídeo | Aplicados ("Comece pela decisão a tomar." / "O Complexo DMC em vídeo.") | Ratificar |
| 17 | Frase do destaque em Publicações (atribuição acrescentada) | Aplicada | Diretor de conteúdo ratificar |
| 18 | Texto do foco E5 em `#conheca` ("Levar um crédito reconhecido até o patrimônio do devedor…") | Mantido (seção congelada) | Autorizar a troca sugerida em `aceite/conformidade.md` item 1 |
| 19 | Conferência visual dos loops em Chrome/Safari reais (1440 px) | Verificado só em Chromium automatizado | 10 minutos de navegação sua ou de alguém da equipe |
| 20 | FAQ "Atendem fora de São Paulo?" em `pages/sobre.html` | Ainda com texto anterior à D9 | Autorizar alinhamento à D9 (1 frase, HTML + JSON-LD) |

---

## 6. Nomes exatos dos arquivos de mídia (para troca futura)

Todos em `complexodmc.com.br/`. Para substituir uma cena por fotografia, basta gravar os arquivos com os
mesmos nomes e dimensões; nenhum código muda.

| Vertical | Cartaz desktop | Cartaz móvel (1200×750) | Loop (6 s, sem som, ≤ 1 MB) |
|---|---|---|---|
| Construção e incorporação | `assets/images/home/vertical-construcao.avif` / `.webp` (2560×1097) | `assets/images/home/vertical-construcao-m.avif` / `.webp` | `assets/videos/home/vertical-construcao.webm` / `.mp4` (1680×720) |
| Empresas familiares e holdings | `assets/images/home/vertical-familias.avif` / `.webp` (1600×1000) | `assets/images/home/vertical-familias-m.avif` / `.webp` | `assets/videos/home/vertical-familias.webm` / `.mp4` (1280×800) |
| Grupos empresariais | `assets/images/home/vertical-grupos.avif` / `.webp` (1600×1000) | `assets/images/home/vertical-grupos-m.avif` / `.webp` | `assets/videos/home/vertical-grupos.webm` / `.mp4` (1280×800) |
| Investidores e patrimônio | `assets/images/home/vertical-patrimonio.avif` / `.webp` (1600×1000) | `assets/images/home/vertical-patrimonio-m.avif` / `.webp` | `assets/videos/home/vertical-patrimonio.webm` / `.mp4` (1280×800) |
| Famílias com imóveis e terras | `assets/images/home/vertical-terras.avif` / `.webp` (1600×1000) | `assets/images/home/vertical-terras-m.avif` / `.webp` | `assets/videos/home/vertical-terras.webm` / `.mp4` (1280×800) |

Outros: `assets/images/hero-dmc-poster-mobile.webp` (cartaz móvel do herói, 720×1280, recomprimido);
mapa do Brasil embutido no HTML (`#presenca`), capitais em `assets/js/data/brasil-capitais.js`; ícones dos
eixos embutidos como `<svg hidden>` no início de `<main>`. Pesos e comandos de codificação:
`docs/dmc/home-redesign/midia-relatorio.md`; prancha de contato: `docs/dmc/home-redesign/midia-contact-sheet.png`.

---

## 7. Estado do build e da publicação

- **`vercel.json` inalterado** (sem diferença no `git diff`); `sitemap.xml` e `robots.txt` inalterados — a
  home mantém a mesma URL e as 25 URLs do sitemap continuam válidas; a página de descadastro é `noindex` e
  fica fora do sitemap por desenho. Teste `vercel-config` 1/1 (17 regras iguais ao `config.json` compilado).
- **Commitado localmente** na branch `feat/dmc-prime` (commit `53a412d`, 2026-10-17); **nenhum push e nenhum deploy**. A
  entrada na `main` segue por squash (T4) quando você autorizar.
- **Condições para publicar (D3 / T3), ainda abertas:**
  1. Rotação das credenciais expostas (incluindo `server/.env.bak-atlas`) e variáveis configuradas na Vercel
     (`MONGODB_URI`, e-mail de aviso opcional) — roteiro em `docs/dmc/DEPLOY.md`.
  2. Política de privacidade sem os 12 marcadores `[CONFIRMAR]` (item 9 acima) — sem isso a newsletter não pode
     ir ao ar.
  3. Sua autorização expressa para esta rodada; a equipe não publica por conta própria.
- **Plano de reversão:** ponto de restauração T1 e commit b26a462; o deploy anterior da Vercel permanece
  disponível para *rollback* imediato pelo painel.
