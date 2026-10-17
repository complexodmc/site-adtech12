// Resume os relatórios Lighthouse (JSON) em lighthouse-summary.json
// Uso: node docs/dmc/audit/tools/baseline-lighthouse-summary.mjs
import fs from 'node:fs';
import path from 'node:path';

const DIR = '/Users/dmchagas/Site_Complexo_DMC/docs/dmc/audit/2026-10-17/metricas-baseline/lighthouse';
const out = [];
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.report.json')).sort()) {
  const lhr = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const a = lhr.audits;
  const cat = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
  const ms = (k) => a[k]?.numericValue != null ? Math.round(a[k].numericValue) : null;
  const opps = Object.values(a)
    .filter((x) => x.details?.type === 'opportunity' && (x.details.overallSavingsMs > 0 || x.details.overallSavingsBytes > 0))
    .map((x) => ({ id: x.id, title: x.title, savingsMs: Math.round(x.details.overallSavingsMs || 0), savingsKB: Math.round((x.details.overallSavingsBytes || 0) / 1024) }))
    .sort((p, q) => q.savingsMs - p.savingsMs || q.savingsKB - p.savingsKB)
    .slice(0, 5);
  const failedA11y = lhr.categories.accessibility.auditRefs.map((r) => a[r.id]).filter((x) => x.score === 0).map((x) => x.id);
  const failedBP = lhr.categories['best-practices'].auditRefs.map((r) => a[r.id]).filter((x) => x.score === 0).map((x) => x.id);
  const failedSEO = lhr.categories.seo.auditRefs.map((r) => a[r.id]).filter((x) => x.score === 0).map((x) => x.id);
  out.push({
    page: f.replace('.report.json', ''), url: lhr.finalDisplayedUrl, formFactor: lhr.configSettings.formFactor, lighthouseVersion: lhr.lighthouseVersion,
    runWarnings: lhr.runWarnings,
    scores: { performance: cat('performance'), accessibility: cat('accessibility'), bestPractices: cat('best-practices'), seo: cat('seo') },
    metrics: { FCP_ms: ms('first-contentful-paint'), LCP_ms: ms('largest-contentful-paint'), CLS: a['cumulative-layout-shift']?.numericValue?.toFixed(3), TBT_ms: ms('total-blocking-time'), SI_ms: ms('speed-index'), TTI_ms: ms('interactive') },
    lcpElement: a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet?.slice(0, 160) || null,
    totalBytesKB: Math.round((a['total-byte-weight']?.numericValue || 0) / 1024),
    domSize: a['dom-size']?.numericValue,
    top5Opportunities: opps,
    failedAccessibility: failedA11y, failedBestPractices: failedBP, failedSEO,
  });
}
fs.writeFileSync(path.join(DIR, '..', 'lighthouse-summary.json'), JSON.stringify(out, null, 2));
for (const r of out) console.log(r.page, JSON.stringify(r.scores), JSON.stringify(r.metrics), r.totalBytesKB + 'KB');
