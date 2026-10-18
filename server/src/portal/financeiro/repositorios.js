// =============================================================
// COMPLEXO DMC · Portal — financeiro manual: índices, formas públicas
// e serviços de nome fixo (financeiro.resumoDoAluno, .anosDeclaraveis)
// PORTAL-API §3.3 (F5), §4.4, §6.9, §6.11.3 · dono: F5.
//
// `lancamentos` é da F5 (único escritor: routes/portal/financeiro.js).
// Leituras de outras coleções aqui: `declaracoes` (só o código e a data
// da quitação já emitida, para anosDeclaraveis — F3b é a dona; leitura
// somente, pedida como serviço nomeado no relatório da fatia).
// =============================================================
import { ObjectId } from 'mongodb';
import {
  statusDe, venceEmDias, rotuloTipo, valorPago, calcularKpis, anosDeclaraveis as calcularAnos,
  ROTULOS_FORMA, ROTULOS_STATUS, DIAS_AVISO_VENCIMENTO, diasEntre, moedaTexto, dataBr
} from './calculo.js';

/** Índices da F5 (API §3.3), registrados por indices.js na carga do módulo. */
export const INDICES_FINANCEIRO = Object.freeze([
  { colecao: 'lancamentos', chave: { userId: 1, vencimento: 1 }, opcoes: { name: 'ix_lanc_user' } },
  { colecao: 'lancamentos', chave: { situacao: 1, vencimento: 1 }, opcoes: { name: 'ix_lanc_fila' } },
  { colecao: 'lancamentos', chave: { cursoId: 1, vencimento: 1 }, opcoes: { name: 'ix_lanc_curso' } },
  {
    colecao: 'lancamentos', chave: { 'externo.gateway': 1, 'externo.cobrancaId': 1 },
    opcoes: { name: 'uq_lanc_externo', unique: true, partialFilterExpression: { 'externo.cobrancaId': { $type: 'string' } } }
  }
]);

export const hex = v => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
  const s = String(v);
  return /^[a-f0-9]{24}$/.test(s) ? s : null;
};
export const paraObjectId = v => {
  const h = hex(v);
  return h ? new ObjectId(h) : null;
};
const iso = v => (v instanceof Date ? v.toISOString() : (v ?? null));

/** Forma que o aluno vê (sem histórico, sem quem registrou, sem URL da 2ª via). */
export function lancamentoDoAluno(doc, hoje) {
  const status = statusDe(doc, hoje);
  const forma = doc.pagamento?.forma ?? doc.formaPrevista ?? null;
  const sv = doc.segundaVia && (doc.segundaVia.tipo === 'link' ? !!doc.segundaVia.url : !!doc.segundaVia.arquivoId)
    ? { tipo: doc.segundaVia.tipo, disponivel: status !== 'cancelado' }
    : null;
  return {
    id: hex(doc._id),
    tipo: doc.tipo,
    rotuloTipo: rotuloTipo(doc),
    descricao: doc.descricao ?? null,
    cursoId: doc.cursoId ?? null,
    cursoTitulo: doc.cursoTitulo ?? null,
    matriculaNumero: doc.matriculaNumero ?? null,
    vencimento: doc.vencimento,
    valorCentavos: doc.valorCentavos,
    status,
    statusRotulo: ROTULOS_STATUS[status],
    venceEmDias: venceEmDias(doc, hoje),
    forma,
    formaRotulo: forma ? ROTULOS_FORMA[forma] ?? null : null,
    pagoEm: status === 'pago' ? doc.pagamento?.em ?? null : null,
    valorPagoCentavos: status === 'pago' ? valorPago(doc) : null,
    nfseNumero: doc.nfse?.numero ?? null,
    segundaVia: sv,
    origem: doc.origem || 'manual'
  };
}

/** Forma da coordenação (tudo, inclusive histórico, origem e ids externos). */
export function lancamentoDaCoordenacao(doc, hoje, { aluno = null } = {}) {
  return {
    ...lancamentoDoAluno(doc, hoje),
    userId: doc.userId,
    aluno: aluno ?? { id: doc.userId, nome: null, email: null },
    matriculaId: hex(doc.matriculaId),
    situacao: doc.situacao,
    formaPrevista: doc.formaPrevista ?? null,
    parcela: doc.parcela ?? null,
    pagamento: doc.pagamento
      ? {
        em: doc.pagamento.em, forma: doc.pagamento.forma, formaRotulo: ROTULOS_FORMA[doc.pagamento.forma] ?? null,
        valorPagoCentavos: valorPago(doc), observacao: doc.pagamento.observacao ?? null,
        registradoPor: doc.pagamento.registradoPor ?? null, registradoEm: iso(doc.pagamento.registradoEm)
      }
      : null,
    nfse: doc.nfse ? { numero: doc.nfse.numero, emitidaEm: doc.nfse.emitidaEm ?? null, registradoEm: iso(doc.nfse.registradoEm) } : null,
    segundaViaDetalhe: doc.segundaVia
      ? { tipo: doc.segundaVia.tipo, url: doc.segundaVia.url ?? null, temArquivo: !!doc.segundaVia.arquivoId, atualizadaEm: iso(doc.segundaVia.atualizadaEm) }
      : null,
    externo: doc.externo ?? null,
    cancelamento: doc.cancelamento ? { em: iso(doc.cancelamento.em), por: doc.cancelamento.por ?? null, motivo: doc.cancelamento.motivo ?? null } : null,
    historico: (Array.isArray(doc.historico) ? doc.historico : []).map(h => ({
      em: iso(h.em), por: h.por ?? null, acao: h.acao, de: h.de ?? null, para: h.para ?? null, motivo: h.motivo ?? null
    })),
    loteId: doc.loteId ?? null,
    versao: doc.versao,
    criadoEm: iso(doc.criadoEm),
    criadoPor: doc.criadoPor ?? null,
    atualizadoEm: iso(doc.atualizadoEm)
  };
}

/**
 * Serviços de leitura da F5 (nome fixo, API §4.4) e geradores dos grupos.
 * @param {{ repo:(nome)=>object, servicos?:object, hojeSP:()=>string, log?:Console }} deps
 */
export function criarLeiturasFinanceiro({ repo, servicos = null, hojeSP, log = console } = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarLeiturasFinanceiro: informe repo.');
  if (typeof hojeSP !== 'function') throw new TypeError('criarLeiturasFinanceiro: informe hojeSP.');
  const col = () => repo('lancamentos');
  const avisar = (texto, err) => { try { (log.warn || log.error).call(log, `[portal] financeiro: ${texto}${err ? ` (${err?.message || err})` : ''}`); } catch { /* nada */ } };

  const doAluno = userId => col().find({ userId: String(userId) }).sort({ vencimento: 1 }).limit(5000).toArray();

  /** financeiro.resumoDoAluno(userId) — F6 (assistente) e F4a (relatório). */
  async function resumoDoAluno(userId) {
    const hoje = hojeSP();
    const lista = await doAluno(userId);
    const k = calcularKpis(lista, hoje);
    return {
      totalEmAbertoCentavos: k.emAberto.valorCentavos,
      totalEmAtrasoCentavos: k.emAtraso.valorCentavos,
      itens: lista
        .filter(l => ['aberto', 'atrasado'].includes(statusDe(l, hoje)))
        .map(l => ({ rotuloTipo: rotuloTipo(l), cursoTitulo: l.cursoTitulo ?? null, vencimento: l.vencimento, valorCentavos: l.valorCentavos, status: statusDe(l, hoje) }))
    };
  }

  async function instituicaoConfigurada() {
    const f = servicos && typeof servicos.tentar === 'function' ? servicos.tentar('configuracoes.instituicao') : null;
    if (typeof f !== 'function') return false;
    try {
      const inst = await f();
      return !!(inst && typeof inst.razaoSocial === 'string' && inst.razaoSocial.trim());
    } catch (err) {
      avisar('configuracoes.instituicao falhou', err);
      return false;
    }
  }

  /** financeiro.anosDeclaraveis(userId) — F3b (Declarações). */
  async function anosDeclaraveis(userId) {
    const lista = await doAluno(userId);
    const emitidas = new Map();
    try {
      const docs = await repo('declaracoes')
        .find({ userId: String(userId), tipo: 'quitacao_anual', revogada: null }, { projection: { codigo: 1, emitidaEm: 1, ano: 1 } })
        .sort({ emitidaEm: -1 }).limit(100).toArray();
      for (const d of docs) {
        const ano = Number(d.ano);
        if (Number.isInteger(ano) && !emitidas.has(ano)) emitidas.set(ano, { codigo: d.codigo, emitidaEm: iso(d.emitidaEm) });
      }
    } catch (err) {
      avisar('declarações emitidas indisponíveis', err);
    }
    return calcularAnos(lista, { hoje: hojeSP(), instituicaoConfigurada: await instituicaoConfigurada(), emitidas });
  }

  /** Grupo `aviso` (id fixo lancamento-atraso, não dispensável) — GET /portal/me/pendencias. */
  const avisoAtraso = {
    id: 'lancamento-atraso',
    async gerar(req) {
      if (!req?.user?._id) return [];
      const hoje = hojeSP();
      const n = await col().countDocuments({ userId: String(req.user._id), situacao: 'pendente', vencimento: { $lt: hoje } });
      if (!n) return [];
      return [{
        id: 'lancamento-atraso', tom: 'erro', dispensavel: false, contador: n,
        texto: n === 1 ? 'Você tem 1 lançamento em atraso.' : `Você tem ${n} lançamentos em atraso.`,
        href: 'financeiro.html?status=atrasado', rotulo: 'Ver financeiro'
      }];
    }
  };

  /** Grupo `aviso` (L13: lancamento-vencendo, dispensável, sem chave em contadores). */
  const avisoVencendo = {
    id: 'lancamento-vencendo',
    async gerar(req) {
      if (!req?.user?._id) return [];
      const hoje = hojeSP();
      const docs = await col().find({ userId: String(req.user._id), situacao: 'pendente', vencimento: { $gte: hoje } }, { projection: { vencimento: 1 } }).limit(500).toArray();
      const n = docs.filter(d => { const x = diasEntre(hoje, d.vencimento); return x !== null && x <= DIAS_AVISO_VENCIMENTO; }).length;
      if (!n) return [];
      return [{
        id: 'lancamento-vencendo', tom: 'aviso', dispensavel: true, contador: n,
        texto: n === 1 ? 'Um lançamento vence nos próximos dias.' : `${n} lançamentos vencem nos próximos dias.`,
        href: 'financeiro.html?status=aberto', rotulo: 'Ver financeiro'
      }];
    }
  };

  /** Grupo `notificacaoSobDemanda` (lancamento.vencendo, chave lancamento:<id>:vencendo). */
  const notificacaoVencendo = {
    tipo: 'lancamento.vencendo',
    async gerar(userId, { emitir }) {
      const hoje = hojeSP();
      const docs = await col().find({ userId: String(userId), situacao: 'pendente', vencimento: { $gte: hoje } }).limit(500).toArray();
      for (const d of docs) {
        const n = diasEntre(hoje, d.vencimento);
        if (n === null || n > DIAS_AVISO_VENCIMENTO) continue;
        await emitir({
          userIds: [String(userId)], tipo: 'lancamento.vencendo',
          titulo: n === 0 ? 'Lançamento vence hoje' : 'Lançamento vence em breve',
          texto: `${rotuloTipo(d)}${d.cursoTitulo ? ` · ${d.cursoTitulo}` : ''} · vence em ${dataBr(d.vencimento)} · ${moedaTexto(d.valorCentavos)}`,
          link: 'financeiro.html', entidade: { tipo: 'lancamento', id: hex(d._id) }, chave: `lancamento:${hex(d._id)}:vencendo`
        });
      }
    }
  };

  /** Grupo `painel` (bloco financeiro). */
  const painel = {
    bloco: 'financeiro',
    chaves: ['emAberto', 'emAtraso', 'pagoNoMes'],
    papeis: ['admin'],
    async contar(_req, escopo = {}) {
      const hoje = hojeSP();
      const f = Array.isArray(escopo?.cursoIds) ? { cursoId: { $in: escopo.cursoIds.map(String) } } : {};
      const docs = await col().find({ ...f, situacao: { $in: ['pendente', 'pago'] } }, { projection: { situacao: 1, vencimento: 1, valorCentavos: 1, pagamento: 1 } }).limit(50000).toArray();
      const mes = hoje.slice(0, 7);
      const z = () => ({ qtd: 0, valorCentavos: 0 });
      const r = { emAberto: z(), emAtraso: z(), pagoNoMes: z() };
      for (const d of docs) {
        const st = statusDe(d, hoje);
        if (st === 'aberto') { r.emAberto.qtd++; r.emAberto.valorCentavos += d.valorCentavos || 0; }
        else if (st === 'atrasado') { r.emAtraso.qtd++; r.emAtraso.valorCentavos += d.valorCentavos || 0; }
        else if (st === 'pago' && String(d.pagamento?.em || '').slice(0, 7) === mes) { r.pagoNoMes.qtd++; r.pagoNoMes.valorCentavos += valorPago(d); }
      }
      return r;
    }
  };

  /** Grupo `exportador` (Meus dados): os lançamentos do titular. */
  const exportador = {
    dominio: 'financeiro',
    async exportar(userId) {
      const hoje = hojeSP();
      const lista = await doAluno(userId);
      return { lancamentos: lista.map(l => lancamentoDoAluno(l, hoje)) };
    }
  };

  return { resumoDoAluno, anosDeclaraveis, instituicaoConfigurada, avisoAtraso, avisoVencendo, notificacaoVencendo, painel, exportador };
}
