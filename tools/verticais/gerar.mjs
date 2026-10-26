// =============================================================
// COMPLEXO DMC · Verticais de Negócio — GERADOR DAS PÁGINAS
//   node tools/verticais/gerar.mjs            # escreve as 10 páginas
//   node tools/verticais/gerar.mjs --check    # só confere (CI): falha se
//                                             # o HTML em disco divergir
//
// Único template (templateSegmento) + único arquivo de dados (dados.mjs)
// → complexodmc.com.br/verticais-de-negocio/index.html e
//   complexodmc.com.br/verticais-de-negocio/<slug>/index.html
// O site é estático, sem build: o HTML gerado É commitado. Editou o
// conteúdo? Rode o gerador de novo e commite os dois.
//
// Regras de publicação (prompt do CEO, seção 4):
//   - case.cliente_interno NUNCA entra no HTML; o nome do cliente só
//     aparece quando case.autorizado === true (e aí vem de
//     case.cliente_publico, nunca do campo interno).
//   - números de mercado sempre com a fonte logo abaixo.
// =============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, BASE, EIXOS, FORM, INDICE, VERTICAIS } from './dados.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(here, '..', '..', 'complexodmc.com.br');
const SAIDA = path.join(RAIZ, BASE);
const CHECK = process.argv.includes('--check');
const V = { css: '1', js: '1', navbar: 'c5', shared: '3', eixos: '4', comp: '3', hf: '3', tokens: '1', sol: '3', video: '1' };

// ---------- utilidades ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const attr = esc;
const json = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');
const pad2 = (n) => String(n).padStart(2, '0');
const sorteio = (seed, n) => Math.abs([...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % n;
const SETA = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const MAIS = '<svg class="faq-item__icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12z"/></svg>';
const FONTS = 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..600&amp;family=Newsreader:ital,opsz,wght@0,48,300;1,48,300&amp;display=swap';

const urlDe = (v) => `${SITE}/${BASE}/${v ? v.slug + '/' : ''}`;
const porSlug = Object.fromEntries(VERTICAIS.map((v) => [v.slug, v]));

// Ícones de traço único (1.5, sem preenchimento) — um por vertical, para o índice e o menu.
const ICONES = {
  'familias-empresarias-holdings': '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6M4 20h16"/>',
  'agronegocio-patrimonio-rural': '<path d="M3 19c4-2 8-2 12 0 2 1 4 1 6 0M3 14c4-2 8-2 12 0 2 1 4 1 6 0M12 4v6M9 7c0-2 1.5-3 3-3s3 1 3 3-1.5 3-3 3"/>',
  'incorporacao-construcao-imobiliario': '<path d="M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5M9 11h.01M15 11h.01M9 14h.01M15 14h.01"/>',
  'cartorios-servicos-registrais': '<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 15.5h7M9 19h4"/><circle cx="8" cy="8.5" r="1.3"/>',
  'infraestrutura-saneamento-energia': '<path d="M12 2l4 7h-8zM8 9l-5 12M16 9l5 12M5 15h14M12 9v12M3 21h18"/>',
  'industria-comercio-distribuicao': '<path d="M3 21V10l6 4v-4l6 4v-4l6 4v7zM3 21h18M7 17h2M11 17h2M15 17h2"/>',
  'saude-profissionais-liberais': '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10zM12 9v6M9 12h6"/>',
  'educacao-terceiro-setor': '<path d="M2.5 9 12 4.5 21.5 9 12 13.5zM6.5 11v4.6c1.4 1.3 3.3 2 5.5 2s4.1-.7 5.5-2V11M21.5 9v5.5"/>',
  'credito-garantias-instituicoes-financeiras': '<path d="M3 10l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 19h18M3 21h18"/>'
};
const icone = (slug) => `<svg class="vt-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES[slug] || ''}</svg>`;

// ---------- cabeçalho (head) ----------
function head({ r, titulo, descricao, url, poster, ld }) {
  return `<!DOCTYPE html>
<html lang="pt-BR" data-root="${r}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${attr(descricao)}">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="#0b0c0e">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="Complexo DMC">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${attr(titulo)}">
  <meta property="og:description" content="${attr(descricao)}">
  <meta property="og:image" content="${SITE}/${poster}">
  <meta property="og:image:width" content="1600">
  <meta property="og:image:height" content="900">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(titulo)}">
  <meta name="twitter:description" content="${attr(descricao)}">
  <meta name="twitter:image" content="${SITE}/${poster}">
${ld.map((o) => `  <script type="application/ld+json">\n${json(o)}\n  </script>`).join('\n')}

  <!-- Página gerada por tools/verticais/gerar.mjs a partir de tools/verticais/dados.mjs.
       NÃO edite este arquivo à mão: edite os dados e rode o gerador. Ordem do <head>
       conforme docs/dmc/DESIGN-SYSTEM.md §6 "Receita de migração de página interna". -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="${FONTS}">
  <link rel="stylesheet" href="${FONTS}" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="${FONTS}"></noscript>

  <link rel="preload" as="image" href="${r}${poster}" fetchpriority="high">
  <link rel="icon" type="image/png" sizes="64x64" href="${r}assets/images/favicon-dmc.png">
  <link rel="apple-touch-icon" href="${r}assets/images/apple-touch-icon.png">
  <link rel="stylesheet" href="${r}assets/css/tokens.css?v=${V.tokens}">
  <link rel="stylesheet" href="${r}pages/css/shared.css?v=${V.shared}">
  <link rel="stylesheet" href="${r}pages/css/eixos.css?v=${V.eixos}">
  <link rel="stylesheet" href="${r}assets/css/components.css?v=${V.comp}">
  <link rel="stylesheet" href="${r}pages/css/hero-filme.css?v=${V.hf}">
  <link rel="stylesheet" href="${r}assets/css/verticais.css?v=${V.css}">

  <script src="${r}assets/js/navbar.js?v=${V.navbar}" defer></script>
  <script src="${r}assets/js/solucao.js?v=${V.sol}" defer></script>
  <script src="${r}assets/js/video.js?v=${V.video}" defer></script>
  <script src="${r}assets/js/verticais.js?v=${V.js}" defer></script>
</head>`;
}

function navbar(r) {
  return `  <dmc-navbar data-over>
    <a class="dmc-skip" href="#conteudo">Pular para o conteúdo</a>
    <header class="dmc-nav dmc-nav--over">
      <div class="dmc-wrap dmc-nav__bar">
        <a class="dmc-brand" href="${r}" aria-label="Complexo DMC, página inicial">
          <img src="${r}assets/images/rino-marca.webp" alt="" width="50" height="22">
          <span aria-hidden="true">COMPLEXO <b>DMC</b></span>
        </a>
        <a class="dmc-nav__toggle" href="#rodape">Menu <i aria-hidden="true"></i></a>
      </div>
    </header>
  </dmc-navbar>`;
}

// ---------- herói com filme ----------
function heroi({ r, slug, pos, trilha, overline, titulo, lead, ctaHref, linkHref, linkTexto }) {
  const img = `assets/images/verticais/${slug}-hero.webp`;
  const imgM = `assets/images/verticais/${slug}-hero-m.webp`;
  const vid = `assets/videos/verticais/${slug}-hero`;
  return `    <section class="page-hero hf-hero vt-hero" aria-labelledby="hero-titulo" style="--hf-pos: ${pos}">
      <div class="hf-hero__media" aria-hidden="true">
        <picture>
          <source media="(max-width: 767px)" srcset="${r}${imgM}">
          <img src="${r}${img}" alt="" width="1600" height="900" fetchpriority="high" decoding="async">
        </picture>
        <video class="hf-hero__video" autoplay muted loop playsinline preload="metadata" disablepictureinpicture disableremoteplayback tabindex="-1">
          <source src="${r}${vid}.webm" type="video/webm" media="(prefers-reduced-motion: no-preference) and (min-width: 768px)">
          <source src="${r}${vid}.mp4" type="video/mp4" media="(prefers-reduced-motion: no-preference) and (min-width: 768px)">
        </video>
      </div>
      <div class="hf-hero__wrap">
        <div class="hf-hero__content">
          <nav class="hf-trilha" aria-label="Trilha de navegação">
            <ol>
${trilha.map(([nome, href]) => href ? `              <li><a href="${href}">${esc(nome)}</a></li>` : `              <li><span aria-current="page">${esc(nome)}</span></li>`).join('\n')}
            </ol>
          </nav>
          ${overline ? `<p class="page-section__overline vt-hero__overline">${esc(overline)}</p>` : ''}
          <h1 class="page-hero__title hf-hero__title" id="hero-titulo">${titulo}</h1>
          <p class="page-hero__subtitle hf-hero__lead">${esc(lead)}</p>
          <div class="page-hero__actions">
            <a class="dmc-btn dmc-btn--primary" href="${ctaHref}">Fale com um especialista ${SETA}</a>
            <a class="dmc-btn dmc-btn--link" href="${linkHref}">${esc(linkTexto)}</a>
          </div>
        </div>
      </div>
    </section>`;
}

const secHead = (id, overline, titulo, descricao) => `        <div class="page-section__header">
          <p class="page-section__overline">${esc(overline)}</p>
          <h2 class="page-section__title" id="${id}-titulo">${titulo}</h2>
${descricao ? `          <p class="page-section__description">${esc(descricao)}</p>\n` : ''}        </div>`;

// Título com um <em> na última palavra (padrão da casa: H2 com <em>).
function comEm(t) {
  const partes = t.split(' ');
  if (partes.length < 2) return esc(t);
  const ult = partes.pop();
  return `${esc(partes.join(' '))} <em>${esc(ult)}</em>`;
}

// ---------- formulário ----------
function formulario({ r, slugAtual, emIndice }) {
  const opt = (lista, sel) => lista.map(([v, t]) => `                  <option value="${v}"${v === sel ? ' selected' : ''}>${esc(t)}</option>`).join('\n');
  const segs = VERTICAIS.map((v) => `                  <option value="${v.slug}" data-eixo="${v.areas[0]}" data-perfil="${v.perfil || 'outro'}"${v.slug === slugAtual ? ' selected' : ''}>${esc(v.curto)}</option>`).join('\n');
  const origem = emIndice ? `${BASE}/` : `${BASE}/${slugAtual}/`;
  return `    <section class="page-section dmc-on-paper vt-contato" id="contato" aria-labelledby="contato-titulo">
      <div class="page-section__container vt-contato__grid">
        <div class="vt-contato__intro">
          <p class="page-section__overline">Contato</p>
          <h2 class="page-section__title" id="contato-titulo">Fale com um <em>especialista</em></h2>
          <p class="page-section__description">Descreva o evento que motivou o contato e o porte do patrimônio envolvido. A conversa inicial parte do segmento e define o diagnóstico.</p>
          <ul class="vt-contato__canais">
            <li><span>E-mail</span><a href="mailto:administrativo@complexodmc.com.br">administrativo@complexodmc.com.br</a></li>
            <li><span>Telefone</span><a href="tel:+5511915267749">+55 (11) 91526-7749</a></li>
            <li><span>WhatsApp</span><a href="https://wa.me/5511915267749?text=Ol%C3%A1%21%20Vim%20da%20p%C3%A1gina%20de%20Verticais%20de%20Neg%C3%B3cio%20e%20gostaria%20de%20falar%20com%20um%20especialista." target="_blank" rel="noopener">Conversar pelo WhatsApp</a></li>
          </ul>
        </div>

        <form id="verticalForm" class="vt-form dmc-form" action="/api/contato" method="post" data-origem="${origem}" aria-describedby="formMessage" novalidate>
          <div class="form-row">
            <div class="form-field">
              <label for="vf-nome">Nome</label>
              <input type="text" id="vf-nome" name="nome" autocomplete="name" required minlength="2" maxlength="120">
            </div>
            <div class="form-field">
              <label for="vf-empresa">Empresa ou família <span class="form-opcional">(opcional)</span></label>
              <input type="text" id="vf-empresa" name="empresa" autocomplete="organization" maxlength="120">
            </div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label for="vf-email">E-mail</label>
              <input type="email" id="vf-email" name="email" autocomplete="email" required maxlength="254">
            </div>
            <div class="form-field">
              <label for="vf-telefone">Telefone / WhatsApp</label>
              <input type="tel" id="vf-telefone" name="telefone" autocomplete="tel" inputmode="tel" required maxlength="30" placeholder="(11) 99999-9999">
            </div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label for="vf-segmento">Segmento</label>
              <select id="vf-segmento" name="segmento" required>
                  <option value=""${emIndice ? ' selected' : ''}>Selecione</option>
${segs}
                  <option value="outro" data-eixo="nao-sei" data-perfil="outro">Outro</option>
              </select>
            </div>
            <div class="form-field">
              <label for="vf-faturamento">Faturamento anual</label>
              <select id="vf-faturamento" name="faturamento" required>
                  <option value="">Selecione</option>
${opt(FORM.faturamento)}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label for="vf-patrimonio">Patrimônio envolvido <span class="form-opcional">(opcional)</span></label>
              <select id="vf-patrimonio" name="patrimonio">
                  <option value="">Selecione</option>
${opt(FORM.patrimonio)}
              </select>
            </div>
            <div class="form-field">
              <label for="vf-motivo">O que motivou o contato agora?</label>
              <select id="vf-motivo" name="motivo" required>
                  <option value="">Selecione</option>
${opt(FORM.motivo)}
              </select>
            </div>
          </div>
          <div class="form-field">
            <label for="vf-mensagem">Mensagem <span class="form-opcional">(opcional)</span></label>
            <textarea id="vf-mensagem" name="mensagem" rows="4" maxlength="4000"></textarea>
          </div>

          <!-- Isca anti-robô: fora da tela; quem preenche é descartado pelo servidor. -->
          <div class="form-hp" aria-hidden="true">
            <label for="vf-website">Não preencha este campo</label>
            <input type="text" id="vf-website" name="website" tabindex="-1" autocomplete="off">
          </div>

          <div class="form-consent">
            <input type="checkbox" id="vf-consentimento" name="consentimento" value="true" required>
            <label for="vf-consentimento">Autorizo o Complexo DMC a usar estes dados para retornar meu contato, nos termos da LGPD (Lei 13.709/2018) e da <a href="${r}pages/politica-de-privacidade.html">Política de Privacidade</a>.</label>
          </div>

          <input type="hidden" name="origem" value="${origem}">
          <p id="formMessage" class="form-message" role="status" aria-live="polite"></p>
          <button type="submit" class="dmc-btn dmc-btn--primary">Enviar mensagem ${SETA}</button>
        </form>
      </div>
    </section>`;
}

// ---------- vídeo do tema ----------
function video({ titulo, texto }) {
  return `    <section class="page-section" id="video" aria-labelledby="video-titulo">
      <div class="page-section__container reveal">
        <div class="page-section__header">
          <p class="page-section__overline">Em vídeo</p>
          <h2 class="page-section__title" id="video-titulo">${comEm(titulo)}</h2>
          <p class="page-section__description">${esc(texto)}</p>
        </div>
        <div class="page-video__frame" data-video="" data-video-title="${attr(titulo)}">
          <div class="page-video__empty">
            <span class="page-video__play" aria-hidden="true">${PLAY}</span>
            <p class="page-video__empty-title">Espaço reservado para o vídeo</p>
            <p class="page-video__empty-text">${esc(titulo)}</p>
          </div>
        </div>
      </div>
    </section>`;
}

// ---------- rodapé (o da home + coluna Segmentos) ----------
function rodape(r, atual) {
  const eixo = (k) => { const e = EIXOS[k]; return `            <li class="np-pillar-${e.slug}"><a href="${r}${e.href}"><span class="dmc-footer__num">${k}</span>${esc(e.curto)}</a></li>`; };
  const segs = VERTICAIS.map((v) => `            <li><a href="${r}${BASE}/${v.slug}/"${v.slug === atual ? ' aria-current="page"' : ''}><span class="dmc-footer__num">${pad2(v.numero)}</span>${esc(v.curto)}</a></li>`).join('\n');
  return `  <footer class="dmc-footer" id="rodape">
    <div class="dmc-wrap">
      <div class="dmc-footer__grid vt-footer__grid">
        <div class="dmc-footer__brand">
          <a class="dmc-brand" href="${r}" aria-label="Complexo DMC, página inicial">
            <img src="${r}assets/images/rino-marca.webp" alt="" width="50" height="22" loading="lazy">
            <span aria-hidden="true">COMPLEXO <b>DMC</b></span>
          </a>
          <p>Consultoria em negócios para decisões que envolvem empresa, patrimônio e família.</p>
          <p>Atendimento a empresas, famílias empresárias, incorporadoras e investidores, no Brasil e no exterior.</p>
        </div>
        <nav aria-labelledby="rodape-eixos">
          <p class="dmc-footer__title" id="rodape-eixos">Eixos</p>
          <ul class="dmc-footer__list">
${Object.keys(EIXOS).map(eixo).join('\n')}
          </ul>
        </nav>
        <nav aria-labelledby="rodape-segmentos">
          <p class="dmc-footer__title" id="rodape-segmentos">Segmentos</p>
          <ul class="dmc-footer__list">
            <li><a href="${r}${BASE}/"${atual ? '' : ' aria-current="page"'}>Verticais de Negócio</a></li>
${segs}
          </ul>
        </nav>
        <nav aria-labelledby="rodape-casa">
          <p class="dmc-footer__title" id="rodape-casa">Sobre</p>
          <ul class="dmc-footer__list">
            <li><a href="${r}pages/sobre.html">Sobre o Complexo DMC</a></li>
            <li><a href="${r}#features">Soluções</a></li>
            <li><a href="${r}pages/tecnologia.html">Tecnologia</a></li>
            <li><a href="${r}parcerias/">Parcerias</a></li>
            <li><a href="${r}pages/por-que-urgente.html">Por que planejar a sucessão em vida</a></li>
            <li><a href="${r}plataforma-ead/login.html">DMC Business School</a></li>
            <li><a href="https://adtech-app.complexodmc.com.br" rel="noopener">ADTECH</a></li>
          </ul>
        </nav>
        <div>
          <p class="dmc-footer__title">Contato</p>
          <ul class="dmc-footer__list">
            <li><a href="mailto:administrativo@complexodmc.com.br">administrativo@complexodmc.com.br</a></li>
            <li><a href="tel:+5511915267749">+55 (11) 91526-7749</a></li>
            <li><a href="#contato">Formulário de contato</a></li>
            <li><span>Rua Riachuelo, 231<br>São Paulo, SP — Brasil</span></li>
          </ul>
        </div>
      </div>
      <div class="dmc-footer__legal">
        <p>&copy; 2026 Complexo DMC. Todos os direitos reservados.</p>
        <p>Conteúdo informativo. A atuação em atos privativos da advocacia, da contabilidade e da auditoria é realizada por profissionais e sociedades parceiras habilitadas; os atos notariais e registrais, por cartórios conveniados.</p>
        <p><a href="${r}pages/politica-de-privacidade.html">Política de Privacidade</a></p>
      </div>
    </div>
  </footer>

  <a href="https://wa.me/5511915267749?text=Ol%C3%A1%21%20Vim%20da%20p%C3%A1gina%20de%20Verticais%20de%20Neg%C3%B3cio%20e%20gostaria%20de%20falar%20com%20um%20especialista." target="_blank" rel="noopener" class="whatsapp-float" aria-label="Conversar pelo WhatsApp">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  </a>
</body>
</html>
`;
}

// ---------- chips das áreas ----------
const chipsAreas = (r, areas, { link = false } = {}) => `<ul class="vt-areas" aria-label="Áreas de atuação acionadas">${areas.map((k) => {
  const e = EIXOS[k];
  const dentro = `<span class="vt-areas__num">${k}</span>${esc(e.curto)}`;
  return `<li class="np-pillar-${e.slug}">${link ? `<a href="${r}${e.href}">${dentro}</a>` : dentro}</li>`;
}).join('')}</ul>`;

// =============================================================
// TEMPLATE · PÁGINA DE SEGMENTO
// =============================================================
function templateSegmento(v) {
  const r = '../../';
  const url = urlDe(v);
  const titulo = `${v.nome} | Complexo DMC`;
  const poster = `assets/images/verticais/${v.slug}-hero.webp`;
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Verticais de Negócio', item: urlDe() },
        { '@type': 'ListItem', position: 3, name: v.nome, item: url }
      ]
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: v.faq.map((f) => ({ '@type': 'Question', name: f.p, acceptedAnswer: { '@type': 'Answer', text: f.r } }))
    },
    {
      '@context': 'https://schema.org', '@type': 'WebPage', '@id': url, url, name: titulo, description: v.seo_description,
      inLanguage: 'pt-BR', isPartOf: { '@type': 'WebSite', url: `${SITE}/`, name: 'Complexo DMC' },
      about: { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Complexo DMC' },
      primaryImageOfPage: { '@type': 'ImageObject', url: `${SITE}/${poster}` }
    }
  ];
  const outras = VERTICAIS.filter((o) => o.slug !== v.slug);
  const emIndice = false;
  const caseLinha = v.case.autorizado && v.case.cliente_publico
    ? `\n          <p class="vt-case__cliente">Cliente: ${esc(v.case.cliente_publico)}</p>` : '';
  const numeros = v.mercado.numeros || [];

  return `${head({ r, titulo, descricao: v.seo_description, url, poster, ld })}
<body class="np-eixo vt-page" data-vertical="${v.slug}">

${navbar(r)}

  <main id="conteudo">

${heroi({
    r, slug: v.slug, pos: v.hero_pos || '60% 50%',
    trilha: [['Início', r], ['Verticais de Negócio', `${r}${BASE}/`], [v.nome, null]],
    overline: `Vertical ${pad2(v.numero)}`,
    titulo: comEm(v.nome),
    lead: v.hero_subtitulo,
    ctaHref: '#contato', linkHref: '#atuacao', linkTexto: 'Como atuamos'
  })}

    <!-- ============================== DORES ============================== -->
    <section class="vt-dores" aria-label="Desafios do segmento">
      <div class="page-section__container">
        <ol class="vt-dores__lista">
${v.dores.map((d) => `          <li><span class="vt-dores__num" aria-hidden="true"></span><p>${esc(d)}</p></li>`).join('\n')}
        </ol>
      </div>
    </section>

    <!-- ============================== BLOCO 1 ============================== -->
    <section class="page-section vt-texto" id="contexto" aria-labelledby="contexto-titulo">
      <div class="page-section__container vt-texto__grid reveal">
        <div class="vt-texto__cab">
          <p class="page-section__overline">${esc(v.bloco1.rotulo)}</p>
          <h2 class="page-section__title" id="contexto-titulo">${comEm(v.bloco1.titulo)}</h2>
        </div>
        <div class="vt-texto__corpo">
${v.bloco1.paragrafos.map((p) => `          <p>${esc(p)}</p>`).join('\n')}
        </div>
      </div>
    </section>

    <!-- ============================== BLOCO 2 ============================== -->
    <section class="page-section vt-texto vt-alt" id="abordagem" aria-labelledby="abordagem-titulo">
      <div class="page-section__container vt-texto__grid reveal">
        <div class="vt-texto__cab">
          <p class="page-section__overline">${esc(v.bloco2.rotulo)}</p>
          <h2 class="page-section__title" id="abordagem-titulo">${comEm(v.bloco2.titulo)}</h2>
        </div>
        <div class="vt-texto__corpo">
${v.bloco2.paragrafos.map((p) => `          <p>${esc(p)}</p>`).join('\n')}
        </div>
      </div>
    </section>

    <!-- ============================== PÚBLICOS ============================== -->
    <section class="page-section" id="publicos" aria-labelledby="publicos-titulo">
      <div class="page-section__container reveal">
${secHead('publicos', 'Públicos atendidos', comEm(v.publicos_titulo))}
        <div class="benefit-grid vt-publicos">
${v.publicos.map((p) => `          <article class="benefit-card"><h3 class="benefit-card__title">${esc(p)}</h3></article>`).join('\n')}
        </div>
      </div>
    </section>

    <!-- ============================== GATILHOS ============================== -->
    <section class="page-section vt-alt" id="gatilhos" aria-labelledby="gatilhos-titulo">
      <div class="page-section__container reveal">
${secHead('gatilhos', 'Quando procurar a DMC', 'Os eventos que costumam abrir a <em>conversa</em>')}
        <ol class="vt-gatilhos">
${v.gatilhos.map((g, i) => `          <li><span class="vt-gatilhos__num" aria-hidden="true">${pad2(i + 1)}</span><p>${esc(g)}</p></li>`).join('\n')}
        </ol>
      </div>
    </section>

    <!-- ============================== COMO ATUAMOS ============================== -->
    <section class="page-section" id="atuacao" aria-labelledby="atuacao-titulo">
      <div class="page-section__container reveal">
${secHead('atuacao', 'Como atuamos', 'As áreas da casa acionadas neste <em>segmento</em>', 'Cada frente é conduzida pela área correspondente, sob uma única coordenação.')}
        <div class="sol-related vt-atuacao">
${v.atuacao.map((a) => {
    const e = EIXOS[a.area];
    return `          <a class="np-card vt-card np-pillar-${e.slug}" href="${r}${e.href}">
            <span class="vt-card__badge"><span class="vt-card__num">${a.area}</span>${esc(e.curto)}</span>
            <h3 class="np-ct">${esc(a.titulo)}</h3>
            <ul class="vt-card__lista">
${a.itens.map((i) => `              <li>${esc(i)}</li>`).join('\n')}
            </ul>
            <span class="np-link">Conhecer o eixo ${SETA}</span>
          </a>`;
  }).join('\n')}
        </div>
      </div>
    </section>

    <!-- ============================== DESTAQUE DE ATUAÇÃO ============================== -->
    <section class="page-section dmc-on-paper vt-case" id="destaque" aria-labelledby="destaque-titulo">
      <div class="page-section__container reveal">
        <article class="vt-case__card">
          <p class="page-section__overline">${esc(v.case.rotulo)}</p>
          <h2 class="page-section__title" id="destaque-titulo">${comEm(v.case.titulo)}</h2>
          <p class="vt-case__texto">${esc(v.case.texto_publico)}</p>${caseLinha}
          <p class="vt-case__nota">Descrição anonimizada. Dados de clientes, processos e valores não são divulgados.</p>
        </article>
      </div>
    </section>

${v.mercado && v.mercado.texto ? `    <!-- ============================== CONTEXTO DE MERCADO ============================== -->
    <section class="page-section vt-mercado" id="mercado" aria-labelledby="mercado-titulo">
      <div class="page-section__container reveal">
${secHead('mercado', 'Contexto de mercado', 'O que muda no <em>cenário</em>')}
        <div class="vt-mercado__grid${numeros.length ? '' : ' vt-mercado__grid--so-texto'}">
          <p class="vt-mercado__texto">${esc(v.mercado.texto)}</p>
${numeros.length ? `          <dl class="vt-numeros">
${numeros.map((n) => `            <div class="vt-numeros__item"><dt>${esc(n.rotulo)}</dt><dd>${esc(n.valor)}</dd></div>`).join('\n')}
          </dl>` : ''}
        </div>
${v.mercado.fonte ? `        <p class="vt-fonte">Fonte: ${esc(v.mercado.fonte)}</p>` : ''}
      </div>
    </section>
` : ''}
    <!-- ============================== PERGUNTAS FREQUENTES ============================== -->
    <section class="page-section vt-alt" id="perguntas" aria-labelledby="perguntas-titulo">
      <div class="page-section__container reveal">
${secHead('perguntas', 'Dúvidas', 'Perguntas <em>frequentes</em>')}
        <div class="faq-list">
${v.faq.map((f) => `          <details class="faq-item" name="faq">
            <summary class="faq-item__question">${esc(f.p)} ${MAIS}</summary>
            <div class="faq-item__answer"><div class="faq-item__answer-inner">${esc(f.r)}</div></div>
          </details>`).join('\n')}
        </div>
      </div>
    </section>

${video({ titulo: `${v.curto} em vídeo`, texto: v.video_texto })}

${formulario({ r, slugAtual: v.slug, emIndice })}

    <!-- ============================== OUTRAS VERTICAIS ============================== -->
    <section class="page-section vt-outras" id="outras" aria-labelledby="outras-titulo">
      <div class="page-section__container reveal">
${secHead('outras', 'Outras verticais', 'Os demais <em>segmentos</em>')}
        <ol class="vt-outras__grid">
${outras.map((o) => `          <li><a href="${r}${BASE}/${o.slug}/"><span class="vt-outras__num">${pad2(o.numero)}</span><span class="vt-outras__nome">${esc(o.curto)}</span>${SETA}</a></li>`).join('\n')}
        </ol>
        <p class="vt-outras__todas"><a class="dmc-btn dmc-btn--secondary" href="${r}${BASE}/">Ver todas as verticais ${SETA}</a></p>
      </div>
    </section>

  </main>

${rodape(r, v.slug)}`;
}

// =============================================================
// TEMPLATE · PÁGINA-ÍNDICE
// =============================================================
function templateIndice() {
  const r = '../';
  const url = urlDe();
  const titulo = `${INDICE.h1} | Complexo DMC`;
  const poster = 'assets/images/verticais/indice-hero.webp';
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Verticais de Negócio', item: url }
      ]
    },
    {
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'Verticais de Negócio do Complexo DMC',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: VERTICAIS.map((v) => ({ '@type': 'ListItem', position: v.numero, name: v.nome, url: urlDe(v) }))
    },
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': url, url, name: titulo, description: INDICE.seo_description,
      inLanguage: 'pt-BR', isPartOf: { '@type': 'WebSite', url: `${SITE}/`, name: 'Complexo DMC' },
      about: { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Complexo DMC' }
    }
  ];

  return `${head({ r, titulo, descricao: INDICE.seo_description, url, poster, ld })}
<body class="np-eixo vt-page vt-page--indice">

${navbar(r)}

  <main id="conteudo">

${heroi({
    r, slug: 'indice', pos: '55% 50%',
    trilha: [['Início', r], ['Verticais de Negócio', null]],
    overline: 'Segmentos',
    titulo: 'Verticais de <em>Negócio</em>',
    lead: INDICE.subtitulo,
    ctaHref: '#contato', linkHref: '#verticais', linkTexto: 'Ver os nove segmentos'
  })}

    <!-- ============================== INTRODUÇÃO ============================== -->
    <section class="page-section vt-texto" id="introducao" aria-labelledby="introducao-titulo">
      <div class="page-section__container vt-texto__grid reveal">
        <div class="vt-texto__cab">
          <p class="page-section__overline">Como nos organizamos</p>
          <h2 class="page-section__title" id="introducao-titulo">${comEm(INDICE.introducao_titulo)}</h2>
        </div>
        <div class="vt-texto__corpo">
          <p>${esc(INDICE.introducao)}</p>
        </div>
      </div>
    </section>

    <!-- ============================== GRADE DAS 9 VERTICAIS ============================== -->
    <section class="page-section vt-alt" id="verticais" aria-labelledby="verticais-titulo">
      <div class="page-section__container reveal">
${secHead('verticais', 'Nove verticais', 'Um segmento, uma <em>equipe</em>', 'Escolha o seu segmento para ver os públicos atendidos, os eventos que abrem a conversa e como as áreas da casa atuam juntas.')}
        <ol class="vt-grade" aria-label="As nove verticais de negócio">
${VERTICAIS.map((v) => `          <li class="vt-grade__item" style="--i: ${v.numero - 1}">
            <a class="vt-grade__card" href="${r}${BASE}/${v.slug}/" aria-labelledby="vt-card-${v.numero}">
              <span class="vt-grade__media" aria-hidden="true">
                <img src="${r}assets/images/verticais/${v.slug}-hero-m.webp" alt="" width="960" height="540" loading="lazy" decoding="async">
              </span>
              <span class="vt-grade__corpo">
                <span class="vt-grade__num" aria-hidden="true">${v.numero}</span>
                ${icone(v.slug)}
                <span class="vt-grade__titulo" id="vt-card-${v.numero}">${esc(v.card_titulo)}</span>
                <span class="vt-grade__texto">${esc(v.card_descricao)}</span>
                <span class="vt-grade__tags">${[...v.areas].sort().map((k) => `<span class="np-pillar-${EIXOS[k].slug}">${k}</span>`).join('')}</span>
                <span class="np-link">Saiba mais ${SETA}</span>
              </span>
            </a>
          </li>`).join('\n')}
        </ol>
      </div>
    </section>

    <!-- ============================== ÁREAS × SEGMENTOS ============================== -->
    <section class="page-section" id="areas" aria-labelledby="areas-titulo">
      <div class="page-section__container reveal">
${secHead('areas', 'Áreas × segmentos', 'Seis áreas, nove <em>combinações</em>', INDICE.areas_texto)}
        <div class="vt-areas-wrap">
          ${chipsAreas(r, Object.keys(EIXOS), { link: true })}
        </div>
        <div class="vt-matriz" role="table" aria-label="Áreas de atuação por vertical">
          <div class="vt-matriz__linha vt-matriz__cab" role="row">
            <span class="vt-matriz__nome" role="columnheader">Vertical</span>
${Object.keys(EIXOS).map((k) => `            <span class="vt-matriz__cel np-pillar-${EIXOS[k].slug}" role="columnheader"><abbr title="${attr(EIXOS[k].nome)}">${k}</abbr></span>`).join('\n')}
          </div>
${VERTICAIS.map((v) => `          <div class="vt-matriz__linha" role="row">
            <a class="vt-matriz__nome" role="rowheader" href="${r}${BASE}/${v.slug}/"><span class="vt-matriz__num">${pad2(v.numero)}</span>${esc(v.curto)}</a>
${Object.keys(EIXOS).map((k) => `            <span class="vt-matriz__cel np-pillar-${EIXOS[k].slug}" role="cell">${v.areas.includes(k) ? `<i aria-hidden="true"></i><span class="sr-only">${k} atua</span>` : `<span class="sr-only">—</span>`}</span>`).join('\n')}
          </div>`).join('\n')}
        </div>
      </div>
    </section>

${video({ titulo: INDICE.video_titulo, texto: INDICE.video_texto })}

${formulario({ r, slugAtual: '', emIndice: true })}

  </main>

${rodape(r, null)}`;
}

// ---------- execução ----------
const alvos = [
  { arquivo: path.join(SAIDA, 'index.html'), html: templateIndice() },
  ...VERTICAIS.map((v) => ({ arquivo: path.join(SAIDA, v.slug, 'index.html'), html: templateSegmento(v) }))
];

// Guarda: nenhum nome interno de cliente pode sair no HTML.
for (const v of VERTICAIS) {
  const interno = (v.case.cliente_interno || '').trim();
  if (!interno) continue;
  for (const a of alvos) {
    if (a.html.includes(interno)) {
      console.error(`ERRO: "${interno}" (cliente_interno da vertical ${v.numero}) apareceu em ${a.arquivo}.`);
      process.exit(2);
    }
  }
}

let divergentes = 0;
for (const a of alvos) {
  const atual = fs.existsSync(a.arquivo) ? fs.readFileSync(a.arquivo, 'utf8') : null;
  if (CHECK) {
    if (atual !== a.html) { divergentes += 1; console.error(`DIVERGE: ${path.relative(RAIZ, a.arquivo)}`); }
    continue;
  }
  fs.mkdirSync(path.dirname(a.arquivo), { recursive: true });
  fs.writeFileSync(a.arquivo, a.html);
  console.log(`${atual === a.html ? 'igual   ' : 'escrito '} ${path.relative(RAIZ, a.arquivo)} (${(a.html.length / 1024).toFixed(1)} KB)`);
}
if (CHECK) {
  if (divergentes) { console.error(`${divergentes} arquivo(s) divergem do gerador. Rode: node tools/verticais/gerar.mjs`); process.exit(1); }
  console.log(`ok: ${alvos.length} páginas conferem com o gerador.`);
}
