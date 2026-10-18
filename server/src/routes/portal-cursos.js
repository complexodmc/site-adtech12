// =============================================================
// COMPLEXO DMC · /api/portal/admin — regras do curso, IES e códigos de aula
// PORTAL-API §6.7.1, §8.11, §8.12 · índice §8.1 (F3b) · dono: F3b.
//
// Só a coordenação (admin): o agregador já protege /portal/admin.
//   GET  /portal/admin/cursos/academico                 (aditivo: lista para a tela de critérios)
//   GET  /portal/admin/cursos/:cursoId/academico
//   PUT  /portal/admin/cursos/:cursoId/academico         (versao; motivo quando muda notaMinima)
//   PUT  /portal/admin/modulos/:moduloId/academico       (chHoras, tipo regular|tcc)
//   POST /portal/admin/cursos/:cursoId/codigos           ({ refazer, motivo })
//   GET  /portal/admin/ies · POST /portal/admin/ies · PUT /portal/admin/ies/:id
// Nada daqui entra na vitrine pública; nenhum texto afirma reconhecimento.
// =============================================================
import { Router } from 'express';
import { ErroPortal } from '../portal/erros.js';
import { SIGLA_RE } from '../portal/codigos.js';
import { registrarIndices } from '../portal/indices.js';
import {
  lerTexto, lerEnum, lerNumero, lerBooleano, lerId, lerIdLegado, lerInteiro, validarCnpj, validarUrlHttps
} from '../portal/validacao.js';
import {
  NIVEIS, LATO_SENSU, rotuloNivel, criteriosLocais, horasLocais, cargaDoCurso, planejarCodigos, INDICES_CERTIFICACAO
} from '../portal/certificacao/declaracoes.js';

const ehObjetoPlano = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const naoEncontrado = (texto = 'Não encontrado.') => new ErroPortal(404, null, texto);
const invalido = (campo, mensagem) => new ErroPortal(400, 'validacao', 'Confira os campos destacados.', { campos: { [campo]: mensagem } });
const ehDuplicado = err => !!err && (err.code === 11000 || err.code === 11001);
const CAMPOS_AUDITADOS = ['sigla', 'nivel', 'iesId', 'cargaHorariaHoras', 'notaMinima', 'frequenciaMinima', 'cargaMinimaHoras', 'exigeTcc', 'frequenciaGravadaExigeVideo'];

function iesPublica(d) {
  return {
    id: String(d._id), nome: d.nome, sigla: d.sigla ?? null, cnpj: d.cnpj, atoCredenciamento: d.atoCredenciamento ?? null,
    site: d.site ?? null, ativa: d.ativa === true, versao: d.versao ?? 1,
    criadoEm: d.criadoEm instanceof Date ? d.criadoEm.toISOString() : d.criadoEm ?? null,
    atualizadoEm: d.atualizadoEm instanceof Date ? d.atualizadoEm.toISOString() : d.atualizadoEm ?? null
  };
}

/**
 * @param {{ repo, auditoria, servicos?, agora?, log? }} deps
 */
export function criarRotaCursos(deps = {}) {
  const { repo, auditoria, servicos = null, agora = () => new Date(), log = console } = deps;
  if (typeof repo !== 'function') throw new TypeError('criarRotaCursos: informe repo.');
  if (!auditoria || typeof auditoria.executar !== 'function') throw new TypeError('criarRotaCursos: informe auditoria.');
  const col = nome => repo(nome);
  const tentar = nome => (servicos && typeof servicos.tentar === 'function' ? servicos.tentar(nome) : null);
  const router = Router();

  async function modulosDoCurso(cursoId) {
    const docs = await col('modulos').find({ cursoId: String(cursoId) }).toArray();
    return docs.sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
  }
  async function aulasDos(modulos) {
    if (!modulos.length) return [];
    return col('aulas').find({ moduloId: { $in: modulos.map(m => m._id) } }, { projection: { _id: 1, moduloId: 1, ordem: 1, codigo: 1 } }).toArray();
  }

  async function temModularPublicada(moduloId) {
    const f = tentar('avaliacoes.resumoDoModulo');
    if (typeof f !== 'function') return null;
    try {
      const lista = await f(null, String(moduloId));
      return Array.isArray(lista) && lista.some(a => a && a.tipo === 'modular' && a.publicada === true);
    } catch (err) {
      try { (log.warn || log.error).call(log, `[portal] avaliacoes.resumoDoModulo falhou (${err?.message || err})`); } catch { /* nada */ }
      return null;
    }
  }

  async function avisosDo(curso, criterios, modulos) {
    const avisos = [];
    const carga = cargaDoCurso(curso, horasLocais);
    if (curso.nivel === LATO_SENSU && !(typeof criterios.cargaMinimaHoras === 'number' && criterios.cargaMinimaHoras >= 360)) {
      avisos.push('Pós-graduação lato sensu com carga horária mínima abaixo de 360 h.');
    }
    if (criterios.exigeTcc) {
      const tcc = modulos.find(m => m.tipo === 'tcc');
      if (!tcc) avisos.push('O curso exige TCC, mas nenhum módulo está marcado como TCC.');
      else {
        const pub = await temModularPublicada(tcc._id);
        if (pub === false) avisos.push('TCC exigido sem avaliação publicada: nenhum aluno fica apto ao certificado enquanto a avaliação do TCC não for publicada.');
        else if (pub === null) avisos.push('Não foi possível conferir agora se a avaliação do TCC está publicada.');
      }
    }
    if (typeof criterios.cargaMinimaHoras === 'number' && (carga === null || criterios.cargaMinimaHoras > carga)) {
      avisos.push('A carga horária mínima definida é maior que a carga horária do curso.');
    }
    return avisos;
  }

  async function formatoAcademico(curso) {
    const modulos = await modulosDoCurso(curso._id);
    const aulas = await aulasDos(modulos);
    const criterios = criteriosLocais(curso);
    let ies = null;
    if (curso.iesId) {
      const d = await col('ies').findOne({ _id: curso.iesId });
      if (d) ies = { id: String(d._id), nome: d.nome, ativa: d.ativa === true };
    }
    return {
      cursoId: String(curso._id),
      titulo: curso.titulo || '',
      sigla: curso.sigla ?? null,
      nivel: curso.nivel ?? null,
      nivelRotulo: rotuloNivel(curso.nivel),
      iesId: curso.iesId ? String(curso.iesId) : null,
      ies,
      cargaHorariaHoras: cargaDoCurso(curso, horasLocais),
      cargaHorariaTexto: curso.cargaHoraria || '',
      criterios,
      versao: Number(curso.academicoVersao) || 0,
      modulos: modulos.map(m => ({
        id: String(m._id), numero: m.numero ?? '', titulo: m.titulo || '',
        chHoras: typeof m.chHoras === 'number' ? m.chHoras : horasLocais(m.duracao || ''),
        tipo: m.tipo === 'tcc' ? 'tcc' : 'regular',
        aulasSemCodigo: aulas.filter(a => String(a.moduloId) === String(m._id) && !(typeof a.codigo === 'string' && a.codigo)).length
      })),
      avisos: await avisosDo(curso, criterios, modulos)
    };
  }

  async function cursoOu404(cursoId) {
    const id = lerIdLegado(cursoId);
    if (!id) throw naoEncontrado('Curso não encontrado.');
    const curso = await col('cursos').findOne({ _id: id });
    if (!curso) throw naoEncontrado('Curso não encontrado.');
    return curso;
  }

  /** Gera/atualiza códigos de aula (API §8.12). → { gerados, mantidos, itens } */
  async function aplicarCodigos(curso, { refazer = false } = {}) {
    const modulos = await modulosDoCurso(curso._id);
    const aulas = await aulasDos(modulos);
    const idsDoCurso = new Set(aulas.map(a => String(a._id)));
    const deOutros = await col('aulas').find({ codigo: { $regex: `^${curso.sigla}-M` } }, { projection: { _id: 1, codigo: 1 } }).toArray();
    const ocupados = new Set(deOutros.filter(a => !idsDoCurso.has(String(a._id))).map(a => a.codigo));
    const plano = planejarCodigos(curso.sigla, modulos.map(m => ({ id: m._id, ordem: m.ordem })),
      aulas.map(a => ({ id: a._id, moduloId: a.moduloId, ordem: a.ordem, codigo: a.codigo })), { refazer, ocupados });
    if (refazer) {
      for (const a of aulas) if (a.codigo) await col('aulas').updateOne({ _id: a._id }, { $unset: { codigo: '' } });
    }
    for (const m of plano.mudancas) {
      await col('aulas').updateOne({ _id: m.aulaId }, { $set: { codigo: m.codigo } });
    }
    return { gerados: plano.gerados, mantidos: plano.mantidos, itens: plano.itens };
  }

  // ---------- lista (aditivo) ----------
  router.get('/cursos/academico', async (_req, res) => {
    const cursos = await col('cursos').find({}).toArray();
    cursos.sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
    const itens = [];
    for (const c of cursos) itens.push(await formatoAcademico(c));
    res.json({ itens });
  });

  router.get('/cursos/:cursoId/academico', async (req, res) => {
    const curso = await cursoOu404(req.params.cursoId);
    res.json(await formatoAcademico(curso));
  });

  router.put('/cursos/:cursoId/academico', async (req, res) => {
    const curso = await cursoOu404(req.params.cursoId);
    const corpo = ehObjetoPlano(req.body) ? req.body : {};
    const versao = lerInteiro(corpo.versao, { min: 0, max: 1e9, obrigatorio: true }, 'versao');
    const atual = Number(curso.academicoVersao) || 0;
    if (versao !== atual) throw new ErroPortal(409, 'conflito-versao');

    const set = {};
    if (Object.hasOwn(corpo, 'sigla')) {
      if (corpo.sigla === null || corpo.sigla === '') set.sigla = null;
      else {
        if (typeof corpo.sigla !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { sigla: 'Formato inválido.' } });
        const s = corpo.sigla.trim().toUpperCase();
        if (!SIGLA_RE.test(s)) throw invalido('sigla', 'Use de 2 a 6 letras ou números, começando por letra.');
        set.sigla = s;
      }
    }
    if (Object.hasOwn(corpo, 'nivel')) set.nivel = lerEnum(corpo.nivel, NIVEIS, 'nivel');
    if (Object.hasOwn(corpo, 'iesId')) {
      if (corpo.iesId === null || corpo.iesId === '') set.iesId = null;
      else {
        if (typeof corpo.iesId !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { iesId: 'Formato inválido.' } });
        const id = lerId(corpo.iesId);
        if (!id) throw invalido('iesId', 'IES não encontrada.');
        set.iesId = id;
      }
    }
    if (Object.hasOwn(corpo, 'cargaHorariaHoras')) set.cargaHorariaHoras = lerNumero(corpo.cargaHorariaHoras, { min: 0, max: 10000, casas: 1 }, 'cargaHorariaHoras');
    let criteriosNovos = null;
    if (Object.hasOwn(corpo, 'criterios')) {
      if (!ehObjetoPlano(corpo.criterios)) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { criterios: 'Formato inválido.' } });
      const c = corpo.criterios;
      const base = criteriosLocais(curso);
      criteriosNovos = { ...base };
      if (Object.hasOwn(c, 'notaMinima')) {
        const n = lerNumero(c.notaMinima, { min: 0, max: 10, casas: 1 }, 'criterios.notaMinima');
        criteriosNovos.notaMinima = n === null ? 7 : n;
      }
      if (Object.hasOwn(c, 'frequenciaMinima')) criteriosNovos.frequenciaMinima = lerNumero(c.frequenciaMinima, { min: 0, max: 100, casas: 1 }, 'criterios.frequenciaMinima');
      if (Object.hasOwn(c, 'cargaMinimaHoras')) criteriosNovos.cargaMinimaHoras = lerNumero(c.cargaMinimaHoras, { min: 0, max: 10000, casas: 1 }, 'criterios.cargaMinimaHoras');
      if (Object.hasOwn(c, 'exigeTcc')) criteriosNovos.exigeTcc = lerBooleano(c.exigeTcc, 'criterios.exigeTcc') === true;
      if (Object.hasOwn(c, 'frequenciaGravadaExigeVideo')) criteriosNovos.frequenciaGravadaExigeVideo = lerBooleano(c.frequenciaGravadaExigeVideo, 'criterios.frequenciaGravadaExigeVideo') === true;
      set.criterios = criteriosNovos;
    }
    const motivo = lerTexto(corpo, 'motivo', { max: 500 });

    // Regras cruzadas
    const nivelFinal = Object.hasOwn(set, 'nivel') ? set.nivel : (curso.nivel ?? null);
    const iesFinal = Object.hasOwn(set, 'iesId') ? set.iesId : (curso.iesId ?? null);
    if (iesFinal && Object.hasOwn(set, 'iesId')) {
      const ies = await col('ies').findOne({ _id: iesFinal });
      if (!ies) throw invalido('iesId', 'IES não encontrada.');
    }
    if (nivelFinal === LATO_SENSU) {
      const ies = iesFinal ? await col('ies').findOne({ _id: iesFinal }) : null;
      if (!ies || ies.ativa !== true) throw new ErroPortal(400, 'nivel-exige-ies', undefined, { campos: { nivel: 'Exige IES parceira cadastrada e ativa.' } });
    }
    const notaAntes = criteriosLocais(curso).notaMinima;
    if (criteriosNovos && criteriosNovos.notaMinima !== notaAntes) {
      if (!motivo || [...motivo].length < 10) throw invalido('motivo', 'Informe o motivo (10 a 500 caracteres): a mudança da nota mínima fica registrada.');
    }
    if (set.sigla) {
      const outro = await col('cursos').findOne({ sigla: set.sigla, _id: { $ne: curso._id } }, { projection: { _id: 1 } });
      if (outro) throw new ErroPortal(409, 'sigla-em-uso', undefined, { campos: { sigla: 'Sigla já usada por outro curso.' } });
    }

    const plano = (c) => ({ ...c, ...criteriosLocais(c), iesId: c.iesId ? String(c.iesId) : null, cargaHorariaHoras: c.cargaHorariaHoras ?? null });
    const antes = plano(curso);
    const depois = plano({ ...curso, ...set });
    const mudancas = auditoria.mudancas(antes, depois, CAMPOS_AUDITADOS);
    set.academicoVersao = atual + 1;
    set.academicoAtualizadoEm = agora();

    if (mudancas.length) {
      await auditoria.executar({
        acao: 'curso.regras_alteradas', entidade: { tipo: 'curso', id: String(curso._id) }, cursoId: String(curso._id), mudancas,
        motivo: motivo || null
      }, req, async () => {
        try {
          const r = await col('cursos').updateOne({ _id: curso._id, academicoVersao: curso.academicoVersao ?? null }, { $set: set });
          if (!r || r.matchedCount === 0) throw new ErroPortal(409, 'conflito-versao');
        } catch (err) {
          if (ehDuplicado(err)) throw new ErroPortal(409, 'sigla-em-uso', undefined, { campos: { sigla: 'Sigla já usada por outro curso.' } });
          throw err;
        }
      });
    }

    const atualizado = await col('cursos').findOne({ _id: curso._id });
    if (set.sigla && set.sigla !== curso.sigla) {
      const r = await aplicarCodigos(atualizado, { refazer: false });
      if (r.gerados) {
        await auditoria.registrar({ acao: 'aula.codigos_gerados', entidade: { tipo: 'curso', id: String(curso._id) }, cursoId: String(curso._id), extra: { gerados: r.gerados, refazer: false } }, req);
      }
    }
    res.json(await formatoAcademico(atualizado));
  });

  router.put('/modulos/:moduloId/academico', async (req, res) => {
    const id = lerIdLegado(req.params.moduloId);
    if (!id) throw naoEncontrado('Módulo não encontrado.');
    const modulo = await col('modulos').findOne({ _id: id });
    if (!modulo) throw naoEncontrado('Módulo não encontrado.');
    const corpo = ehObjetoPlano(req.body) ? req.body : {};
    const set = {};
    if (Object.hasOwn(corpo, 'chHoras')) set.chHoras = lerNumero(corpo.chHoras, { min: 0, max: 1000, casas: 1 }, 'chHoras');
    if (Object.hasOwn(corpo, 'tipo')) set.tipo = lerEnum(corpo.tipo, ['regular', 'tcc'], 'tipo', { obrigatorio: true });
    const motivo = lerTexto(corpo, 'motivo', { max: 500 });
    const tipoAntes = modulo.tipo === 'tcc' ? 'tcc' : 'regular';
    const mudaTipo = set.tipo && set.tipo !== tipoAntes;
    if (mudaTipo && set.tipo === 'tcc') {
      const outro = await col('modulos').findOne({ cursoId: modulo.cursoId, tipo: 'tcc', _id: { $ne: modulo._id } }, { projection: { _id: 1 } });
      if (outro) throw new ErroPortal(409, 'registro-duplicado', 'Já existe um módulo de TCC neste curso.');
    }
    if (mudaTipo && set.tipo === 'regular') {
      const comArquivo = await col('questoes').countDocuments({ moduloId: String(modulo._id), tipo: 'arquivo' });
      if (comArquivo > 0) throw new ErroPortal(409, 'tem-registros', 'O banco deste módulo tem questão de entrega de arquivo (TCC). Remova-a antes de mudar o tipo.');
    }
    const aplicar = () => (Object.keys(set).length ? col('modulos').updateOne({ _id: modulo._id }, { $set: set }) : null);
    if (mudaTipo) {
      await auditoria.executar({
        acao: 'modulo.tipo_alterado', entidade: { tipo: 'modulo', id: String(modulo._id) }, cursoId: String(modulo.cursoId),
        mudancas: [{ campo: 'tipo', de: tipoAntes, para: set.tipo }], motivo: motivo || null
      }, req, aplicar);
    } else {
      await aplicar();
    }
    const m = await col('modulos').findOne({ _id: modulo._id });
    res.json({
      modulo: {
        id: String(m._id), cursoId: String(m.cursoId), numero: m.numero ?? '', titulo: m.titulo || '',
        chHoras: typeof m.chHoras === 'number' ? m.chHoras : horasLocais(m.duracao || ''), tipo: m.tipo === 'tcc' ? 'tcc' : 'regular'
      }
    });
  });

  router.post('/cursos/:cursoId/codigos', async (req, res) => {
    const curso = await cursoOu404(req.params.cursoId);
    const corpo = ehObjetoPlano(req.body) ? req.body : {};
    const refazer = lerBooleano(corpo.refazer, 'refazer') === true;
    const motivo = lerTexto(corpo, 'motivo', { max: 500 });
    if (refazer && (!motivo || [...motivo].length < 10)) throw invalido('motivo', 'Informe o motivo (10 a 500 caracteres) para refazer os códigos.');
    if (!curso.sigla) throw new ErroPortal(409, 'sem-sigla', 'Defina a sigla do curso antes de gerar os códigos das aulas.');
    let r;
    if (refazer) {
      r = await auditoria.executar({
        acao: 'aula.codigos_gerados', entidade: { tipo: 'curso', id: String(curso._id) }, cursoId: String(curso._id), motivo, extra: { refazer: true }
      }, req, () => aplicarCodigos(curso, { refazer: true }));
    } else {
      r = await aplicarCodigos(curso, { refazer: false });
      if (r.gerados) {
        await auditoria.registrar({ acao: 'aula.codigos_gerados', entidade: { tipo: 'curso', id: String(curso._id) }, cursoId: String(curso._id), extra: { gerados: r.gerados, refazer: false } }, req);
      }
    }
    res.json(r);
  });

  // ---------- IES parceiras ----------
  function lerIes(corpo, { parcial = false } = {}) {
    const out = {};
    if (!parcial || Object.hasOwn(corpo, 'nome')) out.nome = lerTexto(corpo, 'nome', { min: 2, max: 160, obrigatorio: true });
    if (!parcial || Object.hasOwn(corpo, 'sigla')) out.sigla = lerTexto(corpo, 'sigla', { max: 20 });
    if (!parcial || Object.hasOwn(corpo, 'cnpj')) {
      if (corpo.cnpj !== undefined && corpo.cnpj !== null && typeof corpo.cnpj !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { cnpj: 'Formato inválido.' } });
      const cnpj = validarCnpj(corpo.cnpj || '');
      if (!cnpj) throw invalido('cnpj', 'CNPJ inválido.');
      out.cnpj = cnpj;
    }
    if (!parcial || Object.hasOwn(corpo, 'atoCredenciamento')) out.atoCredenciamento = lerTexto(corpo, 'atoCredenciamento', { max: 300, multilinha: true });
    if (!parcial || Object.hasOwn(corpo, 'site')) {
      const bruto = lerTexto(corpo, 'site', { max: 500 });
      if (bruto) {
        const site = validarUrlHttps(bruto);
        if (!site) throw invalido('site', 'Use um endereço https://.');
        out.site = site;
      } else out.site = null;
    }
    if (!parcial || Object.hasOwn(corpo, 'ativa')) {
      const a = lerBooleano(corpo.ativa, 'ativa');
      out.ativa = a === null ? true : a;
    }
    return out;
  }

  router.get('/ies', async (_req, res) => {
    const docs = await col('ies').find({}).toArray();
    docs.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    res.json({ itens: docs.map(iesPublica) });
  });

  router.post('/ies', async (req, res) => {
    const corpo = ehObjetoPlano(req.body) ? req.body : {};
    const dados = lerIes(corpo);
    const momento = agora();
    const doc = { ...dados, versao: 1, criadoEm: momento, atualizadoEm: momento, criadoPor: String(req.user._id) };
    const existente = await col('ies').findOne({ cnpj: dados.cnpj }, { projection: { _id: 1 } });
    if (existente) throw new ErroPortal(409, 'codigo-em-uso', 'Já existe IES cadastrada com este CNPJ.', { campos: { cnpj: 'CNPJ já cadastrado.' } });
    try {
      const r = await col('ies').insertOne(doc);
      doc._id = r.insertedId;
    } catch (err) {
      if (ehDuplicado(err)) throw new ErroPortal(409, 'codigo-em-uso', 'Já existe IES cadastrada com este CNPJ.', { campos: { cnpj: 'CNPJ já cadastrado.' } });
      throw err;
    }
    await auditoria.registrar({ acao: 'ies.criada', entidade: { tipo: 'ies', id: String(doc._id) } }, req);
    res.status(201).json({ ies: iesPublica(doc) });
  });

  router.put('/ies/:id', async (req, res) => {
    const id = lerId(req.params.id);
    if (!id) throw naoEncontrado('IES não encontrada.');
    const ies = await col('ies').findOne({ _id: id });
    if (!ies) throw naoEncontrado('IES não encontrada.');
    const corpo = ehObjetoPlano(req.body) ? req.body : {};
    const versao = lerInteiro(corpo.versao, { min: 1, max: 1e9, obrigatorio: true }, 'versao');
    if (versao !== (ies.versao ?? 1)) throw new ErroPortal(409, 'conflito-versao');
    const dados = lerIes(corpo, { parcial: true });
    if (dados.ativa === false && ies.ativa === true) {
      const emUso = await col('cursos').countDocuments({ iesId: ies._id, nivel: LATO_SENSU });
      if (emUso > 0) throw new ErroPortal(409, 'tem-registros', 'Há curso de pós-graduação lato sensu usando esta IES. Mude o nível do curso antes de desativar.');
    }
    if (dados.cnpj && dados.cnpj !== ies.cnpj) {
      const outro = await col('ies').findOne({ cnpj: dados.cnpj, _id: { $ne: ies._id } }, { projection: { _id: 1 } });
      if (outro) throw new ErroPortal(409, 'codigo-em-uso', 'Já existe IES cadastrada com este CNPJ.', { campos: { cnpj: 'CNPJ já cadastrado.' } });
    }
    const set = { ...dados, versao: (ies.versao ?? 1) + 1, atualizadoEm: agora() };
    const mudancas = auditoria.mudancas(ies, { ...ies, ...dados }, ['nome', 'sigla', 'cnpj', 'atoCredenciamento', 'site', 'ativa']);
    await auditoria.executar({ acao: 'ies.alterada', entidade: { tipo: 'ies', id: String(ies._id) }, mudancas }, req, async () => {
      const r = await col('ies').updateOne({ _id: ies._id, versao: ies.versao ?? 1 }, { $set: set });
      if (!r || r.matchedCount === 0) throw new ErroPortal(409, 'conflito-versao');
    });
    res.json({ ies: iesPublica(await col('ies').findOne({ _id: ies._id })) });
  });

  return router;
}

export default async function montar(ctx) {
  registrarIndices(INDICES_CERTIFICACAO);
  const { comum, servicos } = ctx;
  ctx.rotas.admin.use(criarRotaCursos({ repo: comum.repo, auditoria: comum.auditoria, servicos, agora: comum.agora, log: comum.log }));
}
