// =============================================================
// COMPLEXO DMC · Portal — documentos pessoais (secretaria)
// PORTAL-API §6.8.3, §3.3, §3.4 (documento.*), §3.5 (documento.revisado),
// §4.4 (secretaria.pendenciasDoAluno, grupos) · índice §8.1 (F4b), §8.5,
// D-32, D-78 · dono: F4b.
//
//   /api/portal/me/documentos[...]                 (titular)
//   /api/portal/admin/documentos[...]              (só coordenação)
//   /api/portal/admin/usuarios/:userId/documentos  (checklist do aluno)
//
// Binário no Mongo pelo serviço `arquivos` (F0m): tipo detectado pelos
// BYTES (PDF/JPG/PNG ≤ 4 MB), PDF com conteúdo ativo recusado (415),
// download só por header Authorization (titular ou coordenação). O
// documento NÃO é alterado (o sha256 é evidência). Reenvio preserva o
// histórico: o envio anterior vira `substituido` (metadados e sha256
// ficam) e só o binário anterior é apagado.
// Os cursos do aluno vêm de `secretaria.matriculasDoAluno` (F4a): sem
// o serviço, 503 `servico-indisponivel` e nada grava (API §4.4).
// Professor nunca acessa documentos (403 em /admin; busca omitida).
// =============================================================
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../../portal/erros.js';
import { lerTexto, lerEnum, lerBooleano, lerInteiro, lerPagina, regexBusca, ID_RE, ID_LEGADO_RE } from '../../portal/validacao.js';
import { lerCorpoBinario } from '../../portal/arquivos.js';
import { limitePersistente } from '../../portal/limitador.js';
import { papelDe } from '../../portal/papeis.js';
import {
  INDICES_DOCUMENTACAO, FORMATOS_DOCUMENTO, ESCOPOS, SIGLA_DOCUMENTO_RE, TIPOS_SUGERIDOS, ROTULOS_STATUS_DOCUMENTO, DIA_MS,
  criarRepositorios, montarChecklist, tipoExigido, itemDoChecklist, tipoPublico, envioPublico, extensaoDoMime, hex, paraObjectId, iso
} from '../../portal/documentacao/repositorios.js';

const MIB = 1024 * 1024;
const HORA_MS = 60 * 60 * 1000;
const LIMITE_ENVIOS = Object.freeze({ janelaMs: HORA_MS, max: 20 });
const STATUS_FILA = Object.freeze(['em_revisao', 'pendente', 'aprovado', 'nao_enviado', 'todos']);
const DECISOES = Object.freeze(['aprovado', 'pendente']);
const TRANSICOES_REVISAO = Object.freeze({ em_revisao: ['aprovado', 'pendente'], aprovado: ['pendente'] });

const corpoDe = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && !Buffer.isBuffer(req.body) ? req.body : {});
const naoEncontrado = (texto = 'Não encontrado.') => new ErroPortal(404, null, texto);
const indisponivel = () => new ErroPortal(503, 'servico-indisponivel');

function lerVersao(corpo) {
  return lerInteiro(corpo.versao, { min: 1, max: 1e9, obrigatorio: true }, 'versao');
}

function lerFormatos(valor, { obrigatorio = false } = {}) {
  if (valor === undefined) {
    if (obrigatorio) throw new ErroPortal(400, 'validacao', undefined, { campos: { formatos: 'Escolha pelo menos um formato.' } });
    return undefined;
  }
  if (!Array.isArray(valor)) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { formatos: 'Formato inválido.' } });
  if (valor.some(v => typeof v !== 'string')) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { formatos: 'Formato inválido.' } });
  const lista = [...new Set(valor.map(v => v.trim().toLowerCase()))];
  if (!lista.length) throw new ErroPortal(400, 'validacao', undefined, { campos: { formatos: 'Escolha pelo menos um formato.' } });
  if (lista.some(v => !FORMATOS_DOCUMENTO.includes(v))) throw new ErroPortal(400, 'validacao', undefined, { campos: { formatos: 'Use PDF, JPG ou PNG.' } });
  return FORMATOS_DOCUMENTO.filter(f => lista.includes(f));
}

function lerCursoIds(valor) {
  if (valor === undefined) return undefined;
  if (!Array.isArray(valor) || valor.some(v => typeof v !== 'string' || !ID_LEGADO_RE.test(v))) {
    throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { cursoIds: 'Formato inválido.' } });
  }
  if (valor.length > 200) throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoIds: 'Use no máximo 200 cursos.' } });
  return [...new Set(valor)];
}

function lerSigla(corpo, { obrigatorio = false } = {}) {
  const bruto = lerTexto(corpo, 'sigla', { max: 6, obrigatorio });
  if (bruto === null) return null;
  const sigla = bruto.toUpperCase();
  if (!SIGLA_DOCUMENTO_RE.test(sigla)) throw new ErroPortal(400, 'validacao', undefined, { campos: { sigla: 'Use de 2 a 6 letras maiúsculas (ex.: DOC).' } });
  return sigla;
}

/** 'DOC-v2' → nome de download sem dado pessoal (API §1.6). */
const nomeDoEnvio = e => `${e.sigla}-v${e.numeroEnvio}.${extensaoDoMime(e.mime)}`;

/**
 * Núcleo do domínio (rotas, serviço e grupos usam o mesmo).
 * @param {{ repo, arquivos, auditoria, notificacoes?, servicos, configPortal?, agora?, log? }} deps
 */
export function criarDocumentos({ repo, arquivos, auditoria, notificacoes = null, servicos, acesso = null, configPortal = {}, agora = () => new Date(), log = console } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarDocumentos: informe repo.');
  if (!arquivos) throw new TypeError('criarDocumentos: informe arquivos.');
  if (!auditoria) throw new TypeError('criarDocumentos: informe auditoria.');
  if (!servicos || typeof servicos.tentar !== 'function') throw new TypeError('criarDocumentos: informe servicos.');
  const R = criarRepositorios({ repo });
  const limiteBytes = Math.min(Number(configPortal.maxArquivoBytes) || 4 * MIB, 4 * MIB);
  const avisar = (texto, err) => { try { (log.warn || log.error).call(log, `[portal] documentos: ${texto}${err ? ` (${err?.name || 'erro'})` : ''}`); } catch { /* nada */ } };

  /**
   * Cursos do aluno (API §4.2 `acesso.cursosDoAluno`: liberações ∪ matrículas ativa|trancada|
   * concluida), para que a liberação ainda não materializada em matrícula também exija os
   * documentos. A rota depende da F4a (índice §8.4, UX §6.8): sem `secretaria.matriculasDoAluno`,
   * 503 `servico-indisponivel` (nunca lista inventada). Sem `acesso`, só as matrículas da F4a.
   */
  async function cursosDoAluno(userId) {
    const f = servicos.tentar('secretaria.matriculasDoAluno');
    if (typeof f !== 'function') throw indisponivel();
    if (acesso && typeof acesso.cursosDoAluno === 'function') return acesso.cursosDoAluno(String(userId));
    const ms = await f(String(userId));
    return [...new Set((Array.isArray(ms) ? ms : []).filter(m => m && m.status !== 'cancelada' && m.cursoId).map(m => String(m.cursoId)))];
  }

  async function checklistDe(userId) {
    const uid = String(userId);
    const cursoIds = await cursosDoAluno(uid);
    const envios = await R.envios().find({ userId: uid, atual: true }).toArray();
    const comEnvio = envios.map(e => e.tipoId).filter(Boolean);
    const tipos = await R.tipos().find(comEnvio.length ? { $or: [{ ativo: true }, { _id: { $in: comEnvio } }] } : { ativo: true }).toArray();
    return montarChecklist({ tipos, envios, cursoIds, limiteBytes });
  }

  async function pessoas(userIds) {
    const f = servicos.tentar('perfis.publicos');
    const ids = [...new Set(userIds.map(String).filter(s => ID_RE.test(s)))];
    if (!ids.length) return new Map();
    if (typeof f === 'function') {
      try { return await f(ids); } catch (err) { avisar('perfis.publicos falhou', err); }
    }
    const us = await R.users().find({ _id: { $in: ids.map(id => new ObjectId(id)) } }, { projection: { nome: 1, email: 1 } }).toArray();
    return new Map(us.map(u => [String(u._id), { id: String(u._id), nome: u.nome ?? null, email: u.email ?? null }]));
  }

  async function notificar(dados) {
    if (!notificacoes || typeof notificacoes.emitir !== 'function') return;
    try { await notificacoes.emitir(dados); } catch { /* emitir nunca lança */ }
  }

  /**
   * userId → Set(cursoId) das matrículas não canceladas, por `secretaria.alunosDoCurso`
   * (F4a). `cursoId` restringe a um curso. Sem o serviço → 503.
   */
  async function alunosPorCurso(cursoId = null) {
    const f = servicos.tentar('secretaria.alunosDoCurso');
    if (typeof f !== 'function') throw indisponivel();
    const cursos = cursoId ? [String(cursoId)] : (await R.cursos().find({}, { projection: { _id: 1 } }).toArray()).map(c => String(c._id));
    const mapa = new Map();
    for (const c of cursos) {
      const lista = await f({ cursoId: c });
      for (const m of Array.isArray(lista) ? lista : []) {
        if (!m || m.status === 'cancelada' || !m.userId) continue;
        const u = String(m.userId);
        if (!mapa.has(u)) mapa.set(u, new Set());
        mapa.get(u).add(c);
      }
    }
    return mapa;
  }

  /** (aluno × tipo exigido) sem envio atual — calculado (API §6.8.3). */
  async function naoEnviados({ cursoId = null, sigla = null, somenteObrigatorios = false } = {}) {
    const mapa = await alunosPorCurso(cursoId);
    if (!mapa.size) return [];
    const filtroTipo = { ativo: true, ...(sigla ? { sigla } : {}), ...(somenteObrigatorios ? { obrigatorio: true } : {}) };
    const tipos = (await R.tipos().find(filtroTipo).toArray()).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if (!tipos.length) return [];
    const userIds = [...mapa.keys()];
    const envios = await R.envios().find({ userId: { $in: userIds }, atual: true }, { projection: { userId: 1, tipoId: 1 } }).toArray();
    const tem = new Set(envios.map(e => `${e.userId}|${hex(e.tipoId)}`));
    const out = [];
    for (const [userId, cursos] of mapa) {
      for (const t of tipos) {
        if (!tipoExigido(t, [...cursos])) continue;
        if (tem.has(`${userId}|${hex(t._id)}`)) continue;
        out.push({ userId, tipo: t, cursoIds: [...cursos] });
      }
    }
    return out;
  }

  async function titulosDosCursos(ids) {
    const lista = [...new Set(ids.filter(Boolean).map(String))];
    if (!lista.length) return new Map();
    const docs = await R.cursos().find({ _id: { $in: lista } }, { projection: { titulo: 1 } }).toArray();
    return new Map(docs.map(c => [String(c._id), c.titulo ?? null]));
  }

  // ---------------------------------------------------------------
  // Envio (titular)
  // ---------------------------------------------------------------
  async function enviar(req, tipoIdBruto) {
    const userId = String(req.user._id);
    const tipoOid = paraObjectId(tipoIdBruto);
    if (!tipoOid) throw naoEncontrado('Tipo de documento não encontrado.');
    const tipo = await R.tipos().findOne({ _id: tipoOid });
    if (!tipo || tipo.ativo !== true) throw naoEncontrado('Tipo de documento não encontrado.');
    const cursoIds = await cursosDoAluno(userId);
    if (!tipoExigido(tipo, cursoIds)) throw naoEncontrado('Tipo de documento não encontrado.');
    const anterior = await R.envios().findOne({ userId, tipoId: tipoOid, atual: true });
    if (anterior && anterior.status === 'aprovado') throw new ErroPortal(409, 'documento-aprovado');
    const { buf, tipo: formato } = req.arquivo;
    const aceitos = Array.isArray(tipo.formatos) && tipo.formatos.length ? tipo.formatos : FORMATOS_DOCUMENTO;
    if (!aceitos.includes(formato)) {
      throw new ErroPortal(415, 'tipo-de-arquivo', `Formato não aceito para este documento. Envie ${aceitos.map(f => f.toUpperCase()).join(', ')}.`);
    }
    const ultimo = await R.envios().find({ userId, tipoId: tipoOid }, { projection: { numeroEnvio: 1 } }).sort({ numeroEnvio: -1 }).limit(1).toArray();
    const numeroEnvio = (Number(ultimo[0]?.numeroEnvio) || 0) + 1;
    const em = agora();
    const envioId = new ObjectId();
    const arq = await arquivos.salvar({
      contexto: 'documento', donoUserId: userId, ref: { entidadeId: hex(envioId) }, buf, tipo: formato,
      nomeDownload: `${tipo.sigla}-v${numeroEnvio}`, por: userId
    });
    const doc = {
      _id: envioId, userId, tipoId: tipoOid, sigla: tipo.sigla, numeroEnvio, atual: true,
      arquivoId: new ObjectId(arq.id), mime: arq.mime, tamanho: arq.tamanho, sha256: arq.sha256,
      status: 'em_revisao', motivo: null, enviadoEm: em, revisadoEm: null, revisadoPor: null,
      historico: [{ status: 'em_revisao', em, por: userId, motivo: null }], versao: 1
    };
    let substituiu = false;
    try {
      if (anterior) {
        const u = await R.envios().updateOne(
          { _id: anterior._id, atual: true, versao: anterior.versao },
          { $set: { atual: false, status: 'substituido', arquivoId: null, substituidoEm: em }, $push: { historico: { status: 'substituido', em, por: userId, motivo: null } }, $inc: { versao: 1 } }
        );
        if (!u || u.modifiedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
        substituiu = true;
      }
      await R.envios().insertOne(doc);
    } catch (err) {
      if (substituiu) {
        try {
          await R.envios().updateOne({ _id: anterior._id }, { $set: { atual: true, status: anterior.status, arquivoId: anterior.arquivoId ?? null }, $unset: { substituidoEm: '' }, $inc: { versao: 1 } });
        } catch (e) { avisar('reversão do envio anterior falhou', e); }
      }
      try { await arquivos.apagar(arq.id); } catch (e) { avisar('binário órfão não apagado', e); }
      if (err && err.code === 11000) throw new ErroPortal(409, 'conflito-versao');
      throw err;
    }
    if (anterior && anterior.arquivoId) {
      try { await arquivos.apagar(anterior.arquivoId); } catch (e) { avisar('binário anterior não apagado', e); }
    }
    await auditoria.registrar({
      acao: 'documento.enviado', entidade: { tipo: 'documento_enviado', id: hex(envioId) }, alvoUserId: userId,
      extra: { sigla: tipo.sigla, numeroEnvio, tamanho: arq.tamanho, mime: arq.mime, sha256: arq.sha256, substituiu: anterior ? hex(anterior._id) : null }
    }, req);
    return itemDoChecklist(tipo, doc, true);
  }

  // ---------------------------------------------------------------
  // Revisão (coordenação)
  // ---------------------------------------------------------------
  async function revisar(req, envioIdBruto, corpo) {
    const decisao = lerEnum(corpo.decisao, DECISOES, 'decisao', { obrigatorio: true });
    const motivo = lerTexto(corpo, 'motivo', { min: 5, max: 500, obrigatorio: decisao === 'pendente', multilinha: true });
    const versao = lerVersao(corpo);
    const oid = paraObjectId(envioIdBruto);
    if (!oid) throw naoEncontrado('Envio não encontrado.');
    const envio = await R.envios().findOne({ _id: oid });
    if (!envio) throw naoEncontrado('Envio não encontrado.');
    const permitidas = envio.atual === true ? (TRANSICOES_REVISAO[envio.status] || []) : [];
    if (!permitidas.includes(decisao)) throw new ErroPortal(409, 'transicao-invalida');
    if (Number(envio.versao) !== versao) throw new ErroPortal(409, 'conflito-versao');
    const em = agora();
    const por = String(req.user._id);
    await auditoria.executar({
      acao: 'documento.revisado', entidade: { tipo: 'documento_enviado', id: hex(envio._id) }, alvoUserId: envio.userId,
      mudancas: [{ campo: 'status', de: envio.status, para: decisao }], motivo: motivo || null,
      extra: { sigla: envio.sigla, numeroEnvio: envio.numeroEnvio, solicitarNovoEnvio: envio.status === 'aprovado' }
    }, req, async () => {
      const u = await R.envios().updateOne(
        { _id: envio._id, atual: true, versao },
        {
          $set: { status: decisao, motivo: decisao === 'pendente' ? motivo : null, revisadoEm: em, revisadoPor: por },
          $push: { historico: { status: decisao, em, por, motivo: motivo || null } }, $inc: { versao: 1 }
        }
      );
      if (!u || u.modifiedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
    });
    const tipo = await R.tipos().findOne({ _id: envio.tipoId }, { projection: { nome: 1 } });
    await notificar({
      userIds: [envio.userId], tipo: 'documento.revisado',
      titulo: decisao === 'aprovado' ? 'Documento aprovado' : 'Documento com pendência',
      texto: decisao === 'aprovado'
        ? `${envio.sigla} · ${tipo?.nome || 'Documento'}: aprovado pela secretaria.`
        : `${envio.sigla} · ${tipo?.nome || 'Documento'}: confira o motivo e envie de novo.`,
      link: 'documentos.html', entidade: { tipo: 'documento_enviado', id: hex(envio._id) }
    });
    const depois = await R.envios().findOne({ _id: envio._id });
    const p = await pessoas([envio.userId]);
    return envioPublico(depois, { aluno: p.get(String(envio.userId)) || null, tipoNome: tipo?.nome ?? null });
  }

  // ---------------------------------------------------------------
  // Fila da coordenação
  // ---------------------------------------------------------------
  async function fila(query) {
    const status = lerEnum(typeof query.status === 'string' && query.status ? query.status : 'em_revisao', STATUS_FILA, 'status') || 'em_revisao';
    const cursoId = typeof query.cursoId === 'string' && ID_LEGADO_RE.test(query.cursoId) ? query.cursoId : null;
    const sigla = typeof query.sigla === 'string' && SIGLA_DOCUMENTO_RE.test(query.sigla.toUpperCase()) ? query.sigla.toUpperCase() : null;
    const termos = typeof query.q === 'string' && query.q.trim() ? regexBusca(query.q) : null;
    const { pagina, porPagina, pular } = lerPagina(query, { porPaginaPadrao: 50 });

    // Recorte por pessoa (q) e por curso (cursoId), por id de usuário.
    let userIds = null;
    if (termos) {
      const us = await R.users().find({ $and: termos.map(t => ({ $or: [{ nome: { $regex: t.source, $options: 'i' } }, { email: { $regex: t.source, $options: 'i' } }] })) }, { projection: { _id: 1 } }).limit(500).toArray();
      userIds = us.map(u => String(u._id));
    }
    let porCurso = null;
    if (cursoId) {
      porCurso = await alunosPorCurso(cursoId);
      const doCurso = [...porCurso.keys()];
      userIds = userIds ? userIds.filter(u => doCurso.includes(u)) : doCurso;
    }
    const vazio = { itens: [], pagina, porPagina, total: 0, totalPaginas: 0 };
    if (userIds && !userIds.length) return vazio;

    let linhas;
    let total;
    if (status === 'nao_enviado') {
      let faltas = await naoEnviados({ cursoId, sigla });
      if (userIds) faltas = faltas.filter(f => userIds.includes(f.userId));
      total = faltas.length;
      const pagina_ = faltas.slice(pular, pular + porPagina);
      const p = await pessoas(pagina_.map(f => f.userId));
      linhas = pagina_.map(f => ({
        id: null, aluno: p.get(f.userId) ? { id: f.userId, nome: p.get(f.userId).nome, email: p.get(f.userId).email } : { id: f.userId, nome: null, email: null },
        tipoId: hex(f.tipo._id), sigla: f.tipo.sigla, tipoNome: f.tipo.nome, numeroEnvio: null, atual: false, enviadoEm: null,
        mime: null, tamanho: null, sha256: null, temArquivo: false, status: 'nao_enviado', motivo: null, revisadoEm: null, versao: null,
        cursoIds: f.cursoIds
      }));
    } else {
      const filtro = { atual: true, ...(status === 'todos' ? {} : { status }), ...(sigla ? { sigla } : {}), ...(userIds ? { userId: { $in: userIds } } : {}) };
      total = await R.envios().countDocuments(filtro);
      const ordem = status === 'em_revisao' || status === 'pendente' ? { enviadoEm: 1 } : { enviadoEm: -1 };
      const docs = await R.envios().find(filtro).sort(ordem).skip(pular).limit(porPagina).toArray();
      const [p, tipos] = await Promise.all([
        pessoas(docs.map(d => d.userId)),
        docs.length ? R.tipos().find({ _id: { $in: [...new Set(docs.map(d => hex(d.tipoId)))].map(id => new ObjectId(id)) } }, { projection: { nome: 1 } }).toArray() : []
      ]);
      const nomes = new Map(tipos.map(t => [hex(t._id), t.nome]));
      linhas = docs.map(d => envioPublico(d, { aluno: p.get(String(d.userId)) || null, tipoNome: nomes.get(hex(d.tipoId)) ?? null }));
    }
    // Cursos (títulos) de cada aluno da página — da F4a; sem o serviço, a coluna fica vazia (null).
    const f = servicos.tentar('secretaria.matriculasDoAluno');
    if (typeof f === 'function' && linhas.length) {
      const porAluno = new Map();
      for (const l of linhas) {
        const u = l.aluno.id;
        if (porAluno.has(u)) continue;
        try {
          const ms = await f(u);
          porAluno.set(u, [...new Set((ms || []).filter(m => m.status !== 'cancelada').map(m => String(m.cursoId)))]);
        } catch (err) { avisar('matrículas do aluno indisponíveis', err); porAluno.set(u, null); }
      }
      const titulos = await titulosDosCursos([...porAluno.values()].flat().filter(Boolean));
      for (const l of linhas) {
        const ids = porAluno.get(l.aluno.id);
        l.cursos = ids ? ids.map(id => titulos.get(id) || id) : null;
        delete l.cursoIds;
      }
    } else {
      for (const l of linhas) { l.cursos = null; delete l.cursoIds; }
    }
    return { itens: linhas, pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina) };
  }

  /** Detalhe para a tela de revisão (acréscimo: UX §7.15 pede histórico e identificação rotulada). */
  async function detalheDoEnvio(envioIdBruto) {
    const oid = paraObjectId(envioIdBruto);
    if (!oid) throw naoEncontrado('Envio não encontrado.');
    const envio = await R.envios().findOne({ _id: oid });
    if (!envio) throw naoEncontrado('Envio não encontrado.');
    const [tipo, historico, p] = await Promise.all([
      R.tipos().findOne({ _id: envio.tipoId }),
      R.envios().find({ userId: envio.userId, tipoId: envio.tipoId }).sort({ numeroEnvio: -1 }).toArray(),
      pessoas([envio.userId])
    ]);
    const pessoa = p.get(String(envio.userId)) || null;
    let nomeRegistro = null;
    const ident = servicos.tentar('perfis.identificacao');
    if (typeof ident === 'function') {
      try { nomeRegistro = (await ident(String(envio.userId)))?.nomeRegistro ?? null; } catch (err) { avisar('identificação indisponível', err); }
    }
    let cursos = null;
    try {
      const ids = await cursosDoAluno(envio.userId);
      const titulos = await titulosDosCursos(ids);
      cursos = ids.map(id => ({ id, titulo: titulos.get(id) || id }));
    } catch (err) { if (err?.status !== 503) throw err; }
    return {
      envio: envioPublico(envio, { aluno: pessoa, tipoNome: tipo?.nome ?? null }),
      tipo: tipo ? tipoPublico(tipo) : null,
      aluno: { id: String(envio.userId), nome: pessoa?.nome ?? null, nomeSocial: pessoa?.nomeSocial ?? null, nomeRegistro, email: pessoa?.email ?? null },
      cursos,
      historico: historico.map(h => ({
        id: hex(h._id), numeroEnvio: h.numeroEnvio, status: h.status, motivo: h.motivo ?? null, enviadoEm: iso(h.enviadoEm),
        revisadoEm: iso(h.revisadoEm), mime: h.mime ?? null, tamanho: h.tamanho ?? null, sha256: h.sha256 ?? null, atual: h.atual === true,
        eventos: (Array.isArray(h.historico) ? h.historico : []).map(x => ({ status: x.status, em: iso(x.em), motivo: x.motivo ?? null }))
      })),
      proximo: await proximoDaFila(envio)
    };
  }

  async function proximoDaFila(envio) {
    const prox = await R.envios().find({ atual: true, status: 'em_revisao', _id: { $ne: envio._id } }, { projection: { _id: 1 } }).sort({ enviadoEm: 1 }).limit(1).toArray();
    return prox[0] ? hex(prox[0]._id) : null;
  }

  async function lerArquivoDoEnvio(envio) {
    if (!envio || !envio.arquivoId) return null;
    return arquivos.ler(envio.arquivoId, { contexto: 'documento', 'ref.entidadeId': hex(envio._id), donoUserId: String(envio.userId) });
  }

  // ---------------------------------------------------------------
  // Tipos exigidos (coordenação)
  // ---------------------------------------------------------------
  async function conferirCursos(cursoIds) {
    if (!cursoIds || !cursoIds.length) return;
    const existentes = await R.cursos().find({ _id: { $in: cursoIds } }, { projection: { _id: 1 } }).toArray();
    const ok = new Set(existentes.map(c => String(c._id)));
    const faltam = cursoIds.filter(c => !ok.has(c));
    if (faltam.length) throw new ErroPortal(400, 'validacao', 'Há cursos desconhecidos na lista.', { campos: { cursoIds: 'Há cursos desconhecidos na lista.' }, desconhecidos: faltam });
  }

  async function listarTipos() {
    const tipos = (await R.tipos().find({}).toArray()).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || String(a.sigla).localeCompare(String(b.sigla)));
    const usados = new Set((await R.envios().find({}, { projection: { tipoId: 1 } }).toArray()).map(e => hex(e.tipoId)));
    return tipos.map(t => tipoPublico(t, { emUso: usados.has(hex(t._id)) }));
  }

  async function criarTipo(req, corpo) {
    const sigla = lerSigla(corpo, { obrigatorio: true });
    const nome = lerTexto(corpo, 'nome', { min: 3, max: 80, obrigatorio: true });
    const descricao = lerTexto(corpo, 'descricao', { max: 300, multilinha: true }) || '';
    const formatos = lerFormatos(corpo.formatos) || [...FORMATOS_DOCUMENTO];
    const escopo = lerEnum(corpo.escopo, ESCOPOS, 'escopo') || 'todos';
    const cursoIds = lerCursoIds(corpo.cursoIds) || [];
    if (escopo === 'cursos' && !cursoIds.length) throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoIds: 'Escolha pelo menos um curso.' } });
    await conferirCursos(cursoIds);
    const obrigatorio = lerBooleano(corpo.obrigatorio, 'obrigatorio') ?? true;
    const ativo = lerBooleano(corpo.ativo, 'ativo') ?? false;
    const ordem = lerInteiro(corpo.ordem, { min: 0, max: 9999 }, 'ordem') ?? 0;
    const em = agora();
    const doc = { sigla, nome, descricao, formatos, escopo, cursoIds: escopo === 'cursos' ? cursoIds : [], obrigatorio, ativo, ordem, versao: 1, criadoEm: em, criadoPor: String(req.user._id), atualizadoEm: em };
    try {
      const r = await R.tipos().insertOne(doc);
      doc._id = r.insertedId;
    } catch (err) {
      if (err && err.code === 11000) throw new ErroPortal(409, 'sigla-em-uso', undefined, { campos: { sigla: 'Sigla já usada.' } });
      throw err;
    }
    await auditoria.registrar({ acao: 'documento_tipo.criado', entidade: { tipo: 'documento_tipo', id: hex(doc._id) }, extra: { sigla, ativo, escopo } }, req);
    return tipoPublico(doc, { emUso: false });
  }

  async function alterarTipo(req, id, corpo) {
    const oid = paraObjectId(id);
    if (!oid) throw naoEncontrado('Tipo de documento não encontrado.');
    const versao = lerVersao(corpo);
    const mud = {};
    const sigla = lerSigla(corpo);
    if (sigla !== null) mud.sigla = sigla;
    const nome = corpo.nome === undefined ? null : lerTexto(corpo, 'nome', { min: 3, max: 80, obrigatorio: true });
    if (nome !== null) mud.nome = nome;
    if (corpo.descricao !== undefined) mud.descricao = lerTexto(corpo, 'descricao', { max: 300, multilinha: true }) || '';
    const formatos = lerFormatos(corpo.formatos);
    if (formatos) mud.formatos = formatos;
    const escopo = lerEnum(corpo.escopo, ESCOPOS, 'escopo');
    if (escopo) mud.escopo = escopo;
    const cursoIds = lerCursoIds(corpo.cursoIds);
    if (cursoIds) { await conferirCursos(cursoIds); mud.cursoIds = cursoIds; }
    const obrigatorio = lerBooleano(corpo.obrigatorio, 'obrigatorio');
    if (obrigatorio !== null) mud.obrigatorio = obrigatorio;
    const ativo = lerBooleano(corpo.ativo, 'ativo');
    if (ativo !== null) mud.ativo = ativo;
    const ordem = lerInteiro(corpo.ordem, { min: 0, max: 9999 }, 'ordem');
    if (ordem !== null) mud.ordem = ordem;
    const atual = await R.tipos().findOne({ _id: oid });
    if (!atual) throw naoEncontrado('Tipo de documento não encontrado.');
    if (Number(atual.versao) !== versao) throw new ErroPortal(409, 'conflito-versao');
    const escopoFinal = mud.escopo || atual.escopo;
    const cursosFinais = mud.cursoIds || atual.cursoIds || [];
    if (escopoFinal === 'cursos' && !cursosFinais.length) throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoIds: 'Escolha pelo menos um curso.' } });
    if (escopoFinal === 'todos' && mud.escopo === 'todos') mud.cursoIds = [];
    if (mud.sigla && mud.sigla !== atual.sigla && (await R.envios().countDocuments({ tipoId: oid })) > 0) {
      throw new ErroPortal(409, 'tipo-em-uso', 'A sigla não muda depois do primeiro envio.', { campos: { sigla: 'A sigla não muda depois do primeiro envio.' } });
    }
    const em = agora();
    try {
      const u = await R.tipos().updateOne({ _id: oid, versao }, { $set: { ...mud, atualizadoEm: em }, $inc: { versao: 1 } });
      if (!u || u.modifiedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
    } catch (err) {
      if (err && err.code === 11000) throw new ErroPortal(409, 'sigla-em-uso', undefined, { campos: { sigla: 'Sigla já usada.' } });
      throw err;
    }
    const depois = await R.tipos().findOne({ _id: oid });
    await auditoria.registrar({
      acao: 'documento_tipo.alterado', entidade: { tipo: 'documento_tipo', id: hex(oid) },
      mudancas: auditoria.mudancas ? auditoria.mudancas(atual, depois, ['sigla', 'nome', 'descricao', 'formatos', 'escopo', 'cursoIds', 'obrigatorio', 'ativo', 'ordem']) : null
    }, req);
    const emUso = (await R.envios().countDocuments({ tipoId: oid })) > 0;
    return tipoPublico(depois, { emUso });
  }

  async function removerTipo(req, id) {
    const oid = paraObjectId(id);
    if (!oid) throw naoEncontrado('Tipo de documento não encontrado.');
    const atual = await R.tipos().findOne({ _id: oid });
    if (!atual) throw naoEncontrado('Tipo de documento não encontrado.');
    if ((await R.envios().countDocuments({ tipoId: oid })) > 0) throw new ErroPortal(409, 'tipo-em-uso');
    await R.tipos().deleteOne({ _id: oid });
    await auditoria.registrar({ acao: 'documento_tipo.removido', entidade: { tipo: 'documento_tipo', id: hex(oid) }, extra: { sigla: atual.sigla } }, req);
    return { ok: true };
  }

  async function criarSugeridos(req) {
    const criados = [];
    const existentes = new Set((await R.tipos().find({}, { projection: { sigla: 1 } }).toArray()).map(t => t.sigla));
    const em = agora();
    let ordem = 10;
    for (const s of TIPOS_SUGERIDOS) {
      ordem += 10;
      if (existentes.has(s.sigla)) continue;
      const doc = {
        sigla: s.sigla, nome: s.nome, descricao: s.descricao, formatos: [...FORMATOS_DOCUMENTO], escopo: 'todos', cursoIds: [],
        obrigatorio: true, ativo: false, ordem, versao: 1, criadoEm: em, criadoPor: String(req.user._id), atualizadoEm: em
      };
      try {
        const r = await R.tipos().insertOne(doc);
        criados.push(s.sigla);
        await auditoria.registrar({ acao: 'documento_tipo.criado', entidade: { tipo: 'documento_tipo', id: hex(r.insertedId) }, extra: { sigla: s.sigla, ativo: false, sugerido: true } }, req);
      } catch (err) {
        if (!(err && err.code === 11000)) throw err;
      }
    }
    return { criados };
  }

  // ---------------------------------------------------------------
  // Serviço de nome fixo e grupos
  // ---------------------------------------------------------------
  /** secretaria.pendenciasDoAluno (API §4.4; consumidores F6a/F6b). */
  async function pendenciasDoAluno(userId) {
    const ck = await checklistDe(userId);
    const documentos = ck.itens
      .filter(i => i.exigido && (i.status === 'pendente' || i.status === 'nao_enviado'))
      .map(i => ({ sigla: i.sigla, nome: i.nome, status: i.status, statusRotulo: ROTULOS_STATUS_DOCUMENTO[i.status], motivo: i.motivo, obrigatorio: i.obrigatorio }));
    const cs = await R.contratos().find({ userId: String(userId), status: 'pendente', disponivelEm: { $ne: null } }).sort({ disponivelEm: 1 }).toArray();
    const contratos = cs.map(c => ({ id: hex(c._id), titulo: c.titulo, matriculaNumero: c.matriculaNumero ?? null, cursoTitulo: c.cursoTitulo ?? null, disponivelEm: iso(c.disponivelEm) }));
    return { documentos, contratos };
  }

  const avisos = [
    {
      id: 'documento-pendente',
      async gerar(req) {
        if (!req?.user?._id) return [];
        const ck = await checklistDe(String(req.user._id));
        const n = ck.itens.filter(i => i.exigido && i.status === 'pendente').length;
        if (!n) return [];
        return [{ id: 'documento-pendente', tom: 'aviso', texto: n === 1 ? 'Um documento seu precisa ser enviado de novo. Confira o motivo.' : `${n} documentos seus precisam ser enviados de novo. Confira os motivos.`, href: 'documentos.html', rotulo: 'Ver documentos', dispensavel: true, contador: n }];
      }
    },
    {
      id: 'documento-nao-enviado',
      async gerar(req) {
        if (!req?.user?._id) return [];
        const ck = await checklistDe(String(req.user._id));
        const n = ck.itens.filter(i => i.exigido && i.status === 'nao_enviado').length;
        if (!n) return [];
        return [{ id: 'documento-nao-enviado', tom: 'info', texto: n === 1 ? 'Há um documento da sua matrícula ainda não enviado.' : `Há ${n} documentos da sua matrícula ainda não enviados.`, href: 'documentos.html', rotulo: 'Enviar documentos', dispensavel: true, contador: n }];
      }
    }
  ];

  const busca = {
    tipo: 'documentos',
    papeis: ['aluno', 'admin'],
    async buscar(req, termos, { limite = 5, pular = 0 } = {}) {
      const casa = s => termos.every(t => t.test(String(s ?? '')));
      if (papelDe(req.user) === 'admin') {
        const tipos = await R.tipos().find({}).toArray();
        const nomes = new Map(tipos.map(t => [hex(t._id), t]));
        const tiposQueCasam = tipos.filter(t => casa(`${t.sigla} ${t.nome}`)).map(t => t._id);
        const us = await R.users().find({ $and: termos.map(t => ({ $or: [{ nome: { $regex: t.source, $options: 'i' } }, { email: { $regex: t.source, $options: 'i' } }] })) }, { projection: { _id: 1 } }).limit(200).toArray();
        const ou = [];
        if (tiposQueCasam.length) ou.push({ tipoId: { $in: tiposQueCasam } });
        if (us.length) ou.push({ userId: { $in: us.map(u => String(u._id)) } });
        if (!ou.length) return { itens: [], temMais: false };
        const docs = await R.envios().find({ atual: true, $or: ou }).sort({ enviadoEm: -1 }).skip(pular).limit(limite + 1).toArray();
        const p = await pessoas(docs.map(d => d.userId));
        return {
          itens: docs.slice(0, limite).map(d => ({
            tipo: 'documentos', id: hex(d._id), titulo: `${d.sigla} · ${nomes.get(hex(d.tipoId))?.nome || 'Documento'}`,
            contexto: `${p.get(String(d.userId))?.nome || 'Aluno'} · ${ROTULOS_STATUS_DOCUMENTO[d.status] || d.status}`,
            href: `professor.html#/documentos/${hex(d._id)}`, bloqueado: false
          })),
          temMais: docs.length > limite
        };
      }
      const ck = await checklistDe(String(req.user._id));
      const achados = ck.itens.filter(i => casa(`${i.sigla} ${i.nome} ${i.descricao}`));
      return {
        itens: achados.slice(pular, pular + limite).map(i => ({ tipo: 'documentos', id: i.tipoId, titulo: `${i.sigla} · ${i.nome}`, contexto: ROTULOS_STATUS_DOCUMENTO[i.status], href: 'documentos.html', bloqueado: false })),
        temMais: achados.length > pular + limite
      };
    }
  };

  const painel = {
    bloco: 'documentos',
    chaves: ['emRevisao', 'pendentes', 'naoEnviadosObrigatorios'],
    papeis: ['admin'],
    async contar() {
      const [emRevisao, pendentes] = await Promise.all([
        R.envios().countDocuments({ atual: true, status: 'em_revisao' }),
        R.envios().countDocuments({ atual: true, status: 'pendente' })
      ]);
      let naoEnviadosObrigatorios = null;
      try { naoEnviadosObrigatorios = (await naoEnviados({ somenteObrigatorios: true })).length; } catch (err) { if (err?.status !== 503) throw err; }
      return { emRevisao, pendentes, naoEnviadosObrigatorios };
    }
  };

  const relatorio = {
    id: 'documentos-pendentes',
    titulo: 'Documentos pendentes',
    papeis: ['admin'],
    filtros: [{ chave: 'cursoId', tipo: 'curso' }, { chave: 'sigla', tipo: 'texto' }],
    colunas: [
      { chave: 'aluno', rotulo: 'Aluno', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto', somenteAdmin: true },
      { chave: 'cursos', rotulo: 'Curso(s)', tipo: 'texto' },
      { chave: 'sigla', rotulo: 'Sigla', tipo: 'texto' },
      { chave: 'documento', rotulo: 'Documento', tipo: 'texto' },
      { chave: 'status', rotulo: 'Situação', tipo: 'status' },
      { chave: 'motivo', rotulo: 'Motivo', tipo: 'texto' },
      { chave: 'enviadoEm', rotulo: 'Enviado em', tipo: 'dataHora' },
      { chave: 'diasEmRevisao', rotulo: 'Dias em revisão', tipo: 'numero' }
    ],
    async consultar(_req, filtros = {}, { limite = 5000 } = {}) {
      return linhasDoRelatorio(filtros, limite);
    },
    async resumir(_req, filtros = {}) {
      const linhas = await linhasDoRelatorio(filtros, 5000);
      const emRev = linhas.filter(l => l.statusChave === 'em_revisao');
      const dias = emRev.map(l => l.diasEmRevisao).filter(n => Number.isFinite(n));
      const porTipo = new Map();
      for (const l of linhas) if (l.statusChave !== 'em_revisao') porTipo.set(l.sigla, (porTipo.get(l.sigla) || 0) + 1);
      return {
        kpis: [
          { chave: 'emRevisao', rotulo: 'Em revisão', valor: emRev.length, formato: 'numero' },
          { chave: 'pendentes', rotulo: 'Pendentes', valor: linhas.filter(l => l.statusChave === 'pendente').length, formato: 'numero' },
          { chave: 'naoEnviadosObrigatorios', rotulo: 'Não enviados (obrigatórios)', valor: linhas.filter(l => l.statusChave === 'nao_enviado' && l.obrigatorio).length, formato: 'numero' },
          { chave: 'diasMedioEmRevisao', rotulo: 'Dias médios em revisão', valor: dias.length ? Math.round((dias.reduce((s, n) => s + n, 0) / dias.length) * 10) / 10 : null, formato: 'numero' }
        ],
        series: [{ chave: 'pendentesPorTipo', rotulo: 'Pendentes e não enviados por tipo', formato: 'numero', pontos: [...porTipo].map(([rotulo, valor]) => ({ rotulo, valor })) }]
      };
    }
  };

  async function linhasDoRelatorio(filtros, limite) {
    const cursoId = typeof filtros.cursoId === 'string' && ID_LEGADO_RE.test(filtros.cursoId) ? filtros.cursoId : null;
    const sigla = typeof filtros.sigla === 'string' && SIGLA_DOCUMENTO_RE.test(filtros.sigla.toUpperCase()) ? filtros.sigla.toUpperCase() : null;
    const porCurso = await alunosPorCurso(cursoId);
    const userIds = [...porCurso.keys()];
    const enviados = userIds.length ? await R.envios().find({ atual: true, status: { $in: ['em_revisao', 'pendente'] }, userId: { $in: userIds }, ...(sigla ? { sigla } : {}) }).sort({ enviadoEm: 1 }).toArray() : [];
    const faltas = await naoEnviados({ cursoId, sigla });
    const tipos = await R.tipos().find({}).toArray();
    const porTipo = new Map(tipos.map(t => [hex(t._id), t]));
    const p = await pessoas([...new Set([...enviados.map(e => e.userId), ...faltas.map(f => f.userId)])]);
    const titulos = await titulosDosCursos([...new Set([...porCurso.values()].flatMap(s => [...s]))]);
    const cursosDe = u => [...(porCurso.get(String(u)) || [])].map(id => titulos.get(id) || id).join('; ');
    const hoje = agora().getTime();
    const linhas = [
      ...enviados.map(e => ({
        aluno: p.get(String(e.userId))?.nome ?? null, email: p.get(String(e.userId))?.email ?? null, cursos: cursosDe(e.userId),
        sigla: e.sigla, documento: porTipo.get(hex(e.tipoId))?.nome ?? null, status: ROTULOS_STATUS_DOCUMENTO[e.status], statusChave: e.status,
        motivo: e.status === 'pendente' ? (e.motivo ?? null) : null, enviadoEm: iso(e.enviadoEm),
        diasEmRevisao: e.status === 'em_revisao' && e.enviadoEm ? Math.floor((hoje - new Date(e.enviadoEm).getTime()) / DIA_MS) : null,
        obrigatorio: porTipo.get(hex(e.tipoId))?.obrigatorio === true
      })),
      ...faltas.map(f => ({
        aluno: p.get(f.userId)?.nome ?? null, email: p.get(f.userId)?.email ?? null, cursos: cursosDe(f.userId),
        sigla: f.tipo.sigla, documento: f.tipo.nome, status: ROTULOS_STATUS_DOCUMENTO.nao_enviado, statusChave: 'nao_enviado',
        motivo: null, enviadoEm: null, diasEmRevisao: null, obrigatorio: f.tipo.obrigatorio === true
      }))
    ];
    return linhas.slice(0, limite);
  }

  const exportador = {
    dominio: 'documentos',
    async exportar(userId) {
      const envios = await R.envios().find({ userId: String(userId) }).sort({ enviadoEm: 1 }).toArray();
      const tipos = await R.tipos().find({}, { projection: { sigla: 1, nome: 1 } }).toArray();
      const nomes = new Map(tipos.map(t => [hex(t._id), t.nome]));
      return {
        envios: envios.map(e => ({
          sigla: e.sigla, documento: nomes.get(hex(e.tipoId)) ?? null, numeroEnvio: e.numeroEnvio, status: e.status, motivo: e.motivo ?? null,
          enviadoEm: iso(e.enviadoEm), revisadoEm: iso(e.revisadoEm), mime: e.mime ?? null, tamanho: e.tamanho ?? null, sha256: e.sha256 ?? null,
          arquivoGuardado: !!e.arquivoId
        }))
      };
    }
  };

  return Object.freeze({
    limiteBytes, checklistDe, enviar, revisar, fila, detalheDoEnvio, lerArquivoDoEnvio, listarTipos, criarTipo, alterarTipo,
    removerTipo, criarSugeridos, pendenciasDoAluno, avisos, busca, painel, relatorio, exportador, R
  });
}

/**
 * Fábrica pura das rotas (testável com falsos, padrão bolsas.test.js).
 * @param {{ documentos: object, contador?: object, auditoria: object, arquivos: object }} deps
 * @returns {{ aluno: Router, admin: Router }}
 */
export function criarRotasDocumentos({ documentos, contador = null, auditoria, arquivos } = {}) {
  if (!documentos) throw new Error('criarRotasDocumentos: informe documentos.');
  if (!auditoria) throw new Error('criarRotasDocumentos: informe auditoria.');
  if (!arquivos) throw new Error('criarRotasDocumentos: informe arquivos.');
  const aluno = Router();
  const admin = Router();
  const D = documentos;
  const semLimite = (_req, _res, next) => next();
  const limiteEnvio = contador
    ? limitePersistente(contador, { ...LIMITE_ENVIOS, chave: req => `doc-envio:u:${String(req.user._id)}`, mensagem: 'Muitos envios em pouco tempo. Aguarde e tente de novo.' })
    : semLimite;
  const corpoBinario = lerCorpoBinario({ limiteBytes: D.limiteBytes, tipos: [...FORMATOS_DOCUMENTO] });

  // ----------------------------- titular -----------------------------
  aluno.get('/me/documentos', async (req, res) => {
    res.json(await D.checklistDe(String(req.user._id)));
  });

  aluno.post('/me/documentos/tipos/:tipoId/envio', limiteEnvio, ...corpoBinario, async (req, res) => {
    res.status(201).json(await D.enviar(req, req.params.tipoId));
  });

  aluno.get('/me/documentos/envios/:envioId/arquivo', async (req, res) => {
    const oid = paraObjectId(req.params.envioId);
    if (!oid) throw naoEncontrado('Arquivo não encontrado.');
    const envio = await D.R.envios().findOne({ _id: oid, userId: String(req.user._id) });
    const arq = await D.lerArquivoDoEnvio(envio);
    if (!arq) throw naoEncontrado('Arquivo não encontrado.');
    arquivos.enviar(res, arq, { nome: nomeDoEnvio(envio) });
  });

  // ---------------------------- coordenação ----------------------------
  admin.get('/documentos', async (req, res) => {
    res.json(await D.fila(req.query || {}));
  });

  admin.get('/documentos/tipos', async (_req, res) => {
    res.json({ itens: await D.listarTipos() });
  });

  admin.post('/documentos/tipos/sugeridos', async (req, res) => {
    res.json(await D.criarSugeridos(req));
  });

  admin.post('/documentos/tipos', async (req, res) => {
    res.status(201).json({ tipo: await D.criarTipo(req, corpoDe(req)) });
  });

  admin.put('/documentos/tipos/:id', async (req, res) => {
    res.json({ tipo: await D.alterarTipo(req, req.params.id, corpoDe(req)) });
  });

  admin.delete('/documentos/tipos/:id', async (req, res) => {
    res.json(await D.removerTipo(req, req.params.id));
  });

  admin.get('/documentos/envios/:envioId', async (req, res) => {
    res.json(await D.detalheDoEnvio(req.params.envioId));
  });

  admin.put('/documentos/envios/:envioId/revisao', async (req, res) => {
    res.json({ envio: await D.revisar(req, req.params.envioId, corpoDe(req)) });
  });

  admin.get('/documentos/envios/:envioId/arquivo', async (req, res) => {
    const oid = paraObjectId(req.params.envioId);
    if (!oid) throw naoEncontrado('Arquivo não encontrado.');
    const envio = await D.R.envios().findOne({ _id: oid });
    const arq = await D.lerArquivoDoEnvio(envio);
    if (!arq) throw naoEncontrado('Arquivo não encontrado.');
    await auditoria.registrar({ acao: 'documento.baixado_pela_equipe', entidade: { tipo: 'documento_enviado', id: hex(envio._id) }, alvoUserId: envio.userId, extra: { sigla: envio.sigla, numeroEnvio: envio.numeroEnvio } }, req);
    arquivos.enviar(res, arq, { nome: nomeDoEnvio(envio) });
  });

  admin.get('/usuarios/:userId/documentos', async (req, res) => {
    const id = typeof req.params.userId === 'string' && ID_RE.test(req.params.userId) ? req.params.userId : null;
    if (!id) throw naoEncontrado('Usuário não encontrado.');
    const u = await D.R.users().findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } });
    if (!u) throw naoEncontrado('Usuário não encontrado.');
    res.json(await D.checklistDe(id));
  });

  return { aluno, admin };
}

/** Montagem no agregador (API §5.1): síncrona no efeito, sem E/S. */
export default async function montar(ctx) {
  const { rotas, servicos, comum } = ctx;
  comum.registrarIndices(INDICES_DOCUMENTACAO);
  const documentos = criarDocumentos({
    repo: comum.repo, arquivos: comum.arquivos, auditoria: comum.auditoria, notificacoes: comum.notificacoes, servicos,
    acesso: comum.acesso, configPortal: comum.configPortal, agora: comum.agora, log: comum.log
  });
  servicos.registrar('secretaria.pendenciasDoAluno', documentos.pendenciasDoAluno);
  for (const def of documentos.avisos) servicos.adicionar('aviso', def);
  servicos.adicionar('busca', documentos.busca);
  servicos.adicionar('painel', documentos.painel);
  servicos.adicionar('relatorio', documentos.relatorio);
  servicos.adicionar('exportador', documentos.exportador);
  const { aluno, admin } = criarRotasDocumentos({ documentos, contador: comum.contador, auditoria: comum.auditoria, arquivos: comum.arquivos });
  rotas.aluno.use(aluno);
  rotas.admin.use(admin);
}
