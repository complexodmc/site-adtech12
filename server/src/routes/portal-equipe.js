// =============================================================
// COMPLEXO DMC · Portal — equipe, usuários e docências
// PORTAL-API §6.2 (e PUT …/usuarios/:userId/email de §6.3.2) · dono: F0t.
//
// Admin (/api/portal/admin/*): listar usuários, criar/promover professor ou
// coordenação (senha temporária de 72 h exibida UMA vez; só o hash é
// gravado; nunca vai por e-mail nem ao log), papel, senha temporária,
// redefinir 2FA, desativar/reativar, trocar e-mail, docências.
// Professor (/api/portal/professor/*): cursos que leciona, resumo e foto de
// aluno vinculado (4 campos; NUNCA CPF, RG, endereço ou documentos).
//
// Regra do e-mail verificado (§6.2): conta que existe SEM e-mail
// confirmado e é promovida perde a senha escolhida no signup (senha
// temporária nova, sessões derrubadas) — quem criou antes uma conta com o
// e-mail da equipe não herda o papel com a senha dele.
// Ações críticas exigem `reautenticacao` (senha + código do 2FA quando
// ativo); errada → 400 campos.senha/campos.codigo (nunca 401). Toda ação
// com * em §3.4 usa auditoria `executar` (falha → 503 e nada muda).
// =============================================================
import { ObjectId } from 'mongodb';
import { papelDe, PAPEIS } from '../portal/papeis.js';
import { ErroPortal, MENSAGENS } from '../portal/erros.js';
import { lerTexto, lerEnum, lerIdLegado, lerPagina, regexBusca, validarEmail, ID_RE } from '../portal/validacao.js';
import { senhaTemporaria as gerarSenhaTemporaria } from '../portal/codigos.js';
import { chaveUsuario } from '../portal/limitador.js';
import { registrarIndices } from '../portal/indices.js';
import { MODELOS } from '../portal/email.js';
import { calcularCompletude } from '../portal/perfis-leitura.js';
import { conferirReautenticacao, erroCampo, VALIDADE_SENHA_TEMPORARIA_MS, INDICES_AUTH } from './portal/auth-extra.js';

export const INDICES_EQUIPE = Object.freeze([
  { colecao: 'docencias', chave: { userId: 1, cursoId: 1, turmaId: 1 }, opcoes: { name: 'uq_docencias', unique: true } },
  { colecao: 'docencias', chave: { cursoId: 1 }, opcoes: { name: 'ix_docencias_curso' } }
]);
registrarIndices([...INDICES_EQUIPE, ...INDICES_AUTH.filter(s => s.colecao === 'users')]);

const iso = d => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);
const oid = s => new ObjectId(String(s));
const nomeDe = u => (typeof u?.nome === 'string' && u.nome.trim() ? u.nome : String(u?.email || '').split('@')[0]);

/** Visão da equipe sobre uma conta (nunca hash, segredo ou token). */
export function usuarioPublicoEquipe(u, { detalhe = false } = {}) {
  const out = {
    id: String(u._id),
    email: u.email,
    nome: nomeDe(u),
    papel: papelDe(u),
    criadoEm: iso(u.createdAt || u.criadoEm),
    ultimoLoginEm: iso(u.ultimoLoginEm),
    desativadoEm: iso(u.desativadoEm),
    doisFatoresAtivo: u.doisFatoresAtivo === true
  };
  if (detalhe) {
    out.senhaTemporaria = u.senhaTemporaria === true;
    out.emailVerificado = !!u.emailVerificadoEm;
  }
  return out;
}

function lerMotivo(corpo, { obrigatorio = true } = {}) {
  return lerTexto(corpo, 'motivo', { min: 10, max: 500, obrigatorio, multilinha: true });
}

function lerUserIdParam(req) {
  const id = req.params.userId;
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new ErroPortal(404, null, 'Usuário não encontrado.');
  return id;
}

/**
 * @param {{ repo, auditoria, email?, contador, configPortal, agora?, hashSenha, signToken?, throttle, cripto?,
 *   arquivos?, perfisPublicos?, acesso, capaUrl?, senhaTemporaria?: () => string, log? }} deps
 * @returns {{ admin: import('express').Router, professor: import('express').Router }} (os Routers recebidos)
 */
export function criarRotaEquipe(deps = {}) {
  const {
    repo, auditoria, email = null, contador, configPortal = {}, agora = () => new Date(), hashSenha, throttle,
    cripto = null, arquivos = null, perfisPublicos = null, acesso, capaUrl = () => '', senhaTemporaria = gerarSenhaTemporaria,
    admin, professor
  } = deps;
  if (typeof repo !== 'function') throw new TypeError('criarRotaEquipe: informe repo.');
  if (!auditoria) throw new TypeError('criarRotaEquipe: informe auditoria.');
  if (!contador) throw new TypeError('criarRotaEquipe: informe contador.');
  if (typeof hashSenha !== 'function') throw new TypeError('criarRotaEquipe: informe hashSenha.');
  if (!acesso) throw new TypeError('criarRotaEquipe: informe acesso.');
  if (!admin || !professor) throw new TypeError('criarRotaEquipe: informe os Routers admin e professor.');

  const reaut = (req) => conferirReautenticacao(req, req.body?.reautenticacao, { repo, contador, auditoria, email, agora, ...(cripto ? { cripto } : {}) });
  const limCriar = throttle({ janelaMs: 60 * 60 * 1000, max: 30, chave: chaveUsuario, codigo: 'limite', mensagem: MENSAGENS.limite });
  const avisar = (u, modelo, dados = {}, para = null) => {
    const destino = para || u?.email;
    if (email && destino) email.enviarEmSegundoPlano({ para: destino, ...MODELOS[modelo]({ nome: u?.nome, ...dados }) });
  };

  async function buscarUsuario(userId) {
    return repo('users').findOne({ _id: oid(userId) });
  }

  async function docenciasDe(userIds) {
    const ids = [...new Set(userIds.map(String))];
    if (!ids.length) return new Map();
    const docs = await repo('docencias').find({ userId: { $in: ids } }).toArray();
    const cursoIds = [...new Set(docs.map(d => String(d.cursoId)))];
    const turmaIds = [...new Set(docs.map(d => d.turmaId).filter(Boolean).map(String))].filter(t => ID_RE.test(t));
    const [cursos, turmas] = await Promise.all([
      cursoIds.length ? repo('cursos').find({ _id: { $in: cursoIds } }, { projection: { titulo: 1 } }).toArray() : [],
      turmaIds.length ? repo('turmas').find({ _id: { $in: turmaIds.map(oid) } }, { projection: { codigo: 1 } }).toArray() : []
    ]);
    const tCurso = new Map(cursos.map(c => [String(c._id), c.titulo || null]));
    const tTurma = new Map(turmas.map(t => [String(t._id), t.codigo || null]));
    const mapa = new Map(ids.map(id => [id, []]));
    for (const d of docs) {
      const turmaId = d.turmaId ? String(d.turmaId) : null;
      mapa.get(String(d.userId))?.push({
        id: String(d._id), cursoId: String(d.cursoId), cursoTitulo: tCurso.get(String(d.cursoId)) ?? null,
        turmaId, turmaCodigo: turmaId ? (tTurma.get(turmaId) ?? null) : null
      });
    }
    return mapa;
  }

  async function contarAdmins() {
    return repo('users').countDocuments({ isAdmin: true, desativadoEm: null });
  }

  async function cursosExistentes(cursoIds) {
    if (!cursoIds.length) return [];
    const docs = await repo('cursos').find({ _id: { $in: cursoIds } }, { projection: { _id: 1 } }).toArray();
    const achados = new Set(docs.map(d => String(d._id)));
    const faltando = cursoIds.filter(c => !achados.has(c));
    if (faltando.length) throw new ErroPortal(404, null, 'Curso não encontrado.', { campos: { cursoIds: 'Curso não encontrado.' } });
    return cursoIds;
  }

  function lerCursoIds(valor) {
    if (valor === undefined || valor === null) return [];
    if (!Array.isArray(valor)) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { cursoIds: 'Formato inválido.' } });
    if (valor.length > 50) throw erroCampo('cursoIds', 'No máximo 50 cursos por vez.');
    const out = [];
    for (const v of valor) {
      const c = lerIdLegado(v);
      if (!c) throw erroCampo('cursoIds', 'Curso inválido.');
      if (!out.includes(c)) out.push(c);
    }
    return out;
  }

  /** Senha temporária nova: claro (exibido UMA vez) + campos a gravar. */
  async function novaSenhaTemporaria() {
    const clara = senhaTemporaria();
    const t = agora();
    const expiraEm = new Date(t.getTime() + VALIDADE_SENHA_TEMPORARIA_MS);
    return {
      clara, expiraEm,
      set: { senhaHash: await hashSenha(clara), senhaTemporaria: true, senhaTemporariaExpiraEm: expiraEm, credencialRedefinidaPelaCoordenacaoEm: t }
    };
  }

  async function criarDocenciasQueFaltam(userId, cursoIds, req) {
    const criadas = [];
    for (const cursoId of cursoIds) {
      const existe = await repo('docencias').findOne({ userId, cursoId, turmaId: null }, { projection: { _id: 1 } });
      if (existe) continue;
      const doc = { userId, cursoId, turmaId: null, criadoEm: agora(), criadoPor: String(req.user._id) };
      try {
        const r = await repo('docencias').insertOne(doc);
        criadas.push(String(r.insertedId));
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    }
    return criadas;
  }

  // ---------- GET /portal/admin/usuarios ----------
  admin.get('/usuarios', async (req, res) => {
    const q = req.query?.q;
    const filtro = {};
    if (q !== undefined && q !== '') {
      if (typeof q !== 'string') throw new ErroPortal(400, 'formato-invalido');
      if (q.trim().length < 3) throw erroCampo('q', 'Digite pelo menos 3 caracteres.');
      const termos = regexBusca(q);
      if (!termos) throw erroCampo('q', 'Busca inválida.');
      filtro.$and = termos.map(re => ({ $or: [{ email: re }, { nome: re }] }));
    }
    const papel = lerEnum(req.query?.papel, PAPEIS, 'papel');
    if (papel === 'admin') filtro.isAdmin = true;
    else if (papel === 'professor') { filtro.isAdmin = { $ne: true }; filtro.papel = 'professor'; }
    else if (papel === 'aluno') { filtro.isAdmin = { $ne: true }; filtro.papel = { $nin: ['professor'] }; }
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: 25 });
    const projecao = { senhaHash: 0 };
    const [itens, total] = await Promise.all([
      repo('users').find(filtro, { projection: projecao, sort: { nome: 1, _id: 1 }, skip: pular, limit: porPagina }).toArray(),
      repo('users').countDocuments(filtro)
    ]);
    res.json({ itens: itens.map(u => usuarioPublicoEquipe(u)), pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) });
  });

  // ---------- GET /portal/admin/usuarios/:userId ----------
  admin.get('/usuarios/:userId', async (req, res) => {
    const userId = lerUserIdParam(req);
    const u = await buscarUsuario(userId);
    if (!u) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    const [docs, perfil] = await Promise.all([docenciasDe([userId]), repo('perfis').findOne({ userId })]);
    const { completo, pct } = calcularCompletude(perfil, { email: u.email });
    res.json({ usuario: usuarioPublicoEquipe(u, { detalhe: true }), docencias: docs.get(userId) || [], perfil: { completo, pct } });
  });

  // ---------- GET /portal/admin/equipe ----------
  admin.get('/equipe', async (_req, res) => {
    const membros = await repo('users').find(
      { $or: [{ isAdmin: true }, { papel: 'professor' }] },
      { projection: { senhaHash: 0 }, sort: { nome: 1, _id: 1 }, limit: 1000 }
    ).toArray();
    const equipe = membros.filter(u => ['professor', 'admin'].includes(papelDe(u)));
    const docs = await docenciasDe(equipe.map(u => String(u._id)));
    res.json({
      itens: equipe.map(u => ({ ...usuarioPublicoEquipe(u, { detalhe: true }), docencias: docs.get(String(u._id)) || [] }))
    });
  });

  // ---------- POST /portal/admin/equipe ----------
  admin.post('/equipe', limCriar, async (req, res) => {
    const corpo = req.body || {};
    if (corpo.email !== undefined && typeof corpo.email !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { email: 'Formato inválido.' } });
    const emailNovo = validarEmail(corpo.email || '');
    if (!emailNovo) throw erroCampo('email', 'Informe um e-mail válido.');
    const nome = lerTexto(corpo, 'nome', { min: 2, max: 120, obrigatorio: true });
    const papel = lerEnum(corpo.papel, ['professor', 'admin'], 'papel', { obrigatorio: true });
    const cursoIds = await cursosExistentes(lerCursoIds(corpo.cursoIds));
    if (papel === 'admin') await reaut(req);

    const existente = await repo('users').findOne({ email: emailNovo });
    const t = agora();
    const porId = String(req.user._id);

    if (!existente) {
      const senha = await novaSenhaTemporaria();
      const novoId = new ObjectId();
      const doc = {
        _id: novoId, email: emailNovo, nome, ...senha.set, papel, isAdmin: papel === 'admin', createdAt: t, emailVerificadoEm: null,
        sessaoVersao: 0, papelAtualizadoEm: t, papelAtualizadoPor: porId, criadoPelaEquipePor: porId
      };
      const criado = await auditoria.executar({
        acao: 'usuario.criado_pela_equipe', entidade: { tipo: 'usuario', id: String(novoId) }, alvoUserId: String(novoId),
        extra: { papel, cursoIds, emailVerificado: false }
      }, req, async () => {
        try { await repo('users').insertOne(doc); } catch (err) {
          if (err?.code === 11000) throw new ErroPortal(409, 'email-em-uso');
          throw err;
        }
        await criarDocenciasQueFaltam(String(novoId), cursoIds, req);
        return doc;
      });
      return res.status(201).json({ usuario: usuarioPublicoEquipe(criado, { detalhe: true }), criado: true, senhaTemporaria: senha.clara, expiraEm: iso(senha.expiraEm) });
    }

    const uid = String(existente._id);
    const papelAtual = papelDe(existente);
    const jaTemDocencias = new Set((await repo('docencias').find({ userId: uid, turmaId: null }, { projection: { cursoId: 1 } }).toArray()).map(d => String(d.cursoId)));
    const cursosNovos = cursoIds.filter(c => !jaTemDocencias.has(c));
    const mesmoPapel = papelAtual === papel;
    if (mesmoPapel && !cursosNovos.length) throw new ErroPortal(409, 'registro-duplicado', 'Esta pessoa já está na equipe com esse papel e esses cursos.');
    if (existente.desativadoEm) throw new ErroPortal(409, 'transicao-invalida', 'Esta conta está desativada. Reative-a antes de mudar o papel.');
    if (papelAtual === 'admin' && papel === 'professor') throw new ErroPortal(409, 'transicao-invalida', 'Para rebaixar a coordenação, use a troca de papel.');

    const verificado = !!existente.emailVerificadoEm;
    const set = {};
    let senha = null;
    if (!mesmoPapel) Object.assign(set, { papel, isAdmin: papel === 'admin', papelAtualizadoEm: t, papelAtualizadoPor: porId });
    if (!mesmoPapel && !verificado) {
      senha = await novaSenhaTemporaria();
      Object.assign(set, senha.set);
    }
    await auditoria.executar({
      acao: mesmoPapel ? 'docencia.criada' : 'usuario.papel_alterado', entidade: { tipo: mesmoPapel ? 'docencia' : 'usuario', id: uid }, alvoUserId: uid,
      mudancas: mesmoPapel ? null : [{ campo: 'papel', de: papelAtual, para: papel }],
      extra: { emailVerificado: verificado, cursoIds: cursosNovos, senhaTemporariaGerada: !!senha }
    }, req, async () => {
      if (Object.keys(set).length) {
        const upd = { $set: set };
        if (senha) upd.$inc = { sessaoVersao: 1 };
        await repo('users').updateOne({ _id: existente._id }, upd);
      }
      await criarDocenciasQueFaltam(uid, cursosNovos, req);
    });
    if (senha) avisar(existente, 'avisoSenhaTemporaria', { expiraEm: senha.expiraEm });
    const atualizado = await buscarUsuario(uid);
    const corpoResp = {
      usuario: usuarioPublicoEquipe(atualizado, { detalhe: true }), criado: false,
      conta: { criadaEm: iso(existente.createdAt || existente.criadoEm), ultimoLoginEm: iso(existente.ultimoLoginEm) }
    };
    if (senha) Object.assign(corpoResp, { senhaTemporaria: senha.clara, expiraEm: iso(senha.expiraEm), motivoSenha: 'email-nao-verificado' });
    res.json(corpoResp);
  });

  // ---------- PUT /portal/admin/usuarios/:userId/papel ----------
  admin.put('/usuarios/:userId/papel', async (req, res) => {
    const userId = lerUserIdParam(req);
    const papel = lerEnum(req.body?.papel, PAPEIS, 'papel', { obrigatorio: true });
    const motivo = lerMotivo(req.body, { obrigatorio: false });
    const alvo = await buscarUsuario(userId);
    if (!alvo) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    await reaut(req);
    const atual = papelDe(alvo);
    if (atual === papel) return res.json({ usuario: usuarioPublicoEquipe(alvo, { detalhe: true }) });
    if (String(req.user._id) === userId && atual === 'admin') throw new ErroPortal(409, 'auto-rebaixamento');
    if (atual === 'admin' && (await contarAdmins()) <= 1) throw new ErroPortal(409, 'ultimo-admin');
    const t = agora();
    const set = { papel, isAdmin: papel === 'admin', papelAtualizadoEm: t, papelAtualizadoPor: String(req.user._id) };
    let senha = null;
    if (papel !== 'aluno' && !alvo.emailVerificadoEm) {
      senha = await novaSenhaTemporaria();
      Object.assign(set, senha.set);
    }
    await auditoria.executar({
      acao: 'usuario.papel_alterado', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, motivo,
      mudancas: [{ campo: 'papel', de: atual, para: papel }], extra: { emailVerificado: !!alvo.emailVerificadoEm, senhaTemporariaGerada: !!senha }
    }, req, async () => {
      await repo('users').updateOne({ _id: alvo._id }, { $set: set, ...(senha ? { $inc: { sessaoVersao: 1 } } : {}) });
    });
    if (senha) avisar(alvo, 'avisoSenhaTemporaria', { expiraEm: senha.expiraEm });
    const corpo = { usuario: usuarioPublicoEquipe(await buscarUsuario(userId), { detalhe: true }) };
    if (senha) Object.assign(corpo, { senhaTemporaria: senha.clara, expiraEm: iso(senha.expiraEm), motivoSenha: 'email-nao-verificado' });
    res.json(corpo);
  });

  // ---------- POST /portal/admin/usuarios/:userId/senha-temporaria ----------
  admin.post('/usuarios/:userId/senha-temporaria', async (req, res) => {
    const userId = lerUserIdParam(req);
    const motivo = lerMotivo(req.body);
    const alvo = await buscarUsuario(userId);
    if (!alvo) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    if (String(req.user._id) === userId || papelDe(alvo) === 'admin') {
      throw new ErroPortal(403, 'papel-insuficiente', 'A senha da coordenação é redefinida pelo script create-admin.js, nunca pelo painel.');
    }
    await reaut(req);
    const senha = await novaSenhaTemporaria();
    await auditoria.executar({ acao: 'auth.senha_temporaria_gerada', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, motivo }, req, async () => {
      await repo('users').updateOne({ _id: alvo._id }, { $set: senha.set, $inc: { sessaoVersao: 1 } });
      await repo('auth_tokens').updateMany({ userId, usadoEm: null }, { $set: { usadoEm: agora() } });
    });
    avisar(alvo, 'avisoSenhaTemporaria', { expiraEm: senha.expiraEm });
    res.json({ senhaTemporaria: senha.clara, expiraEm: iso(senha.expiraEm) });
  });

  // ---------- POST /portal/admin/usuarios/:userId/2fa/redefinir ----------
  admin.post('/usuarios/:userId/2fa/redefinir', async (req, res) => {
    const userId = lerUserIdParam(req);
    const motivo = lerMotivo(req.body);
    const alvo = await buscarUsuario(userId);
    if (!alvo) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    await reaut(req);
    const t = agora();
    await auditoria.executar({ acao: 'auth.2fa_redefinido', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, motivo }, req, async () => {
      await repo('auth_2fa').updateOne({ userId }, { $set: { ativo: false, segredo: null, pendente: null, pendenteCriadoEm: null, codigos: [], ativadoEm: null } });
      await repo('users').updateOne({ _id: alvo._id }, { $set: { doisFatoresAtivo: false, credencialRedefinidaPelaCoordenacaoEm: t }, $inc: { sessaoVersao: 1 } });
    });
    avisar(alvo, 'aviso2faAlterado', { pelaCoordenacao: true });
    res.json({ ok: true });
  });

  // ---------- POST /portal/admin/usuarios/:userId/desativar | reativar ----------
  admin.post('/usuarios/:userId/desativar', async (req, res) => {
    const userId = lerUserIdParam(req);
    const motivo = lerMotivo(req.body);
    const alvo = await buscarUsuario(userId);
    if (!alvo) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    if (String(req.user._id) === userId) throw new ErroPortal(409, 'auto-rebaixamento');
    if (papelDe(alvo) === 'admin' && (await contarAdmins()) <= 1) throw new ErroPortal(409, 'ultimo-admin');
    await reaut(req);
    if (!alvo.desativadoEm) {
      await auditoria.executar({ acao: 'usuario.desativado', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, motivo }, req, async () => {
        await repo('users').updateOne({ _id: alvo._id }, { $set: { desativadoEm: agora(), desativadoPor: String(req.user._id) }, $inc: { sessaoVersao: 1 } });
      });
    }
    res.json({ usuario: usuarioPublicoEquipe(await buscarUsuario(userId), { detalhe: true }) });
  });

  admin.post('/usuarios/:userId/reativar', async (req, res) => {
    const userId = lerUserIdParam(req);
    const motivo = lerMotivo(req.body);
    const alvo = await buscarUsuario(userId);
    if (!alvo) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    if (alvo.desativadoEm) {
      await auditoria.executar({ acao: 'usuario.reativado', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, motivo }, req, async () => {
        await repo('users').updateOne({ _id: alvo._id }, { $set: { desativadoEm: null, desativadoPor: null } });
      });
    }
    res.json({ usuario: usuarioPublicoEquipe(await buscarUsuario(userId), { detalhe: true }) });
  });

  // ---------- PUT /portal/admin/usuarios/:userId/email (caminho sem e-mail transacional) ----------
  admin.put('/usuarios/:userId/email', async (req, res) => {
    const userId = lerUserIdParam(req);
    if (req.body?.email !== undefined && typeof req.body.email !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { email: 'Formato inválido.' } });
    const novo = validarEmail(req.body?.email || '');
    if (!novo) throw erroCampo('email', 'Informe um e-mail válido.');
    const motivo = lerMotivo(req.body);
    const alvo = await buscarUsuario(userId);
    if (!alvo) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    await reaut(req);
    if (novo === alvo.email) return res.json({ usuario: usuarioPublicoEquipe(alvo, { detalhe: true }) });
    const outro = await repo('users').findOne({ email: novo }, { projection: { _id: 1 } });
    if (outro) throw new ErroPortal(409, 'email-em-uso');
    const antigo = alvo.email;
    await auditoria.executar({
      acao: 'auth.email_alterado', entidade: { tipo: 'usuario', id: userId }, alvoUserId: userId, motivo,
      mudancas: [{ campo: 'email', de: antigo, para: novo }], extra: { via: 'coordenacao' }
    }, req, async () => {
      try {
        await repo('users').updateOne({ _id: alvo._id }, { $set: { email: novo, emailVerificadoEm: null, credencialRedefinidaPelaCoordenacaoEm: agora() }, $inc: { sessaoVersao: 1 } });
      } catch (err) {
        if (err?.code === 11000) throw new ErroPortal(409, 'email-em-uso');
        throw err;
      }
    });
    avisar(alvo, 'avisoEmailAlterado', { novoEmail: novo, pelaCoordenacao: true }, antigo);
    res.json({ usuario: usuarioPublicoEquipe(await buscarUsuario(userId), { detalhe: true }) });
  });

  // ---------- docências ----------
  admin.post('/docencias', async (req, res) => {
    const corpo = req.body || {};
    if (typeof corpo.userId !== 'string' || !ID_RE.test(corpo.userId)) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    const cursoId = lerIdLegado(corpo.cursoId);
    if (!cursoId) throw new ErroPortal(404, null, 'Curso não encontrado.');
    let turmaId = null;
    if (corpo.turmaId !== undefined && corpo.turmaId !== null && corpo.turmaId !== '') {
      if (typeof corpo.turmaId !== 'string' || !ID_RE.test(corpo.turmaId)) throw new ErroPortal(404, null, 'Turma não encontrada.');
      turmaId = corpo.turmaId;
    }
    const alvo = await buscarUsuario(corpo.userId);
    if (!alvo || alvo.desativadoEm) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    if (!['professor', 'admin'].includes(papelDe(alvo))) throw new ErroPortal(409, 'transicao-invalida', 'Esta conta não tem papel de professor nem de coordenação.');
    const curso = await repo('cursos').findOne({ _id: cursoId }, { projection: { _id: 1 } });
    if (!curso) throw new ErroPortal(404, null, 'Curso não encontrado.');
    if (turmaId) {
      const turma = await repo('turmas').findOne({ _id: oid(turmaId) }, { projection: { cursoId: 1 } });
      if (!turma) throw new ErroPortal(404, null, 'Turma não encontrada.');
      if (String(turma.cursoId) !== cursoId) throw new ErroPortal(400, 'turma-de-outro-curso', undefined, { campos: { turmaId: MENSAGENS['turma-de-outro-curso'] } });
    }
    const filtroDup = { userId: corpo.userId, cursoId, turmaId: turmaId ? oid(turmaId) : null };
    if (await repo('docencias').findOne(filtroDup, { projection: { _id: 1 } })) throw new ErroPortal(409, 'registro-duplicado', 'Esta docência já existe.');
    const doc = { ...filtroDup, criadoEm: agora(), criadoPor: String(req.user._id) };
    await auditoria.executar({
      acao: 'docencia.criada', entidade: { tipo: 'docencia', id: `${corpo.userId}:${cursoId}:${turmaId || 'curso'}` }, alvoUserId: corpo.userId, cursoId,
      extra: { turmaId }
    }, req, async () => {
      try {
        const r = await repo('docencias').insertOne(doc);
        doc._id = r.insertedId;
      } catch (err) {
        if (err?.code === 11000) throw new ErroPortal(409, 'registro-duplicado', 'Esta docência já existe.');
        throw err;
      }
    });
    res.status(201).json({ docencia: { id: String(doc._id), userId: doc.userId, cursoId, turmaId, criadoEm: iso(doc.criadoEm) } });
  });

  admin.delete('/docencias/:id', async (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new ErroPortal(404, null, 'Docência não encontrada.');
    const doc = await repo('docencias').findOne({ _id: oid(id) });
    if (!doc) throw new ErroPortal(404, null, 'Docência não encontrada.');
    await auditoria.executar({
      acao: 'docencia.removida', entidade: { tipo: 'docencia', id }, alvoUserId: String(doc.userId), cursoId: String(doc.cursoId),
      extra: { turmaId: doc.turmaId ? String(doc.turmaId) : null }
    }, req, async () => {
      await repo('docencias').deleteOne({ _id: doc._id });
    });
    res.json({ ok: true });
  });

  // ---------- professor ----------
  professor.get('/cursos', async (req, res) => {
    const papel = papelDe(req.user);
    if (papel === 'admin') {
      const cursos = await repo('cursos').find({}, { projection: { titulo: 1, sigla: 1, capa: 1, ordem: 1 }, sort: { ordem: 1, _id: 1 } }).toArray();
      return res.json({ itens: cursos.map(c => ({ id: String(c._id), titulo: c.titulo || '', sigla: c.sigla || null, capaUrl: capaUrl(c) || null, escopo: 'curso', turmaIds: [] })) });
    }
    const ctx = await acesso.contexto(req);
    const ids = [...ctx.cursosDocente];
    if (!ids.length) return res.json({ itens: [] });
    const cursos = await repo('cursos').find({ _id: { $in: ids } }, { projection: { titulo: 1, sigla: 1, capa: 1, ordem: 1 }, sort: { ordem: 1, _id: 1 } }).toArray();
    res.json({
      itens: cursos.map(c => {
        const id = String(c._id);
        const geral = ctx.cursosDocenteGeral.has(id);
        return { id, titulo: c.titulo || '', sigla: c.sigla || null, capaUrl: capaUrl(c) || null, escopo: geral ? 'curso' : 'turmas', turmaIds: geral ? [] : [...(ctx.turmasDocente.get(id) || [])] };
      })
    });
  });

  professor.get('/alunos/:userId/resumo', async (req, res) => {
    const userId = lerUserIdParam(req);
    if (!(await acesso.podeVerAluno(req, userId))) throw new ErroPortal(404, null, 'Aluno não encontrado.');
    const alvo = await buscarUsuario(userId);
    if (!alvo) throw new ErroPortal(404, null, 'Aluno não encontrado.');
    const publicos = perfisPublicos ? await perfisPublicos([userId]) : new Map();
    const p = publicos.get(userId) || { id: userId, nome: nomeDe(alvo), nomeSocial: null, email: alvo.email, fotoUrl: null };
    const base = { id: userId, nome: p.nome, nomeSocial: p.nomeSocial ?? null, email: p.email ?? alvo.email, fotoUrl: p.fotoUrl ?? null };
    if (papelDe(req.user) !== 'admin') return res.json(base);
    const perfil = await repo('perfis').findOne({ userId });
    res.json({
      ...base, papel: papelDe(alvo), criadoEm: iso(alvo.createdAt || alvo.criadoEm), ultimoLoginEm: iso(alvo.ultimoLoginEm),
      perfilCompleto: calcularCompletude(perfil, { email: alvo.email }).completo
    });
  });

  professor.get('/alunos/:userId/foto', async (req, res) => {
    const userId = lerUserIdParam(req);
    if (!arquivos || !(await acesso.podeVerAluno(req, userId))) throw new ErroPortal(404, null, 'Foto não encontrada.');
    const perfil = await repo('perfis').findOne({ userId }, { projection: { fotoArquivoId: 1 } });
    if (!perfil?.fotoArquivoId) throw new ErroPortal(404, null, 'Foto não encontrada.');
    const arq = await arquivos.ler(perfil.fotoArquivoId, { contexto: 'foto_perfil', donoUserId: userId });
    if (!arq) throw new ErroPortal(404, null, 'Foto não encontrada.');
    arquivos.enviar(res, arq, { nome: 'foto', inline: true });
  });

  return { admin, professor };
}

/** Membro do grupo `cascata` (API §4.4): ao apagar um curso, as docências dele saem junto. */
export function criarCascataDocencias({ repo }) {
  return {
    dominio: 'docencias',
    bloqueios: async () => 0,
    apagar: async (alvo) => {
      if (alvo?.tipo === 'curso' && alvo.id) await repo('docencias').deleteMany({ cursoId: String(alvo.id) });
    }
  };
}

/** Montagem no agregador (API §5.1). */
export default async function montar(ctx) {
  const c = ctx.comum;
  criarRotaEquipe({
    admin: ctx.rotas.admin, professor: ctx.rotas.professor,
    repo: c.repo, auditoria: c.auditoria, email: c.email, contador: c.contador, configPortal: c.configPortal, agora: c.agora,
    hashSenha: c.hashSenha, throttle: c.throttle, cripto: c.cifra || null, arquivos: c.arquivos,
    perfisPublicos: c.perfis?.publicos || null, acesso: c.acesso, capaUrl: c.capaUrl, log: c.log
  });
  ctx.servicos.adicionar('cascata', criarCascataDocencias({ repo: c.repo }));
}
