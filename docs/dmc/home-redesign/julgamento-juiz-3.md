# Julgamento — Juiz 3 (conformidade Prov. 205/2021 + D7 · UX writing sem repetição)

2026-10-17 · lidos na íntegra: `fatos.md`, `inventario-frontend.md`, `spec-A.md`, `spec-B.md`,
`spec-C.md`; consultados `referencia-e-mensagens.md` §3–4 e o `index.html` atual (falas da
`.np-cases-band`, flutuantes), `assets/videos/rino-alpha-gold.*` (0,82 MB webm / 1,27 MB mov).

Escala 0–10 por critério; total = soma (máx. 60). Não premiei volume: as três specs têm
tamanho parecido (40–54 KB) e todas cumprem o básico (hero intocado, vídeo antes do contato,
`#treinamentos` mantido, 0 números, atos privativos atribuídos, cursos fantasma removidos,
`planejamento-sucessorio-empresarial` não linkado). As notas separam o que sobra.

| Critério | A · Editorial | B · Cinematic | C · Conversion |
|---|---|---|---|
| Fidelidade ao brief e à direção C | 7 | 7 | 7 |
| Narrativa contínua sem repetição (02/03/04) | 5 | 7 | 4 |
| Viabilidade na stack estática + tokens | 9 | 7 | 7 |
| Risco performance / acessibilidade (10 = menor risco) | 9 | 6 | 7 |
| Persuasão comercial | 6 | 7 | 8 |
| Mobile | 8 | 6 | 6 |
| **Total** | **44** | **40** | **39** |

**Vencedora: A**, por margem pequena e por ser a única que não cria risco novo (nenhum vídeo
extra, um canvas, nenhum texto sobre imagem, nenhum segundo visual de campo). Ganha apesar de
ser a menos persuasiva: isso se corrige enxertando 03a de C e os eyebrows de B; o contrário
(tirar risco de B e densidade de C) custa muito mais.

---

## Achados transversais (valem para as três)

1. **Nenhuma incorporou a D9** (`fatos.md`, atualização do CEO: atendimento em todo o Brasil e
   internacional pode ser afirmado, sem números). As três mantêm a fórmula hedgeada "depende do
   eixo, do escopo e da rede". Não é infração — é oportunidade perdida na seção 06. A síntese
   deve usar a D9: "Sede em São Paulo, casos conduzidos em todo o Brasil e no exterior com
   parceiros habilitados onde o ativo ou a empresa estão", sem contar estados ou países.
2. **Nenhuma cumpre a direção de imagem do CEO para as verticais** (loop ≤ 6 s / ≤ 1 MB,
   autoplay mudo por IO, poster em reduce/saveData, nomes `assets/images/home/vertical-<slug>.webp`
   + `assets/videos/home/vertical-<slug>.webm`). A proíbe movimento de mídia explicitamente
   (§1.5); B e C só têm `scale` no hover. Só A usa a pasta/nome pedidos (`assets/images/home/vertical-…`);
   C inventa `assets/images/verticais/<slug>-{wide,tall}`. A síntese deve adotar o contrato de
   nomes do CEO e prever o `<video>` por painel com o gate descrito em `fatos.md`.
3. **H2 de 07 e 09 quase idênticos em A e C** ("Análises para quem decide" / "Análises para quem
   decide, no seu e-mail"). Duas seções seguidas com o mesmo título é repetição de manual.
4. **"Seis eixos, uma só governança" aparece como H2 de 03 e como título do item 1 de 04** nas
   três. Um dos dois tem de mudar (sugiro 04.1 → "Um caso, um plano, um responsável").
5. **Fórmula de atribuição de atos privativos** ("sociedades de advogados parceiras, contadores e
   auditores habilitados e cartórios conveniados") repetida em 02, 04, 05 e 06 (C também em 07).
   Conformidade pede a atribuição na mesma seção em que o ato é citado — não pede a lista inteira
   quatro vezes. Regra para a síntese: a lista completa uma vez (04.3); nas demais, só a
   categoria pertinente ("atos lavrados por cartórios conveniados" em 05.1, por exemplo).
6. **Jargão**: "atos privativos" cru em título/rótulo (A ficha "Execução"; C 04.3 "Consultoria e
   ato privativo, cada um no seu lugar") não é vocabulário do decisor. Em corpo, com a lista de
   quem faz o quê, passa; em título, não. "Natureza" como `dt` (A) é formulário de cartório.
7. **Pendências do CEO** tratadas corretamente nas três (Blindagem/Defesa Empresarial mantidos,
   agro com rótulo genérico, parceiros por categoria, ARTHEU/API/PCD fora, preço fora). Nenhuma
   violação direta do Provimento 205/2021 ou da D7 encontrada em copy proposta.

---

## Spec A — "Editorial-first" · 44

**Melhores ideias (enxertar)**
- Ritmo claro/escuro em **blocos** (não zebra) com fio entre vizinhas do mesmo bloco — é o que
  evita a página "listrada" de C.
- 04 como **painel de papel que sangra à direita** com intro sticky à esquerda: um só contraste,
  lido como mosaico sem virar seis caixinhas; `inset: 0 -100vw 0 0` + `overflow-x: clip` é viável
  e já previsto contra o teste de overflow.
- Rede neural sai da Casa; **um só canvas** na página (06). Zero duplicidade de "rede".
- 07 **sem imagem** ("um placeholder aqui pareceria capa falsa") — decisão de conformidade
  editorial correta; B inventa capa procedural, o que cheira a artigo que não existe.
- Mapa de estilos linha a linha (`styles.css` → `home.css`) e lista explícita de ids
  preservados/extintos — é a spec que o frontend implementa com menos perguntas.
- Mídia das verticais **emoldurada sobre papel, texto fora da imagem**: zero véu, zero risco de
  contraste, e fotografia licenciada entra depois sem retrabalho.
- Ícones com geometria distinta e sem clichê (E2 "praças sobrepostas" para controladora/controlada
  é a melhor leitura dos três conjuntos).

**Riscos concretos**
- **Repetição estrutural 02 → 04 → 08**: a `dl.casa-ficha` (Natureza / Eixos / Execução / Método)
  antecipa literalmente os itens 1 e 3 de 04 e as quatro etapas inteiras de 08. O leitor lê o
  método em 02 e de novo em 08. Cortar a ficha a duas linhas (Natureza + Execução) ou substituí-la.
- **Mata a fala do cliente** ("Qual é a sua situação?"), o ativo comercial mais forte segundo
  `referencia-e-mensagens.md` §2.3, sem a recolocar em lugar nenhum da home. Única das três a
  fazer isso.
- 03 com **índice inline de 21 links em cada célula** (E6 com 7 links a 14 px) é catálogo
  disfarçado; em 390 px a célula E6 vira ~12 linhas de texto. B resolve com `<details>`.
- 05 proíbe movimento de mídia — contradiz a direção de imagem do CEO (loop/paralaxe lento).
- Verticais sobre papel: visualmente "revista", não "painel fotográfico grande" do brief; perde o
  clímax que B e C entregam.
- 06 e 07 no mesmo bloco escuro separados por fio: 07 (uma publicação + dois traços vazios) fica
  visualmente fraco logo após o mapa.

## Spec B — "cinematic-first" · 40

**Melhores ideias (enxertar)**
- **`details.eixos-catalogo`** fechado abaixo da grade: preserva os 21 links (regra do BRIEF)
  sem poluir as seis células nem o mobile. Melhor solução das três para o catálogo.
- **Eyebrow com fala do cliente nas verticais** (Newsreader itálico): recoloca a voz do cliente
  onde ela tem contexto setorial, sem criar uma 7.ª lista de eixos.
- Overline numerado por ato ("02 · A casa") como **único número decorativo** permitido — ritmo
  editorial sem número institucional.
- Mapa com `perspective` + `rotateX(6deg)` estático e três planos de paralaxe: a leitura "3D"
  do brief sem WebGL, mantendo `toDataURL` para o `movimento.spec`.
- Capitais embutidas no módulo (sem `fetch`, respeita CSP `connect-src 'self'`) — C copia, A não
  explicita.
- Mensagem de erro da newsletter sem as palavras "receb"/"cadastrad" (regra testável).

**Riscos concretos**
- **Rinoceronte em 02**: 0,82 MB de webm alpha (1,27 MB mov) fora do brief, no momento em que o
  visitante pergunta "quem são vocês?". O gate é só `prefers-reduced-motion`, **não há gate de
  largura** — em mobile o vídeo alpha toca (histórico de 63 % de main thread com chromakey,
  PROGRESS). Se ficar, gate ≥ 1024 e `saveData`.
- **Pilha sticky de 5 painéis 21:9 (~3,6 k px em 1440)**: com Shift+Tab, o CTA do painel anterior
  (sticky, por baixo dos seguintes) pode receber foco **coberto** por outro painel — falha de
  foco visível (WCAG 2.4.11). A spec reconhece e não resolve. Em 1024 com `top` + navbar, o
  véu lateral de 46 % come metade da imagem.
- **Capa procedural para a única publicação** (07): cria aparência de editoria que não existe;
  `fatos.md` §5 pediu estrutura sem título fictício — uma capa é um título visual fictício.
- Rótulo `--np-accent-deep` 12 px/600 sobre papel a 4,6:1: passa AA por 0,1; qualquer ajuste de
  tom quebra. Usar `--text-ink-2` no "E1" e deixar o acento só no ícone/fio.
- 04 em xadrez 3×2 com células de 300 px fixas: seis caixas, a coisa que a direção C pediu para
  evitar ("sem caixas"); em 390 vira faixa listrada de 6 blocos antes das verticais.
- Dois destinos iguais em 05 (painéis 03 e 05 → `holding-patrimonial.html`); C corrige.

## Spec C — "conversion-first" · 39

**Melhores ideias (enxertar)**
- **03a "Qual é a sua situação?"** com 6 falas, uma por eixo, **E6 criada** e **E4 reescrita**
  ("O banco pediu balanço revisado e os números da empresa não se explicam" — tira a DMC do
  papel de escritório contábil). É a melhor copy de conformidade + conversão do lote.
- **Cinco destinos distintos** nas verticais (famílias → `planejamento-sucessorio`, investidores
  → `holding-patrimonial`); "gestão patrimonial" → "estrutura patrimonial" (DMC não é gestora).
- WhatsApp flutuante **qualificado com o eixo** (`?text=` a partir do último `data-assunto`) e
  **só após 04 entrar na viewport**: resolve a objeção "lead sem qualificação" de
  `referencia` §2.3 sem remover o canal.
- 07 → 09: "Receber quando sair" nos slots vazios; vazio que converte sem inventar título.
- "Newsletter" no rodapé; `address` para a sede; regras de 320 px (`min-width: 0`,
  `overflow-wrap: anywhere`, nada > 288 px) — a mais rigorosa em viewport mínima.
- 08 com o programa real em `aside` nomeado e texto de público (sem preço, sem "trust/offshore",
  sem "blindagem" dos módulos).

**Riscos concretos**
- **Seção 03 vira três seções**: 6 situações + 6 cards + índice de 20 links em 6 colunas =
  32 links e três representações do mesmo "E1" (situação, card, cabeçalho do índice). É o
  problema diagnosticado da home atual ("eixos quatro vezes") concentrado num só bloco. Em
  390 px, 03 ocupa 3–4 telas **antes** de "Por que confiar" — repete o fluxo catálogo → contato.
- **02 ↔ 04.3 duplicados palavra por palavra**: o parágrafo da Casa ("Contratos, pareceres,
  escrituração, auditoria e atos notariais ficam com sociedades de advogados parceiras… o
  Complexo DMC coordena o plano e responde pela consultoria") é o item 3 de 04 reescrito. A
  fórmula completa de atribuição aparece em 02, 04, 05, 06 e 07.
- **Dois canvases** (rede da Casa + mapa), com a Casa animando em mobile a 30 fps — A e B
  removeram exatamente isso por CPU e por duplicidade de motivo visual.
- **Link envolvendo o painel inteiro** em 05 (`a.vertical__link` com `h3`, frase, setor e CTA
  dentro): nome acessível de ~40 palavras por painel; B evitou de propósito.
- **Mensagem de sucesso da newsletter promete comportamento do sistema** ("O primeiro e-mail
  confirma o endereço") com backend bloqueado por `RESEND_API_KEY` (fatos §8.9). Afirmar envio
  de e-mail que pode não ocorrer é exatamente o que a regra "nunca afirmar cadastro se a API
  falhar" quer evitar. Trocar por "Inscrição registrada." e ponto.
- **Linha "em observância ao Provimento 205/2021 do CFOAB" em 07**: o Provimento regula a
  publicidade **de advogados**; uma consultoria em negócios invocá-lo como selo editorial
  sugere identidade de banca — o oposto da D7. Já está no rodapé; não multiplicar.
- Formulário de newsletter sobre escuro exige **segundo visual de campo** (a spec admite "não
  há"); A proíbe isso com razão. Pôr 09 em papel resolve de graça.
- Nomes de arquivo de mídia fora do contrato do CEO (`assets/images/verticais/…`).

---

## Recomendação para a síntese (ordem de enxerto)

1. Esqueleto, ritmo de fundos, 04 "papel que sangra", 06 um canvas, 07 sem imagem, mapa de
   estilos: **A**.
2. 03 = grade 3×2 de A **sem** o índice inline + `details.eixos-catalogo` de **B** abaixo +
   as 6 falas de **C** como lead da célula (uma frase itálica curta acima da descrição) **ou**
   como eyebrow das verticais (**B**); nunca os dois.
3. 05: destinos e copy de **C**, painéis grandes de **B/C** mas texto fora da imagem (**A**)
   em ≤ 1023; adicionar o `<video>` loop por painel conforme a direção do CEO e os nomes
   `assets/images|videos/home/vertical-<slug>.*`.
4. 06: D9 incorporada; `perspective` discreta de **B** opcional.
5. WhatsApp qualificado e tardio de **C**; "Newsletter" no rodapé de **C**.
6. Cortar: ficha de 02 a duas linhas; H2 de 09 diferente do de 07; "Seis eixos, uma só
   governança" só em 03; lista de atribuição completa só em 04.3; linha do Provimento só no
   rodapé; mensagem de sucesso da newsletter sem promessa de e-mail.
