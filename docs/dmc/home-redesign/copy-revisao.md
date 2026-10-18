# Copy da nova home — revisão r2 (2026-10-17)

content-director · resposta aos 24 apontamentos de dois revisores sobre `copy.json`/`copy.md`.
Regra: todos os de gravidade **alta** e **média** corrigidos; os **baixos** corrigidos quando
melhoram conformidade ou leitura, mantidos com justificativa quando mudar criaria outro risco.
Estrutura do JSON preservada (mesmas chaves); acréscimos pontuais: `_meta.revisao`,
`verticais.eyebrow_regra`, `verticais.itens[4].cta_secundario`, `publicacoes.destaque.time.exibir`,
`texto_pagina` nos três links `[CEO 2]`.

Verificações feitas antes de mudar (grep em 2026-10-17):
- `pages/por-que-urgente.html`: 0 ocorrências de "EC 132" e "progressiv" → teaser corrigido.
- `pages/registro-imobiliario.html`: 0 ocorrências de "sucess"/"geraç" fora do rodapé → painel 05 realinhado.
- `pages/consultoria-imobiliaria.html`: tem "viabilidade" (11×) e "matrícula" (12×); **não** tem "zoneamento", "ônus" nem "ambiental" → a frase do painel 01 usa só o vocabulário da página (a sugestão do revisor citava zoneamento/passivo ambiental, que a página não entrega).
- `pages/sobre.html`: FAQ "Atendem fora de São Paulo?" com fórmula pré-D9 em HTML e JSON-LD → divergência registrada.
- `pages/politica-de-privacidade.html`: 7 `[CONFIRMAR]` → bloqueio de publicação da seção 09.
- `plataforma-ead/js/data.js`: descrição oficial do programa = "Programa que aprofunda a leitura do patrimônio como sistema. Direito, Tecnologia, Administração e Contabilidade integrados sob uma única governança consultiva." → paráfrase adotada.
- DECISIONS D9: fórmula autorizada é "atendimento em todo o Brasil e no exterior" (capacidade), não "casos conduzidos".

---

## 1. Corrigidos

| # | Seção | Gravidade | Antes → Depois | Observação |
|---|---|---|---|---|
| 1 | 03 · E6 descrição | alta | "…quitação anual do exercício e coordenação da defesa." → "Passivo trabalhista tratado como ciclo: contratos revisados, demissões e acordos documentados, exercício fechado com quitação e defesa por advogados parceiros." (159 car.) | Resolve também o apontamento baixo sobre nomes internos ("decisão com registro", "quitação anual do exercício"). |
| 2 | 07 · destaque | média | Retirado "progressivo (EC 132/2023)". `time.exibir=false`; pendência reescrita: não renderizar `<time>` até [CEO 7] confirmar revisão editorial e por quem. | Se aprovado: "Revisado em … por <função habilitada>". |
| 3 | 06 · lead | média | "Casos conduzidos em todo o Brasil e no exterior… onde o ativo ou a empresa estão." → "Sede em São Paulo. Atendimento em todo o Brasil e no exterior, com parceiros habilitados e cartórios conveniados definidos conforme o caso." | Fórmula literal da D9. Divergência registrada para `sobre.html` (FAQ HTML + JSON-LD). |
| 4/13 | 05 · painel 05 | média + alta | Headline "A terra em ordem na matrícula e na sucessão." → "Antes de dividir a terra, a matrícula." (38 car.). Frase → "Retificação de área e regularização fundiária analisadas antes de qualquer escritura de divisão, doação ou venda das terras. A sucessão da família entra pelo eixo patrimonial." CTA → "Entender a regularização da matrícula" (registro-imobiliario) + `cta_secundario` "Planejar a sucessão das terras" (planejamento-sucessorio). | Sem enunciado de resultado ("em ordem"); cada link promete o que a página entrega. Segue [CEO 6] com texto genérico. |
| 5/16 | 03 · E4 descrição | média | → "Leitura gerencial de balanço, DRE e controles para que sócio, conselho e banco leiam o mesmo número. Escrituração e auditoria com parceiros habilitados." (152 car.) | Conflito entre revisores (um pedia atribuição de auditoria, outro pedia cortar a frase de escrituração): conformidade prevalece — atribuição curta fica em E4, e a duplicata sai de 04.04. |
| 6 | 09 · consentimento | média | Texto mantido. Pendência reescrita como **bloqueio de publicação**: seção entra com `hidden` até a política sair sem `[CONFIRMAR]`. Link "Newsletter" do rodapé oculto junto. | [CEO 9]. |
| 7 | 03 · catálogo [CEO 2] | média | Texto dos links → Separação Patrimonial · Arquitetura Contratual · Gestão do Contencioso Trabalhista. `texto_pagina` guarda o nome oficial; hrefs intactos. | Divergência registrada: link ≠ H1 da página até decisão do CEO. |
| 8 | 10 · lead | baixa | "O responsável pelo eixo correspondente conduz a conversa inicial." → "A conversa inicial parte do eixo correspondente e define o diagnóstico." | Zero afirmação de estrutura de equipe [CEO 8]. |
| 9 | 08 · aside Formação | baixa | → "Leitura do patrimônio como sistema: direito, administração, contabilidade e tecnologia sob a mesma governança consultiva." | Paráfrase da descrição oficial; sem público-alvo nem ementa. [CEO 3] segue. |
| 10 | 05 · aria-label | baixa | "…atendidas pelo Complexo DMC" → "Verticais de negócio do Complexo DMC". | |
| 11 | 04 · item 06 | baixa | "Nenhum documento sai sem…" → "Cada documento passa pela revisão do parceiro habilitado que responde por ele antes da assinatura." H3 → "Tecnologia que acelera; profissional habilitado que assina". CTA → "Ver a tecnologia aplicada ao método". | Mesma fórmula de `tecnologia.html`. |
| 14 | 03 · E3 × 05 · painel 01 | alta | E3 → "Viabilidade, incorporação, venda e registro de cada unidade tratados como processo contínuo, com os atos lavrados por cartórios conveniados." Painel 01 mantém a headline e troca a frase → "Antes de comprar o terreno: viabilidade, situação da matrícula e o caminho até o registro de cada unidade pelos cartórios conveniados, num mesmo plano." | Frase do painel limitada ao que `consultoria-imobiliaria.html` documenta (ver verificações). |
| 15 | 05 · CTAs 02–04 | média | → "Ver como organizamos a sucessão entre sócios" · "Comparar regimes com os números da sua empresa" · "Entender a holding para imóveis e participações". | Opção (b): verbo de leitura/decisão, destino mantido; nenhum verbo repetido entre painéis. Painel 01 ("Avaliar um terreno ou empreendimento") mantido — não apontado e sem repetição. |
| 16 | 04 × 08 duplicatas | média | 08.02 → "Você recebe um relatório com dois ou três caminhos e o que cada um custa, demora e exige em documentos. A decisão é sua, com os cenários na mesa." 08.04 → "Reuniões periódicas com os indicadores do seu caso. Quando a lei, a empresa ou a família mudam, o plano é ajustado com você." 04.04 perde "A escrituração fica com parceiro habilitado." (já em 04.03). | 04 fica com o princípio, 08 com a entrega. |
| 17 | 02 · H2 e CTA | média | H2 → "Uma decisão, várias áreas da lei. Alguém precisa coordenar." CTA → "Conhecer o Complexo DMC". | Lead (mensagem aprovada pelo CEO) intocado. |
| 18 | 05 · headlines 03 e 04 | média | → "Quatro empresas, uma estrutura decidida." (40 car.) · "O que está em seu nome, e por quê." (34 car.) | Todas as cinco headlines ≤ 45 car. |
| 19 | 04 · item 03 e H3 06 | média | Item 03 → "Advogados parceiros redigem contratos, pareceres e petições; contadores e auditores habilitados escrituram e opinam; cartórios conveniados lavram e registram. O Complexo DMC coordena o plano e responde pela consultoria." (≈215 car.) | Mantive "pareceres" na lista dos advogados: cortar criaria lacuna de atribuição. Continua a única fórmula completa (S13). |
| 20 | 05 · eyebrows entre aspas | média | Aspas e itálico de citação removidos; eyebrows viram pergunta ao leitor ("Tem um terreno e não sabe se o empreendimento fecha?"). `eyebrow_regra` adicionada ao JSON; rótulo visual opcional "Situação típica". | Elimina leitura como depoimento. |
| 21 | 03 · lead | baixa | → "Comece pela sua situação, não pelo catálogo: cada eixo leva às soluções que a tratam." | Usei "tratam" em vez de "resolvem" (sugestão do revisor) para não sugerir resultado. |
| 22 | 04 lead · 09 lead · 06 CTA | baixa | → "Seis razões que você confere já no primeiro diagnóstico." · "Textos curtos, só quando houver algo a dizer: sucessão, tributos, imóveis, auditoria, crédito e passivo trabalhista." · "Descrever o seu caso". | |
| 23 | Transversal "um só" / "seis eixos" | baixa | "um só/uma só": 6 → 2 (H2 de 03 e item 04.01). "seis eixos" em texto corrido: 8 → 4 (lead aprovado de 02, overline+H2 de 03, lead do vídeo). Demais → "seis especialidades", "no mesmo plano", "em conjunto", "a mesma governança". | Lead do vídeo mantido por distância das demais ocorrências. |

## 2. Mantidos com justificativa

| # | Seção | Gravidade | Decisão |
|---|---|---|---|
| 12 | 03 · nomes "Direito Notarial e Imobiliário", "Jurídico Imobiliário", "Jurídico Vendas", slug `contabilidade` | baixa | **Mantidos.** "Direito Notarial e Imobiliário" é o nome oficial do eixo no BRIEF (aprovado pelo CEO) e está na navbar, no rodapé e em 20+ páginas; trocar só na home criaria inconsistência de navegação e SEO. Os dois "Jurídico…" são H1 de páginas existentes; recebem `pendencia` `[CEO 12]` no JSON com as alternativas "Assessoria Imobiliária" / "Assessoria em Vendas" para decisão em lote (home + páginas + sitemap). Slug `contabilidade` já é [CEO 10]. |
| 15 (parcial) | 05 · CTA painel 01 | média | Mantido "Avaliar um terreno ou empreendimento": não repetido, o destino é a página que descreve exatamente a avaliação de viabilidade. |
| 19 (parcial) | 04 · item 03 | média | Não encurtei a ≈200 car. porque a versão do revisor omitia "pareceres"; em uma lista de atribuição de atos privativos a omissão pesa mais que 15 caracteres. |
| 2 (parcial) | 07 · destaque | média | `time` não foi removido do JSON (chave preservada); passou a `exibir:false` para a integração não renderizar. |

## 3. O que a integração (frontend) precisa saber

- Seção `#newsletter` e link "Newsletter" do rodapé: `hidden` até [CEO 9].
- `publicacoes.destaque.time.exibir === false` → não renderizar `<time>`.
- Painel 05 tem `cta_secundario` (link textual discreto, mesmo padrão do CTA, sem botão).
- Eyebrows dos painéis sem aspas tipográficas e sem `<q>`/`<blockquote>`; se houver rótulo "Situação típica", vai em `<span>` visual, não em `cite`.
- Links do catálogo com `texto_pagina`: usar `texto` no HTML; `texto_pagina` é só referência para reverter.
