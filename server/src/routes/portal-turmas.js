// =============================================================
// COMPLEXO DMC · Portal — rotas de turmas e matrículas (secretaria)
// PORTAL-API §6.8.1–§6.8.2, §4.4 (secretaria.*), §8.1–§8.2 ·
// índice §8.1 (F4a), D-24, D-30, D-49, D-78, D-79 · dono: F4a.
//
//   /api/portal/admin/turmas[...]            (só admin)
//   /api/portal/admin/matriculas[...]        (só admin)
//   /api/portal/professor/cursos/:cursoId/turmas   (docente · admin)
//
// montar(ctx) registra os serviços de nome fixo secretaria.* (os
// primeiros da fase 1: F1a, F2, F3a, F3b, F4b, F5, F7 e F8 consomem),
// os índices de `turmas`/`matriculas` e as contribuições aos grupos
// `painel` (bloco alunos), `cascata` e `exportador` (matriculas).
// =============================================================
import { Router } from 'express';
import { ErroPortal } from '../portal/erros.js';
import {
  lerTexto, lerEnum, lerBooleano, lerInteiro, lerPagina, regexBusca, validarDataCalendario, validarEmail, ID_RE, ID_LEGADO_RE
} from '../portal/validacao.js';
import { CODIGO_TURMA_RE } from '../portal/codigos.js';
import { papelDe } from '../portal/papeis.js';
import { criarSecretaria, NOMES_SERVICOS } from '../portal/secretaria/matriculas.js';
import {
  INDICES_SECRETARIA, MODALIDADES, STATUS_MATRICULA, STATUS_TURMA, ORIGENS, STATUS_VIGENTE,
  criarRepositorios, matriculaPublica, turmaPublica, statusDaTurma, hex, paraObjectId, turmaCodigoAtual, ROTULOS_STATUS
} from '../portal/secretaria/repositorios.js';

const POR_PAGINA_MATRICULAS = 50;
const MAX_LOTE = 500;

const assincrona = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const corpoDe = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

function exigirVersao(corpo) {
  return lerInteiro(corpo.versao, { min: 1, max: 1e9, obrigatorio: true }, 'versao');
}

function lerMotivo(corpo, { obrigatorio = true } = {}) {
  return lerTexto(corpo, 'motivo', { min: 10, max: 500, obrigatorio, multilinha: true });
}

function lerData(valor, campo, { obrigatorio = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new ErroPortal(400, 'validacao', undefined, { campos: { [campo]: 'Informe a data.' } });
    return null;
  }
  if (typeof valor !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { [campo]: 'Formato inválido.' } });
  const d = validarDataCalendario(valor);
  if (!d) throw new ErroPortal(400, 'validacao', undefined, { campos: { [campo]: 'Use uma data válida (AAAA-MM-DD).' } });
  return d;
}

/** 'AAAA-MM-DD' (meia-noite em São Paulo) ou instante ISO → Date. */
function lerInstante(valor, campo, { obrigatorio = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new ErroPortal(400, 'validacao', undefined, { campos: { [campo]: 'Informe a data.' } });
    return null;
  }
  if (typeof valor !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { [campo]: 'Formato inválido.' } });
  const dia = validarDataCalendario(valor);
  if (dia) return new Date(`${dia}T03:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(valor)) {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new ErroPortal(400, 'validacao', undefined, { campos: { [campo]: 'Use uma data válida (AAAA-MM-DD).' } });
}

function lerCodigoTurma(corpo, { obrigatorio = false } = {}) {
  const bruto = lerTexto(corpo, 'codigo', { max: 24, obrigatorio });
  if (bruto === null) return null;
  const codigo = bruto.toUpperCase();
  if (!CODIGO_TURMA_RE.test(codigo)) {
    throw new ErroPortal(400, 'validacao', undefined, { campos: { codigo: 'Use de 3 a 24 caracteres: letras maiúsculas, números e hífen (ex.: APE-2026-01).' } });
  }
  return codigo;
}

const naoEncontrado = (texto = 'Não encontrado.') => new ErroPortal(404, null, texto);

/**
 * Fábrica pura das rotas (testável com falsos, padrão bolsas.test.js).
 * @param {{ secretaria: object, repo: Function, acesso: object, servicos: object, agora?: () => Date, log?: Console }} deps
 * @returns {{ admin: Router, professor: Router }}
 */
export function criarRotasTurmas({ secretaria, repo, acesso, servicos, agora = () => new Date(), log = console } = {}) {
  if (!secretaria) throw new Error('criarRotasTurmas: informe secretaria.');
  if (typeof repo !== 'function') throw new Error('criarRotasTurmas: informe repo.');
  if (!acesso) throw new Error('criarRotasTurmas: informe acesso.');
  if (!servicos) throw new Error('criarRotasTurmas: informe servicos.');
  const r = criarRepositorios({ repo });
  const admin = Router();
  const professor = Router();

  async function cursoOu404(cursoId, campo = 'cursoId') {
    const id = typeof cursoId === 'string' && ID_LEGADO_RE.test(cursoId) ? cursoId : null;
    if (!id) throw new ErroPortal(404, null, 'Curso não encontrado.', { campos: { [campo]: 'Curso não encontrado.' } });
    const curso = await r.cursos().findOne({ _id: id }, { projection: { _id: 1, titulo: 1, sigla: 1 } });
    if (!curso) throw new ErroPortal(404, null, 'Curso não encontrado.', { campos: { [campo]: 'Curso não encontrado.' } });
    return curso;
  }

  async function turmaOu404(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw naoEncontrado('Turma não encontrada.');
    const t = await secretaria.lerTurma(id);
    if (!t) throw naoEncontrado('Turma não encontrada.');
    return t;
  }

  async function matriculaOu404(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw naoEncontrado('Matrícula não encontrada.');
    const m = await secretaria.lerMatricula(id);
    if (!m) throw naoEncontrado('Matrícula não encontrada.');
    return m;
  }

  async function titulosDosCursos(ids) {
    const lista = [...new Set(ids.filter(Boolean).map(String))];
    if (!lista.length) return new Map();
    const docs = await r.cursos().find({ _id: { $in: lista } }, { projection: { titulo: 1 } }).toArray();
    return new Map(docs.map(c => [String(c._id), c.titulo ?? null]));
  }

  /** Situação do contrato por matrícula (F4b). Sem o serviço → null (a chave é omitida). */
  async function situacaoDosContratos(matriculaIds) {
    const f = servicos.tentar('contratos.situacaoPorMatricula');
    if (typeof f !== 'function') return null;
    try {
      const mapa = await f(matriculaIds);
      return mapa instanceof Map ? mapa : new Map(Object.entries(mapa || {}));
    } catch (err) {
      try { (log.warn || log.error).call(log, `[portal] contratos.situacaoPorMatricula falhou: ${err?.message || err}`); } catch { /* nada */ }
      return null;
    }
  }

  // ===============================================================
  // TURMAS (admin)
  // ===============================================================
  admin.get('/turmas', assincrona(async (req, res) => {
    const filtro = {};
    const cursoId = typeof req.query.cursoId === 'string' && req.query.cursoId ? req.query.cursoId : null;
    if (cursoId) {
      if (!ID_LEGADO_RE.test(cursoId)) return res.json({ itens: [] });
      filtro.cursoId = cursoId;
    }
    const status = typeof req.query.status === 'string' && STATUS_TURMA.includes(req.query.status) ? req.query.status : null;
    const momento = agora();
    const turmas = await r.turmas().find(filtro).sort({ inicio: -1 }).limit(1000).toArray();
    const titulos = await titulosDosCursos(turmas.map(t => t.cursoId));
    const itens = [];
    for (const t of turmas) {
      if (status && statusDaTurma(t, momento) !== status) continue;
      itens.push(turmaPublica(t, { agora: momento, cursoTitulo: titulos.get(t.cursoId) ?? null, alunos: await secretaria.contarAlunosDaTurma(t._id) }));
    }
    res.json({ itens });
  }));

  admin.post('/turmas', assincrona(async (req, res) => {
    const corpo = corpoDe(req);
    const cursoIdBruto = lerTexto(corpo, 'cursoId', { max: 64, obrigatorio: true });
    const codigo = lerCodigoTurma(corpo);
    const nome = lerTexto(corpo, 'nome', { max: 120 });
    const inicio = lerData(corpo.inicio, 'inicio', { obrigatorio: true });
    const fim = lerData(corpo.fim, 'fim');
    const modalidade = lerEnum(corpo.modalidade, MODALIDADES, 'modalidade', { obrigatorio: true });
    if (fim && fim < inicio) throw new ErroPortal(400, 'validacao', undefined, { campos: { fim: 'O fim não pode ser antes do início.' } });
    const curso = await cursoOu404(cursoIdBruto);
    const doc = await secretaria.criarTurma({ curso, codigo, nome, inicio, fim, modalidade, req });
    res.status(201).json({ turma: turmaPublica(doc, { agora: agora(), cursoTitulo: curso.titulo ?? null, alunos: 0 }) });
  }));

  admin.put('/turmas/:id', assincrona(async (req, res) => {
    const t = await turmaOu404(req.params.id);
    const corpo = corpoDe(req);
    const versao = exigirVersao(corpo);
    if (corpo.cursoId !== undefined && corpo.cursoId !== t.cursoId) {
      throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoId: 'O curso da turma não pode ser alterado.' } });
    }
    const mudancas = {};
    if (corpo.codigo !== undefined) mudancas.codigo = lerCodigoTurma(corpo, { obrigatorio: true });
    if (corpo.nome !== undefined) mudancas.nome = lerTexto(corpo, 'nome', { max: 120 });
    if (corpo.inicio !== undefined) mudancas.inicio = lerData(corpo.inicio, 'inicio', { obrigatorio: true });
    if (corpo.fim !== undefined) mudancas.fim = lerData(corpo.fim, 'fim');
    if (corpo.modalidade !== undefined) mudancas.modalidade = lerEnum(corpo.modalidade, MODALIDADES, 'modalidade', { obrigatorio: true });
    const doc = await secretaria.alterarTurma(t._id, mudancas, { versao, req });
    const titulos = await titulosDosCursos([doc.cursoId]);
    res.json({ turma: turmaPublica(doc, { agora: agora(), cursoTitulo: titulos.get(doc.cursoId) ?? null, alunos: await secretaria.contarAlunosDaTurma(doc._id) }) });
  }));

  admin.post('/turmas/:id/encerrar', assincrona(async (req, res) => {
    const t = await turmaOu404(req.params.id);
    const motivo = lerTexto(corpoDe(req), 'motivo', { max: 500, multilinha: true });
    const doc = await secretaria.encerrarTurma(t._id, { motivo, req });
    res.json({ turma: turmaPublica(doc, { agora: agora(), alunos: await secretaria.contarAlunosDaTurma(doc._id) }) });
  }));

  admin.delete('/turmas/:id', assincrona(async (req, res) => {
    const t = await turmaOu404(req.params.id);
    res.json(await secretaria.removerTurma(t._id, { req }));
  }));

  admin.post('/turmas/:id/matriculas', assincrona(async (req, res) => {
    const t = await turmaOu404(req.params.id);
    const ids = corpoDe(req).matriculaIds;
    if (!Array.isArray(ids) || !ids.length) throw new ErroPortal(400, 'validacao', undefined, { campos: { matriculaIds: 'Selecione ao menos uma matrícula.' } });
    if (ids.length > MAX_LOTE) throw new ErroPortal(400, 'validacao', undefined, { campos: { matriculaIds: `Selecione no máximo ${MAX_LOTE} matrículas por vez.` } });
    if (ids.some(i => typeof i !== 'string')) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { matriculaIds: 'Formato inválido.' } });
    const validos = [];
    const ignoradas = [];
    for (const id of ids) (ID_RE.test(id) ? validos : ignoradas).push(id);
    const r2 = await secretaria.enturmarEmLote(t._id, validos, { req });
    res.json({ enturmadas: r2.enturmadas, ignoradas: [...ignoradas.map(id => ({ id, motivo: 'Matrícula não encontrada.' })), ...r2.ignoradas] });
  }));

  // ===============================================================
  // MATRÍCULAS (admin)
  // ===============================================================
  async function filtroDeMatriculas(query) {
    const filtro = {};
    const vazio = { vazio: true };
    if (typeof query.cursoId === 'string' && query.cursoId) {
      if (!ID_LEGADO_RE.test(query.cursoId)) return vazio;
      filtro.cursoId = query.cursoId;
    }
    if (typeof query.turmaId === 'string' && query.turmaId) {
      if (query.turmaId === 'sem-turma') filtro.turmaId = null;
      else if (ID_RE.test(query.turmaId)) filtro.turmaId = paraObjectId(query.turmaId);
      else return vazio;
    }
    if (typeof query.status === 'string' && query.status && query.status !== 'todas') {
      if (!STATUS_MATRICULA.includes(query.status)) return vazio;
      filtro.status = query.status;
    }
    if (typeof query.origem === 'string' && query.origem) {
      if (!ORIGENS.includes(query.origem)) return vazio;
      filtro.origem = query.origem;
    }
    if (query.userId !== undefined) {
      // DC-73: aba Matrículas do aluno; id inválido → lista vazia.
      if (typeof query.userId !== 'string' || !ID_RE.test(query.userId)) return vazio;
      filtro.userId = query.userId;
    }
    if (typeof query.q === 'string' && query.q.trim()) {
      const q = query.q.trim();
      const ou = [];
      if (/^MAT-/i.test(q)) ou.push({ numero: { $regex: `^${q.toUpperCase().replace(/[^A-Z0-9-]/g, '')}` } });
      const termos = regexBusca(q);
      if (termos) {
        const users = await r.users()
          .find({ $and: termos.map(t => ({ $or: [{ nome: t }, { email: t }] })) }, { projection: { _id: 1 } })
          .limit(500).toArray();
        if (users.length) ou.push({ userId: { $in: users.map(u => hex(u._id)) } });
      }
      if (!ou.length) return vazio;
      filtro.$or = ou;
    }
    return filtro;
  }

  async function enriquecer(docs) {
    const userIds = [...new Set(docs.map(d => d.userId).filter(id => ID_RE.test(String(id))))];
    const [users, titulos, libs, turmas, contratos] = await Promise.all([
      userIds.length ? r.users().find({ _id: { $in: userIds.map(paraObjectId) } }, { projection: { nome: 1, email: 1 } }).toArray() : [],
      titulosDosCursos(docs.map(d => d.cursoId)),
      docs.length ? r.liberacoes().find({ $or: docs.map(d => ({ userId: d.userId, cursoId: d.cursoId })) }, { projection: { userId: 1, cursoId: 1 } }).toArray() : [],
      (async () => {
        const ids = [...new Set(docs.map(d => hex(d.turmaId)).filter(Boolean))];
        return ids.length ? r.turmas().find({ _id: { $in: ids.map(paraObjectId) } }, { projection: { codigo: 1 } }).toArray() : [];
      })(),
      situacaoDosContratos(docs.map(d => hex(d._id)))
    ]);
    const porUser = new Map(users.map(u => [hex(u._id), u]));
    const comAcesso = new Set(libs.map(l => `${l.userId}|${l.cursoId}`));
    const porTurma = new Map(turmas.map(t => [hex(t._id), t]));
    return docs.map(d => {
      const u = porUser.get(String(d.userId));
      const extras = {
        aluno: { id: String(d.userId), nome: u?.nome ?? null, email: u?.email ?? null },
        curso: { titulo: titulos.get(d.cursoId) ?? null },
        turma: d.turmaId ? porTurma.get(hex(d.turmaId)) || null : null,
        semAcesso: !comAcesso.has(`${d.userId}|${d.cursoId}`)
      };
      if (contratos) {
        const c = contratos.get(hex(d._id)) || null;
        extras.contrato = c ? { id: hex(c.id) ?? null, status: c.status ?? null } : null;
      }
      return { doc: d, extras };
    });
  }

  admin.get('/matriculas', assincrona(async (req, res) => {
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: POR_PAGINA_MATRICULAS, max: 100 });
    const filtro = await filtroDeMatriculas(req.query);
    if (filtro.vazio) return res.json({ itens: [], pagina, porPagina, total: 0, totalPaginas: 0 });
    const total = await r.matriculas().countDocuments(filtro);
    const docs = await r.matriculas().find(filtro).sort({ criadoEm: -1 }).skip(pular).limit(porPagina).toArray();
    const ricos = await enriquecer(docs);
    res.json({
      itens: ricos.map(({ doc, extras }) => matriculaPublica(doc, extras)),
      pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina)
    });
  }));

  // L7 (acréscimo F4a): liberações ainda sem matrícula vigente, paginado.
  admin.get('/matriculas/sem-matricula', assincrona(async (req, res) => {
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: POR_PAGINA_MATRICULAS, max: 100 });
    const filtroLib = {};
    if (typeof req.query.cursoId === 'string' && req.query.cursoId) {
      if (!ID_LEGADO_RE.test(req.query.cursoId)) return res.json({ itens: [], pagina, porPagina, total: 0, totalPaginas: 0 });
      filtroLib.cursoId = req.query.cursoId;
    }
    const [libs, vigentes] = await Promise.all([
      r.liberacoes().find(filtroLib, { projection: { userId: 1, cursoId: 1, grantedAt: 1 } }).sort({ grantedAt: -1 }).toArray(),
      r.matriculas().find({ vigente: true, ...filtroLib }, { projection: { userId: 1, cursoId: 1 } }).toArray()
    ]);
    const tem = new Set(vigentes.map(m => `${m.userId}|${m.cursoId}`));
    const sem = libs.filter(l => !tem.has(`${l.userId}|${l.cursoId}`));
    const pag = sem.slice(pular, pular + porPagina);
    const ids = [...new Set(pag.map(l => String(l.userId)).filter(id => ID_RE.test(id)))];
    const [users, titulos] = await Promise.all([
      ids.length ? r.users().find({ _id: { $in: ids.map(paraObjectId) } }, { projection: { nome: 1, email: 1 } }).toArray() : [],
      titulosDosCursos(pag.map(l => l.cursoId))
    ]);
    const porUser = new Map(users.map(u => [hex(u._id), u]));
    res.json({
      itens: pag.map(l => ({
        aluno: { id: String(l.userId), nome: porUser.get(String(l.userId))?.nome ?? null, email: porUser.get(String(l.userId))?.email ?? null },
        cursoId: l.cursoId, cursoTitulo: titulos.get(l.cursoId) ?? null,
        liberadoEm: l.grantedAt instanceof Date ? l.grantedAt.toISOString() : l.grantedAt ?? null
      })),
      pagina, porPagina, total: sem.length, totalPaginas: Math.ceil(sem.length / porPagina)
    });
  }));

  admin.post('/matriculas/sincronizar', assincrona(async (req, res) => {
    const r2 = await secretaria.sincronizar({ aplicar: true, origem: 'migracao', req });
    res.json(r2);
  }));

  async function detalhe(doc) {
    const [{ extras }] = await enriquecer([doc]);
    const saida = matriculaPublica(doc, { ...extras, completa: true });
    const resumoMatricula = servicos.tentar('academico.resumoMatricula');
    if (typeof resumoMatricula === 'function') {
      try {
        saida.resumo = await resumoMatricula(hex(doc._id), { visao: 'admin' });
      } catch (err) {
        try { (log.warn || log.error).call(log, `[portal] academico.resumoMatricula falhou: ${err?.message || err}`); } catch { /* nada */ }
      }
    }
    return saida;
  }

  admin.get('/matriculas/:id', assincrona(async (req, res) => {
    const m = await matriculaOu404(req.params.id);
    res.json({ matricula: await detalhe(m) });
  }));

  admin.post('/matriculas', assincrona(async (req, res) => {
    const corpo = corpoDe(req);
    const emailBruto = lerTexto(corpo, 'email', { max: 254, obrigatorio: true });
    const email = validarEmail(emailBruto);
    if (!email) throw new ErroPortal(400, 'validacao', undefined, { campos: { email: 'Informe um e-mail válido.' } });
    const cursoIdBruto = lerTexto(corpo, 'cursoId', { max: 64, obrigatorio: true });
    const turmaIdBruto = corpo.turmaId === undefined || corpo.turmaId === null || corpo.turmaId === '' ? null : lerTexto(corpo, 'turmaId', { max: 24 });
    const inicioEm = lerInstante(corpo.inicioEm, 'inicioEm');
    const liberar = lerBooleano(corpo.liberarAcesso, 'liberarAcesso');
    const confirmar = lerBooleano(corpo.confirmarSemVerificacao, 'confirmarSemVerificacao') === true;
    const motivo = lerMotivo(corpo, { obrigatorio: false });

    const aluno = await r.users().findOne({ email }, { projection: { _id: 1, email: 1, nome: 1, emailVerificadoEm: 1, createdAt: 1, ultimoLoginEm: 1, desativadoEm: 1 } });
    if (!aluno) {
      throw new ErroPortal(404, null, 'Não há conta com este e-mail. O aluno precisa se cadastrar na tela de entrada antes da matrícula.', { campos: { email: 'Não há conta com este e-mail.' } });
    }
    const curso = await cursoOu404(cursoIdBruto);
    let turma = null;
    if (turmaIdBruto) {
      if (!ID_RE.test(turmaIdBruto)) throw new ErroPortal(404, null, 'Turma não encontrada.', { campos: { turmaId: 'Turma não encontrada.' } });
      turma = await secretaria.lerTurma(turmaIdBruto);
      if (!turma) throw new ErroPortal(404, null, 'Turma não encontrada.', { campos: { turmaId: 'Turma não encontrada.' } });
      if (turma.cursoId !== String(curso._id)) throw new ErroPortal(400, 'turma-de-outro-curso', undefined, { campos: { turmaId: 'A turma escolhida é de outro curso.' } });
    }
    const semVerificacao = !aluno.emailVerificadoEm;
    if (semVerificacao) {
      const conta = {
        criadaEm: aluno.createdAt instanceof Date ? aluno.createdAt.toISOString() : aluno.createdAt ?? null,
        ultimoLoginEm: aluno.ultimoLoginEm instanceof Date ? aluno.ultimoLoginEm.toISOString() : aluno.ultimoLoginEm ?? null
      };
      if (!confirmar) throw new ErroPortal(409, 'email-nao-verificado', undefined, { conta });
      if (!motivo) throw new ErroPortal(400, 'validacao', undefined, { campos: { motivo: 'Informe o motivo (10 a 500 caracteres).' } });
    }
    const { matricula, liberacaoCriada } = await secretaria.criarManual({
      aluno, curso, turma, inicioEm, liberarAcesso: liberar !== false, semVerificacao, motivo, req
    });
    res.status(201).json({
      matricula: matriculaPublica(matricula, {
        semAcesso: matricula.semAcesso, aluno: { id: hex(aluno._id), nome: aluno.nome ?? null, email: aluno.email },
        curso: { titulo: curso.titulo ?? null }, turma, completa: true
      }),
      liberacaoCriada
    });
  }));

  admin.put('/matriculas/:id/nome-em-documentos', assincrona(async (req, res) => {
    const m = await matriculaOu404(req.params.id);
    const corpo = corpoDe(req);
    const usar = lerEnum(corpo.usar, ['registro', 'social'], 'usar', { obrigatorio: true });
    const motivo = lerMotivo(corpo);
    const versao = exigirVersao(corpo);
    const doc = await secretaria.alterarNomeEmDocumentos(m, { usar, motivo, versao, req });
    res.json({ matricula: await detalhe(doc) });
  }));

  admin.put('/matriculas/:id/status', assincrona(async (req, res) => {
    const m = await matriculaOu404(req.params.id);
    const corpo = corpoDe(req);
    const status = lerEnum(corpo.status, STATUS_MATRICULA, 'status', { obrigatorio: true });
    const motivo = lerMotivo(corpo);
    const versao = exigirVersao(corpo);
    const revogarAcesso = lerBooleano(corpo.revogarAcesso, 'revogarAcesso');
    const garantirAcesso = lerBooleano(corpo.garantirAcesso, 'garantirAcesso');
    const doc = await secretaria.transicionar(m, status, {
      motivo, versao, req,
      ...(revogarAcesso !== null ? { revogarAcesso } : {}),
      ...(garantirAcesso !== null ? { garantirAcesso } : {})
    });
    res.json({ matricula: await detalhe(doc) });
  }));

  admin.put('/matriculas/:id/turma', assincrona(async (req, res) => {
    const m = await matriculaOu404(req.params.id);
    const corpo = corpoDe(req);
    const versao = exigirVersao(corpo);
    let turmaId = null;
    if (corpo.turmaId !== null && corpo.turmaId !== undefined && corpo.turmaId !== '') {
      if (typeof corpo.turmaId !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { turmaId: 'Formato inválido.' } });
      if (!ID_RE.test(corpo.turmaId)) throw new ErroPortal(404, null, 'Turma não encontrada.', { campos: { turmaId: 'Turma não encontrada.' } });
      turmaId = corpo.turmaId;
    }
    const doc = await secretaria.enturmar(m, turmaId, { versao, req });
    res.json({ matricula: await detalhe(doc) });
  }));

  admin.put('/matriculas/:id/inicio', assincrona(async (req, res) => {
    const m = await matriculaOu404(req.params.id);
    const corpo = corpoDe(req);
    const inicioEm = lerInstante(corpo.inicioEm, 'inicioEm', { obrigatorio: true });
    const motivo = lerMotivo(corpo);
    const versao = exigirVersao(corpo);
    const doc = await secretaria.alterarInicio(m, { inicioEm, motivo, versao, req });
    res.json({ matricula: await detalhe(doc) });
  }));

  // ===============================================================
  // PROFESSOR — turmas do curso (docente · admin)
  // ===============================================================
  professor.get('/cursos/:cursoId/turmas', assincrona(async (req, res) => {
    const cursoId = req.params.cursoId;
    if (!ID_LEGADO_RE.test(cursoId)) throw new ErroPortal(403, 'nao-docente');
    const visiveis = await acesso.turmasVisiveis(req, cursoId);
    if (Array.isArray(visiveis) && !visiveis.length) throw new ErroPortal(403, 'nao-docente');
    const curso = await r.cursos().findOne({ _id: cursoId }, { projection: { _id: 1 } });
    if (!curso) throw naoEncontrado('Curso não encontrado.');
    const todas = await secretaria.turmasDoCurso(cursoId);
    const permitidas = Array.isArray(visiveis) ? new Set(visiveis) : null;
    res.json({ itens: permitidas ? todas.filter(t => permitidas.has(t.id)) : todas });
  }));

  return { admin, professor };
}

// =================================================================
// Contribuições aos grupos (painel, cascata, exportador)
// =================================================================
/** Restrição de docência do relatório (API §4.2): null = sem restrição (admin); senão { cursoId → null|Set(turmas) }. */
async function escopoDoRelatorio(req, acesso) {
  if (!acesso || typeof acesso.contexto !== 'function') return null;
  const ctx = await acesso.contexto(req);
  if (ctx.papel === 'admin') return null;
  const mapa = new Map();
  for (const c of ctx.cursosDocenteGeral) mapa.set(c, null);
  for (const [c, turmas] of ctx.turmasDocente) if (!mapa.has(c)) mapa.set(c, new Set(turmas));
  return mapa;
}

/** Filtro de matrículas do relatório `alunos`, já com a docência aplicada. */
async function filtroDoRelatorio(req, filtros, acesso) {
  const f = {};
  const escopo = await escopoDoRelatorio(req, acesso);
  const cursoId = typeof filtros?.cursoId === 'string' && filtros.cursoId ? filtros.cursoId : null;
  const turmaId = typeof filtros?.turmaId === 'string' && filtros.turmaId ? filtros.turmaId : null;
  if (cursoId) {
    if (!ID_LEGADO_RE.test(cursoId)) throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoId: 'Curso inválido.' } });
    f.cursoId = cursoId;
  }
  if (turmaId) {
    if (turmaId === 'sem-turma') f.turmaId = null;
    else if (ID_RE.test(turmaId)) f.turmaId = paraObjectId(turmaId);
    else throw new ErroPortal(400, 'validacao', undefined, { campos: { turmaId: 'Turma inválida.' } });
  }
  if (typeof filtros?.status === 'string' && filtros.status && filtros.status !== 'todas') {
    if (!STATUS_MATRICULA.includes(filtros.status)) throw new ErroPortal(400, 'validacao', undefined, { campos: { status: 'Situação inválida.' } });
    f.status = filtros.status;
  } else {
    f.status = { $in: [...STATUS_VIGENTE, 'concluida'] };
  }
  if (escopo) {
    if (cursoId) {
      if (!escopo.has(cursoId)) throw new ErroPortal(403, 'nao-docente');
      const turmas = escopo.get(cursoId);
      if (turmas) {
        if (turmaId && !turmas.has(turmaId)) throw new ErroPortal(403, 'nao-docente');
        if (!turmaId) f.turmaId = { $in: [...turmas].map(paraObjectId).filter(Boolean) };
      }
    } else {
      const ou = [];
      for (const [c, turmas] of escopo) {
        ou.push(turmas ? { cursoId: c, turmaId: { $in: [...turmas].map(paraObjectId).filter(Boolean) } } : { cursoId: c });
      }
      if (!ou.length) return { vazio: true };
      f.$or = ou;
    }
  }
  return f;
}

function criarRelatorioAlunos({ repo, acesso, servicos, log = console }) {
  const r = criarRepositorios({ repo });
  const tentar = nome => (servicos && typeof servicos.tentar === 'function' ? servicos.tentar(nome) : null);
  const avisar = (texto, err) => { try { (log.warn || log.error).call(log, `[portal] relatório alunos: ${texto} (${err?.message || err})`); } catch { /* nada */ } };
  return {
    id: 'alunos',
    titulo: 'Alunos por curso e turma',
    papeis: ['professor', 'admin'],
    filtros: [
      { chave: 'cursoId', tipo: 'curso' },
      { chave: 'turmaId', tipo: 'turma' },
      { chave: 'status', tipo: 'enum', opcoes: [...STATUS_MATRICULA, 'todas'] },
      { chave: 'de', tipo: 'data' },
      { chave: 'ate', tipo: 'data' }
    ],
    colunas: [
      { chave: 'curso', rotulo: 'Curso', tipo: 'texto' },
      { chave: 'turma', rotulo: 'Turma', tipo: 'texto' },
      { chave: 'numero', rotulo: 'Nº matrícula', tipo: 'texto' },
      { chave: 'nome', rotulo: 'Nome', tipo: 'texto' },
      { chave: 'nomeSocial', rotulo: 'Nome social', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto', somenteAdmin: true },
      { chave: 'celular', rotulo: 'Celular', tipo: 'texto', somenteAdmin: true },
      { chave: 'status', rotulo: 'Situação da matrícula', tipo: 'status' },
      { chave: 'inicio', rotulo: 'Início', tipo: 'data' },
      { chave: 'progressoPct', rotulo: 'Progresso %', tipo: 'numero' },
      { chave: 'situacao', rotulo: 'Situação acadêmica', tipo: 'texto' },
      { chave: 'documentosPendentes', rotulo: 'Documentos pendentes', tipo: 'numero', somenteAdmin: true },
      { chave: 'contrato', rotulo: 'Contrato', tipo: 'texto', somenteAdmin: true },
      { chave: 'lancamentosEmAtraso', rotulo: 'Lançamentos em atraso', tipo: 'numero', somenteAdmin: true }
    ],
    async consultar(req, filtros = {}, { limite = 20000 } = {}) {
      const f = await filtroDoRelatorio(req, filtros, acesso);
      if (f.vazio) return [];
      const docs = await r.matriculas().find(f).sort({ cursoId: 1, inicioEm: 1 }).limit(limite + 1).toArray();
      const admin = papelDe(req?.user) === 'admin';
      const ids = [...new Set(docs.map(d => d.userId).filter(id => ID_RE.test(String(id))))];
      const [users, perfis, cursos, turmas] = await Promise.all([
        ids.length ? r.users().find({ _id: { $in: ids.map(paraObjectId) } }, { projection: { nome: 1, email: 1 } }).toArray() : [],
        ids.length ? r.perfis().find({ userId: { $in: ids } }, { projection: { userId: 1, nomeSocial: 1, celular: 1 } }).toArray() : [],
        r.cursos().find({ _id: { $in: [...new Set(docs.map(d => d.cursoId))] } }, { projection: { titulo: 1 } }).toArray(),
        (async () => {
          const t = [...new Set(docs.map(d => hex(d.turmaId)).filter(Boolean))];
          return t.length ? r.turmas().find({ _id: { $in: t.map(paraObjectId) } }, { projection: { codigo: 1 } }).toArray() : [];
        })()
      ]);
      const porUser = new Map(users.map(u => [hex(u._id), u]));
      const porPerfil = new Map(perfis.map(p => [String(p.userId), p]));
      const porCurso = new Map(cursos.map(c => [String(c._id), c.titulo ?? null]));
      const porTurma = new Map(turmas.map(t => [hex(t._id), t.codigo]));
      const progresso = tentar('estudos.progressoDoCurso');
      const situacao = tentar('academico.situacaoDoCurso');
      const pendencias = admin ? tentar('secretaria.pendenciasDoAluno') : null;
      const financeiro = admin ? tentar('financeiro.resumoDoAluno') : null;
      const situacaoContratos = admin ? tentar('contratos.situacaoPorMatricula') : null;
      let contratos = null;
      if (typeof situacaoContratos === 'function') {
        try { const m = await situacaoContratos(docs.map(d => hex(d._id))); contratos = m instanceof Map ? m : new Map(Object.entries(m || {})); } catch (err) { avisar('contratos indisponíveis', err); }
      }
      const memoAluno = new Map();
      const linhas = [];
      for (const d of docs) {
        const u = porUser.get(String(d.userId));
        const p = porPerfil.get(String(d.userId));
        const linha = {
          curso: porCurso.get(d.cursoId) ?? d.cursoId,
          turma: d.turmaId ? (porTurma.get(hex(d.turmaId)) ?? turmaCodigoAtual(d)) : 'Sem turma',
          numero: d.numero,
          nome: u?.nome ?? null,
          nomeSocial: p?.nomeSocial ?? null,
          status: ROTULOS_STATUS[d.status] || d.status,
          inicio: d.inicioEm instanceof Date ? d.inicioEm.toISOString() : d.inicioEm ?? null,
          progressoPct: null,
          situacao: null
        };
        if (admin) Object.assign(linha, { email: u?.email ?? null, celular: p?.celular ?? null, documentosPendentes: null, contrato: null, lancamentosEmAtraso: null });
        try { if (typeof progresso === 'function') linha.progressoPct = (await progresso(d.userId, d.cursoId))?.pct ?? null; } catch (err) { avisar('progresso indisponível', err); }
        try { if (typeof situacao === 'function') linha.situacao = (await situacao(d.userId, d.cursoId))?.situacaoRotulo ?? null; } catch (err) { avisar('situação indisponível', err); }
        if (admin) {
          if (contratos) { const c = contratos.get(hex(d._id)); linha.contrato = c ? ({ pendente: 'Pendente', assinado: 'Assinado', cancelado: 'Cancelado' }[c.status] || null) : null; }
          if (!memoAluno.has(d.userId)) {
            const extra = { documentosPendentes: null, lancamentosEmAtraso: null };
            try { if (typeof pendencias === 'function') { const pd = await pendencias(d.userId); extra.documentosPendentes = Array.isArray(pd?.documentos) ? pd.documentos.length : null; } } catch (err) { avisar('pendências indisponíveis', err); }
            try { if (typeof financeiro === 'function') { const fr = await financeiro(d.userId); extra.lancamentosEmAtraso = Array.isArray(fr?.itens) ? fr.itens.filter(i => i.status === 'atrasado').length : null; } } catch (err) { avisar('financeiro indisponível', err); }
            memoAluno.set(d.userId, extra);
          }
          Object.assign(linha, memoAluno.get(d.userId));
        }
        linhas.push(linha);
      }
      return linhas;
    },
    async resumir(req, filtros = {}) {
      const f = await filtroDoRelatorio(req, { ...filtros, status: 'todas' }, acesso);
      if (f.vazio) return { kpis: [], series: [] };
      delete f.status;
      const base = { ...f };
      const [ativas, trancadas] = await Promise.all([
        r.matriculas().find({ ...base, status: 'ativa' }, { projection: { turmaId: 1, enturmacoes: 1 } }).toArray(),
        r.matriculas().countDocuments({ ...base, status: 'trancada' })
      ]);
      // Turma escolhida (ou docência só de turma): "sem turma" está fora do filtro → 0 dentro dele.
      const semTurma = Object.hasOwn(base, 'turmaId') && base.turmaId !== null
        ? 0
        : await r.matriculas().countDocuments({ ...base, vigente: true, turmaId: null });
      let concluidas = null;
      let nota = null;
      const de = typeof filtros.de === 'string' ? filtros.de : null;
      const ate = typeof filtros.ate === 'string' ? filtros.ate : null;
      if (de || ate) {
        const periodo = {};
        if (de) periodo.$gte = new Date(`${de}T03:00:00.000Z`);
        if (ate) periodo.$lt = new Date(new Date(`${ate}T03:00:00.000Z`).getTime() + 24 * 3600 * 1000);
        concluidas = await r.matriculas().countDocuments({ ...base, status: 'concluida', concluidaEm: periodo });
      } else {
        nota = 'Informe o período (de/até) para contar as concluídas.';
      }
      const porTurma = new Map();
      for (const m of ativas) {
        const rotulo = m.turmaId ? (turmaCodigoAtual(m) || 'Turma') : 'Sem turma';
        porTurma.set(rotulo, (porTurma.get(rotulo) || 0) + 1);
      }
      return {
        kpis: [
          { chave: 'matriculasAtivas', rotulo: 'Matrículas ativas', valor: ativas.length, formato: 'numero' },
          { chave: 'semTurma', rotulo: 'Sem turma', valor: semTurma, formato: 'numero' },
          { chave: 'trancadas', rotulo: 'Trancadas', valor: trancadas, formato: 'numero' },
          { chave: 'concluidasNoPeriodo', rotulo: 'Concluídas no período', valor: concluidas, formato: 'numero', ...(nota ? { nota } : {}) }
        ],
        series: [{ chave: 'alunosPorTurma', rotulo: 'Alunos ativos por turma', formato: 'numero', pontos: [...porTurma].map(([rotulo, valor]) => ({ rotulo, valor })) }]
      };
    }
  };
}

function criarContribuicoes({ secretaria, repo, acesso = null, servicos = null, log = console }) {
  const r = criarRepositorios({ repo });
  return {
    relatorio: criarRelatorioAlunos({ repo, acesso, servicos, log }),
    painel: {
      bloco: 'alunos',
      chaves: ['comAcesso', 'comMatriculaAtiva', 'liberacoesSemMatricula'],
      papeis: ['admin'],
      async contar(_req, escopo = {}) {
        const cursoIds = Array.isArray(escopo?.cursoIds) ? escopo.cursoIds.map(String) : null;
        const f = cursoIds ? { cursoId: { $in: cursoIds } } : {};
        const [libs, ativas, vigentes] = await Promise.all([
          r.liberacoes().find(f, { projection: { userId: 1, cursoId: 1 } }).toArray(),
          r.matriculas().find({ ...f, status: 'ativa' }, { projection: { userId: 1 } }).toArray(),
          r.matriculas().find({ ...f, vigente: true }, { projection: { userId: 1, cursoId: 1 } }).toArray()
        ]);
        const tem = new Set(vigentes.map(m => `${m.userId}|${m.cursoId}`));
        return {
          comAcesso: new Set(libs.map(l => String(l.userId))).size,
          comMatriculaAtiva: new Set(ativas.map(m => String(m.userId))).size,
          liberacoesSemMatricula: libs.filter(l => !tem.has(`${l.userId}|${l.cursoId}`)).length
        };
      }
    },
    cascata: {
      dominio: 'secretaria',
      async bloqueios(alvo) {
        if (alvo?.tipo !== 'curso' || !alvo.id) return 0;
        return r.matriculas().countDocuments({ cursoId: String(alvo.id), status: { $in: [...STATUS_VIGENTE, 'concluida'] } });
      },
      async apagar(alvo) {
        if (alvo?.tipo !== 'curso' || !alvo.id) return;
        const turmas = await r.turmas().find({ cursoId: String(alvo.id) }).toArray();
        for (const t of turmas) {
          if (!(await secretaria.registrosDaTurma(t))) await r.turmas().deleteOne({ _id: t._id });
        }
      }
    },
    exportador: {
      dominio: 'matriculas',
      async exportar(userId) {
        const lista = await secretaria.matriculasDoAluno(userId);
        return { matriculas: lista.map(m => matriculaPublica(m, { completa: true })) };
      }
    }
  };
}

/** Módulo do agregador (API §5.1). Sem E/S: só registra rotas, serviços, grupos e índices. */
export default async function montar(ctx) {
  const { rotas, servicos, comum } = ctx;
  comum.registrarIndices(INDICES_SECRETARIA);
  const secretaria = criarSecretaria({
    repo: comum.repo, auditoria: comum.auditoria, notificacoes: comum.notificacoes, garantia: comum.garantia,
    agora: comum.agora, log: comum.log
  });
  for (const nome of NOMES_SERVICOS) servicos.registrar(`secretaria.${nome}`, secretaria[nome]);
  const contrib = criarContribuicoes({ secretaria, repo: comum.repo, acesso: comum.acesso, servicos, log: comum.log });
  servicos.adicionar('painel', contrib.painel);
  servicos.adicionar('relatorio', contrib.relatorio);
  servicos.adicionar('cascata', contrib.cascata);
  servicos.adicionar('exportador', contrib.exportador);
  const { admin, professor } = criarRotasTurmas({
    secretaria, repo: comum.repo, acesso: comum.acesso, servicos, agora: comum.agora, log: comum.log
  });
  rotas.admin.use(admin);
  rotas.professor.use(professor);
}

export { criarContribuicoes };
