# Nova home — COPY FINAL (r2)

content-director · 2026-10-17 · r2 após dois revisores (mudanças em `copy-revisao.md`) · fonte
estruturada: `copy.json` (mesma pasta; prevalece em caso de divergência). Tudo abaixo é
publicidade sob o Provimento 205/2021 e a D7: método, escopo e fundamento, nunca resultado,
número institucional ou garantia. `[CEO n]` = pendência da §8 de `HOME_REDESIGN.md`. Grafia:
**ADTECH**, **Complexo DMC**. Hrefs relativos à home; só páginas existentes. Hero, navbar,
campos do formulário de contato e estrutura do vídeo: **intocados**.

---

## 02 · A Casa — `#conheca`

- Overline: **Sobre**
- H2: Uma decisão, *várias áreas da lei*. Alguém precisa coordenar.
- Lead (mensagem aprovada pelo CEO): O Complexo DMC integra seis eixos de especialidade para decisões empresariais, patrimoniais e operacionais de alta complexidade.
- CTA (link): **Conhecer o Complexo DMC** → `pages/sobre.html`
- Ficha (2 linhas):
  - **O que somos** — Consultoria em negócios, com sede em São Paulo, para decisões que envolvem mais de uma área ao mesmo tempo.
  - **Como trabalhamos** — Seis especialidades trabalhando o mesmo caso. Cada ato que a lei reserva a profissionais habilitados fica com quem pode praticá-lo.
- Sai: botão de contato duplicado, tablist dos eixos, rede neural.

## 03 · Seis Eixos — `#features`

- Overline: **Seis eixos**
- H2: Seis eixos, *uma só governança*. *(única ocorrência de "uma só" fora de 04.01)*
- Lead: Comece pela sua situação, não pelo catálogo: cada eixo leva às soluções que a tratam.
- `aria-label` da grade: Os seis eixos do Complexo DMC
- CTA de todos: **Explorar soluções** (aria-label específico por eixo no JSON)

| # | Nome | Descrição (≤160) | CTA → |
|---|---|---|---|
| E1 | Planejamento Patrimonial e Sucessório | Sucessão, holding e proteção do patrimônio familiar organizados em vida, com a carga tributária calculada antes de cada ato. | `pages/planejamento-sucessorio.html` |
| E2 | Tributário, Fiscal e Corporativo | Regime, créditos e estrutura societária revisados em conjunto, com programa de integridade e cada escolha registrada com fundamento legal. | `pages/planejamento-tributario.html` |
| E3 | Direito Notarial e Imobiliário | Viabilidade, incorporação, venda e registro de cada unidade tratados como processo contínuo, com os atos lavrados por cartórios conveniados. | `pages/consultoria-imobiliaria.html` |
| E4 | Auditoria Empresarial e Contábil | Leitura gerencial de balanço, DRE e controles para que sócio, conselho e banco leiam o mesmo número. Escrituração e auditoria com parceiros habilitados. | `pages/contabilidade.html` `[CEO 10]` |
| E5 | Recuperação de Ativos | Análise do título, levantamento do patrimônio do devedor e coordenação de bloqueio, penhora e execução, com atos processuais de parceiros habilitados. | `pages/recuperacao-ativos.html` |
| E6 | Consultoria Trabalhista | Passivo trabalhista tratado como ciclo: contratos revisados, demissões e acordos documentados, exercício fechado com quitação e defesa por advogados parceiros. | `solucoes/consultoria-trabalhista/ciclo-fechado.html` |

**Catálogo recolhido** (`details`): summary **Todas as soluções por eixo**. 21 links. Texto do
link ≠ H1 da página onde há `[CEO 2]` (hrefs inalterados; `texto_pagina` no JSON guarda o oficial):
- E1 · Patrimonial e Sucessório — Planejamento Sucessório · Holding Patrimonial · **Separação Patrimonial** (página "Blindagem Patrimonial", `[CEO 2]`) · Proteção Patrimonial · Sucessão Testamentária
- E2 · Tributário e Corporativo — Planejamento Tributário · Compliance e Governança
- E3 · Notarial e Imobiliário — Consultoria Imobiliária · Jurídico Imobiliário `[CEO 12]` · Jurídico Vendas `[CEO 12]` · Registro Imobiliário · Atos Notariais
- E4 · Auditoria e Contábil — Auditoria Empresarial e Contábil (`contabilidade.html`)
- E5 · Recuperação de Ativos — Recuperação de Ativos
- E6 · Consultoria Trabalhista — Ciclo Fechado (programa) · **Arquitetura Contratual** (página "Blindagem Contratual", `[CEO 2]`) · Conformidade Psicossocial · Decisão Assistida · Câmara de Acordos · Quitação Anual · **Gestão do Contencioso Trabalhista** (página "Defesa Empresarial", `[CEO 2]`)
- Não linkar: `planejamento-sucessorio-empresarial` (301); card "Auditoria Empresarial → #contact".

Falas do cliente (saem da home; vão para `catalogo-cards.json`): ver `copy.json › eixos.falas_do_cliente_para_catalogo_cards_json`.

## 04 · Por que o Complexo DMC? — `#porque`

- Overline: **Por quê**
- H2: Por que o *Complexo DMC*?
- Lead: Seis razões que você confere já no primeiro diagnóstico.

01 **Um caso, um plano, um responsável** — Uma sucessão pode envolver holding, tributo e matrícula ao mesmo tempo. Aqui as seis especialidades trabalham o mesmo caso, no mesmo plano, com um só responsável pela coordenação.

02 **Cenários antes do ato** — Cada decisão chega ao cliente como relatório de caminhos comparados por custo, prazo e fundamento normativo. A escritura, o protocolo ou a reorganização vêm depois da escolha, não antes.

03 **Cada ato com quem a lei habilita** — Advogados parceiros redigem contratos, pareceres e petições; contadores e auditores habilitados escrituram e opinam; cartórios conveniados lavram e registram. O Complexo DMC coordena o plano e responde pela consultoria. *(única fórmula completa da home — S13)*

04 **Quem lê os números não é quem os produz** — A revisão das demonstrações e dos controles é feita por quem não os produziu, e os achados alimentam a análise tributária e a conferência da folha.

05 **Acompanhamento com indicadores que o cliente vê** — Relatório periódico e indicadores próprios por frente de trabalho: protocolos no Registro de Imóveis, exercício trabalhista fechado, provisão e desembolso lado a lado. O plano é revisto quando a lei, a empresa ou a família mudam.

06 **Tecnologia que acelera; profissional habilitado que assina** — Automação documental, dossiês organizados com controle de acesso e painel de acompanhamento do caso apoiam as seis especialidades. Cada documento passa pela revisão do parceiro habilitado que responde por ele antes da assinatura.
CTA (link): **Ver a tecnologia aplicada ao método** → `pages/tecnologia.html`. Sem ARTHEU, IA de minutas, tribunais, API, PCD `[CEO 4, 6]`.

## 05 · Verticais de Negócios — `#verticais`

- Overline: **Verticais de negócio**
- H2: Setores diferentes, *a mesma pergunta*: qual é a decisão a tomar.
- Lead: Cada painel começa pela situação do seu negócio e leva à página do eixo que a conduz.
- `aria-label` da lista: Verticais de negócio do Complexo DMC
- Eyebrow: **pergunta direta ao leitor, sem aspas e sem itálico de citação** (não é fala de cliente nem depoimento). Rótulo visual opcional "Situação típica".
- Imagens: `alt=""` (decorativas; o `article` já carrega o texto). `alt_reserva` no JSON para o caso de fotografia informativa. Vídeo `aria-hidden tabindex=-1`.

| # | Setor | Eyebrow | Headline (≤45 car.) | Frase | CTA → |
|---|---|---|---|---|---|
| 01 | Construção civil e incorporação | Tem um terreno e não sabe se o empreendimento fecha? | Do terreno à matrícula de *cada unidade*. | Antes de comprar o terreno: viabilidade, situação da matrícula e o caminho até o registro de cada unidade pelos cartórios conveniados, num mesmo plano. | **Avaliar um terreno ou empreendimento** → `pages/consultoria-imobiliaria.html` |
| 02 | Empresas familiares e holdings | Os sócios são irmãos e ninguém combinou a sucessão? | Quem herda as quotas e *quem assume o comando*. | Holding, acordo de sócios e protocolo familiar desenhados juntos, com a carga tributária de cada cenário calculada no diagnóstico. | **Ver como organizamos a sucessão entre sócios** → `pages/planejamento-sucessorio.html` |
| 03 | Grupos empresariais | São quatro empresas e nenhuma estrutura foi pensada em conjunto? | Quatro empresas, *uma estrutura* decidida. | Comparação documentada de regimes com os números da própria empresa, reorganização societária e programa de integridade sob a mesma governança. | **Comparar regimes com os números da sua empresa** → `pages/planejamento-tributario.html` |
| 04 | Investidores e estrutura patrimonial | Tem imóveis e participações e não sabe o que está em seu nome? | O que está em seu nome, *e por quê*. | Centralização em holding, governança e tributação avaliadas caso a caso, com a leitura independente dos números de cada participação. | **Entender a holding para imóveis e participações** → `pages/holding-patrimonial.html` |
| 05 | Famílias que detêm imóveis e terras `[CEO 6]` | A área está na família há gerações e a matrícula não bate? | Antes de dividir a terra, *a matrícula*. | Retificação de área e regularização fundiária analisadas antes de qualquer escritura de divisão, doação ou venda das terras. A sucessão da família entra pelo eixo patrimonial. | **Entender a regularização da matrícula** → `pages/registro-imobiliario.html` · link secundário **Planejar a sucessão das terras** → `pages/planejamento-sucessorio.html` |

## 06 · Presença — `#presenca`

- Overline: **Presença**
- H2: De São Paulo, *conectados aos desafios* do Brasil.
- Lead (D9, fórmula literal): Sede em São Paulo. Atendimento em todo o Brasil e no exterior, com parceiros habilitados e cartórios conveniados definidos conforme o caso.
- Endereço: Rua Riachuelo, 231 · São Paulo, SP
- CTA (link): **Descrever o seu caso** → `#contact`
- Mapa `role="img"` `<title>`: Mapa do Brasil com a sede do Complexo DMC em São Paulo · rótulo: São Paulo · canvas `aria-hidden`.
- Proibido aqui: contagem de estados/cidades/países, lista de praças, legenda de cobertura, "casos conduzidos em…".

## 07 · Inteligência — `#publicacoes`

- Overline: **Inteligência**
- H2: O que escrevemos sobre *o que fazemos*.
- Destaque (E1 · Patrimonial e Sucessório · **sem `<time>`** até `[CEO 7]`): **Por que planejar a sucessão em vida** — Legítima, inventário e ITCMD: o que muda quando a família decide antes, com doação, holding e testamento — e o que fica com advogados parceiros e cartórios conveniados. CTA **Ler a análise** → `pages/por-que-urgente.html`
- Data: só se o CEO confirmar a revisão editorial e por quem ("Revisado em … por <função habilitada>"). A data de hoje é de commit, não de revisão.
- Aside: overline **Em preparação**; dois traços vazios (`aria-hidden`), sem título, sem data, sem "em breve". CTA **Receber quando sair** → `#newsletter`.

## 08 · Método e formação — `#treinamentos`

- Overline: **Método e formação** (id mantido; rótulo "Treinamentos" no menu/rodapés `[CEO 15]`)
- H2: Como *conduzimos* uma decisão.
- Lead: A conversa inicial leva a um diagnóstico; o diagnóstico, a uma proposta com escopo, etapas e entregas.

01 **Diagnóstico** — Leitura do caso com os documentos e os dados do cliente. Identificamos a decisão a tomar e os eixos que ela envolve.
02 **Cenários e decisão** — Você recebe um relatório com dois ou três caminhos e o que cada um custa, demora e exige em documentos. A decisão é sua, com os cenários na mesa.
03 **Estruturação e implementação** — Plano de atos coordenado pela consultoria e executado por parceiros habilitados e cartórios conveniados, cada um no que a lei lhe atribui.
04 **Acompanhamento e revisão** — Reuniões periódicas com os indicadores do seu caso. Quando a lei, a empresa ou a família mudam, o plano é ajustado com você.

Aside **Formação** — **Arquitetura Patrimonial Estratégica** · Programa de formação institucional · 42 horas · online. Leitura do patrimônio como sistema: direito, administração, contabilidade e tecnologia sob a mesma governança consultiva. *(paráfrase da descrição oficial em `data.js`)* CTA **Conhecer a plataforma** → `plataforma-ead/`. Sem preço, sem módulos, sem público-alvo, sem outros cursos `[CEO 3]`.

## 09 · Newsletter — `#newsletter` — **BLOQUEIO DE PUBLICAÇÃO `[CEO 9]`**

Copy pronta; a seção entra no HTML com `hidden` até `pages/politica-de-privacidade.html` sair sem os 7 marcadores `[CONFIRMAR]` (art. 9º LGPD: consentimento não pode remeter a política inacabada).

- Overline: **Newsletter**
- H2: Receba as *próximas análises*.
- Lead: Textos curtos, só quando houver algo a dizer: sucessão, tributos, imóveis, auditoria, crédito e passivo trabalhista.
- Legal visível: Você pode se descadastrar a qualquer momento pelo link de cada e-mail ou escrevendo para administrativo@complexodmc.com.br.
- Campos: **Nome** · **E-mail** · **Empresa** (opcional) · honeypot "Não preencha este campo".
- Consentimento (`texto_id` v1): Autorizo o Complexo DMC a usar meu nome e e-mail para enviar análises, nos termos da LGPD (Lei 13.709/2018) e da [Política de Privacidade](pages/politica-de-privacidade.html).
- Botão: **Quero receber análises** · enviando: **Enviando…**

Mensagens de estado (sucesso só com 2xx + `{ok:true}`; erros sem "receb"/"cadastrad"):
- 201: Inscrição registrada. Você pode sair da lista a qualquer momento pelo link de cada mensagem ou por administrativo@complexodmc.com.br.
- 200 (honeypot): Inscrição registrada.
- 400 campos: Revise os campos indicados. — por campo: Informe seu nome. · Informe seu nome completo. · Nome muito longo (máximo de 120 caracteres). · Informe seu e-mail. · E-mail inválido. Confira o endereço digitado. · Nome da empresa muito longo (máximo de 120 caracteres). · Para se inscrever, é preciso autorizar o uso do seu nome e e-mail (LGPD).
- 400 JSON: Não foi possível ler os dados enviados. Tente de novo.
- 413: Conteúdo grande demais. Confira os campos e tente de novo.
- 429: Muitas tentativas em sequência. Aguarde alguns minutos e tente de novo.
- 503: Não foi possível registrar agora. Tente de novo em alguns minutos ou escreva para administrativo@complexodmc.com.br.
- Rede/timeout: Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.

Descadastro: título **Sair da lista** · pergunta "Confirma a saída da newsletter do Complexo DMC?" · botão **Confirmar saída** · feito "Pronto. Este e-mail não está mais na lista." · por e-mail (202) "Se este e-mail estiver na lista, ele será removido." · token inválido "Este link não é válido. Para sair da lista, escreva para administrativo@complexodmc.com.br."

## Vídeo — `#video` (estrutura intocada)

- Overline **Em vídeo** · H2: O Complexo DMC *em vídeo*. · Lead mantido.
- Vazio: **Espaço reservado para o vídeo** — Vídeo institucional do Complexo DMC — em preparação. (troca "em breve neste espaço") · `[CEO 11]` ID do YouTube.

## 10 · Contato — `#contact` (form intocado)

- Overline: **Contato** (antes "Entre em Contato")
- H2: Comece pela *decisão a tomar*.
- Lead: Descreva o contexto da empresa ou do patrimônio. A conversa inicial parte do eixo correspondente e define o diagnóstico. (antes "O especialista do eixo … conduz" — `[CEO 8]`: nenhuma afirmação de equipe)
- Frase: Conte o cenário. Estruturamos a decisão com você.
- Canais mantidos; WhatsApp = secundário. Textos qualificados do WhatsApp (`?text=`): "Olá! Gostaria de uma conversa inicial sobre <nome do eixo>." (E1–E6 no JSON); sem eixo, texto atual.

## Rodapé — `#rodape`

- Marca, p2: Sede em São Paulo. Atendimento a empresas, famílias empresárias, incorporadoras e investidores, no Brasil e no exterior. (D9)
- Coluna "Sobre": Sobre o Complexo DMC · Soluções (`#features`) · Treinamentos (`#treinamentos`, `[CEO 15]`) · Tecnologia · Parcerias (`parcerias/`, **só quando o arquivo existir no HEAD**) · Por que planejar a sucessão em vida · **Newsletter** (`#newsletter`, novo — ocultar junto com a seção enquanto `[CEO 9]`) · **DMC Business School** (antes "Área do aluno") · **ADTECH** (antes "Ad-tech").
- Legal e colunas Eixos/Contato: intocados.

---

## Divergências sinalizadas (texto existente ou de outros docs ajustado — não em silêncio)

1. `blueprint-newsletter.md` §2: erro de consentimento "Para **receber** nossas análises…" viola a regra do próprio spec (erro sem "receb"). Proposto: "Para se inscrever, é preciso autorizar o uso do seu nome e e-mail (LGPD)." Backend deve adotar o mesmo texto.
2. H2 de 05 encurtado em relação ao `[copy]` da spec (retirado "…e que eixos ela envolve"); a ideia foi para o lead novo.
3. `#video` vazio: "em breve neste espaço" → "em preparação" (evita prazo implícito).
4. `#contact`: "especialista do eixo" → fórmula sem equipe (`[CEO 8]`); overline "Entre em Contato" → "Contato".
5. Rodapé p2 ganha "no Brasil e no exterior" por força da D9.
6. `ciclo-fechado.html` meta description diz "proteção trabalhista" — fora do escopo desta entrega, registrado para revisão.
7. **Novo (r2):** `pages/sobre.html` — FAQ "Atendem fora de São Paulo?" (HTML linha ~490 e JSON-LD `FAQPage` linha ~113) ainda diz "depende do eixo, do escopo e da rede de parceiros… definida na conversa inicial". Deve ser alinhada à D9 no mesmo lote: "A sede fica em São Paulo. O atendimento é em todo o Brasil e no exterior, com parceiros habilitados e cartórios conveniados definidos conforme o caso." Não editado aqui (fase sem edição em `complexodmc.com.br/`).
8. **Novo (r2):** texto dos links do catálogo com `[CEO 2]` difere do H1 das páginas de destino (Separação Patrimonial / Arquitetura Contratual / Gestão do Contencioso Trabalhista). Se o CEO mantiver os nomes, reverter só o `texto` (hrefs intactos).
