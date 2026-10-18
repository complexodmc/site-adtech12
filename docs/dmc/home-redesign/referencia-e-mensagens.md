# Home redesign — referência editorial, avaliação comercial e mensagens

Estrategista B2B · 2026-10-17 · insumo para `content-director` e `creative-webdesigner`.
Tudo aqui é publicidade sob o Provimento 205/2021 e a decisão D7: método, escopo e
fundamento, nunca resultado, número institucional ou garantia. `[CONFIRMAR]` = CEO.

Fontes lidas: `docs/dmc/BRIEF.md`, `docs/dmc/EIXOS-COPY.md`, `complexodmc.com.br/index.html`,
`complexodmc.com.br/pages/sobre.html`, `complexodmc.com.br/plataforma-ead/js/data.js`,
`docs/dmc/DECISIONS.md` (cabeçalhos), https://planning.com.br/ (WebFetch, texto da página;
o fetch não devolve imagens, cores nem medidas — observações visuais são inferidas).

---

## 1. Referência de maturidade: planning.com.br (padrões, não cópia)

O que o fetch mostrou, seção a seção, e o que torna cada padrão "maduro".

| Seção equivalente ao brief | Padrão observado (em palavras) | Por que funciona | Transferível à DMC? |
|---|---|---|---|
| Áreas de atuação | Cinco áreas, cada uma com um ícone pequeno, um título, **uma linha** orientada a benefício e um único link textual. Introduzidas por título de duas linhas. Sem subcards, sem abas. | Densidade baixa e previsível: o olho aprende o padrão no primeiro card e varre os demais. Um link por área, sempre no mesmo lugar. | Sim: é exatamente o grid 3×2 do brief (ícone, nome, descrição curta, "Explorar soluções"). A DMC tem 6 áreas, não 5, e cor de acento por eixo. |
| "Por que" | Faixa de credenciais numéricas (ativos sob gestão, ranking, NPS, equipe, selo ESG) com legendas curtas. | Lê-se em cinco segundos; funciona como "faixa de confiança" antes das verticais. | **Não** no conteúdo (números, ranking, NPS são vedados pela D7 e pelo Provimento 205). **Sim** na forma: faixa curta, 6 itens, 1 título + 1 frase, lida antes de pedir contato. A DMC substitui número por fato verificável de método. |
| Verticais | Nove setores **numerados**, título + link "conheça mais". Introduzidas por uma afirmação de tese sobre os setores. | Numeração dá ritmo editorial e sensação de catálogo curado; a tese de abertura diz por que a casa atende setores diferentes com um mesmo método. | Sim, com cinco a sete painéis grandes (brief) em vez de lista; a tese de abertura é o que falta na DMC hoje. Nove é demais; cinco a sete é o limite de leitura. |
| Confiança técnica | Grade de logotipos de ERPs com que a casa trabalha. | Prova de competência sem adjetivo: nomes de terceiros reconhecíveis. | Só se houver parceiros/sistemas nomeáveis e autorizados `[CONFIRMAR]`; hoje não há. Não inventar. |
| Presença | Uma frase sobre alcance nacional e um mapa. | Mapa diz "tamanho" sem número. | Sim, com a restrição do brief: sem números de cobertura e sem afirmar atendimento fora de SP `[CONFIRMAR]`. |
| Publicações | Três cards idênticos: etiqueta de categoria, data, título, "continue lendo". | Repetição estrita de três elementos; nunca mais de três cards na home. | Sim na estrutura; **hoje a DMC não tem publicação real** (ver §2). |
| FAQ | Seis perguntas em título + parágrafo, texto mais longo e orientado a SEO. | Responde objeções (confidencialidade, personalização, diferencial) sem interromper o fluxo visual. | Já existe em `pages/sobre.html`; na home, as objeções entram em "Por que" e no CTA final, não como FAQ. |
| Treinamentos | Não existe. O mais próximo é "trabalhe conosco". | — | Confirma a recomendação do brief: metodologia em vez de catálogo de cursos. |
| Newsletter | Convite curto + campo de e-mail. | Pede uma coisa só. | Sim; a DMC adiciona nome e empresa opcional, consentimento e descadastro (brief). |
| Navegação e CTA | Menu com três dropdowns temáticos (sobre / atuação / verticais), um botão de alto contraste de conversão sempre visível; nos blocos, verbos genéricos em caixa alta ("saiba mais", "conheça mais"). | Um só CTA de conversão persistente evita competição; os links secundários são deliberadamente discretos. | A persistência sim. Os verbos genéricos **não**: a DMC já tem CTAs por eixo (EIXOS-COPY) e deve mantê-los, porque dizem o que acontece depois do clique. |
| Ritmo claro/escuro | Cabeçalho e rodapé escuros (logo em versão branca), miolo claro; FAQ e rodapé densos, miolo arejado. | O escuro emoldura; o claro é onde se lê. Densidade cresce para o fim da página. | Sim, invertendo onde a direção C pede: hero e "Casa" escuros, eixos em claro, "Por que" em mosaico, verticais fotográficas, presença escura, publicações/newsletter claras, CTA final escuro. |

Síntese do que a referência ensina: **um padrão por seção, repetido sem variação; uma linha
de texto por item; um link por item; tese curta abrindo cada bloco; um único CTA de conversão
persistente**. O que não se transfere: identidade contábil, faixa de números, ranking, verbos
genéricos.

---

## 2. Avaliação comercial da home atual (index.html, 1164 linhas) frente ao brief

### 2.1 O que falta (seções do brief ausentes)
- **04 Por que o Complexo DMC?** — não existe. O visitante é convidado ao contato no hero e na
  "Casa" antes de receber qualquer razão para confiar. A faixa `.fatos` (6 eixos / Parceiros /
  Cartórios / São Paulo) tenta cumprir esse papel, mas lê-se como rótulo de estrutura, não
  como diferencial.
- **05 Verticais de Negócios** — não existe. O site inteiro é organizado por eixo (oferta);
  nenhuma seção fala a língua do setor do visitante (incorporadora, agro, família empresária,
  grupo, investidor). A única pista de público está em `sobre.html` ("Quem atendemos").
- **06 Presença Nacional** — não existe; a sede aparece só na faixa `.fatos` e no rodapé.
- **07 Inteligência & Publicações** — não existe e **não há publicação real no site**: nenhum
  diretório de artigos; o único conteúdo editorial é `pages/por-que-urgente.html` (apoio de E1).
- **09 Newsletter** — não existe; não há captura de lead frio em nenhum ponto da página.

### 2.2 O que repete
- **Os seis eixos aparecem quatro vezes**: faixa `.fatos` ("6 eixos"), tablist da "Casa" com
  seis focos e seis links "Conhecer o eixo En", painel `#features` (seis abas + seis banners
  `#eixo-N` + 18 cards) e rodapé. A "Casa" e o painel dizem a mesma coisa com o mesmo texto
  (a frase de especialidade do EIXOS-COPY aparece nos dois).
- **O CTA "Converse com nossos especialistas" aparece idêntico no hero e na "Casa"**, ambos
  para `#contact`; a "Casa" ainda soma "Sobre o Complexo DMC". Dois botões iguais em sequência
  não acrescentam conversão, só peso.
- **"Saiba mais" / "Conhecer a solução" / "Conhecer o eixo"**: três verbos para a mesma ação.

### 2.3 Onde a conversão se perde
1. **Sobrecarga antes da confiança.** Entre o hero e o formulário há 6 abas, 6 banners, 18
   cards, 6 cursos e 3 cards de tecnologia — cerca de 40 pontos de clique — e nenhuma
   seção que responda "por que confiar à DMC uma decisão relevante?". O fluxo é catálogo →
   catálogo → contato.
2. **Dois canais de conversão competindo com mensagens diferentes.** Os banners dos eixos levam
   a `#contact` com `data-assunto`; o fechamento do painel (`.np-closer`) e o botão flutuante
   levam ao WhatsApp com texto genérico ("Gostaria de uma conversa inicial"), sem eixo. O lead
   que chega pelo WhatsApp chega sem qualificação; o que chega pelo formulário chega
   qualificado. Hoje o WhatsApp está no ponto de maior intenção (fim do painel).
3. **"Qual é a sua situação?" é o melhor ativo da página e está escondido no meio do painel.**
   Entra pela dor, na fala do cliente, e já aponta a solução. Mas cobre só cinco eixos: **E6
   (trabalhista) não tem frase**; E3 tem duas. A busca `#npAsk` em "vazio" manda para o
   WhatsApp sem contexto.
4. **Treinamentos exibem seis cursos que não existem no catálogo da EAD** (`data.js` tem
   apenas "Arquitetura Patrimonial Estratégica", 42 horas, online). Carga horária e modalidade
   ("16 horas, Presencial", "24 horas, Híbrido") são afirmações sem base; os links levam a
   `login.html?curso=…` de cursos inexistentes. É o ponto de maior risco de credibilidade e
   de conformidade da home atual (afirmação de fato sem lastro).
5. **Tecnologia ocupa uma seção inteira (`#results`, id residual) com um card "Integrações sob
   avaliação"**: promessa vaga que concorre com os eixos. O brief pede que vire um diferencial
   em "Por que" com link para `pages/tecnologia.html`.
6. **Hero manda para `#features` ("Ver os seis eixos") e pula a "Casa"**: o visitante que segue
   o link secundário nunca lê quem é a DMC.
7. **O formulário está a cinco seções do último argumento**; não há CTA intermediário por
   vertical nem captura leve (newsletter) para quem não está pronto para contato.
8. **Vocabulário residual de atividade reservada**: card "Auditoria e Inteligência Contábil"
   em `pages/contabilidade.html` e a dor "a minha contabilidade não acompanha" posicionam a
   DMC como escritório contábil para quem lê rápido; "Blindagem" (E1 e E6) segue pendente.

### 2.4 O que preservar
Hero (aprovado). A tese "Comece pela sua situação, não pelo catálogo". As frases na fala do
cliente. Os CTAs por eixo do EIXOS-COPY com `data-assunto`. O `select#cf-eixo` com E1–E6 e
"Ainda não sei" (é a qualificação de lead já pronta). O bloco de vídeo antes do contato.

---

## 3. Mensagens por vertical (headline + 1 linha + CTA)

Regra: a headline nomeia a decisão do setor, a frase diz o que a DMC faz (método/escopo), o
CTA nomeia uma ação real e leva à página existente ou ao formulário com assunto. Nenhum número,
nenhum resultado. Os cinco primeiros são os painéis do brief; credores e empregadores entram
como painéis 6–7 ou como entradas do painel dos eixos (decisão do `creative-webdesigner`).

| # | Vertical | Headline | Frase (1 linha) | CTA → destino | Eixos |
|---|---|---|---|---|---|
| 1 | Construção civil e incorporação | **Do terreno à matrícula de cada unidade.** | Due diligence do terreno, incorporação, venda e registro coordenados em um só plano, com atos lavrados por cartórios conveniados e revisão de parceiros habilitados. | "Avaliar um terreno ou empreendimento" → `pages/consultoria-imobiliaria.html` | E3 (+E6 terceirização, +E5 unidades inadimplentes) |
| 2 | Agronegócio | **A terra em ordem na matrícula e na sucessão.** | Retificação de área, regularização fundiária e transmissão das terras entre gerações tratadas em conjunto, antes de qualquer escritura. | "Conversar sobre as terras e a sucessão" → `pages/registro-imobiliario.html` (secundário: `pages/planejamento-sucessorio.html`) | E3, E1 `[CONFIRMAR holding rural; nenhuma página cita o agro]` |
| 3 | Empresas familiares e holdings | **Quem herda as quotas e quem assume o comando.** | Holding, acordo de sócios e protocolo familiar desenhados juntos, com a carga tributária de cada cenário calculada no diagnóstico. | "Conversar sobre a sucessão da família" → `pages/pronto-patrimonio.html` (secundário: `pages/planejamento-sucessorio-empresarial.html`) | E1 (+E2 governança, +E4) |
| 4 | Grupos empresariais | **Regime, estrutura e integridade decididos com fundamento.** | Comparação documentada de regimes com os números da própria empresa, reorganização societária e programa de integridade sob uma só governança. | "Pedir o diagnóstico tributário" → `pages/planejamento-tributario.html` (secundário: `pages/compliance-governanca.html`) | E2 (+E4, +E6) |
| 5 | Investidores e gestão patrimonial | **Imóveis e participações sob uma estrutura que se explica.** | Centralização em holding, governança e tributação avaliadas caso a caso, com a leitura independente dos números de cada participação. | "Conversar sobre a estrutura do patrimônio" → `pages/holding-patrimonial.html` (secundário: `pages/juridico-vendas.html` para risco do comprador) | E1, E4 (+E3, +E5) |
| 6 | Credores | **Do título executivo ao patrimônio do devedor.** | Análise do título, levantamento patrimonial em registros públicos e sistemas conveniados ao Judiciário e coordenação de bloqueio e penhora com parceiros habilitados. | "Enviar o título para análise" → `pages/recuperacao-ativos.html` | E5 |
| 7 | Empregadores | **Passivo trabalhista gerido como se fecha um balanço.** | Seis soluções na ordem da relação de trabalho, da admissão à quitação anual do exercício, cada uma com fundamento normativo explícito. | "Falar com o time trabalhista" → `solucoes/consultoria-trabalhista/ciclo-fechado.html` | E6 |

Tese de abertura da seção (sugestão): **"Setores diferentes, a mesma pergunta: qual é a
decisão a tomar e que eixos ela envolve."** Sub: "Cada painel começa pela situação do seu
negócio e leva à página do eixo que a conduz."

Observações de conformidade por vertical
- Agro: não afirmar atuação em regularização rural específica (CAR, georreferenciamento) sem
  página que a sustente; a frase acima usa só o que `registro-imobiliario.html` já publica.
- Investidores: evitar "rentabilidade", "proteção", "otimização"; usar "estrutura", "leitura".
- Credores: manter "presentes os requisitos legais" se citar desconsideração; não citar prazo.
- Empregadores: não citar o prazo de 24–48 h do parecer `[CONFIRMAR]`.

---

## 4. "Por que o Complexo DMC?" — seis diferenciais verificáveis

Cada item: título + 1 frase. Fonte do fato à direita (tudo já publicado em `sobre.html` ou
`EIXOS-COPY.md`); nada depende de número, prêmio, cliente ou resultado.

| # | Título | Frase | Fato que sustenta |
|---|---|---|---|
| 1 | **Seis eixos, uma só governança** | Uma sucessão pode envolver holding, tributo e matrícula ao mesmo tempo; aqui os seis eixos trabalham o mesmo caso sob um só plano e um só responsável pela coordenação. | Estrutura dos eixos; texto do painel `#features`. |
| 2 | **Cenários antes do ato** | Cada decisão chega ao cliente como relatório de caminhos comparados por custo, prazo e fundamento normativo; a escritura, o protocolo ou a reorganização vêm depois da escolha, não antes. | Método de 4 etapas em `sobre.html`; E1 (ITCMD por cenário), E2 (comparação de regimes). |
| 3 | **Consultoria e ato privativo, cada um no seu lugar** | Contratos, pareceres e petições são de sociedades de advogados parceiras; escrituração e parecer de auditoria, de contadores e auditores habilitados; escrituras e registros, de cartórios conveniados. O Complexo DMC coordena o plano e responde pela consultoria. | `sobre.html` §Governança e parceiros. É também a resposta à objeção "isso não é advocacia/contabilidade?". |
| 4 | **Quem lê os números não é quem os produz** | A escrituração fica com parceiro habilitado; a revisão das demonstrações e dos controles é feita por quem não os produziu, e os achados alimentam a análise tributária e a conferência da folha. | E4 diferencial 1 e 3 (EIXOS-COPY). |
| 5 | **Acompanhamento com indicadores que o cliente vê** | Relatório periódico e indicadores próprios por frente de trabalho (protocolos no Registro de Imóveis, exercício trabalhista fechado, provisão × desembolso), com revisão do plano quando a lei, a empresa ou a família mudam. | `sobre.html` etapa 4; E3 diferencial 2; E6 diferencial 3. |
| 6 | **Tecnologia a serviço dos eixos, com revisão de quem responde** | Automação documental, dossiês organizados e painel do caso apoiam os seis eixos; nenhum documento sai sem a revisão do parceiro habilitado que responde por ele. | `pages/tecnologia.html`; `sobre.html`. Link: "Ver a tecnologia aplicada aos seis eixos" → `pages/tecnologia.html`. **Não nomear** ARTHEU, IA de minutas, integração com tribunais/cartórios nem API `[CONFIRMAR]`. |

Critério de aceite aplicado: cada item responde "por que confiar à DMC uma decisão relevante?"
com um fato de método ou de escopo; nenhum usa adjetivo ("excelência", "líder", "referência")
nem quantidade. Objeções cobertas: "é escritório de advocacia/contabilidade?" (3), "vou
pagar por uma opinião?" (2 e 5), "vão só me vender holding?" (1), "quem garante os números?"
(4), "IA mexendo no meu contrato?" (6).

Substituir a faixa `.fatos` por esta seção; os quatro rótulos atuais ficam absorvidos em 1, 3
e na seção de presença.

---

## 5. Recomendações aos outros agentes

### content-director (headline, sub, CTA por seção)
- **02 A Casa** — manter "Decisões complexas pedem visão integrada." Sub: uma linha só, com a
  natureza da casa ("consultoria em negócios, em São Paulo, para decisões que envolvem mais
  de uma área"). **Um** CTA: "Sobre o Complexo DMC" → `pages/sobre.html`. Retirar o botão de
  contato duplicado (já está no hero) e a tablist dos seis eixos (vai para 03).
- **03 Seis Eixos** — título "Seis eixos, uma só governança"; sub "Comece pela sua situação,
  não pelo catálogo." Abrir com "Qual é a sua situação?" (sete frases, uma por eixo, **incluir
  E6**: "Tenho reclamatórias repetidas com os mesmos pedidos e não sei onde o passivo começa.").
  Cada card: nome, frase de escopo do EIXOS-COPY, CTA "Explorar soluções" → página-mãe do eixo.
  Os 18 cards saem da home (ficam no mega-menu e nas páginas internas).
- **04 Por que** — título "Por que o Complexo DMC?"; sub "Seis razões que se verificam no
  método, não em adjetivos." Itens de §4.
- **05 Verticais** — tese e sete mensagens de §3; CTA do painel = CTA da tabela.
- **06 Presença** — "De São Paulo, conectados aos desafios do Brasil." Sub sem número e sem
  afirmar atendimento presencial fora de SP: "Sede em São Paulo; casos conduzidos com
  parceiros habilitados e cartórios conveniados onde o ativo ou a empresa estão." `[CONFIRMAR]`
- **07 Publicações** — título "Inteligência"; enquanto não houver artigos, exibir
  `pages/por-que-urgente.html` como leitura e dois espaços "em preparação" sem título nem data.
- **08 Metodologia** — "Como conduzimos": as quatro etapas de `sobre.html` + um card do
  programa real "Arquitetura Patrimonial Estratégica · 42 horas · online" → plataforma EAD.
  Retirar os seis cursos atuais.
- **09 Newsletter** — "Análises para quem decide." CTA "Quero receber análises"; consentimento,
  descadastro, e mensagem de erro honesta se a API falhar.
- **10 CTA final** — "Comece pela decisão a tomar." Um só canal primário (formulário com
  `select#cf-eixo`); WhatsApp como alternativa secundária com o eixo no texto da mensagem.

### creative-webdesigner (hierarquia de conversão)
1. Ordem de leitura: confiança (02, 04) **antes** do catálogo profundo (03 cards internos) e
   das verticais (05); captura leve (09) antes do contato (10).
2. Um CTA primário por seção; o secundário é link textual. Mesmo verbo para a mesma ação em
   toda a página ("Explorar soluções" nos eixos, CTA específico nas verticais).
3. Botão de contato persistente na navbar → `#contact`; WhatsApp flutuante só após a seção 04
   e com `?text=` que cite o eixo quando vier de um banner.
4. Grid dos eixos: ícone exclusivo + nome + 1 linha + 1 link, cor de acento só no ícone e no
   link; fundo claro (contraste com a "Casa" escura).
5. "Por que": seis blocos em mosaico escuro/claro alternado, sem número em destaque; o item 6
   carrega o único link externo da seção (`pages/tecnologia.html`).
6. Verticais: painel fotográfico procedural com a headline como texto dominante e o CTA
   visível sem hover (mobile).
7. Presença: 35/65 texto/visual; fallback estático com SP destacado; nenhum número no mapa.
8. Newsletter: três campos no máximo; estado de erro visível; nunca "cadastro realizado"
   sem resposta 2xx.

---

## 6. Alertas (fatos que mudam o plano)

1. **Treinamentos**: os seis cursos da home não existem no catálogo da EAD (`data.js` só tem
   "Arquitetura Patrimonial Estratégica", 42 h, online). Cargas horárias e modalidades hoje
   publicadas são afirmações sem lastro — retirar na próxima publicação, independentemente do
   redesign.
2. **Publicações**: não há nenhum artigo real; a seção 07 nasce como estrutura preparada com
   um único conteúdo (`por-que-urgente.html`). Não inventar títulos ou datas.
3. **Agronegócio**: nenhuma página cita o setor; a vertical só pode apontar para
   `registro-imobiliario.html` e `planejamento-sucessorio.html`. Holding rural e regularização
   rural específica dependem do CEO.
4. **E6 sem entrada em "Qual é a sua situação?"**: o eixo recém-aprovado (D1) não tem frase de
   dor na home; incluir.
5. **Dois canais de conversão** (formulário qualificado × WhatsApp genérico) competem; a
   decisão de qual é primário precisa ser única e valer para todas as seções.
6. **Presença nacional**: atendimento fora de SP não confirmado; a seção 06 precisa de texto
   que não afirme cobertura, ou de confirmação do CEO.
7. **Nomes "Blindagem"** (E1 e E6) e slug `contabilidade` seguem pendentes; as mensagens de
   §3 evitam ambos os termos.
8. **Referência**: planning.com.br sustenta credibilidade com números e ranking — modelo
   vedado à DMC. Transferir só a forma (faixa curta, um padrão por seção), nunca o conteúdo.
