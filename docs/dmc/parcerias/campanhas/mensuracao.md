# Plano de mensuração — Central de Parcerias (Partner Lawyers e Business Partner)

Data: 2026-10-17 · Autor: growth · Status: **PROPOSTO**. Nada foi ativado: nenhuma ferramenta,
pixel, tag ou banner. Metas abaixo são **hipóteses**, nunca resultados, e não podem ser citadas
fora da equipe (D7).

---

## 1. Situação hoje

| Item | Estado | Evidência |
|---|---|---|
| Ferramenta de analytics | **Nenhuma** no site público | Busca por gtag/GTM/Plausible/Matomo/Vercel Insights sem resultado fora da EAD |
| Banner de consentimento | **Não existe** | — |
| Política de Privacidade | Afirma que "o site não usa cookies de publicidade nem ferramentas de análise de audiência ou de rastreamento — não há Google Analytics, pixel de redes sociais ou similar" | `pages/politica-de-privacidade.html`, seção "Cookies e segurança" |
| Eventos no front | Especificados para as landings: disparam em `window.dataLayer` (se existir) e como `CustomEvent('dmc:analytics')`; hoje ninguém escuta | Pedido da orquestração. **Não localizados no repositório em 2026-10-17** (as páginas `/parcerias/` ainda não estão na árvore) — conferir nomes e propriedades quando o front entrar |
| Funil no banco | **Existe**: status por candidatura, histórico de transições, `fonte.pagina` e `fonte.utm_*` saneados (`[A-Za-z0-9._-]`, até 80) | `server/src/routes/parcerias.js` (`FUNIS`, `lerFonte`, `montarCandidatura`) |
| Retenção no banco | `retencaoAte` = criação + 24 meses (`RETENCAO_MESES`) | idem; a Política ainda não diz isso |

Consequência: **hoje só é possível medir do envio para baixo** (banco). Visitas, inícios de
formulário e cliques de contato dependem de ferramenta + política (+ consentimento, conforme a ferramenta).

---

## 2. Eventos

### 2.1 Catálogo
| Evento | Gatilho | Propriedades permitidas |
|---|---|---|
| `partner_lawyers_page_view` | Carregamento de `/parcerias/advogados-parceiros/` (uma vez por carregamento) | `programa`, `pagina`, `utm_*` |
| `partner_lawyers_form_start` | Primeira interação (foco ou digitação) em qualquer campo do formulário `#candidatura`, uma vez por carregamento | `programa`, `pagina`, `utm_*` |
| `partner_lawyers_submit_success` | **Somente** resposta HTTP **201** de `POST /api/parcerias/partner-lawyers` | `programa`, `pagina`, `utm_*` |
| `business_partner_page_view` | Carregamento de `/parcerias/business-partner/` | `programa`, `pagina`, `utm_*` |
| `business_partner_form_start` | Primeira interação no formulário `#candidatura` | `programa`, `pagina`, `utm_*` |
| `business_partner_submit_success` | **Somente** HTTP **201** de `POST /api/parcerias/business-partner` | `programa`, `pagina`, `utm_*` |
| `partnership_contact_click` | Clique em link de WhatsApp (`wa.me`) ou `mailto:` nas páginas `/parcerias/*` | `programa` (`hub` \| `partner-lawyers` \| `business-partner`), `canal` (`whatsapp` \| `email`), `posicao` (seção do link, ex. `hero`, `conversa`), `pagina` |

Valores: `programa` ∈ {`partner-lawyers`, `business-partner`, `hub`}; `pagina` = caminho sem
query nem fragmento (ex. `/parcerias/business-partner/`); `utm_source`, `utm_medium`,
`utm_campaign`, `utm_content` só se vierem na URL, saneados para `[A-Za-z0-9._-]` e cortados em 80.

### 2.2 Regra de sucesso
- Sucesso = **201** do servidor, que só responde depois de gravar.
- **Não** contam como sucesso: 200 com `duplicada: true` (candidatura repetida em 24 h), 200 do
  honeypot, 400, 413, 429, 503, erro de rede, clique no botão, envio "otimista".
- Proposta opcional (PENDENTE, exige mudança no front): `*_submit_error` com só `tipo` ∈
  {`validacao`, `limite`, `servidor`, `rede`, `duplicada`} — mede atrito sem nenhum valor de campo.

### 2.3 Proibido em evento e em URL
Nome, e-mail, telefone/WhatsApp, número ou seccional da OAB, escritório, empresa, cargo, cidade/UF,
segmento, áreas marcadas, experiência, qualquer texto livre, **protocolo**, id do banco, IP,
user agent detalhado, hash de e-mail ou telefone, e qualquer um desses em query string,
fragmento, `utm_*` ou link de e-mail. Links da sequência de relacionamento levam só UTM de campanha.

---

## 3. O que falta para medir de verdade

| # | Falta | Por quê | Decisão de |
|---|---|---|---|
| F1 | **Escolher a ferramenta** | Sem ela, `page_view`, `form_start` e `contact_click` não são registrados | CEO (pode envolver despesa — D4) |
| F2 | **Atualizar a Política de Privacidade** antes de ativar qualquer ferramenta | O texto atual afirma que não há ferramenta de análise; incluir também: finalidade de avaliação de candidaturas (bloqueante — `CONFORMIDADE.md` §3), operadores (Vercel, MongoDB Atlas, Resend, ferramenta escolhida), transferência internacional [VERIFICAR], retenção de 24 meses das candidaturas, uso de UTM para estatística agregada | CEO + encarregado/jurídico |
| F3 | **Banner de consentimento** | Obrigatório antes de qualquer cookie ou identificador não essencial (opção B e qualquer pixel); na opção A depende da configuração sem cookies [VERIFICAR — guia de cookies da ANPD] | CEO + jurídico |
| F4 | **Ponte de eventos** | Um único ouvinte de `dmc:analytics` que repassa à ferramenta só as propriedades da 2.1 | Front (sob pedido) |
| F5 | **UTMs até o banco** | O servidor aceita `pagina` e `utm_*` no corpo e grava em `fonte`; conferir se o formulário lê a URL e os envia | Front |
| F6 | **Relatório agregado do banco** | Contagens por programa × status × `utm_campaign`/`utm_content`, sem nenhum dado pessoal (ex.: rota admin de métricas ou agregação somente-leitura) | Backend (PENDENTE) |
| F7 | **Motivo de arquivamento codificado** | Hoje a nota é livre; códigos (`fora-do-perfil`, `perfil-juridico-pl`, `dados-de-terceiros`, `sem-retorno`, `desistencia`, `duplicada`) permitem medir qualidade sem ler texto pessoal | Backend + equipe |

**Opções de ferramenta (F1):**
- **A — analytics agregado sem cookies, primeira parte** (ex.: Vercel Web Analytics, Plausible,
  Umami ou Matomo configurado sem cookies). Conta visitas e eventos sem identificar o visitante;
  menor atrito com a LGPD; ainda exige F2 e avaliação da base legal (legítimo interesse com teste
  de balanceamento) [VERIFICAR com o encarregado]. Eventos personalizados podem depender de plano
  pago [VERIFICAR].
- **B — GA4 via Google Tag Manager com Consent Mode.** Exige F3 antes de qualquer tag, F2 com
  transferência internacional, retenção mínima, sinais do Google e personalização de anúncios desligados.
- **Recomendação:** A no primeiro ciclo. Nenhum pixel de anúncio (LinkedIn Insight Tag, Meta
  Pixel, Google Ads) antes de F2 + F3 + aprovação do CEO para mídia paga. Sem remarketing nem
  públicos semelhantes enquanto isso.

---

## 4. Funil de métricas

| Nível | Métrica | Fórmula | Fonte | Disponível hoje? |
|---|---|---|---|---|
| Alcance | Impressões, cliques no link, salvamentos | Métricas nativas agregadas das plataformas | LinkedIn/Instagram (página da empresa) | Sim, ao publicar |
| Visita | Visitas à landing | `*_page_view` | Ferramenta | Não (F1–F4) |
| Início | Taxa de início | `*_form_start` ÷ `*_page_view` | Ferramenta | Não |
| Envio | Taxa de conclusão | `*_submit_success` ÷ `*_form_start` | Ferramenta | Não |
| Envio | Candidaturas por campanha/peça | contagem por `fonte.utm_campaign` / `utm_content` | Banco | Sim (após F5; agregado via F6) |
| Contato | Cliques de contato | `partnership_contact_click` por `canal` e `posicao` | Ferramenta | Não |
| Qualificação PL | Passagem por etapa | `recebido → validacao-profissional → avaliacao-institucional → reuniao → decisao → formalizacao` | Banco (`historico`) | Sim |
| Qualificação BP | Passagem por etapa | `recebido → qualificacao → contato-comercial → reuniao → proposta-cooperacao → decisao` | Banco | Sim |
| Operação | Tempo mediano por etapa | dias entre transições | Banco | Sim (uso interno; nunca prometido ao candidato) |
| Consentimento | Taxa de opt-in | `comunicacoes.aceito` ÷ candidaturas | Banco | Sim |
| Conformidade | Candidaturas com dados de terceiros no texto livre | contagem por motivo codificado (F7) | Banco | Após F7 |
| Conformidade | Advogados no BP | arquivadas com `perfil-juridico-pl` ÷ candidaturas BP | Banco | Após F7 |

Atribuição por peça: `utm_content` (ex. `pl-p3-carrossel` × `pl-p1-manifesto`) comparado na
**qualificação**, não só no envio. Duplicadas (200) contam à parte e não somam ao funil.

---

## 5. Metas — apenas hipóteses de trabalho

> **HIPÓTESE.** Valores de partida sem base histórica nem fonte de mercado; servem para decidir
> o que olhar. Substituir pela linha de base das semanas 1–2. Não usar em material público.
> Para o Partner Lawyers **não há meta de volume**: o objetivo é qualidade e conformidade.

| Id | Programa | Hipótese | Como verificar | Se falhar |
|---|---|---|---|---|
| H1 | ambos | Taxa de início entre 5% e 15% das visitas | `form_start`/`page_view` (após F1) | Revisar herói e CTA (teste A/B de headline) |
| H2 | ambos | Conclusão entre 25% e 50% dos inícios | `submit_success`/`form_start` | Revisar atrito do formulário (sem cortar consentimento) |
| H3 | PL | ≥ 70% das candidaturas passam da validação profissional | banco | Peças atraem público fora do perfil: reforçar "inscrição regular na OAB" |
| H4 | BP | ≥ 50% das candidaturas passam da qualificação | banco | Revisar segmento e mensagem por `utm_content` |
| H5 | BP | Candidaturas de advogados ao BP ≤ 5% | banco (F7) | Reforçar exclusão jurídica e o encaminhamento ao PL |
| H6 | ambos | Carrosséis informativos (P3) qualificam melhor que o manifesto (P1) | qualificação por `utm_content` | Rever mix do plano editorial |
| H7 | ambos | Candidaturas com dados de terceiros ≤ 2% | banco (F7) | Reforçar o aviso do formulário e as peças |
| H8 | ambos | Zero comentários ou contatos tratando a campanha como oferta jurídica ou de renda | registro semanal de comentários | Pausar a peça e revisar o texto |

---

## 6. Rotina

- **Semanal (dias 7, 14, 21, 28 dos planos):** métricas nativas + contagens agregadas do banco
  por status e `utm_content`; registro de comentários sensíveis; decisão de manter/pausar peça.
- **Dia 30:** balanço por programa (qualidade, conformidade, alcance) e decisão do CEO sobre o
  ciclo seguinte e sobre F1–F7.
- Nenhum relatório exporta nome, e-mail, telefone, OAB, empresa ou texto livre. Planilhas, se
  existirem, contêm só contagens.
