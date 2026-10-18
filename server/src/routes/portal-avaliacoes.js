// =============================================================
// COMPLEXO DMC · Portal — avaliações (aluno, professor, coordenação)
// PORTAL-API §6.6, §8.11, §8.13 · UX §6.4, §7.6, §7.7 · dono: F2.
//
// Fábrica `criarRotaAvaliacoes(deps)` → { aluno, professor } (Routers),
// testável com repositórios em memória; `montar(ctx)` liga as rotas ao
// agregador, registra os índices, os serviços `avaliacoes.*` e as
// contribuições aos grupos (validador AVL, cascata, painel, exportador).
//
// Regras que este arquivo garante:
// - gabarito (`corretaId`/`explicacao`) só depois de FINALIZAR (e de
//   `gabaritoLiberaEm`, quando definido); `respostaReferencia` NUNCA sai
//   ao aluno — toda saída para o aluno passa pelos serializadores do motor;
// - tempo controlado no servidor (`prazoEm`; 30 s de tolerância; leitura
//   ou escrita de tentativa vencida envia com o que foi salvo);
// - uma tentativa aberta por matrícula e avaliação (índice parcial);
// - nota da tentativa = 10 × pontos ÷ possíveis; nota do módulo = melhor
//   tentativa corrigida da MODULAR publicada; aprovado ≥ notaMinima (7);
// - correção do professor em rascunho (`publicar:false`) é invisível ao
//   aluno; publicação, recorreção e concessão são auditadas (executar).
// =============================================================
import { Router } from 'express';
import { randomInt as randomIntPadrao, randomBytes } from 'node:crypto';
import { ErroPortal } from '../portal/erros.js';
import { papelDe } from '../portal/papeis.js';
import { lerTexto, lerEnum, lerInteiro, lerNumero, lerBooleano, lerPagina, lerIdLegado, iniciais as iniciaisDe } from '../portal/validacao.js';
import { codigoVerificacao, CODIGO_VERIFICACAO_RE } from '../portal/codigos.js';
import { lerCorpoBinario } from '../portal/arquivos.js';
import { registrarIndices } from '../portal/indices.js';
import { criarThrottle } from '../throttle.js';
import {
  TIPOS_AVALIACAO, TIPOS_QUESTAO, IDS_ALTERNATIVA, LIMITE_CARACTERES_PADRAO, ROTULOS_SITUACAO,
  sortearQuestoes, prazoDe, prazoVencido, validarResposta, corrigirNoEnvio, calcularTotais, camposDoSelo,
  avisosDe, tentativaParaAluno, resultadoParaAluno, gabaritoParaAluno, questaoParaEquipe, avaliacaoParaEquipe,
  previaParaEquipe, conferirBanco, totalDoSorteio, estadoDoAluno
} from '../portal/avaliacoes/avaliacao-motor.js';
import { criarRepositorioAvaliacoes, INDICES_AVALIACOES, hex, comoOid } from '../portal/avaliacoes/repositorios.js';

const TCC_MAX_BYTES = 4 * 1024 * 1024;
const POR_PAGINA_CORRECAO = 25;
const POR_PAGINA_RESULTADOS = 50;

const e400 = (campos, mensagem) => new ErroPortal(400, 'validacao', mensagem, { campos });
const e404 = (codigo = null, mensagem = 'Não encontrado.') => new ErroPortal(404, codigo, mensagem);
const e409 = (codigo, mensagem, extras) => new ErroPortal(409, codigo, mensagem, extras);

/**
 * @param {{ repo, servicos, acesso, auditoria, notificacoes, assinador?, arquivos?, perfis?, agora?, log?,
 *           randomInt?, bytes?, limites? }} deps
 */
export function criarRotaAvaliacoes(deps = {}) {
  const {
    repo, servicos, acesso, auditoria, notificacoes, assinador = null, arquivos = null, perfis = null,
    agora = () => new Date(), log = console, randomInt = randomIntPadrao, bytes = randomBytes, limites = {}
  } = deps;
  if (typeof repo !== 'function') throw new TypeError('criarRotaAvaliacoes: informe repo.');
  if (!servicos) throw new TypeError('criarRotaAvaliacoes: informe servicos.');
  if (!acesso) throw new TypeError('criarRotaAvaliacoes: informe acesso.');
  if (!auditoria) throw new TypeError('criarRotaAvaliacoes: informe auditoria.');
  if (!notificacoes) throw new TypeError('criarRotaAvaliacoes: informe notificacoes.');

  const R = criarRepositorioAvaliacoes({ repo, servicos, agora, log });
  const { col } = R;
  const userIdDe = req => String(req.user._id);
  const porUsuario = req => 'u:' + (req.user?._id ? String(req.user._id) : req.ip);
  const limite = (nome, janelaMs, max) => limites[nome] || criarThrottle({ janelaMs, max, chave: porUsuario, codigo: 'limite' });
  const limIniciar = limite('iniciar', 15 * 60 * 1000, 10);
  const limResponder = limite('responder', 10 * 60 * 1000, 240);
  const limArquivo = limite('arquivo', 60 * 60 * 1000, 20);

  const logar = (texto, err) => {
    try { (log.warn || log.error).call(log, JSON.stringify({ nivel: 'aviso', evento: 'portal.avaliacoes', texto, erro: err ? `${err.name}: ${String(err.message).slice(0, 120)}` : undefined })); } catch { /* nada */ }
  };

  // ---------- papel no curso ----------
  async function papelNoCurso(req, cursoId) {
    const c = await acesso.contexto(req);
    if (c.papel === 'admin') return { equipe: true, geral: true, admin: true };
    const cid = String(cursoId);
    return { equipe: c.cursosDocente.has(cid), geral: c.cursosDocenteGeral.has(cid), admin: false };
  }
  async function exigirDocente(req, cursoId) {
    const p = await papelNoCurso(req, cursoId);
    if (!p.equipe) throw new ErroPortal(403, 'nao-docente');
    return p;
  }
  async function exigirDocenteGeral(req, cursoId) {
    const p = await papelNoCurso(req, cursoId);
    if (!p.geral) throw new ErroPortal(403, 'nao-docente');
    return p;
  }
  /** A equipe pode ver esta tentativa? (docente da turma da matrícula, docente geral, admin) */
  async function equipeVeTentativa(req, t) {
    return acesso.podeGerirTurma(req, t.cursoId, t.turmaId ?? null);
  }

  async function moduloDe(moduloId) {
    const id = lerIdLegado(moduloId);
    if (!id) return null;
    return repo('modulos').findOne({ _id: id });
  }

  // ---------- selo e código AVL ----------
  function selar(t) {
    if (!assinador || typeof assinador.assinar !== 'function') return { hash: null, kid: null };
    try { return assinador.assinar('avaliacao', camposDoSelo(t)); } catch (err) { logar('selo indisponível', err); return { hash: null, kid: null }; }
  }

  /** updateOne com código AVL novo; repete com outro código em colisão (uq_tent_codigo). */
  async function gravarComCodigo(filtro, set, t, { codigoExistente = null } = {}) {
    for (let i = 0; i < 4; i++) {
      const codigo = codigoExistente || codigoVerificacao('AVL', bytes);
      const doc = { ...t, ...set, codigo };
      const { hash, kid } = selar(doc);
      try {
        const r = await col.tentativas().updateOne(filtro, { $set: { ...set, codigo, hash, kid }, $inc: { versao: 1 } });
        return { r, codigo };
      } catch (err) {
        if (err?.code === 11000 && /uq_tent_codigo/.test(String(err.message)) && !codigoExistente) continue;
        throw err;
      }
    }
    throw new ErroPortal(503, 'servico-indisponivel');
  }

  // ---------- envio (aluno, prazo vencido ou explícito) ----------
  async function enviarTentativa(t, { expirada = false } = {}) {
    const momento = agora();
    const enviadaEm = expirada && t.prazoEm ? new Date(Math.min(momento.getTime(), new Date(t.prazoEm).getTime() + 30 * 1000)) : momento;
    const { correcaoAuto, totais, status } = corrigirNoEnvio(t, momento);
    const set = {
      status, enviadaEm, expirada,
      acertosObjetivas: totais.acertosObjetivas, totalObjetivas: totais.totalObjetivas,
      pontosPossiveis: totais.pontosPossiveis, pontosObtidos: null, nota: null, pctAcerto: null
    };
    for (const [qid, c] of Object.entries(correcaoAuto)) set[`correcao.${qid}`] = c;
    const filtro = { _id: t._id, status: 'em_andamento' };
    if (status === 'corrigida') {
      Object.assign(set, { pontosObtidos: totais.pontosObtidos, nota: totais.nota, pctAcerto: totais.pctAcerto, corrigidaEm: momento });
      await gravarComCodigo(filtro, set, { ...t, correcao: { ...(t.correcao || {}), ...correcaoAuto } });
    } else {
      await col.tentativas().updateOne(filtro, { $set: set, $inc: { versao: 1 } });
    }
    return col.tentativas().findOne({ _id: t._id });
  }

  /** Lê a tentativa; se aberta e vencida, envia com o salvo (§8.13 item 2). */
  async function atualizarSeVencida(t) {
    if (t && prazoVencido(t, agora())) return enviarTentativa(t, { expirada: true });
    return t;
  }

  async function tentativaDoDono(req, id) {
    const t = await R.tentativaPorId(id);
    if (!t || String(t.userId) !== userIdDe(req)) throw e404(null, 'Tentativa não encontrada.');
    return atualizarSeVencida(t);
  }

  // ---------- notificações (nunca derrubam a resposta) ----------
  async function notificar(dados) {
    try { await notificacoes.emitir(dados); } catch (err) { logar('notificação não emitida', err); }
  }
  async function alunosAtivosDoCurso(cursoId) {
    const f = servicos.tentar('secretaria.alunosDoCurso');
    if (typeof f !== 'function') return null;
    try {
      const lista = await f({ cursoId: String(cursoId), status: 'ativa' });
      return Array.isArray(lista) ? lista : null;
    } catch (err) { logar('secretaria.alunosDoCurso falhou', err); return null; }
  }

  // ---------- respostas ao aluno ----------
  async function corpoDaAvaliacao(req, a, { equipe = false } = {}) {
    const modulo = await repo('modulos').findOne({ _id: String(a.moduloId) }, { projection: { numero: 1, titulo: 1, tipo: 1 } });
    // Aluno com liberação e sem matrícula ainda materializada: a F4a cria pela liberação (§8.2), como em me/cursos.
    const matricula = equipe ? await R.matriculaVigente(userIdDe(req), a.cursoId) : await R.matriculaParaTentativa(userIdDe(req), a.cursoId);
    let { tentativas, registro, estado } = await R.estadoDaMatricula(a, matricula);
    const aberta = tentativas.find(t => t.status === 'em_andamento');
    if (aberta && prazoVencido(aberta, agora())) {
      await enviarTentativa(aberta, { expirada: true });
      ({ tentativas, registro, estado } = await R.estadoDaMatricula(a, matricula));
    }
    const abertaAgora = tentativas.find(t => t.status === 'em_andamento') || null;
    const motivoBloqueio = !a.publicada ? 'nao-publicada' : !matricula ? 'sem-matricula' : matricula.status !== 'ativa' ? 'matricula-nao-ativa' : null;
    return {
      avaliacao: {
        id: hex(a._id), tipo: a.tipo, titulo: a.titulo, instrucoes: a.instrucoes || '', nQuestoes: totalDoSorteio(a.sorteio),
        tentativasMax: a.tentativasMax, tempoLimiteMin: a.tempoLimiteMin ?? null, publicada: a.publicada === true,
        cursoId: a.cursoId,
        modulo: modulo ? { id: String(modulo._id), numero: modulo.numero ?? null, titulo: modulo.titulo ?? null } : { id: a.moduloId, numero: null, titulo: null },
        gabaritoLiberaEm: a.gabaritoLiberaEm ? new Date(a.gabaritoLiberaEm).toISOString() : null
      },
      avisos: avisosDe(a, estado),
      estado: { ...estado, abertaId: undefined },
      matricula: matricula ? { id: hex(matricula._id), status: matricula.status } : null,
      motivoBloqueio,
      tentativas: tentativas.filter(t => t.status !== 'em_andamento').map(t => {
        const r = resultadoParaAluno(t);
        return { id: r.id, numero: r.numero, status: r.status, iniciadaEm: r.iniciadaEm, enviadaEm: r.enviadaEm, expirada: r.expirada, acertosObjetivas: r.acertosObjetivas, totalObjetivas: r.totalObjetivas, pctAcerto: r.pctAcerto, nota: r.nota };
      }),
      aberta: abertaAgora ? { id: hex(abertaAgora._id), prazoEm: abertaAgora.prazoEm ? new Date(abertaAgora.prazoEm).toISOString() : null } : null,
      novaTentativaLiberada: (() => {
        const ultima = Array.isArray(registro?.concessoes) && registro.concessoes.length ? registro.concessoes[registro.concessoes.length - 1] : null;
        if (!ultima || estado.finalizada || estado.restantes <= 0 || abertaAgora) return false;
        const depois = tentativas.some(t => new Date(t.iniciadaEm).getTime() > new Date(ultima.em).getTime());
        return !depois;
      })(),
      agora: agora().toISOString()
    };
  }

  async function avaliacaoVisivel(req, id) {
    const a = await R.avaliacaoPorId(id);
    if (!a) throw e404('nao-publicada');
    const p = await papelNoCurso(req, a.cursoId);
    if (!a.publicada && !p.equipe) throw e404('nao-publicada');
    if (!(await acesso.podeVerCurso(req, a.cursoId))) throw new ErroPortal(403, 'sem-acesso');
    return { a, p };
  }

  // =============================================================
  // ALUNO (/api/portal/…)
  // =============================================================
  const aluno = Router();

  aluno.get('/avaliacoes/:id', async (req, res) => {
    const { a, p } = await avaliacaoVisivel(req, req.params.id);
    res.json(await corpoDaAvaliacao(req, a, { equipe: p.equipe }));
  });

  aluno.post('/avaliacoes/:id/tentativas', limIniciar, async (req, res) => {
    const a = await R.avaliacaoPorId(req.params.id);
    if (!a || !a.publicada) throw e404('nao-publicada');
    if (!(await acesso.podeVerCurso(req, a.cursoId))) throw new ErroPortal(403, 'sem-acesso');
    const userId = userIdDe(req);
    const matricula = await R.matriculaParaTentativa(userId, a.cursoId);
    if (!matricula || matricula.status !== 'ativa') throw e409('matricula-nao-ativa');

    let { tentativas, estado } = await R.estadoDaMatricula(a, matricula);
    let aberta = tentativas.find(t => t.status === 'em_andamento');
    if (aberta && prazoVencido(aberta, agora())) {
      await enviarTentativa(aberta, { expirada: true });
      ({ tentativas, estado } = await R.estadoDaMatricula(a, matricula));
      aberta = null;
    }
    if (aberta) return res.status(200).json(tentativaParaAluno(aberta, agora()));
    if (estado.finalizada) throw e409('avaliacao-finalizada');
    if (estado.restantes <= 0) throw e409('tentativas-esgotadas');

    const banco = await col.questoes().find({ avaliacaoId: a._id, ativa: true }).toArray();
    const sorteio = sortearQuestoes(a, banco, { randomInt });
    if (sorteio.erro) throw e409('banco-insuficiente');
    const iniciadaEm = agora();
    const doc = {
      codigo: null, avaliacaoId: a._id, cursoId: String(a.cursoId), moduloId: String(a.moduloId), tipo: a.tipo,
      matriculaId: comoOid(matricula._id), userId, numero: tentativas.length + 1,
      turmaId: matricula.turmaId ? hex(matricula.turmaId) : null,
      turmaCodigo: matricula.turma?.codigo ?? (Array.isArray(matricula.enturmacoes) ? (matricula.enturmacoes.find(e => !e.ate)?.turmaCodigo ?? null) : null),
      matriculaNumero: matricula.numero ?? null,
      status: 'em_andamento', iniciadaEm, prazoEm: prazoDe(iniciadaEm, a.tempoLimiteMin), enviadaEm: null, expirada: false,
      questoes: sorteio.questoes, respostas: {}, correcao: {}, corrigidaEm: null,
      acertosObjetivas: 0, totalObjetivas: 0, pontosObtidos: null, pontosPossiveis: 0, nota: null, pctAcerto: null,
      hash: null, kid: null, versao: 1
    };
    try {
      const r = await col.tentativas().insertOne(doc);
      doc._id = r.insertedId;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Corrida (duas abas): a outra requisição abriu antes → devolve a aberta.
      const outra = await col.tentativas().findOne({ matriculaId: doc.matriculaId, avaliacaoId: a._id, status: 'em_andamento' });
      if (outra) return res.status(200).json(tentativaParaAluno(outra, agora()));
      throw e409('tentativa-aberta');
    }
    const ids = sorteio.sorteadas.map(comoOid).filter(Boolean);
    if (ids.length) await col.questoes().updateMany({ _id: { $in: ids }, sorteada: { $ne: true } }, { $set: { sorteada: true } });
    res.status(201).json(tentativaParaAluno(doc, agora()));
  });

  aluno.get('/tentativas/:id', async (req, res) => {
    const t = await tentativaDoDono(req, req.params.id);
    if (t.status === 'em_andamento') return res.json(tentativaParaAluno(t, agora()));
    res.json(resultadoParaAluno(t));
  });

  aluno.put('/tentativas/:id/respostas', limResponder, async (req, res) => {
    const original = await R.tentativaPorId(req.params.id);
    if (!original || String(original.userId) !== userIdDe(req)) throw e404(null, 'Tentativa não encontrada.');
    if (original.status !== 'em_andamento') throw e409('transicao-invalida', 'Esta tentativa já foi enviada.');
    if (prazoVencido(original, agora())) {
      await enviarTentativa(original, { expirada: true });
      throw e409('tempo-esgotado');
    }
    const corpo = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof corpo.questaoId !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { questaoId: 'Formato inválido.' } });
    const q = (original.questoes || []).find(x => x.questaoId === corpo.questaoId);
    const v = validarResposta(q, corpo);
    if (!v.ok) throw new ErroPortal(400, v.codigo, v.mensagem, v.extras);
    const salvoEm = agora();
    const r = await col.tentativas().updateOne(
      { _id: original._id, status: 'em_andamento' },
      { $set: { [`respostas.${q.questaoId}`]: { ...v.valor, em: salvoEm } } }
    );
    if (!r.matchedCount) throw e409('transicao-invalida', 'Esta tentativa já foi enviada.');
    res.json({ salvoEm: salvoEm.toISOString() });
  });

  aluno.post('/tentativas/:id/enviar', async (req, res) => {
    const original = await R.tentativaPorId(req.params.id);
    if (!original || String(original.userId) !== userIdDe(req)) throw e404(null, 'Tentativa não encontrada.');
    if (original.status !== 'em_andamento') return res.json(resultadoParaAluno(original));
    if (prazoVencido(original, agora())) {
      await enviarTentativa(original, { expirada: true });
      throw e409('tempo-esgotado');
    }
    const lote = req.body?.respostas;
    if (lote !== undefined && lote !== null) {
      if (typeof lote !== 'object' || Array.isArray(lote)) throw new ErroPortal(400, 'formato-invalido');
      const set = {};
      const momento = agora();
      for (const [qid, resp] of Object.entries(lote)) {
        const q = (original.questoes || []).find(x => x.questaoId === qid);
        const v = validarResposta(q, resp);
        if (!v.ok) throw new ErroPortal(400, v.codigo, v.mensagem, v.extras);
        set[`respostas.${qid}`] = { ...v.valor, em: momento };
      }
      if (Object.keys(set).length) await col.tentativas().updateOne({ _id: original._id, status: 'em_andamento' }, { $set: set });
    }
    const atual = await col.tentativas().findOne({ _id: original._id });
    if (atual.status !== 'em_andamento') return res.json(resultadoParaAluno(atual));
    const enviada = await enviarTentativa(atual, { expirada: false });
    res.json(resultadoParaAluno(enviada));
  });

  aluno.post('/avaliacoes/:id/finalizar', async (req, res) => {
    if (req.body?.confirmar !== true) throw e400({ confirmar: 'Confirme a finalização.' });
    const a = await R.avaliacaoPorId(req.params.id);
    if (!a || !a.publicada) throw e404('nao-publicada');
    if (!(await acesso.podeVerCurso(req, a.cursoId))) throw new ErroPortal(403, 'sem-acesso');
    const matricula = await R.matriculaVigente(userIdDe(req), a.cursoId);
    if (!matricula || matricula.status !== 'ativa') throw e409('matricula-nao-ativa');
    let { tentativas } = await R.estadoDaMatricula(a, matricula);
    for (const t of tentativas) if (t.status === 'em_andamento') await atualizarSeVencida(t);
    ({ tentativas } = await R.estadoDaMatricula(a, matricula));
    if (tentativas.some(t => t.status === 'em_andamento')) throw e409('tentativa-aberta');
    if (!tentativas.length) throw e409('transicao-invalida', 'Envie ao menos uma tentativa antes de finalizar.');
    const momento = agora();
    await col.alunos().updateOne(
      { matriculaId: comoOid(matricula._id), avaliacaoId: a._id },
      {
        $set: { atualizadoEm: momento },
        $setOnInsert: { userId: userIdDe(req), tentativasExtras: 0, concessoes: [], criadoEm: momento }
      },
      { upsert: true }
    );
    await col.alunos().updateOne(
      { matriculaId: comoOid(matricula._id), avaliacaoId: a._id, finalizadaEm: null },
      { $set: { finalizadaEm: momento } }
    );
    const { estado } = await R.estadoDaMatricula(a, matricula);
    const liberaEm = a.gabaritoLiberaEm ? new Date(a.gabaritoLiberaEm) : null;
    res.json({
      estado: { ...estado, abertaId: undefined },
      gabaritoDisponivel: !liberaEm || liberaEm.getTime() <= momento.getTime(),
      gabaritoLiberaEm: liberaEm ? liberaEm.toISOString() : null
    });
  });

  aluno.get('/tentativas/:id/gabarito', async (req, res) => {
    const t0 = await R.tentativaPorId(req.params.id);
    if (!t0) throw e404(null, 'Tentativa não encontrada.');
    const dono = String(t0.userId) === userIdDe(req);
    if (!dono) {
      if (!(await equipeVeTentativa(req, t0))) throw e404(null, 'Tentativa não encontrada.');
      return res.json(gabaritoParaAluno(t0, { completo: true }));
    }
    const t = await atualizarSeVencida(t0);
    const registro = await R.registroDoAluno(t.matriculaId, t.avaliacaoId);
    if (!registro?.finalizadaEm || t.status === 'em_andamento') throw new ErroPortal(403, 'gabarito-bloqueado');
    const a = await R.avaliacaoPorId(t.avaliacaoId);
    const liberaEm = a?.gabaritoLiberaEm ? new Date(a.gabaritoLiberaEm) : null;
    res.json(gabaritoParaAluno(t, { completo: !liberaEm || liberaEm.getTime() <= agora().getTime() }));
  });

  // Entrega de TCC (questão `arquivo`): POST substitui a entrega anterior (DC-71).
  aluno.post('/tentativas/:id/respostas/:questaoId/arquivo', limArquivo, ...lerCorpoBinario({ limiteBytes: TCC_MAX_BYTES, tipos: ['pdf'] }), async (req, res) => {
    if (!arquivos) throw new ErroPortal(503, 'servico-indisponivel');
    const original = await R.tentativaPorId(req.params.id);
    if (!original || String(original.userId) !== userIdDe(req)) throw e404(null, 'Tentativa não encontrada.');
    if (original.status !== 'em_andamento') throw e409('transicao-invalida', 'Esta tentativa já foi enviada.');
    if (prazoVencido(original, agora())) { await enviarTentativa(original, { expirada: true }); throw e409('tempo-esgotado'); }
    const q = (original.questoes || []).find(x => x.questaoId === req.params.questaoId);
    if (!q || q.tipo !== 'arquivo') throw e400({ questaoId: 'Esta questão não recebe arquivo.' });
    const salvo = await arquivos.salvar({
      contexto: 'tcc', donoUserId: userIdDe(req), ref: { entidadeId: hex(original._id) }, buf: req.arquivo.buf, tipo: 'pdf',
      nomeDownload: `tcc-${original.numero}`, por: userIdDe(req)
    });
    const anterior = original.respostas?.[q.questaoId]?.arquivo?.arquivoId;
    const salvoEm = agora();
    const r = await col.tentativas().updateOne(
      { _id: original._id, status: 'em_andamento' },
      { $set: { [`respostas.${q.questaoId}`]: { arquivo: { arquivoId: comoOid(salvo.id), sha256: salvo.sha256, tamanho: salvo.tamanho }, em: salvoEm } } }
    );
    if (!r.matchedCount) { await arquivos.apagar(salvo.id); throw e409('transicao-invalida', 'Esta tentativa já foi enviada.'); }
    if (anterior) await arquivos.apagar(hex(anterior));
    res.json({ salvoEm: salvoEm.toISOString(), arquivo: { tamanho: salvo.tamanho, sha256: salvo.sha256 } });
  });

  async function enviarEntrega(res, t, questaoId) {
    const r = (t.respostas || {})[questaoId];
    const id = r?.arquivo?.arquivoId;
    if (!id || !arquivos) throw e404(null, 'Entrega não encontrada.');
    const arq = await arquivos.ler(hex(id), { contexto: 'tcc', donoUserId: String(t.userId) });
    if (!arq) throw e404(null, 'Entrega não encontrada.');
    arquivos.enviar(res, arq, { nome: `tcc-${t.codigo || t.numero}` });
  }

  aluno.get('/tentativas/:id/respostas/:questaoId/arquivo', async (req, res) => {
    const t = await R.tentativaPorId(req.params.id);
    if (!t || String(t.userId) !== userIdDe(req)) throw e404(null, 'Entrega não encontrada.');
    await enviarEntrega(res, t, req.params.questaoId);
  });

  // =============================================================
  // PROFESSOR E COORDENAÇÃO (/api/portal/professor/…)
  // =============================================================
  const professor = Router();

  function lerSorteio(corpo, moduloTcc) {
    const s = corpo.sorteio;
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw e400({ sorteio: 'Informe a composição.' });
    const objetivas = lerInteiro(s.objetivas ?? 0, { min: 0, max: 100 }, 'sorteio.objetivas') ?? 0;
    const dissertativas = lerInteiro(s.dissertativas ?? 0, { min: 0, max: 100 }, 'sorteio.dissertativas') ?? 0;
    const arqs = lerInteiro(s.arquivos ?? 0, { min: 0, max: 100 }, 'sorteio.arquivos') ?? 0;
    if (arqs > 0 && !moduloTcc) throw new ErroPortal(400, 'modulo-nao-tcc');
    const soma = objetivas + dissertativas + arqs;
    if (soma < 1 || soma > 100) throw e400({ sorteio: 'Use de 1 a 100 questões por tentativa.' });
    return { objetivas, dissertativas, arquivos: arqs };
  }

  function lerDataOpcional(valor, campo) {
    if (valor === null || valor === undefined || valor === '') return null;
    if (typeof valor !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { [campo]: 'Formato inválido.' } });
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) throw e400({ [campo]: 'Data inválida.' });
    return d;
  }

  function lerConfiguracao(corpo, { parcial = false, moduloTcc = false } = {}) {
    const c = corpo && typeof corpo === 'object' ? corpo : {};
    const tem = k => Object.hasOwn(c, k);
    const out = {};
    if (!parcial || tem('titulo')) out.titulo = lerTexto(c, 'titulo', { min: 3, max: 160, obrigatorio: true });
    if (!parcial || tem('instrucoes')) out.instrucoes = lerTexto(c, 'instrucoes', { max: 4000, multilinha: true }) ?? '';
    if (!parcial || tem('sorteio')) out.sorteio = lerSorteio(c, moduloTcc);
    if (!parcial || tem('tentativasMax')) out.tentativasMax = lerInteiro(c.tentativasMax, { min: 1, max: 10, obrigatorio: true }, 'tentativasMax');
    if (!parcial || tem('tempoLimiteMin')) out.tempoLimiteMin = lerInteiro(c.tempoLimiteMin, { min: 5, max: 600 }, 'tempoLimiteMin');
    if (!parcial || tem('embaralharAlternativas')) out.embaralharAlternativas = lerBooleano(c.embaralharAlternativas, 'embaralharAlternativas') === true;
    if (!parcial || tem('gabaritoLiberaEm')) out.gabaritoLiberaEm = lerDataOpcional(c.gabaritoLiberaEm, 'gabaritoLiberaEm');
    return out;
  }

  async function contagensDaAvaliacao(a) {
    const [banco, tentativas, aguardando] = await Promise.all([
      R.contagemDoBanco(a._id),
      col.tentativas().countDocuments({ avaliacaoId: a._id }),
      col.tentativas().countDocuments({ avaliacaoId: a._id, status: 'aguardando_correcao' })
    ]);
    return { banco: { objetivasAtivas: banco.objetiva, dissertativasAtivas: banco.dissertativa, arquivosAtivas: banco.arquivo }, tentativas, aguardandoCorrecao: aguardando };
  }

  async function itensDoModulo(moduloId) {
    const lista = await col.avaliacoes().find({ moduloId: String(moduloId) }).toArray();
    lista.sort((x, y) => (x.tipo === 'previa' ? 0 : 1) - (y.tipo === 'previa' ? 0 : 1));
    const out = [];
    for (const a of lista) out.push({ ...avaliacaoParaEquipe(a), ...(await contagensDaAvaliacao(a)) });
    return out;
  }

  // Acréscimo F2 (filtro de curso da tela "Avaliações" e da fila de correção): cursos visíveis à equipe.
  professor.get('/avaliacoes', async (req, res) => {
    const c = await acesso.contexto(req);
    const filtro = c.papel === 'admin' ? {} : { _id: { $in: [...c.cursosDocente] } };
    const cursos = await repo('cursos').find(filtro, { projection: { titulo: 1, sigla: 1, ordem: 1 } }).toArray();
    cursos.sort((x, y) => (Number(x.ordem) || 0) - (Number(y.ordem) || 0));
    res.json({
      cursos: cursos.map(x => ({
        id: String(x._id), titulo: x.titulo || '', sigla: x.sigla || null,
        podeEditar: c.papel === 'admin' || c.cursosDocenteGeral.has(String(x._id))
      }))
    });
  });

  // Acréscimo F2 (lista da tela "Avaliações", UX §7.6): módulos do curso com as avaliações de cada um.
  professor.get('/cursos/:cursoId/avaliacoes', async (req, res) => {
    const cursoId = lerIdLegado(req.params.cursoId);
    if (!cursoId) throw e404();
    const curso = await repo('cursos').findOne({ _id: cursoId }, { projection: { titulo: 1, sigla: 1 } });
    if (!curso) throw e404();
    const p = await exigirDocente(req, cursoId);
    const mods = await repo('modulos').find({ cursoId }, { projection: { numero: 1, titulo: 1, ordem: 1, tipo: 1 } }).toArray();
    mods.sort((x, y) => (Number(x.ordem) || 0) - (Number(y.ordem) || 0));
    const modulos = [];
    for (const m of mods) {
      modulos.push({ id: String(m._id), numero: m.numero ?? null, titulo: m.titulo ?? '', tipo: m.tipo === 'tcc' ? 'tcc' : 'regular', avaliacoes: await itensDoModulo(m._id) });
    }
    res.json({
      curso: { id: cursoId, titulo: curso.titulo || '', sigla: curso.sigla || null },
      podeEditar: p.geral, notaMinima: await R.notaMinimaDoCurso(cursoId), modulos
    });
  });

  professor.get('/modulos/:moduloId/avaliacoes', async (req, res) => {
    const m = await moduloDe(req.params.moduloId);
    if (!m) throw e404();
    await exigirDocente(req, m.cursoId);
    res.json({ itens: await itensDoModulo(m._id) });
  });

  professor.post('/modulos/:moduloId/avaliacoes', async (req, res) => {
    const m = await moduloDe(req.params.moduloId);
    if (!m) throw e404();
    await exigirDocenteGeral(req, m.cursoId);
    const tipo = lerEnum(req.body?.tipo, TIPOS_AVALIACAO, 'tipo', { obrigatorio: true });
    const cfg = lerConfiguracao(req.body, { moduloTcc: m.tipo === 'tcc' });
    const momento = agora();
    const doc = {
      cursoId: String(m.cursoId), moduloId: String(m._id), tipo, ...cfg,
      publicada: false, publicadaEm: null, despublicadaEm: null, versao: 1, criadoEm: momento, atualizadoEm: momento, criadoPor: userIdDe(req)
    };
    try {
      const r = await col.avaliacoes().insertOne(doc);
      doc._id = r.insertedId;
    } catch (err) {
      if (err?.code === 11000) throw e409('registro-duplicado', tipo === 'modular' ? 'Este módulo já tem uma atividade modular.' : 'Este módulo já tem uma atividade prévia.');
      throw err;
    }
    res.status(201).json({ avaliacao: avaliacaoParaEquipe(doc) });
  });

  async function avaliacaoDaEquipe(req, id, { geral = false } = {}) {
    const a = await R.avaliacaoPorId(id);
    if (!a) throw e404();
    const p = geral ? await exigirDocenteGeral(req, a.cursoId) : await exigirDocente(req, a.cursoId);
    return { a, p };
  }

  function lerVersao(corpo) {
    const v = corpo?.versao;
    if (!Number.isInteger(v) || v < 0) throw e400({ versao: 'Informe a versão.' });
    return v;
  }

  professor.put('/avaliacoes/:id', async (req, res) => {
    const { a } = await avaliacaoDaEquipe(req, req.params.id, { geral: true });
    const versao = lerVersao(req.body);
    const m = await repo('modulos').findOne({ _id: String(a.moduloId) }, { projection: { tipo: 1 } });
    const cfg = lerConfiguracao(req.body, { parcial: true, moduloTcc: m?.tipo === 'tcc' });
    if (Object.hasOwn(req.body || {}, 'tipo')) {
      const tipo = lerEnum(req.body.tipo, TIPOS_AVALIACAO, 'tipo', { obrigatorio: true });
      if (tipo !== a.tipo) {
        if (await col.tentativas().countDocuments({ avaliacaoId: a._id })) throw e409('tem-registros', 'O tipo não muda depois da primeira tentativa.');
        cfg.tipo = tipo;
      }
    }
    if (a.versao !== versao) throw e409('conflito-versao');
    try {
      const r = await col.avaliacoes().updateOne({ _id: a._id, versao }, { $set: { ...cfg, atualizadoEm: agora() }, $inc: { versao: 1 } });
      if (!r.matchedCount) throw e409('conflito-versao');
    } catch (err) {
      if (err?.code === 11000) throw e409('registro-duplicado', 'Este módulo já tem uma atividade deste tipo.');
      throw err;
    }
    res.json({ avaliacao: avaliacaoParaEquipe(await col.avaliacoes().findOne({ _id: a._id })) });
  });

  professor.post('/avaliacoes/:id/publicar', async (req, res) => {
    const { a } = await avaliacaoDaEquipe(req, req.params.id, { geral: true });
    const contagens = await R.contagemDoBanco(a._id);
    const conferencia = conferirBanco(a.sorteio, contagens);
    if (!conferencia.ok) throw e409('banco-insuficiente', undefined, { faltando: conferencia.faltando });
    const momento = agora();
    if (!a.publicada) {
      await col.avaliacoes().updateOne({ _id: a._id }, { $set: { publicada: true, publicadaEm: momento, despublicadaEm: null, atualizadoEm: momento }, $inc: { versao: 1 } });
      await auditoria.registrar({ acao: 'avaliacao.publicada', entidade: { tipo: 'avaliacao', id: hex(a._id) }, cursoId: a.cursoId, extra: { tipo: a.tipo, moduloId: a.moduloId } }, req);
      const alunos = await alunosAtivosDoCurso(a.cursoId);
      if (alunos && alunos.length) {
        await notificar({
          userIds: alunos.map(x => x.userId), tipo: 'avaliacao.publicada',
          titulo: a.tipo === 'modular' ? 'Nova atividade modular disponível' : 'Nova atividade prévia disponível',
          texto: a.titulo, link: `aula.html?curso=${a.cursoId}&modulo=${a.moduloId}&item=avaliacao:${hex(a._id)}`,
          entidade: { tipo: 'avaliacao', id: hex(a._id) }
        });
      } else if (alunos === null) logar('secretaria.alunosDoCurso ausente: avaliação publicada sem notificar os alunos');
    }
    res.json({ avaliacao: avaliacaoParaEquipe(await col.avaliacoes().findOne({ _id: a._id })), avisos: conferencia.avisos });
  });

  professor.post('/avaliacoes/:id/despublicar', async (req, res) => {
    const { a, p } = await avaliacaoDaEquipe(req, req.params.id, { geral: true });
    const motivo = lerTexto(req.body, 'motivo', { min: 10, max: 500, obrigatorio: true, multilinha: true });
    const comTentativas = await col.tentativas().countDocuments({ avaliacaoId: a._id });
    if (comTentativas && !p.admin) throw new ErroPortal(403, 'papel-insuficiente', 'Com tentativas feitas, só a coordenação pode despublicar.');
    if (!a.publicada) return res.json({ avaliacao: avaliacaoParaEquipe(a) });
    const momento = agora();
    await auditoria.executar({
      acao: 'avaliacao.despublicada', entidade: { tipo: 'avaliacao', id: hex(a._id) }, cursoId: a.cursoId, motivo,
      mudancas: [{ campo: 'publicada', de: true, para: false }], extra: { tentativas: comTentativas }
    }, req, () => col.avaliacoes().updateOne({ _id: a._id }, { $set: { publicada: false, despublicadaEm: momento, atualizadoEm: momento }, $inc: { versao: 1 } }));
    res.json({ avaliacao: avaliacaoParaEquipe(await col.avaliacoes().findOne({ _id: a._id })) });
  });

  professor.delete('/avaliacoes/:id', async (req, res) => {
    const { a } = await avaliacaoDaEquipe(req, req.params.id, { geral: true });
    if (await col.tentativas().countDocuments({ avaliacaoId: a._id })) throw e409('tem-registros');
    await col.questoes().deleteMany({ avaliacaoId: a._id });
    await col.avaliacoes().deleteOne({ _id: a._id });
    res.json({ ok: true });
  });

  // ---------- banco de questões ----------
  function lerQuestao(corpo, { moduloTcc, tipoAtual = null }) {
    const c = corpo && typeof corpo === 'object' ? corpo : {};
    const tipo = tipoAtual || lerEnum(c.tipo, TIPOS_QUESTAO, 'tipo', { obrigatorio: true });
    if (tipo === 'arquivo' && !moduloTcc) throw new ErroPortal(400, 'modulo-nao-tcc');
    const out = { tipo };
    out.enunciado = lerTexto(c, 'enunciado', { min: 3, max: 4000, obrigatorio: true, multilinha: true });
    out.explicacao = lerTexto(c, 'explicacao', { max: 4000, multilinha: true }) ?? '';
    const pontos = lerNumero(c.pontos ?? 1, { min: 0.25, max: 100, casas: 2 }, 'pontos');
    if (Math.round(pontos * 4) !== pontos * 4) throw e400({ pontos: 'Use múltiplos de 0,25.' });
    out.pontos = pontos;
    const presente = k => c[k] !== undefined && c[k] !== null && c[k] !== '';
    if (tipo === 'objetiva') {
      const campos = {};
      for (const k of ['orientacao', 'limiteCaracteres', 'respostaReferencia']) if (presente(k)) campos[k] = 'Não se aplica a questão objetiva.';
      if (Object.keys(campos).length) throw e400(campos);
      if (!Array.isArray(c.alternativas)) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { alternativas: 'Formato inválido.' } });
      if (c.alternativas.length < 2 || c.alternativas.length > 6) throw e400({ alternativas: 'Use de 2 a 6 alternativas.' });
      const mapa = new Map();
      out.alternativas = c.alternativas.map((alt, i) => {
        const id = IDS_ALTERNATIVA[i];
        const original = alt && typeof alt === 'object' ? alt.id : undefined;
        if (typeof original === 'string') mapa.set(original, id);
        const textoAlt = lerTexto(alt && typeof alt === 'object' ? alt : {}, 'texto', { min: 1, max: 1000, obrigatorio: true, multilinha: true });
        return { id, texto: textoAlt };
      });
      const corretaBruta = c.corretaId;
      const corretaId = typeof corretaBruta === 'string' ? (mapa.get(corretaBruta) || (out.alternativas.some(x => x.id === corretaBruta) && !mapa.size ? corretaBruta : null)) : null;
      if (!corretaId) throw e400({ corretaId: 'Marque a alternativa correta.' });
      out.corretaId = corretaId;
      out.orientacao = null; out.limiteCaracteres = null; out.respostaReferencia = null;
    } else {
      if (presente('alternativas') && Array.isArray(c.alternativas) && c.alternativas.length) throw e400({ alternativas: 'Não se aplica a esta questão.' });
      out.alternativas = []; out.corretaId = null;
      out.orientacao = lerTexto(c, 'orientacao', { max: 2000, multilinha: true });
      out.respostaReferencia = lerTexto(c, 'respostaReferencia', { max: 8000, multilinha: true });
      if (tipo === 'dissertativa') {
        out.limiteCaracteres = lerInteiro(c.limiteCaracteres ?? LIMITE_CARACTERES_PADRAO, { min: 100, max: 10000 }, 'limiteCaracteres');
      } else {
        if (presente('limiteCaracteres')) throw e400({ limiteCaracteres: 'Não se aplica a entrega de arquivo.' });
        out.limiteCaracteres = null;
      }
    }
    return out;
  }

  professor.get('/avaliacoes/:id/questoes', async (req, res) => {
    const { a, p } = await avaliacaoDaEquipe(req, req.params.id);
    const qs = await col.questoes().find({ avaliacaoId: a._id }).sort({ criadoEm: 1 }).toArray();
    const m = await repo('modulos').findOne({ _id: String(a.moduloId) }, { projection: { numero: 1, titulo: 1, tipo: 1 } });
    const curso = await repo('cursos').findOne({ _id: String(a.cursoId) }, { projection: { titulo: 1, sigla: 1 } });
    res.json({
      avaliacao: { ...avaliacaoParaEquipe(a), ...(await contagensDaAvaliacao(a)) },
      modulo: m ? { id: String(m._id), numero: m.numero ?? null, titulo: m.titulo ?? '', tipo: m.tipo === 'tcc' ? 'tcc' : 'regular' } : null,
      curso: curso ? { id: String(curso._id), titulo: curso.titulo || '', sigla: curso.sigla || null } : null,
      podeEditar: p.geral, notaMinima: await R.notaMinimaDoCurso(a.cursoId),
      avisos: avisosDe(a),
      itens: qs.map(questaoParaEquipe)
    });
  });

  professor.post('/avaliacoes/:id/questoes', async (req, res) => {
    const { a } = await avaliacaoDaEquipe(req, req.params.id, { geral: true });
    const m = await repo('modulos').findOne({ _id: String(a.moduloId) }, { projection: { tipo: 1 } });
    const dados = lerQuestao(req.body, { moduloTcc: m?.tipo === 'tcc' });
    const momento = agora();
    const doc = { avaliacaoId: a._id, cursoId: a.cursoId, moduloId: a.moduloId, ...dados, ativa: true, sorteada: false, versao: 1, criadoEm: momento, atualizadoEm: momento, criadoPor: userIdDe(req) };
    const r = await col.questoes().insertOne(doc);
    doc._id = r.insertedId;
    res.status(201).json({ questao: questaoParaEquipe(doc) });
  });

  async function questaoDaEquipe(req, id) {
    const q = await R.questaoPorId(id);
    if (!q) throw e404();
    await exigirDocenteGeral(req, q.cursoId);
    return q;
  }

  professor.put('/questoes/:id', async (req, res) => {
    const q = await questaoDaEquipe(req, req.params.id);
    const versao = lerVersao(req.body);
    if (req.body?.tipo !== undefined && req.body.tipo !== q.tipo) throw e400({ tipo: 'O tipo da questão não muda. Crie outra questão.' });
    const m = await repo('modulos').findOne({ _id: String(q.moduloId) }, { projection: { tipo: 1 } });
    const dados = lerQuestao({ ...questaoParaEquipe(q), ...req.body }, { moduloTcc: m?.tipo === 'tcc', tipoAtual: q.tipo });
    if (q.versao !== versao) throw e409('conflito-versao');
    const mutar = async () => {
      const r = await col.questoes().updateOne({ _id: q._id, versao }, { $set: { ...dados, atualizadoEm: agora() }, $inc: { versao: 1 } });
      if (!r.matchedCount) throw e409('conflito-versao');
    };
    if (q.sorteada) {
      await auditoria.executar({
        acao: 'questao.alterada', entidade: { tipo: 'questao', id: hex(q._id) }, cursoId: q.cursoId,
        mudancas: auditoria.mudancas ? auditoria.mudancas(q, dados, ['enunciado', 'alternativas', 'corretaId', 'explicacao', 'pontos', 'orientacao', 'limiteCaracteres']) : null
      }, req, mutar);
    } else await mutar();
    res.json({ questao: questaoParaEquipe(await col.questoes().findOne({ _id: q._id })) });
  });

  professor.put('/questoes/:id/ativa', async (req, res) => {
    const q = await questaoDaEquipe(req, req.params.id);
    const versao = lerVersao(req.body);
    const ativa = lerBooleano(req.body?.ativa, 'ativa');
    if (ativa === null) throw e400({ ativa: 'Informe se a questão fica ativa.' });
    const r = await col.questoes().updateOne({ _id: q._id, versao }, { $set: { ativa, atualizadoEm: agora() }, $inc: { versao: 1 } });
    if (!r.matchedCount) throw e409('conflito-versao');
    res.json({ questao: questaoParaEquipe(await col.questoes().findOne({ _id: q._id })) });
  });

  professor.delete('/questoes/:id', async (req, res) => {
    const q = await questaoDaEquipe(req, req.params.id);
    if (q.sorteada) throw e409('tem-registros', 'Esta questão já foi sorteada. Desative em vez de excluir.');
    await col.questoes().deleteOne({ _id: q._id });
    res.json({ ok: true });
  });

  professor.get('/avaliacoes/:id/previa', async (req, res) => {
    const { a } = await avaliacaoDaEquipe(req, req.params.id);
    const banco = await col.questoes().find({ avaliacaoId: a._id, ativa: true }).toArray();
    const previa = previaParaEquipe(a, banco, { randomInt, agora: agora() });
    if (previa.erro) throw e409('banco-insuficiente', undefined, { faltando: previa.faltando });
    res.json({
      avaliacao: { id: hex(a._id), tipo: a.tipo, titulo: a.titulo, instrucoes: a.instrucoes || '', nQuestoes: totalDoSorteio(a.sorteio), tentativasMax: a.tentativasMax, tempoLimiteMin: a.tempoLimiteMin ?? null, publicada: a.publicada === true },
      notaMinima: await R.notaMinimaDoCurso(a.cursoId),
      ...previa
    });
  });

  // ---------- resultados ----------
  async function nomesDe(userIds) {
    const f = perfis?.publicos || servicos.tentar('perfis.publicos');
    if (typeof f !== 'function') return new Map();
    try { return await f([...new Set(userIds.map(String))]); } catch (err) { logar('perfis.publicos falhou', err); return new Map(); }
  }

  professor.get('/avaliacoes/:id/resultados', async (req, res) => {
    const { a } = await avaliacaoDaEquipe(req, req.params.id);
    const visiveis = await acesso.turmasVisiveis(req, a.cursoId);
    let turmaFiltro = null;
    if (req.query.turmaId) {
      const t = String(req.query.turmaId);
      if (visiveis !== null && !visiveis.includes(t)) throw new ErroPortal(403, 'nao-docente');
      turmaFiltro = [t];
    } else if (visiveis !== null) turmaFiltro = visiveis;
    const filtro = { avaliacaoId: a._id };
    if (turmaFiltro) filtro.turmaId = { $in: turmaFiltro };
    const tentativas = await col.tentativas().find(filtro, { projection: { questoes: 0, respostas: 0, correcao: 0 } }).toArray();
    const porMatricula = new Map();
    for (const t of tentativas) {
      const k = hex(t.matriculaId);
      if (!porMatricula.has(k)) porMatricula.set(k, []);
      porMatricula.get(k).push(t);
    }
    const alunosDoCurso = await (async () => {
      const f = servicos.tentar('secretaria.alunosDoCurso');
      if (typeof f !== 'function') return null;
      try { return await f({ cursoId: String(a.cursoId), ...(turmaFiltro && turmaFiltro.length === 1 ? { turmaId: turmaFiltro[0] } : {}), status: 'ativa' }); } catch { return null; }
    })();
    const notaMinima = await R.notaMinimaDoCurso(a.cursoId);
    const regs = await col.alunos().find({ avaliacaoId: a._id }).toArray();
    const regPorMatricula = new Map(regs.map(r => [hex(r.matriculaId), r]));
    const linhasBase = [];
    const vistos = new Set();
    for (const [matriculaId, lista] of porMatricula) {
      vistos.add(matriculaId);
      linhasBase.push({ matriculaId, userId: String(lista[0].userId), numero: lista[0].matriculaNumero ?? null, turmaCodigo: lista[0].turmaCodigo ?? null, lista });
    }
    if (Array.isArray(alunosDoCurso)) {
      for (const al of alunosDoCurso) {
        const mid = hex(al.matriculaId);
        if (vistos.has(mid)) continue;
        if (turmaFiltro && !turmaFiltro.includes(hex(al.turmaId))) continue;
        linhasBase.push({ matriculaId: mid, userId: String(al.userId), numero: al.numero ?? null, turmaCodigo: al.turmaCodigo ?? null, lista: [] });
      }
    }
    const nomes = await nomesDe(linhasBase.map(l => l.userId));
    const itens = linhasBase.map(l => {
      const est = estadoDoAluno({ avaliacao: a, tentativas: l.lista, registro: regPorMatricula.get(l.matriculaId) || null, notaMinima, matriculaAtiva: true });
      const pessoa = nomes.get(l.userId);
      return {
        matriculaId: l.matriculaId, numero: l.numero, turmaCodigo: l.turmaCodigo,
        aluno: { nome: pessoa?.nome ?? null, nomeSocial: pessoa?.nomeSocial ?? null, fotoUrl: pessoa?.fotoUrl ?? null },
        tentativas: { usadas: est.usadas, permitidas: est.permitidas }, melhorNota: est.melhorNota,
        situacao: est.situacao, situacaoRotulo: est.situacaoRotulo, finalizada: est.finalizada, aguardandoCorrecao: est.aguardandoCorrecao
      };
    }).sort((x, y) => String(x.aluno.nome || '').localeCompare(String(y.aluno.nome || ''), 'pt-BR'));
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: POR_PAGINA_RESULTADOS, max: POR_PAGINA_RESULTADOS });
    const notas = itens.map(i => i.melhorNota).filter(n => n !== null);
    const kpis = {
      alunos: Array.isArray(alunosDoCurso) ? itens.length : null,
      fizeram: itens.filter(i => i.tentativas.usadas > 0).length,
      mediaMelhores: notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null,
      aprovados: a.tipo === 'modular' ? itens.filter(i => i.situacao === 'aprovado').length : null,
      emRecuperacao: a.tipo === 'modular' ? itens.filter(i => i.situacao === 'em_recuperacao').length : null,
      aCorrigir: itens.filter(i => i.aguardandoCorrecao).length
    };
    res.json({ itens: itens.slice(pular, pular + porPagina), pagina, porPagina, total: itens.length, totalPaginas: Math.max(1, Math.ceil(itens.length / porPagina)), kpis, notaMinima });
  });

  // ---------- correção ----------
  async function cursosVisiveisDaEquipe(req) {
    const c = await acesso.contexto(req);
    if (c.papel === 'admin') return null; // todos
    return [...c.cursosDocente];
  }

  professor.get('/correcoes', async (req, res) => {
    const status = req.query.status === 'corrigida' ? 'corrigida' : 'aguardando_correcao';
    const visiveis = await cursosVisiveisDaEquipe(req);
    const filtroBase = {};
    if (req.query.cursoId) {
      const c = String(req.query.cursoId);
      if (visiveis !== null && !visiveis.includes(c)) throw new ErroPortal(403, 'nao-docente');
      filtroBase.cursoId = c;
    } else if (visiveis !== null) filtroBase.cursoId = { $in: visiveis };
    if (req.query.avaliacaoId) { const o = comoOid(req.query.avaliacaoId); if (!o) throw e404(); filtroBase.avaliacaoId = o; }
    const turmaPedida = req.query.turmaId ? String(req.query.turmaId) : null;

    const todos = await col.tentativas().find({ ...filtroBase, status: { $in: ['aguardando_correcao', 'corrigida'] } }, { projection: { respostas: 0 } }).toArray();
    const cacheTurmas = new Map();
    const visivel = async t => {
      const cid = String(t.cursoId);
      if (!cacheTurmas.has(cid)) cacheTurmas.set(cid, await acesso.turmasVisiveis(req, cid));
      const tv = cacheTurmas.get(cid);
      if (turmaPedida) {
        if (tv !== null && !tv.includes(turmaPedida)) throw new ErroPortal(403, 'nao-docente');
        return hex(t.turmaId) === turmaPedida;
      }
      return tv === null || (t.turmaId && tv.includes(hex(t.turmaId)));
    };
    const filtradas = [];
    for (const t of todos) if (await visivel(t)) filtradas.push(t);
    const contagens = { aguardando: filtradas.filter(t => t.status === 'aguardando_correcao').length, corrigidas: filtradas.filter(t => t.status === 'corrigida').length };
    const lista = filtradas.filter(t => t.status === status);
    lista.sort((x, y) => {
      if (status === 'aguardando_correcao') return new Date(x.enviadaEm) - new Date(y.enviadaEm);
      return new Date(y.corrigidaEm || y.enviadaEm) - new Date(x.corrigidaEm || x.enviadaEm);
    });
    const { pagina, porPagina, pular } = lerPagina(req.query, { porPaginaPadrao: POR_PAGINA_CORRECAO, max: 100 });
    const pag = lista.slice(pular, pular + porPagina);
    const avIds = [...new Set(pag.map(t => hex(t.avaliacaoId)))];
    const avs = avIds.length ? await col.avaliacoes().find({ _id: { $in: avIds.map(comoOid) } }, { projection: { titulo: 1, tipo: 1 } }).toArray() : [];
    const avPorId = new Map(avs.map(x => [hex(x._id), x]));
    const modIds = [...new Set(pag.map(t => String(t.moduloId)))];
    const mods = modIds.length ? await repo('modulos').find({ _id: { $in: modIds } }, { projection: { numero: 1, titulo: 1 } }).toArray() : [];
    const modPorId = new Map(mods.map(x => [String(x._id), x]));
    const cursoIds = [...new Set(pag.map(t => String(t.cursoId)))];
    const cursos = cursoIds.length ? await repo('cursos').find({ _id: { $in: cursoIds } }, { projection: { titulo: 1, sigla: 1 } }).toArray() : [];
    const cursoPorId = new Map(cursos.map(x => [String(x._id), x]));
    const nomes = await nomesDe(pag.map(t => String(t.userId)));
    res.json({
      itens: pag.map(t => {
        const av = avPorId.get(hex(t.avaliacaoId));
        const md = modPorId.get(String(t.moduloId));
        const cs = cursoPorId.get(String(t.cursoId));
        const pessoa = nomes.get(String(t.userId));
        return {
          tentativaId: hex(t._id), status: t.status, numero: t.numero, enviadaEm: t.enviadaEm, corrigidaEm: t.corrigidaEm || null,
          nota: t.status === 'corrigida' ? (t.nota ?? null) : null,
          aluno: { nome: pessoa?.nome ?? null, nomeSocial: pessoa?.nomeSocial ?? null },
          matriculaNumero: t.matriculaNumero ?? null, turmaCodigo: t.turmaCodigo ?? null,
          curso: cs ? { id: String(cs._id), titulo: cs.titulo || '', sigla: cs.sigla || null } : { id: String(t.cursoId), titulo: '', sigla: null },
          avaliacao: { id: hex(t.avaliacaoId), titulo: av?.titulo ?? '', tipo: av?.tipo ?? t.tipo },
          modulo: { numero: md?.numero ?? null, titulo: md?.titulo ?? '' },
          dissertativasPendentes: (t.questoes || []).filter(q => q.tipo !== 'objetiva' && !Number.isFinite(Number(t.correcao?.[q.questaoId]?.pontos))).length
        };
      }),
      pagina, porPagina, total: lista.length, totalPaginas: Math.max(1, Math.ceil(lista.length / porPagina)), contagens
    });
  });

  async function tentativaDaEquipe(req, id) {
    const t = await R.tentativaPorId(id);
    if (!t || !(await equipeVeTentativa(req, t))) throw e404(null, 'Tentativa não encontrada.');
    return t;
  }

  async function efeitoDe(t, totais) {
    const a = await R.avaliacaoPorId(t.avaliacaoId);
    const contaParaNota = !!(a && a.tipo === 'modular' && a.publicada);
    const base = { completa: totais.completa, contaParaNota, notaTentativa: totais.completa ? totais.nota : null, notaModulo: null, situacaoModulo: null, situacaoModuloRotulo: null, restantes: null };
    if (!contaParaNota) return base;
    const svc = R.servicos.notaDoModulo;
    const n = await svc(hex(t.matriculaId), String(t.moduloId), totais.completa ? { simular: { tentativaId: hex(t._id), nota: totais.nota } } : {});
    return { ...base, notaModulo: n.nota, situacaoModulo: n.situacao, situacaoModuloRotulo: n.situacao ? ROTULOS_SITUACAO[n.situacao] : null, restantes: n.tentativas.restantes, notaMinima: n.notaMinima };
  }

  function tentativaParaEquipe(t) {
    return {
      id: hex(t._id), numero: t.numero, status: t.status, avaliacaoId: hex(t.avaliacaoId), cursoId: t.cursoId, moduloId: t.moduloId,
      tipo: t.tipo, matriculaId: hex(t.matriculaId), userId: String(t.userId), matriculaNumero: t.matriculaNumero ?? null, turmaCodigo: t.turmaCodigo ?? null,
      iniciadaEm: t.iniciadaEm, prazoEm: t.prazoEm, enviadaEm: t.enviadaEm, expirada: t.expirada === true, corrigidaEm: t.corrigidaEm || null,
      acertosObjetivas: t.acertosObjetivas ?? 0, totalObjetivas: t.totalObjetivas ?? 0, pontosObtidos: t.pontosObtidos ?? null, pontosPossiveis: t.pontosPossiveis ?? null,
      nota: t.nota ?? null, pctAcerto: t.pctAcerto ?? null, codigo: t.codigo || null, versao: t.versao ?? 1,
      questoes: (t.questoes || []).map(q => {
        const r = (t.respostas || {})[q.questaoId] || null;
        return {
          ...q,
          resposta: r ? (r.arquivo ? { arquivo: { tamanho: r.arquivo.tamanho, sha256: r.arquivo.sha256 }, em: r.em } : { alternativaId: r.alternativaId ?? null, texto: r.texto ?? null, em: r.em }) : null,
          acertou: q.tipo === 'objetiva' ? !!(r && r.alternativaId && r.alternativaId === q.corretaId) : null,
          correcao: (t.correcao || {})[q.questaoId] || null
        };
      })
    };
  }

  professor.get('/tentativas/:id', async (req, res) => {
    const t = await tentativaDaEquipe(req, req.params.id);
    const [nomes, a, m, curso] = await Promise.all([
      nomesDe([String(t.userId)]), R.avaliacaoPorId(t.avaliacaoId),
      repo('modulos').findOne({ _id: String(t.moduloId) }, { projection: { numero: 1, titulo: 1 } }),
      repo('cursos').findOne({ _id: String(t.cursoId) }, { projection: { titulo: 1, sigla: 1 } })
    ]);
    const pessoa = nomes.get(String(t.userId));
    const usadas = await col.tentativas().countDocuments({ matriculaId: t.matriculaId, avaliacaoId: t.avaliacaoId });
    const reg = await R.registroDoAluno(t.matriculaId, t.avaliacaoId);
    res.json({
      tentativa: tentativaParaEquipe(t),
      aluno: { nome: pessoa?.nome ?? null, nomeSocial: pessoa?.nomeSocial ?? null },
      avaliacao: a ? { id: hex(a._id), titulo: a.titulo, tipo: a.tipo, publicada: a.publicada === true, permitidas: (a.tentativasMax || 1) + (Number(reg?.tentativasExtras) || 0) } : null,
      modulo: m ? { id: String(m._id), numero: m.numero ?? null, titulo: m.titulo ?? '' } : null,
      curso: curso ? { id: String(curso._id), titulo: curso.titulo || '', sigla: curso.sigla || null } : null,
      usadas,
      efeito: await efeitoDe(t, calcularTotais(t))
    });
  });

  professor.get('/tentativas/:id/respostas/:questaoId/arquivo', async (req, res) => {
    const t = await tentativaDaEquipe(req, req.params.id);
    await enviarEntrega(res, t, req.params.questaoId);
  });

  function lerItensCorrecao(t, itens) {
    if (itens === undefined || itens === null) return {};
    if (!Array.isArray(itens)) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { itens: 'Formato inválido.' } });
    const set = {};
    itens.forEach((it, i) => {
      if (!it || typeof it !== 'object' || typeof it.questaoId !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { [`itens.${i}`]: 'Formato inválido.' } });
      const q = (t.questoes || []).find(x => x.questaoId === it.questaoId);
      if (!q || q.tipo === 'objetiva') throw e400({ [`itens.${i}.questaoId`]: 'Questão sem correção manual nesta tentativa.' });
      const pontos = lerNumero(it.pontos, { min: 0, max: Number(q.pontos) || 0, obrigatorio: true }, `itens.${i}.pontos`);
      if (Math.abs(Math.round(pontos * 4) - pontos * 4) > 1e-9) throw e400({ [`itens.${i}.pontos`]: 'Use múltiplos de 0,25.' });
      const comentario = lerTexto(it, 'comentario', { max: 4000, multilinha: true }) ?? '';
      set[q.questaoId] = { pontos, comentario };
    });
    return set;
  }

  async function publicarCorrecao(req, t, { recorrecao = false, motivo = null, antes = null } = {}) {
    const totais = calcularTotais(t);
    const momento = agora();
    const set = { status: 'corrigida', corrigidaEm: momento, pontosObtidos: totais.pontosObtidos, nota: totais.nota, pctAcerto: totais.pctAcerto, acertosObjetivas: totais.acertosObjetivas, totalObjetivas: totais.totalObjetivas };
    for (const [qid, c] of Object.entries(t.correcao || {})) set[`correcao.${qid}`] = c;
    const evento = {
      acao: recorrecao ? 'tentativa.recorrigida' : 'tentativa.corrigida',
      entidade: { tipo: 'tentativa', id: hex(t._id) }, alvoUserId: String(t.userId), cursoId: t.cursoId,
      mudancas: [{ campo: 'nota', de: antes, para: totais.nota }],
      ...(motivo ? { motivo } : {})
    };
    await auditoria.executar(evento, req, async () => {
      const { r } = await gravarComCodigo({ _id: t._id, versao: t.versao }, set, t, { codigoExistente: t.codigo || null });
      if (!r.matchedCount) throw e409('conflito-versao');
    });
    await notificar({
      userIds: [String(t.userId)], tipo: recorrecao ? 'nota.alterada' : 'avaliacao.corrigida',
      titulo: recorrecao ? 'Nota de avaliação revisada' : 'Avaliação corrigida',
      texto: recorrecao ? 'A correção de uma avaliação foi revisada pelo professor.' : 'O professor publicou a correção da sua avaliação.',
      link: `academico.html?m=${hex(t.matriculaId)}`, entidade: { tipo: 'tentativa', id: hex(t._id) }
    });
  }

  professor.put('/tentativas/:id/correcao', async (req, res) => {
    const t = await tentativaDaEquipe(req, req.params.id);
    if (t.status !== 'aguardando_correcao') throw e409('transicao-invalida', t.status === 'corrigida' ? 'A correção já foi publicada. Use Revisar correção.' : 'A tentativa ainda não foi enviada.');
    const versao = lerVersao(req.body);
    if (t.versao !== versao) throw e409('conflito-versao');
    const publicar = req.body?.publicar === undefined ? true : lerBooleano(req.body.publicar, 'publicar');
    const novos = lerItensCorrecao(t, req.body?.itens);
    const por = userIdDe(req);
    const momento = agora();
    const correcao = { ...(t.correcao || {}) };
    for (const [qid, c] of Object.entries(novos)) correcao[qid] = { ...c, por, em: momento };
    let atual = { ...t, correcao };
    if (Object.keys(novos).length) {
      const set = {};
      for (const [qid, c] of Object.entries(novos)) set[`correcao.${qid}`] = { ...c, por, em: momento };
      const r = await col.tentativas().updateOne({ _id: t._id, versao, status: 'aguardando_correcao' }, { $set: set, $inc: { versao: 1 } });
      if (!r.matchedCount) throw e409('conflito-versao');
      atual = { ...atual, versao: versao + 1 };
    }
    const totais = calcularTotais(atual);
    if (publicar && totais.completa) {
      await publicarCorrecao(req, atual);
      atual = await col.tentativas().findOne({ _id: t._id });
    }
    res.json({ tentativa: tentativaParaEquipe(atual), efeito: await efeitoDe(atual, calcularTotais(atual)) });
  });

  professor.put('/tentativas/:id/recorrecao', async (req, res) => {
    const t = await tentativaDaEquipe(req, req.params.id);
    if (t.status !== 'corrigida') throw e409('transicao-invalida');
    const motivo = lerTexto(req.body, 'motivo', { min: 10, max: 500, obrigatorio: true, multilinha: true });
    const versao = lerVersao(req.body);
    if (t.versao !== versao) throw e409('conflito-versao');
    const novos = lerItensCorrecao(t, req.body?.itens);
    if (!Object.keys(novos).length) throw e400({ itens: 'Informe ao menos uma questão revisada.' });
    const por = userIdDe(req);
    const momento = agora();
    const correcao = { ...(t.correcao || {}) };
    for (const [qid, c] of Object.entries(novos)) correcao[qid] = { ...c, por, em: momento };
    await publicarCorrecao(req, { ...t, correcao }, { recorrecao: true, motivo, antes: t.nota ?? null });
    const atual = await col.tentativas().findOne({ _id: t._id });
    res.json({ tentativa: tentativaParaEquipe(atual), efeito: await efeitoDe(atual, calcularTotais(atual)) });
  });

  professor.post('/avaliacoes/:id/concessoes', async (req, res) => {
    const { a } = await avaliacaoDaEquipe(req, req.params.id);
    const matriculaId = comoOid(req.body?.matriculaId);
    if (!matriculaId) throw e404(null, 'Matrícula não encontrada.');
    const quantidade = lerInteiro(req.body?.quantidade ?? 1, { min: 1, max: 3, obrigatorio: true }, 'quantidade');
    const motivo = lerTexto(req.body, 'motivo', { min: 10, max: 500, obrigatorio: true, multilinha: true });
    const matricula = await R.matriculaPorId(matriculaId);
    if (!matricula || String(matricula.cursoId) !== String(a.cursoId)) throw e404(null, 'Matrícula não encontrada.');
    if (!(await acesso.podeGerirTurma(req, matricula.cursoId, matricula.turmaId ?? null))) throw e404(null, 'Matrícula não encontrada.');
    const momento = agora();
    const reg = await R.registroDoAluno(matriculaId, a._id);
    const reabriu = !!reg?.finalizadaEm;
    await auditoria.executar({
      acao: 'tentativa.concedida', entidade: { tipo: 'avaliacao', id: hex(a._id) }, alvoUserId: String(matricula.userId), cursoId: a.cursoId, motivo,
      mudancas: [{ campo: 'tentativasExtras', de: Number(reg?.tentativasExtras) || 0, para: (Number(reg?.tentativasExtras) || 0) + quantidade }],
      extra: { matriculaId: hex(matriculaId), quantidade, reabriu }
    }, req, async () => {
      await col.alunos().updateOne(
        { matriculaId, avaliacaoId: a._id },
        { $setOnInsert: { userId: String(matricula.userId), criadoEm: momento, finalizadaEm: null }, $set: { atualizadoEm: momento } },
        { upsert: true }
      );
      await col.alunos().updateOne(
        { matriculaId, avaliacaoId: a._id },
        { $inc: { tentativasExtras: quantidade }, $set: { finalizadaEm: null }, $push: { concessoes: { quantidade, por: userIdDe(req), em: momento, motivo, reabriu } } }
      );
    });
    await notificar({
      userIds: [String(matricula.userId)], tipo: 'tentativa.concedida', titulo: 'Nova tentativa liberada',
      texto: `Uma nova tentativa foi liberada em ${a.titulo}.`, link: `academico.html?m=${hex(matriculaId)}`, entidade: { tipo: 'avaliacao', id: hex(a._id) }
    });
    const { estado } = await R.estadoDaMatricula(a, matricula);
    res.json({ estado: { ...estado, abertaId: undefined } });
  });

  // =============================================================
  // Contribuições aos grupos (API §4.4)
  // =============================================================
  const validadorAVL = {
    prefixo: 'AVL',
    async validar(codigo) {
      if (typeof codigo !== 'string' || !CODIGO_VERIFICACAO_RE.test(codigo) || !codigo.startsWith('AVL-')) return null;
      const t = await col.tentativas().findOne({ codigo, status: 'corrigida' });
      if (!t) return null;
      const [curso, nomes] = await Promise.all([
        repo('cursos').findOne({ _id: String(t.cursoId) }, { projection: { titulo: 1 } }),
        nomesDe([String(t.userId)])
      ]);
      let integro = null;
      if (assinador && t.hash && t.kid) integro = assinador.verificar('avaliacao', camposDoSelo(t), t.hash, t.kid);
      const nome = nomes.get(String(t.userId))?.nome || '';
      return {
        valido: true, codigo, tipo: 'avaliacao', rotulo: 'Comprovante de avaliação', emitidoEm: t.corrigidaEm || t.enviadaEm,
        emissor: 'Complexo DMC', iniciais: nome ? iniciaisDe(nome) : null, integro, situacao: 'valido',
        hashPrefixo: t.hash ? t.hash.slice(0, 16).toUpperCase().match(/.{4}/g).join('-') : null,
        detalhes: { curso: curso?.titulo || null, avaliacaoTipo: t.tipo, enviadaEm: t.enviadaEm }
      };
    },
    async nomeTitular(codigo) {
      if (typeof codigo !== 'string' || !codigo.startsWith('AVL-')) return null;
      const t = await col.tentativas().findOne({ codigo, status: 'corrigida' }, { projection: { userId: 1 } });
      if (!t) return null;
      const ident = servicos.tentar('perfis.identificacao');
      if (typeof ident === 'function') {
        const i = await ident(String(t.userId));
        if (i?.nomeRegistro) return i.nomeRegistro;
      }
      return (await nomesDe([String(t.userId)])).get(String(t.userId))?.nome || null;
    }
  };

  const cascata = {
    dominio: 'avaliacoes',
    async bloqueios(alvo) {
      if (!alvo || !alvo.id) return 0;
      if (alvo.tipo === 'curso') return col.tentativas().countDocuments({ cursoId: String(alvo.id) });
      if (alvo.tipo === 'modulo') return col.tentativas().countDocuments({ moduloId: String(alvo.id) });
      return 0;
    },
    async apagar(alvo) {
      if (!alvo || !alvo.id) return;
      const filtro = alvo.tipo === 'curso' ? { cursoId: String(alvo.id) } : alvo.tipo === 'modulo' ? { moduloId: String(alvo.id) } : null;
      if (!filtro) return;
      await col.questoes().deleteMany(filtro);
      await col.avaliacoes().deleteMany(filtro);
    }
  };

  const painel = {
    bloco: 'academico',
    chaves: ['correcoesPendentes'],
    papeis: ['admin', 'professor'],
    async contar(_req, escopo = {}) {
      const filtro = { status: 'aguardando_correcao' };
      if (Array.isArray(escopo.cursoIds)) filtro.cursoId = { $in: escopo.cursoIds.map(String) };
      if (Array.isArray(escopo.turmaIds)) filtro.turmaId = { $in: escopo.turmaIds.map(hex) };
      return { correcoesPendentes: await col.tentativas().countDocuments(filtro) };
    }
  };

  // ---------- relatórios (grupo `relatorio`, API §6.11.3) ----------
  async function escopoDoRelatorio(req, filtros) {
    const cursoId = lerIdLegado(filtros?.cursoId || '');
    if (!cursoId) throw e400({ cursoId: 'Escolha o curso.' });
    await exigirDocente(req, cursoId);
    const visiveis = await acesso.turmasVisiveis(req, cursoId);
    const turmaId = filtros?.turmaId ? String(filtros.turmaId) : null;
    if (turmaId && visiveis !== null && !visiveis.includes(turmaId)) throw new ErroPortal(403, 'nao-docente');
    return { cursoId, turmas: turmaId ? [turmaId] : visiveis };
  }
  const dentroDasTurmas = (turmas, turmaId) => turmas === null || (turmaId && turmas.includes(hex(turmaId)));

  async function linhasDeNotas(req, filtros, limite) {
    const { cursoId, turmas } = await escopoDoRelatorio(req, filtros);
    const curso = await repo('cursos').findOne({ _id: cursoId }, { projection: { titulo: 1, sigla: 1 } });
    const modulares = await col.avaliacoes().find({ cursoId, tipo: 'modular', publicada: true }).toArray();
    const mods = modulares.length ? await repo('modulos').find({ _id: { $in: modulares.map(a => String(a.moduloId)) } }, { projection: { numero: 1, titulo: 1, ordem: 1 } }).toArray() : [];
    mods.sort((x, y) => (Number(x.ordem) || 0) - (Number(y.ordem) || 0));
    let matriculas = null;
    const f = servicos.tentar('secretaria.alunosDoCurso');
    if (typeof f === 'function') {
      try { matriculas = await f({ cursoId, status: ['ativa', 'trancada', 'concluida'] }); } catch (err) { logar('secretaria.alunosDoCurso falhou', err); }
    }
    if (!Array.isArray(matriculas)) {
      const ts = await col.tentativas().find({ cursoId }, { projection: { matriculaId: 1, userId: 1, matriculaNumero: 1, turmaId: 1, turmaCodigo: 1 } }).toArray();
      const vistas = new Map();
      for (const t of ts) if (!vistas.has(hex(t.matriculaId))) vistas.set(hex(t.matriculaId), { matriculaId: hex(t.matriculaId), userId: String(t.userId), numero: t.matriculaNumero ?? null, turmaId: t.turmaId ?? null, turmaCodigo: t.turmaCodigo ?? null });
      matriculas = [...vistas.values()];
    }
    matriculas = matriculas.filter(m => dentroDasTurmas(turmas, m.turmaId));
    if (matriculas.length * Math.max(1, mods.length) > limite) throw new ErroPortal(413, 'relatorio-grande');
    const nomes = await nomesDe(matriculas.map(m => m.userId));
    const linhas = [];
    for (const m of matriculas) {
      for (const md of mods) {
        const n = await R.servicos.notaDoModulo(m.matriculaId, String(md._id));
        linhas.push({
          curso: curso?.sigla || curso?.titulo || cursoId, turma: m.turmaCodigo || 'Sem turma', matricula: m.numero ?? null,
          nome: nomes.get(String(m.userId))?.nome ?? null, modulo: `Módulo ${String(md.numero ?? '').padStart(2, '0')}`,
          nota: n.nota, situacao: n.situacao ? ROTULOS_SITUACAO[n.situacao] : null, aguardandoCorrecao: n.aguardandoCorrecao,
          tentativasUsadas: n.tentativas.usadas, tentativasPermitidas: n.tentativas.permitidas, _situacao: n.situacao
        });
      }
    }
    return linhas;
  }

  const relatorios = [
    {
      id: 'notas', titulo: 'Notas por módulo', papeis: ['professor', 'admin'],
      filtros: [{ chave: 'cursoId', tipo: 'curso', obrigatorio: true }, { chave: 'turmaId', tipo: 'turma' }],
      colunas: [
        { chave: 'curso', rotulo: 'Curso', tipo: 'texto' }, { chave: 'turma', rotulo: 'Turma', tipo: 'texto' },
        { chave: 'matricula', rotulo: 'Nº matrícula', tipo: 'texto' }, { chave: 'nome', rotulo: 'Nome', tipo: 'texto' },
        { chave: 'modulo', rotulo: 'Módulo', tipo: 'texto' }, { chave: 'nota', rotulo: 'Nota', tipo: 'nota' },
        { chave: 'situacao', rotulo: 'Situação', tipo: 'texto' }, { chave: 'tentativasUsadas', rotulo: 'Tentativas usadas', tipo: 'numero' },
        { chave: 'tentativasPermitidas', rotulo: 'Permitidas', tipo: 'numero' }
      ],
      async consultar(req, filtros, { limite = 20000 } = {}) {
        return (await linhasDeNotas(req, filtros, limite)).map(({ _situacao, aguardandoCorrecao, ...l }) => l);
      },
      async resumir(req, filtros) {
        const linhas = await linhasDeNotas(req, filtros, 20000);
        const notas = linhas.map(l => l.nota).filter(n => n !== null && n !== undefined);
        const porModulo = new Map();
        for (const l of linhas) {
          if (!porModulo.has(l.modulo)) porModulo.set(l.modulo, []);
          if (l.nota !== null && l.nota !== undefined) porModulo.get(l.modulo).push(l.nota);
        }
        const media = v => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);
        return {
          kpis: [
            { chave: 'mediaDasNotas', rotulo: 'Média das notas', valor: media(notas), formato: 'nota' },
            { chave: 'aprovados', rotulo: 'Aprovados', valor: linhas.length ? linhas.filter(l => l._situacao === 'aprovado').length : null, formato: 'numero' },
            { chave: 'emRecuperacao', rotulo: 'Em recuperação', valor: linhas.length ? linhas.filter(l => l._situacao === 'em_recuperacao').length : null, formato: 'numero' },
            { chave: 'aguardandoCorrecao', rotulo: 'Aguardando correção', valor: linhas.length ? linhas.filter(l => l.aguardandoCorrecao).length : null, formato: 'numero' }
          ],
          series: [{ chave: 'mediaPorModulo', rotulo: 'Média por módulo', formato: 'nota', pontos: [...porModulo.entries()].map(([rotulo, v]) => ({ rotulo, valor: media(v) })) }]
        };
      }
    },
    {
      id: 'tentativas', titulo: 'Tentativas de avaliação', papeis: ['professor', 'admin'],
      filtros: [{ chave: 'cursoId', tipo: 'curso', obrigatorio: true }, { chave: 'turmaId', tipo: 'turma' }, { chave: 'de', tipo: 'data' }, { chave: 'ate', tipo: 'data' }],
      colunas: [
        { chave: 'curso', rotulo: 'Curso', tipo: 'texto' }, { chave: 'avaliacao', rotulo: 'Avaliação', tipo: 'texto' },
        { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' }, { chave: 'modulo', rotulo: 'Módulo', tipo: 'texto' },
        { chave: 'matricula', rotulo: 'Nº matrícula', tipo: 'texto' }, { chave: 'nome', rotulo: 'Nome', tipo: 'texto' },
        { chave: 'numero', rotulo: 'Nº', tipo: 'numero' }, { chave: 'inicio', rotulo: 'Início', tipo: 'dataHora' },
        { chave: 'envio', rotulo: 'Envio', tipo: 'dataHora' }, { chave: 'pctAcerto', rotulo: '% acerto', tipo: 'pct' },
        { chave: 'nota', rotulo: 'Nota', tipo: 'nota' }, { chave: 'status', rotulo: 'Status', tipo: 'texto' }
      ],
      async consultar(req, filtros, { limite = 20000 } = {}) {
        const { cursoId, turmas } = await escopoDoRelatorio(req, filtros);
        const filtro = { cursoId, status: { $ne: 'em_andamento' } };
        if (turmas !== null) filtro.turmaId = { $in: turmas };
        const de = filtros?.de ? new Date(filtros.de) : null;
        const ate = filtros?.ate ? new Date(filtros.ate) : null;
        if ((de && !Number.isNaN(de.getTime())) || (ate && !Number.isNaN(ate.getTime()))) {
          filtro.enviadaEm = {};
          if (de && !Number.isNaN(de.getTime())) filtro.enviadaEm.$gte = de;
          if (ate && !Number.isNaN(ate.getTime())) filtro.enviadaEm.$lte = ate;
        }
        if (await col.tentativas().countDocuments(filtro) > limite) throw new ErroPortal(413, 'relatorio-grande');
        const ts = await col.tentativas().find(filtro, { projection: { questoes: 0, respostas: 0, correcao: 0 } }).sort({ enviadaEm: -1 }).toArray();
        const [curso, avs, mods, nomes] = await Promise.all([
          repo('cursos').findOne({ _id: cursoId }, { projection: { titulo: 1, sigla: 1 } }),
          col.avaliacoes().find({ cursoId }, { projection: { titulo: 1, tipo: 1 } }).toArray(),
          repo('modulos').find({ cursoId }, { projection: { numero: 1 } }).toArray(),
          nomesDe(ts.map(t => String(t.userId)))
        ]);
        const avPor = new Map(avs.map(a => [hex(a._id), a]));
        const modPor = new Map(mods.map(m => [String(m._id), m]));
        const rotuloStatus = { aguardando_correcao: 'Aguardando correção', corrigida: 'Corrigida' };
        return ts.map(t => ({
          curso: curso?.sigla || curso?.titulo || cursoId, avaliacao: avPor.get(hex(t.avaliacaoId))?.titulo ?? null,
          tipo: t.tipo === 'modular' ? 'Modular' : 'Prévia', modulo: `Módulo ${String(modPor.get(String(t.moduloId))?.numero ?? '').padStart(2, '0')}`,
          matricula: t.matriculaNumero ?? null, nome: nomes.get(String(t.userId))?.nome ?? null, numero: t.numero,
          inicio: t.iniciadaEm, envio: t.enviadaEm, pctAcerto: t.status === 'corrigida' ? (t.pctAcerto ?? null) : null,
          nota: t.status === 'corrigida' ? (t.nota ?? null) : null, status: rotuloStatus[t.status] || t.status
        }));
      }
    },
    {
      id: 'correcoes-pendentes', titulo: 'Correções pendentes', papeis: ['professor', 'admin'],
      filtros: [{ chave: 'cursoId', tipo: 'curso', obrigatorio: true }, { chave: 'turmaId', tipo: 'turma' }],
      colunas: [
        { chave: 'curso', rotulo: 'Curso', tipo: 'texto' }, { chave: 'avaliacao', rotulo: 'Avaliação', tipo: 'texto' },
        { chave: 'modulo', rotulo: 'Módulo', tipo: 'texto' }, { chave: 'matricula', rotulo: 'Nº matrícula', tipo: 'texto' },
        { chave: 'nome', rotulo: 'Nome', tipo: 'texto' }, { chave: 'enviadaEm', rotulo: 'Enviada em', tipo: 'dataHora' },
        { chave: 'pendentes', rotulo: 'Dissertativas pendentes', tipo: 'numero' }
      ],
      async consultar(req, filtros, { limite = 20000 } = {}) {
        const { cursoId, turmas } = await escopoDoRelatorio(req, filtros);
        const filtro = { cursoId, status: 'aguardando_correcao' };
        if (turmas !== null) filtro.turmaId = { $in: turmas };
        if (await col.tentativas().countDocuments(filtro) > limite) throw new ErroPortal(413, 'relatorio-grande');
        const ts = await col.tentativas().find(filtro, { projection: { respostas: 0 } }).sort({ enviadaEm: 1 }).toArray();
        const [curso, avs, mods, nomes] = await Promise.all([
          repo('cursos').findOne({ _id: cursoId }, { projection: { titulo: 1, sigla: 1 } }),
          col.avaliacoes().find({ cursoId }, { projection: { titulo: 1 } }).toArray(),
          repo('modulos').find({ cursoId }, { projection: { numero: 1 } }).toArray(),
          nomesDe(ts.map(t => String(t.userId)))
        ]);
        const avPor = new Map(avs.map(a => [hex(a._id), a]));
        const modPor = new Map(mods.map(m => [String(m._id), m]));
        return ts.map(t => ({
          curso: curso?.sigla || curso?.titulo || cursoId, avaliacao: avPor.get(hex(t.avaliacaoId))?.titulo ?? null,
          modulo: `Módulo ${String(modPor.get(String(t.moduloId))?.numero ?? '').padStart(2, '0')}`,
          matricula: t.matriculaNumero ?? null, nome: nomes.get(String(t.userId))?.nome ?? null, enviadaEm: t.enviadaEm,
          pendentes: (t.questoes || []).filter(q => q.tipo !== 'objetiva' && !Number.isFinite(Number(t.correcao?.[q.questaoId]?.pontos))).length
        }));
      }
    }
  ];

  // ---------- aviso `avaliacao-disponivel` (L13, grupo `aviso`) ----------
  const avisoDisponivel = {
    id: 'avaliacao-disponivel',
    async gerar(req) {
      if (!req?.user?._id) return [];
      const userId = userIdDe(req);
      const cursos = await acesso.cursosDoAluno(userId);
      if (!cursos.length) return [];
      const pendentes = [];
      for (const cursoId of cursos) {
        const matricula = await R.matriculaVigente(userId, cursoId);
        if (!matricula || matricula.status !== 'ativa') continue;
        const avs = await col.avaliacoes().find({ cursoId: String(cursoId), publicada: true }).toArray();
        for (const a of avs) {
          const feitas = await col.tentativas().countDocuments({ matriculaId: comoOid(matricula._id), avaliacaoId: a._id, status: { $ne: 'em_andamento' } });
          if (feitas) continue;
          const reg = await R.registroDoAluno(matricula._id, a._id);
          if (reg?.finalizadaEm) continue;
          pendentes.push(a);
        }
      }
      if (!pendentes.length) return [];
      const a = pendentes[0];
      return [{
        id: 'avaliacao-disponivel', tom: 'info', dispensavel: true, contador: pendentes.length, rotulo: 'Fazer agora',
        texto: pendentes.length === 1 ? `Avaliação disponível: ${a.titulo}.` : `Há ${pendentes.length} avaliações disponíveis para fazer.`,
        href: `aula.html?curso=${encodeURIComponent(a.cursoId)}&modulo=${encodeURIComponent(a.moduloId)}&item=avaliacao:${hex(a._id)}`
      }];
    }
  };

  const exportador = {
    dominio: 'avaliacoes',
    async exportar(userId) {
      return { tentativas: await R.servicos.tentativasDoAluno(userId) };
    }
  };

  return { aluno, professor, repositorio: R, servicos: R.servicos, grupos: { validador: validadorAVL, cascata, painel, exportador, relatorios, aviso: avisoDisponivel } };
}

/** Montagem no agregador (API §5.1): síncrono no efeito e sem E/S. */
export default function montar(ctx) {
  registrarIndices(INDICES_AVALIACOES);
  const c = ctx.comum;
  const r = criarRotaAvaliacoes({
    repo: c.repo, servicos: ctx.servicos, acesso: c.acesso, auditoria: c.auditoria, notificacoes: c.notificacoes,
    assinador: c.assinador, arquivos: c.arquivos, perfis: c.perfis, agora: c.agora, log: c.log
  });
  ctx.rotas.aluno.use(r.aluno);
  ctx.rotas.professor.use(r.professor);
  ctx.servicos.registrar('avaliacoes.notaDoModulo', r.servicos.notaDoModulo);
  ctx.servicos.registrar('avaliacoes.resumoDoModulo', r.servicos.resumoDoModulo);
  ctx.servicos.registrar('avaliacoes.tentativasDoAluno', r.servicos.tentativasDoAluno);
  ctx.servicos.registrar('avaliacoes.correcoesPendentes', r.servicos.correcoesPendentes);
  ctx.servicos.adicionar('validador', r.grupos.validador);
  ctx.servicos.adicionar('cascata', r.grupos.cascata);
  ctx.servicos.adicionar('painel', r.grupos.painel);
  ctx.servicos.adicionar('exportador', r.grupos.exportador);
  for (const def of r.grupos.relatorios) ctx.servicos.adicionar('relatorio', def);
  ctx.servicos.adicionar('aviso', r.grupos.aviso);
}
