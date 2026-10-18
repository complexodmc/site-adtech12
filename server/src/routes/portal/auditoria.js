// =============================================================
// COMPLEXO DMC · Portal — consulta da trilha de auditoria (coordenação)
// PORTAL-API §6.4 (GET /portal/admin/auditoria), §3.3, §3.4 · dono: F0t.
//
// Só leitura: não existe PUT/DELETE (404). Filtros por ação (exata ou
// prefixo terminado em '.'), ator, alvo, entidade, curso, período e
// `objeto` (MAT-…, ATD-…, OUV-…, DEC/FRQ/AVL/CTR-… ou e-mail exato,
// resolvido no servidor; nada encontrado → lista vazia). CSV com as mesmas
// colunas (anti-fórmula do csv.js); acima de 20.000 linhas → 413.
// Exportar CSV gera `relatorio.exportado`.
// =============================================================
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../../portal/erros.js';
import { lerPagina, validarDataCalendario, validarEmail, ID_RE } from '../../portal/validacao.js';
import { LIMITE_LINHAS_CSV, enviarCsv } from '../../portal/csv.js';
import { ACAO_RE } from '../../portal/auditoria.js';

const iso = d => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);
const TEXTO_FILTRO_RE = /^[A-Za-z0-9_.:@-]{1,120}$/;

/** Código de objeto → { colecao, campo, tipo } (resolução no servidor). */
export const OBJETOS = Object.freeze([
  { re: /^MAT-\d{4}-[2-9A-HJ-NP-Z]{6}$/, colecao: 'matriculas', campo: 'numero' },
  { re: /^ATD-\d{4}-[2-9A-HJ-NP-Z]{6}$/, colecao: 'protocolos', campo: 'protocolo' },
  { re: /^OUV-\d{4}-[2-9A-HJ-NP-Z]{6}$/, colecao: 'manifestacoes', campo: 'protocolo' },
  { re: /^DEC(-[2-9A-HJ-NP-Z]{4}){3}$/, colecao: 'declaracoes', campo: 'codigo' },
  { re: /^FRQ(-[2-9A-HJ-NP-Z]{4}){3}$/, colecao: 'frequencias', campo: 'codigo' },
  { re: /^AVL(-[2-9A-HJ-NP-Z]{4}){3}$/, colecao: 'tentativas', campo: 'codigo' },
  { re: /^CTR(-[2-9A-HJ-NP-Z]{4}){3}$/, colecao: 'contratos', campo: 'codigoVerificacao' }
]);

export const COLUNAS_CSV = Object.freeze([
  { chave: 'em', rotulo: 'Data e hora', tipo: 'dataHora' },
  { chave: 'acao', rotulo: 'Ação', tipo: 'texto' },
  { chave: 'atorNome', rotulo: 'Quem fez', tipo: 'texto' },
  { chave: 'atorPapel', rotulo: 'Papel', tipo: 'texto' },
  { chave: 'atorRede', rotulo: 'Rede (IP truncado)', tipo: 'texto' },
  { chave: 'alvoNome', rotulo: 'Pessoa afetada', tipo: 'texto' },
  { chave: 'entidade', rotulo: 'Registro', tipo: 'texto' },
  { chave: 'mudancas', rotulo: 'Mudanças', tipo: 'texto' },
  { chave: 'motivo', rotulo: 'Motivo', tipo: 'texto' },
  { chave: 'estado', rotulo: 'Situação', tipo: 'texto' }
]);

function lerFiltroTexto(valor, campo) {
  if (valor === undefined || valor === '') return null;
  if (typeof valor !== 'string' || !TEXTO_FILTRO_RE.test(valor)) throw new ErroPortal(400, 'validacao', undefined, { campos: { [campo]: 'Filtro inválido.' } });
  return valor;
}

/**
 * @param {{ router, repo, auditoria, agora? }} deps — `router` = Router admin (já protegido pelo agregador).
 */
export function criarRotaAuditoria({ router, repo, auditoria, agora = () => new Date() } = {}) {
  if (!router || typeof repo !== 'function' || !auditoria) throw new TypeError('criarRotaAuditoria: informe router, repo e auditoria.');

  /** Monta o filtro do Mongo. → filtro ou null (objeto não encontrado → lista vazia). */
  async function montarFiltro(q) {
    const f = {};
    const acao = lerFiltroTexto(q.acao, 'acao');
    if (acao) {
      if (acao.endsWith('.')) {
        if (!/^[a-z][a-z0-9_]*\.$/.test(acao)) throw new ErroPortal(400, 'validacao', undefined, { campos: { acao: 'Filtro inválido.' } });
        f.acao = { $regex: `^${acao.replace('.', '\\.')}` };
      } else {
        if (!ACAO_RE.test(acao)) throw new ErroPortal(400, 'validacao', undefined, { campos: { acao: 'Filtro inválido.' } });
        f.acao = acao;
      }
    }
    for (const [param, campo] of [['atorId', 'ator.userId'], ['alvoUserId', 'alvoUserId']]) {
      const v = lerFiltroTexto(q[param], param);
      if (v) {
        if (!ID_RE.test(v)) throw new ErroPortal(400, 'validacao', undefined, { campos: { [param]: 'Identificador inválido.' } });
        f[campo] = v;
      }
    }
    const entidadeTipo = lerFiltroTexto(q.entidadeTipo, 'entidadeTipo');
    if (entidadeTipo) f['entidade.tipo'] = entidadeTipo;
    const entidadeId = lerFiltroTexto(q.entidadeId, 'entidadeId');
    if (entidadeId) f['entidade.id'] = entidadeId;
    const cursoId = lerFiltroTexto(q.cursoId, 'cursoId');
    if (cursoId) f.cursoId = cursoId;
    const de = q.de === undefined || q.de === '' ? null : validarDataCalendario(String(q.de));
    const ate = q.ate === undefined || q.ate === '' ? null : validarDataCalendario(String(q.ate));
    if ((q.de && !de) || (q.ate && !ate)) throw new ErroPortal(400, 'validacao', undefined, { campos: { [q.de && !de ? 'de' : 'ate']: 'Data inválida.' } });
    if (de || ate) {
      // Dias do calendário de São Paulo (UTC−3): 00:00 local = 03:00 UTC.
      f.em = {};
      if (de) f.em.$gte = new Date(`${de}T03:00:00.000Z`);
      if (ate) f.em.$lt = new Date(new Date(`${ate}T03:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);
    }
    const objeto = q.objeto === undefined || q.objeto === '' ? null : q.objeto;
    if (objeto !== null) {
      if (typeof objeto !== 'string' || objeto.length > 254) throw new ErroPortal(400, 'formato-invalido');
      const o = objeto.trim();
      const email = o.includes('@') ? validarEmail(o) : null;
      if (email) {
        const u = await repo('users').findOne({ email }, { projection: { _id: 1 } });
        if (!u) return null;
        f.alvoUserId = String(u._id);
      } else {
        const alvo = OBJETOS.find(x => x.re.test(o.toUpperCase()));
        if (!alvo) throw new ErroPortal(400, 'validacao', undefined, { campos: { objeto: 'Use um número MAT, ATD, OUV, um código DEC, FRQ, AVL, CTR ou um e-mail.' } });
        const doc = await repo(alvo.colecao).findOne({ [alvo.campo]: o.toUpperCase() }, { projection: { _id: 1 } });
        if (!doc) return null;
        f['entidade.id'] = String(doc._id);
      }
    }
    return f;
  }

  async function nomesDe(ids) {
    const validos = [...new Set(ids.filter(id => typeof id === 'string' && ID_RE.test(id)))];
    if (!validos.length) return new Map();
    const us = await repo('users').find({ _id: { $in: validos.map(id => new ObjectId(id)) } }, { projection: { nome: 1, email: 1 } }).toArray();
    return new Map(us.map(u => [String(u._id), u.nome || String(u.email || '').split('@')[0]]));
  }

  async function saida(docs) {
    const nomes = await nomesDe(docs.flatMap(d => [d.ator?.userId, d.alvoUserId]));
    return docs.map(d => ({
      em: iso(d.em), acao: d.acao,
      ator: { userId: d.ator?.userId ?? null, nome: d.ator?.userId ? (nomes.get(d.ator.userId) ?? null) : null, papel: d.ator?.papel ?? null, ipTruncado: d.ator?.ipTruncado ?? null },
      alvo: d.alvoUserId ? { userId: d.alvoUserId, nome: nomes.get(d.alvoUserId) ?? null } : null,
      entidade: d.entidade ?? null, mudancas: d.mudancas ?? null, motivo: d.motivo ?? null, extra: d.extra ?? null, estado: d.estado
    }));
  }

  router.get('/auditoria', async (req, res) => {
    const q = req.query || {};
    const csv = q.formato === 'csv';
    if (q.formato !== undefined && !csv) throw new ErroPortal(400, 'validacao', undefined, { campos: { formato: 'Formato desconhecido.' } });
    const filtro = await montarFiltro(q);
    if (csv) {
      const docs = filtro ? await repo('auditoria').find(filtro, { sort: { em: -1, _id: -1 }, limit: LIMITE_LINHAS_CSV + 1 }).toArray() : [];
      if (docs.length > LIMITE_LINHAS_CSV) throw new ErroPortal(413, 'relatorio-grande');
      const itens = await saida(docs);
      await auditoria.registrar({ acao: 'relatorio.exportado', entidade: { tipo: 'relatorio', id: 'auditoria' }, extra: { linhas: itens.length } }, req);
      const linhas = itens.map(i => ({
        em: i.em ? new Date(i.em) : null, acao: i.acao, atorNome: i.ator.nome ?? (i.ator.papel === 'sistema' ? 'Sistema' : ''), atorPapel: i.ator.papel,
        atorRede: i.ator.ipTruncado, alvoNome: i.alvo?.nome ?? '', entidade: i.entidade ? `${i.entidade.tipo}:${i.entidade.id}` : '',
        mudancas: i.mudancas ? i.mudancas.map(m => `${m.campo}: ${JSON.stringify(m.de)} → ${JSON.stringify(m.para)}`).join('; ') : '',
        motivo: i.motivo ?? '', estado: i.estado
      }));
      return enviarCsv(res, 'auditoria', COLUNAS_CSV, linhas, { agora });
    }
    const { pagina, porPagina, pular } = lerPagina(q, { porPaginaPadrao: 50, max: 100 });
    if (!filtro) return res.json({ itens: [], pagina, porPagina, total: 0, totalPaginas: 1 });
    const [docs, total] = await Promise.all([
      repo('auditoria').find(filtro, { sort: { em: -1, _id: -1 }, skip: pular, limit: porPagina }).toArray(),
      repo('auditoria').countDocuments(filtro)
    ]);
    res.json({ itens: await saida(docs), pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) });
  });

  return router;
}

/** Montagem no agregador (API §5.1). */
export default async function montar(ctx) {
  const c = ctx.comum;
  criarRotaAuditoria({ router: ctx.rotas.admin, repo: c.repo, auditoria: c.auditoria, agora: c.agora });
}
