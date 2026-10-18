// =============================================================
// COMPLEXO DMC · Portal — Relatórios (catálogo + JSON/CSV) e painel da coordenação
// PORTAL-API §6.11.3 · §4.4 (grupos `relatorio` e `painel`) · §4.13 (CSV) ·
// índice §8.5 (F7), D-24 (CPF nunca) · dono: F7.
//
//   professor GET /portal/professor/relatorios          catálogo do papel
//             GET /portal/professor/relatorios/:id      ?formato=json|csv&cursoId&turmaId&de&ate&…&pagina
//   admin     GET /portal/admin/relatorios/painel       números reais do grupo `painel`
//
// Cada fatia registra o próprio relatório (grupo `relatorio`); esta rota
// só aplica as regras comuns: catálogo filtrado pelo papel, docência do
// professor conferida ANTES de consultar (403 `nao-docente`), colunas
// `somenteAdmin` omitidas para o professor (no catálogo, no JSON e no CSV),
// `resumo` sobre o conjunto FILTRADO INTEIRO (grupo `resumir`), teto de
// 20.000 linhas (413 `relatorio-grande`), nenhuma chave `cpf`, limite de
// 20 consultas por hora e auditoria `relatorio.exportado` no CSV.
// Painel: contribuição ausente → chaves `null`; bloco sem contribuição → `null`.
// =============================================================
import { Router } from 'express';
import { ErroPortal } from '../../portal/erros.js';
import { papelDe } from '../../portal/papeis.js';
import { ID_RE, ID_LEGADO_RE, validarDataCalendario, lerPagina } from '../../portal/validacao.js';
import { LIMITE_LINHAS_CSV, enviarCsv } from '../../portal/csv.js';
import { montarPainel } from '../../portal/servicos.js';

export const POR_PAGINA = 50;
export const LIMITE_CONSULTAS_HORA = 20;
const HORA = 60 * 60 * 1000;
const RELATORIO_ID_RE = /^[a-z][a-z0-9-]{1,40}$/;
const CHAVE_FILTRO_RE = /^[A-Za-z][A-Za-z0-9]{0,30}$/;
const VALOR_FILTRO_RE = /^[\p{L}\p{N} _.:@/-]{1,80}$/u;
const SO_JSON = new Set(['diversidade']);
const CHAVES_PROIBIDAS = new Set(['cpf', 'senhaHash', 'documento', 'passaporte']);

/** Grupo sem repetição (o lote do módulo repete o que já confirmou). */
const unicos = (servicos, grupo) => [...new Set(servicos.todos(grupo))];

/** Colunas visíveis ao papel (professor: sem `somenteAdmin`; nunca `cpf`). */
export function colunasDoPapel(def, papel) {
  return (Array.isArray(def.colunas) ? def.colunas : [])
    .filter(c => c && typeof c.chave === 'string' && !CHAVES_PROIBIDAS.has(c.chave.toLowerCase()))
    .filter(c => papel === 'admin' || c.somenteAdmin !== true)
    .map(c => ({ chave: c.chave, rotulo: c.rotulo || c.chave, tipo: c.tipo || 'texto', ...(c.somenteAdmin ? { somenteAdmin: true } : {}) }));
}

/** Linha só com as colunas visíveis (o que a definição devolver a mais não sai). */
export function projetarLinha(linha, colunas) {
  const out = {};
  for (const c of colunas) out[c.chave] = linha && Object.hasOwn(linha, c.chave) ? linha[c.chave] ?? null : null;
  return out;
}

/** Item do catálogo para o papel. */
export function itemDoCatalogo(def, papel) {
  return {
    id: def.id,
    titulo: def.titulo || def.id,
    descricao: typeof def.descricao === 'string' ? def.descricao : null,
    filtros: (Array.isArray(def.filtros) ? def.filtros : []).map(f => ({ chave: f.chave, tipo: f.tipo || 'texto', ...(f.obrigatorio ? { obrigatorio: true } : {}) })),
    colunas: colunasDoPapel(def, papel),
    formatos: SO_JSON.has(def.id) || def.soJson === true ? ['json'] : ['json', 'csv'],
    temResumo: typeof def.resumir === 'function'
  };
}

/**
 * Lê os filtros da query: os comuns (cursoId, turmaId, de, ate) e os da definição.
 * Valor fora do formato → 400 `validacao`.
 */
export function lerFiltros(query, def) {
  const filtros = {};
  const campos = {};
  const comuns = { cursoId: ID_LEGADO_RE, turmaId: ID_RE };
  for (const [k, re] of Object.entries(comuns)) {
    const v = query[k];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'string' || !re.test(v)) campos[k] = 'Filtro inválido.';
    else filtros[k] = v;
  }
  for (const k of ['de', 'ate']) {
    const v = query[k];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'string' || !validarDataCalendario(v)) campos[k] = 'Data inválida.';
    else filtros[k] = v;
  }
  if (filtros.de && filtros.ate && filtros.de > filtros.ate) campos.ate = 'O fim do período precisa ser depois do início.';
  for (const f of Array.isArray(def.filtros) ? def.filtros : []) {
    const k = f?.chave;
    if (typeof k !== 'string' || !CHAVE_FILTRO_RE.test(k) || Object.hasOwn(filtros, k) || ['cursoId', 'turmaId', 'de', 'ate'].includes(k)) continue;
    const v = query[k];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'string' || !VALOR_FILTRO_RE.test(v)) campos[k] = 'Filtro inválido.';
    else filtros[k] = v;
  }
  for (const f of Array.isArray(def.filtros) ? def.filtros : []) {
    if (f?.obrigatorio && (filtros[f.chave] === undefined)) campos[f.chave] = f.chave === 'cursoId' ? 'Escolha o curso.' : 'Campo obrigatório.';
  }
  if (Object.keys(campos).length) throw new ErroPortal(400, 'validacao', 'Confira os filtros.', { campos });
  return filtros;
}

/** Remove chaves proibidas em qualquer profundidade do resumo (defesa em profundidade). */
function semChavesProibidas(v) {
  if (Array.isArray(v)) return v.map(semChavesProibidas);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!CHAVES_PROIBIDAS.has(k.toLowerCase())) out[k] = semChavesProibidas(x);
    return out;
  }
  return v;
}

/** Resumo no formato do contrato: até 4 KPIs, séries com pontos; valores não numéricos → null. */
export function normalizarResumo(r) {
  if (!r || typeof r !== 'object') return null;
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const kpis = (Array.isArray(r.kpis) ? r.kpis : []).slice(0, 4).map(k => ({
    chave: String(k?.chave ?? ''), rotulo: String(k?.rotulo ?? k?.chave ?? ''), valor: num(k?.valor), formato: k?.formato || 'numero',
    ...(typeof k?.nota === 'string' ? { nota: k.nota } : {})
  }));
  const series = (Array.isArray(r.series) ? r.series : []).map(s => ({
    chave: String(s?.chave ?? ''), rotulo: String(s?.rotulo ?? s?.chave ?? ''), formato: s?.formato || 'numero',
    pontos: (Array.isArray(s?.pontos) ? s.pontos : []).slice(0, 200).map(p => ({ rotulo: String(p?.rotulo ?? ''), valor: num(p?.valor) }))
  }));
  return semChavesProibidas({ kpis, series });
}

/**
 * Fábrica das rotas (testável com falsos).
 * @returns {{ professor: Router, admin: Router }}
 */
export function criarRotasRelatorios({ servicos, acesso, auditoria, contador = null, agora = () => new Date(), log = console } = {}) {
  if (!servicos) throw new TypeError('criarRotasRelatorios: informe servicos.');
  if (!acesso) throw new TypeError('criarRotasRelatorios: informe acesso.');
  if (!auditoria) throw new TypeError('criarRotasRelatorios: informe auditoria.');
  const professor = Router();
  const admin = Router();
  const avisar = (texto, err) => { try { (log.warn || log.error).call(log, `[portal] relatórios: ${texto}${err ? ` (${err.message})` : ''}`); } catch { /* nada */ } };

  const catalogo = papel => unicos(servicos, 'relatorio').filter(d => Array.isArray(d.papeis) && d.papeis.includes(papel));

  professor.get('/relatorios', (req, res) => {
    const papel = papelDe(req.user);
    const itens = catalogo(papel).map(d => itemDoCatalogo(d, papel)).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    res.json({ itens });
  });

  async function conferirDocencia(req, filtros) {
    if (papelDe(req.user) === 'admin') return;
    const ctx = await acesso.contexto(req);
    if (filtros.cursoId && !ctx.cursosDocente.has(filtros.cursoId)) throw new ErroPortal(403, 'nao-docente');
    if (filtros.turmaId) {
      if (filtros.cursoId) {
        if (!(await acesso.podeGerirTurma(req, filtros.cursoId, filtros.turmaId))) throw new ErroPortal(403, 'nao-docente');
      } else {
        let ok = ctx.docencias.some(d => d.turmaId === filtros.turmaId);
        const turmasDoCurso = servicos.tentar('secretaria.turmasDoCurso');
        if (!ok && typeof turmasDoCurso === 'function') {
          for (const c of ctx.cursosDocenteGeral) {
            const turmas = await turmasDoCurso(c).catch(() => []);
            if ((turmas || []).some(t => String(t?.id ?? t?._id) === filtros.turmaId)) { ok = true; break; }
          }
        }
        if (!ok) throw new ErroPortal(403, 'nao-docente');
      }
    }
  }

  async function consumirLimite(req) {
    if (!contador) return;
    const r = await contador.consumir(`rel:${String(req.user._id)}`, { janelaMs: HORA, max: LIMITE_CONSULTAS_HORA });
    if (!r.ok) throw new ErroPortal(429, 'limite', 'Limite de 20 consultas de relatório por hora. Tente de novo mais tarde.', { retryAfterSeg: r.retryAfterSeg, persistente: true });
  }

  professor.get('/relatorios/:id', async (req, res) => {
    const papel = papelDe(req.user);
    const id = String(req.params.id || '');
    const def = RELATORIO_ID_RE.test(id) ? catalogo(papel).find(d => d.id === id) : null;
    if (!def) throw new ErroPortal(404, null, 'Relatório não encontrado.');
    const formato = req.query.formato === undefined || req.query.formato === '' ? 'json' : req.query.formato;
    if (formato !== 'json' && formato !== 'csv') throw new ErroPortal(400, 'validacao', 'Formato inválido.', { campos: { formato: 'Use json ou csv.' } });
    const item = itemDoCatalogo(def, papel);
    if (formato === 'csv' && !item.formatos.includes('csv')) throw new ErroPortal(400, 'validacao', 'Este relatório não tem exportação em CSV.', { campos: { formato: 'Só leitura em tela.' } });
    const filtros = lerFiltros(req.query, def);
    await conferirDocencia(req, filtros);
    const { pagina } = lerPagina(req.query, { porPaginaPadrao: POR_PAGINA, max: POR_PAGINA });
    if (formato === 'csv' || pagina === 1) await consumirLimite(req);

    const linhasBrutas = await def.consultar(req, filtros, { limite: LIMITE_LINHAS_CSV });
    const linhas = Array.isArray(linhasBrutas) ? linhasBrutas : [];
    if (linhas.length > LIMITE_LINHAS_CSV) throw new ErroPortal(413, 'relatorio-grande', undefined, { limite: LIMITE_LINHAS_CSV });
    const colunas = item.colunas;
    const projetadas = linhas.map(l => projetarLinha(l, colunas));

    if (formato === 'csv') {
      enviarCsv(res, def.id, colunas, projetadas, { agora });
      await auditoria.registrar({ acao: 'relatorio.exportado', entidade: { tipo: 'relatorio', id: def.id }, cursoId: filtros.cursoId ?? null, extra: { id: def.id, filtros, linhas: projetadas.length } }, req);
      return undefined;
    }
    let resumo = null;
    if (typeof def.resumir === 'function' && pagina === 1) {
      try {
        resumo = normalizarResumo(await def.resumir(req, filtros));
      } catch (err) {
        if (err instanceof ErroPortal) throw err;
        avisar(`resumo de ${def.id} indisponível`, err);
        resumo = null;
      }
    }
    const total = projetadas.length;
    const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    const inicio = (pagina - 1) * POR_PAGINA;
    return res.json({
      relatorio: { id: def.id, titulo: item.titulo, colunas, formatos: item.formatos, temResumo: item.temResumo },
      filtros, resumo, itens: projetadas.slice(inicio, inicio + POR_PAGINA), pagina, porPagina: POR_PAGINA, total, totalPaginas
    });
  });

  admin.get('/relatorios/painel', async (req, res) => {
    const srv = { todos: g => unicos(servicos, g) };
    const painel = await montarPainel(srv, req, { cursoIds: null }, { log });
    res.json(painel);
  });

  return { professor, admin };
}

export default async function montar(ctx) {
  const { comum, rotas, servicos } = ctx;
  const r = criarRotasRelatorios({ servicos, acesso: comum.acesso, auditoria: comum.auditoria, contador: comum.contador, agora: comum.agora, log: comum.log });
  rotas.professor.use(r.professor);
  rotas.admin.use(r.admin);
}
