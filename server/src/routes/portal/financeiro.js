// =============================================================
// COMPLEXO DMC · Portal — financeiro manual (EXCEÇÃO 1: gateway depois)
// PORTAL-API §6.9, §3.3 (lancamentos), §3.4 (auditoria), §3.5, §4.4,
// §6.11.3 (relatório e painel), §8.9–§8.10 · índice §8.5 linha F5,
// CEO-1, D-18, D-79, DC-69 · dono: F5.
//
//   /api/portal/me/financeiro                         (titular)
//   /api/portal/me/financeiro/lancamentos/:id/segunda-via
//   /api/portal/me/financeiro/declaracoes/:ano        (quitação anual)
//   /api/portal/me/pedidos                            (checkout da loja)
//   /api/portal/admin/financeiro/lancamentos[...]     (só coordenação)
//
// Lançamentos são registrados à mão pela coordenação; nenhum campo de
// cartão existe (chaves desconhecidas do corpo são descartadas). Toda
// escrita da coordenação passa por auditoria.executar (sem registro,
// nada muda: 503) e entra no `historico` do lançamento. O webhook do
// gateway (POST /api/portal/webhooks/financeiro/:gateway) é previsto e
// NÃO é montado: nenhum botão falso de pagamento on-line.
// =============================================================
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { ErroPortal } from '../../portal/erros.js';
import {
  lerTexto, lerEnum, lerInteiro, lerId, lerIdLegado, lerPagina, regexBusca, validarDataCalendario, validarUrlHttps,
  hojeSP, anoSP, ID_RE, ID_LEGADO_RE
} from '../../portal/validacao.js';
import { limitePersistente } from '../../portal/limitador.js';
import { lerCorpoBinario } from '../../portal/arquivos.js';
import {
  TIPOS_LANCAMENTO, FORMAS, ORIGENS_LANCAMENTO, FILTROS_STATUS, VALOR_MIN_CENTAVOS, VALOR_MAX_CENTAVOS, MAX_PARCELAS, NFSE_RE,
  statusDe, calcularKpis, contarPorStatus, filtrarEOrdenar, planejarParcelas, rotuloTipo, valorPago,
  centavosDoPreco, somaOuNulo, chaveDoPedido, mensagemDoPedido, dadosDaQuitacao, prefixoDoHash, moedaTexto, dataBr,
  ROTULOS_FORMA, ROTULOS_STATUS
} from '../../portal/financeiro/calculo.js';
import {
  INDICES_FINANCEIRO, lancamentoDoAluno, lancamentoDaCoordenacao, criarLeiturasFinanceiro, hex, paraObjectId
} from '../../portal/financeiro/repositorios.js';

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const LIMITE_LEITURA = 20000;
const MAX_CURSOS_PEDIDO = 20;
const MAX_PDF_SEGUNDA_VIA = 4 * 1024 * 1024;
const URL_VALIDACAO = codigo => `/plataforma-ead/validar.html?codigo=${encodeURIComponent(codigo)}`;

const corpoDe = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
const naoEncontrado = (texto = 'Lançamento não encontrado.') => new ErroPortal(404, null, texto);
const invalido = (campo, texto) => new ErroPortal(400, 'validacao', undefined, { campos: { [campo]: texto } });

function lerDia(valor, campo, { obrigatorio = false, max = null } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw invalido(campo, 'Informe a data.');
    return null;
  }
  if (typeof valor !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { [campo]: 'Formato inválido.' } });
  const d = validarDataCalendario(valor);
  if (!d) throw invalido(campo, 'Use uma data válida (AAAA-MM-DD).');
  if (max && d > max) throw invalido(campo, 'A data não pode ser no futuro.');
  return d;
}

function lerValor(valor, campo, { obrigatorio = true } = {}) {
  return lerInteiro(valor, { min: VALOR_MIN_CENTAVOS, max: VALOR_MAX_CENTAVOS, obrigatorio }, campo);
}

function lerVersao(corpo) {
  return lerInteiro(corpo.versao, { min: 1, max: 1e9, obrigatorio: true }, 'versao');
}

function lerMotivo(corpo, { min = 5 } = {}) {
  return lerTexto(corpo, 'motivo', { min, max: 500, obrigatorio: true, multilinha: true });
}

/**
 * Fábrica pura das rotas (testável com banco em memória e falsos, padrão bolsas.test.js).
 * @param {{ repo:Function, servicos:object, acesso:object, auditoria:object, notificacoes?:object,
 *   arquivos?:object, contador?:object, perfis?:object, agora?:()=>Date, log?:Console }} deps
 * @returns {{ aluno: Router, admin: Router, leituras: object }}
 */
export function criarRotasFinanceiro({
  repo, servicos, acesso, auditoria, notificacoes = null, arquivos = null, contador = null, perfis = null,
  agora = () => new Date(), log = console
} = {}) {
  if (typeof repo !== 'function') throw new Error('criarRotasFinanceiro: informe repo.');
  if (!servicos || typeof servicos.tentar !== 'function') throw new Error('criarRotasFinanceiro: informe servicos.');
  if (!acesso || typeof acesso.contexto !== 'function') throw new Error('criarRotasFinanceiro: informe acesso.');
  if (!auditoria || typeof auditoria.executar !== 'function') throw new Error('criarRotasFinanceiro: informe auditoria.');

  const col = () => repo('lancamentos');
  const hoje = () => hojeSP(agora());
  const leituras = criarLeiturasFinanceiro({ repo, servicos, hojeSP: hoje, log });
  const aluno = Router();
  const admin = Router();
  const avisar = (texto, err) => { try { (log.warn || log.error).call(log, `[portal] financeiro: ${texto}${err ? ` (${err?.message || err})` : ''}`); } catch { /* nada */ } };
  const servico = nome => servicos.tentar(nome);
  const exigirServico = nome => {
    const f = servico(nome);
    if (typeof f !== 'function') throw new ErroPortal(503, 'servico-indisponivel');
    return f;
  };
  const limite = (chave, max, janelaMs = HORA) => (contador
    ? limitePersistente(contador, { janelaMs, max, chave, codigo: 'limite' })
    : (_req, _res, next) => next());

  async function notificar(dados) {
    if (!notificacoes || typeof notificacoes.emitir !== 'function') return;
    try { await notificacoes.emitir(dados); } catch (err) { avisar('notificação não emitida', err); }
  }

  async function lancamentoOu404(id) {
    const _id = lerId(id);
    if (!_id) throw naoEncontrado();
    const doc = await col().findOne({ _id });
    if (!doc) throw naoEncontrado();
    return doc;
  }

  async function alunosPorId(ids) {
    const lista = [...new Set(ids.filter(i => ID_RE.test(String(i))).map(String))];
    if (!lista.length) return new Map();
    const docs = await repo('users').find({ _id: { $in: lista.map(i => new ObjectId(i)) } }, { projection: { nome: 1, email: 1 } }).toArray();
    return new Map(docs.map(u => [String(u._id), { id: String(u._id), nome: u.nome ?? null, email: u.email ?? null }]));
  }

  async function detalhe(doc) {
    const alunos = await alunosPorId([doc.userId]);
    return lancamentoDaCoordenacao(doc, hoje(), { aluno: alunos.get(String(doc.userId)) || null });
  }

  /**
   * Escrita auditada da coordenação: auditoria ANTES (executar), filtro { _id, versao } e uma
   * linha no `historico`. Versão divergente → 409 conflito-versao (nada muda).
   */
  async function alterar(doc, { acao, motivo = null, set = {}, unset = null, historico, req, campos, extra = null }) {
    const t = agora();
    const depois = { ...doc, ...set };
    if (unset) for (const k of Object.keys(unset)) depois[k] = null;
    const entrada = { em: t, por: String(req.user._id), acao: historico.acao, de: historico.de ?? null, para: historico.para ?? null, motivo: motivo ?? null };
    await auditoria.executar({
      acao, entidade: { tipo: 'lancamento', id: hex(doc._id) }, alvoUserId: doc.userId, cursoId: doc.cursoId ?? null,
      mudancas: auditoria.mudancas ? auditoria.mudancas(doc, depois, campos) : null, motivo, extra
    }, req, async () => {
      const op = { $set: { ...set, versao: doc.versao + 1, atualizadoEm: t }, $push: { historico: entrada } };
      if (unset) op.$unset = unset;
      const r = await col().updateOne({ _id: doc._id, versao: doc.versao }, op);
      if (!r || r.matchedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
    });
    return col().findOne({ _id: doc._id });
  }

  function exigirVersaoIgual(doc, versao) {
    if (doc.versao !== versao) throw new ErroPortal(409, 'conflito-versao');
  }
  function exigirManual(doc) {
    if ((doc.origem || 'manual') !== 'manual') throw new ErroPortal(409, 'so-pendente-manual');
  }

  // =================================================================
  // TITULAR
  // =================================================================
  aluno.get('/me/financeiro', async (req, res) => {
    const userId = String(req.user._id);
    const q = req.query || {};
    for (const k of ['status', 'cursoId', 'ano']) {
      if (q[k] !== undefined && typeof q[k] !== 'string') throw new ErroPortal(400, 'formato-invalido');
    }
    const status = FILTROS_STATUS.includes(q.status) ? q.status : 'todos';
    const filtro = { userId };
    if (q.cursoId) {
      const c = lerIdLegado(q.cursoId);
      if (!c) throw invalido('cursoId', 'Curso inválido.');
      filtro.cursoId = c;
    }
    const todos = await col().find({ userId }).sort({ vencimento: 1 }).limit(LIMITE_LEITURA).toArray();
    const anos = [...new Set(todos.map(l => Number(String(l.vencimento).slice(0, 4))).filter(Number.isInteger))].sort((a, b) => b - a);
    let base = filtro.cursoId ? todos.filter(l => l.cursoId === filtro.cursoId) : todos;
    if (q.ano) {
      const ano = lerInteiro(q.ano, { min: 2000, max: 2100 }, 'ano');
      base = base.filter(l => String(l.vencimento).startsWith(`${ano}-`));
    }
    const h = hoje();
    res.json({
      kpis: calcularKpis(base, h),
      contagens: contarPorStatus(base, h),
      status,
      itens: filtrarEOrdenar([...base], status, h).map(l => lancamentoDoAluno(l, h)),
      anos,
      hoje: h
    });
  });

  aluno.get('/me/financeiro/lancamentos/:id/segunda-via', async (req, res) => {
    const _id = lerId(req.params.id);
    if (!_id) throw naoEncontrado();
    const doc = await col().findOne({ _id, userId: String(req.user._id) });
    if (!doc || !doc.segundaVia) throw naoEncontrado('Segunda via não encontrada.');
    if (doc.situacao === 'cancelado') throw new ErroPortal(409, 'lancamento-cancelado');
    if (doc.segundaVia.tipo === 'link' && doc.segundaVia.url) return res.json({ url: doc.segundaVia.url });
    if (doc.segundaVia.tipo === 'pdf' && doc.segundaVia.arquivoId && arquivos) {
      const arq = await arquivos.ler(hex(doc.segundaVia.arquivoId), { contexto: 'segunda_via', donoUserId: String(req.user._id) });
      if (!arq) throw naoEncontrado('Segunda via não encontrada.');
      return arquivos.enviar(res, arq, { nome: `segunda-via-${doc.vencimento}` });
    }
    throw naoEncontrado('Segunda via não encontrada.');
  });

  // ---------- Declaração anual de quitação (API §6.9, §8.9; emite pelo serviço da F3b) ----------
  aluno.post('/me/financeiro/declaracoes/:ano', limite(req => `quitacao:u:${String(req.user._id)}`, 10), async (req, res) => {
    const userId = String(req.user._id);
    const ano = /^\d{4}$/.test(String(req.params.ano)) ? Number(req.params.ano) : NaN;
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw invalido('ano', 'Ano inválido.');
    if (ano >= anoSP(agora())) throw new ErroPortal(409, 'ano-em-curso');
    const doAno = (await col().find({ userId, vencimento: { $gte: `${ano}-01-01`, $lte: `${ano}-12-31` } }).limit(5000).toArray())
      .filter(l => l.situacao !== 'cancelado');
    if (!doAno.length) throw new ErroPortal(404, 'sem-lancamentos-no-ano', 'Não há lançamentos com vencimento neste ano.');
    const pendentes = doAno.filter(l => l.situacao !== 'pago').length;
    if (pendentes) throw new ErroPortal(409, 'ha-debitos-no-ano', undefined, { qtd: pendentes });
    const instFn = servico('configuracoes.instituicao');
    let instituicao = null;
    if (typeof instFn === 'function') {
      try { instituicao = await instFn(); } catch (err) { avisar('configuracoes.instituicao falhou', err); }
    }
    if (!instituicao || typeof instituicao.razaoSocial !== 'string' || !instituicao.razaoSocial.trim()) {
      throw new ErroPortal(409, 'dados-da-instituicao-pendentes');
    }
    const identificar = perfis?.identificacao || servico('perfis.identificacao');
    if (typeof identificar !== 'function') throw new ErroPortal(503, 'servico-indisponivel');
    const ident = await identificar(userId);
    const faltando = [];
    if (!ident?.nomeRegistro) faltando.push('nomeRegistro');
    if (!ident?.documento?.numero) faltando.push('documento');
    if (faltando.length) {
      throw new ErroPortal(409, 'cadastro-incompleto', 'Informe o nome de registro e o CPF (ou passaporte) no seu cadastro antes de emitir a declaração.', { faltando });
    }
    const emitir = exigirServico('declaracoes.emitir');
    const dados = dadosDaQuitacao({ ano, identificacao: ident, instituicao, lancamentos: doAno });
    const { declaracao: d, criada } = await emitir({ tipo: 'quitacao_anual', userId, ano, dados, substituirSeMudou: true });
    if (criada) {
      await auditoria.registrar({ acao: 'declaracao.emitida', entidade: { tipo: 'declaracao', id: d.codigo }, alvoUserId: userId, extra: { tipo: 'quitacao_anual', ano } }, req);
      await notificar({
        userIds: [userId], tipo: 'declaracao.emitida', titulo: 'Declaração emitida', texto: `Declaração financeira anual (quitação) · ${ano}`,
        link: 'certificados.html#historico', entidade: { tipo: 'declaracao', id: hex(d._id) ?? String(d.codigo) }, chave: `declaracao.emitida:${d.codigo}`
      });
    }
    res.status(criada ? 201 : 200).json({
      declaracao: {
        id: hex(d._id), codigo: d.codigo, tipo: 'quitacao_anual', rotulo: 'Declaração financeira anual (quitação)', ano,
        emitidaEm: d.emitidaEm instanceof Date ? d.emitidaEm.toISOString() : d.emitidaEm ?? null,
        dados: d.dados, hash: d.hash ?? null, kid: d.kid ?? null, hashPrefixo: prefixoDoHash(d.hash),
        urlValidacao: URL_VALIDACAO(d.codigo), revogada: !!d.revogada
      },
      criada
    });
  });

  // ---------- Pedido da loja → atendimento financeiro (API §6.9, DC-69, D-79) ----------
  aluno.post('/me/pedidos', limite(req => `pedido:${String(req.user._id)}`, 5), async (req, res) => {
    const userId = String(req.user._id);
    const corpo = corpoDe(req);
    const bruto = corpo.cursoIds;
    if (!Array.isArray(bruto) || !bruto.length) throw invalido('cursoIds', 'Escolha ao menos um curso.');
    if (bruto.some(v => typeof v !== 'string')) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { cursoIds: 'Formato inválido.' } });
    const ids = [...new Set(bruto.map(s => s.trim()))];
    if (ids.length > MAX_CURSOS_PEDIDO) throw invalido('cursoIds', `Escolha no máximo ${MAX_CURSOS_PEDIDO} cursos por pedido.`);
    const foraDoPadrao = ids.filter(i => !ID_LEGADO_RE.test(i));
    if (foraDoPadrao.length) throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoIds: 'Curso inválido.' }, cursoIds: foraDoPadrao });
    const cursos = await repo('cursos').find({ _id: { $in: ids } }, { projection: { titulo: 1, preco: 1, isAtivo: 1 } }).toArray();
    const porId = new Map(cursos.map(c => [String(c._id), c]));
    const recusados = ids.filter(i => !porId.has(i) || porId.get(i).isAtivo === false);
    if (recusados.length) {
      throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoIds: recusados.length === 1 ? 'Um dos cursos não está disponível.' : 'Alguns cursos não estão disponíveis.' }, cursoIds: recusados });
    }
    const ctx = await acesso.contexto(req);
    const liberados = ids.filter(i => ctx.cursosLiberados && ctx.cursosLiberados.has(i));
    if (liberados.length) throw new ErroPortal(409, 'ja-liberado', liberados.length === 1 ? 'Você já tem acesso a este curso.' : 'Você já tem acesso a alguns destes cursos.', { cursoIds: liberados });

    const abrir = exigirServico('atendimento.abrirProtocolo');
    const chave = chaveDoPedido(ids);
    const t = agora();
    const existente = await repo('protocolos').findOne(
      { userId, 'pedido.chave': chave, status: { $ne: 'encerrado' }, criadoEm: { $gte: new Date(t.getTime() - DIA) } },
      { sort: { criadoEm: -1 }, projection: { protocolo: 1, pedido: 1 } }
    );
    if (existente?.protocolo) {
      return res.status(200).json({
        protocolo: existente.protocolo,
        pedido: {
          itens: (existente.pedido?.itens || []).map(i => ({ cursoId: i.cursoId, titulo: i.titulo, valorCentavos: Number.isInteger(i.valorCentavos) ? i.valorCentavos : null })),
          totalCentavos: Number.isInteger(existente.pedido?.totalCentavos) ? existente.pedido.totalCentavos : null
        },
        reaproveitado: true
      });
    }
    const itens = ids.map(i => ({ cursoId: i, titulo: String(porId.get(i).titulo || i), valorCentavos: centavosDoPreco(porId.get(i).preco) }));
    const totalCentavos = somaOuNulo(itens.map(i => i.valorCentavos));
    const { protocolo } = await abrir({
      userId, categoria: 'financeiro', origem: 'humano', assunto: 'Pedido de matrícula',
      mensagem: mensagemDoPedido(itens, totalCentavos),
      pedido: { chave, cursoIds: ids, itens, totalCentavos }, req
    });
    await auditoria.registrar({ acao: 'pedido.criado', entidade: { tipo: 'protocolo', id: protocolo }, alvoUserId: userId, extra: { protocolo, cursoIds: ids, totalCentavos } }, req);
    res.status(201).json({ protocolo, pedido: { itens, totalCentavos }, reaproveitado: false });
  });

  // =================================================================
  // COORDENAÇÃO
  // =================================================================
  async function filtroDaCoordenacao(q) {
    for (const k of ['status', 'cursoId', 'userId', 'q', 'venceDe', 'venceAte', 'origem']) {
      if (q[k] !== undefined && typeof q[k] !== 'string') throw new ErroPortal(400, 'formato-invalido');
    }
    const f = {};
    if (q.userId) {
      if (!ID_RE.test(q.userId)) return null;
      f.userId = q.userId;
    }
    if (q.cursoId) {
      if (!ID_LEGADO_RE.test(q.cursoId)) return null;
      f.cursoId = q.cursoId;
    }
    if (q.origem) {
      if (!ORIGENS_LANCAMENTO.includes(q.origem)) throw invalido('origem', 'Origem inválida.');
      f.origem = q.origem === 'manual' ? { $ne: 'gateway' } : 'gateway';
    }
    const de = q.venceDe ? lerDia(q.venceDe, 'venceDe') : null;
    const ate = q.venceAte ? lerDia(q.venceAte, 'venceAte') : null;
    if (de || ate) f.vencimento = { ...(de ? { $gte: de } : {}), ...(ate ? { $lte: ate } : {}) };
    if (q.q && q.q.trim()) {
      const termos = regexBusca(q.q);
      if (!termos) return null;
      const users = await repo('users').find({ $and: termos.map(t => ({ $or: [{ nome: t }, { email: t }] })) }, { projection: { _id: 1 } }).limit(500).toArray();
      if (!users.length) return null;
      const ids = users.map(u => String(u._id));
      f.userId = f.userId ? (ids.includes(f.userId) ? f.userId : '__nenhum__') : { $in: ids };
    }
    return f;
  }

  admin.get('/financeiro/lancamentos', async (req, res) => {
    const q = req.query || {};
    const { pagina, porPagina, pular } = lerPagina(q, { porPaginaPadrao: 50, max: 100 });
    const status = FILTROS_STATUS.includes(q.status) ? q.status : 'todos';
    const h = hoje();
    const f = await filtroDaCoordenacao(q);
    const base = f ? await col().find(f).sort({ vencimento: 1 }).limit(LIMITE_LEITURA).toArray() : [];
    const filtrados = filtrarEOrdenar([...base], status, h);
    const pag = filtrados.slice(pular, pular + porPagina);
    const alunos = await alunosPorId(pag.map(l => l.userId));
    res.json({
      kpis: calcularKpis(base, h),
      contagens: contarPorStatus(base, h),
      status,
      itens: pag.map(l => lancamentoDaCoordenacao(l, h, { aluno: alunos.get(String(l.userId)) || null })),
      pagina, porPagina, total: filtrados.length, totalPaginas: Math.ceil(filtrados.length / porPagina),
      hoje: h
    });
  });

  admin.get('/financeiro/lancamentos/:id', async (req, res) => {
    const doc = await lancamentoOu404(req.params.id);
    res.json({ lancamento: await detalhe(doc) });
  });

  /** Aluno, matrícula e curso de um lançamento novo (400 quando a matrícula é de outro aluno ou curso). */
  async function vinculo(corpo, { exigirMatricula = false } = {}) {
    const userIdBruto = lerTexto(corpo, 'userId', { max: 24, obrigatorio: true });
    if (!ID_RE.test(userIdBruto)) throw invalido('userId', 'Aluno não encontrado.');
    const user = await repo('users').findOne({ _id: new ObjectId(userIdBruto) }, { projection: { _id: 1, nome: 1, email: 1 } });
    if (!user) throw invalido('userId', 'Aluno não encontrado.');
    const userId = String(user._id);
    let cursoId = corpo.cursoId === undefined || corpo.cursoId === null || corpo.cursoId === '' ? null : lerTexto(corpo, 'cursoId', { max: 64 });
    if (cursoId && !ID_LEGADO_RE.test(cursoId)) throw invalido('cursoId', 'Curso inválido.');
    let matricula = null;
    const temMatricula = !(corpo.matriculaId === undefined || corpo.matriculaId === null || corpo.matriculaId === '');
    if (!temMatricula && exigirMatricula) throw invalido('matriculaId', 'Escolha a matrícula.');
    if (temMatricula) {
      const mid = lerTexto(corpo, 'matriculaId', { max: 24 });
      if (!ID_RE.test(mid)) throw invalido('matriculaId', 'Matrícula não encontrada.');
      const doAluno = exigirServico('secretaria.matriculasDoAluno');
      const lista = await doAluno(userId);
      matricula = (Array.isArray(lista) ? lista : []).find(m => (hex(m?._id) ?? m?.id) === mid) || null;
      if (!matricula) throw invalido('matriculaId', 'Esta matrícula é de outro aluno.');
      if (cursoId && String(matricula.cursoId) !== cursoId) throw invalido('matriculaId', 'Esta matrícula é de outro curso.');
      cursoId = String(matricula.cursoId);
    }
    let cursoTitulo = null;
    if (cursoId) {
      const c = await repo('cursos').findOne({ _id: cursoId }, { projection: { titulo: 1 } });
      if (!c) throw invalido('cursoId', 'Curso não encontrado.');
      cursoTitulo = c.titulo ?? null;
    }
    return {
      user, userId, cursoId, cursoTitulo,
      matriculaId: matricula ? paraObjectId(hex(matricula._id) ?? matricula.id) : null,
      matriculaNumero: matricula?.numero ?? null
    };
  }

  function novoLancamento(v, { tipo, descricao, parcela, vencimento, valorCentavos, formaPrevista, por, t, loteId = null }) {
    return {
      userId: v.userId, matriculaId: v.matriculaId, matriculaNumero: v.matriculaNumero, cursoId: v.cursoId, cursoTitulo: v.cursoTitulo,
      tipo, descricao, parcela, vencimento, valorCentavos, formaPrevista, situacao: 'pendente',
      pagamento: null, nfse: null, segundaVia: null, origem: 'manual', externo: null, cancelamento: null,
      historico: [{ em: t, por, acao: 'criado', de: null, para: 'pendente', motivo: null }],
      ...(loteId ? { loteId } : {}),
      versao: 1, criadoEm: t, criadoPor: por, atualizadoEm: t
    };
  }

  admin.post('/financeiro/lancamentos', async (req, res) => {
    const corpo = corpoDe(req);
    const tipo = lerEnum(corpo.tipo, TIPOS_LANCAMENTO, 'tipo', { obrigatorio: true });
    const descricao = lerTexto(corpo, 'descricao', { max: 140 });
    const vencimento = lerDia(corpo.vencimento, 'vencimento', { obrigatorio: true });
    const valorCentavos = lerValor(corpo.valorCentavos, 'valorCentavos');
    const formaPrevista = lerEnum(corpo.formaPrevista, FORMAS, 'formaPrevista');
    let parcela = null;
    if (tipo === 'parcela') {
      const p = corpo.parcela && typeof corpo.parcela === 'object' && !Array.isArray(corpo.parcela) ? corpo.parcela : null;
      if (!p) throw invalido('parcela', 'Informe o número da parcela (n de N).');
      const de = lerInteiro(p.de, { min: 1, max: MAX_PARCELAS, obrigatorio: true }, 'parcela');
      const n = lerInteiro(p.n, { min: 1, max: de, obrigatorio: true }, 'parcela');
      parcela = { n, de };
    } else if (corpo.parcela !== undefined && corpo.parcela !== null) {
      throw invalido('parcela', 'Parcela só vale para o tipo Parcela.');
    }
    const v = await vinculo(corpo);
    const t = agora();
    const por = String(req.user._id);
    const _id = new ObjectId();
    const doc = { _id, ...novoLancamento(v, { tipo, descricao, parcela, vencimento, valorCentavos, formaPrevista, por, t }) };
    await auditoria.executar({
      acao: 'lancamento.criado', entidade: { tipo: 'lancamento', id: _id.toHexString() }, alvoUserId: v.userId, cursoId: v.cursoId,
      extra: { tipo, vencimento, valorCentavos }
    }, req, () => col().insertOne(doc));
    await notificar({
      userIds: [v.userId], tipo: 'lancamento.criado', titulo: 'Novo lançamento financeiro',
      texto: `${rotuloTipo(doc)}${v.cursoTitulo ? ` · ${v.cursoTitulo}` : ''} · vence em ${dataBr(vencimento)} · ${moedaTexto(valorCentavos)}`,
      link: 'financeiro.html', entidade: { tipo: 'lancamento', id: _id.toHexString() }, chave: `lancamento.criado:${_id.toHexString()}`
    });
    res.status(201).json({ lancamento: await detalhe(doc) });
  });

  admin.post('/financeiro/lancamentos/lote', async (req, res) => {
    const corpo = corpoDe(req);
    const quantidade = lerInteiro(corpo.quantidade, { min: 1, max: MAX_PARCELAS, obrigatorio: true }, 'quantidade');
    const primeiro = lerDia(corpo.primeiroVencimento, 'primeiroVencimento', { obrigatorio: true });
    const valorCentavos = lerValor(corpo.valorCentavos, 'valorCentavos');
    const formaPrevista = lerEnum(corpo.formaPrevista, FORMAS, 'formaPrevista');
    const descricao = lerTexto(corpo, 'descricao', { max: 140 });
    const v = await vinculo(corpo, { exigirMatricula: true });
    const datas = planejarParcelas(primeiro, quantidade);
    const t = agora();
    const por = String(req.user._id);
    const loteId = new ObjectId().toHexString();
    const docs = datas.map((vencimento, i) => ({
      _id: new ObjectId(),
      ...novoLancamento(v, { tipo: 'parcela', descricao, parcela: { n: i + 1, de: quantidade }, vencimento, valorCentavos, formaPrevista, por, t, loteId })
    }));
    await auditoria.executar({
      acao: 'lancamento.lote_criado', entidade: { tipo: 'lancamento_lote', id: loteId }, alvoUserId: v.userId, cursoId: v.cursoId,
      extra: { quantidade, primeiroVencimento: primeiro, valorCentavos, totalCentavos: valorCentavos * quantidade }
    }, req, () => col().insertMany(docs));
    await notificar({
      userIds: [v.userId], tipo: 'lancamento.criado', titulo: 'Novos lançamentos financeiros',
      texto: `${quantidade} ${quantidade === 1 ? 'parcela' : 'parcelas'} de ${moedaTexto(valorCentavos)}${v.cursoTitulo ? ` · ${v.cursoTitulo}` : ''} · 1º vencimento em ${dataBr(primeiro)}`,
      link: 'financeiro.html', entidade: { tipo: 'lancamento_lote', id: loteId }, chave: `lancamento.lote:${loteId}`
    });
    res.status(201).json({ criados: docs.map(d => d._id.toHexString()), loteId });
  });

  admin.put('/financeiro/lancamentos/:id', async (req, res) => {
    const doc = await lancamentoOu404(req.params.id);
    const corpo = corpoDe(req);
    const versao = lerVersao(corpo);
    const motivo = lerMotivo(corpo);
    if (doc.situacao !== 'pendente') throw new ErroPortal(409, 'so-pendente-manual');
    exigirManual(doc);
    exigirVersaoIgual(doc, versao);
    const set = {};
    if (corpo.vencimento !== undefined) set.vencimento = lerDia(corpo.vencimento, 'vencimento', { obrigatorio: true });
    if (corpo.valorCentavos !== undefined) set.valorCentavos = lerValor(corpo.valorCentavos, 'valorCentavos');
    if (corpo.descricao !== undefined) set.descricao = lerTexto(corpo, 'descricao', { max: 140 });
    if (corpo.formaPrevista !== undefined) set.formaPrevista = lerEnum(corpo.formaPrevista, FORMAS, 'formaPrevista');
    if (!Object.keys(set).length) throw invalido('vencimento', 'Nada para alterar.');
    const novo = await alterar(doc, {
      acao: 'lancamento.alterado', motivo, set, req, campos: Object.keys(set),
      historico: { acao: 'alterado', de: Object.fromEntries(Object.keys(set).map(k => [k, doc[k] ?? null])), para: set }
    });
    res.json({ lancamento: await detalhe(novo) });
  });

  admin.post('/financeiro/lancamentos/:id/pagamento', async (req, res) => {
    const doc = await lancamentoOu404(req.params.id);
    const corpo = corpoDe(req);
    const versao = lerVersao(corpo);
    const em = lerDia(corpo.em, 'em', { obrigatorio: true, max: hoje() });
    const forma = lerEnum(corpo.forma, FORMAS, 'forma', { obrigatorio: true });
    const valorPagoCentavos = corpo.valorPagoCentavos === undefined || corpo.valorPagoCentavos === null || corpo.valorPagoCentavos === ''
      ? doc.valorCentavos
      : lerValor(corpo.valorPagoCentavos, 'valorPagoCentavos');
    const observacao = lerTexto(corpo, 'observacao', { max: 300, multilinha: true });
    if (valorPagoCentavos !== doc.valorCentavos && !observacao) throw invalido('observacao', 'O valor pago é diferente do devido: explique na observação.');
    exigirManual(doc);
    if (doc.situacao !== 'pendente') throw new ErroPortal(409, 'transicao-invalida', doc.situacao === 'pago' ? 'Este lançamento já está pago.' : 'Lançamento cancelado não pode ser pago.');
    exigirVersaoIgual(doc, versao);
    const pagamento = { em, forma, valorPagoCentavos, observacao, registradoPor: String(req.user._id), registradoEm: agora() };
    const novo = await alterar(doc, {
      acao: 'lancamento.pago', set: { situacao: 'pago', pagamento }, req, campos: ['situacao', 'pagamento.em', 'pagamento.forma', 'pagamento.valorPagoCentavos'],
      historico: { acao: 'pago', de: 'pendente', para: { em, forma, valorPagoCentavos } }
    });
    res.json({ lancamento: await detalhe(novo) });
  });

  admin.post('/financeiro/lancamentos/:id/estorno', async (req, res) => {
    const doc = await lancamentoOu404(req.params.id);
    const corpo = corpoDe(req);
    const versao = lerVersao(corpo);
    const motivo = lerMotivo(corpo);
    exigirManual(doc);
    if (doc.situacao !== 'pago') throw new ErroPortal(409, 'transicao-invalida', 'Só lançamentos pagos podem ser estornados.');
    exigirVersaoIgual(doc, versao);
    const p = doc.pagamento || {};
    const novo = await alterar(doc, {
      acao: 'lancamento.estornado', motivo, set: { situacao: 'pendente', pagamento: null }, req,
      campos: ['situacao', 'pagamento.em', 'pagamento.forma', 'pagamento.valorPagoCentavos'],
      historico: { acao: 'estornado', de: { em: p.em ?? null, forma: p.forma ?? null, valorPagoCentavos: valorPago(doc), observacao: p.observacao ?? null }, para: 'pendente' }
    });
    res.json({ lancamento: await detalhe(novo) });
  });

  admin.post('/financeiro/lancamentos/:id/cancelar', async (req, res) => {
    const doc = await lancamentoOu404(req.params.id);
    const corpo = corpoDe(req);
    const versao = lerVersao(corpo);
    const motivo = lerMotivo(corpo, { min: 10 });
    exigirManual(doc);
    if (doc.situacao === 'pago') throw new ErroPortal(409, 'transicao-invalida', 'Lançamento pago: estorne o pagamento antes de cancelar.');
    if (doc.situacao !== 'pendente') throw new ErroPortal(409, 'transicao-invalida', 'Este lançamento já está cancelado.');
    exigirVersaoIgual(doc, versao);
    const cancelamento = { em: agora(), por: String(req.user._id), motivo };
    const novo = await alterar(doc, {
      acao: 'lancamento.cancelado', motivo, set: { situacao: 'cancelado', cancelamento }, req, campos: ['situacao'],
      historico: { acao: 'cancelado', de: 'pendente', para: 'cancelado' }
    });
    res.json({ lancamento: await detalhe(novo) });
  });

  admin.put('/financeiro/lancamentos/:id/nfse', async (req, res) => {
    const doc = await lancamentoOu404(req.params.id);
    const corpo = corpoDe(req);
    const numero = lerTexto(corpo, 'numero', { max: 30, obrigatorio: true });
    if (!NFSE_RE.test(numero)) throw invalido('numero', 'Use até 30 caracteres: letras, números, ponto, barra ou hífen.');
    const emitidaEm = lerDia(corpo.emitidaEm, 'emitidaEm', { max: hoje() });
    if (doc.situacao === 'cancelado') throw new ErroPortal(409, 'lancamento-cancelado');
    const nfse = { numero, emitidaEm, registradoPor: String(req.user._id), registradoEm: agora() };
    const novo = await alterar(doc, {
      acao: 'lancamento.nfse_registrada', set: { nfse }, req, campos: ['nfse.numero', 'nfse.emitidaEm'],
      historico: { acao: 'nfse_registrada', de: doc.nfse?.numero ?? null, para: numero }
    });
    res.json({ lancamento: await detalhe(novo) });
  });

  admin.post('/financeiro/lancamentos/:id/nfse/remover', async (req, res) => {
    const doc = await lancamentoOu404(req.params.id);
    const motivo = lerMotivo(corpoDe(req));
    if (!doc.nfse) throw naoEncontrado('Este lançamento não tem NFS-e registrada.');
    const novo = await alterar(doc, {
      acao: 'lancamento.nfse_removida', motivo, set: { nfse: null }, req, campos: ['nfse.numero', 'nfse.emitidaEm'],
      historico: { acao: 'nfse_removida', de: doc.nfse.numero, para: null }
    });
    res.json({ lancamento: await detalhe(novo) });
  });

  admin.put('/financeiro/lancamentos/:id/segunda-via', async (req, res) => {
    const doc = await lancamentoOu404(req.params.id);
    const corpo = corpoDe(req);
    const bruto = lerTexto(corpo, 'url', { max: 500, obrigatorio: true });
    const url = validarUrlHttps(bruto);
    if (!url) throw invalido('url', 'Use um endereço que comece com https://.');
    if (doc.situacao === 'cancelado') throw new ErroPortal(409, 'lancamento-cancelado');
    const anterior = doc.segundaVia?.arquivoId ? hex(doc.segundaVia.arquivoId) : null;
    const novo = await alterar(doc, {
      acao: 'lancamento.segunda_via_alterada', set: { segundaVia: { tipo: 'link', url, arquivoId: null, atualizadaEm: agora() } }, req,
      campos: ['segundaVia.tipo', 'segundaVia.url'], historico: { acao: 'segunda_via_link', de: doc.segundaVia?.tipo ?? null, para: 'link' }
    });
    if (anterior && arquivos) { try { await arquivos.apagar(anterior); } catch (err) { avisar('2ª via anterior não apagada', err); } }
    res.json({ lancamento: await detalhe(novo) });
  });

  admin.post('/financeiro/lancamentos/:id/segunda-via/arquivo', ...lerCorpoBinario({ limiteBytes: MAX_PDF_SEGUNDA_VIA, tipos: ['pdf'] }), async (req, res) => {
    if (!arquivos) throw new ErroPortal(503, 'servico-indisponivel');
    const doc = await lancamentoOu404(req.params.id);
    if (doc.situacao === 'cancelado') throw new ErroPortal(409, 'lancamento-cancelado');
    const salvo = await arquivos.salvar({
      contexto: 'segunda_via', donoUserId: doc.userId, ref: { entidadeId: hex(doc._id) }, buf: req.arquivo.buf, tipo: 'pdf',
      nomeDownload: `segunda-via-${doc.vencimento}`, por: String(req.user._id)
    });
    const anterior = doc.segundaVia?.arquivoId ? hex(doc.segundaVia.arquivoId) : null;
    let novo;
    try {
      novo = await alterar(doc, {
        acao: 'lancamento.segunda_via_alterada', set: { segundaVia: { tipo: 'pdf', url: null, arquivoId: new ObjectId(salvo.id), atualizadaEm: agora() } }, req,
        campos: ['segundaVia.tipo'], historico: { acao: 'segunda_via_pdf', de: doc.segundaVia?.tipo ?? null, para: 'pdf' }
      });
    } catch (err) {
      try { await arquivos.apagar(salvo.id); } catch { /* nada */ }
      throw err;
    }
    if (anterior) { try { await arquivos.apagar(anterior); } catch (err) { avisar('2ª via anterior não apagada', err); } }
    res.json({ lancamento: await detalhe(novo) });
  });

  admin.delete('/financeiro/lancamentos/:id/segunda-via', async (req, res) => {
    const doc = await lancamentoOu404(req.params.id);
    if (!doc.segundaVia) return res.json({ ok: true });
    const anterior = doc.segundaVia.arquivoId ? hex(doc.segundaVia.arquivoId) : null;
    await alterar(doc, {
      acao: 'lancamento.segunda_via_alterada', set: { segundaVia: null }, req, campos: ['segundaVia.tipo', 'segundaVia.url'],
      historico: { acao: 'segunda_via_removida', de: doc.segundaVia.tipo, para: null }
    });
    if (anterior && arquivos) { try { await arquivos.apagar(anterior); } catch (err) { avisar('2ª via não apagada', err); } }
    res.json({ ok: true });
  });

  return { aluno, admin, leituras };
}

// =================================================================
// Relatório `financeiro` (grupo relatorio, API §6.11.3; só coordenação)
// =================================================================
export function criarRelatorioFinanceiro({ repo, hojeSP: hojeFn }) {
  const col = () => repo('lancamentos');
  async function linhasBase(filtros = {}) {
    const f = {};
    if (typeof filtros.cursoId === 'string' && filtros.cursoId) {
      if (!ID_LEGADO_RE.test(filtros.cursoId)) throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoId: 'Curso inválido.' } });
      f.cursoId = filtros.cursoId;
    }
    const de = typeof filtros.de === 'string' && validarDataCalendario(filtros.de) ? filtros.de : null;
    const ate = typeof filtros.ate === 'string' && validarDataCalendario(filtros.ate) ? filtros.ate : null;
    if (de || ate) f.vencimento = { ...(de ? { $gte: de } : {}), ...(ate ? { $lte: ate } : {}) };
    return { docs: await col().find(f).sort({ vencimento: 1 }).limit(LIMITE_LEITURA + 1).toArray(), de, ate };
  }
  return {
    id: 'financeiro',
    titulo: 'Financeiro',
    papeis: ['admin'],
    filtros: [
      { chave: 'cursoId', tipo: 'curso' },
      { chave: 'status', tipo: 'enum', opcoes: FILTROS_STATUS },
      { chave: 'de', tipo: 'data' },
      { chave: 'ate', tipo: 'data' }
    ],
    colunas: [
      { chave: 'aluno', rotulo: 'Aluno', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto', somenteAdmin: true },
      { chave: 'curso', rotulo: 'Curso', tipo: 'texto' },
      { chave: 'matricula', rotulo: 'Nº matrícula', tipo: 'texto' },
      { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' },
      { chave: 'parcela', rotulo: 'Parcela', tipo: 'texto' },
      { chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data' },
      { chave: 'valor', rotulo: 'Valor', tipo: 'moeda' },
      { chave: 'status', rotulo: 'Situação', tipo: 'texto' },
      { chave: 'forma', rotulo: 'Forma', tipo: 'texto' },
      { chave: 'pagoEm', rotulo: 'Pago em', tipo: 'data' },
      { chave: 'valorPago', rotulo: 'Valor pago', tipo: 'moeda' },
      { chave: 'nfse', rotulo: 'NFS-e', tipo: 'texto' },
      { chave: 'segundaVia', rotulo: '2ª via', tipo: 'texto' },
      { chave: 'origem', rotulo: 'Origem', tipo: 'texto' }
    ],
    async consultar(_req, filtros = {}, { limite = LIMITE_LEITURA } = {}) {
      const hoje = hojeFn();
      const { docs } = await linhasBase(filtros);
      const status = FILTROS_STATUS.includes(filtros.status) ? filtros.status : 'todos';
      const lista = filtrarEOrdenar(docs, status, hoje).slice(0, limite + 1);
      const ids = [...new Set(lista.map(l => l.userId).filter(i => ID_RE.test(String(i))))];
      const users = ids.length ? await repo('users').find({ _id: { $in: ids.map(i => new ObjectId(i)) } }, { projection: { nome: 1, email: 1 } }).toArray() : [];
      const porId = new Map(users.map(u => [String(u._id), u]));
      return lista.map(l => {
        const st = statusDe(l, hoje);
        const forma = l.pagamento?.forma ?? l.formaPrevista ?? null;
        return {
          aluno: porId.get(String(l.userId))?.nome ?? null,
          email: porId.get(String(l.userId))?.email ?? null,
          curso: l.cursoTitulo ?? null,
          matricula: l.matriculaNumero ?? null,
          tipo: l.tipo === 'parcela' ? 'Parcela' : rotuloTipo(l),
          parcela: l.parcela ? `${l.parcela.n}/${l.parcela.de}` : null,
          vencimento: l.vencimento,
          valor: l.valorCentavos,
          status: ROTULOS_STATUS[st],
          forma: forma ? ROTULOS_FORMA[forma] ?? null : null,
          pagoEm: st === 'pago' ? l.pagamento?.em ?? null : null,
          valorPago: st === 'pago' ? valorPago(l) : null,
          nfse: l.nfse?.numero ?? null,
          segundaVia: l.segundaVia ? (l.segundaVia.tipo === 'pdf' ? 'PDF' : 'Link') : null,
          origem: (l.origem || 'manual') === 'gateway' ? 'Gateway' : 'Manual'
        };
      });
    },
    async resumir(_req, filtros = {}) {
      const hoje = hojeFn();
      const { docs } = await linhasBase({ ...filtros, de: null, ate: null });
      let recebido = 0;
      let emAberto = 0;
      let emAtraso = 0;
      let qtdAtraso = 0;
      const recebidoMes = new Map();
      const abertoMes = new Map();
      const deF = typeof filtros.de === 'string' && validarDataCalendario(filtros.de) ? filtros.de : null;
      const ateF = typeof filtros.ate === 'string' && validarDataCalendario(filtros.ate) ? filtros.ate : null;
      const dentro = d => (!deF || d >= deF) && (!ateF || d <= ateF);
      const rotuloMes = d => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
      for (const l of docs) {
        const st = statusDe(l, hoje);
        if (st === 'pago' && l.pagamento?.em && dentro(l.pagamento.em)) {
          recebido += valorPago(l);
          const k = l.pagamento.em.slice(0, 7);
          recebidoMes.set(k, (recebidoMes.get(k) || 0) + valorPago(l));
        }
        if ((st === 'aberto' || st === 'atrasado') && dentro(l.vencimento)) {
          if (st === 'aberto') emAberto += l.valorCentavos || 0;
          else { emAtraso += l.valorCentavos || 0; qtdAtraso++; }
          const k = l.vencimento.slice(0, 7);
          abertoMes.set(k, (abertoMes.get(k) || 0) + (l.valorCentavos || 0));
        }
      }
      const meses = [...new Set([...recebidoMes.keys(), ...abertoMes.keys()])].sort();
      return {
        kpis: [
          { chave: 'recebidoNoPeriodo', rotulo: 'Recebido no período', valor: recebido, formato: 'moeda', ...(deF || ateF ? {} : { nota: 'Sem período: soma de todos os pagamentos registrados.' }) },
          { chave: 'emAberto', rotulo: 'Em aberto', valor: emAberto, formato: 'moeda' },
          { chave: 'emAtraso', rotulo: 'Em atraso', valor: emAtraso, formato: 'moeda' },
          { chave: 'lancamentosEmAtraso', rotulo: 'Lançamentos em atraso', valor: qtdAtraso, formato: 'numero' }
        ],
        series: [
          { chave: 'recebidoPorMes', rotulo: 'Recebido por mês', formato: 'moeda', pontos: meses.map(m => ({ rotulo: rotuloMes(m), valor: recebidoMes.get(m) || 0 })) },
          { chave: 'emAbertoPorMes', rotulo: 'Em aberto por mês (vencimento)', formato: 'moeda', pontos: meses.map(m => ({ rotulo: rotuloMes(m), valor: abertoMes.get(m) || 0 })) }
        ]
      };
    }
  };
}

/** Módulo do agregador (API §5.1). Sem E/S: só registra rotas, serviços, grupos e índices. */
export default async function montar(ctx) {
  const { rotas, servicos, comum } = ctx;
  comum.registrarIndices(INDICES_FINANCEIRO);
  const { aluno, admin, leituras } = criarRotasFinanceiro({
    repo: comum.repo, servicos, acesso: comum.acesso, auditoria: comum.auditoria, notificacoes: comum.notificacoes,
    arquivos: comum.arquivos, contador: comum.contador, perfis: comum.perfis, agora: comum.agora, log: comum.log
  });
  servicos.registrar('financeiro.resumoDoAluno', leituras.resumoDoAluno);
  servicos.registrar('financeiro.anosDeclaraveis', leituras.anosDeclaraveis);
  servicos.adicionar('aviso', leituras.avisoAtraso);
  servicos.adicionar('aviso', leituras.avisoVencendo);
  servicos.adicionar('notificacaoSobDemanda', leituras.notificacaoVencendo);
  servicos.adicionar('painel', leituras.painel);
  servicos.adicionar('exportador', leituras.exportador);
  servicos.adicionar('relatorio', criarRelatorioFinanceiro({ repo: comum.repo, hojeSP: () => hojeSP(comum.agora()) }));
  rotas.aluno.use(aluno);
  rotas.admin.use(admin);
}
