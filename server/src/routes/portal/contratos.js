// =============================================================
// COMPLEXO DMC · Portal — contratos com assinatura eletrônica simples nativa
// PORTAL-API §6.8.4, §3.3, §3.4 (contrato.*), §3.5, §4.4
// (secretaria.temContratoAssinado, contratos.situacaoPorMatricula,
// validador CTR, aviso contrato-pendente), §4.7 (selo) · índice §8.1
// (F4b), §8.5, D-03, D-78, CEO-6/E3 · dono: F4b.
//
//   /api/portal/me/contratos[...]      (titular: lista, PDF, assinar, comprovante)
//   /api/portal/admin/contratos[...]   (só coordenação)
//
// O contrato é anexado à matrícula: a F4b LÊ a matrícula por
// `secretaria.matriculaPorId` e grava `matriculas.contratoId` SÓ por
// `secretaria.vincularContrato` (F4a, D-78). Sem esses serviços,
// POST /portal/admin/contratos responde 503 e nada é gravado.
// Assinatura: aceite autenticado (sessão + senha atual + TOTP quando o
// 2FA está ativo), relógio do servidor, SHA-256 do PDF aberto, IP
// truncado, user-agent, selo HMAC (`assinador`, F0m) e código CTR de
// verificação pública sem dado pessoal. Assinado = imutável.
// Webhook de provedor externo NÃO é montado (EXCEÇÃO 3).
// =============================================================
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import { ErroPortal } from '../../portal/erros.js';
import { lerTexto, lerBooleano, lerPagina, regexBusca, truncarIp, iniciais, ID_RE, ID_LEGADO_RE } from '../../portal/validacao.js';
import { lerCorpoBinario } from '../../portal/arquivos.js';
import { limitePersistente, conferirSenhaAtual } from '../../portal/limitador.js';
import { codigoVerificacao, CODIGO_VERIFICACAO_RE, duplicadoNoIndice } from '../../portal/codigos.js';
import { aadDoSegredo, verificarTotp } from '../../portal/totp.js';
import {
  INDICES_DOCUMENTACAO, STATUS_CONTRATO, ROTULO_CONTRATO_PUBLICO, ROTULOS_STATUS_CONTRATO, VERSAO_TEXTO_ACEITE, METODO_ASSINATURA,
  JANELA_REAUTENTICACAO_MS, DIA_MS, criarRepositorios, textoAceiteV1, camposSeloContrato, contratoParaAluno, contratoParaLista,
  contratoParaAdmin, comprovanteDe, hashPrefixo, urlValidacao, hex, paraObjectId, iso
} from '../../portal/documentacao/repositorios.js';

const MIB = 1024 * 1024;
const MIN_MS = 60 * 1000;
const LIMITE_ASSINAR = Object.freeze({ janelaMs: 15 * MIN_MS, max: 10 });
const STATUS_FILTRO = Object.freeze([...STATUS_CONTRATO, 'todos']);

const corpoDe = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && !Buffer.isBuffer(req.body) ? req.body : {});
const naoEncontrado = (texto = 'Contrato não encontrado.') => new ErroPortal(404, null, texto);
const campo = (nome, texto) => new ErroPortal(400, 'validacao', 'Confira os campos destacados.', { campos: { [nome]: texto } });

/** Instante em que o JWT da sessão foi emitido (o token já foi verificado pelo loadUser). */
function tokenEmitidoEm(req) {
  const h = typeof req.get === 'function' ? req.get('authorization') || '' : '';
  const [esquema, valor] = h.split(' ');
  if (!esquema || esquema.toLowerCase() !== 'bearer' || !valor) return null;
  try {
    const p = jwt.decode(valor.trim());
    return p && Number.isFinite(p.iat) ? new Date(p.iat * 1000) : null;
  } catch {
    return null;
  }
}

/** X-Motivo (UTF-8 percent-encoded, 5–300). */
function lerMotivoDoCabecalho(req) {
  const bruto = typeof req.get === 'function' ? req.get('x-motivo') : null;
  if (!bruto) return null;
  let s;
  try { s = decodeURIComponent(String(bruto)); } catch { throw campo('motivo', 'Motivo em formato inválido.'); }
  return lerTexto({ motivo: s }, 'motivo', { min: 5, max: 300 });
}

/**
 * Núcleo do domínio de contratos.
 * @param {{ repo, arquivos, auditoria, notificacoes?, servicos, assinador?, cifra?, contador, email?, checkSenha?,
 *   configPortal?, agora?, log? }} deps
 */
export function criarContratos({
  repo, arquivos, auditoria, notificacoes = null, servicos, assinador = null, cifra = null, contador, email = null, checkSenha = null,
  configPortal = {}, agora = () => new Date(), log = console
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarContratos: informe repo.');
  if (!arquivos) throw new TypeError('criarContratos: informe arquivos.');
  if (!auditoria) throw new TypeError('criarContratos: informe auditoria.');
  if (!servicos || typeof servicos.tentar !== 'function') throw new TypeError('criarContratos: informe servicos.');
  const R = criarRepositorios({ repo });
  const limiteBytes = Math.min(Number(configPortal.maxArquivoBytes) || 4 * MIB, 4 * MIB);
  const sel = () => (typeof assinador === 'function' ? assinador() : assinador) || servicos.tentar('assinador') || null;
  const cif = () => (typeof cifra === 'function' ? cifra() : cifra) || servicos.tentar('cifra') || null;
  const avisar = (texto, err) => { try { (log.warn || log.error).call(log, `[portal] contratos: ${texto}${err ? ` (${err?.name || 'erro'})` : ''}`); } catch { /* nada */ } };

  async function notificar(dados) {
    if (!notificacoes || typeof notificacoes.emitir !== 'function') return;
    try { await notificacoes.emitir(dados); } catch { /* emitir nunca lança */ }
  }

  async function pessoas(userIds) {
    const ids = [...new Set(userIds.map(String).filter(s => ID_RE.test(s)))];
    if (!ids.length) return new Map();
    const f = servicos.tentar('perfis.publicos');
    if (typeof f === 'function') {
      try { return await f(ids); } catch (err) { avisar('perfis.publicos falhou', err); }
    }
    const us = await R.users().find({ _id: { $in: ids.map(id => new ObjectId(id)) } }, { projection: { nome: 1, email: 1 } }).toArray();
    return new Map(us.map(u => [String(u._id), { id: String(u._id), nome: u.nome ?? null, email: u.email ?? null }]));
  }

  async function doTitular(req, id, { disponivel = true } = {}) {
    const oid = paraObjectId(id);
    if (!oid) throw naoEncontrado();
    const c = await R.contratos().findOne({ _id: oid, userId: String(req.user._id) });
    if (!c || (disponivel && !c.disponivelEm)) throw naoEncontrado();
    return c;
  }

  async function porId(id) {
    const oid = paraObjectId(id);
    if (!oid) throw naoEncontrado();
    const c = await R.contratos().findOne({ _id: oid });
    if (!c) throw naoEncontrado();
    return c;
  }

  const lerPdf = c => (c && c.arquivoId ? arquivos.ler(c.arquivoId, { contexto: 'contrato', 'ref.entidadeId': hex(c._id) }) : null);

  // ---------------------------------------------------------------
  // Titular
  // ---------------------------------------------------------------
  async function listaDoTitular(userId) {
    const docs = await R.contratos().find({ userId: String(userId), disponivelEm: { $ne: null } }).toArray();
    const ordem = { pendente: 0, assinado: 1, cancelado: 2 };
    docs.sort((a, b) => (ordem[a.status] - ordem[b.status]) || (new Date(b.disponivelEm) - new Date(a.disponivelEm)));
    const itens = docs.map(contratoParaAluno);
    return { pendentes: itens.filter(i => i.status === 'pendente').length, itens };
  }

  async function marcarVisualizado(req, c) {
    if (c.visualizadoEm) return;
    const em = agora();
    const u = await R.contratos().updateOne({ _id: c._id, visualizadoEm: null }, { $set: { visualizadoEm: em } });
    if (u && u.modifiedCount === 1) {
      await auditoria.registrar({ acao: 'contrato.visualizado', entidade: { tipo: 'contrato', id: hex(c._id) }, alvoUserId: c.userId, cursoId: c.cursoId, extra: { sha256Pdf: c.sha256Pdf } }, req);
    }
  }

  /** Segundo fator de quem já está logado (mesma regra da reautenticação, API §6.1). */
  async function conferirTotp(req, codigoBruto) {
    const codigo = typeof codigoBruto === 'string' || typeof codigoBruto === 'number' ? String(codigoBruto).replace(/\s/g, '') : '';
    if (!/^\d{6}$/.test(codigo)) throw campo('codigo', 'Digite o código de 6 dígitos do aplicativo.');
    const userId = String(req.user._id);
    const doc = await repo('auth_2fa').findOne({ userId, ativo: true });
    const c = cif();
    if (!doc || !c) throw new ErroPortal(409, '2fa-indisponivel');
    let segredo;
    try { segredo = c.decifrar(doc.segredo, 'totp', aadDoSegredo(userId)).texto; } catch { throw new ErroPortal(409, '2fa-indisponivel'); }
    const ultimo = Number.isFinite(doc.ultimoPasso) ? doc.ultimoPasso : null;
    const passo = verificarTotp(segredo, codigo, { agoraMs: agora().getTime(), ultimoPasso: ultimo });
    if (passo === null) throw campo('codigo', 'Código inválido.');
    const u = await repo('auth_2fa').updateOne({ _id: doc._id, ultimoPasso: ultimo }, { $set: { ultimoPasso: passo } });
    if (!u || u.modifiedCount !== 1) throw campo('codigo', 'Código inválido.');
  }

  /** POST /me/contratos/:id/assinar — validações NESTA ordem (API §6.8.4). */
  async function assinar(req, id, corpo) {
    // 1. dono e disponível
    const c = await doTitular(req, id);
    // 2. pendente
    if (c.status !== 'pendente') throw new ErroPortal(409, 'contrato-nao-pendente');
    // 3. aberto antes
    if (!c.visualizadoEm) throw new ErroPortal(409, 'abra-o-contrato-antes');
    // 4. o PDF aberto é o atual
    if (corpo.sha256Pdf !== undefined && corpo.sha256Pdf !== null && typeof corpo.sha256Pdf !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { sha256Pdf: 'Formato inválido.' } });
    const sha = typeof corpo.sha256Pdf === 'string' ? corpo.sha256Pdf.trim().toLowerCase() : '';
    if (!sha || !c.sha256Pdf || sha !== String(c.sha256Pdf).toLowerCase()) throw new ErroPortal(409, 'contrato-alterado');
    // 5. aceite explícito
    if (corpo.aceite !== true) throw campo('aceite', 'Marque “Li e concordo com os termos deste contrato”.');
    // 6. credencial redefinida pela coordenação nas últimas 72 h
    const redef = req.user.credencialRedefinidaPelaCoordenacaoEm ? new Date(req.user.credencialRedefinidaPelaCoordenacaoEm) : null;
    if (redef && agora().getTime() - redef.getTime() < JANELA_REAUTENTICACAO_MS) throw new ErroPortal(409, 'reautenticacao-necessaria');
    // 7. senha atual (contador compartilhado, §4.16)
    if (corpo.senha !== undefined && corpo.senha !== null && typeof corpo.senha !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { senha: 'Formato inválido.' } });
    if (typeof corpo.senha !== 'string' || !corpo.senha) throw campo('senha', 'Digite a sua senha.');
    const certa = await conferirSenhaAtual(req, corpo.senha, { contador, auditoria, email, repo, agora, log, ...(checkSenha ? { checkSenha } : {}) });
    if (!certa) throw campo('senha', 'Senha incorreta.');
    // 8. segundo fator, quando ativo
    const fatores = ['sessao', 'senha'];
    if (req.user.doisFatoresAtivo === true) {
      await conferirTotp(req, corpo.codigo);
      fatores.push('totp');
    }
    // 9. cadastro (nome de registro e CPF ou passaporte)
    const identificar = servicos.tentar('perfis.identificacao');
    if (typeof identificar !== 'function') throw new ErroPortal(503, 'servico-indisponivel');
    const ident = await identificar(String(req.user._id));
    const faltando = [];
    if (!ident?.nomeRegistro) faltando.push('nomeRegistro');
    if (!ident?.documento?.numero) faltando.push('documento');
    if (faltando.length) {
      throw new ErroPortal(409, 'cadastro-incompleto', 'Complete seu cadastro antes de assinar: nome de registro e CPF ou passaporte.', { faltando });
    }
    const s = sel();
    if (!s || typeof s.assinar !== 'function') throw new ErroPortal(503, 'servico-indisponivel');

    const em = agora();
    const assinaturaBase = {
      metodo: METODO_ASSINATURA, em, userId: String(req.user._id),
      identificacaoNoAto: { nomeRegistro: ident.nomeRegistro, documento: { tipo: ident.documento.tipo, numero: String(ident.documento.numero) }, email: ident.email ?? req.user.email ?? null },
      sha256Pdf: String(c.sha256Pdf), textoAceite: textoAceiteV1(c.titulo, c.sha256Pdf), versaoTexto: VERSAO_TEXTO_ACEITE, fatores,
      ipTruncado: truncarIp(req.ip) ?? null,
      userAgent: String((typeof req.get === 'function' ? req.get('user-agent') : '') || '').slice(0, 300),
      tokenEmitidoEm: tokenEmitidoEm(req),
      senhaDefinidaEm: req.user.senhaAlteradaEm ? new Date(req.user.senhaAlteradaEm) : null,
      origemSenha: req.user.senhaOrigem === 'apos_temporaria' ? 'apos_temporaria' : 'titular',
      credencialRedefinidaPelaCoordenacaoEm: redef,
      emailVerificado: !!req.user.emailVerificadoEm
    };
    let ultimoErro = null;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const codigo = codigoVerificacao('CTR');
      const selo = s.assinar('contrato', camposSeloContrato({ _id: c._id, codigoVerificacao: codigo, assinatura: assinaturaBase }));
      const assinatura = { ...assinaturaBase, hash: selo.hash, kid: selo.kid };
      try {
        await auditoria.executar({
          acao: 'contrato.assinado', entidade: { tipo: 'contrato', id: hex(c._id) }, alvoUserId: c.userId, cursoId: c.cursoId,
          mudancas: [{ campo: 'status', de: 'pendente', para: 'assinado' }],
          extra: { codigoVerificacao: codigo, sha256Pdf: c.sha256Pdf, fatores, matriculaNumero: c.matriculaNumero }
        }, req, async () => {
          const u = await R.contratos().updateOne(
            { _id: c._id, status: 'pendente', versao: c.versao, sha256Pdf: c.sha256Pdf },
            { $set: { status: 'assinado', assinatura, codigoVerificacao: codigo }, $inc: { versao: 1 } }
          );
          if (!u || u.modifiedCount !== 1) {
            const agoraDoc = await R.contratos().findOne({ _id: c._id }, { projection: { status: 1, sha256Pdf: 1 } });
            if (agoraDoc && agoraDoc.status !== 'pendente') throw new ErroPortal(409, 'contrato-nao-pendente');
            throw new ErroPortal(409, 'contrato-alterado');
          }
        });
        return { status: 'assinado', assinadoEm: iso(em), codigoVerificacao: codigo, hashPrefixo: hashPrefixo(selo.hash), urlValidacao: urlValidacao(codigo) };
      } catch (err) {
        if (duplicadoNoIndice(err, { indice: 'uq_ctr_codigo', campo: 'codigoVerificacao' })) { ultimoErro = err; continue; }
        throw err;
      }
    }
    throw ultimoErro;
  }

  // ---------------------------------------------------------------
  // Coordenação
  // ---------------------------------------------------------------
  async function lista(query) {
    const status = typeof query.status === 'string' && STATUS_FILTRO.includes(query.status) ? query.status : 'todos';
    const cursoId = typeof query.cursoId === 'string' && ID_LEGADO_RE.test(query.cursoId) ? query.cursoId : null;
    const termos = typeof query.q === 'string' && query.q.trim() ? regexBusca(query.q) : null;
    const { pagina, porPagina, pular } = lerPagina(query, { porPaginaPadrao: 50 });
    // Acréscimo (como o ?userId= da F4a, DC-73): aba Contratos do aluno no backoffice.
    const userId = typeof query.userId === 'string' && ID_RE.test(query.userId) ? query.userId : null;
    if (query.userId !== undefined && !userId) return { itens: [], pagina, porPagina, total: 0, totalPaginas: 0, contagem: { pendente: 0, assinado: 0, cancelado: 0 } };
    const filtro = { ...(status === 'todos' ? {} : { status }), ...(cursoId ? { cursoId } : {}), ...(userId ? { userId } : {}) };
    if (termos) {
      const us = await R.users().find({ $and: termos.map(t => ({ $or: [{ nome: { $regex: t.source, $options: 'i' } }, { email: { $regex: t.source, $options: 'i' } }] })) }, { projection: { _id: 1 } }).limit(500).toArray();
      const ou = [{ userId: { $in: us.map(u => String(u._id)) } }];
      for (const t of termos) ou.push({ matriculaNumero: { $regex: t.source, $options: 'i' } }, { codigoVerificacao: { $regex: t.source, $options: 'i' } });
      filtro.$or = ou;
    }
    const total = await R.contratos().countDocuments(filtro);
    const docs = await R.contratos().find(filtro).sort({ criadoEm: -1 }).skip(pular).limit(porPagina).toArray();
    const p = await pessoas(docs.map(d => d.userId));
    const contagem = {};
    for (const s of STATUS_CONTRATO) contagem[s] = await R.contratos().countDocuments({ ...(cursoId ? { cursoId } : {}), ...(userId ? { userId } : {}), status: s });
    return {
      itens: docs.map(d => contratoParaLista(d, { aluno: p.get(String(d.userId)) || null })),
      pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina), contagem
    };
  }

  async function detalhe(id) {
    const c = await porId(id);
    const p = await pessoas([c.userId]);
    return contratoParaAdmin(c, { aluno: p.get(String(c.userId)) || null });
  }

  async function criar(req, corpo) {
    const porMatricula = servicos.tentar('secretaria.matriculaPorId');
    const vincular = servicos.tentar('secretaria.vincularContrato');
    if (typeof porMatricula !== 'function' || typeof vincular !== 'function') throw new ErroPortal(503, 'servico-indisponivel');
    if (corpo.matriculaId !== undefined && typeof corpo.matriculaId !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { matriculaId: 'Formato inválido.' } });
    const titulo = lerTexto(corpo, 'titulo', { min: 3, max: 140, obrigatorio: true });
    const confirmar = lerBooleano(corpo.confirmarSemVerificacao, 'confirmarSemVerificacao') === true;
    const motivo = confirmar ? lerTexto(corpo, 'motivo', { min: 10, max: 500, obrigatorio: true, multilinha: true }) : null;
    const mid = typeof corpo.matriculaId === 'string' && ID_RE.test(corpo.matriculaId) ? corpo.matriculaId : null;
    if (!mid) throw new ErroPortal(404, null, 'Matrícula não encontrada.', { campos: { matriculaId: 'Matrícula não encontrada.' } });
    const m = await porMatricula(mid);
    if (!m) throw new ErroPortal(404, null, 'Matrícula não encontrada.', { campos: { matriculaId: 'Matrícula não encontrada.' } });
    if (m.status === 'cancelada') throw new ErroPortal(409, 'matricula-nao-ativa', 'A matrícula está cancelada.');
    const moid = new ObjectId(hex(m._id) || mid);
    const pendente = await R.contratos().findOne({ matriculaId: moid, status: 'pendente' }, { projection: { _id: 1 } });
    if (pendente) throw new ErroPortal(409, 'contrato-pendente-existe', undefined, { contratoId: hex(pendente._id) });
    const aluno = await R.users().findOne({ _id: new ObjectId(String(m.userId)) }, { projection: { emailVerificadoEm: 1, createdAt: 1, ultimoLoginEm: 1 } });
    if (!aluno) throw new ErroPortal(404, null, 'Aluno não encontrado.');
    if (!aluno.emailVerificadoEm && !confirmar) {
      throw new ErroPortal(409, 'email-nao-verificado', undefined, { conta: { criadaEm: iso(aluno.createdAt), ultimoLoginEm: iso(aluno.ultimoLoginEm) } });
    }
    const curso = await R.cursos().findOne({ _id: String(m.cursoId) }, { projection: { titulo: 1 } });
    const em = agora();
    const id = new ObjectId();
    const doc = {
      _id: id, userId: String(m.userId), matriculaId: moid, matriculaNumero: m.numero ?? null, cursoId: String(m.cursoId), cursoTitulo: curso?.titulo ?? null,
      titulo, arquivoId: null, sha256Pdf: null, tamanho: null, disponivelEm: null, status: 'pendente', visualizadoEm: null,
      substituicoes: [], assinatura: null, codigoVerificacao: null, cancelamento: null,
      provedor: { nome: 'nativo', idExterno: null, status: null, eventos: [] }, versao: 1, criadoEm: em, criadoPor: String(req.user._id)
    };
    await auditoria.executar({
      acao: 'contrato.criado', entidade: { tipo: 'contrato', id: hex(id) }, alvoUserId: doc.userId, cursoId: doc.cursoId,
      motivo, extra: { matriculaNumero: doc.matriculaNumero, titulo, ...(confirmar && !aluno.emailVerificadoEm ? { semVerificacao: true } : {}) }
    }, req, async () => {
      await R.contratos().insertOne(doc);
      try {
        await vincular(hex(moid), hex(id), { req });
      } catch (err) {
        try { await R.contratos().deleteOne({ _id: id }); } catch (e) { avisar('contrato sem vínculo não removido', e); }
        throw err;
      }
    });
    return { id: hex(id), contrato: contratoParaAdmin(doc, { aluno: null }) };
  }

  async function anexarPdf(req, id) {
    const c = await porId(id);
    if (c.status !== 'pendente') throw new ErroPortal(409, 'contrato-nao-pendente');
    const substituicao = !!c.arquivoId;
    const motivo = lerMotivoDoCabecalho(req);
    if (substituicao && !motivo) throw campo('motivo', 'Informe o motivo da substituição (5 a 300 caracteres).');
    const { buf, tipo } = req.arquivo;
    const em = agora();
    const arq = await arquivos.salvar({
      contexto: 'contrato', donoUserId: c.userId, ref: { entidadeId: hex(c._id) }, buf, tipo,
      nomeDownload: `contrato-${c.matriculaNumero || hex(c._id)}`, por: String(req.user._id)
    });
    const disponivelEm = c.disponivelEm || em;
    try {
      await auditoria.executar({
        acao: substituicao ? 'contrato.substituido' : 'contrato.arquivo_anexado', entidade: { tipo: 'contrato', id: hex(c._id) },
        alvoUserId: c.userId, cursoId: c.cursoId, motivo: motivo || null,
        mudancas: [{ campo: 'sha256Pdf', de: c.sha256Pdf ?? null, para: arq.sha256 }], extra: { tamanho: arq.tamanho }
      }, req, async () => {
        const set = { arquivoId: new ObjectId(arq.id), sha256Pdf: arq.sha256, tamanho: arq.tamanho, disponivelEm, visualizadoEm: null };
        const upd = { $set: set, $inc: { versao: 1 } };
        if (substituicao) upd.$push = { substituicoes: { em, por: String(req.user._id), sha256Anterior: c.sha256Pdf, sha256Novo: arq.sha256, motivo } };
        const u = await R.contratos().updateOne({ _id: c._id, status: 'pendente', versao: c.versao }, upd);
        if (!u || u.modifiedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
      });
    } catch (err) {
      try { await arquivos.apagar(arq.id); } catch (e) { avisar('binário órfão não apagado', e); }
      throw err;
    }
    if (substituicao && c.arquivoId) {
      try { await arquivos.apagar(c.arquivoId); } catch (e) { avisar('PDF anterior não apagado', e); }
    }
    if (!substituicao) {
      await notificar({
        userIds: [c.userId], tipo: 'contrato.disponivel', titulo: 'Contrato disponível para assinatura',
        texto: `${c.titulo} · matrícula ${c.matriculaNumero || '—'}. Abra, leia e assine pela plataforma.`,
        link: `contrato.html?id=${hex(c._id)}`, entidade: { tipo: 'contrato', id: hex(c._id) }, chave: `contrato:${hex(c._id)}:disponivel`
      });
    }
    return { sha256Pdf: arq.sha256, tamanho: arq.tamanho, disponivelEm: iso(disponivelEm), substituido: substituicao };
  }

  async function cancelar(req, id, corpo) {
    const motivo = lerTexto(corpo, 'motivo', { min: 10, max: 500, obrigatorio: true, multilinha: true });
    const c = await porId(id);
    if (c.status === 'cancelado') throw new ErroPortal(409, 'transicao-invalida', 'Este contrato já está cancelado.');
    const em = agora();
    const cancelamento = { em, por: String(req.user._id), motivo };
    await auditoria.executar({
      acao: 'contrato.cancelado', entidade: { tipo: 'contrato', id: hex(c._id) }, alvoUserId: c.userId, cursoId: c.cursoId, motivo,
      mudancas: [{ campo: 'status', de: c.status, para: 'cancelado' }], extra: { distrato: c.status === 'assinado', codigoVerificacao: c.codigoVerificacao ?? null }
    }, req, async () => {
      const u = await R.contratos().updateOne({ _id: c._id, status: c.status, versao: c.versao }, { $set: { status: 'cancelado', cancelamento }, $inc: { versao: 1 } });
      if (!u || u.modifiedCount !== 1) throw new ErroPortal(409, 'conflito-versao');
    });
    if (c.disponivelEm) {
      await notificar({
        userIds: [c.userId], tipo: 'contrato.cancelado', titulo: 'Contrato cancelado',
        texto: `${c.titulo} · matrícula ${c.matriculaNumero || '—'} foi cancelado pela coordenação.`, link: 'contratos.html',
        entidade: { tipo: 'contrato', id: hex(c._id) }
      });
    }
    return detalhe(hex(c._id));
  }

  // ---------------------------------------------------------------
  // Serviços de nome fixo e grupos
  // ---------------------------------------------------------------
  /** secretaria.temContratoAssinado (F0t: trava do perfil). Distrato preserva a assinatura → continua true. */
  async function temContratoAssinado(userId) {
    if (!userId) return false;
    return (await R.contratos().countDocuments({ userId: String(userId), assinatura: { $ne: null } })) > 0;
  }

  /** contratos.situacaoPorMatricula (F4a, D-78) → Map<matriculaId, { id, status }>; o vigente (não cancelado) vence. */
  async function situacaoPorMatricula(matriculaIds) {
    const ids = [...new Set((Array.isArray(matriculaIds) ? matriculaIds : []).map(v => hex(v)).filter(v => v && ID_RE.test(v)))];
    const mapa = new Map();
    if (!ids.length) return mapa;
    const docs = await R.contratos().find({ matriculaId: { $in: ids.map(id => new ObjectId(id)) } }, { projection: { matriculaId: 1, status: 1, criadoEm: 1 } }).toArray();
    docs.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
    for (const d of docs) {
      const k = hex(d.matriculaId);
      const atual = mapa.get(k);
      if (!atual || (atual.status === 'cancelado' && d.status !== 'cancelado')) mapa.set(k, { id: hex(d._id), status: d.status });
    }
    return mapa;
  }

  const validador = {
    prefixo: 'CTR',
    async validar(codigo) {
      if (!CODIGO_VERIFICACAO_RE.test(String(codigo)) || !String(codigo).startsWith('CTR-')) return null;
      const c = await R.contratos().findOne({ codigoVerificacao: String(codigo) });
      if (!c || !c.assinatura) return null;
      const s = sel();
      const v = c.assinatura.hash && c.assinatura.kid && s ? s.verificar('contrato', camposSeloContrato(c), c.assinatura.hash, c.assinatura.kid) : null;
      return {
        valido: true, codigo: c.codigoVerificacao, tipo: 'contrato', rotulo: ROTULO_CONTRATO_PUBLICO, emitidoEm: iso(c.assinatura.em),
        emissor: 'Complexo DMC', iniciais: iniciais(c.assinatura.identificacaoNoAto?.nomeRegistro || ''),
        integro: v === undefined ? null : v, situacao: c.status === 'cancelado' ? 'cancelado' : 'valido',
        hashPrefixo: hashPrefixo(c.assinatura.hash),
        detalhes: { rotulo: ROTULO_CONTRATO_PUBLICO, assinadoEm: iso(c.assinatura.em), canceladoEm: c.cancelamento ? iso(c.cancelamento.em) : null, sha256Pdf: c.assinatura.sha256Pdf }
      };
    },
    async nomeTitular(codigo) {
      const c = await R.contratos().findOne({ codigoVerificacao: String(codigo) }, { projection: { assinatura: 1 } });
      return c?.assinatura?.identificacaoNoAto?.nomeRegistro ?? null;
    }
  };

  const aviso = {
    id: 'contrato-pendente',
    async gerar(req) {
      if (!req?.user?._id) return [];
      const docs = await R.contratos().find({ userId: String(req.user._id), status: 'pendente', disponivelEm: { $ne: null } }, { projection: { _id: 1 } }).toArray();
      const n = docs.length;
      if (!n) return [];
      return [{
        id: 'contrato-pendente', tom: 'aviso',
        texto: n === 1 ? 'Há um contrato aguardando a sua assinatura.' : `Há ${n} contratos aguardando a sua assinatura.`,
        href: n === 1 ? `contrato.html?id=${hex(docs[0]._id)}` : 'contratos.html', rotulo: n === 1 ? 'Ver contrato' : 'Ver contratos',
        dispensavel: false, contador: n
      }];
    }
  };

  const painel = {
    bloco: 'contratos',
    chaves: ['pendentes', 'pendentesHaMaisDe7d', 'assinados30d'],
    papeis: ['admin'],
    async contar() {
      const t = agora().getTime();
      const [pendentes, antigos, assinados] = await Promise.all([
        R.contratos().countDocuments({ status: 'pendente', disponivelEm: { $ne: null } }),
        R.contratos().countDocuments({ status: 'pendente', disponivelEm: { $ne: null, $lt: new Date(t - 7 * DIA_MS) } }),
        R.contratos().countDocuments({ status: 'assinado', 'assinatura.em': { $gte: new Date(t - 30 * DIA_MS) } })
      ]);
      return { pendentes, pendentesHaMaisDe7d: antigos, assinados30d: assinados };
    }
  };

  const relatorio = {
    id: 'contratos',
    titulo: 'Contratos',
    papeis: ['admin'],
    filtros: [{ chave: 'cursoId', tipo: 'curso' }, { chave: 'status', tipo: 'enum', opcoes: [...STATUS_FILTRO] }],
    colunas: [
      { chave: 'aluno', rotulo: 'Aluno', tipo: 'texto' },
      { chave: 'email', rotulo: 'E-mail', tipo: 'texto', somenteAdmin: true },
      { chave: 'curso', rotulo: 'Curso', tipo: 'texto' },
      { chave: 'matriculaNumero', rotulo: 'Nº matrícula', tipo: 'texto' },
      { chave: 'titulo', rotulo: 'Título', tipo: 'texto' },
      { chave: 'status', rotulo: 'Situação', tipo: 'status' },
      { chave: 'disponivelEm', rotulo: 'Disponível em', tipo: 'dataHora' },
      { chave: 'visualizadoEm', rotulo: 'Visualizado em', tipo: 'dataHora' },
      { chave: 'assinadoEm', rotulo: 'Assinado em', tipo: 'dataHora' },
      { chave: 'codigoVerificacao', rotulo: 'Código de verificação', tipo: 'texto' },
      { chave: 'canceladoEm', rotulo: 'Cancelado em', tipo: 'dataHora' }
    ],
    async consultar(_req, filtros = {}, { limite = 5000 } = {}) {
      const cursoId = typeof filtros.cursoId === 'string' && ID_LEGADO_RE.test(filtros.cursoId) ? filtros.cursoId : null;
      const status = typeof filtros.status === 'string' && STATUS_CONTRATO.includes(filtros.status) ? filtros.status : null;
      const docs = await R.contratos().find({ ...(cursoId ? { cursoId } : {}), ...(status ? { status } : {}) }).sort({ criadoEm: -1 }).limit(limite).toArray();
      const p = await pessoas(docs.map(d => d.userId));
      return docs.map(d => ({
        aluno: p.get(String(d.userId))?.nome ?? null, email: p.get(String(d.userId))?.email ?? null, curso: d.cursoTitulo ?? null,
        matriculaNumero: d.matriculaNumero ?? null, titulo: d.titulo, status: ROTULOS_STATUS_CONTRATO[d.status] || d.status,
        disponivelEm: iso(d.disponivelEm), visualizadoEm: iso(d.visualizadoEm), assinadoEm: d.assinatura ? iso(d.assinatura.em) : null,
        codigoVerificacao: d.codigoVerificacao ?? null, canceladoEm: d.cancelamento ? iso(d.cancelamento.em) : null
      }));
    }
  };

  const exportador = {
    dominio: 'contratos',
    async exportar(userId) {
      const docs = await R.contratos().find({ userId: String(userId), disponivelEm: { $ne: null } }).sort({ criadoEm: 1 }).toArray();
      return { contratos: docs.map(d => ({ ...contratoParaAluno(d), textoAceite: d.assinatura?.textoAceite ?? null, evidencias: d.assinatura ? comprovanteDe(d) : null })) };
    }
  };

  return Object.freeze({
    limiteBytes, listaDoTitular, doTitular, porId, lerPdf, marcarVisualizado, assinar, lista, detalhe, criar, anexarPdf, cancelar,
    temContratoAssinado, situacaoPorMatricula, validador, aviso, painel, relatorio, exportador, R
  });
}

/**
 * Fábrica pura das rotas.
 * @param {{ contratos: object, contador?: object, arquivos: object }} deps
 * @returns {{ aluno: Router, admin: Router }}
 */
export function criarRotasContratos({ contratos, contador = null, arquivos } = {}) {
  if (!contratos) throw new Error('criarRotasContratos: informe contratos.');
  if (!arquivos) throw new Error('criarRotasContratos: informe arquivos.');
  const C = contratos;
  const aluno = Router();
  const admin = Router();
  const semLimite = (_req, _res, next) => next();
  const limiteAssinar = contador
    ? limitePersistente(contador, { ...LIMITE_ASSINAR, chave: req => `ctr-assinar:u:${String(req.user._id)}`, mensagem: 'Muitas tentativas de assinatura. Aguarde 15 minutos e tente de novo.' })
    : semLimite;
  const corpoPdf = lerCorpoBinario({ limiteBytes: C.limiteBytes, tipos: ['pdf'] });
  const nomePdf = c => `contrato-${c.matriculaNumero || hex(c._id)}.pdf`;

  // ----------------------------- titular -----------------------------
  aluno.get('/me/contratos', async (req, res) => {
    res.json(await C.listaDoTitular(String(req.user._id)));
  });

  aluno.get('/me/contratos/:id/arquivo', async (req, res) => {
    const c = await C.doTitular(req, req.params.id);
    const arq = await C.lerPdf(c);
    if (!arq) throw naoEncontrado('Arquivo não encontrado.');
    await C.marcarVisualizado(req, c);
    arquivos.enviar(res, arq, { nome: nomePdf(c) });
  });

  aluno.post('/me/contratos/:id/assinar', limiteAssinar, async (req, res) => {
    res.json(await C.assinar(req, req.params.id, corpoDe(req)));
  });

  aluno.get('/me/contratos/:id/comprovante', async (req, res) => {
    const c = await C.doTitular(req, req.params.id);
    if (!c.assinatura) throw new ErroPortal(409, null, 'Este contrato ainda não foi assinado.');
    res.json(comprovanteDe(c));
  });

  // ---------------------------- coordenação ----------------------------
  admin.get('/contratos', async (req, res) => {
    res.json(await C.lista(req.query || {}));
  });

  admin.post('/contratos', async (req, res) => {
    res.status(201).json(await C.criar(req, corpoDe(req)));
  });

  admin.get('/contratos/:id', async (req, res) => {
    res.json({ contrato: await C.detalhe(req.params.id) });
  });

  admin.get('/contratos/:id/comprovante', async (req, res) => {
    const c = await C.porId(req.params.id);
    if (!c.assinatura) throw new ErroPortal(409, null, 'Este contrato ainda não foi assinado.');
    res.json(comprovanteDe(c));
  });

  admin.get('/contratos/:id/arquivo', async (req, res) => {
    const c = await C.porId(req.params.id);
    const arq = await C.lerPdf(c);
    if (!arq) throw naoEncontrado('Arquivo não encontrado.');
    arquivos.enviar(res, arq, { nome: nomePdf(c) });
  });

  admin.post('/contratos/:id/arquivo', ...corpoPdf, async (req, res) => {
    res.json(await C.anexarPdf(req, req.params.id));
  });

  admin.post('/contratos/:id/cancelar', async (req, res) => {
    res.json({ contrato: await C.cancelar(req, req.params.id, corpoDe(req)) });
  });

  return { aluno, admin };
}

/** Montagem no agregador (API §5.1): síncrona no efeito, sem E/S. */
export default async function montar(ctx) {
  const { rotas, servicos, comum } = ctx;
  comum.registrarIndices(INDICES_DOCUMENTACAO);
  const contratos = criarContratos({
    repo: comum.repo, arquivos: comum.arquivos, auditoria: comum.auditoria, notificacoes: comum.notificacoes, servicos,
    assinador: () => comum.assinador, cifra: () => comum.cifra, contador: comum.contador, email: comum.email,
    checkSenha: comum.checkSenha, configPortal: comum.configPortal, agora: comum.agora, log: comum.log
  });
  servicos.registrar('secretaria.temContratoAssinado', contratos.temContratoAssinado);
  servicos.registrar('contratos.situacaoPorMatricula', contratos.situacaoPorMatricula);
  servicos.adicionar('validador', contratos.validador);
  servicos.adicionar('aviso', contratos.aviso);
  servicos.adicionar('painel', contratos.painel);
  servicos.adicionar('relatorio', contratos.relatorio);
  servicos.adicionar('exportador', contratos.exportador);
  const { aluno, admin } = criarRotasContratos({ contratos, contador: comum.contador, arquivos: comum.arquivos });
  rotas.aluno.use(aluno);
  rotas.admin.use(admin);
}

export { textoAceiteV1, VERSAO_TEXTO_ACEITE };
