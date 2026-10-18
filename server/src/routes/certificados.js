// =============================================================
// COMPLEXO DMC · /api — certificados de conclusão (rota LEGADA, evoluída)
// PORTAL-API §6.7.7, §8.11, §4.7 (selo) · dono: F3b.
//
// Coleção `certificados`:
//   { _id:ObjectId, codigo, userId, cursoId, nomeAluno, tituloCurso,
//     cargaHoraria, totalAulas, emitidoEm,
//     // aditivos desta rodada (congelados na emissão):
//     matriculaId?, matriculaNumero?, turmaCodigo?, notaFinal?, regra?,
//     nomeOrigem?, hash?, kid? }
//
// Regras (D5 preservada):
// - Emitido continua válido: o curto-circuito "já existe → devolve" vem
//   ANTES de qualquer regra nova. GET /certificados/validar/:codigo não muda.
// - Regra `aulas` (curso sem avaliação modular publicada): 100% das aulas
//   disponíveis, como hoje. Regra `aprovacao` (há modular publicada): 100%
//   das aulas E todo módulo com modular aprovado (nota ≥ notaMinima).
//   Critérios do curso (frequência, carga, TCC) valem nas duas.
// - Serviço de OUTRA fatia ausente (F2, F3a, F4a) → regra legada + aviso no
//   log; nunca 503 (API §4.4, DC-54). O selo é gravado sempre que o
//   assinador existe (núcleo).
// - Nome: social (ato da coordenação) → registro → conta (DC-64).
//
// Fábrica testável: criarRotaCertificados({ repo, servicos, ... }). O
// export default é o Router de produção (server.js importa este arquivo
// sem mudança).
// =============================================================
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { servicos as servicosDoProcesso } from '../portal/servicos.js';
import { criarRepositoriosCertificacao } from '../portal/certificacao/repositorios.js';
import {
  LATO_SENSU, criteriosLocais, horasLocais, avaliarCertificado, camposSeloCertificado, hashPrefixo, textoFaltamAulas
} from '../portal/certificacao/declaracoes.js';

const str = v => (v == null ? '' : String(v));

/** Sem I, O, 0 e 1: o código é lido em voz alta e digitado à mão. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function gerarCodigoCertificado(bytes = randomBytes(8)) {
  const bloco = i => Array.from({ length: 4 }, (_, j) => ALFABETO[bytes[i * 4 + j] % ALFABETO.length]).join('');
  return `DMC-${bloco(0)}-${bloco(1)}`;
}

/** Formato de hoje + aditivos (hashPrefixo; nomeOrigem quando há). */
export function certificadoPublico(cert) {
  const out = {
    id: String(cert._id),
    codigo: cert.codigo,
    cursoId: cert.cursoId,
    tituloCurso: cert.tituloCurso || '',
    nomeAluno: cert.nomeAluno || '',
    cargaHoraria: cert.cargaHoraria || '',
    totalAulas: Number(cert.totalAulas) || 0,
    emitidoEm: cert.emitidoEm instanceof Date ? cert.emitidoEm.toISOString() : cert.emitidoEm,
    hashPrefixo: hashPrefixo(cert.hash)
  };
  if (cert.nomeOrigem) out.nomeOrigem = cert.nomeOrigem;
  return out;
}

function avisar(log, texto) {
  try { (log.warn || log.error).call(log, `[portal] ${texto}`); } catch { /* nada */ }
}

/**
 * Avaliador do certificado de um aluno num curso (usado pela rota legada e pelas
 * declarações). Lê serviços na hora da requisição (API §4.4).
 */
export function criarAvaliadorCertificado({ repo, servicos, log = console }) {
  const R = criarRepositoriosCertificacao(repo);
  const tentar = nome => (servicos && typeof servicos.tentar === 'function' ? servicos.tentar(nome) : null);

  function criteriosDe(curso) {
    const f = tentar('academico.criteriosDe');
    if (typeof f === 'function') {
      try {
        const c = f(curso);
        if (c && typeof c === 'object' && !(c instanceof Promise)) return { ...criteriosLocais(curso), ...c };
      } catch (err) { avisar(log, `academico.criteriosDe falhou na rota legada (${err?.message || err})`); }
    }
    return criteriosLocais(curso);
  }

  async function matriculaDe(userId, cursoId, { garantir = false } = {}) {
    const nome = garantir ? 'secretaria.garantirMatricula' : 'secretaria.matriculaVigente';
    const f = tentar(nome);
    if (typeof f !== 'function') { avisar(log, `${nome} ausente na rota legada de certificados (regra sem matrícula)`); return null; }
    try {
      const m = await f(String(userId), String(cursoId));
      return m && !m.semAcesso ? m : null;
    } catch (err) {
      avisar(log, `${nome} falhou na rota legada de certificados (${err?.message || err})`);
      return null;
    }
  }

  /**
   * @returns {{ curso, total, concluidas, faltam, elegivel, regra, situacaoCurso, pendencias, notaMinima, mediaParcial }}
   */
  async function avaliar(userId, cursoId, { matricula = null } = {}) {
    const curso = await R.curso(cursoId);
    const modulos = await R.modulosDoCurso(cursoId);
    const aulaIds = await R.aulasElegiveis(cursoId, modulos);
    const concluidas = await R.concluidas(userId, aulaIds);
    const total = aulaIds.length;
    const criterios = criteriosDe(curso);
    const base = { curso, total, concluidas, faltam: Math.max(0, total - concluidas), notaMinima: criterios.notaMinima };

    if (curso?.nivel === LATO_SENSU) {
      return { ...base, ...avaliarCertificado({ curso, criterios, totalAulas: total, concluidas, modulos: [] }) };
    }

    // 1) F3a: situação do curso completa (nota, frequência, critérios).
    const situacao = tentar('academico.situacaoDoCurso');
    if (typeof situacao === 'function') {
      try {
        const s = await situacao(String(userId), String(cursoId));
        if (s && typeof s === 'object') {
          const pendencias = Array.isArray(s.pendencias) ? s.pendencias.filter(p => p && typeof p.texto === 'string') : [];
          const elegivel = s.elegivelCertificado === true && total > 0 && concluidas >= total;
          if (!elegivel && total > 0 && concluidas < total && !pendencias.some(p => p.tipo === 'aulas')) {
            pendencias.unshift({ tipo: 'aulas', texto: textoFaltamAulas(total - concluidas, total) });
          }
          return {
            ...base, elegivel, regra: s.regra === 'aprovacao' ? 'aprovacao' : 'aulas', situacaoCurso: s.situacao || (elegivel ? 'concluido' : 'cursando'),
            pendencias: elegivel ? [] : pendencias, mediaParcial: typeof s.mediaParcial === 'number' ? s.mediaParcial : null,
            frequenciaPct: typeof s.frequenciaGeralPct === 'number' ? s.frequenciaGeralPct : null
          };
        }
      } catch (err) {
        avisar(log, `academico.situacaoDoCurso falhou na rota legada (${err?.message || err}); seguindo pela regra local`);
      }
    }

    // 2) Sem F3a: regra local com a nota da F2 por matrícula (quando houver as duas).
    let notas = null;
    const notaDoModulo = tentar('avaliacoes.notaDoModulo');
    const mat = matricula || await matriculaDe(userId, cursoId);
    if (typeof notaDoModulo === 'function' && mat) {
      try {
        notas = new Map();
        for (const m of modulos) {
          const r = await notaDoModulo(String(mat._id ?? mat.id), String(m._id));
          if (r) notas.set(String(m._id), r);
        }
      } catch (err) {
        avisar(log, `avaliacoes.notaDoModulo falhou na rota legada (${err?.message || err}); regra aulas`);
        notas = null;
      }
    } else if (typeof notaDoModulo !== 'function') {
      avisar(log, 'avaliacoes.notaDoModulo ausente na rota legada de certificados (regra aulas)');
    }
    const r = avaliarCertificado({
      curso, criterios, totalAulas: total, concluidas, notas, frequenciaPct: undefined, horasDe: horasLocais,
      modulos: modulos.map(m => ({ id: m._id, numero: m.numero, titulo: m.titulo, tipo: m.tipo }))
    });
    return { ...base, ...r, frequenciaPct: null };
  }

  /**
   * Nome que a emissão congelaria agora (DC-64): social (ato da coordenação) → registro → conta.
   * @returns {{ nome:string|null, origem:'social'|'registro'|'conta'|null, faltando?:string[] }}
   */
  async function nomePrevisto(user, matricula) {
    const userId = String(user._id);
    const publicos = tentar('perfis.publicos');
    const identificacao = tentar('perfis.identificacao');
    let social = null;
    if (typeof publicos === 'function') {
      try { social = (await publicos([userId]))?.get(userId)?.nomeSocial || null; } catch (err) { avisar(log, `perfis.publicos falhou (${err?.message || err})`); }
    }
    if (matricula?.nomeEmDocumentos?.usar === 'social' && social) return { nome: social, origem: 'social' };
    let ident = null;
    if (typeof identificacao === 'function') {
      try { ident = await identificacao(userId); } catch (err) { avisar(log, `perfis.identificacao falhou (${err?.message || err})`); }
    }
    if (ident?.nomeRegistro) return { nome: ident.nomeRegistro, origem: 'registro' };
    if (social) return { nome: null, origem: null, faltando: ['nomeRegistro'] };
    return { nome: user.nome || String(user.email || '').split('@')[0], origem: 'conta' };
  }

  return Object.freeze({ avaliar, nomePrevisto, matriculaDe, criteriosDe, repositorios: R });
}

/**
 * @param {{ repo:(nome)=>object, servicos?, exigirLogin?, agora?, log?, gerarCodigo? }} deps
 */
export function criarRotaCertificados(deps = {}) {
  const {
    repo, servicos = servicosDoProcesso, exigirLogin = requireAuth, agora = () => new Date(), log = console,
    gerarCodigo = () => gerarCodigoCertificado()
  } = deps;
  if (typeof repo !== 'function') throw new TypeError('criarRotaCertificados: informe repo.');
  const avaliador = criarAvaliadorCertificado({ repo, servicos, log });
  const R = avaliador.repositorios;
  const tentar = nome => servicos.tentar(nome);
  const router = Router();

  /**
   * Reconciliação (API §8.8): certificado emitido com a matrícula ainda ativa → conclui na leitura
   * por `secretaria.concluirMatricula` (idempotente). Serviço ausente ou falha → fica como está e
   * tenta de novo na próxima leitura. Nunca muda a resposta.
   */
  async function reconciliarMatricula(req, cert) {
    const vigente = tentar('secretaria.matriculaVigente');
    const concluir = tentar('secretaria.concluirMatricula');
    if (typeof vigente !== 'function' || typeof concluir !== 'function') return;
    try {
      const m = await vigente(String(cert.userId), String(cert.cursoId));
      if (!m || m.status !== 'ativa') return;
      await concluir(String(m._id ?? m.id), {
        resultadoFinal: { situacao: cert.regra === 'aprovacao' ? 'aprovado' : 'concluido', notaFinal: typeof cert.notaFinal === 'number' ? cert.notaFinal : null, regra: cert.regra || 'aulas' },
        certificadoCodigo: cert.codigo, req
      });
    } catch (err) {
      avisar(log, `reconciliação da matrícula falhou (${err?.message || err}); tenta de novo na próxima leitura`);
    }
  }

  // ============ VALIDAÇÃO PÚBLICA (legada, inalterada — D5) ============
  // Sem login de propósito: quem recebe o certificado confere sem conta.
  router.get('/certificados/validar/:codigo', async (req, res) => {
    const codigo = str(req.params.codigo).trim().toUpperCase();
    const cert = await R.certificadoPorCodigo(codigo);
    if (!cert) return res.status(404).json({ valido: false, error: 'Certificado não encontrado.' });

    res.json({
      valido: true,
      certificado: {
        codigo: cert.codigo,
        nomeAluno: cert.nomeAluno || '',
        tituloCurso: cert.tituloCurso || '',
        cargaHoraria: cert.cargaHoraria || '',
        emitidoEm: cert.emitidoEm instanceof Date ? cert.emitidoEm.toISOString() : cert.emitidoEm
      }
    });
  });

  // ============ MEUS CERTIFICADOS ============
  router.get('/certificados', exigirLogin, async (req, res) => {
    const itens = await R.col('certificados')
      .find({ userId: String(req.user._id) }, { sort: { emitidoEm: -1 } })
      .toArray();
    itens.sort((a, b) => new Date(b.emitidoEm) - new Date(a.emitidoEm));
    res.json({ itens: itens.map(certificadoPublico) });
  });

  // ============ ELEGIBILIDADE (o que falta pra emitir) ============
  router.get('/cursos/:cursoId/certificado', exigirLogin, async (req, res) => {
    const cursoId = str(req.params.cursoId).trim();
    const userId = String(req.user._id);

    const existente = await R.certificadoDe(userId, cursoId);
    if (existente) {
      await reconciliarMatricula(req, existente);
      return res.json({ emitido: true, certificado: certificadoPublico(existente) });
    }

    const matricula = await avaliador.matriculaDe(userId, cursoId);
    const a = await avaliador.avaliar(userId, cursoId, { matricula });
    const nome = await avaliador.nomePrevisto(req.user, matricula);
    const corpo = {
      emitido: false,
      total: a.total,
      concluidas: a.concluidas,
      faltam: a.faltam,
      elegivel: a.elegivel,
      regra: a.regra,
      situacaoCurso: a.situacaoCurso,
      pendencias: a.pendencias,
      nomePrevisto: nome.nome,
      nomeOrigem: nome.origem,
      notaMinima: a.notaMinima,
      // aditivos para a tela "Declarações e certificados" (sem depender do catálogo legado)
      tituloCurso: a.curso?.titulo ?? null,
      cargaHoraria: a.curso?.cargaHoraria ?? null,
      nivel: a.curso?.nivel ?? null
    };
    if (nome.faltando) corpo.faltando = nome.faltando;
    res.json(corpo);
  });

  // ============ EMITIR ============
  // Idempotente: chamar duas vezes devolve o mesmo certificado, nunca um segundo.
  router.post('/cursos/:cursoId/certificado', exigirLogin, async (req, res) => {
    const cursoId = str(req.params.cursoId).trim();
    const userId = String(req.user._id);

    const existente = await R.certificadoDe(userId, cursoId);
    if (existente) return res.json({ certificado: certificadoPublico(existente), novo: false });

    const curso = await R.curso(cursoId);
    if (!curso) return res.status(404).json({ error: 'Curso não encontrado.' });

    // Admin enxerga tudo na plataforma, mas certificado é de quem cursou:
    // exige liberação real, inclusive pra admin.
    const lib = await R.liberacao(userId, cursoId);
    if (!lib) return res.status(403).json({ error: 'Você não tem acesso a este curso.' });

    if (curso.nivel === LATO_SENSU) {
      return res.status(409).json({ error: 'Neste curso, o certificado é emitido pela instituição parceira.', codigo: 'certificado-pela-ies' });
    }

    const matricula = await avaliador.matriculaDe(userId, cursoId, { garantir: true });
    const a = await avaliador.avaliar(userId, cursoId, { matricula });
    if (!a.total) {
      return res.status(409).json({ error: 'Este curso ainda não tem aulas disponíveis para conclusão.', codigo: 'nao-elegivel', pendencias: a.pendencias });
    }
    if (!a.elegivel) {
      const error = a.faltam > 0 ? textoFaltamAulas(a.faltam, a.total) : (a.pendencias[0]?.texto || 'Os requisitos para esta emissão ainda não foram cumpridos.');
      return res.status(409).json({ error, codigo: 'nao-elegivel', pendencias: a.pendencias });
    }

    const nome = await avaliador.nomePrevisto(req.user, matricula);
    if (!nome.nome) {
      return res.status(409).json({ error: 'Informe o nome de registro no seu cadastro antes de emitir o certificado.', codigo: 'cadastro-incompleto', faltando: nome.faltando || ['nomeRegistro'] });
    }

    const matriculaId = matricula ? String(matricula._id ?? matricula.id) : null;
    const turmaCodigo = matricula
      ? (matricula.turmaCodigo ?? (Array.isArray(matricula.enturmacoes) ? (matricula.enturmacoes.find(e => !e.ate)?.turmaCodigo ?? null) : null))
      : null;
    const doc = {
      codigo: null,
      userId,
      cursoId,
      nomeAluno: nome.nome,
      tituloCurso: curso.titulo || '',
      cargaHoraria: curso.cargaHoraria || '',
      totalAulas: a.total,
      emitidoEm: agora(),
      matriculaId: matricula ? (matricula._id ?? null) : null,
      matriculaNumero: matricula?.numero ?? null,
      turmaCodigo,
      notaFinal: matricula && typeof a.mediaParcial === 'number' ? a.mediaParcial : null,
      regra: a.regra,
      nomeOrigem: nome.origem
    };
    if (!matricula) { doc.matriculaId = null; doc.notaFinal = null; }

    const assinador = tentar('assinador');
    let inserido = null;
    for (let tentativa = 0; tentativa < 3 && !inserido; tentativa++) {
      doc.codigo = gerarCodigo();
      if (assinador) {
        const { hash, kid } = assinador.assinar('certificado', camposSeloCertificado({ ...doc, matriculaId }));
        doc.hash = hash;
        doc.kid = kid;
      }
      try {
        const { insertedId } = await R.col('certificados').insertOne({ ...doc });
        inserido = { ...doc, _id: insertedId };
      } catch (err) {
        // Corrida no índice único: outra requisição emitiu primeiro.
        if (err && err.code === 11000) {
          const jaFeito = await R.certificadoDe(userId, cursoId);
          if (jaFeito) return res.json({ certificado: certificadoPublico(jaFeito), novo: false });
          continue; // colisão de código: gera outro
        }
        throw err;
      }
    }
    if (!inserido) throw new Error('certificados: não foi possível gerar um código único.');
    if (!assinador) avisar(log, 'assinador ausente: certificado emitido sem selo');

    const auditoria = tentar('auditoria');
    if (auditoria) {
      await auditoria.registrar({
        acao: 'certificado.emitido', entidade: { tipo: 'certificado', id: inserido.codigo }, alvoUserId: userId, cursoId,
        extra: { regra: inserido.regra, nomeOrigem: inserido.nomeOrigem }
      }, req);
    }

    const concluir = tentar('secretaria.concluirMatricula');
    if (matricula && typeof concluir === 'function') {
      try {
        await concluir(matriculaId, {
          resultadoFinal: { situacao: a.situacaoCurso, notaFinal: inserido.notaFinal, frequenciaPct: a.frequenciaPct ?? null, regra: a.regra },
          certificadoCodigo: inserido.codigo, req
        });
      } catch (err) {
        avisar(log, `secretaria.concluirMatricula falhou depois da emissão (${err?.message || err}); reconciliação na próxima leitura`);
      }
    } else if (matricula) {
      avisar(log, 'secretaria.concluirMatricula ausente na rota legada de certificados');
    }

    res.status(201).json({ certificado: certificadoPublico(inserido), novo: true });
  });

  return router;
}

// ---------- Router de produção (server.js importa o default, sem mudança) ----------
const router = criarRotaCertificados({ repo: nome => getDb().collection(nome) });
export default router;
