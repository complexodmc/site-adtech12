# Nova home — BASE DE FATOS

Levantada em 2026-10-17 a partir de BRIEF, EIXOS-COPY, DECISIONS (D1, D5–D8), PROGRESS,
AUDIT §4, `index.html`, `plataforma-ead/js/data.js`, `<title>/<h1>/meta` de 20 páginas em
`pages/` + 7 em `solucoes/consultoria-trabalhista/` e `git log`. Nada aqui é copy final:
é o que PODE ser dito e para onde cada link PODE apontar. `[CEO]` = depende do CEO.

URLs relativas à home (`complexodmc.com.br/index.html`). Prefixo público em produção:
`https://www.complexodmc.com.br/` (sitemap; as 7 trabalhistas sem `.html`, via rewrite).

---

## 1. Eixos E1–E6 — nome, slug, âncora e soluções

| Eixo | Nome oficial | Slug CSS | Página-âncora (CTA "Explorar soluções") | Acento (D8) |
|---|---|---|---|---|
| E1 | Planejamento Patrimonial e Sucessório | `np-pillar-patrimonial` | `pages/planejamento-sucessorio.html` | padrão do eixo |
| E2 | Tributário, Fiscal e Corporativo | `np-pillar-fiscal` | `pages/planejamento-tributario.html` | padrão |
| E3 | Direito Notarial e Imobiliário | `np-pillar-imobiliario` | `pages/consultoria-imobiliaria.html` | padrão |
| E4 | Auditoria Empresarial e Contábil | `np-pillar-auditoria` | `pages/contabilidade.html` | cobre (não ouro) |
| E5 | Recuperação de Ativos | `np-pillar-ativos` | `pages/recuperacao-ativos.html` | padrão |
| E6 | Consultoria Trabalhista | `np-pillar-trabalhista` | `solucoes/consultoria-trabalhista/ciclo-fechado.html` | violeta |

Nomes curtos já usados na home (`data-curto`): Patrimonial e Sucessório · Tributário e
Corporativo · Notarial e Imobiliário · Auditoria e Contábil · Recuperação de Ativos ·
Consultoria Trabalhista. As âncoras acima são as mesmas da seção `#conheca`, do rodapé e do
mega-menu — não inventar outras.

### Soluções por eixo (todas existem e estão no sitemap, salvo nota)

**E1 — 5 soluções + 1 conteúdo de apoio**
| Solução (nome do card) | URL |
|---|---|
| Planejamento Sucessório | `pages/planejamento-sucessorio.html` |
| Holding Patrimonial | `pages/holding-patrimonial.html` |
| Blindagem Patrimonial `[CEO: nome]` | `pages/blindagem-patrimonial.html` |
| Proteção Patrimonial (slug `pronto-patrimonio`) | `pages/pronto-patrimonio.html` |
| Sucessão Testamentária | `pages/sucessao-testamentaria.html` |
| (apoio) Por que planejar a sucessão em vida | `pages/por-que-urgente.html` |
| ~~Sucessão em Empresas Familiares~~ | `pages/planejamento-sucessorio-empresarial.html` — **301 → planejamento-sucessorio** (vercel.json, T5); fora do sitemap. **Não linkar.** |

**E2 — 2 soluções**
| Planejamento Tributário | `pages/planejamento-tributario.html` |
|---|---|
| Compliance & Governança | `pages/compliance-governanca.html` |

**E3 — 5 soluções**
| Consultoria Imobiliária | `pages/consultoria-imobiliaria.html` |
|---|---|
| Jurídico Imobiliário | `pages/juridico-imobiliario.html` |
| Jurídico Vendas | `pages/juridico-vendas.html` |
| Registro Imobiliário | `pages/registro-imobiliario.html` |
| Atos Notariais | `pages/atos-notariais.html` |

**E4 — 1 página + 1 card sem página**
| Auditoria e Inteligência Contábil (title: "Auditoria Empresarial e Contábil") | `pages/contabilidade.html` |
|---|---|
| Auditoria Empresarial | `index.html#contact` (sem página própria — `[CEO]` criar ou fundir) |

**E5 — 1 solução**
| Recuperação de Ativos | `pages/recuperacao-ativos.html` |
|---|---|

**E6 — programa + 6 soluções** (base `solucoes/consultoria-trabalhista/`)
| Ciclo Fechado (programa) | `…/ciclo-fechado.html` |
|---|---|
| Blindagem Contratual `[CEO: nome]` | `…/blindagem-contratual.html` |
| Conformidade Psicossocial | `…/conformidade-psicossocial.html` |
| Decisão Assistida | `…/decisao-assistida.html` |
| Câmara de Acordos | `…/camara-de-acordos.html` |
| Quitação Anual | `…/quitacao-anual.html` |
| Defesa Empresarial `[CEO: nome; alt. "Gestão do Contencioso Trabalhista"]` | `…/defesa-empresarial.html` |

Transversais (não são eixos — D1): `pages/tecnologia.html` (Tecnologia), `pages/sobre.html`
(institucional; **arquivo ainda não commitado**), `pages/politica-de-privacidade.html`
(com `[CONFIRMAR]` abertos — não divulgar como pronta), `pages/treinamento-interesse.html`
(agradecimento, `noindex`).

---

## 2. Descrição comercial por eixo (≤ 160 caracteres, sem `[CONFIRMAR]`)

Adaptadas de EIXOS-COPY; ARTHEU, IA de minutas e Bear Finance ficaram de fora por estarem
sob confirmação.

| Eixo | Descrição (caracteres) |
|---|---|
| E1 | Sucessão, holding e proteção do patrimônio familiar organizados em vida, com a carga tributária calculada antes de cada ato. (123) |
| E2 | Regime, créditos e estrutura societária revisados em conjunto, com programa de integridade e cada escolha registrada com fundamento legal. (139) |
| E3 | Do terreno à matrícula de cada unidade: due diligence, incorporação, venda e registro, com atos lavrados por cartórios conveniados. (131) |
| E4 | Balanço, DRE e controles internos revisados e traduzidos para sócios, conselho e banco. A escrituração fica com parceiro contábil habilitado. (139) |
| E5 | Análise do título, levantamento do patrimônio do devedor e coordenação de bloqueio, penhora e execução, com atos processuais de parceiros habilitados. (150) |
| E6 | Passivo trabalhista gerido como ciclo: contrato, decisão com registro, acordo, quitação anual do exercício e coordenação da defesa. (131) |

Headlines já aprovadas no painel atual (reutilizáveis): E1 "Sucessão decidida em vida, não no
inventário." · E2 "Carga fiscal e estrutura societária decididas com fundamento." · E3 "Do
terreno à matrícula de cada unidade." · E4 "Leitura independente dos números para quem
decide." · E5 "Do título executivo ao patrimônio do devedor." · E6 "Passivo trabalhista
gerido como se fecha um balanço."

---

## 3. O que PODE e o que NÃO PODE ser afirmado

### Pode (fonte no repositório)
- **Identidade:** "consultoria em negócios" (title da home, BRIEF, sobre.html). Nunca
  "escritório", "banca", "advocacia", "contabilidade" como identidade.
- **Sede:** São Paulo, Rua Riachuelo, 231 — publicada no rodapé e no JSON-LD. Sem CNPJ
  (não há fonte). Contato: administrativo@complexodmc.com.br · +55 (11) 91526-7749 ·
  WhatsApp wa.me/5511915267749.
- **Seis eixos integrados sob uma governança** (faixa `.fatos`, D7).
- **Mensagem central aprovada pelo CEO:** "O Complexo DMC integra seis eixos de especialidade
  para decisões empresariais, patrimoniais e operacionais de alta complexidade."
- **Execução por terceiros habilitados**, só por categoria: "sociedades de advogados
  parceiras", "contadores e auditores habilitados", "cartórios/tabeliães conveniados".
  Nomes: apenas Bear Finance já está publicada (ver §7) — qualquer outro nome é `[CEO]`.
- **Metodologia:** 4 etapas institucionais (sobre.html): Diagnóstico → Cenários e decisão →
  Estruturação e implementação → Acompanhamento e revisão. E1 detalha em 7 etapas
  (diagnóstico, cenários, estratégia, estruturação, implementação, validação, monitoramento).
  Entrada: conversa inicial → diagnóstico → proposta com escopo, etapas e entregas.
- **Diferenciais verificáveis (método):** papéis separados em E4 (quem lê não é quem
  escritura); qualificação registral prévia em E3; análise prévia do título em E5;
  fundamento normativo explícito por solução em E6 (arts. 507-A, 507-B, 855-B a 855-E,
  477-B da CLT; NR-1); indicadores acompanhados pelo cliente (E6); comparação documentada de
  regimes com os números da própria empresa (E2).
- **Tecnologia/Ad-tech (aprovado hoje em index + tecnologia.html):** plataforma própria de
  automação documental para minutas e documentos, com revisão por parceiros habilitados;
  painel de acompanhamento do caso; dossiês organizados com controle de acesso; fluxos com
  registro de decisão; dados tratados pela LGPD; integrações com sistemas da empresa
  "avaliadas caso a caso no diagnóstico"; demonstração sob agendamento. App:
  `https://adtech-app.complexodmc.com.br` (link no rodapé).
- **Plataforma EAD existe e permanece** (D5): `plataforma-ead/` com login e área do aluno.
- **Fundamentos normativos** com texto de lei: EC 132/2023 (ITCMD progressivo), Lei
  13.786/2018, Lei 14.133/2021, CPC arts. 523 e 784, CLT citados acima, Portaria MTE
  1.419/2024, Lei 13.709/2018.
- **Público atendido** (rodapé): empresas, famílias empresárias, incorporadoras e investidores.

### Não pode (D7 + Provimento 205/2021 + pendências)
- Qualquer número institucional: anos de mercado, clientes, patrimônio sob gestão, VGV,
  construtoras atendidas, percentuais, "24/7", prêmios, rankings, depoimentos.
- Promessa/sugestão de resultado, "garantia", "blindagem" como resultado, economia,
  "redução de passivo", urgência artificial, honorários/forma de pagamento, "gratuito".
- Cobertura geográfica: "atendemos todo o Brasil", "presença em N estados", lista de
  cidades. Fórmula publicada e aprovada: atendimento fora de SP "depende do eixo, do escopo
  e da rede de parceiros e cartórios e é definido na conversa inicial".
- Nomear parceiros, auditores (CRC), cartórios conveniados `[CEO pend. 1–3]`.
- ARTHEU como IA em operação e IA de minutas `[CEO]` (ARTHEU já aparece em
  `recuperacao-ativos.html#artheu`, mas EIXOS-COPY o mantém sob confirmação — não escalar
  para a home).
- Ad-tech: "integração com tribunais e cartórios", "integração via API", "acessível para
  PCDs" — removidos da home, aguardam CEO.
- Holding rural / especialização em agronegócio; transição IBS/CBS como frente; prazo
  "24–48 h" do parecer; câmara de mediação com regulamento próprio.
- Cursos que não existem no catálogo (ver §6); datas/artigos inventados (§5).
- Schema: nunca `LegalService`, `ProfessionalService`, `LocalBusiness`; usar `Organization`
  `@id https://www.complexodmc.com.br/#organization` (já na home).
- Imagens: sem IA generativa; sem fotografia sem licença — placeholder procedural.

---

## 4. Verticais de negócio → página real e o que se pode dizer

Critério: contagem de menções no texto publicado (grep 2026-10-17) + escopo de EIXOS-COPY.

| Segmento do brief | Página real mais pertinente | Secundárias | O que se pode dizer | O que NÃO dizer |
|---|---|---|---|---|
| Construção civil e incorporação | `pages/consultoria-imobiliaria.html` (E3) | `juridico-imobiliario`, `juridico-vendas`, `registro-imobiliario`, `atos-notariais`; E6 `ciclo-fechado` (terceirização, Súmula 331) | Do terreno à matrícula de cada unidade: viabilidade e due diligence, incorporação, minutas de venda, registro; frente trabalhista da obra. **Segmento mais documentado do site** (26+ menções a construtora/incorporadora em E3). | "+N construtoras", VGV, "liquidez", "escritório de direito imobiliário". |
| Agronegócio / produtores rurais | `pages/registro-imobiliario.html` (E3: REURB rural, retificação de área, usucapião extrajudicial) | `planejamento-sucessorio` (sucessão da família), `holding-patrimonial` | Regularização fundiária rural e retificação de área (texto publicado); sucessão e holding da família que detém terras — **sem a palavra "rural" na holding**. "Produtor rural" existe só como opção do formulário. | Especialização em agro, holding rural `[CEO]`, ITR/Funrural, crédito rural, CAR. **Painel só com aprovação do CEO ou com texto genérico de "família que detém imóveis e terras".** |
| Empresas familiares e holdings | `pages/holding-patrimonial.html` (E1) | `planejamento-sucessorio`, `pronto-patrimonio`, `sucessao-testamentaria`, `compliance-governanca` (conselho) | Holding, sucessão das quotas e do comando, acordo de sócios, protocolo familiar, governança; ITCMD calculado por cenário. Vertical mais forte com E1 inteiro. | "Blindagem" como resultado; "proteção garantida"; cifras. Não linkar `planejamento-sucessorio-empresarial` (301). |
| Grupos empresariais | `pages/planejamento-tributario.html` (E2) | `compliance-governanca`, `contabilidade` (E4), E6 `defesa-empresarial` (grupo econômico, art. 2º CLT) | Reorganização societária (cisão, incorporação, holding operacional), regime e créditos, programa de integridade (Lei 14.133), demonstrações revisadas para conselho e banco, responsabilidade do grupo econômico na frente trabalhista. | "Grupos econômicos atendidos", economia tributária, "redução de carga". |
| Investidores e gestão patrimonial | `pages/holding-patrimonial.html` (E1) | `recuperacao-ativos` (crédito inadimplido), `juridico-vendas`/`consultoria-imobiliaria` (investidor imobiliário), `contabilidade` (participações) | Estrutura de participações e imóveis, leitura dos números de participações, crédito inadimplido. Público "investidores" está no rodapé. | "Gestão de patrimônio/ativos" no sentido CVM (DMC não é gestora), rentabilidade, "wealth management". Preferir "estrutura e governança do patrimônio". |
| Credores / recuperação de crédito | `pages/recuperacao-ativos.html` (E5) | E3 `juridico-vendas` (unidades inadimplentes) | Análise do título (CPC 523/784), diligência patrimonial em registros públicos e sistemas conveniados ao Judiciário (SISBAJUD, RENAJUD, INFOJUD, CNIB, SERASAJUD — requeridos no processo), bloqueio/penhora por parceiros habilitados, desconsideração quando presentes os requisitos. | Taxa de recuperação, "recupere o que é seu", execução como ato próprio da DMC, ARTHEU `[CEO]`. |
| Empregadores / relações trabalhistas | `solucoes/consultoria-trabalhista/ciclo-fechado.html` (E6) | as 6 soluções | Ciclo em seis soluções com fundamento na CLT; auditoria mês a mês antes da quitação; indicadores acompanhados pela empresa. | "Elimine o passivo", "blindagem" como resultado, "defesa" sem atribuição a advogados parceiros, 24–48 h. |

O brief da seção 05 pede 5 painéis; os 2 últimos segmentos (credores, empregadores) estão
cobertos por eixos próprios (E5/E6) e podem ficar fora dos painéis sem perda. **Agronegócio é
o painel de maior risco**: só há base publicada para regularização fundiária rural.

---

## 5. Publicações reais candidatas (seção 07)

| Candidata | Tipo | Data real (último commit) | Criada | Veredito |
|---|---|---|---|---|
| `pages/por-que-urgente.html` — "Por que planejar a sucessão em vida" (legítima, inventário, ITCMD, EC 132/2023) | conteúdo editorial de apoio (E1) | 2026-10-17 (`db32651`) | 2026-05-07 (`65b7635`) | **única publicação editorial real**; está no sitemap e no rodapé. Slug carrega "urgente" `[CEO]`. |
| `pages/sobre.html` — institucional | institucional, não artigo | sem commit (untracked) | — | não é publicação. |
| `pages/tecnologia.html` — capacidade transversal | página de serviço | 2026-10-17 | 2026-05-07 | não é publicação. |
| FAQs com JSON-LD `FAQPage` nas 7 trabalhistas + sobre + recuperacao-ativos | conteúdo explicativo | 2026-10-17 | 2026-10-17 | podem ser "perguntas frequentes", não "artigos". |

Faltam: 2 publicações para fechar 3 cards; política editorial (autor, data, revisão por
profissional habilitado); template de artigo (`pages/css/eixos.css` + bloco de vídeo no fim).
Recomendação: estrutura com 1 card real + 2 slots "em preparação" **sem título fictício nem
data**, ou seção reduzida a um único destaque editorial com link para `por-que-urgente`.
A data exibida, se houver, deve ser a de revisão real (2026-10-17) — nunca "publicado em
mai/2026" sem decisão do CEO.

---

## 6. Treinamentos — o que é real

**Fato que muda o plano:** `plataforma-ead/js/data.js` está marcado `[DEPRECATED]` no
cabeçalho — "não é mais carregado pela plataforma; os cursos vivem no MongoDB
(cursos/modulos/aulas)". Mas `server/scripts/seed.js` lê exatamente esse arquivo para popular
o banco (`npm run seed`). Logo o catálogo real = o que foi semeado a partir dele, **não
verificável daqui** (Atlas inacessível; credenciais em rotação — T3).

Catálogo do seed (4 cursos, com preço e checkout vazio):

| Curso | Carga | Modalidade | Preço no seed |
|---|---|---|---|
| Arquitetura Patrimonial Estratégica (10 módulos; "carro-chefe", `cursoAtivoId`) | 42 horas | Online | R$ 4.990 |
| Holding Familiar Aplicada | 18 horas | Presencial | R$ 2.490 |
| Compliance & Governança Familiar | 12 horas | Híbrido | — |
| Tecnologia Jurídica & IA (Ad-tech) | 14 horas | Online | — |

Os 6 cursos da home atual (Planejamento Sucessório 20 h, Compliance & Governança 16 h
presencial, Planejamento Tributário 24 h híbrido, Holding Familiar 18 h, Blindagem
Patrimonial 12 h, Automação Jurídica 8 h) **não batem** com o seed em nome, carga ou
modalidade (só "Holding Familiar 18 h" coincide parcialmente). Links atuais
(`plataforma-ead/login.html?curso=…`) levam ao login, não a uma página do curso.

Recomendação: seção 08 como **metodologia consultiva** (4 etapas de §3) com uma menção ao
único programa cuja existência é documentada em dois lugares (seed + `cursoAtivoId`):
"Arquitetura Patrimonial Estratégica — programa de formação institucional, 42 horas, online",
CTA para `plataforma-ead/` ("Conhecer a plataforma"). **Sem preço** (publicidade). Os outros
3 cursos e os 6 da home: `[CEO]`. Observação: o módulo 3 do programa cita "Trust, offshore e
estruturas internacionais" e o módulo 5 "Blindagem Patrimonial" — não repetir esses nomes na
home.

---

## 7. Auditoria de marcas de terceiros — "bear" (fora da EAD)

`grep -rni "bear" complexodmc.com.br` excluindo `plataforma-ead/`:

| Ocorrência | Texto | Veredito |
|---|---|---|
| `solucoes/consultoria-trabalhista/defesa-empresarial.html:254` | "Cálculo, conferência e impugnação de liquidação executados pela Bear Finance Serviços Financeiros e Contábil, com a provisão conciliada ao balanço…" | **Legítimo em forma** (atribui ato contábil a terceiro nomeado) — **pendente de autorização** `[CEO pend. 1]`: citar parceiro exige consentimento dele e consistência (E4 cita só "parceiro habilitado"). |
| `solucoes/consultoria-trabalhista/quitacao-anual.html:210` | "Conferência das obrigações de dar e de fazer, executada pela Bear Finance Serviços Financeiros e Contábil." | idem — legítimo em forma, `[CEO pend. 1]`. |
| `plataforma-ead/js/api-client.js:34` | `Authorization: Bearer ${_token}` | falso positivo (HTTP). |
| `assets/images/URSO-BEARFINANCE.png`, `assets/images/bear-finance.png`, `assets/videos/bear-finance.mp4`, `assets/videos/urso-bear.mp4` | mídia de marca do parceiro, **sem referência** em HTML/CSS/JS fora da EAD | **órfãs**; mantidas por T5 ("mídias de parceiro ficam"). Não usar na home sem autorização de marca. |

Nenhuma ocorrência indevida (sem comparação, ranking ou uso de marca sem contexto). Para a
home: não citar Bear Finance até o CEO decidir; se decidir, citar nas duas páginas e em E4 de
forma uniforme.

---

## 8. Pendências do CEO que tocam a home

1. **Atendimento fora de SP não confirmado** → seção 06 "Presença Nacional" só com a fórmula
   aprovada ("De São Paulo, conectados aos desafios do Brasil"; "definido na conversa
   inicial"); mapa sem números, sem lista de praças, sem "atuação nacional".
2. **Nomes "Blindagem Patrimonial" / "Blindagem Contratual" / "Proteção Patrimonial" /
   "Defesa Empresarial"** → cards da seção 03 e painéis da 05 repetem os nomes atuais até
   decisão; alternativas registradas: Separação Patrimonial, Arquitetura Contratual, Gestão do
   Contencioso Trabalhista.
3. **Cursos ativos na EAD** (nomes, cargas, formatos; data.js deprecado × seed) → seção 08.
4. **Ad-tech:** tribunais/cartórios, API, PCDs — fora até confirmação → seção 04.
5. **Parceiros nomeados** (Bear Finance, auditor/CRC, sociedades de advogados, cartórios) →
   seções 04 e 05 só por categoria.
6. **ARTHEU e IA de minutas em operação** → fora da home (já presentes nas páginas E5/E3).
7. **Headline do hero** "proposta em uso" (não mexer — seção 01 aprovada).
8. **Texto de `pages/sobre.html`** em revisão ("um responsável por eixo" veio do briefing) →
   seção 02 não deve ampliar afirmações de equipe/estrutura.
9. **Newsletter (seção 09):** não há endpoint; `POST /api/contato` existe para o formulário.
   Backend novo + aviso de e-mail dependem de `RESEND_API_KEY` etc. (bloqueio). Política de
   privacidade com `[CONFIRMAR]` (CNPJ, encarregado, retenção) — o consentimento da
   newsletter vai linkar uma página ainda não finalizada.
10. **Página de Auditoria Empresarial** (criar ou fundir com `contabilidade`) e slug
    `contabilidade` → afeta o link do card E4.
11. **Vídeo da home** (`#video` com `data-video=""`) — ID do YouTube ainda não fornecido.
12. **Fotografia real** para os painéis da seção 05 → placeholder procedural até decisão.

## Atualização do CEO — 2026-10-17 (D9, prevalece sobre o que estiver acima)
- **Alcance confirmado:** atendimento em todo o Brasil e também internacional. A seção "Presença Nacional" e qualquer texto podem afirmar isso (sem números de estados/países/clientes).
- **Imagens:** produzir proceduralmente agora; a equipe substitui por fotografia licenciada se precisar. Prever `alt` e nomes de arquivo estáveis para facilitar a troca.

## Direção de imagem do CEO — 2026-10-17 (prevalece)
- Referência de look: painéis fotográficos cinematográficos como os de planning.com.br (setores em imagem grande, luz sofisticada, gradiente de leitura), **com movimento** (nas verticais: zoom/paralaxe lento, loop curto; o hero já tem filme).
- Produção: nenhum gerador de imagem por IA está conectado nesta máquina. Produzir agora a versão mais fotográfica possível por render procedural 3D (three.js via CDN renderizado no Chromium do Playwright: cidade/obra, campo agrícola, interiores corporativos abstratos, estruturas societárias, mapa), com iluminação cinematográfica, grão e profundidade; exportar poster WebP/AVIF + loop WebM/MP4 curto (≤ 6 s, ≤ 1 MB) por vertical. Nomes de arquivo estáveis (assets/images/home/vertical-<slug>.webp, assets/videos/home/vertical-<slug>.webm) para a equipe trocar por fotografia/IA depois.
- Movimento: autoplay mudo só com o painel visível (IntersectionObserver), pausa fora da tela, poster em prefers-reduced-motion e em conexões lentas (saveData), nunca pesar o LCP.

## Alinhamentos da sessão "Parcerias + header" (aplicar na integração do index.html)
- Versões: `components.css?v=3` e `navbar.js?v=c4` (header novo mantido por outra sessão; não editar navbar.js/components.css aqui).
- Rodapé, coluna "Sobre": "Área do aluno" → **"DMC Business School"** (href plataforma-ead/login.html); "Ad-tech" → **"ADTECH"** (mesmo href). Item `<li><a href="parcerias/">Parcerias</a></li>` após "Tecnologia" **só quando** complexodmc.com.br/parcerias/index.html existir no HEAD (aviso da outra sessão).
- Grafia oficial do CEO: **ADTECH** (não "Ad-tech"/"Plataforma Ad-tech") em qualquer texto novo da home.

## Base de integração (2026-10-17, HEAD b26a462)
- A seção **Sobre (#conheca)** da home foi redesenhada pela sessão "d2" (tablist .casa__tab + foco por eixo + rede neural reescrita em rede-neural.js v2; pages/sobre.html + sobre.css + sobre.js; e2e 460/460). **Mantê-la como a seção 02 "A Casa" do brief**: não reescrever, só ajustar copy/espaçamento se a síntese exigir, e evitar repetir a lista dos seis eixos nela e no grid de Seis Eixos.
- Partir sempre do HEAD atual para index.html, styles.css e rede-neural.js. navbar.js/components.css e rodapés de pages/** pertencem à sessão "2d" (header + Parcerias).

## Pendência pós-Fase 2 (coordenação com a sessão "2d")
- Incluir a seção **Newsletter** em `pages/politica-de-privacidade.html` (dados tratados: nome, e-mail, empresa opcional; base legal consentimento; descadastro por link/e-mail; IP não gravado por padrão) **somente após** o commit das páginas de parcerias pela sessão 2d (ela avisa).
