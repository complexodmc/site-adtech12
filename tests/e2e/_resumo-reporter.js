// Reporter do QA: agrega por grupo (arquivo .spec), causa e página.
// Saída: resumo.json (caminho em playwright.config.js) + tabela curta no terminal.
// skipped = "bloqueado" (o teste diz o motivo em annotation `bloqueado`).
import fs from 'node:fs';
import path from 'node:path';

const semAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');

export default class ResumoReporter {
  constructor(opcoes = {}) {
    this.saida = opcoes.outputFile || 'resumo.json';
    this.itens = [];
    this.inicio = Date.now();
  }

  onTestEnd(teste, resultado) {
    const grupo = path.basename(teste.location.file).replace(/\.spec\.[cm]?js$/, '');
    const anot = [...teste.annotations, ...resultado.annotations];
    const pag = anot.find((a) => a.type === 'pagina')?.description || null;
    const causas = [...new Set(anot.filter((a) => a.type === 'causa').map((a) => a.description))];
    const bloqueio = anot.find((a) => a.type === 'bloqueado' || a.type === 'skip')?.description || null;
    const erro = resultado.errors.map((e) => semAnsi(e.message).split('\n').find((l) => l.trim()) || '').filter(Boolean)[0] || null;
    const status = resultado.status === 'passed' ? 'aprovado'
      : resultado.status === 'skipped' ? 'bloqueado'
        : 'falhou';
    const evid = resultado.attachments.filter((a) => a.path).map((a) => path.relative(process.cwd(), a.path));
    this.itens.push({ grupo, teste: teste.titlePath().slice(2).join(' › '), pagina: pag, status, causas, erro, bloqueio, evidencias: evid, ms: resultado.duration });
  }

  onEnd() {
    if (!this.itens.length) return; // --list ou execução vazia: não sobrescreve o resumo anterior
    const grupos = {};
    for (const i of this.itens) {
      grupos[i.grupo] ||= { aprovado: 0, falhou: 0, bloqueado: 0 };
      grupos[i.grupo][i.status]++;
    }
    const falhas = this.itens.filter((i) => i.status === 'falhou');
    const porCausa = new Map();
    for (const f of falhas) {
      const cs = f.causas.length ? f.causas : [f.erro || 'erro sem mensagem'];
      for (const c of cs) {
        const k = f.grupo + ' | ' + c;
        if (!porCausa.has(k)) porCausa.set(k, { grupo: f.grupo, causa: c, paginas: new Set(), n: 0, evidencias: [] });
        const e = porCausa.get(k);
        e.n++;
        if (f.pagina) e.paginas.add(f.pagina);
        if (e.evidencias.length < 3) e.evidencias.push(...f.evidencias.slice(0, 1));
      }
    }
    const causas = [...porCausa.values()].map((c) => ({ ...c, paginas: [...c.paginas] })).sort((a, b) => b.n - a.n);
    const porPagina = {};
    for (const f of falhas) { const p = f.pagina || '(geral)'; porPagina[p] = (porPagina[p] || 0) + 1; }
    const totais = { total: this.itens.length, aprovado: 0, falhou: 0, bloqueado: 0 };
    for (const i of this.itens) totais[i.status]++;
    const resumo = {
      geradoEm: new Date().toISOString(), duracaoS: Math.round((Date.now() - this.inicio) / 1000),
      totais, grupos, falhasPorCausa: causas,
      falhasPorPagina: Object.entries(porPagina).sort((a, b) => b[1] - a[1]).map(([pagina, n]) => ({ pagina, n })),
      bloqueados: this.itens.filter((i) => i.status === 'bloqueado').map(({ grupo, teste, bloqueio }) => ({ grupo, teste, motivo: bloqueio })),
      falhas
    };
    fs.mkdirSync(path.dirname(this.saida), { recursive: true });
    fs.writeFileSync(this.saida, JSON.stringify(resumo, null, 2));
    const linhas = Object.entries(grupos).map(([g, c]) => `  ${g.padEnd(16)} aprovado ${String(c.aprovado).padStart(3)}  falhou ${String(c.falhou).padStart(3)}  bloqueado ${c.bloqueado}`);
    console.log(`\n[QA] ${totais.total} testes — aprovado ${totais.aprovado}, falhou ${totais.falhou}, bloqueado ${totais.bloqueado}\n${linhas.join('\n')}`);
    for (const c of causas.slice(0, 12)) console.log(`  · [${c.grupo}] ${c.causa} — ${c.n}× (${c.paginas.slice(0, 6).join(', ')}${c.paginas.length > 6 ? ', …' : ''})`);
    console.log(`[QA] resumo: ${this.saida}`);
  }
}
