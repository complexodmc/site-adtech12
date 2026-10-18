# Kit de campanha — DMC | PARTNER LAWYERS

Data: 2026-10-17 · Autor: growth · Fontes: `../COPY.md` §2 (texto aprovado), `../CONFORMIDADE.md`,
`../../BRIEF.md`, `../../DECISIONS.md` (D7, D8, D9).

**Status geral: PROPOSTO.** Nada aqui é publicado, agendado, impulsionado, segmentado ou
disparado. Toda peça depende de **revisão ética por advogado responsável** (EAOAB, Código de
Ética e Disciplina, Provimento CFOAB 205/2021) e de **aprovação do CEO** (conteúdo, público,
orçamento). Itens marcados **PENDENTE** dependem também de dado, produção ou decisão listados.

---

## 0. Antes de qualquer publicação (bloqueios)

| # | Bloqueio | Origem | Status |
|---|---|---|---|
| G1 | Página `/parcerias/advogados-parceiros/` publicada com o texto de `COPY.md` §2 | frontend | PENDENTE |
| G2 | Política de Privacidade com a finalidade "avaliação de candidatura a programas de parceria" e "comunicações a quem autorizar"; encarregado e retenção definidos | `CONFORMIDADE.md` §3, itens 1–2 | PENDENTE (bloqueante) |
| G3 | Parecer sobre a licitude da divulgação do programa (EAOAB art. 1º, § 3º; CED art. 40 [VERIFICAR]; Prov. 205) e sobre o modelo de cooperação | `CONFORMIDADE.md` §5, itens 1–2 | PENDENTE (bloqueante) |
| G4 | Decisão do CEO sobre o H1 "Excelência profissional…" (D2) | `CONFORMIDADE.md` §4 | PENDENTE |
| G5 | Aprovação do CEO deste kit, peça a peça | D4 | PENDENTE |

Mídia paga para este programa **não é proposta** nos primeiros 30 dias: depende de G3 e do
Anexo Único do Provimento 205 (impulsionamento), além de orçamento do CEO.

---

## 1. Mensagem, tom e limites

**Conceito-mãe (CEO):** "Competências que se conectam. *Conhecimento que se amplia.*"
**Tom:** institucional, informativo, discreto, profissional. Fala com advogados como pares
técnicos; nunca como fornecedor de clientela.

**Mensagens que podem circular (todas de `COPY.md` §2):**
1. O Complexo DMC é uma consultoria em negócios, com seis eixos de especialidade.
2. A consultoria não pratica atos privativos da advocacia: eles cabem a advogados e sociedades
   de advocacia habilitados.
3. Três princípios: autonomia técnica, sigilo profissional, sem captação.
4. Avaliação individual em seis etapas; sem aprovação automática; sem prazo pré-definido.
5. A participação não garante demanda nem volume de trabalho.
6. Sede em São Paulo, atendimento em todo o Brasil e no exterior (D9).

**CTAs aprovados:** "Solicitar participação no programa" · "Como ocorre a avaliação" ·
"Falar com a equipe" (WhatsApp `WA_PL`) · "Conheça o programa".

**Nunca usar neste programa** (palavra, ideia ou imagem):
- captação, clientes ou causas como oferta; "receba casos", "demanda", "volume", "carteira";
  "oportunidades de negócio" (o conceito de "oportunidades" é do Business Partner, não daqui);
- remuneração, honorários, comissão, percentual, repasse, "parceria remunerada";
- "credenciado", "credenciamento", "homologado", "rede de advogados", "selo", "certificado";
- OAB como chancela ("aprovado/reconhecido pela OAB"); brasão, balança, martelo, toga,
  colunas/templo — inclusive `assets/images/BALANCA.png`, `MARTELO.png`, `TEMPLO.png`;
- superlativos e comparações ("o melhor", "líder", "referência", "excelência" — ver G4);
- números institucionais (D7), depoimentos, cases, nomes de parceiros, prêmios, selos;
- urgência ("vagas limitadas", "últimos dias", "inscrições até");
- marcar ou citar advogados, escritórios ou parceiros; pedir repost a advogados (a marca DMC
  não entra na publicidade deles — `CONFORMIDADE.md` §5, item 2).

**Rodapé legal mínimo em toda peça:** "Sem captação de causas nem remuneração por indicação.
Não vinculado à OAB." (versão longa em `COPY.md` §2.11).

---

## 2. Links e UTMs (padrão)

Base: `https://www.complexodmc.com.br/parcerias/advogados-parceiros/`
Valores só com `[A-Za-z0-9._-]`, minúsculas, sem dado pessoal (nunca nome, e-mail, protocolo).

| Parâmetro | Valores |
|---|---|
| `utm_source` | `linkedin` · `instagram` · `youtube` · `email` · `whatsapp` · `apresentacao` |
| `utm_medium` | `social-organico` · `video-organico` · `email-relacionamento` · `pdf` |
| `utm_campaign` | `pl-lancamento-2026` |
| `utm_content` | id da peça: `pl-p1-manifesto`, `pl-p2-carrossel`, `pl-p3-carrossel`, `pl-p4-perfil`, `pl-v1`, `pl-v2`, `pl-li-01`…, `pl-ig-bio`, `pl-seq-<etapa>` |

Exemplo (LI-01):
`https://www.complexodmc.com.br/parcerias/advogados-parceiros/?utm_source=linkedin&utm_medium=social-organico&utm_campaign=pl-lancamento-2026&utm_content=pl-li-01`

Nas imagens, só o endereço curto `complexodmc.com.br/parcerias/advogados-parceiros` (sem UTM).
No Instagram o link vai na bio, com `utm_content=pl-ig-bio`.

---

## 3. Conceitos visuais (3)

Base comum: preto `#0b0c0e`, grafite `#121416`/`#1a1c1f`, papel `#f5f3ef`; acento
**champanhe** `rgb(227,207,166)` no escuro e `#6f5a33` no papel (contraste AA); títulos em
Newsreader 300 com itálico na ênfase; texto em Hanken Grotesk; lockup
**DMC | PARTNER LAWYERS** com a marca `rino-marca.webp` (branca no escuro, preta no papel).
Geometria procedural em SVG (`tools/media/parcerias/campanhas/geo.js`), sem imagem de terceiros.

| # | Nome | Ideia | Direção de arte | Onde se aplica |
|---|---|---|---|---|
| C1 | **Fios de competência** | "Competências que se conectam": profissionais distintos ligados por fios finos, sem centro dominante | Constelação de nós champanhe ligados aos vizinhos mais próximos, fio de 1px a 26% de opacidade, poucos nós com anel; ocupa a faixa superior e some antes do texto | P1 (manifesto e versão LinkedIn), P4, slides 1/3/6/8, abertura do vídeo V1 |
| C2 | **Margem editorial** | Conhecimento técnico como texto de referência: papel, numeração e respiro | Fundo papel, colunas finíssimas como grade de página, numeral grande em Newsreader champanhe-escuro, listas com fio de 1px; cacho pequeno de nós no canto | P2 (carrossel "cada um no seu papel"), slides 2 e 5 |
| C3 | **Anéis que se ampliam** | "Conhecimento que se amplia": círculos concêntricos que crescem a partir de um ponto, com seis nós (seis eixos) | Anéis de 1px com opacidade decrescente; seis nós num anel que avança a cada lâmina (03→05), sugerindo progresso nas etapas | P3 (carrossel "como ocorre a avaliação"), slides 4 e 7, vídeo V2 |

Fotografia: se as imagens originais `pl-painel.webp` / `pl-hero.webp` existirem em
`complexodmc.com.br/assets/images/parcerias/`, o render as usa como fundo sob véu escuro
(`data-bg`); na renderização de 2026-10-17 elas **não existiam** e as peças saíram só com
tipografia e geometria. Sem pessoas, mãos com contrato, aperto de mãos ou cenas de tribunal.

---

## 4. Peças (4) — texto final e direção de arte

Formato 1080×1350 (4:5, feed LinkedIn/Instagram). Arquivos em `pecas/`. Template:
`tools/media/parcerias/campanhas/pecas-pl.html` · render: `node tools/media/parcerias/campanhas/render.mjs`.
Toda lâmina tem rodapé "Proposta — sujeita a revisão" (sai na versão aprovada) e a linha legal.

### P1 — Manifesto (estático) · C1 · PROPOSTO
Arquivos: `pecas/pl-p1-manifesto.png` (1080×1350) e `pecas/pl-p1-manifesto-linkedin-1200x627.png`.
- Selo: DMC | PARTNER LAWYERS
- Overline: COOPERAÇÃO TÉCNICA E INSTITUCIONAL
- Título: Competências que se conectam. *Conhecimento que se amplia.*
- Texto: Um ambiente de cooperação técnica e institucional para profissionais que atuam em demandas empresariais e patrimoniais complexas.
- Nota: Para advogados e sociedades de advocacia regularmente inscritos na OAB.
- CTA: Solicitar participação no programa · complexodmc.com.br/parcerias/advogados-parceiros
- Legal: Programa do Complexo DMC, consultoria em negócios. Sem captação de causas nem remuneração por indicação. Não vinculado à OAB.
- Versão 1200×627: mesmo título; texto "Cooperação técnica e institucional para advogados e sociedades de advocacia que atuam em demandas empresariais e patrimoniais complexas."; constelação à direita.

### P2 — Carrossel "Cada um no seu papel" (5 lâminas) · C2 · PROPOSTO
Arquivos: `pecas/pl-p2-carrossel-01.png` … `-05.png`.
1. Overline O PROGRAMA · Título: Cooperação técnica, *cada um no seu papel.* · Texto: Como o Complexo DMC organiza a cooperação com advogados e sociedades de advocacia. · "Deslize →"
2. Numeral 01 · Título: A consultoria *organiza a decisão.* · Texto: O Complexo DMC é uma consultoria em negócios. Organiza o diagnóstico, os cenários e a condução de decisões que envolvem empresa, patrimônio e família, em seis eixos de especialidade.
3. Numeral 02 · Título: O advogado conduz *o trabalho jurídico.* · Texto: Parte dessas decisões exige atos privativos da advocacia — contratos, pareceres, petições e defesas. A consultoria não pratica esses atos: eles cabem a advogados e sociedades de advocacia habilitados.
4. Numeral 03 · Título: Três *princípios.* · I Autonomia técnica — O advogado conduz o trabalho jurídico com independência e responde por ele. · II Sigilo profissional — O sigilo do advogado é preservado em qualquer forma de cooperação. · III Sem captação — O programa não envolve captação de causas nem remuneração por indicação.
5. Overline FORA DO PROGRAMA · Título: O que *não faz parte.* · Captação ou indicação de causas. · Remuneração por indicação. · Interferência na autonomia técnica do advogado. · Acesso a dados de clientes fora de um trabalho formalizado. · CTA: Conheça o programa.

### P3 — Carrossel "Como ocorre a avaliação" (5 lâminas) · C3 · PROPOSTO
Arquivos: `pecas/pl-p3-carrossel-01.png` … `-05.png`.
1. Overline AVALIAÇÃO · Título: Como ocorre *a avaliação.* · Texto: Cada candidatura é avaliada individualmente. Não há aprovação automática, e o envio do formulário não cria vínculo de nenhuma natureza. · "Seis etapas · Deslize →"
2. 01 Inscrição — Envio do formulário com dados profissionais e áreas de atuação. · 02 Validação profissional — Conferência da inscrição e da situação na OAB, em consulta pública ao Cadastro Nacional dos Advogados.
3. 03 Avaliação de compatibilidade técnica — Leitura das áreas de atuação e da experiência informada à luz das frentes dos seis eixos. · 04 Reunião institucional — Conversa com a equipe do Complexo DMC para apresentar o programa e esclarecer papéis, limites e deveres de cada parte.
4. 05 Definição de modelo de cooperação juridicamente permitido — Escolha do modelo adequado ao caso, com autonomia técnica, sigilo e deveres éticos preservados. · 06 Formalização, quando cabível — Registro por escrito do modelo definido. Sem formalização, não há cooperação.
5. Overline CANDIDATURA · Título: Cooperação técnica, *com critério.* · Texto: Não há prazo pré-definido para as etapas. O retorno é feito pelo e-mail profissional informado. · Destaque: No formulário, **não inclua dados de clientes, casos ou documentos.** · CTA: Solicitar participação no programa.

### P4 — "Para quem é o programa" (estático) · C1 · PROPOSTO
Arquivo: `pecas/pl-p4-perfil.png`.
- Overline PERFIL · Título: Para quem *é o programa.*
- Lista (7): Advogados empresariais — Societário, contratos e operações entre empresas. · Sucessões e patrimônio — Inventário, testamento, holding e planejamento sucessório. · Direito imobiliário — Incorporação, registro, regularização e contratos imobiliários. · Tributaristas — Consultivo e contencioso tributário, administrativo e judicial. · Trabalhista empresarial — Atuação consultiva e contenciosa do lado da empresa. · Recuperação de ativos — Execução, cumprimento de sentença e medidas sobre bens. · Sociedades de advocacia — Sociedades registradas na OAB, inclusive unipessoais.
- Nota: A participação no programa não garante demanda nem volume de trabalho.

**Texto alternativo (para acessibilidade, ao publicar):** repetir o título e o texto da lâmina,
sem descrever a geometria. Ex. P1: "DMC | Partner Lawyers. Competências que se conectam.
Conhecimento que se amplia. Cooperação técnica e institucional para advogados e sociedades de
advocacia regularmente inscritos na OAB."

---

## 5. Roteiros de vídeo institucional (2) — PENDENTE de produção

Produção prevista com cena procedural (Canvas/SVG dos conceitos C1/C3) + ffmpeg (BRIEF: sem
gerador de vídeo por IA). Sem atores, sem depoimentos, sem cenas de tribunal. Locução neutra,
ritmo de ~2,3 palavras/s. Legenda embutida e arquivo `.srt`. Versões 16:9 (YouTube, site
`#video`), 1:1 e 4:5 (LinkedIn), 9:16 (Reels). Trilha sem letra, licenciada (PENDENTE: fonte da trilha).

### V1 — "Competências que se conectam" · 45 s
| Tempo | Imagem | Texto em tela | Locução |
|---|---|---|---|
| 0–4 s | Preto; um ponto champanhe acende | DMC \| PARTNER LAWYERS | — (trilha) |
| 4–11 s | O ponto se liga a outros por fios finos (C1) | Competências que se conectam. | Decisões que envolvem empresa, patrimônio e família pedem mais de uma competência. |
| 11–18 s | Seis nós se destacam; nomes dos eixos surgem discretos | Seis eixos de especialidade | O Complexo DMC é uma consultoria em negócios, organizada em seis eixos de especialidade. |
| 18–27 s | Duas colunas em papel (C2) | A consultoria organiza a decisão. / O advogado conduz o trabalho jurídico. | Quando a decisão exige atos privativos da advocacia, eles cabem a advogados e sociedades de advocacia habilitados. |
| 27–35 s | Anéis se ampliam (C3); três palavras surgem nos anéis | Conhecimento que se amplia. · Autonomia técnica · Sigilo profissional · Sem captação | O Partner Lawyers organiza essa cooperação técnica, com autonomia, sigilo e sem captação de causas. |
| 35–41 s | Lockup + endereço | Solicitar participação no programa · complexodmc.com.br/parcerias/advogados-parceiros | Para advogados e sociedades de advocacia regularmente inscritos na OAB. |
| 41–45 s | Cartela legal, fundo preto | Programa de cooperação técnica e institucional do Complexo DMC. Sem captação de causas nem remuneração por indicação. Não vinculado à OAB. A participação não garante demanda nem volume de trabalho. | — |

### V2 — "Como ocorre a avaliação" · 45 s
| Tempo | Imagem | Texto em tela | Locução |
|---|---|---|---|
| 0–5 s | Anéis em repouso | Como ocorre a avaliação. | No Partner Lawyers, cada candidatura é avaliada individualmente. |
| 5–11 s | Nó 01 acende | 01 Inscrição · 02 Validação profissional | Primeiro, a inscrição. Depois, a validação profissional, em consulta pública ao Cadastro Nacional dos Advogados. |
| 11–18 s | Nós 03 e 04 | 03 Compatibilidade técnica · 04 Reunião institucional | Em seguida, a leitura de compatibilidade técnica e uma reunião para esclarecer papéis, limites e deveres. |
| 18–26 s | Nós 05 e 06; o anel se fecha | 05 Modelo juridicamente permitido · 06 Formalização, quando cabível | Por fim, a definição de um modelo juridicamente permitido e, quando cabível, a formalização por escrito. |
| 26–34 s | Texto sobre preto | Sem aprovação automática. Sem prazo pré-definido. O envio não cria vínculo. | Não há aprovação automática, e o envio do formulário não cria vínculo de nenhuma natureza. |
| 34–40 s | Lockup + endereço | Não inclua dados de clientes no formulário. · complexodmc.com.br/parcerias/advogados-parceiros | Conheça o programa e envie a sua candidatura. |
| 40–45 s | Cartela legal (igual à V1) | — | — |

---

## 6. Publicações

Canal: **página institucional do Complexo DMC** (LinkedIn e Instagram). Nada em perfis pessoais
de advogados; sem marcar pessoas, escritórios ou a OAB; sem mensagem direta a advogados.
Hashtags mínimas, sem `#OAB` nem `#advogado`.

### LinkedIn

**LI-01 — Lançamento (peça P1, 1200×627 ou 1080×1350)** · PROPOSTO
> Competências que se conectam. Conhecimento que se amplia.
>
> O Complexo DMC é uma consultoria em negócios. Organizamos o diagnóstico, os cenários e a condução de decisões que envolvem empresa, patrimônio e família, em seis eixos de especialidade.
>
> Parte dessas decisões exige atos privativos da advocacia. Esses atos não são praticados pela consultoria: cabem a advogados e sociedades de advocacia habilitados.
>
> O DMC | Partner Lawyers organiza essa cooperação técnica e institucional com três princípios:
> — Autonomia técnica: o advogado conduz o trabalho jurídico com independência e responde por ele.
> — Sigilo profissional: preservado em qualquer forma de cooperação.
> — Sem captação: o programa não envolve captação de causas nem remuneração por indicação.
>
> Para advogados e sociedades de advocacia regularmente inscritos na OAB. Cada candidatura é avaliada individualmente; não há aprovação automática.
>
> Conheça o programa: {URL com `utm_content=pl-li-01`}
>
> #ComplexoDMC #PartnerLawyers

**LI-02 — "Cada um no seu papel" (carrossel P2 em PDF)** · PROPOSTO
> Cooperação técnica, cada um no seu papel.
>
> Na consultoria, organizamos a decisão: diagnóstico, cenários e plano de atos, com cada ato atribuído a quem a lei habilita.
> Na advocacia, o advogado conduz o trabalho jurídico — contratos, pareceres, petições e defesas — com independência.
>
> É assim que o DMC | Partner Lawyers funciona. E também é por isso que algumas coisas não fazem parte do programa: captação ou indicação de causas, remuneração por indicação, interferência na autonomia técnica e acesso a dados de clientes fora de um trabalho formalizado.
>
> O programa completo: {URL com `utm_content=pl-li-02`}
>
> #ComplexoDMC #PartnerLawyers

**LI-03 — "Como ocorre a avaliação" (carrossel P3 em PDF)** · PROPOSTO
> Como ocorre a avaliação no DMC | Partner Lawyers.
>
> 01 Inscrição, com dados profissionais e áreas de atuação.
> 02 Validação profissional, em consulta pública ao Cadastro Nacional dos Advogados.
> 03 Avaliação de compatibilidade técnica com as frentes dos seis eixos.
> 04 Reunião institucional sobre papéis, limites e deveres.
> 05 Definição de um modelo de cooperação juridicamente permitido.
> 06 Formalização por escrito, quando cabível.
>
> Não há aprovação automática nem prazo pré-definido, e a participação não garante demanda nem volume de trabalho. No formulário, não inclua dados de clientes, casos ou documentos.
>
> {URL com `utm_content=pl-li-03`}
>
> #ComplexoDMC #PartnerLawyers

### Outras redes

**OR-01 — Instagram, carrossel P2 (legenda)** · PROPOSTO
> Cooperação técnica, cada um no seu papel.
>
> O Complexo DMC é uma consultoria em negócios. Quando uma decisão exige atos privativos da advocacia, eles cabem a advogados e sociedades de advocacia habilitados. O DMC | Partner Lawyers organiza essa cooperação com autonomia técnica, sigilo profissional e sem captação de causas.
>
> Para advogados e sociedades de advocacia regularmente inscritos na OAB. Saiba mais pelo link na bio.
>
> Programa não vinculado à OAB. Sem remuneração por indicação.
> #ComplexoDMC #PartnerLawyers

**OR-02 — YouTube (descrição do vídeo V1; serve também para Reels)** · PENDENTE (vídeo)
> DMC | Partner Lawyers — Competências que se conectam. Conhecimento que se amplia.
>
> Programa de cooperação técnica e institucional do Complexo DMC, consultoria em negócios com seis eixos de especialidade, com advogados e sociedades de advocacia regularmente inscritos na OAB. A consultoria não pratica atos privativos da advocacia; o advogado conduz o trabalho jurídico com autonomia técnica e sigilo profissional.
>
> Conheça o programa: {URL com `utm_source=youtube&utm_medium=video-organico&utm_content=pl-v1`}
>
> Conteúdo informativo. O programa não envolve captação de causas nem remuneração por indicação, não é pessoa jurídica própria nem sociedade de advogados e não é vinculado à Ordem dos Advogados do Brasil. A participação não garante demanda nem volume de trabalho.
> Comentários desativados ou moderados (ver abaixo).

**Moderação de comentários (todas as redes):** não responder perguntas sobre casos concretos;
resposta-padrão: "Este canal é informativo e não trata de casos concretos. Para conhecer o
programa, acesse a página do Partner Lawyers." Não responder com preço, prazo ou promessa;
não convidar para conversa privada sobre casos.

---

## 7. Apresentação institucional resumida (8 slides) · PROPOSTO

PDF 16:9: `apresentacao-partner-lawyers.pdf` (template `tools/media/parcerias/campanhas/apresentacao-pl.html`).
Uso: apoio à **reunião institucional** (etapa 04) ou envio individual a quem pediu; nunca em
disparo. Link interno do PDF, se houver: `utm_source=apresentacao&utm_medium=pdf`.

| # | Título | Conteúdo |
|---|---|---|
| 1 | Competências que se conectam. *Conhecimento que se amplia.* | DMC \| Partner Lawyers: programa de cooperação técnica e institucional com advogados e sociedades de advocacia regularmente inscritos na OAB. |
| 2 | Uma consultoria em negócios, *em seis eixos de especialidade.* | Os seis eixos; sede em São Paulo, atendimento em todo o Brasil e no exterior; quem pratica cada ato. |
| 3 | Cooperação técnica, *cada um no seu papel.* | A consultoria × o advogado; modelo compatível com o Estatuto e o Código de Ética. |
| 4 | O que sustenta *a cooperação.* | Autonomia técnica, sigilo profissional, sem captação; o que não faz parte. |
| 5 | Para quem *é o programa.* | Sete perfis + requisito: inscrição regular na OAB. |
| 6 | Possibilidades *de cooperação.* | Atuação técnica nos seis eixos, troca técnica, atuação conjunta formalizada; não garante demanda. |
| 7 | Como ocorre *a avaliação.* | Seis etapas; sem aprovação automática nem prazo; sem vínculo. |
| 8 | Cooperação técnica, *com critério.* | Página, e-mail, WhatsApp; rodapé legal completo de `COPY.md` §2.11. |

---

## 8. Sequência de relacionamento com candidatos · PROPOSTO

**Funil real** (backend `server/src/routes/parcerias.js`, alterado só por administrador):
`recebido → validacao-profissional → avaliacao-institucional → reuniao → decisao → formalizacao`
(+ `arquivada`, com nota obrigatória).

**Regras de envio**
- Envio **manual e individual** pela equipe, a partir de `administrativo@complexodmc.com.br`,
  para o e-mail profissional informado. Sem automação, sem lista, sem CC/CCO coletivo.
- Cada mensagem acompanha a mudança de status no painel (o histórico registra quem e quando).
  Não copiar dados do candidato para planilhas ou ferramentas externas.
- Sem prazo prometido, sem previsão de demanda, sem condição financeira por e-mail.
- Telefone/WhatsApp informado só para combinar a reunião, se o candidato preferir.
- **Comunicações institucionais** (seção 8.8) só para quem marcou o opt-in separado
  (`comunicacoes.aceito = true`) — e nunca misturadas às mensagens do funil.
- Variáveis: `{nome}`, `{protocolo}`, `{opcao_1}`, `{opcao_2}`. O protocolo pode ir no corpo e no
  assunto do e-mail, **nunca em URL**.
- Assinatura: Equipe Complexo DMC — Central de Parcerias · administrativo@complexodmc.com.br · WhatsApp +55 11 91526-7749.

**8.1 Recebido — confirmação** (enviar ao abrir a candidatura no painel)
Assunto: Candidatura recebida — DMC | Partner Lawyers (protocolo {protocolo})
> Prezado(a) {nome},
>
> Recebemos a sua candidatura ao DMC | Partner Lawyers, registrada sob o protocolo {protocolo}. Guarde este número: ele identifica a sua candidatura em qualquer contato com a nossa equipe.
>
> A próxima etapa é a validação profissional, feita em consulta pública ao Cadastro Nacional dos Advogados. Não há prazo pré-definido para as etapas, e o retorno será feito por este e-mail.
>
> Lembramos que o envio da candidatura não cria vínculo de nenhuma natureza nem garante participação no programa. Pedimos que não nos envie dados de clientes, casos ou documentos.

**8.2 Validação profissional** — duas variantes
(a) Concluída — Assunto: Validação profissional concluída (protocolo {protocolo})
> Prezado(a) {nome}, concluímos a validação profissional da sua candidatura. A próxima etapa é a avaliação de compatibilidade técnica com as frentes dos seis eixos do Complexo DMC. Seguimos em contato por este e-mail.

(b) Divergência — Assunto: Confirmação dos dados de inscrição (protocolo {protocolo})
> Prezado(a) {nome}, na consulta pública ao Cadastro Nacional dos Advogados não conseguimos confirmar a inscrição com o número e a seccional informados. Pode, por gentileza, responder a este e-mail confirmando esses dois dados? Não é preciso enviar documentos.

**8.3 Avaliação institucional** — Assunto: Sua candidatura está em avaliação (protocolo {protocolo})
> Prezado(a) {nome}, a sua candidatura está em avaliação de compatibilidade técnica. Se houver aderência às frentes dos seis eixos, entraremos em contato para agendar uma reunião institucional. Caso queira complementar a sua apresentação profissional, basta responder a este e-mail — sem dados de clientes, casos ou documentos.

**8.4 Reunião** — Assunto: Convite para reunião institucional — DMC | Partner Lawyers
> Prezado(a) {nome}, gostaríamos de convidá-lo(a) para uma reunião institucional sobre o DMC | Partner Lawyers. Pauta: apresentação do programa; papéis, limites e deveres de cada parte; modelos de cooperação juridicamente permitidos; dúvidas. A conversa pode ser por videoconferência ou na nossa sede (Rua Riachuelo, 231 — São Paulo/SP). Sugerimos {opcao_1} ou {opcao_2}; se preferir outro horário, indique por aqui. Pedimos que não sejam tratados dados de clientes ou casos concretos na reunião.
Anexo opcional: `apresentacao-partner-lawyers.pdf` (após aprovação).

**8.5 Decisão** — duas variantes
(a) Seguir — Assunto: Próximo passo: formalização (protocolo {protocolo})
> Prezado(a) {nome}, agradecemos a reunião. Decidimos seguir para a formalização do modelo de cooperação conversado. Enviaremos o documento para a sua análise; sem formalização, não há cooperação. A participação no programa não garante demanda nem volume de trabalho.

(b) Não seguir agora — Assunto: Retorno sobre a sua candidatura (protocolo {protocolo})
> Prezado(a) {nome}, agradecemos o interesse no DMC | Partner Lawyers e o tempo dedicado. Neste momento, não daremos continuidade à sua candidatura. Os seus dados serão tratados conforme a nossa Política de Privacidade; para solicitar a exclusão ou exercer outros direitos previstos na LGPD, escreva para este e-mail com o assunto "LGPD".

**8.6 Formalização** — Assunto: Documento de formalização — DMC | Partner Lawyers · PENDENTE (minuta jurídica — `CONFORMIDADE.md` §5, item 1)
> Prezado(a) {nome}, segue o documento que registra o modelo de cooperação definido, para a sua análise. Ele preserva a sua autonomia técnica, o sigilo profissional e os deveres éticos da advocacia. Fique à vontade para submetê-lo à sua própria revisão antes de assinar.

**8.7 Arquivada (qualquer etapa)** — mesma base da 8.5(b); motivo nunca exposto em detalhe.

**8.8 Comunicações institucionais (só com opt-in)** · PENDENTE (conteúdo e periodicidade)
Proposta: no máximo uma por mês, por e-mail, com atualização normativa nos temas dos seis eixos
e convites para encontros de troca técnica sem dados de clientes. Nunca anunciar casos,
demandas ou oportunidades. Rodapé: "Você recebe esta mensagem porque autorizou comunicações
institucionais do Complexo DMC. Para cancelar, responda com 'cancelar'." O cancelamento é
registrado no painel no mesmo dia.

---

## 9. Plano editorial de 30 dias · PROPOSTO (orgânico; sem mídia paga)

Dia 1 = data aprovada pelo CEO depois de G1–G5. Ritmo discreto: LinkedIn 2×/semana,
Instagram 1–2×/semana. Partner Lawyers e Business Partner **nunca no mesmo post** nem no mesmo
dia (evita divulgação conjunta de advocacia com atividade comercial).

| Dia | Canal | Peça / texto | Objetivo | Status |
|---|---|---|---|---|
| 1 | LinkedIn | LI-01 + P1 (1200×627) | Apresentar o programa | PROPOSTO |
| 3 | Instagram | P1 (1080×1350) + legenda curta derivada do LI-01; bio com `pl-ig-bio` | Apresentar o programa | PROPOSTO |
| 6 | LinkedIn | LI-02 + carrossel P2 | Papéis e limites | PROPOSTO |
| 7 | interno | Revisão semanal: métricas (`mensuracao.md`) + registro de comentários | Controle | PROPOSTO |
| 9 | Instagram | OR-01 + carrossel P2 | Papéis e limites | PROPOSTO |
| 13 | LinkedIn | LI-03 + carrossel P3 | Processo de avaliação | PROPOSTO |
| 14 | interno | Revisão semanal | Controle | PROPOSTO |
| 16 | Instagram | Carrossel P3 + legenda derivada do LI-03 | Processo de avaliação | PROPOSTO |
| 17 | YouTube + LinkedIn (vídeo nativo) | V1 + OR-02 | Conceito-mãe em vídeo | PENDENTE (produção) |
| 20 | LinkedIn | P4 + texto: "Para quem é o programa" (lista de `COPY.md` §2.3 + "não garante demanda") | Perfil | PROPOSTO |
| 21 | interno | Revisão semanal | Controle | PROPOSTO |
| 23 | Instagram | P4 + legenda curta | Perfil | PROPOSTO |
| 24 | YouTube + Reels | V2 | Processo em vídeo | PENDENTE (produção) |
| 27 | LinkedIn | Texto sem imagem: "Troca técnica" (`COPY.md` §2.4, item 2: teses, atualização normativa, sem dados de clientes) | Conhecimento que se amplia | PROPOSTO |
| 28 | interno | Revisão semanal | Controle | PROPOSTO |
| 30 | interno | Balanço do ciclo e decisão do CEO sobre o próximo | Controle | PROPOSTO |

Se os vídeos não estiverem prontos, os dias 17 e 24 repetem P1/P3 com outro texto do kit.

---

## 10. SEO e metadados (variações para decisão)

Atuais (`COPY.md` §2): title "Partner Lawyers — Advogados Parceiros | Complexo DMC" (52) ·
description de 155 caracteres. Variações (contagem conferida):

| Id | `<title>` | Car. |
|---|---|---|
| T-A (atual) | Partner Lawyers — Advogados Parceiros \| Complexo DMC | 52 |
| T-B | DMC \| Partner Lawyers — cooperação técnica com advogados | 56 |
| T-C | Partner Lawyers: cooperação técnica e institucional \| DMC | 57 |
| T-D | Advogados Parceiros: cooperação técnica \| Complexo DMC | 54 |

| Id | meta description | Car. |
|---|---|---|
| D-A (atual) | Cooperação técnica e institucional do Complexo DMC com advogados e sociedades de advocacia inscritos na OAB. Sem captação de causas; avaliação caso a caso. | 155 |
| D-B | Programa do Complexo DMC para advogados e sociedades de advocacia inscritos na OAB. Autonomia técnica e sigilo preservados; sem captação de causas. | 147 |
| D-C | Competências que se conectam: cooperação técnica entre o Complexo DMC e advogados inscritos na OAB. Avaliação individual, sem aprovação automática. | 147 |

`og:title` alternativo: "DMC | Partner Lawyers — Competências que se conectam" · `og:image`: `pecas/pl-p1-manifesto-linkedin-1200x627.png` sem o carimbo "Proposta" (PENDENTE: versão final após aprovação).

### Headlines para teste A/B (H1 do herói) · PENDENTE (ferramenta + consentimento + front)
| # | Headline | Observação |
|---|---|---|
| H1 | Competências que se conectam. *Conhecimento que se amplia.* | Conceito-mãe do CEO |
| H2 | Excelência profissional conectada a *uma visão estratégica de negócios.* | Atual (controle) — ⚠ `CONFORMIDADE.md` D2 |
| H3 | Atuação técnica conectada a *uma visão estratégica de negócios.* | Alternativa neutra a D2 |
| H4 | Cooperação técnica, *cada um no seu papel.* | Ênfase em papéis e limites |
| H5 | Cooperação técnica, *com critério.* | Ênfase em avaliação |
| H6 | Um ambiente de cooperação técnica *para demandas empresariais e patrimoniais complexas.* | Descritiva, sem adjetivo |

Regras do teste: uma variável por vez (só o H1); toda variante passa pela revisão ética antes;
métrica principal = taxa de `form_start` e, sobretudo, proporção de candidaturas que passam da
validação profissional (qualidade, não volume); decidir só com amostra mínima definida antes
(com volume baixo, preferir teste sequencial de 4 semanas por variante). Ver `mensuracao.md`.

---

## 11. Pendências deste kit
1. G1–G5 (seção 0), em especial G2 e G3 (bloqueantes).
2. Decisão do CEO sobre o H1 (D2) e sobre usar "Excelência" em qualquer peça.
3. Produção dos vídeos V1/V2 e da trilha licenciada.
4. Minuta de formalização (8.6) e conteúdo das comunicações com opt-in (8.8).
5. Imagens originais `pl-painel.webp`/`pl-hero.webp`: se aprovadas, re-renderizar as peças
   (`render.mjs` aplica sozinho) e conferir de novo cada PNG.
6. Versão final das peças sem o carimbo "Proposta — sujeita a revisão".
