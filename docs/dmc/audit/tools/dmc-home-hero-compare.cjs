// Comparativo rápido: hero/vídeo da home DMC local (somente leitura).
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/referencia-planning';
(async () => {
  const b = await chromium.launch();
  const out = {};
  for (const [name, vp] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: name === '390' ? 2 : 1, isMobile: name === '390' });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:8080/complexodmc.com.br/index.html', { waitUntil: 'load', timeout: 60000 });
    await p.screenshot({ path: path.join(OUT, `dmc-home-${name}-hero-0s.png`) });
    await p.waitForTimeout(2000);
    await p.screenshot({ path: path.join(OUT, `dmc-home-${name}-hero-2s.png`) });
    out[name] = await p.evaluate(() => {
      const cs = el => getComputedStyle(el);
      const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const v = document.querySelector('video');
      const h1 = document.querySelector('h1');
      const hero = h1 && (h1.closest('section, header, .hero, [class*="hero"]'));
      const nav = document.querySelector('header, nav');
      return { video: v ? { src: v.currentSrc, poster: v.poster, w: v.videoWidth, h: v.videoHeight, duration: v.duration, paused: v.paused, readyState: v.readyState, rect: rect(v), objectFit: cs(v).objectFit, autoplay: v.autoplay, muted: v.muted, loop: v.loop, playsInline: v.playsInline, preload: v.preload } : null,
        h1: h1 ? { text: h1.innerText.slice(0, 160), rect: rect(h1), size: cs(h1).fontSize, weight: cs(h1).fontWeight, font: cs(h1).fontFamily.slice(0, 40), color: cs(h1).color, lh: cs(h1).lineHeight } : null,
        hero: hero ? { cls: hero.className.toString().slice(0, 60), rect: rect(hero) } : null,
        nav: nav ? { rect: rect(nav), bg: cs(nav).backgroundColor, pos: cs(nav).position, links: Array.from(nav.querySelectorAll('a')).map(a => a.innerText.trim()).filter(Boolean).slice(0, 15) } : null,
        docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth,
        ctas: Array.from(document.querySelectorAll('a, button')).filter(e => e.getBoundingClientRect().y < 900 && e.innerText.trim() && /contato|converse|especialista|fale|agende|solicit/i.test(e.innerText)).map(e => ({ t: e.innerText.trim().slice(0, 50), rect: rect(e), bg: cs(e).backgroundColor }))
      };
    });
    await ctx.close();
  }
  const sizes = {};
  for (const f of ['rino-hero.mp4', 'rino-video-transparent.mp4']) { try { sizes[f] = fs.statSync('/Users/dmchagas/Site_Complexo_DMC/complexodmc.com.br/assets/videos/' + f).size; } catch (e) { sizes[f] = 'n/a'; } }
  out.videoFileSizes = sizes;
  fs.writeFileSync(path.join(OUT, 'dmc-home-hero-compare.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
