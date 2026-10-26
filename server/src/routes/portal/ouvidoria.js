// =============================================================
// COMPLEXO DMC · Portal — Ouvidoria (protocolos OUV)
// PORTAL-API §6.10.2 · §3.3 (F6) · DC-40, DC-46, D-54 · dono: F6a.
//
//   /api/portal/me/ouvidoria                 (manifestante)
//   /api/portal/admin/ouvidoria              (coordenação; identidade só com ?identidade=1, auditada)
//   /api/portal/professor/ouvidoria          (SÓ as encaminhadas a ele, SEMPRE saneadas)
//
// A ouvidoria não é anônima (a conta fica ligada para a coordenação
// responder), mas a identidade nunca chega a professor, em nenhum tipo.
// Denúncia não se encaminha a professor (409 encaminhamento-nao-permitido).
// Trilha de auditoria (achado G2, LGPD): nenhum evento `ouvidoria.*` grava
// quem se manifestou — sem `alvoUserId` = manifestante e, nas ações do
// próprio manifestante (criar, encerrar), ator sem id, papel real nem rede
// (`extra.identidade:'resguardada'`). O vínculo pessoa ↔ protocolo fica só em
// `manifestacoes.userId`, lido pelo caminho auditado (?identidade=1).
// Serviço registrado: atendimento.ouvidoriaSemParecer (F8). Grupos:
// painel (bloco ouvidoria), exportador (ouvidoria), relatorio (ouvidoria).
// =============================================================
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../../portal/erros.js';
import { lerTexto, lerEnum, lerPagina, validarDataCalendario } from '../../portal/validacao.js';
import { papelDe } from '../../portal/papeis.js';
import { codigoAnual, inserirComCodigo } from '../../portal/codigos.js';
import {
  TIPOS_OUVIDORIA, STATUS, OUV_RE, MAX_MENSAGENS, INDICES_OUVIDORIA, ROTULOS_TIPO_OUVIDORIA,
  itemOuvidoriaDoTitular, detalheOuvidoriaDoTitular, itemOuvidoriaDaCoordenacao, detalheOuvidoriaDaCoordenacao,
  visaoOuvidoriaDoProfessor, encaminhamentoPara, criarServicoAtendimento, novoIdMensagem, consumirLimites
} from '../../portal/atendimento/protocolos.js';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

export const LIMITES_OUVIDORIA = Object.freeze({
  criarHora: { janelaMs: HORA, max: 3 },
  criarDia: { janelaMs: DIA, max: 10 },
  mensagemHora: { janelaMs: HORA, max: 30 }
});

/** Identidade do manifestante fora da trilha: o registro sai com ator { userId:null, papel:'anonimo', ipTruncado:null }. */
const IDENTIDADE_RESGUARDADA = 'resguardada';
const reqResguardado = () => ({ user: null, ip: null });

const naoEncontrada = () => new ErroPortal(404, null, 'Não encontramos esta manifestação.');

function lerProtocolo(req) {
  const p = String(req.params.protocolo || '').toUpperCase();
  return OUV_RE.test(p) ? p : null;
}

/**
 * Fábrica das rotas (testável com falsos).
 * @returns {{ aluno: Router, professor: Router, admin: Router }}
 */
export function criarRotasOuvidoria({
  repo, servicos, acesso, auditoria, notificacoes = null, contador = null, garantia = null, agora = () => new Date(), log = console
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotasOuvidoria: informe repo.');
  if (!servicos) throw new TypeError('criarRotasOuvidoria: informe servicos.');
  if (!acesso) throw new TypeError('criarRotasOuvidoria: informe acesso.');
  if (!auditoria) throw new TypeError('criarRotasOuvidoria: informe auditoria.');
  const col = () => repo('manifestacoes');
  const srv = criarServicoAtendimento({ repo, servicos, acesso, auditoria, notificacoes, garantia, agora, log });

  const aluno = Router();
  const professor = Router();
  const admin = Router();

  async function nomes(ids) {
    const lista = [...new Set(ids.filter(Boolean).map(String))];
    if (!lista.length) return new Map();
    const f = servicos.tentar('perfis.publicos');
    if (typeof f !== 'function') return new Map();
    try { return await f(lista); } catch { return new Map(); }
  }
  async function cursosPorId(ids) {
    const lista = [...new Set(ids.filter(Boolean).map(String))];
    if (!lista.length) return new Map();
    const docs = await repo('cursos').find({ _id: { $in: lista } }, { projection: { titulo: 1 } }).toArray();
    return new Map(docs.map(c => [String(c._id), { id: String(c._id), titulo: c.titulo }]));
  }
  async function notificar(evento) {
    if (!notificacoes) return;
    try { await notificacoes.emitir(evento); } catch { /* nunca derruba a resposta */ }
  }

  async function acrescentar(filtro, montar) {
    for (let i = 0; i < 3; i++) {
      const doc = await col().findOne(filtro);
      if (!doc) throw naoEncontrada();
      if (doc.status === 'encerrado') throw new ErroPortal(409, 'protocolo-encerrado');
      if ((doc.mensagens || []).length >= MAX_MENSAGENS) throw new ErroPortal(409, 'protocolo-longo');
      const { mensagem, set } = montar(doc);
      const r = await col().updateOne({ _id: doc._id, versao: doc.versao }, { $push: { mensagens: mensagem }, $set: set, $inc: { versao: 1 } });
      if (r.modifiedCount === 1) return { doc, mensagem };
    }
    throw new ErroPortal(409, 'conflito-versao');
  }

  // =========================================================
  // Manifestante
  // =========================================================
  aluno.post('/me/ouvidoria', async (req, res) => {
    const corpo = req.body || {};
    const tipo = lerEnum(corpo.tipo, TIPOS_OUVIDORIA, 'tipo', { obrigatorio: true });
    const assunto = lerTexto(corpo, 'assunto', { min: 5, max: 140, obrigatorio: true });
    const texto = lerTexto(corpo, 'texto', { min: 20, max: 6000, obrigatorio: true, multilinha: true });
    // `identidadeResguardada` enviado é IGNORADO (DC-40): a identidade nunca vai a professor.
    let curso = null;
    if (corpo.cursoId !== undefined && corpo.cursoId !== null && corpo.cursoId !== '') {
      if (typeof corpo.cursoId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(corpo.cursoId)) {
        throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoId: 'Curso inválido.' } });
      }
      const userId = String(req.user._id);
      const meus = await acesso.cursosDoAluno(userId);
      const ok = meus.includes(corpo.cursoId) || await acesso.podeVerCurso(req, corpo.cursoId);
      curso = ok ? (await cursosPorId([corpo.cursoId])).get(corpo.cursoId) : null;
      if (!curso) throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoId: 'Escolha um dos seus cursos.' } });
    }
    const userId = String(req.user._id);
    await consumirLimites(contador, req, [
      { chave: `ouv-h:${userId}`, ...LIMITES_OUVIDORIA.criarHora },
      { chave: `ouv-d:${userId}`, ...LIMITES_OUVIDORIA.criarDia }
    ]);
    const t = agora();
    const doc = {
      userId, tipo, assunto, texto, cursoId: curso?.id ?? null, status: 'aberto', mensagens: [], encaminhamentos: [],
      primeiraRespostaEm: null, ultimaAtividadeEm: t, encerradoEm: null, versao: 1, criadoEm: t
    };
    await srv.esperarIndices();
    const { codigo } = await inserirComCodigo((c) => col().insertOne({ ...doc, protocolo: c }), () => codigoAnual('OUV', t), { indice: 'uq_ouv_protocolo', campo: 'protocolo' });
    doc.protocolo = codigo;
    await auditoria.registrar({ acao: 'ouvidoria.criada', entidade: { tipo: 'manifestacao', id: codigo }, cursoId: doc.cursoId, extra: { tipo, identidade: IDENTIDADE_RESGUARDADA } }, reqResguardado());
    res.status(201).json(detalheOuvidoriaDoTitular(doc, { curso }));
  });

  aluno.get('/me/ouvidoria', async (req, res) => {
    const userId = String(req.user._id);
    const f = { userId };
    const tipo = lerEnum(req.query.tipo || null, TIPOS_OUVIDORIA, 'tipo');
    if (tipo) f.tipo = tipo;
    const status = lerEnum(req.query.status && req.query.status !== 'todos' ? req.query.status : null, STATUS, 'status');
    if (status) f.status = status;
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: 25, max: 100 });
    const [total, docs] = await Promise.all([
      col().countDocuments(f),
      col().find(f, { projection: { protocolo: 1, tipo: 1, assunto: 1, status: 1, criadoEm: 1, ultimaAtividadeEm: 1 } }).sort({ criadoEm: -1 }).skip(pular).limit(porPagina).toArray()
    ]);
    res.json({ itens: docs.map(itemOuvidoriaDoTitular), pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) });
  });

  aluno.get('/me/ouvidoria/:protocolo', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrada();
    const doc = await col().findOne({ protocolo, userId: String(req.user._id) });
    if (!doc) throw naoEncontrada();
    const curso = doc.cursoId ? (await cursosPorId([doc.cursoId])).get(doc.cursoId) : null;
    res.json(detalheOuvidoriaDoTitular(doc, { curso }));
  });

  aluno.post('/me/ouvidoria/:protocolo/mensagens', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrada();
    const texto = lerTexto(req.body || {}, 'texto', { min: 1, max: 4000, obrigatorio: true, multilinha: true });
    const userId = String(req.user._id);
    if (!(await col().findOne({ protocolo, userId }, { projection: { _id: 1 } }))) throw naoEncontrada();
    await consumirLimites(contador, req, [{ chave: `ouv-msg:${userId}`, ...LIMITES_OUVIDORIA.mensagemHora }]);
    const t = agora();
    const { mensagem } = await acrescentar({ protocolo, userId }, () => ({
      mensagem: { id: novoIdMensagem(), autorPapel: 'manifestante', autorId: userId, texto, em: t },
      set: { status: 'aberto', ultimaAtividadeEm: t }
    }));
    res.status(201).json({ id: mensagem.id, autor: 'voce', autorNome: 'Você', texto, em: t.toISOString(), status: 'aberto' });
  });

  aluno.post('/me/ouvidoria/:protocolo/encerrar', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrada();
    const userId = String(req.user._id);
    const doc = await col().findOne({ protocolo, userId }, { projection: { status: 1, cursoId: 1 } });
    if (!doc) throw naoEncontrada();
    if (doc.status !== 'encerrado') {
      const t = agora();
      await col().updateOne({ _id: doc._id, status: { $ne: 'encerrado' } }, { $set: { status: 'encerrado', encerradoEm: t, ultimaAtividadeEm: t }, $inc: { versao: 1 } });
      await auditoria.registrar({ acao: 'ouvidoria.encerrada', entidade: { tipo: 'manifestacao', id: protocolo }, cursoId: doc.cursoId ?? null, extra: { por: 'manifestante', identidade: IDENTIDADE_RESGUARDADA } }, reqResguardado());
    }
    res.json({ protocolo });
  });

  // =========================================================
  // Coordenação
  // =========================================================
  admin.get('/ouvidoria', async (req, res) => {
    const f = {};
    const tipo = lerEnum(req.query.tipo || null, TIPOS_OUVIDORIA, 'tipo');
    if (tipo) f.tipo = tipo;
    const status = lerEnum(req.query.status && req.query.status !== 'todos' ? req.query.status : null, STATUS, 'status');
    if (status) f.status = status;
    if (req.query.cursoId) {
      if (typeof req.query.cursoId !== 'string') throw new ErroPortal(400, 'formato-invalido');
      f.cursoId = req.query.cursoId;
    }
    const de = req.query.de ? validarDataCalendario(String(req.query.de)) : null;
    const ate = req.query.ate ? validarDataCalendario(String(req.query.ate)) : null;
    if ((req.query.de && !de) || (req.query.ate && !ate)) throw new ErroPortal(400, 'validacao', undefined, { campos: { de: 'Data inválida.' } });
    if (de || ate) {
      f.criadoEm = {};
      if (de) f.criadoEm.$gte = new Date(`${de}T00:00:00-03:00`);
      if (ate) f.criadoEm.$lte = new Date(`${ate}T23:59:59.999-03:00`);
    }
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: 25, max: 100 });
    const { status: _s, ...semStatus } = f;
    const [total, docs, ...cont] = await Promise.all([
      col().countDocuments(f),
      col().find(f, { projection: { userId: 0, mensagens: 0, texto: 0 } }).sort({ criadoEm: status === 'aberto' ? 1 : -1 }).skip(pular).limit(porPagina).toArray(),
      ...STATUS.map(s => col().countDocuments({ ...semStatus, status: s }))
    ]);
    const [cursos, mapa] = await Promise.all([
      cursosPorId(docs.map(d => d.cursoId)),
      nomes(docs.flatMap(d => (d.encaminhamentos || []).map(e => e.paraUserId)))
    ]);
    res.json({
      itens: docs.map(d => itemOuvidoriaDaCoordenacao(d, { cursos, nomes: mapa })),
      pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
      contagens: Object.fromEntries(STATUS.map((s, i) => [s, cont[i]]))
    });
  });

  async function detalheDaCoordenacao(doc) {
    const [cursos, mapa] = await Promise.all([
      cursosPorId([doc.cursoId]),
      nomes((doc.encaminhamentos || []).map(e => e.paraUserId))
    ]);
    return detalheOuvidoriaDaCoordenacao(doc, { curso: doc.cursoId ? cursos.get(doc.cursoId) : null, nomes: mapa });
  }

  admin.get('/ouvidoria/:protocolo', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrada();
    const doc = await col().findOne({ protocolo });
    if (!doc) throw naoEncontrada();
    const saida = await detalheDaCoordenacao(doc);
    if (req.query.identidade === '1') {
      saida.identidade = await auditoria.executar({
        // Sem alvoUserId: quem consulta a trilha não descobre a identidade que outro membro da coordenação abriu.
        acao: 'ouvidoria.identidade_acessada', entidade: { tipo: 'manifestacao', id: protocolo }, cursoId: doc.cursoId ?? null, extra: { tipo: doc.tipo }
      }, req, async () => {
        const mapa = await nomes([doc.userId]);
        const p = mapa.get(doc.userId);
        let matricula = null;
        const f = servicos.tentar('secretaria.matriculasDoAluno');
        if (typeof f === 'function') {
          try {
            const mats = await f(doc.userId);
            const vig = (mats || []).find(m => !doc.cursoId || m.cursoId === doc.cursoId) || (mats || [])[0];
            matricula = vig?.numero ?? null;
          } catch { matricula = null; }
        }
        return { nome: p ? (p.nomeSocial || p.nome) : null, email: p?.email ?? null, matricula };
      });
    }
    res.json(saida);
  });

  admin.post('/ouvidoria/:protocolo/mensagens', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrada();
    const texto = lerTexto(req.body || {}, 'texto', { min: 1, max: 4000, obrigatorio: true, multilinha: true });
    const eu = String(req.user._id);
    const t = agora();
    const { doc, mensagem } = await acrescentar({ protocolo }, (d) => ({
      mensagem: { id: novoIdMensagem(), autorPapel: 'ouvidoria', autorId: eu, texto, em: t },
      set: { status: 'respondido', ultimaAtividadeEm: t, ...(d.primeiraRespostaEm ? {} : { primeiraRespostaEm: t }) }
    }));
    await auditoria.registrar({ acao: 'ouvidoria.respondida', entidade: { tipo: 'manifestacao', id: protocolo }, cursoId: doc.cursoId ?? null }, req);
    await notificar({
      userIds: [doc.userId], tipo: 'ouvidoria.respondida', titulo: 'Ouvidoria respondeu',
      texto: `A Ouvidoria respondeu à manifestação ${protocolo}.`, link: `ouvidoria.html?protocolo=${protocolo}`,
      entidade: { tipo: 'manifestacao', id: protocolo }
    });
    res.status(201).json({ id: mensagem.id, autor: 'ouvidoria', autorNome: 'Ouvidoria', texto, em: t.toISOString(), status: 'respondido' });
  });

  admin.post('/ouvidoria/:protocolo/encerrar', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrada();
    const motivo = lerTexto(req.body || {}, 'motivo', { max: 500, multilinha: true });
    const doc = await col().findOne({ protocolo }, { projection: { status: 1, cursoId: 1 } });
    if (!doc) throw naoEncontrada();
    if (doc.status !== 'encerrado') {
      const t = agora();
      await col().updateOne({ _id: doc._id, status: { $ne: 'encerrado' } }, { $set: { status: 'encerrado', encerradoEm: t, ultimaAtividadeEm: t }, $inc: { versao: 1 } });
      await auditoria.registrar({ acao: 'ouvidoria.encerrada', entidade: { tipo: 'manifestacao', id: protocolo }, cursoId: doc.cursoId ?? null, motivo, extra: { por: 'coordenacao' } }, req);
    }
    res.json({ protocolo });
  });

  admin.post('/ouvidoria/:protocolo/encaminhar', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrada();
    const corpo = req.body || {};
    const observacao = lerTexto(corpo, 'observacao', { min: 10, max: 1000, obrigatorio: true, multilinha: true });
    const professorId = typeof corpo.professorId === 'string' && /^[a-f0-9]{24}$/.test(corpo.professorId) ? corpo.professorId : null;
    if (corpo.professorId !== undefined && corpo.professorId !== null && typeof corpo.professorId !== 'string') {
      throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { professorId: 'Formato inválido.' } });
    }
    const doc = await col().findOne({ protocolo });
    if (!doc) throw naoEncontrada();
    if (doc.tipo === 'denuncia') throw new ErroPortal(409, 'encaminhamento-nao-permitido');
    const u = professorId ? await repo('users').findOne({ _id: new ObjectId(professorId) }, { projection: { isAdmin: 1, papel: 1, desativadoEm: 1 } }) : null;
    if (!u || u.desativadoEm || papelDe(u) !== 'professor') {
      throw new ErroPortal(400, 'validacao', undefined, { campos: { professorId: 'Escolha um professor.' } });
    }
    const t = agora();
    const enc = { paraUserId: professorId, em: t, por: String(req.user._id), observacao, parecer: null };
    await auditoria.executar({
      acao: 'ouvidoria.encaminhada', entidade: { tipo: 'manifestacao', id: protocolo }, alvoUserId: professorId, cursoId: doc.cursoId ?? null, extra: { tipo: doc.tipo }
    }, req, async () => {
      await col().updateOne({ _id: doc._id }, { $push: { encaminhamentos: enc }, $set: { ultimaAtividadeEm: t }, $inc: { versao: 1 } });
    });
    await notificar({
      userIds: [professorId], tipo: 'ouvidoria.encaminhada', titulo: 'Manifestação encaminhada a você',
      texto: `A coordenação encaminhou a manifestação ${protocolo} para o seu parecer.`, link: `professor.html#/ouvidoria/${protocolo}`,
      entidade: { tipo: 'manifestacao', id: protocolo }
    });
    res.status(201).json(await detalheDaCoordenacao(await col().findOne({ _id: doc._id })));
  });

  // =========================================================
  // Professor — só as encaminhadas a ele, saneadas
  // =========================================================
  professor.get('/ouvidoria', async (req, res) => {
    const eu = String(req.user._id);
    const docs = await col().find({ 'encaminhamentos.paraUserId': eu }, { projection: { userId: 0, mensagens: 0 } }).sort({ criadoEm: -1 }).limit(500).toArray();
    const cursos = await cursosPorId(docs.map(d => d.cursoId));
    const itens = docs.map(d => visaoOuvidoriaDoProfessor(d, eu, { curso: d.cursoId ? cursos.get(d.cursoId) : null }))
      .sort((a, b) => String(b.encaminhadaEm).localeCompare(String(a.encaminhadaEm)));
    const semParecer = itens.filter(i => !i.meuParecer).length;
    res.json({ itens, total: itens.length, contagens: { semParecer, comParecer: itens.length - semParecer } });
  });

  professor.get('/ouvidoria/:protocolo', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrada();
    const eu = String(req.user._id);
    const doc = await col().findOne({ protocolo, 'encaminhamentos.paraUserId': eu }, { projection: { userId: 0, mensagens: 0 } });
    if (!doc) throw naoEncontrada();
    const curso = doc.cursoId ? (await cursosPorId([doc.cursoId])).get(doc.cursoId) : null;
    res.json(visaoOuvidoriaDoProfessor(doc, eu, { curso }));
  });

  professor.post('/ouvidoria/:protocolo/parecer', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrada();
    const texto = lerTexto(req.body || {}, 'texto', { min: 10, max: 4000, obrigatorio: true, multilinha: true });
    const eu = String(req.user._id);
    const doc = await col().findOne({ protocolo, 'encaminhamentos.paraUserId': eu }, { projection: { userId: 0, mensagens: 0 } });
    if (!doc) throw naoEncontrada();
    const enc = encaminhamentoPara(doc, eu);
    if (enc.parecer) throw new ErroPortal(409, 'transicao-invalida', 'Parecer já enviado.');
    const t = agora();
    const r = await col().updateOne(
      { _id: doc._id, encaminhamentos: { $elemMatch: { paraUserId: eu, em: enc.em, parecer: null } } },
      { $set: { 'encaminhamentos.$.parecer': { texto, em: t } }, $inc: { versao: 1 } }
    );
    if (r.modifiedCount !== 1) throw new ErroPortal(409, 'transicao-invalida', 'Parecer já enviado.');
    await auditoria.registrar({ acao: 'ouvidoria.parecer', entidade: { tipo: 'manifestacao', id: protocolo }, cursoId: doc.cursoId ?? null }, req);
    const atualizado = await col().findOne({ _id: doc._id }, { projection: { userId: 0, mensagens: 0 } });
    const curso = atualizado.cursoId ? (await cursosPorId([atualizado.cursoId])).get(atualizado.cursoId) : null;
    res.status(201).json(visaoOuvidoriaDoProfessor(atualizado, eu, { curso }));
  });

  return { aluno, professor, admin, servico: srv };
}

// =============================================================
// Grupos (painel, exportador, relatório)
// =============================================================
export function definicoesDeGrupo({ repo }) {
  const col = () => repo('manifestacoes');
  const painel = {
    bloco: 'ouvidoria',
    chaves: ['abertasPorTipo'],
    papeis: ['admin'],
    async contar() {
      const docs = await col().find({ status: 'aberto' }, { projection: { tipo: 1 } }).limit(20000).toArray();
      const abertasPorTipo = Object.fromEntries(TIPOS_OUVIDORIA.map(t => [t, 0]));
      for (const d of docs) if (Object.hasOwn(abertasPorTipo, d.tipo)) abertasPorTipo[d.tipo]++;
      return { abertasPorTipo };
    }
  };
  const exportador = {
    dominio: 'ouvidoria',
    async exportar(userId) {
      const docs = await col().find({ userId: String(userId) }).sort({ criadoEm: -1 }).limit(5000).toArray();
      return docs.map(d => detalheOuvidoriaDoTitular(d));
    }
  };
  const relatorio = {
    id: 'ouvidoria',
    titulo: 'Ouvidoria',
    papeis: ['admin'],
    filtros: [{ chave: 'de', tipo: 'data' }, { chave: 'ate', tipo: 'data' }, { chave: 'tipo', tipo: 'texto' }],
    colunas: [
      { chave: 'protocolo', rotulo: 'Protocolo', tipo: 'texto' },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
      { chave: 'status', rotulo: 'Situação', tipo: 'texto' },
      { chave: 'curso', rotulo: 'Curso', tipo: 'texto' },
      { chave: 'abertaEm', rotulo: 'Aberta em', tipo: 'dataHora' },
      { chave: 'primeiraRespostaEm', rotulo: '1ª resposta em', tipo: 'dataHora' },
      { chave: 'encerradaEm', rotulo: 'Encerrada em', tipo: 'dataHora' },
      { chave: 'encaminhada', rotulo: 'Encaminhada', tipo: 'texto' }
    ],
    async consultar(_req, filtros = {}, { limite = 20000 } = {}) {
      const f = {};
      if (filtros.tipo && TIPOS_OUVIDORIA.includes(filtros.tipo)) f.tipo = filtros.tipo;
      const em = {};
      if (filtros.de) em.$gte = new Date(`${filtros.de}T00:00:00-03:00`);
      if (filtros.ate) em.$lte = new Date(`${filtros.ate}T23:59:59-03:00`);
      if (Object.keys(em).length) f.criadoEm = em;
      const docs = await col().find(f, { projection: { userId: 0, texto: 0, mensagens: 0 } }).sort({ criadoEm: -1 }).limit(limite + 1).toArray();
      const ids = [...new Set(docs.map(d => d.cursoId).filter(Boolean))];
      const cursos = ids.length ? await repo('cursos').find({ _id: { $in: ids } }, { projection: { titulo: 1 } }).toArray() : [];
      const titulos = new Map(cursos.map(c => [String(c._id), c.titulo]));
      return docs.map(d => ({
        protocolo: d.protocolo, tipo: ROTULOS_TIPO_OUVIDORIA[d.tipo] || d.tipo, status: d.status, curso: d.cursoId ? (titulos.get(d.cursoId) ?? null) : null,
        abertaEm: d.criadoEm, primeiraRespostaEm: d.primeiraRespostaEm ?? null, encerradaEm: d.encerradoEm ?? null,
        encaminhada: (d.encaminhamentos || []).length ? 'Sim' : 'Não'
      }));
    }
  };
  return { painel, exportador, relatorio };
}

export default async function montar(ctx) {
  const { comum, rotas, servicos } = ctx;
  comum.registrarIndices(INDICES_OUVIDORIA);
  const r = criarRotasOuvidoria({
    repo: comum.repo, servicos, acesso: comum.acesso, auditoria: comum.auditoria, notificacoes: comum.notificacoes,
    contador: comum.contador, garantia: comum.garantia, agora: comum.agora, log: comum.log
  });
  rotas.aluno.use(r.aluno);
  rotas.professor.use(r.professor);
  rotas.admin.use(r.admin);
  servicos.registrar('atendimento.ouvidoriaSemParecer', r.servico.ouvidoriaSemParecer);
  const g = definicoesDeGrupo({ repo: comum.repo });
  servicos.adicionar('painel', g.painel);
  servicos.adicionar('exportador', g.exportador);
  servicos.adicionar('relatorio', g.relatorio);
}
