// =============================================================
// COMPLEXO DMC · Portal do professor (/api/portal/professor/*)
// PORTAL-API §6.12, §4.2, §4.4 · índice §7.8, §8.4 (F8) · DC-73, D-54 · dono: F8.
//
// Todas as rotas ficam no Router `professor` do agregador, que já exige
// login e papel professor|admin (montar.js, passo 8). Aqui vale a regra
// de docência (API §4.2): professor vê só os cursos/turmas que leciona;
// admin vê tudo. Dados do aluno SÓ por `perfis.publicos` (nunca CPF, RG,
// endereço ou documentos).
//
// Números contados, nunca estimados (D7): cada contagem vem de um serviço
// de nome fixo (API §4.4); serviço ausente ou com falha → o campo vai
// `null` (a tela mostra "—" + motivo), nunca 0 inventado.
//
// Rotas:
//   GET    /resumo                         visão geral + contagens do menu
//   GET    /alunos/:userId/matriculas      seletor "Matrícula" da moldura (DC-73)
//   GET    /cursos/:cursoId/alunos         aba Alunos da turma / lista por curso
//   GET    /duvidas                        fila de dúvidas do docente
//   POST   /duvidas/:id/respostas          responde (formato legado + autorPapel)
//   PUT    /duvidas/:id/resolvida          marca/reabre
//   DELETE /duvidas/:id/respostas/:respId  apaga a própria resposta (admin: qualquer)
//
// Exportador `duvidas` (Meus dados, API §6.3.4): as dúvidas do próprio titular.
// =============================================================
import { Router } from 'express';
import { ErroPortal } from '../portal/erros.js';
import { lerTexto, lerEnum, lerPagina, lerIdLegado, ID_RE, regexBusca } from '../portal/validacao.js';
import { papelDe } from '../portal/papeis.js';
import {
  RESPOSTA_MAX, duvidaPublica, respostaPublica, novaResposta, notificarResposta, itensDaFila, objectIdOu, iso
} from './duvidas.js';

const STATUS_ROTULO = Object.freeze({ ativa: 'Ativa', trancada: 'Trancada', concluida: 'Concluída', cancelada: 'Cancelada' });
const VIGENTES = new Set(['ativa', 'trancada']);
const ALUNOS_POR_PAGINA = 50;
const DUVIDAS_POR_PAGINA = 50;
const LIMITE_DUVIDAS_ESCOPO = 2000;

const texto = v => (v === null || v === undefined ? null : String(v));
const hex = v => (v && typeof v === 'object' && typeof v.toHexString === 'function' ? v.toHexString() : texto(v));
const naoDocente = () => new ErroPortal(403, 'nao-docente');
const naoEncontrado = (mensagem = 'Não encontrado.') => new ErroPortal(404, null, mensagem);

/**
 * Fábrica das rotas do professor.
 * @param {{ repo: (nome:string)=>object, servicos: object, agora?: () => Date, log?: Console }} deps
 * @returns {Router}
 */
export function criarRotaPortalProfessor({ repo, servicos, agora = () => new Date(), log = console } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotaPortalProfessor: informe repo.');
  if (!servicos || typeof servicos.tentar !== 'function') throw new TypeError('criarRotaPortalProfessor: informe servicos.');
  const router = Router();

  const acesso = () => {
    const a = servicos.tentar('acesso');
    if (!a) throw new ErroPortal(503, 'servico-indisponivel');
    return a;
  };

  const avisar = (servico, err) => {
    try { log.warn(JSON.stringify({ nivel: 'aviso', evento: 'portal.professor', texto: `serviço ${servico} falhou; campo null`, erro: String(err?.message || err).slice(0, 200) })); } catch { /* nada */ }
  };

  /** Chama um serviço de nome fixo; ausente ou com falha → `null` (degradação honesta). */
  async function chamar(nome, ...args) {
    const f = servicos.tentar(nome);
    if (typeof f !== 'function') return null;
    try { return await f(...args); } catch (err) { avisar(nome, err); return null; }
  }

  /**
   * Escopo de docência do requisitante: [{ curso, escopo:'curso'|'turmas', turmaIds:S[] }].
   * Admin: todos os cursos com escopo 'curso'. Docência de professor rebaixado não vale (acesso.contexto).
   */
  async function escopo(req) {
    const ctx = await acesso().contexto(req);
    let cursoIds;
    if (ctx.papel === 'admin') {
      const todos = await repo('cursos').find({}, { projection: { _id: 1 } }).toArray();
      cursoIds = todos.map(c => String(c._id));
    } else {
      cursoIds = [...ctx.cursosDocente];
    }
    if (!cursoIds.length) return { ctx, itens: [] };
    const cursos = await repo('cursos')
      .find({ _id: { $in: cursoIds } }, { projection: { _id: 1, titulo: 1, sigla: 1, ordem: 1, capa: 1, capaArquivo: 1 } })
      .toArray();
    cursos.sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR'));
    const itens = cursos.map(curso => {
      const id = String(curso._id);
      const geral = ctx.papel === 'admin' || ctx.cursosDocenteGeral.has(id);
      return { curso, id, escopo: geral ? 'curso' : 'turmas', turmaIds: geral ? [] : [...(ctx.turmasDocente.get(id) || [])] };
    });
    return { ctx, itens };
  }

  // ---------- dúvidas visíveis ao docente ----------
  /** Filtro Mongo das dúvidas dos cursos do escopo (opcionalmente só de um curso). */
  async function duvidasDoEscopo(req, { cursoId = null, status = 'pendentes', limite = LIMITE_DUVIDAS_ESCOPO } = {}) {
    const { ctx, itens } = await escopo(req);
    let alvo = itens;
    if (cursoId) {
      alvo = itens.filter(i => i.id === cursoId);
      if (!alvo.length) throw naoDocente();
    }
    if (!alvo.length) return { ctx, docs: [], escopo: alvo };
    const filtro = { cursoId: { $in: alvo.map(i => i.id) } };
    if (status === 'pendentes') filtro.resolvida = { $ne: true };
    const docs = await repo('duvidas').find(filtro).sort({ createdAt: 1 }).limit(limite).toArray();
    // Docência só de turma: só dúvidas de alunos com matrícula nas suas turmas (API §4.2, regra uniforme).
    const soTurma = new Set(alvo.filter(i => i.escopo === 'turmas').map(i => i.id));
    if (!soTurma.size) return { ctx, docs, escopo: alvo };
    const cache = new Map();
    const visivel = async (userId) => {
      if (!cache.has(userId)) cache.set(userId, acesso().podeVerAluno(req, userId).catch(() => false));
      return cache.get(userId);
    };
    const out = [];
    for (const d of docs) {
      if (!soTurma.has(String(d.cursoId))) { out.push(d); continue; }
      if (await visivel(String(d.userId))) out.push(d);
    }
    return { ctx, docs: out, escopo: alvo };
  }

  /** Dúvida endereçada por id, visível ao requisitante (fora do escopo → 404, API §4.2 item 2). */
  async function duvidaVisivel(req, id) {
    const _id = objectIdOu(id);
    if (!_id) throw naoEncontrado('Dúvida não encontrada.');
    const d = await repo('duvidas').findOne({ _id });
    if (!d) throw naoEncontrado('Dúvida não encontrada.');
    const ctx = await acesso().contexto(req);
    if (ctx.papel === 'admin') return d;
    const c = String(d.cursoId || '');
    if (ctx.cursosDocenteGeral.has(c)) return d;
    if (ctx.turmasDocente.has(c) && await acesso().podeVerAluno(req, String(d.userId))) return d;
    throw naoEncontrado('Dúvida não encontrada.');
  }

  // =============================================================
  // GET /resumo
  // =============================================================
  router.get('/resumo', async (req, res, next) => {
    try {
      const { ctx, itens } = await escopo(req);
      const userId = ctx.userId;

      // Dúvidas sem resposta, por curso (contagem própria da F8).
      const pendentesPorCurso = new Map();
      if (itens.length) {
        const { docs } = await duvidasDoEscopo(req, { status: 'pendentes' });
        for (const d of docs) {
          if ((d.respostas || []).length) continue;
          const c = String(d.cursoId);
          pendentesPorCurso.set(c, (pendentesPorCurso.get(c) || 0) + 1);
        }
      }

      // Correções pendentes (F2): uma chamada para os cursos de escopo geral + uma por curso só de turma.
      const correcoes = new Map();
      let correcoesOk = servicos.tentar('avaliacoes.correcoesPendentes') !== null;
      if (correcoesOk && itens.length) {
        const gerais = itens.filter(i => i.escopo === 'curso').map(i => i.id);
        const lotes = [];
        if (gerais.length) lotes.push(chamar('avaliacoes.correcoesPendentes', gerais, {}));
        for (const i of itens.filter(x => x.escopo === 'turmas')) lotes.push(chamar('avaliacoes.correcoesPendentes', [i.id], { turmaIds: i.turmaIds }));
        const resultados = await Promise.all(lotes);
        if (resultados.some(r => r === null || typeof r !== 'object')) correcoesOk = false;
        else for (const r of resultados) for (const [c, n] of Object.entries(r)) correcoes.set(c, Number(n) || 0);
      }

      // Atendimentos (F6a): fila visível ao requisitante.
      const atend = itens.length ? await chamar('atendimento.abertosDoEscopo', req, itens.map(i => i.id)) : null;
      const atendOk = !!atend && typeof atend === 'object';

      const cursos = [];
      for (const i of itens) {
        const turmaIds = i.escopo === 'turmas' ? i.turmaIds : undefined;
        const [turmasCurso, contagem, encontros] = await Promise.all([
          chamar('secretaria.turmasDoCurso', i.id),
          chamar('secretaria.contagemAlunos', i.id, turmaIds ? { turmaIds } : {}),
          chamar('academico.encontrosDoEscopo', [i.id], { ...(turmaIds ? { turmaIds } : {}), dias: 7, limite: 20 })
        ]);
        const turmas = Array.isArray(turmasCurso)
          ? turmasCurso
            .filter(t => !turmaIds || turmaIds.includes(hex(t.id)))
            .map(t => ({ id: hex(t.id), codigo: t.codigo ?? null, nome: t.nome ?? null, status: t.status ?? null, modalidade: t.modalidade ?? null, alunos: Number.isFinite(t.alunos) ? t.alunos : null }))
          : null;
        cursos.push({
          id: i.id,
          titulo: i.curso.titulo || '',
          sigla: i.curso.sigla || null,
          capaUrl: null,
          escopo: i.escopo,
          turmas,
          alunosAtivos: contagem && Number.isFinite(contagem.ativos) ? contagem.ativos : null,
          // Acréscimo: matrículas vigentes sem turma (docência geral/admin; o docente só de turma não as vê).
          semTurma: contagem && Number.isFinite(contagem.semTurma) && i.escopo === 'curso' ? contagem.semTurma : null,
          correcoesPendentes: correcoesOk ? (correcoes.get(i.id) || 0) : null,
          duvidasPendentes: pendentesPorCurso.get(i.id) || 0,
          atendimentosAbertos: atendOk ? (Number(atend.porCurso?.[i.id]) || 0) : null,
          proximosEncontros: Array.isArray(encontros)
            ? encontros.map(e => ({ id: texto(e.id), titulo: e.titulo || '', inicioEm: iso(e.inicioEm), turmaCodigo: e.turmaCodigo ?? null, status: e.status ?? null }))
            : null
        });
      }

      const ouvidoria = await chamar('atendimento.ouvidoriaSemParecer', userId);
      res.json({
        papel: ctx.papel,
        cursos,
        atribuidosAMim: atendOk && Number.isFinite(Number(atend.atribuidos)) ? Number(atend.atribuidos) : null,
        ouvidoriaSemParecer: Number.isFinite(ouvidoria) ? ouvidoria : null
      });
    } catch (err) { next(err); }
  });

  // =============================================================
  // GET /alunos/:userId/matriculas  (DC-73: nada é materializado por esta leitura)
  // =============================================================
  router.get('/alunos/:userId/matriculas', async (req, res, next) => {
    try {
      const alvo = String(req.params.userId || '');
      if (!ID_RE.test(alvo)) throw naoEncontrado('Aluno não encontrado.');
      const a = acesso();
      if (!(await a.podeVerAluno(req, alvo))) throw naoEncontrado('Aluno não encontrado.');
      const ctx = await a.contexto(req);

      const svc = servicos.tentar('secretaria.matriculasDoAluno');
      if (typeof svc !== 'function') return res.json({ itens: null, semMatricula: null });
      let todas;
      try { todas = await svc(alvo); } catch (err) { avisar('secretaria.matriculasDoAluno', err); return res.json({ itens: null, semMatricula: null }); }

      const visiveis = [];
      for (const m of Array.isArray(todas) ? todas : []) {
        if (await a.podeVerMatricula(req, m)) visiveis.push(m);
      }
      const cursoIds = [...new Set([...visiveis.map(m => texto(m.cursoId)), ...(await a.cursosDoAluno(alvo))].filter(Boolean))];
      const cursos = cursoIds.length
        ? await repo('cursos').find({ _id: { $in: cursoIds } }, { projection: { _id: 1, titulo: 1 } }).toArray()
        : [];
      const titulo = new Map(cursos.map(c => [String(c._id), c.titulo || '']));

      const itens = visiveis.map(m => {
        const ent = Array.isArray(m.enturmacoes) && m.enturmacoes.length ? m.enturmacoes[m.enturmacoes.length - 1] : null;
        const turmaId = hex(m.turmaId) || (ent ? hex(ent.turmaId) : null);
        const status = texto(m.status);
        return {
          id: hex(m._id ?? m.id),
          numero: m.numero ?? null,
          cursoId: texto(m.cursoId),
          cursoTitulo: titulo.get(texto(m.cursoId)) ?? '',
          turma: turmaId ? { id: turmaId, codigo: ent?.turmaCodigo ?? null } : null,
          status,
          statusRotulo: STATUS_ROTULO[status] || status,
          inicioEm: iso(m.inicioEm),
          vigente: VIGENTES.has(status)
        };
      }).sort((x, y) => (Number(y.vigente) - Number(x.vigente)) || String(y.inicioEm || '').localeCompare(String(x.inicioEm || '')));

      const comMatricula = new Set(itens.map(i => i.cursoId));
      const semMatricula = (await a.cursosDoAluno(alvo))
        .filter(c => !comMatricula.has(c) && (ctx.papel === 'admin' || ctx.cursosDocenteGeral.has(c)))
        .map(c => ({ cursoId: c, cursoTitulo: titulo.get(c) ?? '' }));

      res.json({ itens, semMatricula });
    } catch (err) { next(err); }
  });

  // =============================================================
  // GET /cursos/:cursoId/alunos
  // =============================================================
  router.get('/cursos/:cursoId/alunos', async (req, res, next) => {
    try {
      const cursoId = lerIdLegado(req.params.cursoId);
      if (!cursoId) throw naoEncontrado('Curso não encontrado.');
      const a = acesso();
      const ctx = await a.contexto(req);
      if (ctx.papel !== 'admin' && !ctx.cursosDocente.has(cursoId)) throw naoDocente();
      const visiveis = await a.turmasVisiveis(req, cursoId); // null = todas
      const turmaId = typeof req.query.turmaId === 'string' && req.query.turmaId ? req.query.turmaId : null;
      if (turmaId && !ID_RE.test(turmaId)) throw naoEncontrado('Turma não encontrada.');
      if (turmaId && visiveis && !visiveis.includes(turmaId)) throw naoDocente();
      const situacao = lerEnum(typeof req.query.situacao === 'string' ? req.query.situacao : null,
        ['cursando', 'aprovado', 'em_recuperacao', 'reprovado', 'ativa', 'trancada', 'concluida', 'cancelada'], 'situacao');
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
      const { pagina, porPagina } = lerPagina(req.query, { porPaginaPadrao: ALUNOS_POR_PAGINA, max: ALUNOS_POR_PAGINA });

      const svc = servicos.tentar('secretaria.alunosDoCurso');
      if (typeof svc !== 'function') {
        return res.json({ itens: null, pagina, porPagina, total: null, totalPaginas: null, motivo: 'A lista de alunos depende do módulo de matrículas, ainda não disponível.' });
      }
      let lista;
      if (turmaId) lista = await svc({ cursoId, turmaId });
      else if (visiveis) {
        lista = [];
        for (const t of visiveis) lista.push(...(await svc({ cursoId, turmaId: t })));
      } else lista = await svc({ cursoId });
      lista = Array.isArray(lista) ? lista : [];
      if (situacao && STATUS_ROTULO[situacao]) lista = lista.filter(m => m.status === situacao);

      const perfis = (await chamar('perfis.publicos', [...new Set(lista.map(m => texto(m.userId)))])) || new Map();
      const termos = q ? regexBusca(q) : null;
      if (termos) {
        lista = lista.filter(m => {
          const p = perfis.get(texto(m.userId));
          if (!p) return false;
          const alvo = `${p.nome || ''} ${p.nomeSocial || ''} ${p.email || ''}`;
          return termos.every(re => re.test(alvo));
        });
      }

      // Situação acadêmica (F3a) e progresso (F1a), quando os serviços existem.
      const linhas = [];
      for (const m of lista) {
        const uid = texto(m.userId);
        const p = perfis.get(uid) || null;
        linhas.push({ m, uid, p });
      }
      const comSituacao = [];
      for (const l of linhas) {
        const [sit, prog] = await Promise.all([
          chamar('academico.situacaoDoCurso', l.uid, cursoId),
          chamar('estudos.progressoDoCurso', l.uid, cursoId)
        ]);
        comSituacao.push({ ...l, sit, prog });
      }
      let filtrada = comSituacao;
      if (situacao && !STATUS_ROTULO[situacao]) filtrada = comSituacao.filter(l => l.sit && l.sit.situacao === situacao);

      const total = filtrada.length;
      const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
      const pagina_ = filtrada.slice((pagina - 1) * porPagina, pagina * porPagina);
      res.json({
        itens: pagina_.map(({ m, uid, p, sit, prog }) => ({
          matriculaId: hex(m.matriculaId),
          numero: m.numero ?? null,
          aluno: p ? { id: uid, nome: p.nome ?? null, nomeSocial: p.nomeSocial ?? null, fotoUrl: p.fotoUrl ?? null, email: p.email ?? null } : { id: uid, nome: null, nomeSocial: null, fotoUrl: null, email: null },
          turmaCodigo: m.turmaCodigo ?? null,
          status: m.status ?? null,
          progressoPct: prog && Number.isFinite(prog.pct) ? prog.pct : null,
          mediaParcial: sit && Number.isFinite(sit.mediaParcial) ? sit.mediaParcial : null,
          frequenciaPct: sit && Number.isFinite(sit.frequenciaGeralPct) ? sit.frequenciaGeralPct : null,
          situacaoCurso: sit ? sit.situacao ?? null : null,
          aguardandoCorrecao: sit && Array.isArray(sit.modulos) ? sit.modulos.some(x => x.situacao === 'aguardando_correcao') : null,
          emRecuperacao: sit ? sit.situacao === 'em_recuperacao' : null,
          ultimaAtividadeEm: prog ? iso(prog.ultimaAtividadeEm) : null
        })),
        pagina, porPagina, total, totalPaginas
      });
    } catch (err) { next(err); }
  });

  // =============================================================
  // Dúvidas do docente
  // =============================================================
  router.get('/duvidas', async (req, res, next) => {
    try {
      const cursoId = typeof req.query.cursoId === 'string' && req.query.cursoId ? lerIdLegado(req.query.cursoId) : null;
      if (req.query.cursoId && !cursoId) throw naoDocente();
      const status = lerEnum(typeof req.query.status === 'string' && req.query.status ? req.query.status : 'pendentes',
        ['pendentes', 'respondidas', 'todas'], 'status');
      const { pagina, porPagina } = lerPagina(req.query, { porPaginaPadrao: DUVIDAS_POR_PAGINA, max: 100 });
      const { docs } = await duvidasDoEscopo(req, { cursoId, status: status === 'pendentes' ? 'pendentes' : 'todas' });
      let fila = docs;
      if (status === 'pendentes') fila = docs.filter(d => !(d.respostas || []).length);
      else if (status === 'respondidas') fila = docs.filter(d => (d.respostas || []).length);
      const semResposta = docs.filter(d => d.resolvida !== true && !(d.respostas || []).length).length;
      const total = fila.length;
      const pag = fila.slice((pagina - 1) * porPagina, pagina * porPagina);
      const base = await itensDaFila(repo, pag);
      // Acréscimos à forma da fila legada: cursoId, sigla e código da aula, resolvida e as respostas
      // (com autor e quando), que a tela do professor mostra (UX §7.8).
      const aulas = pag.length ? await repo('aulas').find({ _id: { $in: [...new Set(pag.map(d => d.aulaId))] } }, { projection: { _id: 1, codigo: 1 } }).toArray() : [];
      const codigo = new Map(aulas.map(x => [x._id, x.codigo || null]));
      const itens = base.map((it, k) => {
        const d = pag[k];
        const pub = duvidaPublica(d, req.user);
        return { ...it, cursoId: texto(d.cursoId), aulaCodigo: codigo.get(d.aulaId) ?? null, resolvida: !!d.resolvida, respostas: pub.respostas.map((r, j) => ({ ...r, minha: String(d.respostas[j]?.userId) === String(req.user._id) })) };
      });
      res.json({ itens, pendentes: semResposta, pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) });
    } catch (err) { next(err); }
  });

  router.post('/duvidas/:id/respostas', async (req, res, next) => {
    try {
      const d = await duvidaVisivel(req, req.params.id);
      const t = lerTexto(req.body, 'texto', { min: 2, max: RESPOSTA_MAX, obrigatorio: true, multilinha: true });
      const limpo = t.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      const resposta = novaResposta(req.user, limpo, agora());
      const { matchedCount } = await repo('duvidas').updateOne(
        { _id: d._id },
        { $push: { respostas: resposta }, $set: { resolvida: true, respondidaEm: resposta.createdAt } }
      );
      if (!matchedCount) throw naoEncontrado('Dúvida não encontrada.');
      await notificarResposta({ servicos, duvida: d, resposta, log });
      res.status(201).json({ resposta: respostaPublica(resposta) });
    } catch (err) { next(err); }
  });

  router.put('/duvidas/:id/resolvida', async (req, res, next) => {
    try {
      const d = await duvidaVisivel(req, req.params.id);
      const v = req.body?.resolvida;
      if (v !== undefined && typeof v !== 'boolean') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { resolvida: 'Formato inválido.' } });
      const resolvida = v !== false;
      await repo('duvidas').updateOne({ _id: d._id }, { $set: { resolvida } });
      res.json({ ok: true, resolvida });
    } catch (err) { next(err); }
  });

  router.delete('/duvidas/:id/respostas/:respId', async (req, res, next) => {
    try {
      const d = await duvidaVisivel(req, req.params.id);
      const respId = String(req.params.respId || '').trim();
      const r = (d.respostas || []).find(x => x.id === respId);
      if (!r) throw naoEncontrado('Resposta não encontrada.');
      if (papelDe(req.user) !== 'admin' && String(r.userId) !== String(req.user._id)) {
        throw new ErroPortal(403, 'papel-insuficiente', 'Você só pode apagar as próprias respostas.');
      }
      const restantes = (d.respostas || []).filter(x => x.id !== respId);
      await repo('duvidas').updateOne({ _id: d._id }, { $pull: { respostas: { id: respId } }, $set: { resolvida: restantes.length > 0 } });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
}

/** Exportador `duvidas` (Meus dados, API §6.3.4): só as próprias perguntas, sem dados de terceiros. */
export function criarExportadorDuvidas({ repo }) {
  return {
    dominio: 'duvidas',
    async exportar(userId) {
      const docs = await repo('duvidas').find({ userId: String(userId) }).sort({ createdAt: 1 }).limit(5000).toArray();
      return docs.map(d => ({
        id: String(d._id), aulaId: d.aulaId ?? null, cursoId: d.cursoId ?? null, texto: d.texto || '',
        criadaEm: iso(d.createdAt), resolvida: !!d.resolvida,
        respostas: (d.respostas || []).map(r => ({ autorPapel: r.autorPapel ?? null, texto: r.texto || '', em: iso(r.createdAt) }))
      }));
    }
  };
}

/** Contrato do agregador (API §5.1): síncrono no efeito e sem E/S. */
export default async function montar(ctx) {
  const { rotas, servicos, comum } = ctx;
  rotas.professor.use(criarRotaPortalProfessor({ repo: comum.repo, servicos, agora: comum.agora, log: comum.log }));
  servicos.adicionar('exportador', criarExportadorDuvidas({ repo: comum.repo }));
}
