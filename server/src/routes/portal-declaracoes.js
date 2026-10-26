// =============================================================
// COMPLEXO DMC · /api/portal — declarações por curso e validação pública
// PORTAL-API §6.7.5, §6.7.6, §8.9, §4.4 (declaracoes.emitir; grupos
// validador DMC/DEC, exportador, cascata) · índice §8.1 (F3b) · dono: F3b.
//
//   aluno  GET  /portal/me/declaracoes            ?cursoId=
//          POST /portal/me/declaracoes            { tipo, matriculaId }   (10/h)
//          GET  /portal/me/declaracoes/:id        (documento para impressão)
//   admin  GET  /portal/admin/declaracoes         ?tipo&cursoId&userId&q&de&ate&revogada&pagina
//          GET  /portal/admin/declaracoes/:id
//          POST /portal/admin/declaracoes/:id/revogar  { motivo }
//   público GET  /portal/validar/:codigo           (60/15 min por IP)
//           POST /portal/validar/:codigo/conferir  { nome } (10/15 min por IP)
//
// Validação pública: nunca sai nome completo, e-mail, userId, matrícula,
// nota, frequência, CPF nem motivo — só iniciais e o essencial do tipo.
// Matrículas vêm da F4a (`secretaria.*`); frequência, da F3a
// (`academico.situacaoDoCurso`). Sem elas, a rota responde com honestidade
// (lista vazia + `indisponivel`, ou 503 `servico-indisponivel` na emissão).
// =============================================================
import { Router } from 'express';
import { ErroPortal } from '../portal/erros.js';
import { CODIGO_CERTIFICADO_RE, CODIGO_VERIFICACAO_RE } from '../portal/codigos.js';
import { registrarIndices } from '../portal/indices.js';
import { validadorDoCodigo } from '../portal/servicos.js';
import { limitePersistente } from '../portal/limitador.js';
import {
  lerTexto, lerEnum, lerId, lerIdLegado, lerPagina, validarDataCalendario, hojeSP, normalizarNome, iniciais
} from '../portal/validacao.js';
import {
  LATO_SENSU, TIPOS_DECLARACAO, TIPOS_DECLARACAO_CURSO, ROTULOS_DECLARACAO, rotuloNivel, cargaDoCurso, horasLocais,
  hashPrefixo, camposSeloCertificado, camposSeloDeclaracao, nomeTitularDeDados, elegibilidadeDeclaracao,
  criarServicoDeclaracoes, INDICES_CERTIFICACAO
} from '../portal/certificacao/declaracoes.js';

const ehObjetoPlano = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const iso = d => (d instanceof Date ? d.toISOString() : (d ?? null));
const naoEncontrada = () => new ErroPortal(404, null, 'Declaração não encontrada.');
const escaparRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const URL_VALIDACAO = codigo => `/plataforma-ead/validar.html?codigo=${encodeURIComponent(codigo)}`;

/** Chaves permitidas na resposta pública (varredura da F3: nada além disso sai). */
const CHAVES_VALIDACAO = ['valido', 'codigo', 'tipo', 'rotulo', 'emitidoEm', 'emissor', 'iniciais', 'integro', 'situacao', 'hashPrefixo', 'detalhes'];

/** Chaves que nunca saem no despacho público, em nenhum nível de `detalhes` (varredura da F3, 5 prefixos). */
const CHAVES_PROIBIDAS = new Set([
  'nome', 'nomeAluno', 'nomeTitular', 'nomeRegistro', 'nomeSocial', 'email', 'userId', 'alvoUserId', 'matriculaId', 'matriculaNumero',
  'matricula', 'cpf', 'documento', 'passaporte', 'nota', 'notaFinal', 'notas', 'frequenciaPct', 'aoVivoPct', 'gravadoPct', 'motivo',
  'titulo', 'titular', 'hash', 'kid', 'dados', 'senhaHash', 'ip', 'ipTruncado'
]);
export function limparDetalhes(v, nivel = 0) {
  if (nivel > 4 || v === null || typeof v !== 'object') return v ?? null;
  if (Array.isArray(v)) return v.map(x => limparDetalhes(x, nivel + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) if (!CHAVES_PROIBIDAS.has(k)) out[k] = limparDetalhes(x, nivel + 1);
  return out;
}

export function normalizarCodigo(bruto) {
  return String(bruto ?? '').replace(/\s+/g, '').toUpperCase();
}

// ---------- selo: integridade sem atalho para null (A08) ----------
/** Formato do kid gravado pelo assinador (cripto.kidDe: 8 hex minúsculos). */
const KID_RE = /^[a-f0-9]{8}$/;
const HASH_PREFIXO_RE = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/;
/** Prefixos que SEMPRE nascem selados (a emissão chama `assinar` ou falha): DEC (declaracoes.js),
 *  FRQ (servico-academico.js) e CTR (contratos.js). AVL pode nascer sem selo se o assinador falhar
 *  (portal-avaliacoes.js) e DMC tem o legado sem selo (DC-65): nesses, sem selo segue null. */
const PREFIXOS_SELO_OBRIGATORIO = new Set(['DEC', 'FRQ', 'CTR']);

/**
 * Kids de material aposentado (rotação concluída, sem `PORTAL_MATERIAL_ANTERIOR`), em
 * `PORTAL_SELO_KIDS_APOSENTADOS` (lista separada por vírgula, ponto e vírgula ou espaço).
 * Só eles distinguem "selo antigo, não verificável" (null) de "kid forjado" (false).
 * O kid não é segredo: é o campo `kid` dos documentos emitidos com o material antigo.
 * @returns {{ kids: Set<string>, ignorados: number }}
 */
export function lerKidsAposentados(env = process.env) {
  const itens = String(env?.PORTAL_SELO_KIDS_APOSENTADOS ?? '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const kids = new Set(itens.filter(k => KID_RE.test(k)));
  return { kids, ignorados: itens.length - kids.size };
}

/**
 * Integridade de um registro selado (PORTAL-API §6.7.6). Antes, faltar hash/kid ou trocar o kid
 * dava `null` (sem alerta) e um documento adulterado aparecia como válido. Agora:
 *   - servidor sem assinador → null (não verificável agora; não é culpa do documento);
 *   - sem hash E sem kid → null só quando `exigeSelo:false` (certificado legado); senão false;
 *   - só um dos dois, ou kid fora do formato → false (selo mutilado);
 *   - kid atual ou anterior → true|false pelo HMAC (cripto.verificar);
 *   - kid desconhecido → null se aposentado (declarado), false se não (kid forjado).
 * @returns {true|false|null}
 */
export function conferirSelo({ assinador, tipo, campos, hash, kid, exigeSelo = true, kidsAposentados = null }) {
  if (!assinador || typeof assinador.verificar !== 'function') return null;
  const presente = v => v !== undefined && v !== null && v !== '';
  const temHash = presente(hash);
  const temKid = presente(kid);
  if (!temHash && !temKid) return exigeSelo ? false : null;
  if (!temHash || !temKid || typeof kid !== 'string' || !KID_RE.test(kid)) return false;
  const r = assinador.verificar(tipo, campos, hash, kid);
  if (r === true || r === false) return r;
  return kidsAposentados instanceof Set && kidsAposentados.has(kid) ? null : false;
}

const idDaMatricula = m => (m ? String(m._id ?? m.id ?? '') : '');
function turmaCodigoDe(m) {
  if (!m) return null;
  if (typeof m.turmaCodigo === 'string') return m.turmaCodigo;
  const atual = Array.isArray(m.enturmacoes) ? m.enturmacoes.find(e => e && !e.ate) : null;
  return atual?.turmaCodigo ?? null;
}

/** Documento da declaração para o titular/coordenação (impressão). */
export function declaracaoParaImpressao(d, { admin = false } = {}) {
  const out = {
    id: String(d._id),
    codigo: d.codigo,
    tipo: d.tipo,
    rotulo: ROTULOS_DECLARACAO[d.tipo] || 'Declaração',
    emitidaEm: iso(d.emitidaEm),
    dados: d.dados,
    hash: d.hash ?? null,
    kid: d.kid ?? null,
    hashPrefixo: hashPrefixo(d.hash),
    urlValidacao: URL_VALIDACAO(d.codigo),
    revogada: !!d.revogada,
    revogadaEm: d.revogada ? iso(d.revogada.em) : null
  };
  if (admin) {
    out.userId = d.userId;
    out.revogacao = d.revogada ? { em: iso(d.revogada.em), motivo: d.revogada.motivo ?? null } : null;
  }
  return out;
}

function itemDoHistorico(d) {
  return {
    id: String(d._id), codigo: d.codigo, tipo: d.tipo, rotulo: ROTULOS_DECLARACAO[d.tipo] || 'Declaração',
    cursoTitulo: d.dados?.cursoTitulo ?? null, matriculaNumero: d.dados?.matriculaNumero ?? null, ano: d.ano ?? null,
    emitidaEm: iso(d.emitidaEm), revogada: !!d.revogada
  };
}

/**
 * Validadores DMC (certificado) e DEC (declaração) do grupo `validador` (API §4.4).
 * @param {{ repo, assinador:()=>object|null, kidsAposentados?:Set<string>|string[] }} deps
 */
export function criarValidadores({ repo, assinador, kidsAposentados = null }) {
  const sel = () => (typeof assinador === 'function' ? assinador() : assinador) || null;
  const aposentados = kidsAposentados instanceof Set ? kidsAposentados : new Set(Array.isArray(kidsAposentados) ? kidsAposentados : []);
  const dmc = {
    prefixo: 'DMC',
    async validar(codigo) {
      const c = await repo('certificados').findOne({ codigo });
      if (!c) return null;
      // exigeSelo:false — o certificado legado (sem hash e sem kid) segue válido com integro:null (DC-65).
      const integro = conferirSelo({ assinador: sel(), tipo: 'certificado', campos: camposSeloCertificado(c), hash: c.hash, kid: c.kid, exigeSelo: false, kidsAposentados: aposentados });
      const curso = c.cursoId ? await repo('cursos').findOne({ _id: String(c.cursoId) }, { projection: { nivel: 1 } }) : null;
      return {
        valido: true, codigo: c.codigo, tipo: 'certificado', rotulo: 'Certificado', emitidoEm: iso(c.emitidoEm), emissor: 'Complexo DMC',
        iniciais: iniciais(c.nomeAluno || ''), integro, situacao: 'valido',
        hashPrefixo: c.hash ? hashPrefixo(c.hash) : null,
        detalhes: { tituloCurso: c.tituloCurso || '', cargaHoraria: c.cargaHoraria || '', ...(rotuloNivel(curso?.nivel) ? { nivelRotulo: rotuloNivel(curso.nivel) } : {}) }
      };
    },
    async nomeTitular(codigo) {
      const c = await repo('certificados').findOne({ codigo }, { projection: { nomeAluno: 1 } });
      return c ? (c.nomeAluno || null) : null;
    }
  };
  const dec = {
    prefixo: 'DEC',
    async validar(codigo) {
      const d = await repo('declaracoes').findOne({ codigo });
      if (!d) return null;
      // A emissão sempre sela (declaracoes.emitir falha sem assinador): sem selo, não confere.
      const integro = conferirSelo({ assinador: sel(), tipo: 'declaracao', campos: camposSeloDeclaracao(d), hash: d.hash, kid: d.kid, exigeSelo: true, kidsAposentados: aposentados });
      return {
        valido: true, codigo: d.codigo, tipo: 'declaracao', rotulo: ROTULOS_DECLARACAO[d.tipo] || 'Declaração',
        emitidoEm: iso(d.emitidaEm), emissor: 'Complexo DMC', iniciais: d.iniciaisTitular || iniciais(nomeTitularDeDados(d.dados) || ''),
        integro, situacao: d.revogada ? 'revogado' : 'valido',
        hashPrefixo: hashPrefixo(d.hash),
        detalhes: {
          curso: d.dados?.cursoTitulo ?? null, ano: d.ano ?? null, nivelRotulo: d.dados?.nivelRotulo ?? null,
          ...(d.revogada ? { revogadaEm: iso(d.revogada.em) } : {})
        }
      };
    },
    async nomeTitular(codigo) {
      const d = await repo('declaracoes').findOne({ codigo }, { projection: { dados: 1 } });
      return d ? nomeTitularDeDados(d.dados) : null;
    }
  };
  return { dmc, dec };
}

/**
 * @param {{ repo, servicos, auditoria, assinador:()=>object|null, emissor, contador?, notificacoes?, agora?, log?,
 *           throttleValidar?, throttleConferir? , criarThrottle }} deps
 * @returns {{ aluno: Router, admin: Router, publico: Router }}
 */
export function criarRotaDeclaracoes(deps = {}) {
  const {
    repo, servicos, auditoria, emissor, contador = null, notificacoes = null, agora = () => new Date(), log = console,
    criarThrottle = null, limitesPublicos = { validar: { janelaMs: 15 * 60 * 1000, max: 60 }, conferir: { janelaMs: 15 * 60 * 1000, max: 10 } }
  } = deps;
  if (typeof repo !== 'function') throw new TypeError('criarRotaDeclaracoes: informe repo.');
  if (!servicos || typeof servicos.tentar !== 'function') throw new TypeError('criarRotaDeclaracoes: informe servicos.');
  if (!auditoria) throw new TypeError('criarRotaDeclaracoes: informe auditoria.');
  if (!emissor || typeof emissor.emitir !== 'function') throw new TypeError('criarRotaDeclaracoes: informe emissor.');
  const col = nome => repo(nome);
  const tentar = nome => servicos.tentar(nome);
  const avisar = texto => { try { (log.warn || log.error).call(log, `[portal] ${texto}`); } catch { /* nada */ } };

  const aluno = Router();
  const admin = Router();
  const publico = Router();

  // ---------- leitura de matrículas e situação (outras fatias) ----------
  async function matriculasDo(userId) {
    const f = tentar('secretaria.matriculasDoAluno');
    if (typeof f !== 'function') return null;
    const lista = await f(String(userId));
    return Array.isArray(lista) ? lista : [];
  }
  async function situacaoDo(userId, cursoId) {
    const f = tentar('academico.situacaoDoCurso');
    if (typeof f !== 'function') return null;
    try { return await f(String(userId), String(cursoId)); } catch (err) { avisar(`academico.situacaoDoCurso falhou (${err?.message || err})`); return null; }
  }
  async function nomeTitularPara(userId, matricula) {
    const id = String(userId);
    const publicos = tentar('perfis.publicos');
    const identificacao = tentar('perfis.identificacao');
    if (matricula?.nomeEmDocumentos?.usar === 'social' && typeof publicos === 'function') {
      const social = (await publicos([id]))?.get(id)?.nomeSocial;
      if (social) return social;
    }
    if (typeof identificacao !== 'function') throw new ErroPortal(503, 'servico-indisponivel');
    const ident = await identificacao(id);
    return ident?.nomeRegistro || null;
  }

  const cursoCache = () => {
    const m = new Map();
    return async (cursoId) => {
      const k = String(cursoId);
      if (!m.has(k)) m.set(k, await col('cursos').findOne({ _id: k }));
      return m.get(k);
    };
  };

  // ---------- aluno ----------
  aluno.get('/me/declaracoes', async (req, res) => {
    const userId = String(req.user._id);
    const filtroCurso = typeof req.query.cursoId === 'string' && req.query.cursoId ? lerIdLegado(req.query.cursoId) : null;
    const historicoDocs = await col('declaracoes').find({ userId }, { sort: { emitidaEm: -1 }, limit: 200 }).toArray();
    historicoDocs.sort((a, b) => new Date(b.emitidaEm) - new Date(a.emitidaEm));

    const corpo = { disponiveis: [], quitacao: [], historico: historicoDocs.map(itemDoHistorico) };
    const matriculas = await matriculasDo(userId);
    if (matriculas === null) corpo.indisponivel = { disponiveis: 'Declarações por curso indisponíveis no momento: as matrículas ainda não foram carregadas.' };
    else {
      const curso = cursoCache();
      for (const m of matriculas) {
        if (!m || (filtroCurso && String(m.cursoId) !== filtroCurso)) continue;
        if (m.status === 'cancelada') continue;
        const c = await curso(m.cursoId);
        if (!c) continue;
        const sit = await situacaoDo(userId, m.cursoId);
        const frequenciaPct = typeof sit?.frequenciaGeralPct === 'number' ? sit.frequenciaGeralPct : null;
        for (const tipo of TIPOS_DECLARACAO_CURSO) {
          if (tipo === 'conclusao' && c.nivel === LATO_SENSU) continue;
          const e = elegibilidadeDeclaracao(tipo, { matricula: m, curso: c, frequenciaPct });
          corpo.disponiveis.push({
            tipo, rotulo: ROTULOS_DECLARACAO[tipo], matriculaId: idDaMatricula(m), matriculaNumero: m.numero ?? null,
            cursoId: String(m.cursoId), cursoTitulo: c.titulo || '', elegivel: e.elegivel, ...(e.motivo ? { motivo: e.motivo } : {})
          });
        }
      }
    }
    const anos = tentar('financeiro.anosDeclaraveis');
    if (typeof anos === 'function') {
      try {
        const lista = await anos(userId);
        corpo.quitacao = (Array.isArray(lista) ? lista : []).map(a => ({ ano: a.ano, disponivel: a.disponivel === true, motivo: a.motivo ?? null, emitida: a.emitida ?? null }));
      } catch (err) { avisar(`financeiro.anosDeclaraveis falhou (${err?.message || err})`); }
    }
    res.json(corpo);
  });

  const limiteEmissao = contador
    ? limitePersistente(contador, { janelaMs: 60 * 60 * 1000, max: 10, chave: req => `declaracao:u:${String(req.user._id)}`, codigo: 'limite' })
    : (_req, _res, next) => next();

  aluno.post('/me/declaracoes', limiteEmissao, async (req, res) => {
    const userId = String(req.user._id);
    const corpo = ehObjetoPlano(req.body) ? req.body : {};
    const tipo = lerEnum(corpo.tipo, TIPOS_DECLARACAO_CURSO, 'tipo', { obrigatorio: true });
    if (corpo.matriculaId !== undefined && corpo.matriculaId !== null && typeof corpo.matriculaId !== 'string') {
      throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { matriculaId: 'Formato inválido.' } });
    }
    const matriculaId = lerId(corpo.matriculaId);
    if (!matriculaId) throw new ErroPortal(404, null, 'Matrícula não encontrada.');
    const matriculas = await matriculasDo(userId);
    if (matriculas === null) throw new ErroPortal(503, 'servico-indisponivel');
    const m = matriculas.find(x => idDaMatricula(x) === String(matriculaId));
    if (!m) throw new ErroPortal(404, null, 'Matrícula não encontrada.');
    const curso = await col('cursos').findOne({ _id: String(m.cursoId) });
    if (!curso) throw new ErroPortal(404, null, 'Curso não encontrado.');
    if (tipo === 'conclusao' && curso.nivel === LATO_SENSU) throw new ErroPortal(409, 'certificado-pela-ies');

    const sit = tipo === 'matricula' ? null : await situacaoDo(userId, m.cursoId);
    if (tipo !== 'matricula' && !tentar('academico.situacaoDoCurso') && tipo === 'frequencia') throw new ErroPortal(503, 'servico-indisponivel');
    const frequenciaPct = typeof sit?.frequenciaGeralPct === 'number' ? sit.frequenciaGeralPct : null;
    const e = elegibilidadeDeclaracao(tipo, { matricula: m, curso, frequenciaPct });
    if (!e.elegivel) throw new ErroPortal(409, e.codigo || 'nao-elegivel', e.motivo, e.codigo ? {} : { motivo: e.motivo });

    const nomeTitular = await nomeTitularPara(userId, m);
    if (!nomeTitular) {
      throw new ErroPortal(409, 'cadastro-incompleto', 'Informe o nome de registro no seu cadastro antes de pedir a declaração.', { faltando: ['nomeRegistro'] });
    }
    let iesNome = null;
    let iesAto = null;
    if (curso.nivel === LATO_SENSU && curso.iesId) {
      const ies = await col('ies').findOne({ _id: curso.iesId });
      iesNome = ies?.nome ?? null;
      iesAto = ies?.atoCredenciamento ?? null;
    }
    const dados = {
      nomeTitular,
      cursoTitulo: curso.titulo || '',
      nivelRotulo: rotuloNivel(curso.nivel),
      iesNome,
      iesAtoCredenciamento: iesAto,
      cargaHorariaHoras: cargaDoCurso(curso, horasLocais),
      matriculaNumero: m.numero ?? null,
      turmaCodigo: turmaCodigoDe(m),
      inicioEm: iso(m.inicioEm),
      statusMatricula: m.status
    };
    if (tipo === 'frequencia') {
      Object.assign(dados, {
        frequenciaPct,
        aoVivoPct: typeof sit?.aoVivoPct === 'number' ? sit.aoVivoPct : null,
        gravadoPct: typeof sit?.gravadoPct === 'number' ? sit.gravadoPct : null,
        ate: hojeSP(agora())
      });
    }
    if (tipo === 'conclusao') {
      const cert = await col('certificados').findOne({ userId, cursoId: String(m.cursoId) }, { projection: { notaFinal: 1 } });
      Object.assign(dados, {
        concluidaEm: iso(m.concluidaEm),
        notaFinal: typeof m.resultadoFinal?.notaFinal === 'number' ? m.resultadoFinal.notaFinal : (typeof cert?.notaFinal === 'number' ? cert.notaFinal : null),
        frequenciaPct: typeof m.resultadoFinal?.frequenciaPct === 'number' ? m.resultadoFinal.frequenciaPct : frequenciaPct
      });
    }
    const { declaracao, criada } = await emissor.emitir({ tipo, userId, matriculaId, cursoId: String(m.cursoId), ano: null, dados, substituirSeMudou: false });
    if (criada) {
      await auditoria.registrar({ acao: 'declaracao.emitida', entidade: { tipo: 'declaracao', id: declaracao.codigo }, alvoUserId: userId, cursoId: String(m.cursoId), extra: { tipo } }, req);
      if (notificacoes && typeof notificacoes.emitir === 'function') {
        try {
          await notificacoes.emitir({
            userIds: [userId], tipo: 'declaracao.emitida', titulo: 'Declaração emitida', texto: `${ROTULOS_DECLARACAO[tipo]} · ${curso.titulo || ''}`.trim(),
            link: 'certificados.html#historico', entidade: { tipo: 'declaracao', id: String(declaracao._id) }, chave: `declaracao.emitida:${declaracao.codigo}`
          });
        } catch (err) { avisar(`notificação de declaração não emitida (${err?.message || err})`); }
      }
    }
    res.status(criada ? 201 : 200).json({ declaracao: declaracaoParaImpressao(declaracao), criada });
  });

  aluno.get('/me/declaracoes/:id', async (req, res) => {
    const id = lerId(req.params.id);
    if (!id) throw naoEncontrada();
    const d = await col('declaracoes').findOne({ _id: id, userId: String(req.user._id) });
    if (!d) throw naoEncontrada();
    res.json(declaracaoParaImpressao(d));
  });

  // ---------- admin ----------
  admin.get('/declaracoes', async (req, res) => {
    const q = req.query || {};
    for (const k of ['tipo', 'cursoId', 'userId', 'q', 'de', 'ate', 'revogada']) {
      if (q[k] !== undefined && typeof q[k] !== 'string') throw new ErroPortal(400, 'formato-invalido');
    }
    const filtro = {};
    if (q.tipo) filtro.tipo = lerEnum(q.tipo, TIPOS_DECLARACAO, 'tipo');
    if (q.cursoId) {
      const c = lerIdLegado(q.cursoId);
      if (!c) throw new ErroPortal(400, 'validacao', undefined, { campos: { cursoId: 'Curso inválido.' } });
      filtro.cursoId = c;
    }
    if (q.userId) {
      if (!/^[a-f0-9]{24}$/.test(q.userId)) throw new ErroPortal(400, 'validacao', undefined, { campos: { userId: 'Aluno inválido.' } });
      filtro.userId = q.userId;
    }
    if (q.revogada === '1') filtro.revogada = { $ne: null };
    else if (q.revogada === '0') filtro.revogada = null;
    const de = q.de ? validarDataCalendario(q.de) : null;
    const ate = q.ate ? validarDataCalendario(q.ate) : null;
    if (q.de && !de) throw new ErroPortal(400, 'validacao', undefined, { campos: { de: 'Data inválida.' } });
    if (q.ate && !ate) throw new ErroPortal(400, 'validacao', undefined, { campos: { ate: 'Data inválida.' } });
    if (de || ate) {
      filtro.emitidaEm = {};
      if (de) filtro.emitidaEm.$gte = new Date(`${de}T03:00:00.000Z`);
      if (ate) filtro.emitidaEm.$lt = new Date(new Date(`${ate}T03:00:00.000Z`).getTime() + 24 * 3600 * 1000);
    }
    if (q.q !== undefined && q.q !== '') {
      const termo = q.q.trim();
      if ([...termo].length < 3) throw new ErroPortal(400, 'validacao', 'Digite pelo menos 3 caracteres.', { campos: { q: 'Digite pelo menos 3 caracteres.' } });
      const re = new RegExp(escaparRegex(termo.slice(0, 80)), 'i');
      const users = await col('users').find({ $or: [{ nome: { $regex: re } }, { email: { $regex: re } }] }, { projection: { _id: 1 }, limit: 200 }).toArray();
      filtro.$or = [{ codigo: { $regex: new RegExp(escaparRegex(termo.toUpperCase().slice(0, 80))) } }, { userId: { $in: users.map(u => String(u._id)) } }];
    }
    const { pagina, porPagina, pular } = lerPagina(q, { porPaginaPadrao: 50, max: 100 });
    const total = await col('declaracoes').countDocuments(filtro);
    const docs = await col('declaracoes').find(filtro, { sort: { emitidaEm: -1 }, skip: pular, limit: porPagina }).toArray();
    const publicos = tentar('perfis.publicos');
    const mapa = typeof publicos === 'function' ? await publicos([...new Set(docs.map(d => d.userId))]) : new Map();
    res.json({
      itens: docs.map(d => {
        const p = mapa.get(String(d.userId));
        return {
          id: String(d._id), codigo: d.codigo, tipo: d.tipo, rotulo: ROTULOS_DECLARACAO[d.tipo] || 'Declaração',
          aluno: { id: String(d.userId), nome: p?.nome ?? null, email: p?.email ?? null },
          cursoTitulo: d.dados?.cursoTitulo ?? null, ano: d.ano ?? null, emitidaEm: iso(d.emitidaEm), revogada: !!d.revogada
        };
      }),
      pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina))
    });
  });

  admin.get('/declaracoes/:id', async (req, res) => {
    const id = lerId(req.params.id);
    if (!id) throw naoEncontrada();
    const d = await col('declaracoes').findOne({ _id: id });
    if (!d) throw naoEncontrada();
    res.json(declaracaoParaImpressao(d, { admin: true }));
  });

  admin.post('/declaracoes/:id/revogar', async (req, res) => {
    const id = lerId(req.params.id);
    if (!id) throw naoEncontrada();
    const corpo = ehObjetoPlano(req.body) ? req.body : {};
    const motivo = lerTexto(corpo, 'motivo', { min: 10, max: 500, obrigatorio: true, multilinha: true });
    const d = await col('declaracoes').findOne({ _id: id });
    if (!d) throw naoEncontrada();
    if (d.revogada) return res.json({ declaracao: declaracaoParaImpressao(d, { admin: true }) });
    const revogada = { em: agora(), por: String(req.user._id), motivo };
    await auditoria.executar({
      acao: 'declaracao.revogada', entidade: { tipo: 'declaracao', id: d.codigo }, alvoUserId: d.userId, cursoId: d.cursoId ?? null, motivo
    }, req, () => col('declaracoes').updateOne({ _id: d._id, revogada: null }, { $set: { revogada } }));
    res.json({ declaracao: declaracaoParaImpressao({ ...d, revogada }, { admin: true }) });
  });

  // ---------- público: despacho único ----------
  const semLimite = (_req, _res, next) => next();
  const limValidar = criarThrottle ? criarThrottle({ ...limitesPublicos.validar, mensagem: 'Muitas consultas seguidas. Tente em alguns minutos.', codigo: 'limite' }) : semLimite;
  const limConferir = criarThrottle ? criarThrottle({ ...limitesPublicos.conferir, mensagem: 'Muitas consultas seguidas. Tente em alguns minutos.', codigo: 'limite' }) : semLimite;
  const codigoValido = c => CODIGO_VERIFICACAO_RE.test(c) || CODIGO_CERTIFICADO_RE.test(c);
  const naoAchou = res => res.status(404).json({ valido: false, error: 'Não encontramos documento com este código.' });

  publico.get('/validar/:codigo', limValidar, async (req, res) => {
    const codigo = normalizarCodigo(req.params.codigo);
    if (!codigoValido(codigo)) return naoAchou(res);
    const v = validadorDoCodigo(servicos, codigo);
    if (!v) return naoAchou(res);
    const r = await v.validar(codigo);
    if (!r || r.valido !== true) return naoAchou(res);
    const saida = {};
    for (const k of CHAVES_VALIDACAO) saida[k] = r[k] ?? null;
    saida.valido = true;
    // Selo (A08): só true/false/null saem; hashPrefixo só no formato de 16 hex em grupos; e, nos
    // prefixos que sempre nascem selados, "sem selo" é false — vale para os validadores de
    // todas as fatias, mesmo que algum devolva null por atalho.
    saida.integro = r.integro === true ? true : r.integro === false ? false : null;
    if (typeof saida.hashPrefixo !== 'string' || !HASH_PREFIXO_RE.test(saida.hashPrefixo)) saida.hashPrefixo = null;
    if (saida.integro !== true && saida.hashPrefixo === null && PREFIXOS_SELO_OBRIGATORIO.has(codigo.slice(0, 3))) saida.integro = false;
    saida.detalhes = limparDetalhes(r.detalhes ?? {});
    if (typeof saida.iniciais !== 'string' || !/^(\p{Lu}\.)( \p{Lu}\.)?$/u.test(saida.iniciais)) saida.iniciais = '';
    saida.emissor = 'Complexo DMC';
    res.json(saida);
  });

  publico.post('/validar/:codigo/conferir', limConferir, async (req, res) => {
    const codigo = normalizarCodigo(req.params.codigo);
    if (!codigoValido(codigo)) return naoAchou(res);
    const corpo = ehObjetoPlano(req.body) ? req.body : {};
    const nome = lerTexto(corpo, 'nome', { min: 2, max: 200, obrigatorio: true });
    const v = validadorDoCodigo(servicos, codigo);
    if (!v || typeof v.nomeTitular !== 'function') return naoAchou(res);
    const titular = await v.nomeTitular(codigo);
    if (!titular) return naoAchou(res);
    res.json({ confere: normalizarNome(nome) === normalizarNome(titular) });
  });

  return { aluno, admin, publico };
}

export default async function montar(ctx) {
  registrarIndices(INDICES_CERTIFICACAO);
  const { comum, servicos } = ctx;
  const assinador = () => servicos.tentar('assinador') || comum.assinador || null;
  const emissor = criarServicoDeclaracoes({ repo: comum.repo, assinador, agora: comum.agora, garantia: comum.garantia });
  servicos.registrar('declaracoes.emitir', emissor.emitir);

  const aposentados = lerKidsAposentados(process.env);
  if (aposentados.ignorados > 0) {
    try { (comum.log?.warn || comum.log?.error || console.warn).call(comum.log || console, `[portal] PORTAL_SELO_KIDS_APOSENTADOS: ${aposentados.ignorados} item(ns) fora do formato de 8 hex ignorado(s)`); } catch { /* nada */ }
  }
  const { dmc, dec } = criarValidadores({ repo: comum.repo, assinador, kidsAposentados: aposentados.kids });
  servicos.adicionar('validador', dmc);
  servicos.adicionar('validador', dec);

  servicos.adicionar('exportador', {
    dominio: 'certificados',
    async exportar(userId) {
      const docs = await comum.repo('certificados').find({ userId: String(userId) }).toArray();
      return docs.map(c => ({ codigo: c.codigo, cursoId: c.cursoId, tituloCurso: c.tituloCurso, nomeAluno: c.nomeAluno, cargaHoraria: c.cargaHoraria, emitidoEm: iso(c.emitidoEm), regra: c.regra ?? null, nomeOrigem: c.nomeOrigem ?? null }));
    }
  });
  servicos.adicionar('exportador', {
    dominio: 'declaracoes',
    async exportar(userId) {
      const docs = await comum.repo('declaracoes').find({ userId: String(userId) }).toArray();
      return docs.map(d => ({ codigo: d.codigo, tipo: d.tipo, rotulo: ROTULOS_DECLARACAO[d.tipo] || 'Declaração', emitidaEm: iso(d.emitidaEm), revogada: !!d.revogada, dados: d.dados }));
    }
  });
  servicos.adicionar('cascata', {
    dominio: 'certificacao',
    async bloqueios(alvo) {
      if (!alvo || alvo.tipo !== 'curso') return 0;
      const id = String(alvo.id);
      const [c, d] = await Promise.all([
        comum.repo('certificados').countDocuments({ cursoId: id }),
        comum.repo('declaracoes').countDocuments({ cursoId: id })
      ]);
      return c + d;
    },
    async apagar() { /* certificados e declarações nunca são apagados em cascata (bloqueiam) */ }
  });

  const rotas = criarRotaDeclaracoes({
    repo: comum.repo, servicos, auditoria: comum.auditoria, emissor, contador: comum.contador, notificacoes: comum.notificacoes,
    agora: comum.agora, log: comum.log, criarThrottle: comum.throttle
  });
  ctx.rotas.aluno.use(rotas.aluno);
  ctx.rotas.admin.use(rotas.admin);
  ctx.rotas.publico.use(rotas.publico);
}

