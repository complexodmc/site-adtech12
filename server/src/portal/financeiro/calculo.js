// =============================================================
// COMPLEXO DMC · Portal — financeiro manual: regras PURAS
// PORTAL-API §3.3 (F5 lancamentos), §6.9, §8.9 (quitação), §8.10 (status) ·
// índice §8.5 linha F5, CEO-1 (EXCEÇÃO 1: gateway depois), D-18 · dono: F5.
//
// Nada aqui consulta banco ou rede. Dinheiro SEMPRE em centavos inteiros.
// Status de leitura é DERIVADO (nunca gravado), no fuso de São Paulo:
//   cancelado (situacao cancelado) · pago · atrasado (pendente com
//   vencimento < hojeSP) · aberto. Ex.: 02:00Z do dia 18 = dia 17 em SP.
// =============================================================

export const TIPOS_LANCAMENTO = Object.freeze(['matricula', 'parcela', 'taxa']);
export const FORMAS = Object.freeze(['boleto', 'pix', 'cartao', 'transferencia']);
export const SITUACOES = Object.freeze(['pendente', 'pago', 'cancelado']);
export const ORIGENS_LANCAMENTO = Object.freeze(['manual', 'gateway']);
export const STATUS_LEITURA = Object.freeze(['aberto', 'atrasado', 'pago', 'cancelado']);
export const FILTROS_STATUS = Object.freeze(['todos', ...STATUS_LEITURA]);

export const ROTULOS_FORMA = Object.freeze({ boleto: 'Boleto', pix: 'Pix', cartao: 'Cartão', transferencia: 'Transferência' });
export const ROTULOS_STATUS = Object.freeze({ aberto: 'Em aberto', atrasado: 'Em atraso', pago: 'Pago', cancelado: 'Cancelado' });

export const VALOR_MIN_CENTAVOS = 1;
export const VALOR_MAX_CENTAVOS = 100_000_000;
export const MAX_PARCELAS = 60;
/** "Vence em N dias" só com N ≤ 3 (D-18). */
export const DIAS_AVISO_VENCIMENTO = 3;
export const NFSE_RE = /^[0-9A-Za-z./-]{1,30}$/;

const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Status derivado de um lançamento em `hoje` ('AAAA-MM-DD' em SP). */
export function statusDe(lancamento, hoje) {
  const s = lancamento?.situacao;
  if (s === 'cancelado') return 'cancelado';
  if (s === 'pago') return 'pago';
  return typeof lancamento?.vencimento === 'string' && typeof hoje === 'string' && lancamento.vencimento < hoje ? 'atrasado' : 'aberto';
}

/** Dias corridos de `de` até `ate` (ambos 'AAAA-MM-DD'). */
export function diasEntre(de, ate) {
  const a = DATA_RE.exec(String(de));
  const b = DATA_RE.exec(String(ate));
  if (!a || !b) return null;
  const ta = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const tb = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((tb - ta) / 86_400_000);
}

/** N de "Vence em N dias" (0 = vence hoje) quando o lançamento está em aberto e N ≤ 3; senão null (D-18). */
export function venceEmDias(lancamento, hoje) {
  if (statusDe(lancamento, hoje) !== 'aberto') return null;
  const n = diasEntre(hoje, lancamento.vencimento);
  return n !== null && n >= 0 && n <= DIAS_AVISO_VENCIMENTO ? n : null;
}

/** 'Matrícula' · 'Parcela n/N' · 'Taxa'. */
export function rotuloTipo(lancamento) {
  if (lancamento?.tipo === 'matricula') return 'Matrícula';
  if (lancamento?.tipo === 'taxa') return 'Taxa';
  if (lancamento?.tipo === 'parcela') {
    const p = lancamento.parcela;
    return p && Number.isInteger(p.n) && Number.isInteger(p.de) ? `Parcela ${p.n}/${p.de}` : 'Parcela';
  }
  return 'Lançamento';
}

/** Valor pago efetivo (centavos) de um lançamento pago. */
export function valorPago(lancamento) {
  const v = lancamento?.pagamento?.valorPagoCentavos;
  return Number.isInteger(v) ? v : (Number.isInteger(lancamento?.valorCentavos) ? lancamento.valorCentavos : 0);
}

const zero = () => ({ valorCentavos: 0, qtd: 0 });

/**
 * KPIs (API §6.9): ignoram cancelados; total = aberto + atrasado + pago; pago usa valorPagoCentavos.
 * Recebe a lista JÁ filtrada por curso/ano (o chip de status nunca entra aqui).
 * @returns {{ total, emAberto, emAtraso, pago }} cada um { valorCentavos, qtd }
 */
export function calcularKpis(lancamentos, hoje) {
  const k = { total: zero(), emAberto: zero(), emAtraso: zero(), pago: zero() };
  for (const l of Array.isArray(lancamentos) ? lancamentos : []) {
    const st = statusDe(l, hoje);
    if (st === 'cancelado') continue;
    const alvo = st === 'pago' ? k.pago : st === 'atrasado' ? k.emAtraso : k.emAberto;
    const valor = st === 'pago' ? valorPago(l) : (Number.isInteger(l.valorCentavos) ? l.valorCentavos : 0);
    alvo.valorCentavos += valor;
    alvo.qtd += 1;
    k.total.valorCentavos += valor;
    k.total.qtd += 1;
  }
  return k;
}

/** Contagem por chip (Todos · Em aberto · Em atraso · Pagos · Cancelados). */
export function contarPorStatus(lancamentos, hoje) {
  const c = { todos: 0, aberto: 0, atrasado: 0, pago: 0, cancelado: 0 };
  for (const l of Array.isArray(lancamentos) ? lancamentos : []) {
    c.todos += 1;
    c[statusDe(l, hoje)] += 1;
  }
  return c;
}

/**
 * Filtra pelo chip e ordena por vencimento; em `todos`, atrasados primeiro e cancelados no fim.
 * Cancelados só aparecem em `todos` (e no chip próprio `cancelado`, acréscimo da UX §6.7).
 */
export function filtrarEOrdenar(lancamentos, status, hoje) {
  const chip = FILTROS_STATUS.includes(status) ? status : 'todos';
  const lista = (Array.isArray(lancamentos) ? lancamentos : []).filter(l => chip === 'todos' || statusDe(l, hoje) === chip);
  const peso = l => {
    if (chip !== 'todos') return 0;
    const st = statusDe(l, hoje);
    return st === 'atrasado' ? 0 : st === 'cancelado' ? 2 : 1;
  };
  return lista.sort((a, b) => peso(a) - peso(b)
    || String(a.vencimento).localeCompare(String(b.vencimento))
    || String(a._id ?? a.id ?? '').localeCompare(String(b._id ?? b.id ?? '')));
}

/** Último dia do mês (mes 1–12). */
function ultimoDia(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Vencimentos de N parcelas mensais no MESMO dia do 1º vencimento; dia inexistente → último
 * dia do mês (31/01 → 28/02 → 31/03). Puro.
 * @returns {string[]} 'AAAA-MM-DD' (vazio se a data ou a quantidade forem inválidas)
 */
export function planejarParcelas(primeiroVencimento, quantidade) {
  const m = DATA_RE.exec(String(primeiroVencimento));
  const n = Number(quantidade);
  if (!m || !Number.isInteger(n) || n < 1 || n > MAX_PARCELAS) return [];
  const [a0, m0, d0] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m0 < 1 || m0 > 12 || d0 < 1 || d0 > ultimoDia(a0, m0)) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const total = (m0 - 1) + i;
    const ano = a0 + Math.floor(total / 12);
    const mes = (total % 12) + 1;
    const dia = Math.min(d0, ultimoDia(ano, mes));
    out.push(`${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
  }
  return out;
}

/** Preço legado (reais, `cursos.preco`) → centavos; ausente, não finito ou ≤ 0 → null (D7). */
export function centavosDoPreco(preco) {
  if (preco === null || preco === undefined || preco === '' || typeof preco === 'boolean') return null;
  const n = Number(preco);
  if (!Number.isFinite(n) || n <= 0) return null;
  const c = Math.round(n * 100);
  return c >= VALOR_MIN_CENTAVOS ? c : null;
}

/** Soma de centavos; null se algum item for null (nada inventado). */
export function somaOuNulo(valores) {
  let s = 0;
  for (const v of valores) {
    if (!Number.isInteger(v)) return null;
    s += v;
  }
  return s;
}

const FMT_MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 199000 → 'R$ 1.990,00' (espaço comum, para texto de mensagem e CSV). */
export function moedaTexto(centavos) {
  if (!Number.isInteger(centavos)) return null;
  return FMT_MOEDA.format(centavos / 100).replace(/\s/g, ' ');
}

/** 'AAAA-MM-DD' → 'dd/mm/aaaa'. */
export function dataBr(dia) {
  const m = DATA_RE.exec(String(dia || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Chave do pedido da loja: ids únicos, ordenados, separados por vírgula. */
export function chaveDoPedido(cursoIds) {
  return [...new Set(cursoIds.map(String))].sort().join(',');
}

/** 1ª mensagem do protocolo do pedido (texto sóbrio; valores do servidor). */
export function mensagemDoPedido(itens, totalCentavos) {
  const linhas = itens.map(i => `– ${i.titulo} — ${Number.isInteger(i.valorCentavos) ? moedaTexto(i.valorCentavos) : 'valor a confirmar'}`);
  const total = Number.isInteger(totalCentavos) ? moedaTexto(totalCentavos) : 'a confirmar';
  return [
    'Pedido registrado pela loja da plataforma.',
    'Cursos:',
    ...linhas,
    `Total: ${total}.`,
    'Aguardo as orientações da coordenação para o pagamento e a liberação do acesso.'
  ].join('\n');
}

/**
 * Situação de cada ano para a declaração anual de quitação (serviço financeiro.anosDeclaraveis).
 * @param {object[]} lancamentos do aluno (todos)
 * @param {{ hoje:string, instituicaoConfigurada:boolean, emitidas:Map<number,{codigo,emitidaEm}> }} ctx
 */
export function anosDeclaraveis(lancamentos, { hoje, instituicaoConfigurada, emitidas = new Map() }) {
  const anoAtual = Number(String(hoje).slice(0, 4));
  const porAno = new Map();
  for (const l of Array.isArray(lancamentos) ? lancamentos : []) {
    if (l?.situacao === 'cancelado' || typeof l?.vencimento !== 'string') continue;
    const ano = Number(l.vencimento.slice(0, 4));
    if (!Number.isInteger(ano)) continue;
    if (!porAno.has(ano)) porAno.set(ano, []);
    porAno.get(ano).push(l);
  }
  return [...porAno.keys()].sort((a, b) => b - a).map(ano => {
    const doAno = porAno.get(ano);
    let motivo = null;
    if (ano >= anoAtual) motivo = 'Disponível depois do fim do ano.';
    else if (doAno.some(l => l.situacao !== 'pago')) motivo = 'Há lançamentos em aberto neste ano.';
    else if (!instituicaoConfigurada) motivo = 'A coordenação ainda não cadastrou os dados da instituição.';
    return { ano, disponivel: motivo === null, motivo, emitida: emitidas.get(ano) || null };
  });
}

/** `dados` congelados da quitação anual (API §8.9). */
export function dadosDaQuitacao({ ano, identificacao, instituicao, lancamentos }) {
  const pagos = (Array.isArray(lancamentos) ? lancamentos : [])
    .filter(l => l.situacao === 'pago')
    .sort((a, b) => String(a.pagamento?.em || a.vencimento).localeCompare(String(b.pagamento?.em || b.vencimento)) || String(a.vencimento).localeCompare(String(b.vencimento)));
  const itens = pagos.map(l => ({
    rotuloTipo: rotuloTipo(l),
    cursoTitulo: l.cursoTitulo ?? null,
    vencimento: l.vencimento,
    pagoEm: l.pagamento?.em ?? null,
    valorPagoCentavos: valorPago(l),
    nfseNumero: l.nfse?.numero ?? null
  }));
  return {
    ano,
    titular: { nomeRegistro: identificacao.nomeRegistro, documento: { tipo: identificacao.documento.tipo, numero: identificacao.documento.numero } },
    emissor: { razaoSocial: instituicao.razaoSocial, cnpj: instituicao.cnpj ?? null },
    itens,
    totalPagoCentavos: itens.reduce((s, i) => s + i.valorPagoCentavos, 0)
  };
}

/** '1234ABCD…' → '1234-ABCD-…' (16 primeiros hex, igual ao selo das declarações). */
export function prefixoDoHash(hash) {
  if (typeof hash !== 'string' || !/^[a-f0-9]{16,}$/i.test(hash)) return null;
  return hash.slice(0, 16).toUpperCase().match(/.{4}/g).join('-');
}
