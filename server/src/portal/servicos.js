// =============================================================
// COMPLEXO DMC · Portal — localizador de serviços e grupos de extensão
// PORTAL-API §4.4 · índice §8.4 (F0m) · dono: F0m.
//
// Serviço = função ou objeto com NOME FIXO (tabela da API §4.4),
// resolvido na hora da requisição. Ausente → `ServicoIndisponivel`
// (o consumidor degrada com honestidade, D7; rota LEGADA segue o
// comportamento de hoje + console.warn, nunca 503 — DC-54).
//
// Grupo = lista de definições que várias fatias acrescentam sem que o
// código genérico conheça o específico (busca, validador, exportador,
// relatorio, painel, aviso, notificacaoSobDemanda, aoConcluirAula,
// cascata). Este módulo também traz os EXECUTORES de cada grupo
// (infraestrutura da F0m): quem monta a rota genérica (pendências,
// busca, painel, validação pública, Meus dados, DELETE em cascata)
// chama o executor e recebe o resultado já com a regra de ausência.
//
// Lote (`criarLoteDeServicos`): fachada usada pelo agregador para o
// isolamento por módulo (API §5.2, DC-67) — registrar/adicionar ficam
// num buffer do módulo e só são gravados no localizador do processo
// por `confirmar()`, que confere nomes duplicados ANTES de gravar.
// =============================================================
import { resumirErro } from './erros.js';
import { papelDe } from './papeis.js';

export class ServicoIndisponivel extends Error {
  constructor(nome, mensagem) {
    super(mensagem || `Serviço indisponível: ${nome}`);
    this.name = 'ServicoIndisponivel';
    this.codigo = 'servico-indisponivel';
    this.status = 503;
    this.nome = nome;
  }
}

/** Nome fixo de serviço: 'acesso', 'equipe.cursosDoProfessor', 'secretaria.matriculaVigente'… */
export const NOME_SERVICO_RE = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)?$/;

export const GRUPOS = Object.freeze([
  'busca', 'validador', 'exportador', 'relatorio', 'painel', 'aviso', 'notificacaoSobDemanda', 'aoConcluirAula', 'cascata'
]);

// Funções obrigatórias de cada definição (aoConcluirAula é a própria função).
const FUNCOES_DO_GRUPO = Object.freeze({
  busca: ['buscar'],
  validador: ['validar'],
  exportador: ['exportar'],
  relatorio: ['consultar'],
  painel: ['contar'],
  aviso: ['gerar'],
  notificacaoSobDemanda: ['gerar'],
  cascata: ['bloqueios', 'apagar']
});

function erroDuplicado(nome) {
  const e = new Error(`Serviço já registrado: ${nome}`);
  e.codigo = 'servico-duplicado';
  e.nome = nome;
  return e;
}

function conferirNome(nome) {
  if (typeof nome !== 'string' || !NOME_SERVICO_RE.test(nome)) throw new TypeError(`servicos: nome inválido (${String(nome)}).`);
}

/** Confere a forma mínima de uma definição de grupo (erro de programação → lança). */
export function validarDefinicaoDeGrupo(grupo, definicao) {
  if (!GRUPOS.includes(grupo)) throw new TypeError(`servicos: grupo desconhecido (${String(grupo)}).`);
  if (grupo === 'aoConcluirAula') {
    if (typeof definicao !== 'function') throw new TypeError('servicos: aoConcluirAula espera uma função (ctx) → Promise.');
    return;
  }
  if (!definicao || typeof definicao !== 'object') throw new TypeError(`servicos: definição de ${grupo} precisa ser objeto.`);
  for (const f of FUNCOES_DO_GRUPO[grupo]) {
    if (typeof definicao[f] !== 'function') throw new TypeError(`servicos: definição de ${grupo} sem a função ${f}().`);
  }
  if (grupo === 'painel') {
    if (!Object.hasOwn(BLOCOS_PAINEL, definicao.bloco)) throw new TypeError(`servicos: bloco de painel desconhecido (${String(definicao.bloco)}).`);
    if (!Array.isArray(definicao.chaves) || !definicao.chaves.length) throw new TypeError('servicos: definição de painel sem chaves.');
  }
  if (grupo === 'aviso' && (typeof definicao.id !== 'string' || !definicao.id)) throw new TypeError('servicos: definição de aviso sem id.');
  if (grupo === 'validador' && !/^[A-Z]{3}$/.test(String(definicao.prefixo))) throw new TypeError('servicos: validador sem prefixo de 3 letras.');
  if (grupo === 'busca' && (typeof definicao.tipo !== 'string' || !Array.isArray(definicao.papeis))) throw new TypeError('servicos: definição de busca sem tipo/papeis.');
  if (grupo === 'relatorio' && (typeof definicao.id !== 'string' || !Array.isArray(definicao.papeis))) throw new TypeError('servicos: relatório sem id/papeis.');
  if (grupo === 'exportador' && typeof definicao.dominio !== 'string') throw new TypeError('servicos: exportador sem dominio.');
  if (grupo === 'notificacaoSobDemanda' && typeof definicao.tipo !== 'string') throw new TypeError('servicos: notificação sob demanda sem tipo.');
  if (grupo === 'cascata' && typeof definicao.dominio !== 'string') throw new TypeError('servicos: cascata sem dominio.');
}

/** Localizador de serviços e grupos. */
export function criarServicos() {
  const registro = new Map();
  const grupos = new Map();
  return {
    registrar(nome, impl) {
      conferirNome(nome);
      if (impl === undefined || impl === null) throw new TypeError(`servicos: implementação ausente (${nome}).`);
      if (registro.has(nome)) throw erroDuplicado(nome);
      registro.set(nome, impl);
    },
    obter(nome) {
      if (!registro.has(nome)) throw new ServicoIndisponivel(nome);
      return registro.get(nome);
    },
    tentar(nome) {
      return registro.has(nome) ? registro.get(nome) : null;
    },
    adicionar(grupo, definicao) {
      validarDefinicaoDeGrupo(grupo, definicao);
      if (!grupos.has(grupo)) grupos.set(grupo, []);
      grupos.get(grupo).push(definicao);
    },
    todos(grupo) {
      if (!GRUPOS.includes(grupo)) throw new TypeError(`servicos: grupo desconhecido (${String(grupo)}).`);
      return [...(grupos.get(grupo) || [])];
    },
    /** Nomes registrados (diagnóstico e testes). */
    nomes() {
      return [...registro.keys()];
    }
  };
}

/** Instância do processo: as rotas legadas da fatia e o agregador usam esta. */
export const servicos = criarServicos();

/**
 * Fachada transacional de um módulo (API §5.2). Lê do lote e do localizador base;
 * grava só no lote. `confirmar()` confere duplicados contra o base ANTES de gravar
 * qualquer nome e então grava tudo.
 */
export function criarLoteDeServicos(base) {
  if (!base || typeof base.registrar !== 'function' || typeof base.tentar !== 'function') {
    throw new TypeError('criarLoteDeServicos: informe o localizador base.');
  }
  const proprios = new Map();
  const adicoes = [];
  let confirmado = false;
  const fechado = () => { if (confirmado) throw new Error('servicos: lote já confirmado.'); };
  return {
    registrar(nome, impl) {
      fechado();
      conferirNome(nome);
      if (impl === undefined || impl === null) throw new TypeError(`servicos: implementação ausente (${nome}).`);
      if (proprios.has(nome) || base.tentar(nome) !== null) throw erroDuplicado(nome);
      proprios.set(nome, impl);
    },
    obter(nome) {
      if (proprios.has(nome)) return proprios.get(nome);
      return base.obter(nome);
    },
    tentar(nome) {
      return proprios.has(nome) ? proprios.get(nome) : base.tentar(nome);
    },
    adicionar(grupo, definicao) {
      fechado();
      validarDefinicaoDeGrupo(grupo, definicao);
      adicoes.push([grupo, definicao]);
    },
    todos(grupo) {
      return [...base.todos(grupo), ...adicoes.filter(([g]) => g === grupo).map(([, d]) => d)];
    },
    nomesRegistrados() {
      return [...proprios.keys()];
    },
    confirmar() {
      fechado();
      for (const nome of proprios.keys()) if (base.tentar(nome) !== null) throw erroDuplicado(nome);
      for (const [nome, impl] of proprios) base.registrar(nome, impl);
      for (const [grupo, definicao] of adicoes) base.adicionar(grupo, definicao);
      confirmado = true;
    }
  };
}

// =============================================================
// Executores dos grupos (infraestrutura; nunca inventam número: o que
// falta ou falha vira `null`/omitido, D7)
// =============================================================
function avisar(log, texto, err) {
  try { (log?.warn || log?.error || (() => {})).call(log, `[portal] ${texto}${err ? ` (${resumirErro(err).nome}: ${resumirErro(err).mensagem})` : ''}`); } catch { /* nada */ }
}

const papelDoReq = req => papelDe(req?.user);

// ---------- painel ----------
/** Chaves de cada bloco do painel da coordenação (API §6.11.3). */
export const BLOCOS_PAINEL = Object.freeze({
  alunos: Object.freeze(['comAcesso', 'comMatriculaAtiva', 'liberacoesSemMatricula']),
  documentos: Object.freeze(['emRevisao', 'pendentes', 'naoEnviadosObrigatorios']),
  contratos: Object.freeze(['pendentes', 'pendentesHaMaisDe7d', 'assinados30d']),
  financeiro: Object.freeze(['emAberto', 'emAtraso', 'pagoNoMes']),
  atendimentos: Object.freeze(['abertosPorCategoria', 'aguardandoAluno', 'horasMediaPrimeiraResposta30d', 'privacidadeVencendo7d']),
  ouvidoria: Object.freeze(['abertasPorTipo']),
  ia: Object.freeze(['mensagens7d', 'escalonadas7d', 'tetoGlobalAtingidoHoje', 'ligado', 'chaveLegivel']),
  academico: Object.freeze(['correcoesPendentes', 'encontrosProximos7d']),
  sistema: Object.freeze(['modulosAusentes', 'modulosComFalha', 'errosUltimas24h', 'avisosConfiguracao', 'instituicaoPendente'])
});

/**
 * Junta as contribuições do grupo `painel` por bloco. Contribuição ausente ou que
 * falhou → as chaves dela `null`; bloco sem nenhuma contribuição → `null`.
 * @param {object} srv localizador
 * @param {object} req requisição (papel do usuário filtra as definições)
 * @param {{ cursoIds:string[]|null, turmaIds?:string[] }} escopo
 */
export async function montarPainel(srv, req, escopo = { cursoIds: null }, { log = console } = {}) {
  const papel = papelDoReq(req);
  const defs = srv.todos('painel').filter(d => !Array.isArray(d.papeis) || d.papeis.includes(papel));
  const saida = {};
  for (const bloco of Object.keys(BLOCOS_PAINEL)) {
    const doBloco = defs.filter(d => d.bloco === bloco);
    if (!doBloco.length) { saida[bloco] = null; continue; }
    const valores = Object.fromEntries(BLOCOS_PAINEL[bloco].map(k => [k, null]));
    await Promise.all(doBloco.map(async (d) => {
      try {
        const r = await d.contar(req, escopo);
        for (const k of d.chaves) if (r && Object.hasOwn(r, k)) valores[k] = r[k] ?? null;
      } catch (err) {
        avisar(log, `painel: contribuição ${bloco}.${d.chaves.join(',')} falhou`, err);
      }
    }));
    saida[bloco] = valores;
  }
  return saida;
}

// ---------- aviso (GET /portal/me/pendencias) ----------
/** Id fixo do aviso → chave de `contadores` e tipo (n = número; b = booleano). API §4.4. */
export const AVISOS_FIXOS = Object.freeze({
  'contrato-pendente': Object.freeze({ chave: 'contratosPendentes', tipo: 'n' }),
  'documento-pendente': Object.freeze({ chave: 'documentosPendentes', tipo: 'n' }),
  'documento-nao-enviado': Object.freeze({ chave: 'documentosNaoEnviados', tipo: 'n' }),
  'lancamento-atraso': Object.freeze({ chave: 'lancamentosAtrasados', tipo: 'n' }),
  'perfil-incompleto': Object.freeze({ chave: 'perfilIncompleto', tipo: 'b' }),
  'troca-de-senha': Object.freeze({ chave: 'precisaTrocarSenha', tipo: 'b' }),
  'email-nao-verificado': Object.freeze({ chave: 'emailNaoVerificado', tipo: 'b' }),
  '2fa-obrigatorio': Object.freeze({ chave: 'segundoFatorObrigatorio', tipo: 'b' })
});

const TONS = new Set(['info', 'aviso', 'erro']);
const HREF_RE = /^[a-z0-9_-]+\.html(\?[^\s#]*)?(#[^\s]*)?$/;

/**
 * Executa o grupo `aviso`. Devolve `{ avisos, contadores }`: obrigatórios (não
 * dispensáveis) primeiro; cada chave de `contadores` vem do aviso de id fixo —
 * definição ausente ou que falhou → `null`; presente sem aviso → 0/false.
 * `notificacoesNaoLidas` fica para a rota (vem das notificações).
 */
export async function executarAvisos(srv, req, { log = console } = {}) {
  const contadores = Object.fromEntries(Object.values(AVISOS_FIXOS).map(a => [a.chave, null]));
  const avisos = [];
  for (const def of srv.todos('aviso')) {
    let lista;
    try {
      lista = await def.gerar(req);
    } catch (err) {
      avisar(log, `aviso ${def.id} falhou`, err);
      continue;
    }
    const fixo = AVISOS_FIXOS[def.id];
    const meus = (Array.isArray(lista) ? lista : []).filter(a => a && typeof a.texto === 'string' && a.texto.trim());
    for (const a of meus) {
      avisos.push({
        id: typeof a.id === 'string' && a.id ? a.id : def.id,
        tom: TONS.has(a.tom) ? a.tom : 'info',
        texto: a.texto,
        href: typeof a.href === 'string' && HREF_RE.test(a.href) ? a.href : null,
        rotulo: typeof a.rotulo === 'string' ? a.rotulo : null,
        dispensavel: a.dispensavel === true,
        ...(Number.isFinite(a.contador) ? { contador: a.contador } : {})
      });
    }
    if (fixo) {
      const doId = meus.filter(a => (a.id || def.id) === def.id);
      if (fixo.tipo === 'b') contadores[fixo.chave] = doId.length > 0;
      else contadores[fixo.chave] = doId.reduce((s, a) => s + (Number.isFinite(a.contador) ? a.contador : 1), 0);
    }
  }
  avisos.sort((a, b) => Number(a.dispensavel) - Number(b.dispensavel));
  return { avisos, contadores };
}

// ---------- busca ----------
/**
 * Executa o grupo `busca` (GET /portal/busca). Grupos sem permissão ou fora de `tipos`
 * são OMITIDOS; provedor que falha também é omitido (com aviso no log); `href` fora do
 * padrão de link interno derruba o item.
 */
export async function executarBusca(srv, req, termos, { tipos = null, limite = 5, pagina = 1, log = console } = {}) {
  const papel = papelDoReq(req);
  const defs = srv.todos('busca').filter(d => d.papeis.includes(papel) && (!tipos || tipos.includes(d.tipo)));
  const unico = defs.length === 1;
  const pular = unico ? Math.max(0, (Number(pagina) || 1) - 1) * limite : 0;
  const grupos = {};
  await Promise.all(defs.map(async (d) => {
    try {
      const r = await d.buscar(req, termos, { limite, pular });
      const itens = (Array.isArray(r?.itens) ? r.itens : [])
        .filter(i => i && typeof i.titulo === 'string' && typeof i.href === 'string' && HREF_RE.test(i.href))
        .slice(0, limite)
        .map(i => ({ tipo: d.tipo, id: String(i.id ?? ''), titulo: i.titulo, contexto: typeof i.contexto === 'string' ? i.contexto : null, href: i.href, bloqueado: i.bloqueado === true }));
      grupos[d.tipo] = { itens, temMais: r?.temMais === true };
    } catch (err) {
      avisar(log, `busca ${d.tipo} falhou`, err);
    }
  }));
  return grupos;
}

// ---------- validador ----------
/** Definição do grupo `validador` pelo prefixo do código ('DEC-…' → DEC), ou null. */
export function validadorDoCodigo(srv, codigo) {
  if (typeof codigo !== 'string') return null;
  const prefixo = codigo.trim().toUpperCase().slice(0, 3);
  return srv.todos('validador').find(d => d.prefixo === prefixo) || null;
}

// ---------- exportador (Meus dados) ----------
/** `{ secoes:{ [dominio]: objeto }, indisponiveis:[dominio] }` — falha de um exportador não derruba os outros. */
export async function exportarDoTitular(srv, userId, { log = console } = {}) {
  const secoes = {};
  const indisponiveis = [];
  for (const d of srv.todos('exportador')) {
    try {
      secoes[d.dominio] = await d.exportar(userId);
    } catch (err) {
      indisponiveis.push(d.dominio);
      avisar(log, `exportador ${d.dominio} falhou`, err);
    }
  }
  return { secoes, indisponiveis };
}

// ---------- relatório ----------
export function relatoriosDoPapel(srv, papel) {
  return srv.todos('relatorio').filter(d => d.papeis.includes(papel));
}

export function relatorioPorId(srv, id) {
  return srv.todos('relatorio').find(d => d.id === id) || null;
}

// ---------- aoConcluirAula ----------
/** Dispara todos os ouvintes; nunca lança. → `{ ouvintes, falhas }`. */
export async function dispararAoConcluirAula(srv, ctx, { log = console } = {}) {
  const ouvintes = srv.todos('aoConcluirAula');
  let falhas = 0;
  for (const f of ouvintes) {
    try { await f(ctx); } catch (err) { falhas++; avisar(log, 'aoConcluirAula: ouvinte falhou', err); }
  }
  return { ouvintes: ouvintes.length, falhas };
}

// ---------- cascata ----------
/**
 * Soma os bloqueios de todos os membros. `falhas` lista os domínios que não
 * responderam: o chamador NÃO apaga quando há falha (não dá para garantir que
 * nada dependente será perdido).
 */
export async function bloqueiosEmCascata(srv, alvo, { log = console } = {}) {
  const porDominio = {};
  const falhas = [];
  let total = 0;
  for (const d of srv.todos('cascata')) {
    try {
      const n = Number(await d.bloqueios(alvo)) || 0;
      porDominio[d.dominio] = (porDominio[d.dominio] || 0) + n;
      total += n;
    } catch (err) {
      falhas.push(d.dominio);
      avisar(log, `cascata ${d.dominio}: bloqueios falhou`, err);
    }
  }
  return { total, porDominio, falhas };
}

/** Executa `apagar(alvo)` de cada membro, em ordem; → `{ falhas:[dominio] }` (nunca lança). */
export async function apagarEmCascata(srv, alvo, { log = console } = {}) {
  const falhas = [];
  for (const d of srv.todos('cascata')) {
    try { await d.apagar(alvo); } catch (err) { falhas.push(d.dominio); avisar(log, `cascata ${d.dominio}: apagar falhou`, err); }
  }
  return { falhas };
}
