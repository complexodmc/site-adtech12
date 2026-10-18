# Central de Parcerias — copy deck (texto final)

Data: 2026-10-17 · Autor: diretor de conteúdo · Revisão de conformidade: `CONFORMIDADE.md`.
Status: texto final para o frontend montar o HTML. **Nenhuma campanha pública antes da
revisão jurídica humana listada em `CONFORMIDADE.md` §5.**

## 0. Convenções para o frontend

- **Rotas e arquivos:** `/parcerias/` → `complexodmc.com.br/parcerias/index.html`;
  `/parcerias/advogados-parceiros/` → `…/parcerias/advogados-parceiros/index.html`;
  `/parcerias/business-partner/` → `…/parcerias/business-partner/index.html`.
  O `navbar.js` calcula a profundidade pelo pathname: estas rotas ficam fora de `/pages/`
  e precisam ser previstas (BRIEF).
- **Canonical / og:url:** `https://www.complexodmc.com.br/parcerias/`,
  `…/parcerias/advogados-parceiros/`, `…/parcerias/business-partner/`.
- **Política de Privacidade:** hub `../pages/politica-de-privacidade.html`; landings
  `../../pages/politica-de-privacidade.html`.
- **Contatos permitidos (verificados):** WhatsApp +55 11 91526-7749, e-mail
  administrativo@complexodmc.com.br, Rua Riachuelo, 231 — São Paulo/SP. Nada além disso.
- **Links de WhatsApp (já codificados):**
  - `WA_HUB` = `https://wa.me/5511915267749?text=Ol%C3%A1%21%20Gostaria%20de%20conversar%20sobre%20os%20programas%20de%20parceria%20do%20Complexo%20DMC.`
  - `WA_PL` = `https://wa.me/5511915267749?text=Ol%C3%A1%21%20Gostaria%20de%20informa%C3%A7%C3%B5es%20sobre%20o%20programa%20DMC%20%7C%20Partner%20Lawyers.`
  - `WA_BP` = `https://wa.me/5511915267749?text=Ol%C3%A1%21%20Gostaria%20de%20informa%C3%A7%C3%B5es%20sobre%20o%20programa%20DMC%20%7C%20Business%20Partner.`
  - `MAIL_INST` = `mailto:administrativo@complexodmc.com.br?subject=Coopera%C3%A7%C3%A3o%20institucional`
  - Atributos: `target="_blank" rel="noopener noreferrer"` (padrão das páginas internas).
- **Submarcas:** sempre `DMC | PARTNER LAWYERS` e `DMC | BUSINESS PARTNER` (caixa alta no
  selo; caixa mista no corpo: "DMC | Partner Lawyers"). Nunca como pessoa jurídica, nunca
  com selo, brasão, balança ou qualquer elemento que lembre a OAB.
- **`<em>`** nos títulos: o trecho entre `*asteriscos*` vai em `<em>` (padrão da casa).
- **Toda página termina** com `section#video` (bloco `.page-video__frame[data-video=""]`)
  antes do `.cta-section` — o texto do bloco está em cada página.
- **H1 único** por página (no herói). Demais títulos de seção em H2; itens em H3.
- **Dados estruturados sugeridos:** `BreadcrumbList` nas três páginas; `FAQPage` espelhando
  exatamente o texto visível do FAQ (mesmo padrão de `pages/sobre.html`). Não usar
  `JobPosting`, `Offer` nem `Review`.
- **Rodapé:** o mesmo das páginas internas, com o texto legal curto de cada página
  (abaixo) no lugar do parágrafo "Conteúdo informativo…".

---

## 1. HUB — `/parcerias/`

**`<title>`** (35): `Central de Parcerias | Complexo DMC`
**meta description** (153): `Conheça os programas de parceria do Complexo DMC: Partner Lawyers, para advogados, e Business Partner, para quem atua com relacionamento empresarial B2B.`
**og:title:** `Ecossistema de Parcerias DMC`
**og:description:** `Dois programas de cooperação com uma estrutura multidisciplinar de consultoria em negócios: Partner Lawyers e Business Partner.`
**Breadcrumb:** Início › Parcerias

### 1.1 `#hero` — herói
- Selo: **ECOSSISTEMA DE PARCERIAS DMC**
- **H1:** Conectamos competências. *Desenvolvemos oportunidades.*  ⚠ ver `CONFORMIDADE.md` §4, item D1
- Sub: Relacionamentos estratégicos que aproximam profissionais, empresas e organizações de uma estrutura multidisciplinar de consultoria em negócios.
- CTA primário: **Conheça os programas** → `#programas`
- CTA secundário: **Converse com nossa equipe** → `WA_HUB`

### 1.2 `#programas` — os dois programas
- Overline: **Programas**
- H2: Dois programas, *dois públicos*
- Descrição: Cada programa tem público, natureza e regras próprias. Escolha o que corresponde à sua atuação.

**Painel 01** (`#programa-partner-lawyers`)
- Rótulo: **01 — Partner Lawyers | Advogados Parceiros**
- Público: Para advogados e sociedades de advocacia
- Descrição: Cooperação técnica e institucional com advogados regularmente inscritos na OAB que atuam em demandas empresariais e patrimoniais complexas. Não envolve captação de causas nem remuneração por indicação.
- Para quem é:
  - Advogados com inscrição regular na OAB
  - Sociedades de advocacia registradas na OAB, inclusive unipessoais
  - Atuação em demandas empresariais, patrimoniais, imobiliárias, tributárias, trabalhistas ou de recuperação de crédito
- Link: **Conhecer o Partner Lawyers** → `advogados-parceiros/`

**Painel 02** (`#programa-business-partner`)
- Rótulo: **02 — Business Partner | Agente Prospector de Negócios**  ⚠ ver `CONFORMIDADE.md` §4, item D3
- Público: Para profissionais e organizações de relacionamento empresarial
- Descrição: Cooperação comercial com quem identifica, na própria rede, oportunidades de consultoria em negócios compatíveis com os seis eixos do Complexo DMC. Não abrange captação de clientela para serviços jurídicos.
- Para quem é:
  - Consultores empresariais e profissionais de desenvolvimento de negócios
  - Representantes comerciais B2B e profissionais de relacionamento corporativo
  - Redes empresariais e organizações com atuação comercial complementar
- Link: **Conhecer o Business Partner** → `business-partner/`

### 1.3 `#comparativo` — lado a lado
- Overline: **Comparativo**
- H2: Os dois programas *lado a lado*
- `<caption>` (pode ser visualmente oculta): Comparativo entre os programas Partner Lawyers e Business Partner
- Cabeçalhos de coluna: (vazio) · **Partner Lawyers** · **Business Partner**

| Linha | Partner Lawyers | Business Partner |
|---|---|---|
| **Para quem é** | Advogados e sociedades de advocacia regularmente inscritos na OAB. | Profissionais e organizações que atuam com relacionamento empresarial B2B. |
| **Natureza da cooperação** | Técnica e institucional: atuação em frentes que exigem ato privativo da advocacia e troca técnica entre profissionais. | Comercial: apresentação de oportunidades de consultoria em negócios compatíveis com o portfólio do Complexo DMC. |
| **Pré-requisito** | Inscrição regular na OAB e atuação compatível com os seis eixos. | Experiência em relacionamento empresarial e rede compatível com o público dos seis eixos. |
| **Como começa** | Candidatura pelo formulário, seguida de validação profissional e reunião institucional. | Cadastro pelo formulário, seguido de análise do perfil e reunião comercial. |
| **O que NÃO faz parte** | Captação de causas, remuneração por indicação e qualquer interferência na autonomia técnica do advogado. | Captação de clientela para serviços jurídicos, atuação em nome do Complexo DMC sem contrato e promessa de resultado a empresas. |

- Nota abaixo da tabela: Nenhum dos programas tem aprovação automática. A participação depende de avaliação individual e, quando cabível, de formalização por escrito.

(Sem linha de remuneração — decisão do CEO.)

### 1.4 `#cooperacao-institucional` — espaço secundário
- Overline: **Cooperação institucional**
- H2: Outras formas *de cooperação*
- Texto: Instituições, associações e organizações que queiram propor outra forma de cooperação com o Complexo DMC podem escrever para a nossa equipe.
- Link: **Escrever para administrativo@complexodmc.com.br** → `MAIL_INST`

### 1.5 `#perguntas` — FAQ (4)
1. **Qual programa corresponde à minha atuação?**
   Advogados e sociedades de advocacia participam pelo Partner Lawyers. Quem atua com relacionamento empresarial, consultoria ou representação comercial B2B participa pelo Business Partner.
2. **Posso participar dos dois programas?**
   Para preservar os deveres éticos da advocacia, advogados participam apenas do Partner Lawyers. Os demais profissionais escolhem o programa que corresponde à sua atuação.
3. **A candidatura cria algum vínculo?**
   Não. A candidatura não cria vínculo de nenhuma natureza. Quando há cooperação, o modelo é definido caso a caso e formalizado por escrito.
4. **Como meus dados são tratados?**
   Os dados enviados servem para avaliar a candidatura ao programa escolhido, nos termos da LGPD (Lei 13.709/2018) e da Política de Privacidade. Comunicações institucionais só são enviadas a quem autorizar, em campo separado.
   (link "Política de Privacidade" → `../pages/politica-de-privacidade.html`)

### 1.6 `#video`
- Overline: **Em vídeo** · H2: Parcerias *em vídeo*
- Descrição: Como funcionam os programas de parceria do Complexo DMC.
- `data-video-title`: `Ecossistema de Parcerias DMC`
- Quadro vazio: título "Espaço reservado para o vídeo" · texto "Vídeo sobre os programas de parceria — em breve neste espaço."

### 1.7 `#conversa` — CTA final (papel)
- Overline: **Conversa**
- H2: Comece pela *conversa certa*
- Texto: Escolha o programa e envie a sua candidatura, ou fale com a nossa equipe antes para tirar dúvidas.
- Botão primário: **Converse com nossa equipe** → `WA_HUB`
- Botão secundário: **Conheça os programas** → `#programas`

### 1.8 Rodapé legal (curto)
Conteúdo informativo. Os programas de parceria do Complexo DMC não envolvem captação de clientela para serviços jurídicos nem remuneração por indicação de causas. A atuação em atos privativos da advocacia, da contabilidade e da auditoria é realizada por profissionais e sociedades parceiras habilitadas; os atos notariais e registrais, por cartórios conveniados.

---

## 2. PARTNER LAWYERS — `/parcerias/advogados-parceiros/`

**`<title>`** (52): `Partner Lawyers — Advogados Parceiros | Complexo DMC`
**meta description** (155): `Cooperação técnica e institucional do Complexo DMC com advogados e sociedades de advocacia inscritos na OAB. Sem captação de causas; avaliação caso a caso.`
**og:title:** `DMC | Partner Lawyers — cooperação técnica com advogados`
**og:description:** `Cooperação técnica e institucional para advogados que atuam em demandas empresariais e patrimoniais complexas. Avaliação individual, sem aprovação automática.`
**Breadcrumb:** Início › Parcerias › Partner Lawyers

### 2.1 `#hero`
- Selo: **DMC | PARTNER LAWYERS**
- **H1:** Excelência profissional conectada a *uma visão estratégica de negócios.*  ⚠ ver `CONFORMIDADE.md` §4, item D2
- Sub: Um ambiente de cooperação técnica e institucional para profissionais que atuam em demandas empresariais e patrimoniais complexas.
- CTA primário: **Solicitar participação no programa** → `#candidatura`
- CTA secundário (link): **Como ocorre a avaliação** → `#avaliacao`
- Nota sob os botões: Programa para advogados e sociedades de advocacia regularmente inscritos na OAB.

### 2.2 `#programa` — apresentação
- Overline: **O programa**
- H2: Cooperação técnica, *cada um no seu papel*
- Texto:
  - O Complexo DMC é uma consultoria em negócios. Organiza o diagnóstico, os cenários e a condução de decisões que envolvem empresa, patrimônio e família, em seis eixos de especialidade.
  - Parte dessas decisões exige atos privativos da advocacia — contratos, pareceres, petições e defesas. A consultoria não pratica esses atos: eles cabem a advogados e sociedades de advocacia habilitados.
  - O Partner Lawyers organiza essa cooperação com critérios de participação, avaliação individual e um modelo de atuação definido caso a caso, compatível com o Estatuto da Advocacia e o Código de Ética e Disciplina da OAB.
- Três princípios (H3 + texto):
  - **Autonomia técnica** — O advogado conduz o trabalho jurídico com independência e responde por ele.
  - **Sigilo profissional** — O sigilo do advogado é preservado em qualquer forma de cooperação.
  - **Sem captação** — O programa não envolve captação de causas nem remuneração por indicação.

### 2.3 `#perfil` — perfil dos profissionais
- Overline: **Perfil**
- H2: Para quem *é o programa*
- Descrição: Advogados e sociedades de advocacia regularmente inscritos na OAB, com atuação em demandas empresariais e patrimoniais.
- Itens (H3 + linha):
  1. **Advogados empresariais** — Societário, contratos e operações entre empresas.
  2. **Sucessões e patrimônio** — Inventário, testamento, holding e planejamento sucessório.
  3. **Direito imobiliário** — Incorporação, registro, regularização e contratos imobiliários.
  4. **Tributaristas** — Consultivo e contencioso tributário, administrativo e judicial.
  5. **Trabalhista empresarial** — Atuação consultiva e contenciosa do lado da empresa.
  6. **Recuperação de ativos** — Execução, cumprimento de sentença e medidas sobre bens.
  7. **Sociedades de advocacia** — Sociedades registradas na OAB, inclusive unipessoais.

### 2.4 `#cooperacao` — possibilidades legítimas
- Overline: **Cooperação**
- H2: Possibilidades *de cooperação*
- Descrição: Formas de cooperação avaliadas caso a caso. A participação no programa não garante demanda nem volume de trabalho.
- Itens:
  1. **Atuação técnica nos seis eixos** — Execução de atos privativos da advocacia em frentes dos seis eixos — como contratos societários, testamentos e inventários, defesas trabalhistas e medidas de execução — quando o caso exigir, com contratação formalizada nos termos do Estatuto da Advocacia.
  2. **Troca técnica** — Discussão de teses, atualização normativa e temas que atravessam os eixos, em encontros técnicos sem dados de clientes.
  3. **Atuação conjunta formalizada** — Quando um trabalho envolve consultoria e advocacia, a divisão de papéis é definida caso a caso e formalizada por escrito, em modelo compatível com o Estatuto da Advocacia e o Código de Ética e Disciplina da OAB.
- Bloco "Fora do programa" (H3 **O que não faz parte**):
  - Captação ou indicação de causas.
  - Remuneração por indicação.
  - Interferência na autonomia técnica do advogado.
  - Acesso a dados de clientes fora de um trabalho formalizado.

### 2.5 `#ambiente` — diferenciais da estrutura (fatos verificáveis)
- Overline: **Contexto**
- H2: O ambiente *da cooperação*
- Itens:
  1. **Seis eixos de especialidade** — Patrimonial e Sucessório; Tributário, Fiscal e Corporativo; Notarial e Imobiliário; Auditoria Empresarial e Contábil; Recuperação de Ativos; Consultoria Trabalhista.
  2. **Governança comum** — Um mesmo método nos seis eixos: diagnóstico, plano de atos e acompanhamento, com cada ato atribuído a quem a lei habilita.
  3. **Tecnologia própria** — ADTECH, para documentos, prazos e fluxos de cada caso, e DMC Business School, para cursos e treinamentos. Link: **Conhecer o portal digital** → `../../pages/tecnologia.html#portal`
  4. **Alcance** — Sede em São Paulo, com atendimento em todo o Brasil e no exterior.

### 2.6 `#avaliacao` — como ocorre a avaliação
- Overline: **Avaliação**
- H2: Como ocorre *a avaliação*
- Descrição: Cada candidatura é avaliada individualmente. Não há aprovação automática, e o envio do formulário não cria vínculo de nenhuma natureza.
- Etapas (`<ol>`; número + H3 + texto):
  1. **01 · Inscrição** — Envio do formulário com dados profissionais e áreas de atuação.
  2. **02 · Validação profissional** — Conferência da inscrição e da situação na OAB, em consulta pública ao Cadastro Nacional dos Advogados.
  3. **03 · Avaliação de compatibilidade técnica** — Leitura das áreas de atuação e da experiência informada à luz das frentes dos seis eixos.
  4. **04 · Reunião institucional** — Conversa com a equipe do Complexo DMC para apresentar o programa e esclarecer papéis, limites e deveres de cada parte.
  5. **05 · Definição de modelo de cooperação juridicamente permitido** — Escolha do modelo adequado ao caso, com autonomia técnica, sigilo e deveres éticos preservados.
  6. **06 · Formalização, quando cabível** — Registro por escrito do modelo definido. Sem formalização, não há cooperação.
- Nota: Não há prazo pré-definido para as etapas. O retorno é feito pelo e-mail profissional informado.

### 2.7 `#candidatura` — formulário
- Overline: **Candidatura**
- H2: Solicitar participação *no programa*
- Texto de apoio: Preencha com dados profissionais. As informações servem apenas para avaliar a sua candidatura ao Partner Lawyers. Campos com * são obrigatórios.
- Aviso em destaque (antes dos campos): **Não inclua dados de clientes, casos ou documentos.**

| Campo (`name`) | Tipo | Obrig. | Rótulo | Texto de ajuda | Erro |
|---|---|---|---|---|---|
| `nome` | text, `autocomplete="name"` | sim | Nome completo | Como consta na inscrição da OAB. | Informe o seu nome completo. |
| `oab_numero` | text, `inputmode="numeric"`, máx. 12 | sim | Número de inscrição na OAB | Como aparece na carteira profissional. | Informe o número de inscrição na OAB. |
| `oab_seccional` | select (27 UFs: AC, AL, AP, AM, BA, CE, DF, ES, GO, MA, MT, MS, MG, PA, PB, PR, PE, PI, RJ, RN, RS, RO, RR, SC, SP, SE, TO) | sim | Seccional | Seccional da inscrição principal. | Selecione a seccional. |
| `sociedade` | text | não | Escritório ou sociedade de advocacia | Se houver. Deixe em branco se atua de forma individual. | — |
| `areas[]` | checkbox (fieldset; legenda "Áreas de atuação") | sim, ≥1 | Opções: Empresarial · Sucessões e patrimônio · Imobiliário · Tributário · Trabalhista empresarial · Recuperação de ativos · Outra | Marque uma ou mais. | Marque ao menos uma área de atuação. |
| `areas_outra` | text (aparece com "Outra") | não | Qual? | Descreva em poucas palavras. | — |
| `cidade_uf` | text | sim | Cidade e UF | Base principal de atuação. Ex.: Campinas/SP. | Informe cidade e UF. |
| `email` | email, `autocomplete="email"` | sim | E-mail profissional | Usado para o retorno sobre a candidatura. | Informe um e-mail válido. |
| `telefone` | tel, `autocomplete="tel"` | sim | Telefone ou WhatsApp | Com DDD. | Informe um telefone com DDD. |
| `apresentacao` | textarea, máx. 1.500 | sim | Apresentação profissional | Formação, tempo de atuação e tipos de demanda em que atua. Não inclua dados de clientes, casos ou documentos. | Escreva uma breve apresentação profissional. |

- Campo-armadilha (honeypot) oculto, sem rótulo visível — critério do frontend.
- **Consentimento** (`consentimento`, obrigatório, desmarcado):
  Li a [Política de Privacidade](../../pages/politica-de-privacidade.html) e peço a avaliação da minha candidatura ao programa DMC | Partner Lawyers. Os dados deste formulário serão usados só para essa avaliação (LGPD, Lei 13.709/2018). _(Rótulo ajustado em 2026-10-17: a base legal é procedimento preliminar a pedido do titular — art. 7º, V — e não consentimento.)_
  Erro: Para enviar, confirme que leu a Política de Privacidade e pede a avaliação da candidatura.
- **Comunicações (opcional, separado, desmarcado)** (`comunicacoes`):
  Aceito receber comunicações institucionais do Complexo DMC por e-mail. Posso cancelar a qualquer momento.
- Botão: **Enviar candidatura — Partner Lawyers**
- Linha sob o botão: O envio não cria vínculo nem garante participação no programa.
- Mensagens (região `aria-live="polite"`):
  - Enviando: Enviando candidatura…
  - **Sucesso:** Candidatura recebida. Protocolo **{PROTOCOLO}**. Guarde este número: ele identifica a sua candidatura em qualquer contato com a equipe. O retorno é feito pelo e-mail informado.
  - **Duplicidade:** Já recebemos sua candidatura ao Partner Lawyers com estes dados (protocolo **{PROTOCOLO}**). Ela segue em avaliação; não é preciso reenviar. Para atualizar alguma informação, escreva para administrativo@complexodmc.com.br informando o protocolo.
    Variante sem protocolo: Já recebemos sua candidatura ao Partner Lawyers com estes dados. Ela segue em avaliação; não é preciso reenviar. Para atualizar alguma informação, escreva para administrativo@complexodmc.com.br.
  - **Erro de servidor:** Não foi possível concluir o envio agora. Tente novamente em instantes ou escreva para administrativo@complexodmc.com.br.
  - **Excesso de tentativas (429):** Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.
  - Erro de validação (topo): Revise os campos destacados para enviar.

### 2.8 `#perguntas` — FAQ (6)
1. **O programa prevê remuneração?**
   Não há remuneração por indicação. Quando houver cooperação, ela segue um modelo juridicamente permitido, definido caso a caso e formalizado por escrito.
2. **Preciso ter escritório ou sociedade de advocacia?**
   Não. Advogados que atuam de forma individual podem se candidatar, assim como sociedades de advocacia. O requisito é a inscrição regular na OAB.
3. **Como fica o sigilo profissional?**
   O sigilo é dever do advogado e é preservado em qualquer forma de cooperação. Por isso, o formulário não deve conter dados de clientes, casos ou documentos, e a troca técnica do programa não envolve informações de clientes.
4. **Participar do programa garante trabalho?**
   Não. A participação não garante demanda nem volume de trabalho. Cada cooperação depende do caso, da compatibilidade técnica e da formalização.
5. **Quem decide sobre a participação?**
   A equipe do Complexo DMC, ao longo das etapas de avaliação. Não há aprovação automática.
6. **Qual é o prazo da avaliação?**
   Não há prazo pré-definido. Cada candidatura é analisada individualmente, e o retorno é feito pelo e-mail profissional informado.

### 2.9 `#video`
- Overline: **Em vídeo** · H2: Partner Lawyers *em vídeo*
- Descrição: Como funciona a cooperação técnica e institucional com advogados parceiros.
- `data-video-title`: `DMC | Partner Lawyers`
- Quadro vazio: "Espaço reservado para o vídeo" · "Vídeo sobre o programa Partner Lawyers — em breve neste espaço."

### 2.10 `#conversa` — CTA final (papel)
- Overline: **Candidatura**
- H2: Cooperação técnica, *com critério*
- Texto: Envie a sua candidatura ou tire dúvidas sobre o programa com a nossa equipe.
- Botão primário: **Solicitar participação no programa** → `#candidatura`
- Botão secundário: **Falar com a equipe** → `WA_PL`
- Link: **Central de Parcerias** → `../`

### 2.11 Rodapé legal (curto)
Conteúdo informativo. DMC | Partner Lawyers é um programa de cooperação técnica e institucional do Complexo DMC; não é pessoa jurídica própria nem sociedade de advogados, e não é vinculado à Ordem dos Advogados do Brasil. Não há captação de causas nem remuneração por indicação. A atuação em atos privativos da advocacia, da contabilidade e da auditoria é realizada por profissionais e sociedades parceiras habilitadas; os atos notariais e registrais, por cartórios conveniados.

---

## 3. BUSINESS PARTNER — `/parcerias/business-partner/`

**`<title>`** (55): `Business Partner — Parcerias de Negócios | Complexo DMC`
**meta description** (149): `Programa de cooperação comercial do Complexo DMC para quem identifica oportunidades de consultoria em negócios na própria rede de relacionamento B2B.`
**og:title:** `DMC | Business Partner — relacionamento empresarial com método`
**og:description:** `Para consultores, representantes B2B e redes empresariais que identificam oportunidades de consultoria em negócios compatíveis com os seis eixos do Complexo DMC.`
**Breadcrumb:** Início › Parcerias › Business Partner

### 3.1 `#hero`
- Selo: **DMC | BUSINESS PARTNER**
- **H1:** Conecte oportunidades empresariais a *uma estrutura de inteligência estratégica.*
- Sub: Desenvolva relacionamentos de negócios e conheça uma proposta de cooperação com o ecossistema Complexo DMC.
- CTA primário: **Quero ser Business Partner** → `#candidatura`
- CTA secundário (link): **Como funciona** → `#como-funciona`

### 3.2 `#programa` — o que é
- Overline: **O programa**
- H2: Relacionamento empresarial *com método*
- Texto:
  - O Business Partner é o programa de cooperação comercial do Complexo DMC para profissionais e organizações que, na própria rede, identificam empresas e famílias empresárias com demandas de consultoria em negócios.
  - O parceiro apresenta a oportunidade. A análise, o diagnóstico e a condução ficam com a equipe do Complexo DMC, nos seis eixos de especialidade.
  - As condições de cada parceria são apresentadas em reunião e formalizadas em contrato.
- Bloco de exclusão (H3 **Fora do programa**): Atividades de captação de clientela para serviços jurídicos não fazem parte do Business Partner. O parceiro não indica advogados, não apresenta causas e não oferece serviços jurídicos.

### 3.3 `#perfil` — perfil do parceiro
- Overline: **Perfil**
- H2: Para quem *é o programa*
- Itens (H3 + linha):
  1. **Consultores empresariais** — Atuação em gestão, estratégia ou finanças de empresas.
  2. **Desenvolvimento de negócios** — Profissionais de expansão comercial e novos negócios.
  3. **Representantes comerciais B2B** — Relacionamento contínuo com carteiras de empresas.
  4. **Relacionamento corporativo** — Gestão de contas, relações institucionais e atendimento a grupos econômicos.
  5. **Consultores imobiliários** — Contato com incorporadoras, construtoras e investidores do setor.
  6. **Redes empresariais** — Associações, grupos e comunidades de empresários.
  7. **Organizações com atuação comercial complementar** — Empresas cujos serviços se somam aos eixos do Complexo DMC.

### 3.4 `#oportunidades` — oportunidades de cooperação
- Overline: **Oportunidades**
- H2: Onde a sua rede *encontra os seis eixos*
- Descrição: Exemplos de perfil de empresa e o eixo de consultoria relacionado. Cada oportunidade é analisada pela equipe do Complexo DMC antes de qualquer proposta.
- Itens (perfil → eixo; texto), com link para a página do eixo:
  1. **Famílias empresárias, sócios e produtores rurais → E1 Planejamento Patrimonial e Sucessório** — Organização da estrutura patrimonial e da sucessão em vida. → `../../pages/planejamento-sucessorio.html`
  2. **Empresas em crescimento ou mudança de estrutura societária → E2 Tributário, Fiscal e Corporativo** — Revisão de regime, estrutura societária e programa de integridade. → `../../pages/planejamento-tributario.html`
  3. **Incorporadoras, construtoras e investidores imobiliários → E3 Notarial e Imobiliário** — Viabilidade, due diligence de terreno e acompanhamento do ciclo do empreendimento. → `../../pages/consultoria-imobiliaria.html`
  4. **Empresas que prestam contas a sócios, conselho ou banco → E4 Auditoria Empresarial e Contábil** — Leitura independente dos números, controles internos e governança. → `../../pages/contabilidade.html`
  5. **Empresas com operação intensiva em mão de obra → E6 Consultoria Trabalhista** — Diagnóstico trabalhista, conformidade psicossocial (NR-1) e gestão preventiva. → `../../solucoes/consultoria-trabalhista/ciclo-fechado.html`
- Nota: O parceiro apresenta a oportunidade de consultoria. Causas, processos e demandas por serviço jurídico não fazem parte do programa.
- **Decisão (2026-10-17, orquestração):** o item "Empresas em reestruturação → E5" saiu da
  lista. E5 se executa sobretudo por via judicial e é o ponto mais próximo de captação de
  causas (`CONFORMIDADE.md` §4, D5). Volta só com revisão jurídica e decisão do CEO.

### 3.5 `#como-funciona` — etapas
- Overline: **Como funciona**
- H2: Do cadastro à *cooperação autorizada*
- Descrição: Sete etapas, cada uma com decisão própria. O cadastro não cria vínculo nem autoriza atuação em nome do Complexo DMC.
- Etapas (`<ol>`):
  1. **01 · Cadastro** — Envio do formulário com o seu perfil e o perfil das empresas com que se relaciona.
  2. **02 · Análise do perfil** — Leitura da experiência informada e da aderência da sua rede ao público dos seis eixos.
  3. **03 · Reunião comercial** — Apresentação do programa, dos papéis de cada parte e das condições da parceria.
  4. **04 · Avaliação de compatibilidade** — Decisão sobre a continuidade, considerando perfil, rede e forma de atuação.
  5. **05 · Definição das condições da parceria** — Condições e limites de atuação do parceiro definidos e registrados.
  6. **06 · Formalização contratual, quando aplicável** — Assinatura do contrato de parceria.
  7. **07 · Início da cooperação autorizada** — A partir da formalização, o parceiro apresenta oportunidades nos limites do contrato.

### 3.6 `#estrutura` — diferenciais
- Overline: **Estrutura**
- H2: O que sustenta *a parceria*
- Itens:
  1. **Seis eixos, uma consultoria** — Patrimônio, tributos, imóveis, auditoria, crédito e relações de trabalho tratados por uma mesma consultoria, com plano único quando o caso envolve mais de um eixo.
  2. **Método comum** — Diagnóstico, cenários e plano de atos seguem o mesmo método nos seis eixos.
  3. **Papéis definidos** — Atos privativos executados por profissionais e sociedades parceiras habilitadas; atos notariais e registrais, por cartórios conveniados.
  4. **Tecnologia própria** — ADTECH e DMC Business School no portal digital DMC. Link: **Conhecer o portal digital** → `../../pages/tecnologia.html#portal`
  5. **Alcance** — Sede em São Paulo e atendimento em todo o Brasil e no exterior.

### 3.7 `#candidatura` — formulário
- Overline: **Candidatura**
- H2: Quero ser *Business Partner*
- Texto de apoio: Conte quem você é e com que perfil de empresa se relaciona. Os dados servem apenas para avaliar a sua candidatura ao Business Partner. Campos com * são obrigatórios.
- Aviso em destaque: **Não inclua nomes de empresas, clientes ou pessoas da sua rede.**

| Campo (`name`) | Tipo | Obrig. | Rótulo | Texto de ajuda | Erro |
|---|---|---|---|---|---|
| `nome` | text, `autocomplete="name"` | sim | Nome completo | — | Informe o seu nome completo. |
| `empresa` | text, `autocomplete="organization"` | não | Empresa | Se houver. Deixe em branco se atua como profissional autônomo. | — |
| `cargo` | text, `autocomplete="organization-title"` | sim | Cargo ou ocupação | Ex.: consultor empresarial, gerente de contas. | Informe o seu cargo ou ocupação. |
| `segmento` | select | sim | Segmento de atuação | Opções: Selecione… · Consultoria empresarial · Desenvolvimento de negócios · Representação comercial B2B · Mercado imobiliário · Construção civil · Agronegócio · Rede empresarial · Outro | Selecione o segmento de atuação. |
| `segmento_outro` | text (aparece com "Outro") | não | Qual? | Descreva em poucas palavras. | — |
| `cidade_uf` | text | sim | Cidade e UF | Base principal de atuação. Ex.: Ribeirão Preto/SP. | Informe cidade e UF. |
| `email` | email, `autocomplete="email"` | sim | E-mail | Usado para o retorno sobre a candidatura. | Informe um e-mail válido. |
| `whatsapp` | tel, `autocomplete="tel"` | sim | WhatsApp | Com DDD. | Informe um WhatsApp com DDD. |
| `experiencia_b2b` | select | sim | Experiência em relacionamento B2B | Opções: Selecione… · Até 2 anos · De 2 a 5 anos · De 5 a 10 anos · Mais de 10 anos | Selecione o tempo de experiência. |
| `perfil_empresas` | textarea, máx. 800 | sim | Perfil das empresas com as quais se relaciona | Setores e porte, sem nomes de empresas ou pessoas. Ex.: indústrias de médio porte; incorporadoras. | Descreva o perfil das empresas da sua rede. |
| `mensagem` | textarea, máx. 1.000 | não | Mensagem | Opcional. Algo mais sobre a sua atuação. | — |

- Honeypot oculto — critério do frontend.
- **Consentimento** (`consentimento`, obrigatório, desmarcado):
  Li a [Política de Privacidade](../../pages/politica-de-privacidade.html) e peço a avaliação da minha candidatura ao programa DMC | Business Partner. Os dados deste formulário serão usados só para essa avaliação (LGPD, Lei 13.709/2018). _(Rótulo ajustado em 2026-10-17: a base legal é procedimento preliminar a pedido do titular — art. 7º, V — e não consentimento.)_
  Erro: Para enviar, confirme que leu a Política de Privacidade e pede a avaliação da candidatura.
- **Comunicações (opcional, separado, desmarcado)** (`comunicacoes`):
  Aceito receber comunicações institucionais do Complexo DMC por e-mail. Posso cancelar a qualquer momento.
- Botão: **Enviar candidatura — Business Partner**
- Linha sob o botão: O envio não cria vínculo nem autoriza atuação em nome do Complexo DMC.
- Mensagens (`aria-live="polite"`):
  - Enviando: Enviando candidatura…
  - **Sucesso:** Candidatura recebida. Protocolo **{PROTOCOLO}**. Guarde este número: ele identifica a sua candidatura em qualquer contato com a equipe. O retorno é feito pelo e-mail informado.
  - **Duplicidade:** Já recebemos sua candidatura ao Business Partner com estes dados (protocolo **{PROTOCOLO}**). Ela segue em análise; não é preciso reenviar. Para atualizar alguma informação, escreva para administrativo@complexodmc.com.br informando o protocolo.
    Variante sem protocolo: Já recebemos sua candidatura ao Business Partner com estes dados. Ela segue em análise; não é preciso reenviar. Para atualizar alguma informação, escreva para administrativo@complexodmc.com.br.
  - **Erro de servidor:** Não foi possível concluir o envio agora. Tente novamente em instantes ou escreva para administrativo@complexodmc.com.br.
  - **Excesso de tentativas (429):** Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.
  - Erro de validação (topo): Revise os campos destacados para enviar.

### 3.8 `#perguntas` — FAQ (6)
1. **Como são definidas as condições da parceria?**
   As condições são apresentadas na reunião e formalizadas em contrato; não divulgamos valores nem percentuais nesta página.
2. **Advogados podem participar?**
   Advogados e sociedades de advocacia participam pelo programa DMC | Partner Lawyers, voltado à cooperação técnica e institucional. O Business Partner é um programa comercial de consultoria em negócios e não envolve indicação de clientela jurídica.
   (link "DMC | Partner Lawyers" → `../advogados-parceiros/`)
3. **Que tipo de oportunidade posso apresentar?**
   Demandas de consultoria em negócios ligadas aos seis eixos — como organização patrimonial e sucessória, revisão tributária, viabilidade imobiliária, auditoria e conformidade trabalhista. Causas, processos e demandas por serviço jurídico não fazem parte do programa.
4. **A participação garante algum resultado?**
   Não. O programa não promete ganho, volume de oportunidades nem resultado. A contratação de cada consultoria depende da análise da equipe e da decisão da empresa atendida.
5. **Como ficam as informações das empresas que apresento?**
   Apresente uma oportunidade só com a autorização da empresa interessada. Dados de terceiros não devem ser enviados no formulário de cadastro; o tratamento das informações de cada oportunidade é definido na formalização da parceria, nos termos da LGPD.
6. **Quanto tempo leva a análise?**
   Não há prazo pré-definido. Cada cadastro é analisado individualmente, e o retorno é feito pelo e-mail informado.

### 3.9 `#video`
- Overline: **Em vídeo** · H2: Business Partner *em vídeo*
- Descrição: Como funciona a cooperação comercial com o ecossistema Complexo DMC.
- `data-video-title`: `DMC | Business Partner`
- Quadro vazio: "Espaço reservado para o vídeo" · "Vídeo sobre o programa Business Partner — em breve neste espaço."

### 3.10 `#conversa` — CTA final (papel)
- Overline: **Candidatura**
- H2: Relacionamentos de negócios, *com estrutura*
- Texto: Envie a sua candidatura ou converse com a nossa equipe sobre o programa.
- Botão primário: **Quero ser Business Partner** → `#candidatura`
- Botão secundário: **Converse com nossa equipe** → `WA_BP`
- Link: **Central de Parcerias** → `../`

### 3.11 Rodapé legal (curto)
Conteúdo informativo. DMC | Business Partner é um programa de cooperação comercial do Complexo DMC, voltado a oportunidades de consultoria em negócios; não é pessoa jurídica própria e não abrange captação de clientela para serviços jurídicos. As condições de cada parceria constam de contrato próprio. A atuação em atos privativos da advocacia, da contabilidade e da auditoria é realizada por profissionais e sociedades parceiras habilitadas; os atos notariais e registrais, por cartórios conveniados.

---

## 4. Itens que dependem de outras frentes (não são copy)
- **Backend dos formulários:** gerar `{PROTOCOLO}`, detectar duplicidade (sugestão:
  e-mail + programa; no Partner Lawyers também número + seccional da OAB), devolver 429 com
  o limite por IP já usado no contato, registrar origem/data/hora do consentimento e do
  opt-in **separadamente**.
- **Política de Privacidade:** hoje a finalidade cobre só contato e treinamentos — precisa
  incluir "avaliação de candidatura a programas de parceria" antes de publicar
  (`CONFORMIDADE.md` §3).
- **Navegação:** link "Parcerias" no rodapé/menu, `sitemap.xml` com as três URLs e
  previsão das rotas em `navbar.js` — frontend.
