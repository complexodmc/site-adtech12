// Capturas da referência planning.com.br: menu, áreas, interna, rodapé, mobile. Somente leitura.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/referencia-planning';
fs.mkdirSync(OUT, { recursive: true });
const HOME = 'https://planning.com.br/';
const INNER = 'https://planning.com.br/areas-de-atuacao/estruturacoes-corporativas/';

const dismissCookie = async page => {
  try { await page.click('.cc-btn, .cc-dismiss', { timeout: 2000 }); } catch {}
  try { await page.evaluate(() => { document.querySelectorAll('.cc-window, .bricks--floating--button, #rd-popup, .rdstation-popup').forEach(e => e.remove()); }); } catch {}
};

const heroInfo = async page => page.evaluate(() => {
  const cs = el => getComputedStyle(el);
  const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const v = document.querySelector('video');
  const h1 = document.querySelector('h1');
  const chain = [];
  let el = v;
  for (let i = 0; i < 6 && el; i++) {
    const c = cs(el);
    chain.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), rect: rect(el), pos: c.position, overflow: c.overflow, bg: c.backgroundColor, bgImg: c.backgroundImage.slice(0, 200), opacity: c.opacity, zIndex: c.zIndex, anim: c.animationName, animDur: c.animationDuration });
    el = el.parentElement;
  }
  // overlays: siblings of video wrapper with background
  const hero = v ? v.closest('section, header, div[class*="hero"], div[class*="banner"], div[class*="slide"]') : null;
  const overlays = hero ? Array.from(hero.querySelectorAll('*')).filter(e => { const c = cs(e); return (c.backgroundImage.includes('gradient') || (c.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(c.opacity) < 1) || /rgba\(\d+, \d+, \d+, 0\.\d+\)/.test(c.backgroundColor)); }).slice(0, 10).map(e => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 80), rect: rect(e), bg: cs(e).backgroundColor, bgImg: cs(e).backgroundImage.slice(0, 220), opacity: cs(e).opacity, mix: cs(e).mixBlendMode })) : [];
  const h1c = h1 ? cs(h1) : null;
  const h1Text = h1 ? { text: h1.innerText, rect: rect(h1), font: h1c.fontFamily, size: h1c.fontSize, weight: h1c.fontWeight, lh: h1c.lineHeight, color: h1c.color, shadow: h1c.textShadow, maxW: h1c.maxWidth, anim: h1c.animationName, animDur: h1c.animationDuration, animDelay: h1c.animationDelay, ls: h1c.letterSpacing, align: h1c.textAlign } : null;
  const heroRect = hero ? rect(hero) : null;
  const sub = h1 ? Array.from(h1.parentElement.querySelectorAll('p, a, span')).slice(0, 6).map(e => ({ tag: e.tagName, text: e.innerText.trim().slice(0, 120), rect: rect(e), size: cs(e).fontSize, weight: cs(e).fontWeight, color: cs(e).color, bg: cs(e).backgroundColor, anim: cs(e).animationName, animDur: cs(e).animationDuration, animDelay: cs(e).animationDelay })) : [];
  const keyframes = [];
  try { for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r.type === CSSRule.KEYFRAMES_RULE && ['text', 'opc', 'shake'].includes(r.name)) keyframes.push({ name: r.name, css: r.cssText.slice(0, 600) }); } } catch {} } } catch {}
  return { heroRect, chain, overlays, h1: h1Text, sub, keyframes, vw: innerWidth, vh: innerHeight, scrollY };
});

(async () => {
  const browser = await chromium.launch();
  const results = {};

  // ---------- DESKTOP ----------
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  let page = await ctx.newPage();
  await page.goto(HOME, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2500);
  results.heroDesktop = await heroInfo(page);
  await dismissCookie(page);
  await page.screenshot({ path: path.join(OUT, 'home-1440-hero-clean.png') });

  // menu: hover "Atuação"
  const atua = page.locator('#site-navigation a', { hasText: /^Atuação$/ }).first();
  await atua.hover();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'home-1440-menu-atuacao.png') });
  results.menuDesktop = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const nav = document.querySelector('#site-navigation');
    const top = Array.from(nav.querySelectorAll(':scope > ul > li, :scope ul.menu > li, :scope > div > ul > li')).map(li => { const a = li.querySelector(':scope > a'); const sub = li.querySelector('ul'); return { text: a && a.innerText.trim(), rect: rect(li), font: a && cs(a).fontFamily.slice(0, 20), size: a && cs(a).fontSize, weight: a && cs(a).fontWeight, color: a && cs(a).color, tt: a && cs(a).textTransform, ls: a && cs(a).letterSpacing, hasSub: !!sub, subVisible: sub ? (cs(sub).display !== 'none' && cs(sub).visibility !== 'hidden' && parseFloat(cs(sub).opacity) > 0) : false, subRect: sub ? rect(sub) : null, subBg: sub ? cs(sub).backgroundColor : null, subTrans: sub ? cs(sub).transition : null, subItems: sub ? sub.querySelectorAll('li').length : 0 }; });
    const header = document.querySelector('#masthead');
    return { headerRect: rect(header), headerBg: cs(header).backgroundColor, headerTrans: cs(header).transition, top };
  });
  await page.mouse.move(10, 500);
  await page.waitForTimeout(500);
  const verticais = page.locator('#site-navigation a', { hasText: /^Verticais$/ }).first();
  await verticais.hover();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'home-1440-menu-verticais.png') });
  await page.mouse.move(10, 500);

  // header after scroll
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(800);
  results.headerScrolled = await page.evaluate(() => { const h = document.querySelector('#masthead'); const c = getComputedStyle(h); return { cls: h.className, bg: c.backgroundColor, h: h.getBoundingClientRect().height, shadow: c.boxShadow, backdrop: c.backdropFilter }; });
  await page.screenshot({ path: path.join(OUT, 'home-1440-header-scrolled.png') });

  // áreas de atuação section
  const areasH2 = page.locator('h2', { hasText: /Áreas/ }).first();
  await areasH2.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -140));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'home-1440-areas-atuacao.png') });
  results.areasDesktop = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const items = Array.from(document.querySelectorAll('.item-service')).map(it => ({ cls: it.className, rect: rect(it), bg: cs(it).backgroundColor, border: cs(it).border, radius: cs(it).borderRadius, pad: cs(it).padding, shadow: cs(it).boxShadow, trans: cs(it).transition, opacity: cs(it).opacity, transform: cs(it).transform, title: (it.querySelector('h3') || {}).innerText, text: (it.querySelector('p') || {}).innerText, textLen: ((it.querySelector('p') || {}).innerText || '').length, icon: !!it.querySelector('img'), cta: (it.querySelector('a') || {}).innerText }));
    const h2 = Array.from(document.querySelectorAll('h2')).find(h => /Áreas/.test(h.innerText));
    const sec = h2 && h2.closest('section');
    return { section: sec ? { rect: rect(sec), pad: cs(sec).padding, bg: cs(sec).backgroundColor } : null, h2: h2 ? { rect: rect(h2), size: cs(h2).fontSize, weight: cs(h2).fontWeight, lh: cs(h2).lineHeight } : null, items };
  });

  // verticais section
  const vertH2 = page.locator('h2', { hasText: /Verticais/ }).first();
  await vertH2.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -140));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'home-1440-verticais.png') });
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'home-1440-verticais-item.png') });
  results.verticaisDesktop = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const h3s = Array.from(document.querySelectorAll('h3')).filter(h => cs(h).color === 'rgb(255, 255, 255)' && cs(h).fontSize === '36px');
    return h3s.slice(0, 3).map(h => { let el = h; let bgEl = null; for (let i = 0; i < 6 && el; i++) { const c = cs(el); if (c.backgroundImage !== 'none' || (c.backgroundColor !== 'rgba(0, 0, 0, 0)')) { bgEl = el; break; } el = el.parentElement; } return { title: h.innerText, rect: rect(h), bgEl: bgEl ? { tag: bgEl.tagName, cls: bgEl.className.toString().slice(0, 80), rect: rect(bgEl), bgImg: cs(bgEl).backgroundImage.slice(0, 160), bgSize: cs(bgEl).backgroundSize, bgAttach: cs(bgEl).backgroundAttachment, bg: cs(bgEl).backgroundColor } : null, para: (h.parentElement.querySelector('p') || {}).innerText }; });
  });

  // reveal/scroll animation check: classes "inspect"
  results.revealDesktop = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const els = Array.from(document.querySelectorAll('.inspect')).slice(0, 8);
    return { count: document.querySelectorAll('.inspect').length, sample: els.map(e => ({ cls: e.className.toString().slice(0, 80), opacity: cs(e).opacity, transform: cs(e).transform, trans: cs(e).transition })), rules: (() => { const out = []; try { for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r.selectorText && /inspect|\.down|\.up|\.left|\.right|\.load\b|\.active/.test(r.selectorText) && r.cssText.length < 400) out.push(r.cssText); } } catch {} } } catch {} return out.slice(0, 25); })() };
  });

  // footer
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'home-1440-footer.png') });
  results.footerDesktop = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const f = document.querySelector('footer') || document.querySelector('#colophon') || document.querySelector('[class*="footer"]');
    if (!f) return null;
    const form = Array.from(document.querySelectorAll('form')).find(x => x.getBoundingClientRect().height > 50);
    return { tag: f.tagName, cls: f.className.toString().slice(0, 80), rect: rect(f), bg: cs(f).backgroundColor, color: cs(f).color, pad: cs(f).padding, text: f.innerText.replace(/\s+/g, ' ').slice(0, 900), links: f.querySelectorAll('a').length, form: form ? { rect: rect(form), title: (form.closest('section') && form.closest('section').querySelector('h2, h3, p') || {}).innerText, fields: Array.from(form.querySelectorAll('input:not([type=hidden]), select, textarea')).map(i => i.placeholder || i.name), button: (form.querySelector('button, input[type=submit]') || {}).innerText || (form.querySelector('input[type=submit]') || {}).value, btnBg: form.querySelector('button, input[type=submit]') ? cs(form.querySelector('button, input[type=submit]')).backgroundColor : null } : null, floatingCta: Array.from(document.querySelectorAll('a, button')).filter(e => cs(e).position === 'fixed').map(e => ({ t: e.innerText.trim().slice(0, 40), rect: rect(e), bg: cs(e).backgroundColor, href: e.getAttribute('href') })) };
  });
  // text content audit for compliance (promises)
  results.homeText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 6000));

  // ---------- INNER PAGE ----------
  await page.goto(INNER, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2000);
  await dismissCookie(page);
  await page.screenshot({ path: path.join(OUT, 'interna-1440-hero.png') });
  await page.screenshot({ path: path.join(OUT, 'interna-1440-full.png'), fullPage: true });
  results.inner = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const h1 = document.querySelector('h1');
    const v = document.querySelector('video');
    const heroBgEl = (() => { let el = h1; for (let i = 0; i < 8 && el; i++) { const c = cs(el); if (c.backgroundImage !== 'none' || c.backgroundColor !== 'rgba(0, 0, 0, 0)') return { tag: el.tagName, cls: el.className.toString().slice(0, 80), rect: rect(el), bgImg: c.backgroundImage.slice(0, 160), bg: c.backgroundColor }; el = el.parentElement; } return null; })();
    return { title: document.title, docH: document.documentElement.scrollHeight, h1: h1 ? { text: h1.innerText, rect: rect(h1), size: cs(h1).fontSize, weight: cs(h1).fontWeight, color: cs(h1).color } : null, video: v ? { src: v.currentSrc, rect: rect(v) } : null, heroBgEl, headings: Array.from(document.querySelectorAll('h2, h3')).slice(0, 25).map(h => ({ tag: h.tagName, t: h.innerText.trim().slice(0, 100), y: rect(h).y, size: cs(h).fontSize })), sections: Array.from(document.querySelectorAll('section')).map(s => ({ cls: s.className.toString().slice(0, 60), rect: rect(s), bg: cs(s).backgroundColor, bgImg: cs(s).backgroundImage.slice(0, 80) })), imgs: Array.from(document.querySelectorAll('img')).filter(i => i.getBoundingClientRect().width > 100).map(i => ({ src: i.currentSrc.slice(-70), rect: rect(i), nw: i.naturalWidth, nh: i.naturalHeight, alt: i.alt.slice(0, 60) })), ctas: Array.from(document.querySelectorAll('a.btn, a[class*="btn"], button')).map(a => ({ t: a.innerText.trim().slice(0, 50), y: rect(a).y, bg: cs(a).backgroundColor, href: a.getAttribute('href') })).filter(a => a.t), forms: Array.from(document.querySelectorAll('form')).filter(f => f.getBoundingClientRect().height > 50).map(f => ({ rect: rect(f), fields: Array.from(f.querySelectorAll('input:not([type=hidden]), select, textarea')).map(i => i.placeholder || i.name) })), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 5000), breadcrumb: !!document.querySelector('[class*="breadcrumb"], nav[aria-label*="bread"]') };
  });
  await ctx.close();

  // ---------- MOBILE ----------
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  page = await ctx.newPage();
  const mobReq = [];
  page.on('response', r => { const ct = r.headers()['content-type'] || ''; if (/video/.test(ct) || /\.mp4|\.webm/.test(r.url())) mobReq.push({ url: r.url(), status: r.status(), cl: r.headers()['content-length'], range: r.request().headers()['range'] }); });
  await page.goto(HOME, { waitUntil: 'load', timeout: 90000 });
  await page.screenshot({ path: path.join(OUT, 'home-390-hero-0s.png') });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'home-390-hero-2s.png') });
  results.heroMobile = await heroInfo(page);
  results.mobileVideoRequests = mobReq;
  results.mobileOverflow = await page.evaluate(() => ({ docW: document.documentElement.scrollWidth, vw: innerWidth, docH: document.documentElement.scrollHeight, h1Size: getComputedStyle(document.querySelector('h1')).fontSize, bodyPad: getComputedStyle(document.querySelector('.container') || document.body).paddingLeft }));
  await dismissCookie(page);
  await page.screenshot({ path: path.join(OUT, 'home-390-hero-clean.png') });
  // open mobile menu
  results.mobileMenu = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const cands = Array.from(document.querySelectorAll('button, a, div, span')).filter(e => { const c = cs(e); const r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.y < 120 && /menu|toggle|burger|hamb|nav/i.test(e.className + ' ' + e.id + ' ' + (e.getAttribute('aria-label') || '')); }).slice(0, 8).map(e => ({ tag: e.tagName, cls: e.className.toString().slice(0, 60), id: e.id, rect: rect(e), aria: e.getAttribute('aria-label') }));
    return { cands, headerH: rect(document.querySelector('#masthead')).h };
  });
  let opened = false;
  for (const sel of ['.menu-toggle', 'button.menu-toggle', '#menu-toggle', '.hamburger', '[aria-label*="menu" i]', '.toggle-menu', '.btn-menu', '.mobile-menu', '.icon-menu', '.navbar-toggle']) {
    const loc = page.locator(sel).first();
    if (await loc.count() && await loc.isVisible().catch(() => false)) { await loc.tap().catch(async () => loc.click()); opened = sel; break; }
  }
  await page.waitForTimeout(1200);
  results.mobileMenuOpened = opened;
  await page.screenshot({ path: path.join(OUT, 'home-390-menu-aberto.png') });
  results.mobileMenuState = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const nav = document.querySelector('#site-navigation');
    const ul = nav && nav.querySelector('ul');
    const visibleLinks = nav ? Array.from(nav.querySelectorAll('a')).filter(a => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && cs(a).visibility !== 'hidden'; }).map(a => ({ t: a.innerText.trim().slice(0, 40), rect: rect(a), size: cs(a).fontSize })) : [];
    return { navCls: nav && nav.className, bodyCls: document.body.className.slice(0, 200), navRect: nav && rect(nav), navBg: nav && cs(nav).backgroundColor, ulBg: ul && cs(ul).backgroundColor, ulPos: ul && cs(ul).position, ulTrans: ul && cs(ul).transition, visibleLinks: visibleLinks.slice(0, 30), visibleCount: visibleLinks.length };
  });
  // close menu and go to areas
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await dismissCookie(page);
  const areasM = page.locator('h2', { hasText: /Áreas/ }).first();
  await areasM.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -90));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'home-390-areas-atuacao.png') });
  results.areasMobile = await page.evaluate(() => { const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; }; return Array.from(document.querySelectorAll('.item-service')).map(i => rect(i)); });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'home-390-footer.png') });
  results.mobileTapTargets = await page.evaluate(() => { const cs = el => getComputedStyle(el); return Array.from(document.querySelectorAll('a, button')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && cs(e).visibility !== 'hidden'; }).map(e => ({ t: e.innerText.trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) })).filter(e => e.h < 40 && e.t).slice(0, 25); });
  await page.goto(INNER, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2000);
  await dismissCookie(page);
  await page.screenshot({ path: path.join(OUT, 'interna-390-hero.png') });
  await page.screenshot({ path: path.join(OUT, 'interna-390-full.png'), fullPage: true });
  await ctx.close();

  fs.writeFileSync(path.join(OUT, 'capture-metrics.json'), JSON.stringify(results, null, 2));
  console.log('ok', Object.keys(results).join(','));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
