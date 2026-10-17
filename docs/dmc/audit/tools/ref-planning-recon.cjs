// Reconhecimento da referência planning.com.br (somente leitura; não baixa mídia).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/referencia-planning';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const requests = [];
  page.on('response', r => {
    const ct = r.headers()['content-type'] || '';
    const cl = r.headers()['content-length'] || '';
    requests.push({ url: r.url(), status: r.status(), ct, cl });
  });
  const t0 = Date.now();
  await page.goto('https://planning.com.br/', { waitUntil: 'load', timeout: 90000 });
  const tLoad = Date.now() - t0;
  await page.screenshot({ path: path.join(OUT, 'home-1440-hero-0s.png') });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'home-1440-hero-2s.png') });

  const info = await page.evaluate(() => {
    const cs = el => getComputedStyle(el);
    const q = s => Array.from(document.querySelectorAll(s));
    const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const videos = q('video').map(v => ({
      src: v.currentSrc || v.src, poster: v.poster, autoplay: v.autoplay, muted: v.muted, loop: v.loop, playsInline: v.playsInline,
      preload: v.preload, w: v.videoWidth, h: v.videoHeight, duration: v.duration, paused: v.paused, readyState: v.readyState,
      rect: rect(v), objectFit: cs(v).objectFit, sources: Array.from(v.querySelectorAll('source')).map(s => ({ src: s.src, type: s.type, media: s.media })),
      className: v.className, parentClass: v.parentElement && v.parentElement.className
    }));
    const iframes = q('iframe').map(f => ({ src: f.src, rect: rect(f) }));
    const headings = q('h1,h2,h3').slice(0, 60).map(h => ({ tag: h.tagName, text: h.innerText.trim().slice(0, 140), rect: rect(h), font: cs(h).fontFamily, size: cs(h).fontSize, weight: cs(h).fontWeight, lh: cs(h).lineHeight, color: cs(h).color, ls: cs(h).letterSpacing, tt: cs(h).textTransform }));
    const nav = q('header, nav').map(n => ({ tag: n.tagName, cls: n.className, id: n.id, rect: rect(n), pos: cs(n).position, bg: cs(n).backgroundColor, h: cs(n).height, links: Array.from(n.querySelectorAll('a')).map(a => ({ t: a.innerText.trim().slice(0, 60), href: a.getAttribute('href') })).filter(a => a.t) }));
    const sections = q('section, main > div, body > div').slice(0, 80).map(s => ({ tag: s.tagName, cls: (s.className || '').toString().slice(0, 120), id: s.id, rect: rect(s), bg: cs(s).backgroundColor, bgImg: cs(s).backgroundImage.slice(0, 160), pad: cs(s).padding })).filter(s => s.rect.h > 40);
    const buttons = q('a,button').filter(a => { const c = cs(a); return (c.backgroundColor !== 'rgba(0, 0, 0, 0)' || c.borderStyle !== 'none') && a.innerText.trim().length > 0 && a.innerText.trim().length < 60; }).slice(0, 40).map(a => ({ t: a.innerText.trim(), href: a.getAttribute('href'), rect: rect(a), bg: cs(a).backgroundColor, color: cs(a).color, border: cs(a).border, radius: cs(a).borderRadius, font: cs(a).fontFamily, size: cs(a).fontSize, weight: cs(a).fontWeight, tt: cs(a).textTransform, ls: cs(a).letterSpacing }));
    const forms = q('form').map(f => ({ action: f.action, method: f.method, rect: rect(f), fields: Array.from(f.querySelectorAll('input,textarea,select')).map(i => ({ type: i.type, name: i.name, ph: i.placeholder, req: i.required })) }));
    const imgs = q('img').slice(0, 80).map(i => ({ src: (i.currentSrc || i.src).slice(0, 160), alt: i.alt, rect: rect(i), nw: i.naturalWidth, nh: i.naturalHeight, loading: i.loading, objectFit: cs(i).objectFit }));
    const body = cs(document.body);
    const fontsUsed = {};
    q('body *').slice(0, 3000).forEach(el => { const f = cs(el).fontFamily; fontsUsed[f] = (fontsUsed[f] || 0) + 1; });
    const stylesheets = Array.from(document.styleSheets).map(s => s.href).filter(Boolean);
    const scripts = q('script[src]').map(s => s.src);
    const animated = q('body *').filter(el => { const c = cs(el); return c.animationName !== 'none' || (c.transitionDuration !== '0s' && c.transitionDuration !== '0s, 0s'); }).slice(0, 60).map(el => { const c = cs(el); return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), anim: c.animationName, animDur: c.animationDuration, animTf: c.animationTimingFunction, trans: c.transitionProperty, transDur: c.transitionDuration, transTf: c.transitionTimingFunction }; });
    const webAnims = document.getAnimations ? document.getAnimations().slice(0, 40).map(a => ({ type: a.constructor.name, name: a.animationName || (a.effect && a.effect.target && a.effect.target.className && a.effect.target.className.toString().slice(0, 60)), dur: a.effect && a.effect.getTiming().duration, ease: a.effect && a.effect.getTiming().easing, state: a.playState })) : [];
    const gens = q('meta[name="generator"]').map(m => m.content);
    const bodyClasses = document.body.className.slice(0, 300);
    return {
      title: document.title, metaDesc: (document.querySelector('meta[name="description"]') || {}).content, gens, bodyClasses,
      docH: document.documentElement.scrollHeight, bodyFont: body.fontFamily, bodyFontSize: body.fontSize, bodyColor: body.color, bodyBg: body.backgroundColor,
      videos, iframes, headings, nav, sections, buttons, forms, imgs, fontsUsed, stylesheets, scripts, animated, webAnims
    };
  });
  info.tLoadMs = tLoad;
  info.requests = requests.filter(r => /video|mp4|webm|font|woff|\.jpg|\.png|\.webp|\.svg|\.css|\.js/i.test(r.url) || /video|font|image/i.test(r.ct)).slice(0, 200);
  fs.writeFileSync(path.join(OUT, 'home-1440-recon.json'), JSON.stringify(info, null, 2));
  await page.screenshot({ path: path.join(OUT, 'home-1440-full.png'), fullPage: true });
  console.log(JSON.stringify({ tLoad, docH: info.docH, videos: info.videos.length, headings: info.headings.length, sections: info.sections.length, forms: info.forms.length, gens: info.gens, scripts: info.scripts.length }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
