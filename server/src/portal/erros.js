// =============================================================
// COMPLEXO DMC · Portal — erros, observabilidade e handlers
// PORTAL-API §1.3, §1.4, §4.5 · índice D-42, DC-77 · dono: F0a.
//
// Regras que este módulo garante (e os testes de portal-base-util
// conferem):
// - nenhum log nem registro leva corpo da requisição, `keyValue` do
//   E11000, cabeçalhos, query, token ou segredo: tudo passa por
//   `resumirErro`, que também mascara e-mail, CPF e números longos;
// - `tratarErroPortal` (montado pelo agregador em /api/auth e
//   /api/portal) responde os erros conhecidos e, para o resto, loga UMA
//   linha e repassa ao handler global um erro JÁ resumido, marcado
//   `registrado:true` (o global não loga de novo);
// - `tratarErroGlobal` é o handler de TODO o app (terceiro ponto de
//   server.js, aplicado pela principal): mesmas respostas do bloco de
//   hoje para 413, Mongo fora → 503 e 500, mais JSON quebrado → 400
//   `formato-invalido`, sem logar o corpo.
//
// Este módulo não lê process.env, não importa db.js nem config.js.
// =============================================================
import { randomBytes } from 'node:crypto';
import { mascararDadosPessoais } from './validacao.js';

// ---------- catálogo de mensagens (PORTAL-API §1.4) ----------
const IA_INDISPONIVEL = 'O assistente não está disponível. Use "Falar com a equipe".';

export const MENSAGENS = Object.freeze({
  // geral
  'validacao': 'Confira os campos destacados.',
  'formato-invalido': 'Formato inválido.',
  'papel-insuficiente': 'Esta área é restrita à equipe.',
  'sem-acesso': 'Você não tem acesso ao curso desta aula.',
  'nao-docente': 'Você não leciona neste curso ou turma.',
  'troca-de-senha-obrigatoria': 'Defina uma nova senha para continuar.',
  'conta-desativada': 'Conta desativada. Fale com a coordenação.',
  'conflito-versao': 'Alterado por outra pessoa enquanto você editava. Recarregue e tente de novo.',
  'transicao-invalida': 'Esta mudança de situação não é permitida.',
  'tem-registros': 'Há registros ligados a este item. Desative em vez de excluir.',
  'registro-duplicado': 'Este registro já existe.',
  'limite': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'relatorio-grande': 'Resultado grande demais. Use filtros (curso, turma, período).',
  'arquivo-grande': 'Arquivo maior que o limite permitido.',
  'tipo-de-arquivo': 'Formato de arquivo não aceito.',
  'pdf-ativo': 'PDF com conteúdo ativo ou protegido por senha não é aceito. Gere o PDF de novo (imprimir → salvar como PDF).',
  'consentimento-necessario': 'É preciso registrar a sua autorização para continuar.',
  'servico-indisponivel': 'Serviço temporariamente indisponível. Tente novamente em instantes.',
  'auditoria-indisponivel': 'Não foi possível registrar a operação agora. Nada foi alterado.',
  'nao-contratado': 'Recurso ainda não contratado pela instituição.',
  // auth
  'credenciais-invalidas': 'E-mail/CPF ou senha inválidos.',
  'muitas-tentativas': 'Muitas tentativas. Aguarde 15 minutos.',
  'segundo-fator': 'Digite o código do aplicativo autenticador.',
  'codigo-invalido': 'Código inválido.',
  'desafio-expirado': 'O tempo para digitar o código acabou. Entre de novo.',
  'link-invalido': 'Link inválido ou expirado. Peça um novo.',
  'email-indisponivel': 'O envio de e-mails ainda não está configurado na plataforma. Entre com e-mail ou CPF e senha, ou peça à coordenação uma senha temporária.',
  'ja-ativo': 'A verificação em duas etapas já está ativa.',
  'pendente-expirado': 'A configuração expirou. Comece de novo.',
  'email-em-uso': 'Este e-mail já está vinculado a outra conta.',
  'ultimo-admin': 'Não é possível remover o último administrador.',
  'auto-rebaixamento': 'Você não pode remover o seu próprio acesso de coordenação.',
  '2fa-desligado': 'A verificação em duas etapas ainda não está disponível na plataforma.',
  '2fa-indisponivel': 'Não foi possível conferir o código agora. Peça à coordenação para redefinir a verificação em duas etapas.',
  '2fa-obrigatorio': 'Ative a verificação em duas etapas para usar a área da coordenação.',
  'email-nao-verificado': 'Esta conta ainda não confirmou o e-mail.',
  'reautenticacao-necessaria': 'Por segurança, a assinatura fica disponível 72 horas depois de a coordenação redefinir o seu acesso. Se precisar antes, fale com o atendimento.',
  // perfil
  'cpf-em-uso': 'Este CPF já está vinculado a outra conta. Fale com a secretaria.',
  'campo-travado': 'Para corrigir este dado, abra um pedido de correção em Meus dados.',
  'cep-nao-encontrado': 'CEP não encontrado. Confira o número ou preencha o endereço manualmente.',
  'cep-indisponivel': 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.',
  // acadêmico
  'aula-indisponivel': 'Esta aula ainda não está disponível.',
  'matricula-nao-ativa': 'Sua matrícula não está ativa neste curso.',
  'matricula-vigente-existe': 'Já existe matrícula vigente deste aluno neste curso.',
  'turma-de-outro-curso': 'A turma escolhida é de outro curso.',
  'codigo-em-uso': 'Código já usado.',
  'sigla-em-uso': 'Sigla já usada.',
  'nivel-exige-ies': 'Pós-graduação lato sensu exige IES parceira cadastrada e ativa.',
  'fora-da-janela': 'A sala abre 15 minutos antes do início.',
  'encontro-cancelado': 'Este encontro foi cancelado.',
  'encontro-sem-url': 'O link da sala ainda não foi cadastrado.',
  'tentativas-esgotadas': 'Você já usou todas as tentativas.',
  'avaliacao-finalizada': 'Você finalizou esta avaliação.',
  'tentativa-aberta': 'Envie a tentativa em andamento antes.',
  'tempo-esgotado': 'O tempo da tentativa terminou; suas respostas salvas foram enviadas.',
  'banco-insuficiente': 'O banco não tem questões ativas suficientes para o sorteio.',
  'nao-publicada': 'Avaliação não encontrada.',
  'gabarito-bloqueado': 'O gabarito aparece depois de finalizar a avaliação.',
  'resposta-longa': 'A resposta passa do limite de caracteres desta questão.',
  'modulo-nao-tcc': 'Questão de arquivo só existe na avaliação do módulo de TCC.',
  'nao-elegivel': 'Os requisitos para esta emissão ainda não foram cumpridos.',
  'certificado-pela-ies': 'Neste curso, o certificado é emitido pela instituição parceira.',
  // secretaria
  'documento-aprovado': 'Documento já aprovado. Para trocar, fale com a secretaria.',
  'tipo-em-uso': 'Tipo já usado em envios. Desative em vez de excluir.',
  'contrato-pendente-existe': 'Já há contrato pendente para esta matrícula.',
  'contrato-nao-pendente': 'Este contrato não está pendente de assinatura.',
  'abra-o-contrato-antes': 'Abra e leia o contrato antes de assinar.',
  'contrato-alterado': 'O contrato foi substituído. Abra a versão atual antes de assinar.',
  'cadastro-incompleto': 'Complete o cadastro antes.',
  // financeiro
  'so-pendente-manual': 'Só lançamentos pendentes e manuais podem ser alterados.',
  'ja-liberado': 'Você já tem acesso a este curso.',
  'lancamento-cancelado': 'Lançamento cancelado.',
  'ano-em-curso': 'A declaração de quitação fica disponível depois do fim do ano.',
  'ha-debitos-no-ano': 'Há lançamentos em aberto neste ano.',
  'sem-lancamentos-no-ano': 'Não há lançamentos pagos neste ano.',
  'dados-da-instituicao-pendentes': 'Os dados da instituição ainda não foram cadastrados pela coordenação.',
  // atendimento e IA
  'protocolo-encerrado': 'Atendimento encerrado. Inicie um novo.',
  'protocolo-longo': 'Limite de mensagens atingido.',
  'ja-escalada': 'Esta conversa já foi encaminhada à equipe.',
  'conversa-longa': 'Conversa longa demais. Comece uma nova.',
  'ia-desligada': IA_INDISPONIVEL,
  'ia-sem-chave': IA_INDISPONIVEL,
  'chave-ilegivel': IA_INDISPONIVEL,
  'ia-indisponivel': IA_INDISPONIVEL,
  'ia-tempo-esgotado': IA_INDISPONIVEL,
  'ia-sobrecarregada': IA_INDISPONIVEL,
  'ia-sem-curso': 'O assistente atende alunos com curso liberado ou matrícula ativa. Use "Falar com a equipe".',
  'encaminhamento-nao-permitido': 'Denúncias não são encaminhadas a professores.',
  'chave-definida-no-ambiente': 'A chave está definida no servidor e não pode ser trocada pelo painel.',
  'chave-recusada-pelo-provedor': 'O Google recusou esta chave.',
  'publico-fora-dos-seus-cursos': 'Você só pode publicar para cursos e turmas que leciona.'
});

export const MENSAGEM_ERRO_INTERNO = 'Erro interno no servidor.';
export const TTL_ERROS_DIAS = 30;

// Chaves de `extras` que NÃO vão ao corpo da resposta.
const EXTRAS_INTERNOS = new Set(['retryAfterSeg', 'persistente', 'causa']);

/**
 * Erro de domínio do portal. `extras` vai ao corpo (campos, motivo,
 * faltando, finalidade…), exceto as chaves internas:
 *   retryAfterSeg → cabeçalho Retry-After (429);
 *   persistente   → 429 de contador persistente vai ao log como aviso;
 *   causa         → erro original (só para o log, já resumido).
 */
export class ErroPortal extends Error {
  constructor(status, codigo, mensagem, extras = {}) {
    super(mensagem || MENSAGENS[codigo] || MENSAGEM_ERRO_INTERNO);
    this.name = 'ErroPortal';
    this.status = Number(status) || 500;
    this.codigo = codigo || null;
    const corpo = {};
    for (const [k, v] of Object.entries(extras || {})) {
      if (!EXTRAS_INTERNOS.has(k) && v !== undefined) corpo[k] = v;
    }
    this.extras = corpo;
    this.retryAfterSeg = Number.isFinite(extras?.retryAfterSeg) ? Math.max(1, Math.ceil(extras.retryAfterSeg)) : null;
    this.persistente = extras?.persistente === true;
    if (extras?.causa) this.causa = extras.causa;
  }
}

export const erro = (status, codigo, mensagem, extras) => new ErroPortal(status, codigo, mensagem, extras);

// ---------- classificação ----------
const REDE_MONGO_RE = /^Mongo(ServerSelection|Network|NetworkTimeout)Error$/;

/** Banco fora do ar (conexão/seleção de servidor) — no erro original ou no resumo. */
export function ehErroDeRedeMongo(err) {
  if (!err || typeof err !== 'object') return false;
  return REDE_MONGO_RE.test(String(err.name || '')) || REDE_MONGO_RE.test(String(err.resumo?.nome || ''));
}

function ehDuplicado(err) {
  return !!err && typeof err === 'object' && (err.code === 11000 || err.code === 11001);
}

// ---------- resumo sem dado pessoal ----------
function limparMensagem(msg) {
  // Corta antes de mascarar: mensagem de erro pode ser enorme e o resumo só guarda 200.
  let s = String(msg ?? '').slice(0, 2000)
    .replace(/dup key: \{[\s\S]*\}/, 'dup key: {…}')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [TOKEN]')
    .replace(/([?&](?:key|token|senha|password|secret)=)[^&\s"']+/gi, '$1[…]');
  s = mascararDadosPessoais(s).texto;
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 200 ? s.slice(0, 199) + '…' : s;
}

/**
 * Resumo seguro de um erro para log e para `erros_servidor`.
 * NUNCA inclui body, keyValue, cabeçalhos nem query.
 * @returns {{ nome:string, codigo:string|number|null, indice:string|null, mensagem:string }}
 */
export function resumirErro(err) {
  if (err && typeof err === 'object' && err.registrado === true && err.resumo) return { ...err.resumo };
  if (err === null || err === undefined) return { nome: 'Error', codigo: null, indice: null, mensagem: 'erro desconhecido' };
  if (typeof err !== 'object') return { nome: 'Error', codigo: null, indice: null, mensagem: limparMensagem(err) };

  const nome = String(err.name || err.constructor?.name || 'Error').slice(0, 60);
  let codigo = err.codigo ?? err.code ?? null;
  if (typeof codigo !== 'string' && typeof codigo !== 'number') codigo = null;
  if (typeof codigo === 'string') codigo = codigo.slice(0, 60);

  const bruta = String(err.message ?? '');
  let indice = null;
  if (ehDuplicado(err) || /E11000/.test(bruta)) {
    indice = (/index: ([A-Za-z0-9_.$-]+)/.exec(bruta) || [])[1] || null;
    if (!indice && err.keyPattern && typeof err.keyPattern === 'object') {
      // Só NOMES de campo (nunca valores): o keyValue não é lido.
      indice = Object.keys(err.keyPattern).join('_').slice(0, 80) || null;
    }
  }

  // JSON quebrado: a mensagem do V8 traz um trecho do corpo ("…", "{"senha":…" is not valid JSON).
  const ehJsonQuebrado = err.type === 'entity.parse.failed' || (err instanceof SyntaxError && /JSON/i.test(bruta));
  const mensagem = ehJsonQuebrado ? 'corpo JSON inválido' : limparMensagem(bruta);
  return { nome, codigo, indice, mensagem };
}

function rotaDe(req) {
  const p = req?.route?.path;
  return typeof p === 'string' ? p : 'desconhecida';
}

function linhaDeLog({ nivel = 'erro', agora, req, status, codigo, resumo }) {
  return JSON.stringify({
    nivel,
    em: agora().toISOString(),
    requestId: req?.requestId ?? null,
    metodo: req?.method ?? null,
    rota: rotaDe(req),
    status,
    codigo: codigo ?? null,
    erroResumido: resumo
  });
}

function marcarRegistrado(err, resumo, status) {
  const e = new Error(resumo.mensagem);
  e.name = resumo.nome;
  e.codigo = resumo.codigo;
  e.status = status;
  e.resumo = resumo;
  e.registrado = true;
  return e;
}

// ---------- middlewares simples ----------
/** Cache-Control: no-store (toda resposta de /api/portal/* e das rotas novas de /api/auth/*). */
export function semCache(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

/** req.requestId = 'r-' + 12 hex aleatórios; cabeçalho X-Request-Id. Idempotente. */
export function idDaRequisicao(req, res, next) {
  if (typeof req.requestId !== 'string' || !/^r-[a-f0-9]{12}$/.test(req.requestId)) {
    req.requestId = 'r-' + randomBytes(6).toString('hex');
  }
  res.set('X-Request-Id', req.requestId);
  next();
}

// ---------- registro em erros_servidor ----------
/**
 * @param {{ repo: Function|{collection:Function}, agora?: () => Date, log?: Console }} deps
 *   repo(nome) → coleção (getDb().collection resolvido na hora do uso)
 */
export function criarRegistroDeErros({ repo, agora = () => new Date(), log = console } = {}) {
  if (!repo) throw new Error('criarRegistroDeErros: informe repo.');
  const colecao = () => (typeof repo === 'function' ? repo('erros_servidor') : repo.collection('erros_servidor'));
  return {
    /** Nunca lança; nunca aguarda o banco no caminho da resposta. */
    registrar({ req = null, status = 500, codigo = null, erro: e = null } = {}) {
      try {
        if (ehErroDeRedeMongo(e)) return; // banco fora: nem tenta gravar
        const em = agora();
        const resumo = resumirErro(e);
        const cod = codigo ?? resumo.codigo;
        const doc = {
          em,
          requestId: req?.requestId ?? null,
          metodo: req?.method ?? null,
          rota: rotaDe(req),
          status,
          codigo: cod === null || cod === undefined ? null : String(cod),
          erroResumido: `${resumo.nome}: ${resumo.mensagem}`.slice(0, 200),
          expiraEm: new Date(em.getTime() + TTL_ERROS_DIAS * 24 * 60 * 60 * 1000)
        };
        const p = colecao().insertOne(doc);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (falha) {
        try { log.warn?.(`[portal] erros_servidor: registro ignorado (${resumirErro(falha).nome})`); } catch { /* nada */ }
      }
    }
  };
}

// ---------- handler do agregador (/api/auth, /api/portal) ----------
/**
 * Fábrica do tratador de erros do portal. O agregador (F0m) pode passar o
 * `registro` (criarRegistroDeErros) e um `log` espião; sem `registro`, usa
 * `req.registroDeErros` quando existir.
 */
export function criarTratadorErroPortal({ registro = null, log = console, agora = () => new Date() } = {}) {
  return function tratarErroPortal(err, req, res, next) {
    const reg = registro || req?.registroDeErros || null;
    const comId = corpo => (req?.requestId ? { ...corpo, requestId: req.requestId } : corpo);

    const logar = (status, codigo, causa, nivel = 'erro') => {
      const resumo = resumirErro(causa);
      try { (nivel === 'aviso' ? (log.warn || log.error) : log.error).call(log, linhaDeLog({ nivel, agora, req, status, codigo, resumo })); } catch { /* nada */ }
      if (nivel === 'erro' && reg) reg.registrar({ req, status, codigo, erro: causa });
      return resumo;
    };

    if (res.headersSent) {
      const resumo = logar(res.statusCode || 500, null, err);
      return next(marcarRegistrado(err, resumo, res.statusCode || 500));
    }

    if (err instanceof ErroPortal) {
      if (err.retryAfterSeg) res.set('Retry-After', String(err.retryAfterSeg));
      if (err.status >= 500) logar(err.status, err.codigo, err.causa || err);
      else if (err.status === 429 && err.persistente) logar(429, err.codigo, err, 'aviso');
      return res.status(err.status).json(comId({ error: err.message, ...(err.codigo ? { codigo: err.codigo } : {}), ...err.extras }));
    }

    // ServicoIndisponivel (servicos.js, F0m) — reconhecido pelo código, sem importar o módulo.
    if (err && typeof err === 'object' && err.codigo === 'servico-indisponivel') {
      logar(503, 'servico-indisponivel', err);
      return res.status(503).json(comId({ error: MENSAGENS['servico-indisponivel'], codigo: 'servico-indisponivel' }));
    }

    if (err && err.type === 'entity.too.large') {
      const mb = Number.isFinite(err.limit) ? Math.max(1, Math.round(err.limit / (1024 * 1024))) : null;
      const error = mb ? `Arquivo maior que o limite de ${mb} MB.` : MENSAGENS['arquivo-grande'];
      return res.status(413).json(comId({ error, codigo: 'arquivo-grande' }));
    }

    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json(comId({ error: MENSAGENS['formato-invalido'], codigo: 'formato-invalido' }));
    }

    if (ehDuplicado(err)) {
      // E11000 que a rota não previu: nunca devolve keyValue.
      return res.status(409).json(comId({ error: MENSAGENS['registro-duplicado'], codigo: 'registro-duplicado' }));
    }

    const status = ehErroDeRedeMongo(err) ? 503 : 500;
    const resumo = logar(status, null, err);
    return next(marcarRegistrado(err, resumo, status));
  };
}

/** Instância padrão (log = console; registro via req.registroDeErros, quando houver). */
export const tratarErroPortal = criarTratadorErroPortal();

// ---------- handler global do app (server.js, terceiro ponto) ----------
export function criarTratarErroGlobal({ log = console, agora = () => new Date() } = {}) {
  // Quatro parâmetros: é assim que o Express reconhece um handler de erro.
  return function tratarErroGlobal(err, req, res, _next) {
    if (res.headersSent) return;
    const comId = corpo => (req?.requestId ? { ...corpo, requestId: req.requestId } : corpo);
    const logar = (status) => {
      if (err && err.registrado === true) return; // já logado por tratarErroPortal
      try { log.error(linhaDeLog({ agora, req, status, codigo: null, resumo: resumirErro(err) })); } catch { /* nada */ }
    };

    // Corpo maior que o teto do express.json/raw (o body-parser preenche err.limit).
    if (err && err.type === 'entity.too.large') {
      const error = Number.isFinite(err.limit)
        ? `Arquivo maior que o limite de ${Math.round(err.limit / (1024 * 1024))} MB.`
        : MENSAGENS['arquivo-grande'];
      return res.status(413).json(comId({ error }));
    }
    // JSON quebrado: 400 sem logar o corpo (a mensagem do parser traz um trecho dele).
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json(comId({ error: MENSAGENS['formato-invalido'], codigo: 'formato-invalido' }));
    }
    // Erro de domínio que escapou de uma rota legada da fatia (nenhuma rota de hoje lança ErroPortal).
    if (err instanceof ErroPortal) {
      if (err.retryAfterSeg) res.set('Retry-After', String(err.retryAfterSeg));
      if (err.status >= 500) logar(err.status);
      return res.status(err.status).json(comId({ error: err.message, ...(err.codigo ? { codigo: err.codigo } : {}), ...err.extras }));
    }
    // Banco fora do ar (ou serviço de outra fatia ausente) é indisponibilidade, não bug.
    if (ehErroDeRedeMongo(err) || (err && typeof err === 'object' && err.codigo === 'servico-indisponivel')) {
      logar(503);
      return res.status(503).json(comId({ error: MENSAGENS['servico-indisponivel'], codigo: 'servico-indisponivel' }));
    }
    logar(500);
    return res.status(500).json(comId({ error: MENSAGEM_ERRO_INTERNO }));
  };
}

/** Instância padrão: `app.use(tratarErroGlobal)` no lugar do bloco anônimo de server.js. */
export const tratarErroGlobal = criarTratarErroGlobal();
