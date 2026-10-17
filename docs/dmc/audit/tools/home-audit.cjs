// Auditoria da homepage: estrutura, hero, CTAs, formulário, busca, sorteio.
// Uso: node docs/dmc/audit/tools/home-audit.js <pasta-de-saida>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || 'docs/dmc/audit/2026-10-17/homepage';
const URL = 'http://127.0.0.1:8080/complexodmc.com.br/index.html';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const result = { url: URL, when: new Date().toISOString() };
  const consoleErrors = [];
  const failedRequests = [];

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url() + ' :: ' + (r.failure() || {}).errorText));
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(r.url() + ' :: HTTP ' + r.status()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  result.sections = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('body > section, body > footer, main > section'));
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(), id: el.id || null, class: el.className || null,
        top: Math.round(r.top + window.scrollY), height: Math.round(r.height),
        display: cs.display, hidden: cs.display === 'none',
      };
    });
  });

  result.hero = await page.evaluate(() => {
    const v = document.querySelector('.hero video');
    const h1 = document.querySelector('.hero h1');
    return {
      videoSrc: v && v.currentSrc, poster: v && v.poster, paused: v && v.paused,
      readyState: v && v.readyState, currentTime: v && v.currentTime, duration: v && v.duration,
      videoWidth: v && v.videoWidth, videoHeight: v && v.videoHeight,
      badge: (document.querySelector('.hero-badge') || {}).textContent,
      h1: h1 && h1.textContent.replace(/\s+/g, ' ').trim(),
      sub: (document.querySelector('.hero-subtitle') || {}).textContent?.replace(/\s+/g, ' ').trim(),
      cta: Array.from(document.querySelectorAll('.hero-cta a')).map((a) => ({ text: a.textContent.trim(), href: a.href })),
    };
  });

  result.stats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.stats-bar .stat-item:not([aria-hidden])')).map((s) =>
      s.querySelector('.stat-number').textContent + ' ' + s.querySelector('.stat-label').textContent)
  );

  result.conheca = await page.evaluate(() => {
    const v = document.getElementById('rinoSrc');
    const c = document.getElementById('rinoCanvas');
    return {
      videoSrc: v && v.currentSrc, paused: v && v.paused, canvasW: c && c.width, canvasH: c && c.height,
      orbit: Array.from(document.querySelectorAll('.orbit-card')).map((a) => ({ front: a.querySelector('.orbit-front').textContent, back: a.querySelector('.orbit-back').textContent, href: a.getAttribute('href') })),
      desc: document.querySelector('.conheca-description')?.textContent.replace(/\s+/g, ' ').trim(),
    };
  });

  result.eixos = await page.evaluate(() => {
    const abas = Array.from(document.querySelectorAll('.np-axes a')).map((a) => ({
      eixo: a.dataset.eixo, name: a.querySelector('.np-axis-name').textContent, n: a.querySelector('.np-axis-n').textContent,
      selected: a.getAttribute('aria-selected'),
    }));
    const flags = Array.from(document.querySelectorAll('.np-flag')).map((f) => ({
      id: f.id, hidden: f.hidden, fixo: f.dataset.npSpot || null,
      title: f.querySelector('.np-flag-title').textContent, cta: f.querySelector('.np-btn').textContent.trim(),
      ctaHref: f.querySelector('.np-btn').getAttribute('href'),
      spot: f.querySelector('.np-spot-name').textContent, spotHref: f.querySelector('.np-spot-link').getAttribute('href'),
    }));
    const cards = Array.from(document.querySelectorAll('.np-card')).map((c) => ({
      eixo: c.dataset.eixo, title: c.querySelector('.np-ct').textContent, href: c.getAttribute('href'), hidden: c.hidden,
    }));
    const cases = Array.from(document.querySelectorAll('.np-case')).map((c) => ({ q: c.querySelector('.np-case-q').textContent, href: c.getAttribute('href') }));
    return { abas, flags, cards, cases, visibleCards: cards.filter((c) => !c.hidden).length, npTags: document.querySelectorAll('.np-tag').length, npTagChips: document.querySelectorAll('.np-tags li').length };
  });

  // Sorteio do eixo inicial e do destaque: recarrega 6x
  const sorteios = [];
  for (let i = 0; i < 6; i++) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    sorteios.push(await page.evaluate(() => {
      const f = Array.from(document.querySelectorAll('.np-flag')).find((x) => !x.hidden);
      return f ? f.id + ' / ' + f.querySelector('.np-spot-name').textContent : null;
    }));
  }
  result.sorteios = sorteios;

  // Busca np-ask
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const busca = {};
  for (const q of ['holding', 'inventário', 'contabilidade', 'xyzabc']) {
    await page.fill('#npAsk', q);
    await page.waitForTimeout(400);
    busca[q] = await page.evaluate(() => ({
      status: document.getElementById('npAskStatus').textContent,
      visibleCards: Array.from(document.querySelectorAll('.np-card')).filter((c) => !c.hidden).length,
      emptyShown: !document.querySelector('.np-ask-empty').hidden,
      waHref: document.querySelector('.np-ask-wa').getAttribute('href'),
    }));
  }
  result.busca = busca;

  // Ad-tech CTAs e links "#"
  result.deadLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href="#"]')).map((a) => ({ text: a.textContent.trim(), class: a.className, section: a.closest('section')?.id }))
  );

  // Formulário de contato
  await page.fill('#contactForm [name=nome]', 'Teste Auditoria');
  await page.fill('#contactForm [name=email]', 'teste@exemplo.com');
  await page.fill('#contactForm [name=telefone]', '11999999999');
  await page.fill('#contactForm [name=mensagem]', 'Mensagem de teste da auditoria.');
  const reqsBefore = [];
  page.on('request', (r) => reqsBefore.push(r.method() + ' ' + r.url()));
  await page.click('#contactForm .submit-btn');
  await page.waitForTimeout(2200);
  result.contactForm = await page.evaluate(() => ({
    action: document.getElementById('contactForm').getAttribute('action'),
    formMessageExists: !!document.getElementById('formMessage'),
    nomeAfter: document.querySelector('#contactForm [name=nome]').value,
    btnText: document.querySelector('#contactForm .submit-btn').textContent.trim(),
    urlAfter: location.href,
  }));
  result.contactForm.requestsDuringSubmit = reqsBefore;

  // Contagens de estilo (cards/caixas/etiquetas/gradientes)
  result.styleCounts = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('body *'));
    let gradients = 0, radiusBoxes = 0;
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.backgroundImage.includes('gradient')) gradients++;
      if (parseFloat(cs.borderRadius) > 8 && cs.borderStyle !== 'none' && cs.borderWidth !== '0px') radiusBoxes++;
    }
    return {
      gradientBackgrounds: gradients, borderedRoundedBoxes: radiusBoxes,
      gradientTextSpans: document.querySelectorAll('.gradient-text').length,
      cardsAll: document.querySelectorAll('.np-card, .treinamento-card, .adtech-feature-card, .stat-item, .orbit-card').length,
      tagsAll: document.querySelectorAll('.np-tag, .np-tags li, .np-case-e, .adtech-tag, .adtech-float-badge, .hero-badge, .np-eyebrow, .section-subtitle').length,
      fonts: Array.from(new Set(all.map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '')))).slice(0, 8),
    };
  });

  // Screenshots desktop
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'home-desktop-hero.png') });
  for (const id of ['conheca', 'features', 'treinamentos', 'results', 'contact']) {
    const el = await page.$('#' + id);
    if (el) { await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(900); await el.screenshot({ path: path.join(OUT, `home-desktop-${id}.png`) }).catch(() => {}); }
  }
  const footer = await page.$('footer.footer-section');
  if (footer) { await footer.scrollIntoViewIfNeeded(); await page.waitForTimeout(600); await footer.screenshot({ path: path.join(OUT, 'home-desktop-footer-form.png') }); }
  await page.screenshot({ path: path.join(OUT, 'home-desktop-full.png'), fullPage: true });
  result.pageHeightDesktop = await page.evaluate(() => document.documentElement.scrollHeight);

  // Mobile
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  await mob.goto(URL, { waitUntil: 'networkidle' });
  await mob.waitForTimeout(2500);
  await mob.screenshot({ path: path.join(OUT, 'home-mobile-hero.png') });
  await mob.screenshot({ path: path.join(OUT, 'home-mobile-full.png'), fullPage: true });
  result.mobile = await mob.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    heroVideoPaused: document.querySelector('.hero video')?.paused,
  }));

  result.consoleErrors = consoleErrors;
  result.failedRequests = failedRequests;
  fs.writeFileSync(path.join(OUT, 'home-audit.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
