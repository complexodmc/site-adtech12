// =============================================================
// COMPLEXO DMC · Portal — Assistente de IA: ferramentas SOMENTE LEITURA
// PORTAL-API §6.10.3 (tabela de ferramentas) · dono: F6b.
//
// Regras garantidas aqui (e conferidas em atendimento-ia.test.js):
// - `userId` vem SEMPRE do contexto da sessão (nunca de `args`);
// - cada ferramenta devolve SÓ os campos enumerados da API (texto livre
//   de terceiros — motivo de pendência, título de contrato, descrição de
//   lançamento — nunca sai);
// - todo campo de texto passa por mascararDadosPessoais antes de ir ao
//   provedor; saída ≤ 20 itens e ≤ 8 KB;
// - serviço de outra fatia ausente (ou que falhou) → { disponivel:false };
//   `cursoId` que não é do aluno → { erro:'curso_nao_encontrado' };
// - nenhuma ferramenta grava nada.
// =============================================================
import { mascararDadosPessoais } from '../validacao.js';

export const MAX_ITENS = 20;
export const MAX_BYTES = 8 * 1024;

/** Ferramentas cuja resposta NÃO vai à fila de professores no anexo do escalonamento. */
export const FERRAMENTAS_SENSIVEIS = Object.freeze(['meus_documentos_pendentes', 'meus_contratos_pendentes', 'meus_lancamentos_em_aberto']);

/** Ação gerada pelo servidor para cada ferramenta com `ok` (mapa fixo da API). */
export const ACOES_POR_FERRAMENTA = Object.freeze({
  meus_cursos_e_progresso: Object.freeze({ rotulo: 'Abrir Meus cursos', href: 'meus-cursos.html' }),
  minhas_notas_e_situacao: Object.freeze({ rotulo: 'Abrir Acadêmico', href: 'academico.html' }),
  minha_frequencia: Object.freeze({ rotulo: 'Abrir Acadêmico', href: 'academico.html' }),
  meus_documentos_pendentes: Object.freeze({ rotulo: 'Abrir Documentos', href: 'documentos.html' }),
  meus_contratos_pendentes: Object.freeze({ rotulo: 'Abrir Contratos', href: 'contratos.html' }),
  meus_lancamentos_em_aberto: Object.freeze({ rotulo: 'Abrir Financeiro', href: 'financeiro.html' }),
  minhas_proximas_aulas_ao_vivo: Object.freeze({ rotulo: 'Abrir Aulas ao vivo', href: 'ao-vivo.html' }),
  meus_atendimentos_abertos: Object.freeze({ rotulo: 'Abrir Seus atendimentos', href: 'atendimentos.html' }),
  sugerir_falar_com_equipe: Object.freeze({ rotulo: 'Falar com a equipe', href: 'assistente.html#equipe' })
});

export const CATEGORIAS_ESCALONAMENTO = Object.freeze(['academico', 'secretaria', 'financeiro', 'tecnico']);

const ROTULOS_SITUACAO = Object.freeze({
  cursando: 'Cursando', aprovado: 'Aprovado', em_recuperacao: 'Em recuperação', reprovado: 'Reprovado',
  concluido: 'Concluído', concluida: 'Concluído', nao_iniciado: 'Não iniciado', aguardando_correcao: 'Aguardando correção'
});
const ROTULOS_DOCUMENTO = Object.freeze({
  nao_enviado: 'Não enviado', em_revisao: 'Em revisão', aprovado: 'Aprovado', pendente: 'Pendente', recusado: 'Pendente'
});
const ROTULOS_LANCAMENTO = Object.freeze({ pendente: 'Em aberto', em_aberto: 'Em aberto', atrasado: 'Em atraso', em_atraso: 'Em atraso', pago: 'Pago', cancelado: 'Cancelado' });
const ROTULOS_CATEGORIA = Object.freeze({ academico: 'Acadêmico', secretaria: 'Secretaria', financeiro: 'Financeiro', tecnico: 'Acesso e tecnologia', privacidade: 'Privacidade' });
const ROTULOS_PROTOCOLO = Object.freeze({ aberto: 'Aberto', respondido: 'Respondido', encerrado: 'Encerrado' });

// ---------- declarações (Gemini functionDeclarations, subconjunto OpenAPI) ----------
const ARG_CURSO = Object.freeze({
  type: 'OBJECT',
  properties: { cursoId: { type: 'STRING', description: 'Identificador do curso (opcional; sem ele, todos os cursos do aluno).' } }
});

export const DECLARACOES = Object.freeze([
  { name: 'meus_cursos_e_progresso', description: 'Lista os cursos do aluno com a situação e o progresso nas aulas.' },
  { name: 'minhas_notas_e_situacao', description: 'Notas e situação por módulo nos cursos do aluno, com tentativas restantes e nota mínima.', parameters: ARG_CURSO },
  { name: 'minha_frequencia', description: 'Frequência do aluno por curso e módulo (ao vivo e gravado), faltas e frequência mínima.', parameters: ARG_CURSO },
  { name: 'meus_documentos_pendentes', description: 'Documentos pessoais exigidos que ainda estão pendentes para o aluno.' },
  { name: 'meus_contratos_pendentes', description: 'Contratos do aluno que aguardam assinatura.' },
  { name: 'meus_lancamentos_em_aberto', description: 'Lançamentos financeiros do aluno em aberto ou em atraso.' },
  {
    name: 'minhas_proximas_aulas_ao_vivo', description: 'Próximas aulas ao vivo dos cursos do aluno.',
    parameters: { type: 'OBJECT', properties: { dias: { type: 'INTEGER', description: 'Quantos dias à frente (1 a 60; padrão 14).' } } }
  },
  { name: 'meus_atendimentos_abertos', description: 'Atendimentos (protocolos) do aluno que ainda não foram encerrados.' },
  {
    name: 'buscar_regulamento', description: 'Busca trechos do regulamento acadêmico publicado pela coordenação.',
    parameters: { type: 'OBJECT', properties: { consulta: { type: 'STRING', description: 'Assunto a buscar no regulamento.' } }, required: ['consulta'] }
  },
  {
    name: 'sugerir_falar_com_equipe', description: 'Sugere ao aluno levar a pergunta à equipe humana (não abre atendimento).',
    parameters: {
      type: 'OBJECT',
      properties: {
        motivo: { type: 'STRING', description: 'Por que a equipe deve atender.' },
        categoria: { type: 'STRING', enum: [...CATEGORIAS_ESCALONAMENTO], description: 'Categoria sugerida.' }
      },
      required: ['motivo']
    }
  }
].map(d => Object.freeze(d)));

export const NOMES_FERRAMENTAS = Object.freeze(DECLARACOES.map(d => d.name));

// ---------- utilitários puros ----------
/** Mascara todo campo de texto (profundo). Números, booleanos e null passam. */
export function mascararProfundo(valor) {
  if (typeof valor === 'string') return mascararDadosPessoais(valor).texto;
  if (Array.isArray(valor)) return valor.map(mascararProfundo);
  if (valor && typeof valor === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = mascararProfundo(v);
    return out;
  }
  return valor;
}

/** ≤ 20 itens e ≤ 8 KB (corta itens do fim; marca `cortado`). */
export function limitarSaida(itens) {
  let lista = Array.isArray(itens) ? itens.slice(0, MAX_ITENS) : [];
  let cortado = Array.isArray(itens) && itens.length > lista.length;
  while (lista.length && Buffer.byteLength(JSON.stringify({ itens: lista }), 'utf8') > MAX_BYTES) {
    lista = lista.slice(0, -1);
    cortado = true;
  }
  return cortado ? { itens: lista, cortado: true } : { itens: lista };
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function reaisDeCentavos(c) {
  const n = Number(c);
  return Number.isFinite(n) ? BRL.format(n / 100).replace(/\s/g, ' ') : null;
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
const iso = v => (v instanceof Date ? v.toISOString() : txt(v));
const rotulo = (mapa, v) => (typeof v === 'string' ? (mapa[v] || null) : null);

// ---------- fábrica ----------
/**
 * @param {{ servicos, acesso, repo, carregarRag?: () => Promise<{ recuperar }|null>, log? }} deps
 */
export function criarFerramentas({ servicos, acesso, repo, carregarRag = carregarRagPadrao, log = console } = {}) {
  if (!servicos || typeof servicos.tentar !== 'function') throw new TypeError('criarFerramentas: informe servicos.');
  if (!acesso || typeof acesso.cursosDoAluno !== 'function') throw new TypeError('criarFerramentas: informe acesso.');
  if (typeof repo !== 'function') throw new TypeError('criarFerramentas: informe repo.');

  const indisponivel = () => ({ ok: false, resposta: { disponivel: false } });
  const servico = nome => { const f = servicos.tentar(nome); return typeof f === 'function' ? f : null; };

  /** Cursos (legado, só leitura): título e critérios (para academico.criteriosDe). */
  async function cursosPorId(ids) {
    if (!ids.length) return new Map();
    const docs = await repo('cursos').find({ _id: { $in: ids } }, { projection: { titulo: 1, criterios: 1 } }).toArray();
    return new Map(docs.map(d => [String(d._id), d]));
  }
  async function titulosDosCursos(ids) {
    const docs = await cursosPorId(ids);
    return new Map(ids.map(id => [id, txt(docs.get(id)?.titulo) || id]));
  }
  async function criteriosDoCurso(cursoId, cache) {
    const criteriosDe = servico('academico.criteriosDe');
    if (!criteriosDe) return null;
    try { return await criteriosDe(cache.get(cursoId) || { _id: cursoId }); } catch { return null; }
  }

  /** Cursos do aluno; com `cursoId`, só ele (alheio → erro). */
  async function cursosAlvo(ctx, args) {
    const meus = await acesso.cursosDoAluno(ctx.userId);
    const pedido = args && typeof args.cursoId === 'string' && args.cursoId.trim() ? args.cursoId.trim() : null;
    if (pedido && !meus.includes(pedido)) return { erro: 'curso_nao_encontrado' };
    return { ids: pedido ? [pedido] : meus };
  }

  const ok = itens => ({ ok: true, resposta: mascararProfundo(limitarSaida(itens)) });

  const impl = {
    async meus_cursos_e_progresso(_args, ctx) {
      const progresso = servico('estudos.progressoDoCurso');
      if (!progresso) return indisponivel();
      const situacao = servico('academico.situacaoDoCurso');
      const { ids } = await cursosAlvo(ctx, {});
      const titulos = await titulosDosCursos(ids);
      const itens = [];
      for (const cursoId of ids) {
        const p = await progresso(ctx.userId, cursoId);
        let s = null;
        if (situacao) { try { s = await situacao(ctx.userId, cursoId); } catch { s = null; } }
        itens.push({
          cursoId, titulo: titulos.get(cursoId) || cursoId,
          situacaoRotulo: txt(s?.situacaoRotulo) || rotulo(ROTULOS_SITUACAO, s?.situacao),
          progressoPct: num(p?.pct), aulasConcluidas: num(p?.aulasConcluidas), aulasTotal: num(p?.aulasTotal)
        });
      }
      return ok(itens);
    },

    async minhas_notas_e_situacao(args, ctx) {
      const situacao = servico('academico.situacaoDoCurso');
      if (!situacao) return indisponivel();
      const alvo = await cursosAlvo(ctx, args);
      if (alvo.erro) return { ok: false, resposta: { erro: alvo.erro } };
      const docs = await cursosPorId(alvo.ids);
      const titulos = new Map(alvo.ids.map(id => [id, txt(docs.get(id)?.titulo) || id]));
      const matriculaVigente = servico('secretaria.matriculaVigente');
      const notaDoModulo = servico('avaliacoes.notaDoModulo');
      const itens = [];
      for (const cursoId of alvo.ids) {
        const s = await situacao(ctx.userId, cursoId);
        const crit = await criteriosDoCurso(cursoId, docs);
        const notaMinima = num(crit?.notaMinima);
        let matriculaId = null;
        if (matriculaVigente && notaDoModulo) {
          try { const m = await matriculaVigente(ctx.userId, cursoId); matriculaId = m?._id ? String(m._id) : null; } catch { matriculaId = null; }
        }
        for (const m of Array.isArray(s?.modulos) ? s.modulos : []) {
          let tentativasRestantes = null;
          let aguardandoCorrecao = null;
          if (matriculaId) {
            try {
              const n = await notaDoModulo(matriculaId, m.moduloId);
              tentativasRestantes = num(n?.tentativas?.restantes);
              aguardandoCorrecao = typeof n?.aguardandoCorrecao === 'boolean' ? n.aguardandoCorrecao : null;
            } catch { /* fica null */ }
          }
          itens.push({
            curso: titulos.get(cursoId) || cursoId, modulo: txt(m.titulo), nota: num(m.nota),
            situacaoRotulo: rotulo(ROTULOS_SITUACAO, m.situacao), tentativasRestantes, aguardandoCorrecao, notaMinima
          });
        }
      }
      return ok(itens);
    },

    async minha_frequencia(args, ctx) {
      const situacao = servico('academico.situacaoDoCurso');
      if (!situacao) return indisponivel();
      const alvo = await cursosAlvo(ctx, args);
      if (alvo.erro) return { ok: false, resposta: { erro: alvo.erro } };
      const docs = await cursosPorId(alvo.ids);
      const itens = [];
      for (const cursoId of alvo.ids) {
        const s = await situacao(ctx.userId, cursoId);
        const crit = await criteriosDoCurso(cursoId, docs);
        const frequenciaMinima = num(crit?.frequenciaMinima);
        const curso = txt(docs.get(cursoId)?.titulo) || cursoId;
        itens.push({ curso, modulo: null, frequenciaPct: num(s?.frequenciaGeralPct), aoVivoPct: num(s?.aoVivoPct), gravadoPct: num(s?.gravadoPct), faltas: null, frequenciaMinima });
        for (const m of Array.isArray(s?.modulos) ? s.modulos : []) {
          itens.push({ curso, modulo: txt(m.titulo), frequenciaPct: num(m.frequenciaPct), aoVivoPct: null, gravadoPct: null, faltas: num(m.faltas), frequenciaMinima });
        }
      }
      return ok(itens);
    },

    async meus_documentos_pendentes(_args, ctx) {
      const pend = servico('secretaria.pendenciasDoAluno');
      if (!pend) return indisponivel();
      const r = await pend(ctx.userId);
      // Sem `motivo` (texto livre da secretaria nunca sai).
      return ok((Array.isArray(r?.documentos) ? r.documentos : []).map(d => ({
        sigla: txt(d.sigla), nome: txt(d.nome), statusRotulo: rotulo(ROTULOS_DOCUMENTO, d.status) || txt(d.statusRotulo)
      })));
    },

    async meus_contratos_pendentes(_args, ctx) {
      const pend = servico('secretaria.pendenciasDoAluno');
      if (!pend) return indisponivel();
      const r = await pend(ctx.userId);
      // Sem `titulo` livre nem nº da matrícula.
      return ok((Array.isArray(r?.contratos) ? r.contratos : []).map(c => ({ cursoTitulo: txt(c.cursoTitulo), disponivelEm: iso(c.disponivelEm) })));
    },

    async meus_lancamentos_em_aberto(_args, ctx) {
      const resumo = servico('financeiro.resumoDoAluno');
      if (!resumo) return indisponivel();
      const r = await resumo(ctx.userId);
      // Sem `descricao`.
      return ok((Array.isArray(r?.itens) ? r.itens : []).map(l => ({
        rotuloTipo: txt(l.rotuloTipo), cursoTitulo: txt(l.cursoTitulo), vencimento: txt(l.vencimento),
        valor: reaisDeCentavos(l.valorCentavos), statusRotulo: rotulo(ROTULOS_LANCAMENTO, l.status) || txt(l.statusRotulo)
      })));
    },

    async minhas_proximas_aulas_ao_vivo(args, ctx) {
      const proximos = servico('academico.proximosEncontros');
      if (!proximos) return indisponivel();
      let dias = Number.isInteger(args?.dias) ? args.dias : Number.parseInt(args?.dias, 10);
      if (!Number.isInteger(dias)) dias = 14;
      dias = Math.min(60, Math.max(1, dias));
      const r = await proximos(ctx.userId, { dias, limite: MAX_ITENS });
      return ok((Array.isArray(r) ? r : []).map(e => ({
        titulo: txt(e.titulo), curso: txt(e.cursoTitulo), modulo: txt(e.moduloTitulo), inicioEm: iso(e.inicioEm), turmaCodigo: txt(e.turmaCodigo)
      })));
    },

    async meus_atendimentos_abertos(_args, ctx) {
      const abertos = servico('atendimento.abertosDoAluno');
      if (!abertos) return indisponivel();
      const r = await abertos(ctx.userId);
      return ok((Array.isArray(r) ? r : []).filter(p => p?.status !== 'encerrado').map(p => ({
        protocolo: txt(p.protocolo), categoriaRotulo: rotulo(ROTULOS_CATEGORIA, p.categoria),
        assunto: txt(p.assunto), statusRotulo: rotulo(ROTULOS_PROTOCOLO, p.status)
      })));
    },

    async buscar_regulamento(args, ctx) {
      const consulta = typeof args?.consulta === 'string' ? args.consulta.slice(0, 300) : '';
      if (!consulta.trim()) return { ok: false, resposta: { erro: 'consulta_vazia' } };
      const rag = await carregarRag();
      const trechos = Array.isArray(ctx.trechos) ? ctx.trechos : null;
      if (!rag || typeof rag.recuperar !== 'function' || !trechos) return indisponivel();
      if (!trechos.length) return { ok: true, resposta: { itens: [] }, fontes: [] };
      const achados = rag.recuperar(mascararDadosPessoais(consulta).texto, trechos, 3) || [];
      const itens = achados.slice(0, 3).map(t => ({ trechoId: txt(t.id), titulo: txt(t.titulo), texto: txt(t.texto) }));
      const fontes = achados.slice(0, 3).map(t => ({ regulamentoId: t.regulamentoId ? String(t.regulamentoId) : null, trechoId: txt(t.id), titulo: txt(t.titulo) }));
      return { ok: true, resposta: mascararProfundo(limitarSaida(itens)), fontes };
    },

    async sugerir_falar_com_equipe(args) {
      const categoria = CATEGORIAS_ESCALONAMENTO.includes(args?.categoria) ? args.categoria : null;
      return { ok: true, resposta: { ok: true }, sugerir: { categoria } };
    }
  };

  /**
   * Executa uma ferramenta. `ctx` = { userId (da SESSÃO), trechos (regulamento com regulamentoId) }.
   * → { ok, resposta (objeto já mascarado e limitado), fontes?, sugerir? }. Nunca lança.
   */
  async function executar(nome, args, ctx) {
    if (!ctx || typeof ctx.userId !== 'string' || !ctx.userId) throw new TypeError('ferramentas: userId da sessão ausente.');
    const f = Object.hasOwn(impl, nome) ? impl[nome] : null;
    if (!f) return { ok: false, resposta: { erro: 'ferramenta_desconhecida' } };
    const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    try {
      return await f(a, ctx);
    } catch (err) {
      try { log.warn?.(`[portal] ferramenta ${nome} falhou (${err?.name || 'erro'})`); } catch { /* nada */ }
      return indisponivel();
    }
  }

  return Object.freeze({ declaracoes: DECLARACOES, executar, nomes: NOMES_FERRAMENTAS });
}

// ---------- RAG (rag.js da F6a, quando existir) ----------
let ragMemo;
/** Import literal (rastreável pela Vercel) e tolerante à ausência: sem o arquivo → null. */
export async function carregarRagPadrao() {
  if (ragMemo !== undefined) return ragMemo;
  try {
    const m = await import('./rag.js');
    ragMemo = typeof m?.recuperar === 'function' ? m : null;
  } catch {
    ragMemo = null;
  }
  return ragMemo;
}
