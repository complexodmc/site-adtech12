// =============================================================
// COMPLEXO DMC · Portal — estudos: Início, trilha, conteúdo em seções,
// progresso, plano de ensino, materiais do módulo e capas
// PORTAL-API §6.5, §8.4, §4.4 (serviços estudos.*, grupos busca e
// cascata), §4.12 (arquivos), D-56 (capas) · dono: F1a.
//
// Montado pelo agregador (server/src/portal/montar.js):
//   publico   GET  /portal/conteudo/imagens/:arquivo
//   aluno     GET  /portal/me/cursos
//             GET  /portal/cursos/:cursoId/trilha
//             GET  /portal/cursos/:cursoId/progresso
//             GET  /portal/modulos/:moduloId/conteudo
//             POST /portal/aulas/:aulaId/assistido          (60/min por pessoa)
//             POST /portal/conteudo/feito
//             GET  /portal/materiais/:arquivoId
//   professor GET  /portal/professor/cursos/:cursoId/planos
//             PUT  /portal/professor/modulos/:moduloId/plano
//             POST /portal/professor/modulos/:moduloId/materiais[?nome=&categoria=]  (PDF cru)
//             POST /portal/professor/modulos/:moduloId/materiais/link
//             PUT|DELETE /portal/professor/modulos/:moduloId/materiais/:matId
//             PUT  /portal/professor/aulas/:aulaId/materiais/:matId
//             PUT  /portal/professor/aulas/:aulaId/academico
//   admin     POST|DELETE /portal/admin/cursos/:cursoId/capa-vertical
//             POST|DELETE /portal/admin/modulos/:moduloId/capa
// Vídeo sai SEMPRE por normalizarVideo (nunca a URL crua do banco).
// Serviço de outra fatia ausente → campo null / seção vazia (D7).
// =============================================================
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { ErroPortal, MENSAGENS } from '../portal/erros.js';
import { lerCorpoBinario, removerMetadadosImagem } from '../portal/arquivos.js';
import { validarUrlHttps, validarDataCalendario, hojeSP, lerId, lerIdLegado } from '../portal/validacao.js';
import { codigoAula, SIGLA_RE } from '../portal/codigos.js';
import { BANNER_MAX_BYTES } from '../portal/config-portal.js';
import { criarThrottle } from '../throttle.js';
import { criarRepositoriosEstudos, INDICES_ESTUDOS } from '../portal/estudos/repositorios.js';
import {
  criarServicoEstudos, planoParaLeitura, rotuloDoNivel, rotuloDoEncontro, capaUrlDoModulo, capaVerticalUrlDoCurso,
  CATEGORIAS_MATERIAL, FONTES_VIDEO
} from '../portal/estudos/progresso.js';

const CAPA_RE = /^cap-[a-f0-9]{12}\.(jpg|png|webp)$/;
const CHAVE_FEITO_RE = /^(plano|material):([A-Za-z0-9_-]{1,64})$/;
const MAX_ARQUIVO_PADRAO = 4 * 1024 * 1024;
const LIMITES_PLANO = Object.freeze({ ementa: 8000, objetivos: 30, item: 500, referencias: 50, cronograma: 60, encontro: 60, tema: 300 });

const iso = d => (d instanceof Date ? d.toISOString() : (d ? new Date(d).toISOString() : null));
const comprimento = s => [...s].length;
const umaLinha = s => s.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim();

function erro400(campos, codigo = 'validacao') {
  return new ErroPortal(400, codigo, MENSAGENS[codigo], { campos });
}

/** Lista de textos de uma linha (1–max), item vazio descartado. String no lugar da lista → formato-invalido. */
function lerListaDeTextos(valor, campo, { maxItens, maxItem }, campos) {
  if (valor === undefined) return undefined;
  if (valor === null) return [];
  if (!Array.isArray(valor)) throw erro400({ [campo]: 'Formato inválido.' }, 'formato-invalido');
  const out = [];
  valor.forEach((item, i) => {
    if (item === null || item === undefined) return;
    if (typeof item !== 'string') throw erro400({ [`${campo}.${i}`]: 'Formato inválido.' }, 'formato-invalido');
    const s = umaLinha(item.normalize('NFC'));
    if (!s) return;
    if (comprimento(s) > maxItem) { campos[`${campo}.${i}`] = `Use no máximo ${maxItem} caracteres.`; return; }
    out.push(s);
  });
  if (out.length > maxItens) campos[campo] = `Use no máximo ${maxItens} itens.`;
  return out;
}

/**
 * Valida o PlanoEnsino parcial (API §3.2). → { mudancas } só com os campos enviados.
 * Lança 400 `formato-invalido` (tipo errado) ou `validacao` com `campos` por item.
 */
export function validarPlano(corpo, aulaIdsDoModulo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw erro400({}, 'formato-invalido');
  const campos = {};
  const mudancas = {};
  if (corpo.ementa !== undefined) {
    if (corpo.ementa !== null && typeof corpo.ementa !== 'string') throw erro400({ ementa: 'Formato inválido.' }, 'formato-invalido');
    const s = (corpo.ementa || '').normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (comprimento(s) > LIMITES_PLANO.ementa) campos.ementa = `Use no máximo ${LIMITES_PLANO.ementa} caracteres.`;
    mudancas.ementa = s;
  }
  const objetivos = lerListaDeTextos(corpo.objetivos, 'objetivos', { maxItens: LIMITES_PLANO.objetivos, maxItem: LIMITES_PLANO.item }, campos);
  if (objetivos !== undefined) mudancas.objetivos = objetivos;
  if (corpo.bibliografia !== undefined) {
    const b = corpo.bibliografia;
    if (b !== null && (typeof b !== 'object' || Array.isArray(b))) throw erro400({ bibliografia: 'Formato inválido.' }, 'formato-invalido');
    const basica = lerListaDeTextos(b?.basica, 'bibliografia.basica', { maxItens: LIMITES_PLANO.referencias, maxItem: LIMITES_PLANO.item }, campos);
    const complementar = lerListaDeTextos(b?.complementar, 'bibliografia.complementar', { maxItens: LIMITES_PLANO.referencias, maxItem: LIMITES_PLANO.item }, campos);
    mudancas.bibliografia = { ...(basica !== undefined ? { basica } : {}), ...(complementar !== undefined ? { complementar } : {}) };
  }
  if (corpo.cronograma !== undefined) {
    const c = corpo.cronograma;
    if (c !== null && !Array.isArray(c)) throw erro400({ cronograma: 'Formato inválido.' }, 'formato-invalido');
    const aulas = new Set(aulaIdsDoModulo.map(String));
    const linhas = [];
    (c || []).forEach((l, i) => {
      if (l === null || l === undefined) return;
      if (typeof l !== 'object' || Array.isArray(l)) throw erro400({ [`cronograma.${i}`]: 'Formato inválido.' }, 'formato-invalido');
      for (const k of ['encontro', 'tema', 'data', 'aulaId']) {
        if (l[k] !== undefined && l[k] !== null && typeof l[k] !== 'string') throw erro400({ [`cronograma.${i}.${k}`]: 'Formato inválido.' }, 'formato-invalido');
      }
      const encontro = umaLinha((l.encontro || '').normalize('NFC'));
      const tema = umaLinha((l.tema || '').normalize('NFC'));
      const dataBruta = (l.data || '').trim();
      const aulaId = (l.aulaId || '').trim() || null;
      if (!encontro && !tema && !dataBruta && !aulaId) return; // linha vazia: descartada
      if (!encontro) campos[`cronograma.${i}.encontro`] = 'Informe o encontro.';
      else if (comprimento(encontro) > LIMITES_PLANO.encontro) campos[`cronograma.${i}.encontro`] = `Use no máximo ${LIMITES_PLANO.encontro} caracteres.`;
      if (!tema) campos[`cronograma.${i}.tema`] = 'Informe o tema.';
      else if (comprimento(tema) > LIMITES_PLANO.tema) campos[`cronograma.${i}.tema`] = `Use no máximo ${LIMITES_PLANO.tema} caracteres.`;
      let data = null;
      if (dataBruta) {
        data = validarDataCalendario(dataBruta);
        if (!data) campos[`cronograma.${i}.data`] = 'Data inválida.';
      }
      if (aulaId && !aulas.has(aulaId)) campos[`cronograma.${i}.aulaId`] = 'A aula precisa ser deste módulo.';
      linhas.push({ encontro, data, tema, aulaId });
    });
    if (linhas.length > LIMITES_PLANO.cronograma) campos.cronograma = `Use no máximo ${LIMITES_PLANO.cronograma} linhas.`;
    mudancas.cronograma = linhas;
  }
  if (Object.keys(campos).length) throw erro400(campos);
  return mudancas;
}

/** Material do módulo no formato de saída (o mesmo do Conteudo, sem `feito`). */
function materialDeSaida(m) {
  const tipo = m.tipo === 'link' ? 'link' : 'arquivo';
  return {
    id: m.id, tipo, categoria: CATEGORIAS_MATERIAL.includes(m.categoria) ? m.categoria : 'leitura', nome: m.nome || 'Material de apoio',
    tamanho: tipo === 'arquivo' ? (Number(m.tamanho) || null) : null,
    url: tipo === 'link' ? (m.url || null) : (m.arquivoId ? `/api/portal/materiais/${String(m.arquivoId)}` : null),
    ordem: Number(m.ordem) || 0, criadoEm: iso(m.criadoEm)
  };
}

function nomeDeMaterial(valor, { obrigatorio = true } = {}) {
  if (valor === undefined || valor === null) {
    if (obrigatorio) throw erro400({ nome: 'Informe o nome do material.' });
    return undefined;
  }
  if (typeof valor !== 'string') throw erro400({ nome: 'Formato inválido.' }, 'formato-invalido');
  const s = umaLinha(valor.normalize('NFC')).replace(/[\\/]+/g, '-');
  if (!s) throw erro400({ nome: 'Informe o nome do material.' });
  if (comprimento(s) > 160) throw erro400({ nome: 'Use no máximo 160 caracteres.' });
  return s;
}

function categoriaDe(valor, { obrigatorio = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw erro400({ categoria: 'Escolha a categoria (Leitura, Slides ou Complementar).' });
    return undefined;
  }
  if (typeof valor !== 'string') throw erro400({ categoria: 'Formato inválido.' }, 'formato-invalido');
  if (!CATEGORIAS_MATERIAL.includes(valor)) throw erro400({ categoria: 'Opção inválida.' });
  return valor;
}

const novoIdMaterial = () => `mat-${randomBytes(6).toString('hex')}`;

/**
 * Fábrica das rotas (testável com repositório falso e serviços falsos).
 * @param {{ repo, servicos, acesso, arquivos, auditoria?, agora?, log?, maxArquivoBytes?, capaMaxBytes?, throttleAssistido? }} deps
 * @returns {{ publico: Router, aluno: Router, professor: Router, admin: Router, estudos: object }}
 */
export function criarRotaConteudo({
  repo, servicos, acesso, arquivos, auditoria = null, agora = () => new Date(), log = console,
  maxArquivoBytes = MAX_ARQUIVO_PADRAO, capaMaxBytes = BANNER_MAX_BYTES, throttleAssistido = null
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarRotaConteudo: informe repo.');
  if (!servicos) throw new TypeError('criarRotaConteudo: informe servicos.');
  if (!acesso) throw new TypeError('criarRotaConteudo: informe acesso.');
  if (!arquivos) throw new TypeError('criarRotaConteudo: informe arquivos.');

  const repos = criarRepositoriosEstudos({ repo });
  const estudos = criarServicoEstudos({ repos, servicos, agora, log });
  const tentar = nome => {
    const f = servicos.tentar(nome);
    return typeof f === 'function' ? f : null;
  };
  const avisar = (texto, err) => {
    try { (log.warn || log.error).call(log, `[portal] conteudo: ${texto}${err ? ` — ${err.name || 'Error'}` : ''}`); } catch { /* nada */ }
  };
  const registrarAuditoria = (evento, req) => {
    if (!auditoria) return;
    auditoria.registrar(evento, req).catch?.(() => {});
  };
  const userIdDe = req => String(req.user._id);
  const ass = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  /** Sem liberação real → visão da equipe (docente/admin): feitos e % null, nada gravado. */
  async function visaoEquipe(req, cursoId) {
    const ctx = await acesso.contexto(req);
    return !ctx.cursosLiberados.has(String(cursoId));
  }

  async function exigirVerCurso(req, cursoId) {
    if (!(await acesso.podeVerCurso(req, cursoId))) throw new ErroPortal(403, 'sem-acesso');
  }

  async function situacaoDoCurso(userId, cursoId) {
    const f = tentar('academico.situacaoDoCurso');
    if (!f) return null;
    try { return await f(String(userId), String(cursoId)); } catch (err) { avisar('academico.situacaoDoCurso falhou', err); return null; }
  }

  async function garantirMatricula(userId, cursoId) {
    const f = tentar('secretaria.garantirMatricula');
    if (!f) return null;
    try { return await f(String(userId), String(cursoId)); } catch (err) { avisar('secretaria.garantirMatricula falhou', err); return null; }
  }

  // ===================== público =====================
  const publico = Router();
  publico.get('/conteudo/imagens/:arquivo', ass(async (req, res) => {
    const nome = String(req.params.arquivo || '');
    if (!CAPA_RE.test(nome)) throw new ErroPortal(404, null, 'Imagem não encontrada.');
    const curso = await repo('cursos').findOne({ 'capaVertical.arquivo': nome }, { projection: { capaVertical: 1 } });
    const ref = curso?.capaVertical || (await repo('modulos').findOne({ 'capa.arquivo': nome }, { projection: { capa: 1 } }))?.capa;
    if (!ref?.arquivoId) throw new ErroPortal(404, null, 'Imagem não encontrada.');
    const arq = await arquivos.ler(ref.arquivoId, { contexto: 'capa' });
    if (!arq) throw new ErroPortal(404, null, 'Imagem não encontrada.');
    arquivos.enviar(res, arq, { nome, inline: true, publico: true });
  }));

  // ===================== aluno (logado) =====================
  const aluno = Router();

  aluno.get('/me/cursos', ass(async (req, res) => {
    const userId = userIdDe(req);
    const cursoIds = await acesso.cursosDoAluno(userId);
    const itens = [];
    for (const cursoId of cursoIds) {
      const curso = await repos.cursoPorId(cursoId);
      if (!curso) continue;
      const semAcesso = !(await acesso.podeVerCurso(req, cursoId));
      const [mat, sit, calc] = await Promise.all([
        garantirMatricula(userId, cursoId),
        situacaoDoCurso(userId, cursoId),
        estudos.calcularCurso(userId, cursoId)
      ]);
      const resumo = calc ? estudos.resumirCurso(calc) : null;
      itens.push({
        curso: {
          id: curso._id, titulo: curso.titulo || '', sigla: curso.sigla || null, capaUrl: capaLegadaUrl(curso),
          capaVerticalUrl: capaVerticalUrlDoCurso(curso), ...rotuloDoNivel(curso)
        },
        matricula: mat ? { id: String(mat._id ?? mat.id), numero: mat.numero || null, inicioEm: iso(mat.inicioEm), status: mat.status || null } : null,
        situacao: sit?.situacao ?? null,
        situacaoRotulo: sit?.situacaoRotulo ?? null,
        progresso: resumo ? { aulasConcluidas: resumo.aulasConcluidas, aulasTotal: resumo.aulasTotal, pct: resumo.pct } : { aulasConcluidas: 0, aulasTotal: 0, pct: null },
        continuar: resumo?.continuar ?? null,
        semAcesso,
        _ultima: resumo?.ultimaAtividadeEm || null
      });
    }
    let ativo = null;
    for (const it of itens) if (it._ultima && (!ativo || it._ultima > ativo._ultima)) ativo = it;
    const ativoId = ativo ? ativo.curso.id : (itens.find(i => !i.semAcesso)?.curso.id ?? null);
    for (const it of itens) delete it._ultima;
    res.json({ ativoId, itens });
  }));

  aluno.get('/cursos/:cursoId/trilha', ass(async (req, res) => {
    const cursoId = lerIdLegado(req.params.cursoId);
    const curso = cursoId ? await repos.cursoPorId(cursoId) : null;
    if (!curso) throw new ErroPortal(404, null, 'Curso não encontrado.');
    await exigirVerCurso(req, cursoId);
    const equipe = await visaoEquipe(req, cursoId);
    const userId = userIdDe(req);
    const [calc, sit] = await Promise.all([
      estudos.calcularCurso(userId, cursoId, { visaoEquipe: equipe }),
      equipe ? null : situacaoDoCurso(userId, cursoId)
    ]);
    const resumo = estudos.resumirCurso(calc);
    const porModulo = new Map((Array.isArray(sit?.modulos) ? sit.modulos : []).map(m => [String(m.moduloId), m]));
    const ROTULOS = { aprovado: 'Aprovado', concluido: 'Concluído' };
    const modulos = calc.conteudos.map(c => {
      const s = porModulo.get(c.modulo.id) || null;
      const situacao = s?.situacao ?? null;
      const feitoTudo = !equipe && c.progresso.itensTotal > 0 && c.progresso.itensFeitos === c.progresso.itensTotal;
      return {
        id: c.modulo.id, numero: c.modulo.numero, posicao: c.modulo.posicao, titulo: c.modulo.titulo,
        chHoras: s?.chHoras ?? c.modulo.chHoras, tipo: c.modulo.tipo, capaUrl: c.modulo.capaUrl,
        situacao, situacaoRotulo: s?.situacaoRotulo ?? (situacao && ROTULOS[situacao]) ?? null, nota: s?.nota ?? null,
        progresso: {
          aulasConcluidas: c.progresso.aulasConcluidas, aulasTotal: c.progresso.aulasTotal, pct: c.progresso.pct,
          itensFeitos: c.progresso.itensFeitos, itensTotal: c.progresso.itensTotal
        },
        concluido: situacao ? ['aprovado', 'concluido'].includes(situacao) : feitoTudo
      };
    });
    res.json({
      curso: { id: curso._id, titulo: curso.titulo || '', sigla: curso.sigla || null, capaUrl: capaLegadaUrl(curso) },
      modulos,
      atual: resumo.continuar ? { moduloId: resumo.continuar.moduloId, chave: resumo.continuar.chave } : (modulos[0] ? { moduloId: modulos[0].id, chave: null } : null)
    });
  }));

  aluno.get('/cursos/:cursoId/progresso', ass(async (req, res) => {
    const cursoId = lerIdLegado(req.params.cursoId);
    const curso = cursoId ? await repos.cursoPorId(cursoId) : null;
    if (!curso) throw new ErroPortal(404, null, 'Curso não encontrado.');
    await exigirVerCurso(req, cursoId);
    const equipe = await visaoEquipe(req, cursoId);
    const calc = await estudos.calcularCurso(userIdDe(req), cursoId, { visaoEquipe: equipe, comAvaliacoes: false });
    const resumo = estudos.resumirCurso(calc);
    const aulas = {};
    const conteudo = {};
    if (!equipe) {
      for (const m of calc.estrutura.modulos) {
        for (const a of m.aulas) {
          if (a.disponivel === false) continue;
          const pv = calc.progresso.video.get(a._id);
          const pl = calc.progresso.aulas.get(a._id);
          aulas[a._id] = { pctVideo: pv ? Number(pv.pctMax) || 0 : 0, concluida: !!pl, concluidaEm: pl ? iso(pl.completedAt) : null, origem: pl ? (pl.origem || 'manual') : null };
        }
      }
      for (const [chave, p] of calc.progresso.conteudo) conteudo[chave] = iso(p.feitoEm);
    }
    res.json({ aulas, conteudo, curso: { aulasConcluidas: resumo.aulasConcluidas, aulasTotal: resumo.aulasTotal, pct: resumo.pct } });
  }));

  aluno.get('/modulos/:moduloId/conteudo', ass(async (req, res) => {
    const moduloId = lerIdLegado(req.params.moduloId);
    const modulo = moduloId ? await repos.moduloPorId(moduloId) : null;
    if (!modulo || !modulo.cursoId) throw new ErroPortal(404, null, 'Módulo não encontrado.');
    const cursoId = String(modulo.cursoId);
    await exigirVerCurso(req, cursoId);
    const equipe = await visaoEquipe(req, cursoId);
    const calc = await estudos.calcularCurso(userIdDe(req), cursoId, { visaoEquipe: equipe });
    const c = calc?.conteudos.find(x => x.modulo.id === moduloId);
    if (!c) throw new ErroPortal(404, null, 'Módulo não encontrado.');
    res.json(c);
  }));

  const limiteAssistido = throttleAssistido || criarThrottle({
    janelaMs: 60 * 1000, max: 60, chave: req => `assistido:${req.user ? String(req.user._id) : req.ip}`, codigo: 'limite',
    mensagem: MENSAGENS.limite
  });
  aluno.post('/aulas/:aulaId/assistido', limiteAssistido, ass(async (req, res) => {
    const aulaId = lerIdLegado(req.params.aulaId);
    const ctxAula = aulaId ? await acesso.contextoDaAula(aulaId) : null;
    if (!ctxAula) throw new ErroPortal(404, null, 'Aula não encontrada.');
    const b = req.body;
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw erro400({}, 'formato-invalido');
    const campos = {};
    const num = (v, k) => {
      if (v === undefined || v === null) return null;
      if (typeof v !== 'number' || !Number.isFinite(v)) { campos[k] = 'Informe um número.'; return null; }
      return v;
    };
    const posicaoSeg = num(b.posicaoSeg, 'posicaoSeg');
    const duracaoSeg = num(b.duracaoSeg, 'duracaoSeg');
    const pct = num(b.pct, 'pct');
    if (posicaoSeg === null && !campos.posicaoSeg) campos.posicaoSeg = 'Campo obrigatório.';
    else if (posicaoSeg !== null && (posicaoSeg < 0 || posicaoSeg > 86400)) campos.posicaoSeg = 'Valor fora da faixa.';
    if (duracaoSeg !== null && (duracaoSeg <= 0 || duracaoSeg > 86400)) campos.duracaoSeg = 'Valor fora da faixa.';
    if (pct === null && !campos.pct) campos.pct = 'Campo obrigatório.';
    else if (pct !== null && (pct < 0 || pct > 100)) campos.pct = 'Use um valor entre 0 e 100.';
    if (typeof b.fonte !== 'string' || !FONTES_VIDEO.includes(b.fonte)) campos.fonte = 'Opção inválida.';
    if (Object.keys(campos).length) throw erro400(campos);

    await exigirVerCurso(req, ctxAula.cursoId);
    if (ctxAula.aula.disponivel === false) throw new ErroPortal(409, 'aula-indisponivel');
    if (await visaoEquipe(req, ctxAula.cursoId)) return res.status(204).end();
    const r = await estudos.registrarAssistido({
      userId: userIdDe(req), aula: ctxAula.aula, cursoId: ctxAula.cursoId, posicaoSeg, duracaoSeg, pct, fonte: b.fonte
    });
    res.json(r);
  }));

  aluno.post('/conteudo/feito', ass(async (req, res) => {
    const chave = req.body?.chave;
    if (typeof chave !== 'string') throw erro400({ chave: 'Formato inválido.' }, 'formato-invalido');
    const m = CHAVE_FEITO_RE.exec(chave);
    if (!m) throw erro400({ chave: 'Chave inválida.' });
    let cursoId = null;
    let moduloId = null;
    if (m[1] === 'plano') {
      const modulo = await repos.moduloPorId(m[2]);
      const plano = modulo ? planoParaLeitura(modulo.plano) : null;
      if (!modulo || !modulo.cursoId || plano.vazio) throw new ErroPortal(404, null, 'Item não encontrado.');
      cursoId = String(modulo.cursoId);
      moduloId = modulo._id;
    } else {
      const achado = await repos.acharMaterial(m[2]);
      if (!achado || !achado.modulo.cursoId || (achado.aula && achado.aula.disponivel === false)) throw new ErroPortal(404, null, 'Item não encontrado.');
      cursoId = String(achado.modulo.cursoId);
      moduloId = achado.modulo._id;
    }
    await exigirVerCurso(req, cursoId);
    if (await visaoEquipe(req, cursoId)) return res.status(204).end();
    const r = await repos.marcarConteudo({ userId: userIdDe(req), cursoId, moduloId, chave, em: agora() });
    res.json({ chave: r.chave, feitoEm: iso(r.feitoEm) });
  }));

  aluno.get('/materiais/:arquivoId', ass(async (req, res) => {
    const id = lerId(req.params.arquivoId);
    if (!id) throw new ErroPortal(404, null, 'Material não encontrado.');
    // Contexto conferido no MESMO find (id de contrato/documento/2ª via → 404); acesso ANTES da entrega.
    const meta = await arquivos.metadados(id, { contexto: 'material' });
    if (!meta || !meta.ref?.cursoId || !meta.ref.materialId) throw new ErroPortal(404, null, 'Material não encontrado.');
    await exigirVerCurso(req, meta.ref.cursoId);
    // O material ainda existe e aponta para ESTE binário; preso a aula "em breve" não sai (só para quem gere o conteúdo).
    const achado = await repos.acharMaterial(meta.ref.materialId);
    if (!achado || String(achado.material.arquivoId || '') !== String(id) || String(achado.modulo.cursoId) !== String(meta.ref.cursoId)) {
      throw new ErroPortal(404, null, 'Material não encontrado.');
    }
    if (achado.aula && achado.aula.disponivel === false && !(await acesso.podeGerirConteudo(req, meta.ref.cursoId))) {
      throw new ErroPortal(403, 'aula-indisponivel', MENSAGENS['aula-indisponivel']);
    }
    const arq = await arquivos.ler(id, { contexto: 'material' });
    if (!arq) throw new ErroPortal(404, null, 'Material não encontrado.');
    if (meta.ref.materialId && meta.ref.moduloId && !(await visaoEquipe(req, meta.ref.cursoId))) {
      try {
        await repos.marcarConteudo({ userId: userIdDe(req), cursoId: meta.ref.cursoId, moduloId: meta.ref.moduloId, chave: `material:${meta.ref.materialId}`, em: agora() });
      } catch (err) { avisar('progresso_conteudo não gravado', err); }
    }
    arquivos.enviar(res, arq, { nome: arq.nomeDownload });
  }));

  // ===================== professor (docente · admin) =====================
  const professor = Router();

  async function moduloGerivel(req, moduloIdBruto) {
    const moduloId = lerIdLegado(moduloIdBruto);
    const ctx = moduloId ? await acesso.contextoDoModulo(moduloId) : null;
    if (!ctx) throw new ErroPortal(404, null, 'Módulo não encontrado.');
    if (!(await acesso.podeGerirConteudo(req, ctx.curso._id))) throw new ErroPortal(403, 'nao-docente');
    return ctx;
  }

  async function aulaGerivel(req, aulaIdBruto) {
    const aulaId = lerIdLegado(aulaIdBruto);
    const ctx = aulaId ? await acesso.contextoDaAula(aulaId) : null;
    if (!ctx) throw new ErroPortal(404, null, 'Aula não encontrada.');
    if (!(await acesso.podeGerirConteudo(req, ctx.cursoId))) throw new ErroPortal(403, 'nao-docente');
    return ctx;
  }

  const exigirGestaoDoModulo = ass(async (req, _res, next) => { req._moduloCtx = await moduloGerivel(req, req.params.moduloId); next(); });

  professor.get('/cursos/:cursoId/planos', ass(async (req, res) => {
    const cursoId = lerIdLegado(req.params.cursoId);
    const ctx = await acesso.contexto(req);
    const estrutura = cursoId ? await repos.estruturaDoCurso(cursoId) : null;
    if (!estrutura) throw new ErroPortal(404, null, 'Curso não encontrado.');
    if (ctx.papel !== 'admin' && !ctx.cursosDocente.has(cursoId)) throw new ErroPortal(403, 'nao-docente');
    const aulaIds = estrutura.modulos.flatMap(m => m.aulas.map(a => a._id));
    const encontros = await repos.encontrosDasAulas(aulaIds);
    res.json({
      modulos: estrutura.modulos.map((m, i) => ({
        id: m._id, numero: m.numero || String(i + 1).padStart(2, '0'), titulo: m.titulo || '',
        chHoras: Number.isFinite(m.chHoras) ? m.chHoras : null,
        plano: planoParaLeitura(m.plano, m.aulas.map(a => a._id)),
        aulas: m.aulas.map(a => {
          const enc = encontros.get(a._id);
          return {
            id: a._id, codigo: a.codigo || null, titulo: a.titulo || '',
            rotuloEncontro: (typeof a.rotuloEncontro === 'string' && a.rotuloEncontro.trim()) || (enc ? rotuloDoEncontro(enc.inicioEm) : null),
            dataEncontro: enc?.inicioEm ? hojeSP(new Date(enc.inicioEm)) : null,
            disponivel: a.disponivel !== false
          };
        }),
        materiais: (Array.isArray(m.materiais) ? m.materiais : []).filter(x => x && x.id).map(materialDeSaida)
      }))
    });
  }));

  professor.put('/modulos/:moduloId/plano', exigirGestaoDoModulo, ass(async (req, res) => {
    const { modulo, curso } = req._moduloCtx;
    const aulas = await repo('aulas').find({ moduloId: modulo._id }, { projection: { _id: 1 } }).toArray();
    const b = req.body;
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw erro400({}, 'formato-invalido');
    if (!Number.isInteger(b.versao) || b.versao < 0) throw erro400({ versao: 'Informe a versão do plano (0 na primeira gravação).' });
    const mudancas = validarPlano(b, aulas.map(a => a._id));
    const atual = modulo.plano && typeof modulo.plano === 'object' ? modulo.plano : null;
    const versaoAtual = Number(atual?.versao) || 0;
    if (b.versao !== versaoAtual) throw new ErroPortal(409, 'conflito-versao');
    const base = planoParaLeitura(atual, aulas.map(a => a._id));
    const novo = {
      ementa: mudancas.ementa !== undefined ? mudancas.ementa : base.ementa,
      objetivos: mudancas.objetivos !== undefined ? mudancas.objetivos : base.objetivos,
      bibliografia: {
        basica: mudancas.bibliografia?.basica !== undefined ? mudancas.bibliografia.basica : base.bibliografia.basica,
        complementar: mudancas.bibliografia?.complementar !== undefined ? mudancas.bibliografia.complementar : base.bibliografia.complementar
      },
      cronograma: mudancas.cronograma !== undefined ? mudancas.cronograma : base.cronograma,
      versao: versaoAtual + 1,
      atualizadoEm: agora(),
      atualizadoPor: userIdDe(req)
    };
    const filtro = versaoAtual === 0
      ? { _id: modulo._id, $or: [{ plano: { $exists: false } }, { plano: null }, { 'plano.versao': { $exists: false } }, { 'plano.versao': 0 }] }
      : { _id: modulo._id, 'plano.versao': versaoAtual };
    const r = await repo('modulos').updateOne(filtro, { $set: { plano: novo } });
    if (!r || !r.matchedCount) throw new ErroPortal(409, 'conflito-versao');
    registrarAuditoria({ acao: 'plano.alterado', cursoId: curso._id, entidade: { tipo: 'modulo', id: modulo._id }, mudancas: Object.keys(mudancas).map(campo => ({ campo })) }, req);
    res.json({ plano: planoParaLeitura(novo, aulas.map(a => a._id)) });
  }));

  async function proximaOrdem(modulo) {
    const lista = Array.isArray(modulo.materiais) ? modulo.materiais : [];
    return lista.reduce((max, m) => Math.max(max, Number(m?.ordem) || 0), 0) + 1;
  }

  professor.post('/modulos/:moduloId/materiais/link', exigirGestaoDoModulo, ass(async (req, res) => {
    const { modulo, curso } = req._moduloCtx;
    const b = req.body || {};
    const nome = nomeDeMaterial(b.nome);
    const categoria = categoriaDe(b.categoria);
    if (typeof b.url !== 'string') throw erro400({ url: 'Informe o endereço (https://).' });
    const url = validarUrlHttps(b.url);
    if (!url) throw erro400({ url: 'Use um endereço que comece com https://.' });
    const material = { id: novoIdMaterial(), tipo: 'link', categoria, nome, arquivoId: null, tamanho: null, url, ordem: await proximaOrdem(modulo), criadoEm: agora(), criadoPor: userIdDe(req) };
    await repo('modulos').updateOne({ _id: modulo._id }, { $push: { materiais: material } });
    registrarAuditoria({ acao: 'material.criado', cursoId: curso._id, entidade: { tipo: 'material', id: material.id } }, req);
    res.status(201).json({ material: materialDeSaida(material) });
  }));

  professor.post('/modulos/:moduloId/materiais', exigirGestaoDoModulo,
    ...lerCorpoBinario({ limiteBytes: maxArquivoBytes, tipos: ['pdf'] }),
    ass(async (req, res) => {
      const { modulo, curso } = req._moduloCtx;
      const nome = nomeDeMaterial(req.query.nome);
      const categoria = categoriaDe(req.query.categoria);
      const id = novoIdMaterial();
      const salvo = await arquivos.salvar({
        contexto: 'material', donoUserId: null, ref: { cursoId: curso._id, moduloId: modulo._id, materialId: id, entidadeId: modulo._id },
        buf: req.arquivo.buf, tipo: 'pdf', nomeDownload: nome, por: userIdDe(req)
      });
      const material = { id, tipo: 'arquivo', categoria, nome, arquivoId: new ObjectId(salvo.id), tamanho: salvo.tamanho, url: null, ordem: await proximaOrdem(modulo), criadoEm: agora(), criadoPor: userIdDe(req) };
      try {
        await repo('modulos').updateOne({ _id: modulo._id }, { $push: { materiais: material } });
      } catch (err) {
        await arquivos.apagar(salvo.id).catch(() => {});
        throw err;
      }
      registrarAuditoria({ acao: 'material.criado', cursoId: curso._id, entidade: { tipo: 'material', id } }, req);
      res.status(201).json({ material: materialDeSaida(material) });
    }));

  professor.put('/modulos/:moduloId/materiais/:matId', exigirGestaoDoModulo, ass(async (req, res) => {
    const { modulo, curso } = req._moduloCtx;
    const matId = String(req.params.matId || '');
    const b = req.body || {};
    const set = {};
    const nome = nomeDeMaterial(b.nome, { obrigatorio: false });
    if (nome !== undefined) set['materiais.$.nome'] = nome;
    const categoria = categoriaDe(b.categoria, { obrigatorio: false });
    if (categoria !== undefined) set['materiais.$.categoria'] = categoria;
    if (b.ordem !== undefined) {
      if (!Number.isInteger(b.ordem) || b.ordem < 0 || b.ordem > 10000) throw erro400({ ordem: 'Informe um número inteiro.' });
      set['materiais.$.ordem'] = b.ordem;
    }
    if (!Object.keys(set).length) throw erro400({ nome: 'Nada a alterar.' });
    const r = await repo('modulos').updateOne({ _id: modulo._id, 'materiais.id': matId }, { $set: set });
    if (!r || !r.matchedCount) throw new ErroPortal(404, null, 'Material não encontrado.');
    const atualizado = (await repo('modulos').findOne({ _id: modulo._id }))?.materiais?.find(m => m.id === matId);
    registrarAuditoria({ acao: 'material.alterado', cursoId: curso._id, entidade: { tipo: 'material', id: matId } }, req);
    res.json({ material: materialDeSaida(atualizado) });
  }));

  professor.delete('/modulos/:moduloId/materiais/:matId', exigirGestaoDoModulo, ass(async (req, res) => {
    const { modulo, curso } = req._moduloCtx;
    const matId = String(req.params.matId || '');
    const material = (Array.isArray(modulo.materiais) ? modulo.materiais : []).find(m => m && m.id === matId);
    if (!material) throw new ErroPortal(404, null, 'Material não encontrado.');
    await repo('modulos').updateOne({ _id: modulo._id }, { $pull: { materiais: { id: matId } } });
    if (material.arquivoId) await arquivos.apagar(material.arquivoId).catch(err => avisar('binário do material não apagado', err));
    registrarAuditoria({ acao: 'material.removido', cursoId: curso._id, entidade: { tipo: 'material', id: matId } }, req);
    res.json({ ok: true });
  }));

  professor.put('/aulas/:aulaId/materiais/:matId', ass(async (req, res) => {
    const { aula, cursoId } = await aulaGerivel(req, req.params.aulaId);
    const matId = String(req.params.matId || '');
    const categoria = categoriaDe(req.body?.categoria);
    const r = await repo('aulas').updateOne({ _id: aula._id, 'materiais.id': matId }, { $set: { 'materiais.$.categoria': categoria } });
    if (!r || !r.matchedCount) throw new ErroPortal(404, null, 'Material não encontrado.');
    registrarAuditoria({ acao: 'material.alterado', cursoId, entidade: { tipo: 'material', id: matId } }, req);
    res.json({ material: { id: matId, categoria } });
  }));

  professor.put('/aulas/:aulaId/academico', ass(async (req, res) => {
    const { aula, modulo, cursoId } = await aulaGerivel(req, req.params.aulaId);
    const b = req.body || {};
    const set = {};
    if (b.rotuloEncontro !== undefined) {
      if (b.rotuloEncontro !== null && typeof b.rotuloEncontro !== 'string') throw erro400({ rotuloEncontro: 'Formato inválido.' }, 'formato-invalido');
      const s = umaLinha((b.rotuloEncontro || '').normalize('NFC'));
      if (comprimento(s) > 60) throw erro400({ rotuloEncontro: 'Use no máximo 60 caracteres.' });
      set.rotuloEncontro = s;
    }
    let codigo = aula.codigo || null;
    if (!codigo) {
      const curso = await repos.cursoPorId(cursoId);
      if (curso?.sigla && SIGLA_RE.test(curso.sigla)) {
        const estrutura = await repos.estruturaDoCurso(cursoId);
        const posM = estrutura.modulos.findIndex(m => m._id === modulo._id) + 1;
        const posA = (estrutura.modulos[posM - 1]?.aulas || []).findIndex(a => a._id === aula._id) + 1;
        if (posM > 0 && posA > 0) {
          const candidato = codigoAula(curso.sigla, posM, posA);
          const emUso = await repo('aulas').findOne({ codigo: candidato, _id: { $ne: aula._id } }, { projection: { _id: 1 } });
          if (!emUso) { set.codigo = candidato; codigo = candidato; }
        }
      }
    }
    if (Object.keys(set).length) await repo('aulas').updateOne({ _id: aula._id }, { $set: set });
    const rotulo = set.rotuloEncontro !== undefined ? set.rotuloEncontro : (aula.rotuloEncontro || '');
    res.json({ aula: { id: aula._id, codigo, rotuloEncontro: rotulo || null } });
  }));

  // ===================== admin: capas (D-56) =====================
  const admin = Router();
  const corpoImagem = lerCorpoBinario({ limiteBytes: capaMaxBytes, tipos: ['jpg', 'png', 'webp'] });

  async function trocarCapa(req, { colecao, id, campo, acao, entidade, cursoId }) {
    const tipo = req.arquivo.tipo;
    const limpo = removerMetadadosImagem(req.arquivo.buf, tipo);
    const arquivo = `cap-${randomBytes(6).toString('hex')}.${tipo}`;
    const salvo = await arquivos.salvar({ contexto: 'capa', ref: { entidadeId: id }, buf: limpo, tipo, nomeDownload: arquivo, por: userIdDe(req) });
    const doc = await repo(colecao).findOne({ _id: id }, { projection: { [campo]: 1 } });
    const anterior = doc?.[campo]?.arquivoId || null;
    try {
      await repo(colecao).updateOne({ _id: id }, { $set: { [campo]: { arquivo, arquivoId: new ObjectId(salvo.id), mime: salvo.mime } } });
    } catch (err) {
      await arquivos.apagar(salvo.id).catch(() => {});
      throw err;
    }
    if (anterior) await arquivos.apagar(anterior).catch(err => avisar('capa anterior não apagada', err));
    registrarAuditoria({ acao, cursoId, entidade: { tipo: entidade, id } }, req);
    return `/api/portal/conteudo/imagens/${arquivo}`;
  }

  async function removerCapa(req, { colecao, id, campo, acao, entidade, cursoId }) {
    const doc = await repo(colecao).findOne({ _id: id }, { projection: { [campo]: 1 } });
    const anterior = doc?.[campo]?.arquivoId || null;
    await repo(colecao).updateOne({ _id: id }, { $set: { [campo]: null } });
    if (anterior) await arquivos.apagar(anterior).catch(err => avisar('capa não apagada', err));
    registrarAuditoria({ acao, cursoId, entidade: { tipo: entidade, id } }, req);
  }

  const exigirCurso = ass(async (req, _res, next) => {
    const id = lerIdLegado(req.params.cursoId);
    const curso = id ? await repos.cursoPorId(id) : null;
    if (!curso) throw new ErroPortal(404, null, 'Curso não encontrado.');
    req._curso = curso;
    next();
  });
  const exigirModulo = ass(async (req, _res, next) => {
    const id = lerIdLegado(req.params.moduloId);
    const modulo = id ? await repos.moduloPorId(id) : null;
    if (!modulo) throw new ErroPortal(404, null, 'Módulo não encontrado.');
    req._modulo = modulo;
    next();
  });

  admin.post('/cursos/:cursoId/capa-vertical', exigirCurso, ...corpoImagem, ass(async (req, res) => {
    const c = req._curso;
    const url = await trocarCapa(req, { colecao: 'cursos', id: c._id, campo: 'capaVertical', acao: 'curso.capa_alterada', entidade: 'curso', cursoId: c._id });
    res.json({ capaVerticalUrl: url });
  }));
  admin.delete('/cursos/:cursoId/capa-vertical', exigirCurso, ass(async (req, res) => {
    const c = req._curso;
    await removerCapa(req, { colecao: 'cursos', id: c._id, campo: 'capaVertical', acao: 'curso.capa_alterada', entidade: 'curso', cursoId: c._id });
    res.json({ ok: true });
  }));
  admin.post('/modulos/:moduloId/capa', exigirModulo, ...corpoImagem, ass(async (req, res) => {
    const m = req._modulo;
    const url = await trocarCapa(req, { colecao: 'modulos', id: m._id, campo: 'capa', acao: 'modulo.capa_alterada', entidade: 'modulo', cursoId: m.cursoId });
    res.json({ capaUrl: url });
  }));
  admin.delete('/modulos/:moduloId/capa', exigirModulo, ass(async (req, res) => {
    const m = req._modulo;
    await removerCapa(req, { colecao: 'modulos', id: m._id, campo: 'capa', acao: 'modulo.capa_alterada', entidade: 'modulo', cursoId: m.cursoId });
    res.json({ ok: true });
  }));

  return { publico, aluno, professor, admin, estudos, repos };
}

/** Capa 16:9 legada (capas.js), sem importar o módulo (ele lê config/disco). */
function capaLegadaUrl(curso) {
  return curso?.capa?.arquivo ? `/api/capas/${encodeURIComponent(curso.capa.arquivo)}` : '';
}

// ===================== grupos (busca, cascata) =====================
/** Provedores do grupo `busca` (cursos e aulas). Aulas só de curso acessível, sem vídeo nem material. */
export function criarBuscaEstudos({ repo, acesso }) {
  const filtroTitulo = termos => (termos.length ? { $and: termos.map(t => ({ titulo: { $regex: t.source, $options: t.flags.includes('i') ? 'i' : '' } })) } : {});
  const cursos = {
    tipo: 'cursos',
    papeis: ['aluno', 'professor', 'admin'],
    async buscar(req, termos, { limite = 5, pular = 0 } = {}) {
      const ctx = await acesso.contexto(req);
      const admin = ctx.papel === 'admin';
      const filtro = { ...filtroTitulo(termos), ...(admin ? {} : { isAtivo: { $ne: false } }) };
      const docs = await repo('cursos').find(filtro, { projection: { _id: 1, titulo: 1 } }).sort({ ordem: 1 }).skip(pular).limit(limite + 1).toArray();
      const itens = docs.slice(0, limite).map(c => {
        const liberado = admin || ctx.cursosLiberados.has(String(c._id)) || ctx.cursosDocente.has(String(c._id));
        return {
          tipo: 'cursos', id: String(c._id), titulo: c.titulo || '', contexto: null,
          href: liberado ? `dashboard.html?curso=${encodeURIComponent(c._id)}` : `loja.html?destacar=${encodeURIComponent(c._id)}`,
          bloqueado: !liberado
        };
      });
      return { itens, temMais: docs.length > limite };
    }
  };
  const aulas = {
    tipo: 'aulas',
    papeis: ['aluno', 'professor', 'admin'],
    async buscar(req, termos, { limite = 5, pular = 0 } = {}) {
      const ctx = await acesso.contexto(req);
      const admin = ctx.papel === 'admin';
      const cursoIds = admin ? null : [...new Set([...ctx.cursosLiberados, ...ctx.cursosDocente])];
      if (cursoIds && !cursoIds.length) return { itens: [], temMais: false };
      const modulos = await repo('modulos').find(cursoIds ? { cursoId: { $in: cursoIds } } : {}, { projection: { _id: 1, cursoId: 1, numero: 1 } }).toArray();
      if (!modulos.length) return { itens: [], temMais: false };
      const porId = new Map(modulos.map(m => [m._id, m]));
      const cursosDocs = await repo('cursos').find({ _id: { $in: [...new Set(modulos.map(m => m.cursoId))] } }, { projection: { _id: 1, titulo: 1 } }).toArray();
      const tituloCurso = new Map(cursosDocs.map(c => [c._id, c.titulo || '']));
      const filtro = { moduloId: { $in: [...porId.keys()] }, ...filtroTitulo(termos), ...(admin ? {} : { disponivel: { $ne: false } }) };
      const docs = await repo('aulas').find(filtro, { projection: { _id: 1, titulo: 1, moduloId: 1 } }).sort({ ordem: 1 }).skip(pular).limit(limite + 1).toArray();
      const itens = docs.slice(0, limite).map(a => {
        const m = porId.get(a.moduloId);
        return {
          tipo: 'aulas', id: String(a._id), titulo: a.titulo || '',
          contexto: [tituloCurso.get(m.cursoId), m.numero ? `Módulo ${m.numero}` : null].filter(Boolean).join(' · ') || null,
          href: `aula.html?curso=${encodeURIComponent(m.cursoId)}&modulo=${encodeURIComponent(m._id)}&item=${encodeURIComponent(`aula:${a._id}`)}`,
          bloqueado: false
        };
      });
      return { itens, temMais: docs.length > limite };
    }
  };
  return { cursos, aulas };
}

/** Membro `estudos` do grupo `cascata`: nunca bloqueia; apaga progresso de vídeo/conteúdo e binários (materiais e capas). */
export function criarCascataEstudos({ repo, arquivos, log = console }) {
  const apagarBinarios = async ids => {
    for (const id of ids) {
      if (!id) continue;
      try { await arquivos.apagar(id); } catch (err) { try { (log.warn || log.error).call(log, `[portal] cascata estudos: binário não apagado — ${err?.name || 'Error'}`); } catch { /* nada */ } }
    }
  };
  const idsDeMateriais = docs => docs.flatMap(d => (Array.isArray(d.materiais) ? d.materiais : []).map(m => m?.arquivoId).filter(Boolean));
  return {
    dominio: 'estudos',
    async bloqueios() { return 0; },
    async apagar(alvo) {
      const id = String(alvo?.id || '');
      if (!id) return;
      if (alvo.tipo === 'curso') {
        const curso = await repo('cursos').findOne({ _id: id }, { projection: { capaVertical: 1 } });
        const modulos = await repo('modulos').find({ cursoId: id }, { projection: { _id: 1, materiais: 1, capa: 1 } }).toArray();
        const aulas = modulos.length ? await repo('aulas').find({ moduloId: { $in: modulos.map(m => m._id) } }, { projection: { materiais: 1 } }).toArray() : [];
        await Promise.all([repo('progresso_video').deleteMany({ cursoId: id }), repo('progresso_conteudo').deleteMany({ cursoId: id })]);
        await apagarBinarios([curso?.capaVertical?.arquivoId, ...modulos.map(m => m.capa?.arquivoId), ...idsDeMateriais(modulos), ...idsDeMateriais(aulas)]);
      } else if (alvo.tipo === 'modulo') {
        const modulo = await repo('modulos').findOne({ _id: id }, { projection: { materiais: 1, capa: 1 } });
        const aulas = await repo('aulas').find({ moduloId: id }, { projection: { materiais: 1 } }).toArray();
        await Promise.all([repo('progresso_video').deleteMany({ moduloId: id }), repo('progresso_conteudo').deleteMany({ moduloId: id })]);
        await apagarBinarios([modulo?.capa?.arquivoId, ...idsDeMateriais(modulo ? [modulo] : []), ...idsDeMateriais(aulas)]);
      } else if (alvo.tipo === 'aula') {
        const aula = await repo('aulas').findOne({ _id: id }, { projection: { materiais: 1 } });
        const chaves = (Array.isArray(aula?.materiais) ? aula.materiais : []).map(m => `material:${m?.id}`);
        await repo('progresso_video').deleteMany({ aulaId: id });
        if (chaves.length) await repo('progresso_conteudo').deleteMany({ chave: { $in: chaves } });
        await apagarBinarios(idsDeMateriais(aula ? [aula] : []));
      }
    }
  };
}

/** Exportador `progresso` (Meus dados, API §6.3.4): aulas concluídas, % assistido e itens feitos do titular. */
export function criarExportadorProgresso({ repo }) {
  return {
    dominio: 'progresso',
    async exportar(userId) {
      const u = String(userId);
      const [aulas, video, conteudo] = await Promise.all([
        repo('progresso').find({ userId: u }, { projection: { _id: 0, aulaId: 1, completedAt: 1, origem: 1 } }).toArray(),
        repo('progresso_video').find({ userId: u }, { projection: { _id: 0, aulaId: 1, cursoId: 1, pctMax: 1, primeiroEm: 1, atualizadoEm: 1, fonte: 1 } }).toArray(),
        repo('progresso_conteudo').find({ userId: u }, { projection: { _id: 0, chave: 1, cursoId: 1, moduloId: 1, feitoEm: 1 } }).toArray()
      ]);
      return {
        aulasConcluidas: aulas.map(a => ({ aulaId: a.aulaId, concluidaEm: iso(a.completedAt), origem: a.origem || 'manual' })),
        assistido: video.map(v => ({ aulaId: v.aulaId, cursoId: v.cursoId ?? null, pctMax: Number(v.pctMax) || 0, fonte: v.fonte ?? null, primeiroEm: iso(v.primeiroEm), atualizadoEm: iso(v.atualizadoEm) })),
        itensFeitos: conteudo.map(c => ({ chave: c.chave, cursoId: c.cursoId ?? null, moduloId: c.moduloId ?? null, feitoEm: iso(c.feitoEm) }))
      };
    }
  };
}

/**
 * Relatório `progresso` (API §6.11.3): curso; turma; nº matrícula; nome; aulas concluídas; aulas disponíveis;
 * progresso %; última atividade. Docente só vê cursos/turmas da docência (§4.2); sem a F4a (matrículas),
 * a docência geral e o admin veem os alunos com liberação (turma e nº da matrícula "—").
 */
export function criarRelatorioProgresso({ repo, servicos, acesso, estudos, agora = () => new Date() }) {
  const tentar = nome => { const f = servicos.tentar(nome); return typeof f === 'function' ? f : null; };

  async function linhasDetalhadas(req, filtros = {}, { limite = 20000 } = {}) {
    const ctx = await acesso.contexto(req);
    const admin = ctx.papel === 'admin';
    let cursoIds;
    if (typeof filtros.cursoId === 'string' && filtros.cursoId) cursoIds = [filtros.cursoId];
    else cursoIds = admin ? (await repo('cursos').find({}, { projection: { _id: 1 } }).toArray()).map(c => String(c._id)) : [...ctx.cursosDocente];
    const turmaFiltro = typeof filtros.turmaId === 'string' && filtros.turmaId ? filtros.turmaId : null;
    const linhas = [];
    for (const cursoId of cursoIds) {
      if (!admin && !ctx.cursosDocente.has(cursoId)) continue;
      const curso = await repo('cursos').findOne({ _id: cursoId }, { projection: { titulo: 1 } });
      if (!curso) continue;
      const visiveis = await acesso.turmasVisiveis(req, cursoId); // null = todas
      if (turmaFiltro && visiveis && !visiveis.includes(turmaFiltro)) continue;
      let alunos = [];
      const alunosDoCurso = tentar('secretaria.alunosDoCurso');
      if (alunosDoCurso) {
        const turmaId = turmaFiltro || (visiveis ? visiveis : undefined);
        if (Array.isArray(turmaId) && !turmaId.length) continue;
        alunos = (await alunosDoCurso({ cursoId, turmaId, status: ['ativa', 'trancada', 'concluida'] })).map(a => ({ userId: String(a.userId), turma: a.turmaCodigo ?? null, matricula: a.numero ?? null }));
      } else if (visiveis === null && !turmaFiltro) {
        const libs = await repo('liberacoes').find({ cursoId }, { projection: { userId: 1 } }).toArray();
        alunos = libs.map(l => ({ userId: String(l.userId), turma: null, matricula: null }));
      }
      const vistos = new Set();
      alunos = alunos.filter(a => (vistos.has(a.userId) ? false : vistos.add(a.userId)));
      const publicos = tentar('perfis.publicos');
      const perfis = publicos && alunos.length ? await publicos(alunos.map(a => a.userId)) : new Map();
      for (const a of alunos) {
        if (linhas.length > limite) break;
        const calc = await estudos.calcularCurso(a.userId, cursoId, { comAvaliacoes: false });
        const r = calc ? estudos.resumirCurso(calc) : null;
        const p = perfis.get?.(a.userId) || null;
        linhas.push({
          curso: curso.titulo || '', turma: a.turma, matricula: a.matricula, nome: p ? (p.nomeSocial || p.nome || null) : null,
          aulasConcluidas: r ? r.aulasConcluidas : null, aulasDisponiveis: r ? r.aulasTotal : null, progressoPct: r ? r.pct : null,
          ultimaAtividade: r?.ultimaAtividadeEm ? iso(r.ultimaAtividadeEm) : null,
          _porModulo: calc ? calc.conteudos.map(c => ({ rotulo: `Módulo ${c.modulo.numero}`, pct: c.progresso.pct })) : []
        });
      }
    }
    return linhas;
  }

  return {
    id: 'progresso',
    titulo: 'Progresso',
    papeis: ['professor', 'admin'],
    filtros: [{ chave: 'cursoId', tipo: 'texto' }, { chave: 'turmaId', tipo: 'texto' }],
    colunas: [
      { chave: 'curso', rotulo: 'Curso', tipo: 'texto' },
      { chave: 'turma', rotulo: 'Turma', tipo: 'texto' },
      { chave: 'matricula', rotulo: 'Nº da matrícula', tipo: 'texto' },
      { chave: 'nome', rotulo: 'Nome', tipo: 'texto' },
      { chave: 'aulasConcluidas', rotulo: 'Aulas concluídas', tipo: 'numero' },
      { chave: 'aulasDisponiveis', rotulo: 'Aulas disponíveis', tipo: 'numero' },
      { chave: 'progressoPct', rotulo: 'Progresso %', tipo: 'pct' },
      { chave: 'ultimaAtividade', rotulo: 'Última atividade', tipo: 'dataHora' }
    ],
    async consultar(req, filtros, opcoes) {
      return (await linhasDetalhadas(req, filtros, opcoes)).map(({ _porModulo, ...l }) => l);
    },
    async resumir(req, filtros) {
      const linhas = await linhasDetalhadas(req, filtros);
      if (!linhas.length) {
        return { kpis: [
          { chave: 'progressoMedioPct', rotulo: 'Progresso médio', valor: null, formato: 'pct' },
          { chave: 'concluiramCurso', rotulo: 'Concluíram as aulas', valor: null, formato: 'numero' },
          { chave: 'semAtividade30d', rotulo: 'Sem atividade há 30 dias', valor: null, formato: 'numero' },
          { chave: 'alunos', rotulo: 'Alunos', valor: 0, formato: 'numero' }
        ], series: [] };
      }
      const pcts = linhas.map(l => l.progressoPct).filter(v => typeof v === 'number');
      const media = v => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
      const limite30 = agora().getTime() - 30 * 24 * 3600 * 1000;
      const porModulo = new Map();
      for (const l of linhas) for (const m of l._porModulo) {
        if (typeof m.pct !== 'number') continue;
        if (!porModulo.has(m.rotulo)) porModulo.set(m.rotulo, []);
        porModulo.get(m.rotulo).push(m.pct);
      }
      return {
        kpis: [
          { chave: 'progressoMedioPct', rotulo: 'Progresso médio', valor: media(pcts), formato: 'pct' },
          { chave: 'concluiramCurso', rotulo: 'Concluíram as aulas', valor: linhas.filter(l => l.progressoPct === 100).length, formato: 'numero' },
          { chave: 'semAtividade30d', rotulo: 'Sem atividade há 30 dias', valor: linhas.filter(l => !l.ultimaAtividade || new Date(l.ultimaAtividade).getTime() < limite30).length, formato: 'numero' },
          { chave: 'alunos', rotulo: 'Alunos', valor: linhas.length, formato: 'numero' }
        ],
        series: [{ chave: 'progressoMedioPorModulo', rotulo: 'Progresso médio por módulo', formato: 'pct', pontos: [...porModulo.entries()].map(([rotulo, v]) => ({ rotulo, valor: media(v) })) }]
      };
    }
  };
}

/**
 * Contrato do agregador (API §5.1): síncrono no efeito, sem E/S — só registra rotas,
 * serviços, grupos e especificações de índice.
 */
export default async function montar(ctx) {
  const { rotas, servicos, comum } = ctx;
  comum.registrarIndices(INDICES_ESTUDOS);
  const r = criarRotaConteudo({
    repo: comum.repo, servicos, acesso: comum.acesso, arquivos: comum.arquivos, auditoria: comum.auditoria,
    agora: comum.agora, log: comum.log,
    maxArquivoBytes: comum.configPortal?.maxArquivoBytes || MAX_ARQUIVO_PADRAO,
    capaMaxBytes: comum.configPortal?.bannerMaxBytes || BANNER_MAX_BYTES
  });
  rotas.publico.use(r.publico);
  rotas.aluno.use(r.aluno);
  rotas.professor.use(r.professor);
  rotas.admin.use(r.admin);

  servicos.registrar('estudos.progressoDoCurso', r.estudos.progressoDoCurso);
  servicos.registrar('estudos.aulasDisponiveis', r.estudos.aulasDisponiveis);
  const busca = criarBuscaEstudos({ repo: comum.repo, acesso: comum.acesso });
  servicos.adicionar('busca', busca.cursos);
  servicos.adicionar('busca', busca.aulas);
  servicos.adicionar('cascata', criarCascataEstudos({ repo: comum.repo, arquivos: comum.arquivos, log: comum.log }));
  servicos.adicionar('exportador', criarExportadorProgresso({ repo: comum.repo }));
  servicos.adicionar('relatorio', criarRelatorioProgresso({ repo: comum.repo, servicos, acesso: comum.acesso, estudos: r.estudos, agora: comum.agora }));
}
