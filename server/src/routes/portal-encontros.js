// =============================================================
// COMPLEXO DMC · /api/portal — agenda, encontros e presença automática
// PORTAL-API §6.7.2 (agenda, entrar, CRUD do professor, presenças, matriz
// da turma), §8.5–§8.7 · índice §8.1 (F3a) · dono: F3a.
//
// `lives` é a coleção do Encontro do blueprint: os campos novos (turmaId,
// moduloId, aulaGravadaId, cancelado…, versao) são da F3a; o legado
// /api/lives continua funcionando sobre os mesmos documentos (R8, R12).
// Presença = registrada ao entrar na sala pelo portal, na janela
// [início − 15 min, início + duração] (mesma regra do legado), idempotente.
// =============================================================
import { Router } from 'express';
import { erro } from '../portal/erros.js';
import { lerTexto, lerInteiro, lerId, validarUrlHttps } from '../portal/validacao.js';
import { sufixo } from '../portal/codigos.js';
import { papelDe } from '../portal/papeis.js';
import { bloqueiosEmCascata, apagarEmCascata } from '../portal/servicos.js';
import { criarServicoAcademico } from '../portal/academico/servico-academico.js';
import { hex, oidDe, formas } from '../portal/academico/repositorios.js';
import {
  calcularFrequencia, statusDoEncontro, janelaDoEncontro, encontroVisivel, DURACAO_PADRAO_MIN
} from '../portal/academico/calculo-academico.js';

export const LIMITE_RELATORIO = 300;
export const MAX_DIAS_AGENDA = 400;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const iso = d => (d instanceof Date ? d.toISOString() : (d ? new Date(d).toISOString() : null));
const assincrono = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const invalido = (campo, msg) => erro(400, 'validacao', undefined, { campos: { [campo]: msg } });

export const novoIdEncontro = (bytes) => `live-${sufixo(12, bytes)}`;

/** Data da query: 'AAAA-MM-DD' (dia em SP) ou ISO completo. */
function lerData(valor, campo, { fimDoDia = false } = {}) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw invalido(campo, 'Data inválida.');
  const d = DATA_RE.test(valor) ? new Date(`${valor}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}-03:00`) : new Date(valor);
  if (!Number.isFinite(d.getTime())) throw invalido(campo, 'Data inválida.');
  return d;
}

/** Mês corrente no fuso de SP: [dia 1 00:00, dia 1 do mês seguinte). */
function mesCorrenteSP(agora) {
  const sp = new Date(agora.getTime() - 3 * 3600000);
  const a = sp.getUTCFullYear();
  const m = sp.getUTCMonth();
  const de = new Date(Date.UTC(a, m, 1, 3));
  const ate = new Date(Date.UTC(a, m + 1, 1, 3));
  return { de, ate };
}

export function criarRotaEncontros(deps = {}) {
  const { repo, servicos } = deps;
  if (typeof repo !== 'function') throw new TypeError('criarRotaEncontros: informe repo.');
  if (!servicos) throw new TypeError('criarRotaEncontros: informe servicos.');
  const agora = deps.agora || (() => new Date());
  const log = deps.log || console;
  const bytes = deps.bytes;
  const svc = deps.svc || criarServicoAcademico({ ...deps, agora, log });
  const R = svc.R;
  const acesso = () => deps.acesso || servicos.obter('acesso');
  const auditoria = () => deps.auditoria || servicos.tentar('auditoria');
  const notificar = async (encontro, tipo, titulo) => {
    const n = deps.notificacoes || servicos.tentar('notificacoes');
    if (!n || typeof n.emitir !== 'function') return;
    try {
      const mats = await R.matriculasDoCurso({ cursoId: encontro.cursoId, status: ['ativa'] });
      const userIds = [...new Set(mats.filter(m => encontroVisivel(encontro, m)).map(m => String(m.userId)))];
      if (!userIds.length) return;
      await n.emitir({ userIds, tipo, titulo, texto: encontro.titulo || '', link: 'ao-vivo.html', entidade: { tipo: 'encontro', id: String(encontro._id) } });
    } catch (err) { try { (log.warn || log.error).call(log, `[portal] encontros: notificação falhou (${err.message})`); } catch { /* nada */ } }
  };

  // ---------------- leitura comum ----------------
  async function mapasDeApoio(encontros) {
    const moduloIds = [...new Set(encontros.map(e => e.moduloId).filter(Boolean).map(String))];
    const aulaIds = [...new Set(encontros.map(e => e.aulaGravadaId).filter(Boolean).map(String))];
    const [cursos, turmas, modulos, aulas] = await Promise.all([
      R.cursos(encontros.map(e => e.cursoId)),
      R.turmas(encontros.map(e => e.turmaId).filter(Boolean)),
      moduloIds.length ? repo('modulos').find({ _id: { $in: moduloIds } }).toArray() : [],
      aulaIds.length ? repo('aulas').find({ _id: { $in: aulaIds } }).toArray() : []
    ]);
    return { cursos, turmas, modulos: new Map(modulos.map(m => [String(m._id), m])), aulas: new Map(aulas.map(a => [String(a._id), a])) };
  }

  function encontroPublico(e, apoio, { momento, url, podeEntrar, presenca }) {
    const j = janelaDoEncontro(e);
    const mod = e.moduloId ? apoio.modulos.get(String(e.moduloId)) : null;
    const aula = e.aulaGravadaId ? apoio.aulas.get(String(e.aulaGravadaId)) : null;
    const turma = e.turmaId ? apoio.turmas.get(hex(e.turmaId)) : null;
    return {
      id: String(e._id),
      cursoId: String(e.cursoId),
      cursoTitulo: apoio.cursos.get(String(e.cursoId))?.titulo || '—',
      turma: turma ? { id: hex(turma._id), codigo: turma.codigo || null } : null,
      modulo: mod ? { id: String(mod._id), numero: mod.numero || null, titulo: mod.titulo || '' } : null,
      titulo: e.titulo || '',
      descricao: e.descricao || '',
      inicioEm: iso(e.inicioEm),
      fimEm: j ? iso(j.fim) : null,
      abreEm: j ? iso(j.abertura) : null,
      duracaoMin: Number(e.duracaoMin) || DURACAO_PADRAO_MIN,
      plataforma: e.plataforma || 'Online',
      status: statusDoEncontro(e, momento),
      motivoCancelamento: e.cancelado ? (e.motivoCancelamento || null) : null,
      aulaGravada: aula ? { id: String(aula._id), codigo: aula.codigo || null, titulo: aula.titulo || '' } : null,
      presenca: presenca ? { registradaEm: iso(presenca.registradaEm), origem: presenca.origem, codigo: presenca.codigo } : null,
      podeEntrar: !!podeEntrar,
      url: url || null,
      versao: Number(e.versao) || 1
    };
  }

  /** Escopo do aluno: matrículas vigentes + cursos liberados (liberação sem matrícula vê os encontros sem turma). */
  async function escopoDoAluno(userId) {
    const [mats, libs] = await Promise.all([
      svc.matriculasDoAluno(userId),
      repo('liberacoes').find({ userId: String(userId) }, { projection: { cursoId: 1 } }).toArray()
    ]);
    const vigentes = mats.filter(m => m.status === 'ativa' || m.status === 'trancada');
    const liberados = new Set(libs.map(l => String(l.cursoId)));
    const porCurso = new Map();
    for (const m of vigentes) if (!porCurso.has(String(m.cursoId))) porCurso.set(String(m.cursoId), m);
    const cursos = [...new Set([...liberados, ...porCurso.keys()])];
    return { porCurso, liberados, cursos };
  }

  function visivelAoAluno(e, escopo) {
    const m = escopo.porCurso.get(String(e.cursoId));
    if (m) return encontroVisivel(e, m, { incluirCancelados: true });
    return escopo.liberados.has(String(e.cursoId)) && e.turmaId == null;
  }

  /** Equipe: docência (admin = todos). → { cursos: S[]|null (null = todos), turmasPorCurso(cursoId) } */
  async function escopoDaEquipe(req) {
    const ctx = await acesso().contexto(req);
    if (ctx.papel === 'admin') return { cursos: null, ctx };
    return { cursos: [...ctx.cursosDocente], ctx };
  }

  /** LEITURA (agenda, GET /:id, entrar): docente da turma vê os da turma + os sem turma do curso (§8.6). */
  async function visivelAEquipe(req, e) {
    const a = acesso();
    if (!(await a.contexto(req)).cursosDocente.has(String(e.cursoId)) && papelDe(req.user) !== 'admin') return false;
    if (e.turmaId == null) return true;
    return a.podeGerirTurma(req, e.cursoId, hex(e.turmaId));
  }

  /**
   * GESTÃO (PUT, cancelar, DELETE, presenças): docência pelo cursoId e turmaId GRAVADOS (§6.7.2, §4.2).
   * Encontro de curso inteiro (turmaId nulo) só a docência GERAL do curso ou o admin; docente só de
   * turma não edita, não cancela, não exclui e não lista nem lança presença de aluno de outra turma.
   */
  const gerivelPelaEquipe = (req, e) => acesso().podeGerirTurma(req, e.cursoId, e.turmaId == null ? null : hex(e.turmaId));

  /** Matrículas visíveis ao docente no curso (null = todas: admin ou docência geral), §4.2. */
  async function filtroDeTurmas(req, cursoId) {
    const vis = await acesso().turmasVisiveis(req, cursoId);
    if (vis === null) return () => true;
    const s = new Set(vis.map(String));
    return m => m.turmaId != null && s.has(hex(m.turmaId));
  }

  // ---------------- Routers ----------------
  const aluno = Router();
  const professor = Router();

  aluno.get('/agenda', assincrono(async (req, res) => {
    const momento = agora();
    let de = lerData(req.query.de, 'de');
    let ate = lerData(req.query.ate, 'ate', { fimDoDia: true });
    if (!de && !ate) ({ de, ate } = mesCorrenteSP(momento));
    else if (de && !ate) ate = new Date(de.getTime() + 31 * 86400000);
    else if (!de && ate) de = new Date(ate.getTime() - 31 * 86400000);
    if (ate <= de) throw invalido('ate', 'O fim precisa ser depois do início.');
    if (ate.getTime() - de.getTime() > MAX_DIAS_AGENDA * 86400000) throw invalido('ate', `Intervalo máximo de ${MAX_DIAS_AGENDA} dias.`);
    const cursoId = typeof req.query.cursoId === 'string' && req.query.cursoId ? req.query.cursoId : null;
    const turmaId = typeof req.query.turmaId === 'string' && req.query.turmaId ? req.query.turmaId : null;
    const papel = papelDe(req.user);
    const userId = String(req.user._id);

    if (papel === 'aluno') {
      const escopo = await escopoDoAluno(userId);
      const cursos = escopo.cursos.filter(c => !cursoId || c === cursoId);
      const encs = (await R.encontrosDosCursos(cursos, { de, ate }))
        .filter(e => visivelAoAluno(e, escopo))
        .filter(e => !turmaId || hex(e.turmaId) === turmaId);
      const mats = [...escopo.porCurso.values()];
      const freqs = mats.length ? await R.frequenciasDasMatriculas(mats.map(m => m._id)) : [];
      const presencas = new Map(freqs.filter(f => f.origem === 'ao_vivo' && !f.anulada).map(f => [String(f.encontroId), f]));
      const apoio = await mapasDeApoio(encs);
      const itens = encs.map((e) => {
        const m = escopo.porCurso.get(String(e.cursoId));
        const status = statusDoEncontro(e, momento);
        const podeEntrar = status === 'ao-vivo' && !!e.url && (m ? m.status === 'ativa' : escopo.liberados.has(String(e.cursoId)));
        return encontroPublico(e, apoio, { momento, url: podeEntrar ? e.url : null, podeEntrar, presenca: presencas.get(String(e._id)) || null });
      });
      const cursosMapa = await R.cursos(escopo.cursos);
      return res.json({
        itens,
        cursos: escopo.cursos.map(c => ({ id: c, titulo: cursosMapa.get(c)?.titulo || '—' })),
        de: iso(de), ate: iso(ate), papel
      });
    }

    // Equipe (professor/admin): docência; URL sempre.
    const { cursos } = await escopoDaEquipe(req);
    let lista;
    if (cursos === null) {
      const filtro = { inicioEm: { $gte: de, $lt: ate }, ...(cursoId ? { cursoId } : {}) };
      lista = await repo('lives').find(filtro).sort({ inicioEm: 1 }).toArray();
    } else {
      lista = await R.encontrosDosCursos(cursos.filter(c => !cursoId || c === cursoId), { de, ate });
    }
    const vis = [];
    for (const e of lista) {
      if (turmaId && hex(e.turmaId) !== turmaId) continue;
      if (await visivelAEquipe(req, e)) vis.push(e);
    }
    const apoio = await mapasDeApoio(vis);
    // presentes/esperados por encontro encerrado (mesma regra de esperados da matriz, §8.6),
    // contados só sobre as turmas visíveis ao docente (§4.2): o docente só de turma não vê a
    // contagem de outras turmas num encontro de curso inteiro.
    const contagens = new Map();
    const encerrados = vis.filter(e => !e.cancelado && statusDoEncontro(e, momento) === 'encerrada');
    if (encerrados.length) {
      const porCurso = new Map();
      for (const e of encerrados) {
        if (porCurso.has(String(e.cursoId))) continue;
        const daDocencia = await filtroDeTurmas(req, e.cursoId);
        porCurso.set(String(e.cursoId), (await svc.alunosDoCurso({ cursoId: e.cursoId })).filter(m => (m.status === 'ativa' || m.status === 'trancada') && daDocencia(m)));
      }
      const freqs = await repo('frequencias').find({ encontroId: { $in: encerrados.map(e => String(e._id)) }, origem: 'ao_vivo', anulada: null }, { projection: { encontroId: 1, matriculaId: 1 } }).toArray();
      for (const e of encerrados) {
        const esperadosDoEncontro = porCurso.get(String(e.cursoId)).filter(m => encontroVisivel(e, m));
        const ids = new Set(esperadosDoEncontro.map(m => hex(m._id)));
        contagens.set(String(e._id), { esperados: ids.size, presentes: freqs.filter(f => String(f.encontroId) === String(e._id) && ids.has(hex(f.matriculaId))).length });
      }
    }
    const todosCursos = cursos === null ? await repo('cursos').find({}, { projection: { titulo: 1 } }).toArray() : [...(await R.cursos(cursos)).values()];
    res.json({
      itens: vis.map(e => ({ ...encontroPublico(e, apoio, { momento, url: e.url || null, podeEntrar: statusDoEncontro(e, momento) === 'ao-vivo' && !!e.url, presenca: null }), ...(contagens.has(String(e._id)) ? contagens.get(String(e._id)) : {}) })),
      cursos: todosCursos.map(c => ({ id: String(c._id), titulo: c.titulo || '—' })),
      de: iso(de), ate: iso(ate), papel
    });
  }));

  aluno.post('/encontros/:id/entrar', assincrono(async (req, res) => {
    const e = await R.encontro(req.params.id);
    if (!e) throw erro(404, 'nao-encontrado');
    const papel = papelDe(req.user);
    const momento = agora();
    if (papel !== 'aluno') {
      if (!(await visivelAEquipe(req, e))) throw erro(404, 'nao-encontrado');
      if (e.cancelado) throw erro(409, 'encontro-cancelado');
      if (!e.url) throw erro(409, 'encontro-sem-url');
      return res.json({ url: e.url, presenca: null });
    }
    const escopo = await escopoDoAluno(String(req.user._id));
    if (!visivelAoAluno(e, escopo)) throw erro(404, 'nao-encontrado');
    if (e.cancelado) throw erro(409, 'encontro-cancelado');
    if (statusDoEncontro(e, momento) !== 'ao-vivo') {
      const j = janelaDoEncontro(e);
      throw erro(409, 'fora-da-janela', undefined, { abreEm: j ? iso(j.abertura) : null, fimEm: j ? iso(j.fim) : null });
    }
    if (!e.url) throw erro(409, 'encontro-sem-url');
    const m = escopo.porCurso.get(String(e.cursoId));
    if (!m) {
      // Liberação ainda sem matrícula (D5): a sala abre, a presença não é registrada.
      return res.json({ url: e.url, presenca: null, semMatricula: true });
    }
    if (m.status !== 'ativa') throw erro(409, 'matricula-nao-ativa');
    const turmaCodigo = await svc.turmaCodigoDe(m);
    const snapshot = await svc.snapshotDe({ cursoId: e.cursoId, moduloId: e.moduloId || null, encontro: e, turmaCodigo });
    const { frequencia } = await svc.registrarFrequencia({ matricula: m, origem: 'ao_vivo', encontro: e, via: 'entrada', por: String(req.user._id), snapshot });
    res.json({ url: e.url, presenca: { codigo: frequencia.codigo, registradaEm: iso(frequencia.registradaEm), hash: frequencia.hash } });
  }));

  // ---------------- professor/admin ----------------
  async function lerCorpoEncontro(b, { cursoId, parcial = false, atual = null }) {
    const set = {};
    if (!parcial || b.titulo !== undefined) set.titulo = lerTexto(b, 'titulo', { min: 3, max: 180, obrigatorio: true });
    if (!parcial || b.descricao !== undefined) set.descricao = lerTexto(b, 'descricao', { max: 2000, multilinha: true }) || '';
    if (!parcial || b.inicioEm !== undefined) {
      const d = typeof b.inicioEm === 'string' ? new Date(b.inicioEm) : null;
      if (!d || !Number.isFinite(d.getTime())) throw invalido('inicioEm', 'Informe data e hora válidas.');
      set.inicioEm = d;
    }
    if (!parcial || b.duracaoMin !== undefined) set.duracaoMin = lerInteiro(b.duracaoMin ?? DURACAO_PADRAO_MIN, { min: 15, max: 720 }, 'duracaoMin') ?? DURACAO_PADRAO_MIN;
    if (!parcial || b.url !== undefined) {
      if (b.url === null || b.url === '' || b.url === undefined) set.url = '';
      else { const u = validarUrlHttps(b.url); if (!u) throw invalido('url', 'Use um link https:// válido.'); set.url = u; }
    }
    if (!parcial || b.plataforma !== undefined) set.plataforma = lerTexto(b, 'plataforma', { max: 60 }) || 'Online';
    const moduloId = b.moduloId !== undefined ? (b.moduloId === null || b.moduloId === '' ? null : String(b.moduloId)) : (atual ? atual.moduloId ?? null : null);
    const aulaGravadaId = b.aulaGravadaId !== undefined ? (b.aulaGravadaId === null || b.aulaGravadaId === '' ? null : String(b.aulaGravadaId)) : (atual ? atual.aulaGravadaId ?? null : null);
    if (moduloId !== null) {
      const mod = await R.modulo(moduloId);
      if (!mod || String(mod.cursoId) !== String(cursoId)) throw invalido('moduloId', 'Módulo de outro curso.');
    }
    if (aulaGravadaId !== null) {
      const aula = await R.aula(aulaGravadaId);
      if (!aula || moduloId === null || String(aula.moduloId) !== moduloId) throw invalido('aulaGravadaId', 'A aula gravada precisa ser do mesmo módulo do encontro.');
    }
    if (!parcial || b.moduloId !== undefined) set.moduloId = moduloId;
    if (!parcial || b.aulaGravadaId !== undefined || b.moduloId !== undefined) set.aulaGravadaId = aulaGravadaId;
    return set;
  }

  async function conferirTurmaDestino(req, cursoId, turmaIdBruto) {
    if (turmaIdBruto === null || turmaIdBruto === undefined || turmaIdBruto === '') {
      if (!(await acesso().podeGerirConteudo(req, cursoId))) throw erro(403, 'nao-docente');
      return null;
    }
    if (!lerId(String(turmaIdBruto))) throw invalido('turmaId', 'Turma inválida.');
    const t = await R.turma(turmaIdBruto);
    if (!t) throw invalido('turmaId', 'Turma não encontrada.');
    if (String(t.cursoId) !== String(cursoId)) throw erro(400, 'turma-de-outro-curso');
    if (!(await acesso().podeGerirTurma(req, cursoId, hex(t._id)))) throw erro(403, 'nao-docente');
    return oidDe(t._id);
  }

  /** Leitura pela equipe (GET /:id). */
  async function encontroDaEquipe(req) {
    const e = await R.encontro(req.params.id);
    if (!e || !(await visivelAEquipe(req, e))) throw erro(404, 'nao-encontrado');
    return e;
  }

  /** Gestão pela equipe: fora da docência pelo gravado → 404 (§6.7.2 "404 inexistente ou fora da docência"). */
  async function encontroGerivel(req) {
    const e = await R.encontro(req.params.id);
    if (!e || !(await gerivelPelaEquipe(req, e))) throw erro(404, 'nao-encontrado');
    return e;
  }

  professor.post('/encontros', assincrono(async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const cursoId = typeof b.cursoId === 'string' ? b.cursoId.trim() : '';
    if (!cursoId) throw invalido('cursoId', 'Selecione o curso.');
    const curso = await R.curso(cursoId);
    if (!curso) throw invalido('cursoId', 'Curso não encontrado.');
    const turmaId = await conferirTurmaDestino(req, cursoId, b.turmaId);
    const campos = await lerCorpoEncontro(b, { cursoId });
    const momento = agora();
    const doc = {
      _id: novoIdEncontro(bytes), cursoId, turmaId, ...campos, cancelado: false, versao: 1,
      createdAt: momento, updatedAt: momento, criadoPor: String(req.user._id), atualizadoPor: String(req.user._id)
    };
    await R.inserirEncontro(doc);
    await notificar(doc, 'encontro.agendado', 'Novo encontro ao vivo agendado');
    const apoio = await mapasDeApoio([doc]);
    res.status(201).json({ encontro: encontroPublico(doc, apoio, { momento, url: doc.url || null, podeEntrar: false, presenca: null }) });
  }));

  /** Acréscimo (F3a): um encontro para a tela de edição do backoffice (#/ao-vivo/:encontroId). */
  professor.get('/encontros/:id', assincrono(async (req, res) => {
    const e = await encontroDaEquipe(req);
    const [apoio, podeGerir] = await Promise.all([mapasDeApoio([e]), gerivelPelaEquipe(req, e)]);
    const momento = agora();
    // podeGerir (acréscimo): a tela abre só leitura quando a gestão é da docência geral (§6.7.2).
    res.json({ encontro: { ...encontroPublico(e, apoio, { momento, url: e.url || null, podeEntrar: statusDoEncontro(e, momento) === 'ao-vivo' && !!e.url, presenca: null }), moduloId: e.moduloId ?? null, aulaGravadaId: e.aulaGravadaId ?? null, podeGerir: !!podeGerir } });
  }));

  professor.put('/encontros/:id', assincrono(async (req, res) => {
    const e = await encontroGerivel(req);
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if (b.cursoId !== undefined && String(b.cursoId) !== String(e.cursoId)) throw invalido('cursoId', 'O curso do encontro não muda.');
    const versao = lerInteiro(b.versao, { min: 1, max: 1e9, obrigatorio: true }, 'versao');
    if ((Number(e.versao) || 1) !== versao) throw erro(409, 'conflito-versao');
    const set = await lerCorpoEncontro(b, { cursoId: e.cursoId, parcial: true, atual: e });
    if (b.turmaId !== undefined) set.turmaId = await conferirTurmaDestino(req, e.cursoId, b.turmaId);
    set.updatedAt = agora();
    set.atualizadoPor = String(req.user._id);
    const novo = await R.atualizarEncontro(e._id, versao, set);
    const doc = novo && novo.value !== undefined && novo.ok !== undefined ? novo.value : novo;
    if (!doc) throw erro(409, 'conflito-versao');
    await notificar(doc, 'encontro.alterado', 'Encontro ao vivo alterado');
    const apoio = await mapasDeApoio([doc]);
    res.json({ encontro: encontroPublico(doc, apoio, { momento: agora(), url: doc.url || null, podeEntrar: false, presenca: null }) });
  }));

  professor.post('/encontros/:id/cancelar', assincrono(async (req, res) => {
    const e = await encontroGerivel(req);
    const motivo = lerTexto(req.body || {}, 'motivo', { min: 5, max: 500, obrigatorio: true, multilinha: true });
    const aud = auditoria();
    const mutacao = async () => {
      const set = { cancelado: true, canceladoEm: agora(), canceladoPor: String(req.user._id), motivoCancelamento: motivo, updatedAt: agora(), versao: (Number(e.versao) || 1) + 1 };
      await repo('lives').updateOne({ _id: String(e._id) }, { $set: set });
      return { ...e, ...set };
    };
    const doc = aud ? await aud.executar({ acao: 'encontro.cancelado', entidade: { tipo: 'encontro', id: String(e._id) }, cursoId: String(e.cursoId), motivo }, req, mutacao) : await mutacao();
    await notificar(doc, 'encontro.cancelado', 'Encontro ao vivo cancelado');
    const apoio = await mapasDeApoio([doc]);
    res.json({ encontro: encontroPublico(doc, apoio, { momento: agora(), url: doc.url || null, podeEntrar: false, presenca: null }) });
  }));

  professor.delete('/encontros/:id', assincrono(async (req, res) => {
    const e = await encontroGerivel(req);
    const alvo = { tipo: 'encontro', id: String(e._id) };
    const b = await bloqueiosEmCascata(servicos, alvo, { log });
    if (b.total > 0 || b.falhas.length) throw erro(409, 'tem-registros', 'Há presenças registradas neste encontro. Cancele em vez de excluir.');
    await apagarEmCascata(servicos, alvo, { log });
    await R.apagarEncontro(e._id);
    res.json({ ok: true });
  }));

  /**
   * Matrículas ESPERADAS no encontro (§8.6): mesmo curso, turma visível, vigentes — e, por defesa em
   * profundidade, só as das turmas visíveis a quem pede (§4.2; para quem passa em encontroGerivel, nada sai).
   */
  async function esperados(req, e) {
    const [mats, daDocencia] = await Promise.all([
      svc.alunosDoCurso({ cursoId: e.cursoId, turmaIds: e.turmaId ? [hex(e.turmaId)] : null }),
      filtroDeTurmas(req, e.cursoId)
    ]);
    return mats.filter(m => (m.status === 'ativa' || m.status === 'trancada') && encontroVisivel(e, m) && daDocencia(m));
  }

  professor.get('/encontros/:id/presencas', assincrono(async (req, res) => {
    const e = await encontroGerivel(req);
    const lista = await esperados(req, e);
    const freqs = await R.frequenciasDasMatriculas(lista.map(m => m._id));
    const usuarios = await R.usuarios(lista.map(m => m.userId));
    const itens = lista.map((m) => {
      const mid = hex(m._id);
      const pres = freqs.find(f => hex(f.matriculaId) === mid && f.origem === 'ao_vivo' && String(f.encontroId) === String(e._id));
      const comp = !!(e.aulaGravadaId && freqs.find(f => hex(f.matriculaId) === mid && f.origem === 'gravado' && String(f.aulaId) === String(e.aulaGravadaId) && !f.anulada));
      const u = usuarios.get(String(m.userId));
      return {
        matriculaId: mid, numero: m.numero || null,
        aluno: { nome: u?.nome || null, nomeSocial: null, email: u?.email || null },
        presenca: pres ? { codigo: pres.codigo, registradaEm: iso(pres.registradaEm), via: pres.via, anulada: !!pres.anulada } : null,
        compensadaPorGravacao: comp
      };
    });
    res.json({ esperados: itens.length, presentes: itens.filter(i => i.presenca && !i.presenca.anulada).length, itens });
  }));

  professor.post('/encontros/:id/presencas', assincrono(async (req, res) => {
    const e = await encontroGerivel(req);
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if (!lerId(String(b.matriculaId || ''))) throw erro(404, 'nao-encontrado');
    if (typeof b.presente !== 'boolean') throw invalido('presente', 'Informe presente ou ausente.');
    const motivo = lerTexto(b, 'motivo', { min: 10, max: 500, obrigatorio: true, multilinha: true });
    const lista = await esperados(req, e);
    const m0 = lista.find(m => hex(m._id) === String(b.matriculaId));
    if (!m0) throw erro(404, 'nao-encontrado');
    const m = (await svc.matriculaPorId(m0._id)) || m0;
    const atual = await R.frequenciaExistente(m._id, 'ao_vivo', { encontroId: String(e._id) });
    const aud = auditoria();
    const evento = acao => ({ acao, entidade: { tipo: 'frequencia', id: atual ? String(atual._id) : `${String(e._id)}:${hex(m._id)}` }, alvoUserId: String(m.userId), cursoId: String(e.cursoId), motivo });
    const executar = (acao, fn) => (aud ? aud.executar(evento(acao), req, fn) : fn());
    let resultado;
    if (b.presente) {
      if (atual && atual.anulada) {
        resultado = await executar('frequencia.desanulada', async () => { await R.marcarAnulada(atual._id, null); return { ...atual, anulada: null }; });
      } else if (atual) {
        resultado = atual;
      } else {
        if (m.status !== 'ativa') throw erro(409, 'matricula-nao-ativa');
        const snapshot = await svc.snapshotDe({ cursoId: e.cursoId, moduloId: e.moduloId || null, encontro: e, turmaCodigo: await svc.turmaCodigoDe(m) });
        resultado = await executar('frequencia.lancada', async () => (await svc.registrarFrequencia({ matricula: m, origem: 'ao_vivo', encontro: e, via: 'lancamento_professor', por: String(req.user._id), snapshot })).frequencia);
      }
    } else if (atual && !atual.anulada) {
      const anulada = { em: agora(), por: String(req.user._id), motivo };
      resultado = await executar('frequencia.anulada', async () => { await R.marcarAnulada(atual._id, anulada); return { ...atual, anulada }; });
    } else {
      resultado = atual || null;
    }
    res.json({ presenca: resultado ? { codigo: resultado.codigo, registradaEm: iso(resultado.registradaEm), via: resultado.via, anulada: !!resultado.anulada } : null });
  }));

  professor.get('/turmas/:turmaId/frequencia', assincrono(async (req, res) => {
    if (!lerId(req.params.turmaId)) throw erro(404, 'nao-encontrado');
    const t = await R.turma(req.params.turmaId);
    if (!t) throw erro(404, 'nao-encontrado');
    if (!(await acesso().podeGerirTurma(req, t.cursoId, hex(t._id)))) throw erro(403, 'nao-docente');
    const moduloId = typeof req.query.moduloId === 'string' && req.query.moduloId ? req.query.moduloId : null;
    const mats = (await svc.alunosDoCurso({ cursoId: t.cursoId, turmaIds: [hex(t._id)] })).filter(m => m.status !== 'cancelada' && hex(m.turmaId) === hex(t._id));
    if (mats.length > LIMITE_RELATORIO) throw erro(413, 'relatorio-grande');
    const encontros = (await R.encontrosDoCurso(t.cursoId)).filter(e => !e.cancelado && (e.turmaId == null || hex(e.turmaId) === hex(t._id)));
    const doFiltro = encontros.filter(e => !moduloId || String(e.moduloId) === moduloId);
    const { aulas } = await svc.conteudoDoCurso(t.cursoId);
    const freqs = await R.frequenciasDasMatriculas(mats.map(m => m._id));
    const usuarios = await R.usuarios(mats.map(m => m.userId));
    const momento = agora();
    const porMatricula = new Map();
    const alunos = mats.map((m) => {
      const mid = hex(m._id);
      const f = calcularFrequencia(m, momento, { encontros, aulas, frequencias: freqs.filter(x => hex(x.matriculaId) === mid) });
      porMatricula.set(mid, f);
      const bloco = moduloId ? (f.porModulo[moduloId] || null) : f;
      const celulas = f.porEncontro.filter(c => doFiltro.some(e => String(e._id) === c.encontroId)).map(c => ({ encontroId: c.encontroId, estado: c.estado, codigo: c.codigo }));
      const u = usuarios.get(String(m.userId));
      return {
        matriculaId: mid, numero: m.numero || null, nome: u?.nome || null, nomeSocial: null,
        resumo: bloco ? {
          presente: bloco.presente, compensado: bloco.compensado, faltas: bloco.faltas, contaveis: bloco.contaveis,
          frequenciaPct: bloco.frequenciaPct, aoVivoPct: bloco.aoVivoPct, gravadoPct: bloco.gravadoPct
        } : null,
        celulas
      };
    });
    res.json({
      turma: { id: hex(t._id), codigo: t.codigo || null, cursoId: String(t.cursoId) },
      encontros: doFiltro.map((e) => {
        const estados = [...porMatricula.values()].map(f => f.porEncontro.find(c => c.encontroId === String(e._id))?.estado);
        return {
          id: String(e._id), titulo: e.titulo || '', inicioEm: iso(e.inicioEm), moduloId: e.moduloId ?? null,
          status: statusDoEncontro(e, momento),
          presentes: estados.filter(s => s === 'presente').length,
          compensados: estados.filter(s => s === 'compensado').length,
          esperados: mats.length
        };
      }),
      alunos
    });
  }));

  return { aluno, professor, svc };
}

/** Contrato do agregador (API §5.1): SÍNCRONO no efeito e sem E/S. */
export default function montar(ctx) {
  const { rotas, servicos, comum } = ctx;
  const r = criarRotaEncontros({
    repo: comum.repo, servicos, acesso: comum.acesso, assinador: comum.assinador, auditoria: comum.auditoria,
    notificacoes: comum.notificacoes, garantia: comum.garantia, agora: comum.agora, log: comum.log
  });
  rotas.aluno.use(r.aluno);
  rotas.professor.use(r.professor);
}

export { formas };
