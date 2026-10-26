// =============================================================
// COMPLEXO DMC · Portal — Atendimentos (protocolos ATD)
// PORTAL-API §6.10.1 · §3.3 (F6) · §4.4 · índice §8.5 (F6a) · dono: F6a.
//
//   /api/portal/me/atendimentos                       (titular)
//   /api/portal/professor/atendimentos                (fila visível: professor · admin)
//   /api/portal/admin/atendimentos/:protocolo         (reatribuição)
//
// Serviços registrados: atendimento.abrirProtocolo · .abertosDoAluno ·
// .abertosDoEscopo. Grupos: busca (atendimentos + ouvidoria do titular e
// fila da equipe), painel (bloco atendimentos), exportador (atendimentos),
// relatorio (atendimentos).
// =============================================================
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../../portal/erros.js';
import { lerTexto, lerEnum, lerInteiro, lerPagina, regexBusca, validarLinkInterno } from '../../portal/validacao.js';
import { papelDe } from '../../portal/papeis.js';
import {
  CATEGORIAS, PEDIDOS_TITULAR, STATUS, ORIGENS, ATD_RE, OUV_RE, MAX_MENSAGENS, INDICES_ATENDIMENTO, ROTULOS_CATEGORIA,
  rotear, itemDoAluno, detalheDoAluno, itemDaEquipe, detalheDaEquipe, filtroDaFila, criarServicoAtendimento, novoIdMensagem, consumirLimites,
  filaDeAbertura
} from '../../portal/atendimento/protocolos.js';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

export const LIMITES_ATENDIMENTO = Object.freeze({
  criarHora: { janelaMs: HORA, max: 5 },
  criarDia: { janelaMs: DIA, max: 20 },
  mensagemHora: { janelaMs: HORA, max: 30 }
});

const naoEncontrado = () => new ErroPortal(404, null, 'Atendimento não encontrado.');
const hex = v => (v && typeof v === 'object' && typeof v.toHexString === 'function' ? v.toHexString() : (typeof v === 'string' && /^[a-f0-9]{24}$/.test(v) ? v : null));
const escaparRe = s => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Filtros comuns de lista (status, categoria, origem, q). */
function filtrosDeLista(query, { statusPadrao = null } = {}) {
  const f = {};
  const statusBruto = query.status === undefined || query.status === '' ? statusPadrao : query.status;
  if (statusBruto && statusBruto !== 'todos') f.status = lerEnum(statusBruto, STATUS, 'status');
  const categoria = lerEnum(query.categoria === '' ? null : query.categoria, CATEGORIAS, 'categoria');
  if (categoria) f.categoria = categoria;
  const origem = lerEnum(query.origem === '' ? null : query.origem, ORIGENS, 'origem');
  if (origem) f.origem = origem;
  if (query.q !== undefined && query.q !== '') {
    if (typeof query.q !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { q: 'Formato inválido.' } });
    const q = query.q.trim();
    const codigo = q.toUpperCase();
    if (/^ATD-?[0-9A-Z-]{1,12}$/.test(codigo)) {
      f.protocolo = { $regex: new RegExp(escaparRe(codigo)) };
    } else {
      const termos = regexBusca(q);
      if (!termos) throw new ErroPortal(400, 'validacao', undefined, { campos: { q: 'Use de 2 a 80 caracteres.' } });
      f.$and = termos.map(re => ({ assunto: { $regex: re } }));
    }
  }
  return f;
}

async function contagens(colecao, base) {
  const [aberto, respondido, encerrado] = await Promise.all(STATUS.map(s => colecao.countDocuments({ ...base, status: s })));
  return { aberto, respondido, encerrado };
}

const semStatus = (f) => { const { status: _s, ...resto } = f; return resto; };

/**
 * Fábrica das rotas (testável com falsos, padrão bolsas.test.js).
 * @returns {{ aluno: Router, professor: Router, admin: Router, servico: object }}
 */
export function criarRotasAtendimento({
  repo, servicos, acesso, auditoria, notificacoes = null, contador = null, garantia = null,
  agora = () => new Date(), log = console, servico = null
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotasAtendimento: informe repo.');
  if (!servicos) throw new TypeError('criarRotasAtendimento: informe servicos.');
  if (!acesso) throw new TypeError('criarRotasAtendimento: informe acesso.');
  if (!auditoria) throw new TypeError('criarRotasAtendimento: informe auditoria.');
  const srv = servico || criarServicoAtendimento({ repo, servicos, acesso, auditoria, notificacoes, garantia, agora, log });
  const col = () => repo('protocolos');

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

  async function cursoValidoParaTitular(req, cursoId) {
    if (!cursoId) return null;
    if (typeof cursoId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(cursoId)) {
      throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoId: 'Curso inválido.' } });
    }
    const userId = String(req.user._id);
    const meus = await acesso.cursosDoAluno(userId);
    const ok = meus.includes(cursoId) || await acesso.podeVerCurso(req, cursoId);
    const curso = ok ? (await cursosPorId([cursoId])).get(cursoId) : null;
    if (!curso) throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoId: 'Escolha um dos seus cursos.' } });
    return curso;
  }

  function lerProtocolo(req) {
    const p = String(req.params.protocolo || '').toUpperCase();
    return ATD_RE.test(p) ? p : null;
  }

  async function notificar(evento) {
    if (!notificacoes) return;
    try { await notificacoes.emitir(evento); } catch { /* emitir nunca lança; defesa extra */ }
  }

  /** Acrescenta mensagem com controle de versão (até 3 tentativas). */
  async function acrescentarMensagem(filtroBase, montar) {
    for (let i = 0; i < 3; i++) {
      const doc = await col().findOne(filtroBase);
      if (!doc) throw naoEncontrado();
      if (doc.status === 'encerrado') throw new ErroPortal(409, 'protocolo-encerrado');
      if ((doc.mensagens || []).length >= MAX_MENSAGENS) throw new ErroPortal(409, 'protocolo-longo');
      const { mensagem, set } = montar(doc);
      const r = await col().updateOne(
        { _id: doc._id, versao: doc.versao },
        { $push: { mensagens: mensagem }, $set: set, $inc: { versao: 1 } }
      );
      if (r.modifiedCount === 1) return { doc, mensagem };
    }
    throw new ErroPortal(409, 'conflito-versao');
  }

  // =========================================================
  // Titular
  // =========================================================
  aluno.get('/me/atendimentos', async (req, res) => {
    const userId = String(req.user._id);
    const f = filtrosDeLista(req.query);
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: 25, max: 100 });
    const filtro = { userId, ...f };
    const [total, docs, cont] = await Promise.all([
      col().countDocuments(filtro),
      col().find(filtro, { projection: { mensagens: 0, anexoConversa: 0 } }).sort({ ultimaAtividadeEm: -1 }).skip(pular).limit(porPagina).toArray(),
      contagens(col(), { userId, ...semStatus(f) })
    ]);
    res.json({ itens: docs.map(itemDoAluno), pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)), contagens: cont });
  });

  aluno.post('/me/atendimentos', async (req, res) => {
    const corpo = req.body || {};
    const categoria = lerEnum(corpo.categoria, CATEGORIAS, 'categoria', { obrigatorio: true });
    const pedidoTitular = categoria === 'privacidade'
      ? lerEnum(corpo.pedidoTitular, PEDIDOS_TITULAR, 'pedidoTitular', { obrigatorio: true })
      : null;
    const assunto = lerTexto(corpo, 'assunto', { min: 5, max: 140, obrigatorio: true });
    const mensagem = lerTexto(corpo, 'mensagem', { min: 10, max: 4000, obrigatorio: true, multilinha: true });
    if (corpo.cursoId !== undefined && corpo.cursoId !== null && typeof corpo.cursoId !== 'string') {
      throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { cursoId: 'Formato inválido.' } });
    }
    const curso = await cursoValidoParaTitular(req, corpo.cursoId || null);
    const userId = String(req.user._id);
    await consumirLimites(contador, req, [
      { chave: `atd-h:${userId}`, ...LIMITES_ATENDIMENTO.criarHora },
      { chave: `atd-d:${userId}`, ...LIMITES_ATENDIMENTO.criarDia }
    ]);
    const { doc } = await srv.abrirProtocolo({ userId, categoria, pedidoTitular, assunto, mensagem, cursoId: curso?.id ?? null, origem: 'humano', req });
    res.status(201).json(detalheDoAluno(doc, { curso }));
  });

  aluno.get('/me/atendimentos/:protocolo', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrado();
    const doc = await col().findOne({ protocolo, userId: String(req.user._id) });
    if (!doc) throw naoEncontrado();
    const curso = doc.cursoId ? (await cursosPorId([doc.cursoId])).get(doc.cursoId) : null;
    res.json(detalheDoAluno(doc, { curso }));
  });

  aluno.post('/me/atendimentos/:protocolo/mensagens', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrado();
    const texto = lerTexto(req.body || {}, 'texto', { min: 1, max: 4000, obrigatorio: true, multilinha: true });
    const userId = String(req.user._id);
    const existe = await col().findOne({ protocolo, userId }, { projection: { _id: 1 } });
    if (!existe) throw naoEncontrado();
    await consumirLimites(contador, req, [{ chave: `atd-msg:${userId}`, ...LIMITES_ATENDIMENTO.mensagemHora }]);
    const t = agora();
    const { mensagem } = await acrescentarMensagem({ protocolo, userId }, (doc) => ({
      mensagem: { id: novoIdMensagem(), autorId: userId, autorPapel: 'aluno', autorNome: doc.alunoNome || '', texto, em: t },
      set: { status: 'aberto', ultimaAtividadeEm: t, ultimoAutorPapel: 'aluno' }
    }));
    res.status(201).json({ id: mensagem.id, autor: 'aluno', autorNome: mensagem.autorNome, texto: mensagem.texto, em: t.toISOString(), status: 'aberto' });
  });

  aluno.post('/me/atendimentos/:protocolo/encerrar', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrado();
    const userId = String(req.user._id);
    const doc = await col().findOne({ protocolo, userId }, { projection: { status: 1, cursoId: 1 } });
    if (!doc) throw naoEncontrado();
    if (doc.status !== 'encerrado') {
      const t = agora();
      await col().updateOne({ _id: doc._id, status: { $ne: 'encerrado' } }, {
        $set: { status: 'encerrado', encerradoEm: t, encerradoPor: userId, ultimaAtividadeEm: t }, $inc: { versao: 1 }
      });
      await auditoria.registrar({ acao: 'protocolo.encerrado', entidade: { tipo: 'protocolo', id: protocolo }, alvoUserId: userId, cursoId: doc.cursoId ?? null, extra: { por: 'titular' } }, req);
    }
    res.json({ protocolo });
  });

  // =========================================================
  // Equipe (professor · admin)
  // =========================================================
  async function carregarDaFila(req, protocolo) {
    const filtro = await filtroDaFila(acesso, req);
    const doc = await col().findOne({ protocolo, ...filtro });
    if (!doc) throw naoEncontrado();
    return doc;
  }

  /** Detalhe da equipe na visão de QUEM LÊ: o anexo e o resumo da IA são recortados para quem não é admin (§6.10.3). */
  async function detalheCompleto(doc, req) {
    const ids = [doc.userId, doc.roteamento?.responsavelId];
    const [mapa, cursos] = await Promise.all([nomes(ids), cursosPorId([doc.cursoId])]);
    const p = mapa.get(doc.userId);
    const alunoInfo = p ? { id: p.id, nome: p.nomeSocial || p.nome, email: p.email } : null;
    return detalheDaEquipe(doc, { aluno: alunoInfo, curso: doc.cursoId ? cursos.get(doc.cursoId) : null, nomes: mapa, leitor: papelDe(req.user) });
  }

  professor.get('/atendimentos', async (req, res) => {
    const papel = papelDe(req.user);
    const f = filtrosDeLista(req.query, { statusPadrao: 'aberto' });
    if (req.query.cursoId) {
      if (typeof req.query.cursoId !== 'string') throw new ErroPortal(400, 'formato-invalido');
      f.cursoId = req.query.cursoId;
    }
    if (req.query.meus === '1') f['roteamento.responsavelId'] = String(req.user._id);
    // Acréscimo (aba "Atendimentos" do aluno no backoffice, UX §7.5): só dentro da fila visível.
    if (req.query.userId !== undefined && req.query.userId !== '') {
      if (typeof req.query.userId !== 'string' || !/^[a-f0-9]{24}$/.test(req.query.userId)) throw new ErroPortal(400, 'validacao', undefined, { campos: { userId: 'Aluno inválido.' } });
      f.userId = req.query.userId;
    }
    const soPedidos = req.query.pedido === '1';
    if (soPedidos) {
      if (papel !== 'admin') {
        return res.json({ itens: [], pagina: 1, porPagina: 25, total: 0, totalPaginas: 1, contagens: { aberto: 0, respondido: 0, encerrado: 0 } });
      }
      f['pedido.chave'] = { $type: 'string' };
    }
    const fila = await filtroDaFila(acesso, req);
    const base = Object.keys(fila).length ? { $and: [fila] } : {};
    const filtro = { ...base, ...f };
    if (f.$and) filtro.$and = [...(base.$and || []), ...f.$and];
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: 25, max: 100 });
    const ordem = f.status === 'aberto' ? { ultimaAtividadeEm: 1 } : { ultimaAtividadeEm: -1 };
    const filtroSemStatus = semStatus(filtro);
    const [total, docs, cont] = await Promise.all([
      col().countDocuments(filtro),
      col().find(filtro, { projection: { mensagens: 0, anexoConversa: 0, eventos: 0 } }).sort(ordem).skip(pular).limit(porPagina).toArray(),
      contagens(col(), filtroSemStatus)
    ]);
    const [mapa, cursos] = await Promise.all([
      nomes(docs.flatMap(d => [d.roteamento?.responsavelId])),
      cursosPorId(docs.map(d => d.cursoId))
    ]);
    res.json({
      itens: docs.map(d => itemDaEquipe(d, { nomes: mapa, cursos, comPedido: soPedidos })),
      pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)), contagens: cont
    });
  });

  professor.get('/atendimentos/:protocolo', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrado();
    const doc = await carregarDaFila(req, protocolo);
    res.json(await detalheCompleto(doc, req));
  });

  professor.post('/atendimentos/:protocolo/mensagens', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrado();
    const texto = lerTexto(req.body || {}, 'texto', { min: 1, max: 4000, obrigatorio: true, multilinha: true });
    const atual = await carregarDaFila(req, protocolo);
    const eu = String(req.user._id);
    const papel = papelDe(req.user);
    const meuNome = (await nomes([eu])).get(eu)?.nome || req.user.nome || '';
    const t = agora();
    const { doc, mensagem } = await acrescentarMensagem({ _id: atual._id }, (d) => ({
      mensagem: { id: novoIdMensagem(), autorId: eu, autorPapel: papel, autorNome: meuNome, texto, em: t },
      set: { status: 'respondido', ultimaAtividadeEm: t, ultimoAutorPapel: papel, ...(d.primeiraRespostaEm ? {} : { primeiraRespostaEm: t }) }
    }));
    await auditoria.registrar({ acao: 'protocolo.respondido', entidade: { tipo: 'protocolo', id: protocolo }, alvoUserId: doc.userId, cursoId: doc.cursoId ?? null }, req);
    await notificar({
      userIds: [doc.userId], tipo: 'protocolo.respondido', titulo: 'Atendimento respondido',
      texto: `A equipe respondeu ao atendimento ${protocolo}.`, link: `atendimentos.html?protocolo=${protocolo}`,
      entidade: { tipo: 'protocolo', id: protocolo }
    });
    res.status(201).json({ id: mensagem.id, autor: 'equipe', autorPapel: papel, autorNome: meuNome, texto, em: t.toISOString(), status: 'respondido' });
  });

  professor.post('/atendimentos/:protocolo/encerrar', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrado();
    const motivo = lerTexto(req.body || {}, 'motivo', { max: 500, multilinha: true });
    const doc = await carregarDaFila(req, protocolo);
    if (doc.status !== 'encerrado') {
      const t = agora();
      const eu = String(req.user._id);
      await col().updateOne({ _id: doc._id, status: { $ne: 'encerrado' } }, {
        $set: { status: 'encerrado', encerradoEm: t, encerradoPor: eu, motivoEncerramento: motivo, ultimaAtividadeEm: t }, $inc: { versao: 1 }
      });
      await auditoria.registrar({ acao: 'protocolo.encerrado', entidade: { tipo: 'protocolo', id: protocolo }, alvoUserId: doc.userId, cursoId: doc.cursoId ?? null, motivo, extra: { por: 'equipe' } }, req);
      await notificar({
        userIds: [doc.userId], tipo: 'protocolo.encerrado', titulo: 'Atendimento encerrado',
        texto: `O atendimento ${protocolo} foi encerrado pela equipe.`, link: `atendimentos.html?protocolo=${protocolo}`,
        entidade: { tipo: 'protocolo', id: protocolo }
      });
    }
    res.json({ protocolo });
  });

  // =========================================================
  // Coordenação: reatribuir
  // =========================================================
  admin.put('/atendimentos/:protocolo', async (req, res) => {
    const protocolo = lerProtocolo(req);
    if (!protocolo) throw naoEncontrado();
    const corpo = req.body || {};
    const motivo = lerTexto(corpo, 'motivo', { min: 10, max: 500, obrigatorio: true, multilinha: true });
    const versao = lerInteiro(corpo.versao, { min: 1, obrigatorio: true }, 'versao');
    const doc = await col().findOne({ protocolo });
    if (!doc) throw naoEncontrado();
    const categoria = corpo.categoria === undefined ? doc.categoria : lerEnum(corpo.categoria, CATEGORIAS, 'categoria', { obrigatorio: true });
    if (categoria === 'privacidade' && doc.categoria !== 'privacidade') {
      throw new ErroPortal(400, 'validacao', undefined, { campos: { categoria: 'Pedidos sobre dados pessoais só são abertos pelo titular.' } });
    }
    if (categoria !== 'financeiro' && doc.pedido) {
      throw new ErroPortal(400, 'validacao', undefined, { campos: { categoria: 'Pedido da loja fica na categoria Financeiro.' } });
    }
    let cursoId = doc.cursoId ?? null;
    if (Object.hasOwn(corpo, 'cursoId')) {
      if (corpo.cursoId !== null && corpo.cursoId !== '' && typeof corpo.cursoId !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { cursoId: 'Formato inválido.' } });
      cursoId = corpo.cursoId || null;
      if (cursoId && !(await cursosPorId([cursoId])).get(cursoId)) {
        throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoId: 'Curso não encontrado.' } });
      }
    }
    const turmaId = categoria === 'academico' ? await srv.turmaVigente(doc.userId, cursoId) : null;
    const roteamento = rotear({ categoria, cursoId, turmaId });
    let responsavelId = doc.roteamento?.responsavelId ?? null;
    if (Object.hasOwn(corpo, 'responsavelId')) {
      const bruto = corpo.responsavelId;
      if (bruto === null || bruto === '') responsavelId = null;
      else {
        if (typeof bruto !== 'string' || !/^[a-f0-9]{24}$/.test(bruto)) {
          throw new ErroPortal(400, 'validacao', undefined, { campos: { responsavelId: 'Escolha um professor do curso ou a coordenação.' } });
        }
        const u = await repo('users').findOne({ _id: new ObjectId(bruto) }, { projection: { isAdmin: 1, papel: 1, desativadoEm: 1 } });
        let ok = !!u && !u.desativadoEm && papelDe(u) === 'admin';
        if (!ok && u && !u.desativadoEm && papelDe(u) === 'professor' && cursoId) {
          const prof = servicos.tentar('equipe.professoresDoCurso');
          const lista = typeof prof === 'function' ? await prof(cursoId, turmaId) : [];
          ok = lista.includes(bruto);
        }
        if (!ok) throw new ErroPortal(400, 'validacao', undefined, { campos: { responsavelId: 'Escolha um professor do curso ou a coordenação.' } });
        responsavelId = bruto;
      }
    }
    if (doc.versao !== versao) throw new ErroPortal(409, 'conflito-versao');
    const novo = { categoria, cursoId, roteamento: { ...roteamento, turmaId: roteamento.turmaId ? new ObjectId(roteamento.turmaId) : null, responsavelId } };
    const antes = { categoria: doc.categoria, cursoId: doc.cursoId ?? null, fila: doc.roteamento?.fila ?? null, responsavelId: doc.roteamento?.responsavelId ?? null };
    const depois = { categoria, cursoId, fila: roteamento.fila, responsavelId };
    const mapa = await nomes([responsavelId]);
    const t = agora();
    const nomeResp = responsavelId ? (mapa.get(responsavelId)?.nome || 'responsável') : null;
    const evento = { tipo: 'reatribuido', texto: nomeResp ? `Coordenação atribuiu a ${nomeResp}` : `Coordenação moveu para ${ROTULOS_CATEGORIA[categoria]}`, em: t };
    // Protocolo da IA: registra para quem o conteúdo foi preparado e se o professor que o
    // receber verá o recorte (anexo e resposta do assistente reservados à coordenação, §6.10.3).
    const preparadoPara = doc.origem === 'ia' ? filaDeAbertura(doc) : null;
    const extra = preparadoPara ? { origem: 'ia', preparadoPara, recorteParaProfessores: preparadoPara !== 'professores_do_curso' } : undefined;
    await auditoria.executar({
      acao: 'protocolo.reatribuido', entidade: { tipo: 'protocolo', id: protocolo }, alvoUserId: doc.userId, cursoId,
      mudancas: auditoria.mudancas(antes, depois, ['categoria', 'cursoId', 'fila', 'responsavelId']), motivo, extra
    }, req, async () => {
      const r = await col().updateOne({ _id: doc._id, versao }, { $set: { ...novo, ultimaAtividadeEm: doc.ultimaAtividadeEm }, $push: { eventos: evento }, $inc: { versao: 1 } });
      if (r.modifiedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
    });
    if (responsavelId && responsavelId !== antes.responsavelId) {
      await notificar({
        userIds: [responsavelId], tipo: 'protocolo.atribuido', titulo: 'Atendimento atribuído a você',
        texto: `O atendimento ${protocolo} foi atribuído a você.`, link: `professor.html#/atendimento/${protocolo}`,
        entidade: { tipo: 'protocolo', id: protocolo }
      });
    }
    const atualizado = await col().findOne({ _id: doc._id });
    res.json(await detalheCompleto(atualizado, req));
  });

  return { aluno, professor, admin, servico: srv };
}

// =============================================================
// Contribuições aos grupos (busca, painel, exportador, relatório)
// =============================================================
export function definicoesDeGrupo({ repo, acesso, agora = () => new Date() }) {
  const col = () => repo('protocolos');

  const busca = {
    tipo: 'atendimentos',
    papeis: ['aluno', 'professor', 'admin'],
    async buscar(req, termos, { limite = 5, pular = 0 } = {}) {
      const userId = String(req.user._id);
      const papel = papelDe(req.user);
      const porAssunto = { $and: termos.map(re => ({ assunto: { $regex: re } })) };
      const porCodigo = { $and: termos.map(re => ({ protocolo: { $regex: re } })) };
      const casa = { $or: [porAssunto, porCodigo] };
      const proprios = await col().find({ userId, ...casa }, { projection: { protocolo: 1, assunto: 1, categoria: 1, status: 1 } })
        .sort({ ultimaAtividadeEm: -1 }).limit(limite + pular + 1).toArray();
      const ouv = await repo('manifestacoes').find({ userId, ...casa }, { projection: { protocolo: 1, assunto: 1, tipo: 1, status: 1 } })
        .sort({ criadoEm: -1 }).limit(limite + pular + 1).toArray();
      let itens = [
        ...proprios.map(p => ({ id: p.protocolo, titulo: `${p.protocolo} · ${p.assunto}`, contexto: `Atendimento · ${ROTULOS_CATEGORIA[p.categoria] || ''}`, href: `atendimentos.html?protocolo=${p.protocolo}` })),
        ...ouv.map(m => ({ id: m.protocolo, titulo: `${m.protocolo} · ${m.assunto}`, contexto: 'Ouvidoria', href: `ouvidoria.html?protocolo=${m.protocolo}` }))
      ];
      if (papel === 'professor' || papel === 'admin') {
        const fila = await filtroDaFila(acesso, req);
        const filtro = Object.keys(fila).length ? { $and: [fila, casa] } : casa;
        const daFila = await col().find({ ...filtro, userId: { $ne: userId } }, { projection: { protocolo: 1, assunto: 1, categoria: 1 } })
          .sort({ ultimaAtividadeEm: -1 }).limit(limite + pular + 1).toArray();
        itens = itens.concat(daFila.map(p => ({ id: p.protocolo, titulo: `${p.protocolo} · ${p.assunto}`, contexto: `Fila de atendimento · ${ROTULOS_CATEGORIA[p.categoria] || ''}`, href: `professor.html#/atendimento/${p.protocolo}` })));
      }
      itens = itens.filter(i => validarLinkInterno(i.href));
      return { itens: itens.slice(pular, pular + limite), temMais: itens.length > pular + limite };
    }
  };

  const painel = {
    bloco: 'atendimentos',
    chaves: ['abertosPorCategoria', 'aguardandoAluno', 'horasMediaPrimeiraResposta30d', 'privacidadeVencendo7d'],
    papeis: ['admin'],
    async contar() {
      const t = agora();
      const abertos = await col().find({ status: 'aberto' }, { projection: { categoria: 1 } }).limit(20000).toArray();
      const abertosPorCategoria = Object.fromEntries(CATEGORIAS.map(c => [c, 0]));
      for (const d of abertos) if (Object.hasOwn(abertosPorCategoria, d.categoria)) abertosPorCategoria[d.categoria]++;
      const aguardandoAluno = await col().countDocuments({ status: 'respondido' });
      const recentes = await col().find({ criadoEm: { $gte: new Date(t.getTime() - 30 * DIA) }, primeiraRespostaEm: { $type: 'date' } }, { projection: { criadoEm: 1, primeiraRespostaEm: 1 } }).limit(20000).toArray();
      const horas = recentes.map(d => (d.primeiraRespostaEm - d.criadoEm) / HORA).filter(h => Number.isFinite(h) && h >= 0);
      const horasMediaPrimeiraResposta30d = horas.length ? Math.round((horas.reduce((s, h) => s + h, 0) / horas.length) * 10) / 10 : null;
      const privacidadeVencendo7d = await col().countDocuments({ categoria: 'privacidade', status: { $ne: 'encerrado' }, prazoRespostaEm: { $lte: new Date(t.getTime() + 7 * DIA) } });
      return { abertosPorCategoria, aguardandoAluno, horasMediaPrimeiraResposta30d, privacidadeVencendo7d };
    }
  };

  const exportador = {
    dominio: 'atendimentos',
    async exportar(userId) {
      const docs = await col().find({ userId: String(userId) }).sort({ criadoEm: -1 }).limit(5000).toArray();
      return docs.map(d => {
        const det = detalheDoAluno(d);
        delete det.versao;
        return det;
      });
    }
  };

  const relatorio = {
    id: 'atendimentos',
    titulo: 'Atendimentos',
    papeis: ['admin'],
    filtros: [{ chave: 'de', tipo: 'data' }, { chave: 'ate', tipo: 'data' }, { chave: 'categoria', tipo: 'texto' }, { chave: 'cursoId', tipo: 'texto' }],
    colunas: [
      { chave: 'protocolo', rotulo: 'Protocolo', tipo: 'texto' },
      { chave: 'categoria', rotulo: 'Categoria', tipo: 'texto' },
      { chave: 'pedidoTitular', rotulo: 'Pedido do titular', tipo: 'texto' },
      { chave: 'origem', rotulo: 'Origem', tipo: 'texto' },
      { chave: 'assunto', rotulo: 'Assunto', tipo: 'texto' },
      { chave: 'status', rotulo: 'Situação', tipo: 'texto' },
      { chave: 'abertoEm', rotulo: 'Aberto em', tipo: 'dataHora' },
      { chave: 'primeiraRespostaEm', rotulo: '1ª resposta em', tipo: 'dataHora' },
      { chave: 'horasPrimeiraResposta', rotulo: 'Horas até a 1ª resposta', tipo: 'numero' },
      { chave: 'encerradoEm', rotulo: 'Encerrado em', tipo: 'dataHora' },
      { chave: 'curso', rotulo: 'Curso', tipo: 'texto' },
      { chave: 'emailAluno', rotulo: 'E-mail do aluno', tipo: 'texto', somenteAdmin: true }
    ],
    async consultar(_req, filtros = {}, { limite = 20000 } = {}) {
      const f = {};
      if (filtros.categoria && CATEGORIAS.includes(filtros.categoria)) f.categoria = filtros.categoria;
      if (typeof filtros.cursoId === 'string' && filtros.cursoId) f.cursoId = filtros.cursoId;
      const em = {};
      if (filtros.de) em.$gte = new Date(`${filtros.de}T00:00:00-03:00`);
      if (filtros.ate) em.$lte = new Date(`${filtros.ate}T23:59:59-03:00`);
      if (Object.keys(em).length) f.criadoEm = em;
      const docs = await col().find(f, { projection: { mensagens: 0, anexoConversa: 0, eventos: 0 } }).sort({ criadoEm: -1 }).limit(limite + 1).toArray();
      const ids = [...new Set(docs.map(d => d.userId).filter(id => /^[a-f0-9]{24}$/.test(id)))];
      const users = ids.length ? await repo('users').find({ _id: { $in: ids.map(id => new ObjectId(id)) } }, { projection: { email: 1 } }).toArray() : [];
      const emails = new Map(users.map(u => [String(u._id), u.email || null]));
      const cursosIds = [...new Set(docs.map(d => d.cursoId).filter(Boolean))];
      const cursos = cursosIds.length ? await repo('cursos').find({ _id: { $in: cursosIds } }, { projection: { titulo: 1 } }).toArray() : [];
      const titulos = new Map(cursos.map(c => [String(c._id), c.titulo]));
      return docs.map(d => ({
        protocolo: d.protocolo, categoria: d.categoria, pedidoTitular: d.pedidoTitular ?? null, origem: d.origem, assunto: d.assunto,
        status: d.status, abertoEm: d.criadoEm, primeiraRespostaEm: d.primeiraRespostaEm ?? null,
        horasPrimeiraResposta: d.primeiraRespostaEm ? Math.round(((d.primeiraRespostaEm - d.criadoEm) / HORA) * 10) / 10 : null,
        encerradoEm: d.encerradoEm ?? null, curso: d.cursoId ? (titulos.get(d.cursoId) ?? null) : null, emailAluno: emails.get(d.userId) ?? null
      }));
    },
    /** Painel "Atendimentos" (API §6.11.3): sobre o conjunto FILTRADO inteiro; null quando não há dado. */
    async resumir(req, filtros = {}) {
      const linhas = await relatorio.consultar(req, filtros, { limite: 20000 });
      if (!linhas.length) {
        return {
          kpis: [
            { chave: 'abertos', rotulo: 'Abertos', valor: 0, formato: 'numero' },
            { chave: 'respondidos', rotulo: 'Respondidos', valor: 0, formato: 'numero' },
            { chave: 'encerradosNoPeriodo', rotulo: 'Encerrados no período', valor: 0, formato: 'numero' },
            { chave: 'horasMediaPrimeiraResposta', rotulo: 'Horas até a 1ª resposta (média)', valor: null, formato: 'horas', nota: 'Sem respostas no período.' }
          ],
          series: [
            { chave: 'porCategoria', rotulo: 'Protocolos por categoria', formato: 'numero', pontos: [] },
            { chave: 'horasAtePrimeiraRespostaPorCategoria', rotulo: 'Horas até a 1ª resposta por categoria', formato: 'horas', pontos: [] }
          ]
        };
      }
      const media = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
      const horas = linhas.map(l => l.horasPrimeiraResposta).filter(h => Number.isFinite(h));
      const porCat = new Map();
      for (const l of linhas) {
        const c = porCat.get(l.categoria) || { n: 0, horas: [] };
        c.n++;
        if (Number.isFinite(l.horasPrimeiraResposta)) c.horas.push(l.horasPrimeiraResposta);
        porCat.set(l.categoria, c);
      }
      const rot = c => ROTULOS_CATEGORIA[c] || c;
      return {
        kpis: [
          { chave: 'abertos', rotulo: 'Abertos', valor: linhas.filter(l => l.status === 'aberto').length, formato: 'numero' },
          { chave: 'respondidos', rotulo: 'Respondidos', valor: linhas.filter(l => l.status === 'respondido').length, formato: 'numero' },
          { chave: 'encerradosNoPeriodo', rotulo: 'Encerrados no período', valor: linhas.filter(l => l.status === 'encerrado').length, formato: 'numero' },
          { chave: 'horasMediaPrimeiraResposta', rotulo: 'Horas até a 1ª resposta (média)', valor: media(horas), formato: 'horas' }
        ],
        series: [
          { chave: 'porCategoria', rotulo: 'Protocolos por categoria', formato: 'numero', pontos: [...porCat].map(([c, v]) => ({ rotulo: rot(c), valor: v.n })) },
          { chave: 'horasAtePrimeiraRespostaPorCategoria', rotulo: 'Horas até a 1ª resposta por categoria', formato: 'horas', pontos: [...porCat].map(([c, v]) => ({ rotulo: rot(c), valor: media(v.horas) })) }
        ]
      };
    }
  };

  return { busca, painel, exportador, relatorio };
}

// =============================================================
// Montagem (API §5.1)
// =============================================================
export default async function montar(ctx) {
  const { comum, rotas, servicos } = ctx;
  comum.registrarIndices(INDICES_ATENDIMENTO);
  const r = criarRotasAtendimento({
    repo: comum.repo, servicos, acesso: comum.acesso, auditoria: comum.auditoria, notificacoes: comum.notificacoes,
    contador: comum.contador, garantia: comum.garantia, agora: comum.agora, log: comum.log
  });
  rotas.aluno.use(r.aluno);
  rotas.professor.use(r.professor);
  rotas.admin.use(r.admin);
  servicos.registrar('atendimento.abrirProtocolo', async (dados) => {
    const { id, protocolo } = await r.servico.abrirProtocolo(dados || {});
    return { id, protocolo };
  });
  servicos.registrar('atendimento.abertosDoAluno', r.servico.abertosDoAluno);
  servicos.registrar('atendimento.abertosDoEscopo', r.servico.abertosDoEscopo);
  const g = definicoesDeGrupo({ repo: comum.repo, acesso: comum.acesso, agora: comum.agora });
  servicos.adicionar('busca', g.busca);
  servicos.adicionar('painel', g.painel);
  servicos.adicionar('exportador', g.exportador);
  servicos.adicionar('relatorio', g.relatorio);
}

export { OUV_RE };
